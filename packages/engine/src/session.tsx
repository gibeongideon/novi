/**
 * Headless session + navigation hooks (COMPONENT-ARCHITECTURE §2: the only UI path to Odoo).
 * Same-domain mode (D-03): the browser talks to Odoo through the app's own origin, so the
 * session cookie is Odoo's own. Gateway mode later swaps the transport, not these hooks.
 */
import { SessionExpiredError, type SessionInfo } from "@novi/odoo-client";
import { Domain, type EvalContext, evaluate, type PyValue } from "@novi/odoo-expr";
import { buildSpec, type ListSchema, type ModelsInfo, parseView } from "@novi/odoo-meta";
import {
  MutationCache,
  QueryCache,
  QueryClient,
  QueryClientProvider,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";

import { type AuthClient, directAuth, LoginError, type LoginResult } from "./auth.js";
import { activeCompanyIds, allowedCompanies, readCidsCookie, writeCidsCookie } from "./companies.js";
import { createFormatter, type CurrencyInfo, type Formatter, type LangParameters } from "./format.js";
import { buildMenuTree, type MenuTree, type RawMenu } from "./menus.js";
import { type ListConfig, RecordList } from "./model/lists.js";
import type { Observable, Rpc } from "./model/observable.js";
import { OdooRecord, type RecordConfig } from "./model/record.js";
import { modelLabels, type RecordGroup, SEARCHABLE_MODELS, searchRecords } from "./recordSearch.js";

/** What the hooks need from a transport (JsonRpcTransport satisfies it). */
export interface SessionTransport {
  authenticate(login: string, password: string, db?: string): Promise<SessionInfo>;
  getSessionInfo(opts?: { retry?: boolean }): Promise<SessionInfo>;
  destroy(): Promise<void>;
  loadMenus(lang?: string): Promise<Record<string, unknown>>;
  loadAction<T = Record<string, unknown>>(actionId: number | string): Promise<T>;
  setContext(patch: Record<string, unknown>): void;
  /** `/web/webclient/translations` (lang_parameters for formatting); optional for test fakes. */
  translations?<T = unknown>(lang?: string): Promise<T>;
  call<T = unknown>(
    model: string,
    method: string,
    call?: { ids?: number[]; kwargs?: Record<string, unknown> },
  ): Promise<T>;
}

interface EngineContextValue {
  transport: SessionTransport;
  db: string;
  /** How users sign in; defaults to straight-to-Odoo (no 2FA). Apps pass gatewayAuth(). */
  auth?: AuthClient;
}

const EngineContext = createContext<EngineContextValue | null>(null);

export function EngineProvider({
  transport,
  db,
  auth,
  children,
  queryClient,
}: EngineContextValue & { children: ReactNode; queryClient?: QueryClient }) {
  const [client] = useState(() => {
    if (queryClient) return queryClient;
    // An expired Odoo session anywhere sends the user back to the login screen (P1.12.5)
    const onError = (err: unknown) => {
      if (err instanceof SessionExpiredError) c.setQueryData(["session"], null);
    };
    const c = new QueryClient({
      queryCache: new QueryCache({ onError }),
      mutationCache: new MutationCache({ onError }),
      defaultOptions: { queries: { staleTime: 60_000, retry: false } },
    });
    return c;
  });
  return (
    <EngineContext.Provider value={{ transport, db, auth: auth ?? directAuth(transport, db) }}>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </EngineContext.Provider>
  );
}

function useEngine(): EngineContextValue {
  const ctx = useContext(EngineContext);
  if (!ctx) throw new Error("Engine hooks must be used inside <EngineProvider>");
  return ctx;
}

export type SessionStatus = "loading" | "anonymous" | "authenticated";

export function useSession() {
  const { transport, auth } = useEngine();
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["session"],
    queryFn: async (): Promise<SessionInfo | null> => {
      try {
        const info = await transport.getSessionInfo({ retry: false });
        return info.uid ? info : null;
      } catch (err) {
        if (err instanceof SessionExpiredError) return null;
        throw err;
      }
    },
  });

  /** After a successful sign-in the browser holds Odoo's session cookie: load it. */
  const signedIn = async () => {
    const info = await transport.getSessionInfo({ retry: false });
    // drop the previous user's cached data, keep (and update) the session entry screens observe
    qc.removeQueries({ predicate: (q) => q.queryKey[0] !== "session" });
    qc.setQueryData(["session"], info);
  };

  const login = useMutation({
    mutationFn: async ({ login, password }: { login: string; password: string }): Promise<LoginResult> => {
      const res = await auth!.login(login, password);
      if (res.status === "ok") await signedIn();
      return res;
    },
  });
  const verifyCode = useMutation({
    mutationFn: async ({
      challenge,
      code,
      remember,
    }: {
      challenge: string;
      code: string;
      remember: boolean;
    }) => {
      await auth!.verifyCode(challenge, code, remember);
      await signedIn();
    },
  });
  const logout = useMutation({
    mutationFn: () => transport.destroy(),
    onSettled: () => {
      qc.removeQueries({ predicate: (q) => q.queryKey[0] !== "session" });
      qc.setQueryData(["session"], null);
    },
  });

  const status: SessionStatus = query.isPending ? "loading" : query.data ? "authenticated" : "anonymous";
  const failure = (err: unknown) =>
    err instanceof LoginError
      ? { reason: err.reason, message: err.message }
      : err
        ? { reason: "other" as const, message: String((err as Error).message ?? err) }
        : null;
  return {
    status,
    info: query.data ?? null,
    login: login.mutateAsync,
    verifyCode: verifyCode.mutateAsync,
    pending: login.isPending || verifyCode.isPending,
    loginError: failure(login.error ?? verifyCode.error),
    resetLogin: () => {
      login.reset();
      verifyCode.reset();
    },
    logout: logout.mutate,
    /** Password reset by email, when the sign-in path supports it (gateway). */
    passwordReset: auth?.reset,
  };
}

