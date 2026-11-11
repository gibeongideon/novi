/**
 * Headless session + navigation hooks (COMPONENT-ARCHITECTURE §2: the only UI path to Odoo).
 * Same-domain mode (D-03): the browser talks to Odoo through the app's own origin, so the
 * session cookie is Odoo's own. Gateway mode later swaps the transport, not these hooks.
 */
import { SessionExpiredError, type SessionInfo, TwoFactorRequiredError } from "@novi/odoo-client";
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

import { activeCompanyIds, allowedCompanies, readCidsCookie, writeCidsCookie } from "./companies.js";
import { buildMenuTree, type MenuTree, type RawMenu } from "./menus.js";

/** What the hooks need from a transport (JsonRpcTransport satisfies it). */
export interface SessionTransport {
  authenticate(login: string, password: string, db?: string): Promise<SessionInfo>;
  getSessionInfo(opts?: { retry?: boolean }): Promise<SessionInfo>;
  destroy(): Promise<void>;
  loadMenus(lang?: string): Promise<Record<string, unknown>>;
  loadAction<T = Record<string, unknown>>(actionId: number | string): Promise<T>;
  setContext(patch: Record<string, unknown>): void;
}

interface EngineContextValue {
  transport: SessionTransport;
  db: string;
}

const EngineContext = createContext<EngineContextValue | null>(null);

export function EngineProvider({
  transport,
  db,
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
    <EngineContext.Provider value={{ transport, db }}>
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

export interface LoginError {
  kind: "credentials" | "two-factor" | "other";
  message: string;
}

export function useSession() {
  const { transport, db } = useEngine();
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
  const login = useMutation({
    mutationFn: ({ login, password }: { login: string; password: string }) =>
      transport.authenticate(login, password, db),
    onSuccess: (info) => {
      // drop the previous user's cached data, keep (and update) the session entry screens observe
      qc.removeQueries({ predicate: (q) => q.queryKey[0] !== "session" });
      qc.setQueryData(["session"], info);
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
  return {
    status,
    info: query.data ?? null,
    login: login.mutateAsync,
    loggingIn: login.isPending,
    loginError: login.error ? describeLoginError(login.error) : null,
    logout: logout.mutate,
  };
}

/** Maps transport errors to what a login screen shows (messages come from Odoo when it has one). */
export function describeLoginError(err: unknown): LoginError {
  if (err instanceof TwoFactorRequiredError) {
    return { kind: "two-factor", message: "This account uses two-factor authentication." };
  }
  const name = (err as { odooName?: string })?.odooName ?? "";
  if (name.endsWith("AccessDenied")) return { kind: "credentials", message: (err as Error).message };
  return { kind: "other", message: (err as Error)?.message ?? String(err) };
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
