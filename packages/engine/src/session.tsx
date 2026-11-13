/**
 * Headless session + navigation hooks (COMPONENT-ARCHITECTURE §2: the only UI path to Odoo).
 * Same-domain mode (D-03): the browser talks to Odoo through the app's own origin, so the
 * session cookie is Odoo's own. Gateway mode later swaps the transport, not these hooks.
 */
import { SessionExpiredError, type SessionInfo } from "@novi/odoo-client";
import {
  MutationCache,
  QueryCache,
  QueryClient,
  QueryClientProvider,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from "react";

import { type AuthClient, directAuth, LoginError, type LoginResult } from "./auth.js";
import { activeCompanyIds, allowedCompanies, readCidsCookie, writeCidsCookie } from "./companies.js";
import { buildMenuTree, type MenuTree, type RawMenu } from "./menus.js";
import { modelLabels, type RecordGroup, SEARCHABLE_MODELS, searchRecords } from "./recordSearch.js";

/** What the hooks need from a transport (JsonRpcTransport satisfies it). */
export interface SessionTransport {
  authenticate(login: string, password: string, db?: string): Promise<SessionInfo>;
  getSessionInfo(opts?: { retry?: boolean }): Promise<SessionInfo>;
  destroy(): Promise<void>;
  loadMenus(lang?: string): Promise<Record<string, unknown>>;
  loadAction<T = Record<string, unknown>>(actionId: number | string): Promise<T>;
  setContext(patch: Record<string, unknown>): void;
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