/** SSO buttons for the sign-in and reset pages (empty without the gateway or providers). */
export function useSsoProviders(token?: string | null) {
  const { auth } = useEngine();
  return useQuery({
    queryKey: ["sso-providers", token ?? ""],
    queryFn: () => auth?.providers?.(token ?? undefined) ?? Promise.resolve([]),
    staleTime: 5 * 60_000,
  });
}

/** Menu tree of the logged-in user (cached per user + language). */
export function useMenus() {
  const { transport } = useEngine();
  const { info } = useSession();
  const lang = info?.user_context?.lang as string | undefined;
  return useQuery({
    queryKey: ["menus", info?.uid, lang],
    enabled: !!info?.uid,
    queryFn: async (): Promise<MenuTree> =>
      buildMenuTree((await transport.loadMenus(lang)) as unknown as Record<string, RawMenu>),
    staleTime: Infinity,
  });
}

export interface ActionInfo {
  id: number;
  name: string;
  type: string;
  res_model?: string | false;
  tag?: string | false;
  path?: string | false;
  views?: [number | false, string][];
  [k: string]: unknown;
}

/** An Odoo action (ir.actions.*) by id. */
export function useAction(actionId: number | undefined) {
  const { transport } = useEngine();
  return useQuery({
    queryKey: ["action", actionId],
    enabled: actionId !== undefined,
    queryFn: () => transport.loadAction<ActionInfo>(actionId!),
    staleTime: Infinity,
  });
}

/** The user's companies and the active ones (P1.12.2). Applies them to every Odoo call. */
export function useCompanies() {
  const { transport } = useEngine();
  const { info } = useSession();
  const qc = useQueryClient();
  const [active, setActiveState] = useState<number[]>(() => activeCompanyIds(info, readCidsCookie()));

  // recompute when the session changes (login as another user)
  useEffect(() => setActiveState(activeCompanyIds(info, readCidsCookie())), [info]);
  useEffect(() => {
    if (active.length) transport.setContext({ allowed_company_ids: active });
  }, [active, transport]);

  const setActive = useCallback(
    (ids: number[]) => {
      if (!ids.length) return;
      writeCidsCookie(ids);
      transport.setContext({ allowed_company_ids: ids });
      setActiveState(ids);
      // everything except the session depends on the company context
      void qc.invalidateQueries({ predicate: (q) => q.queryKey[0] !== "session" });
    },
    [qc, transport],
  );

  return { companies: allowedCompanies(info), active, setActive };
}

/** Records matching `query` across the searchable models (P1.13.2). Debounce the query in the UI. */
export function useRecordSearch(query: string) {
  const { transport } = useEngine();
  const { info } = useSession();
  const labels = useQuery({
    queryKey: ["model-labels", info?.uid, info?.user_context?.lang],
    enabled: !!info?.uid,
    queryFn: () => modelLabels(transport, SEARCHABLE_MODELS),
    staleTime: Infinity,
  });
  const q = query.trim();
  return useQuery({
    queryKey: ["record-search", q],
    enabled: q.length >= 2 && !!labels.data,
    queryFn: (): Promise<RecordGroup[]> => searchRecords(transport, q, labels.data!),
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });
}

/** Display name of one record (record page title until the form view lands in P2). */
export function useRecordName(model: string | undefined, id: number | undefined) {
  const { transport } = useEngine();
  return useQuery({
    queryKey: ["record-name", model, id],
    enabled: !!model && !!id,
    queryFn: async () => {
      const [rec] = await transport.call<{ display_name: string }[]>(model!, "web_read", {
        ids: [id!],
        kwargs: { specification: { display_name: {} } },
      });
      return rec?.display_name ?? null;
    },
  });
}

/** Odoo's own defaults, used until the user's language settings have loaded. */
const DEFAULT_LANG: LangParameters = {
  code: "en_US",
  direction: "ltr",
  date_format: "%m/%d/%Y",
  time_format: "%H:%M:%S",
  decimal_point: ".",
  thousands_sep: ",",
  grouping: "[3,0]",
};

/**
 * The formatter for the signed-in user (P2.13.15): their language's separators and date format,
 * their timezone and the companies' currencies, all from Odoo. Every widget formats through it.
 */
export function useFormat(): Formatter {
  const { transport } = useEngine();
  const session = useQuery({
    queryKey: ["session"],
    queryFn: () => transport.getSessionInfo(),
    staleTime: Infinity,
  });
  const info = session.data;
  const lang = (info?.user_context?.lang as string | undefined) ?? "en_US";
  const translations = useQuery({
    queryKey: ["lang-parameters", lang],
    enabled: !!info && !!transport.translations,
    queryFn: () => transport.translations!<{ lang_parameters?: LangParameters }>(lang),
    staleTime: Infinity,
  });
  const params = translations.data?.lang_parameters;
  const tz = info?.user_context?.tz as string | undefined;
  const currencies = (info?.currencies ?? {}) as Record<string, CurrencyInfo>;
  return useMemo(
    () => createFormatter({ lang: params ?? DEFAULT_LANG, currencies, tz }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- currencies is stable per session
    [params, tz, info],
  );
}

/** What the generic list renderer needs: the parsed view, the rows and the total count. */
export interface ListViewData {
  schema: ListSchema;
  records: Record<string, unknown>[];
  length: number;
  /** User + action context and uid: what column-level expressions are evaluated with. */
  evalContext: Record<string, unknown>;
}

/**
 * An action's list view with its first page of records (P2.9 first slice): `get_views` →
 * odoo-meta schema → specification → `web_search_read` with the action's domain and context.
 * `null` when the action has no list view (kanban-only, client actions).
 */
export function useListView(actionId: number | undefined, limit = 80) {
  const { transport } = useEngine();
  const action = useAction(actionId);
  const session = useQuery({
    queryKey: ["session"],
    queryFn: () => transport.getSessionInfo(),
    staleTime: Infinity,
  });
  const a = action.data;
  return useQuery({
    queryKey: ["list-view", actionId, limit],
    enabled: !!a && !!session.data,
    queryFn: async (): Promise<ListViewData | null> => {
      const listView = a!.views?.find(([, type]) => type === "list");
      if (!a!.res_model || !listView) return null;
      const model = a!.res_model;
      const base = baseEvalContext(session.data ?? null);
      const actionContext = toDict(a!.context, base);
      const context = { ...(base.context as Record<string, unknown>), ...actionContext };
      const views = await transport.call<{ views: { list: { arch: string } }; models: ModelsInfo }>(
        model,
        "get_views",
        {
          kwargs: { views: [[listView[0], "list"]], options: { action_id: a!.id }, context },
        },
      );
      const schema = parseView({ arch: views.views.list.arch, model, models: views.models }) as ListSchema;
      // actions opened from a record carry it in their context (Odoo offers these names too)
      const active = Object.fromEntries(
        ["active_id", "active_ids", "active_model"].filter((k) => k in context).map((k) => [k, context[k]]),
      );
      const evalContext = { ...base, ...active, context: context as Record<string, never> } as EvalContext;
      const domain = Domain.parse(
        ((a!.domain as string | PyValue[] | undefined) || []) as string | PyValue[],
        evalContext,
      ).toList();
      const result = await transport.call<{ records: Record<string, unknown>[]; length: number }>(
        model,
        "web_search_read",
        {
          kwargs: {
            domain,
            specification: buildSpec(schema, { evalContext }),
            limit,
            context: { ...context, bin_size: true },
          },
        },
      );
      return { schema, records: result.records, length: result.length, evalContext };
    },
  });
}

/** An action's `context` (a Python dict as text, or already a dict) evaluated for the user. */
function toDict(value: unknown, ctx: Record<string, unknown>): Record<string, unknown> {
  if (value && typeof value === "object") return value as Record<string, unknown>;
  if (typeof value !== "string" || !value.trim()) return {};
  try {
    const v = evaluate(value, ctx as never);
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

const noSubscribe = () => () => undefined;

/** Re-renders when an engine model changes (P2.5.5): records, x2many lines, lists. */
export function useModel<T extends Observable>(model: T | undefined): T | undefined {
  useSyncExternalStore(model?.subscribe ?? noSubscribe, () => model?.version ?? 0);
  return model;
}

/** The engine's RPC for the headless models (the session transport, with its context). */
function useRpc(): Rpc {
  const { transport } = useEngine();
  return useCallback<Rpc>((model, method, call) => transport.call(model, method, call), [transport]) as Rpc;
}

/**
 * One record, loaded with the view's specification and kept live (edits re-render). `save`
 * also refreshes cached lists, so a list shows the saved values when the user goes back.
 */
export function useRecord(config: RecordConfig | undefined, id: number | undefined) {
  const rpc = useRpc();
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["record", config?.model, id, JSON.stringify(config?.spec ?? {})],
    enabled: !!config && id !== undefined,
    queryFn: () => OdooRecord.load(rpc, config!, id!),
    staleTime: 0,
    gcTime: 0, // a record being edited is never served stale from cache
  });
  const record = useModel(query.data);
  const save = useCallback(async () => {
    const ok = (await record?.save()) ?? false;
    if (ok) await client.invalidateQueries({ queryKey: ["list-view"] });
    return ok;
  }, [record, client]);
  return { record, save, isPending: query.isPending && !!config, error: query.error };
}

/** One page of records, live (paging, sorting and selection re-render). */
export function useRecordList(config: ListConfig | undefined) {
  const rpc = useRpc();
  const key = JSON.stringify(config ?? null);
  // a new list only when what it shows changes; paging/sorting happen inside it
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const list = useMemo(() => (config ? new RecordList(rpc, config) : undefined), [key, rpc]);
  const [error, setError] = useState<unknown>(null);
  useEffect(() => {
    list?.load().catch(setError);
  }, [list]);
  return { list: useModel(list), error };
}

/**
 * The names Odoo's client offers to action domains/contexts and arch expressions besides the
 * record: uid, the user context, the active companies (`allowed_company_ids`,
 * `current_company_id`). One source for every evaluation the engine does.
 */
export function baseEvalContext(info: SessionInfo | null): EvalContext {
  const companies = activeCompanyIds(info, readCidsCookie());
  const userContext = { ...(info?.user_context ?? {}), allowed_company_ids: companies } as unknown as Record<
    string,
    never
  >;
  return {
    uid: info?.uid ?? 0,
    context: userContext,
    allowed_company_ids: companies,
    current_company_id: companies[0] ?? false,
  };
}
