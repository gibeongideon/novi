/**
 * Session (cookie) transport: the same endpoints Odoo's own web client uses.
 *   POST /web/dataset/call_kw/<model>/<method>   {jsonrpc, method:"call", params:{model, method, args, kwargs}}
 * Needed for everything that is cookie-only: chatter, menus, actions, reports, websocket.
 */
import {
  errorFromOdoo,
  isOdooErrorData,
  NetworkError,
  SessionExpiredError,
  TwoFactorRequiredError,
} from "./errors.js";
import { Http, readJson } from "./http.js";
import {
  type CallOptions,
  type OdooContext,
  type OrmCall,
  type OrmTransport,
  READ_METHODS,
  type TransportOptions,
} from "./types.js";

export interface SessionInfo {
  uid: number | null;
  db?: string;
  name?: string;
  username?: string;
  partner_id?: number;
  user_context?: OdooContext;
  server_version?: string;
  server_version_info?: unknown[];
  [k: string]: unknown;
}

interface JsonRpcResponse {
  jsonrpc?: string;
  id?: number | null;
  result?: unknown;
  error?: { code?: number; message?: string; data?: unknown };
}

export class JsonRpcTransport implements OrmTransport {
  readonly http: Http;
  private ctx: OdooContext;
  private seq = 0;
  private readonly inflight = new Map<string, Promise<unknown>>();

  constructor(private readonly opts: TransportOptions) {
    this.http = new Http(opts);
    this.ctx = { ...opts.context };
  }

  get context(): OdooContext {
    return this.ctx;
  }

  setContext(patch: OdooContext): void {
    this.ctx = { ...this.ctx, ...patch };
  }

  /** Current Odoo session id (Node only; browsers keep it in an httpOnly cookie). */
  get sessionId(): string | undefined {
    return this.http.jar?.get("session_id");
  }

  /** Restores a session (e.g. from the gateway's session vault). */
  set sessionId(id: string | undefined) {
    if (!this.http.jar) throw new Error("sessionId can only be set server-side");
    if (id) this.http.jar.set("session_id", id);
    else this.http.jar.clear();
  }

  /** Calls any JSON-RPC route (`/web/action/load`, `/mail/store` …). */
  async route<T = unknown>(
    path: string,
    params: Record<string, unknown> = {},
    opts: CallOptions = {},
  ): Promise<T> {
    const body = { jsonrpc: "2.0", method: "call", params, id: ++this.seq };
    const res = await this.http.send({
      url: path,
      method: "POST",
      body,
      signal: opts.signal,
      retry: opts.retry ?? false,
    });
    const json = (await readJson(res, path)) as JsonRpcResponse | null;
    if (!json || typeof json !== "object") {
      throw new NetworkError(`Empty JSON-RPC response from ${path} (HTTP ${res.status})`, {
        status: res.status,
      });
    }
    if (json.error) {
      const { code, message, data } = json.error;
      const err = isOdooErrorData(data)
        ? errorFromOdoo(data, { code, status: res.status })
        : errorFromOdoo({ name: "", message: message ?? "Odoo error" }, { code, status: res.status });
      if (err instanceof SessionExpiredError) this.opts.onSessionExpired?.(err);
      throw err;
    }
    if (!res.ok) throw new NetworkError(`HTTP ${res.status} from ${path}`, { status: res.status });
    return json.result as T;
  }

  /** GET a JSON http route (`/web/webclient/load_menus`, `/web/version` …). */
  async getJson<T = unknown>(path: string, opts: CallOptions = {}): Promise<T> {
    const res = await this.http.send({
      url: path,
      method: "GET",
      signal: opts.signal,
      retry: opts.retry ?? true,
    });
    if (res.status >= 300 && res.status < 400) {
      // auth='user' http routes redirect to /web/login when the session is gone
      const err = new SessionExpiredError(`Redirected to login from ${path}`, { status: res.status });
      this.opts.onSessionExpired?.(err);
      throw err;
    }
    const json = await readJson(res, path);
    if (!res.ok) {
      if (isOdooErrorData(json)) throw errorFromOdoo(json, { status: res.status });
      throw new NetworkError(`HTTP ${res.status} from ${path}`, { status: res.status });
    }
    return json as T;
  }

  /** ORM call through `/web/dataset/call_kw`. Identical in-flight reads are shared. */
  call<T = unknown>(model: string, method: string, call: OrmCall = {}, opts: CallOptions = {}): Promise<T> {
    const params = {
      model,
      method,
      args: call.ids ? [call.ids] : [],
      kwargs: { ...call.kwargs, context: { ...this.ctx, ...call.context } },
    };
    const isRead = READ_METHODS.has(method);
    const exec = () =>
      this.route<T>(`/web/dataset/call_kw/${model}/${method}`, params, {
        ...opts,
        retry: opts.retry ?? isRead,
      });
    if (!isRead || opts.signal) return exec();
    const key = JSON.stringify(params);
    const existing = this.inflight.get(key);
    if (existing) return existing as Promise<T>;
    const p = exec().finally(() => this.inflight.delete(key));
    this.inflight.set(key, p);
    return p;
  }

  /** Executes a `<button type="object">` the way the web client does (returns an action or false). */
  callButton<T = unknown>(model: string, method: string, ids: number[], context?: OdooContext): Promise<T> {
    return this.route<T>(`/web/dataset/call_button/${model}/${method}`, {
      model,
      method,
      args: [ids],
      kwargs: { context: { ...this.ctx, ...context } },
    });
  }

  // ── session ───────────────────────────────────────────────────────────────

  /** Password login. Throws TwoFactorRequiredError for 2FA users, AccessDenied for bad credentials. */
  async authenticate(login: string, password: string, db = this.opts.db): Promise<SessionInfo> {
    if (!db) throw new Error("authenticate: db is required");
    const info = await this.route<SessionInfo>("/web/session/authenticate", { db, login, password });
    if (!info || info.uid === null || info.uid === undefined) {
      throw new TwoFactorRequiredError("Two-factor authentication required");
    }
    if (info.user_context) this.setContext(info.user_context);
    return info;
  }

  getSessionInfo(opts?: CallOptions): Promise<SessionInfo> {
    return this.route<SessionInfo>("/web/session/get_session_info", {}, { retry: true, ...opts });
  }

  async destroy(): Promise<void> {
    try {
      await this.route("/web/session/destroy");
    } finally {
      this.http.jar?.clear();
    }
  }

  // ── navigation helpers (cookie-only routes) ─────────────────────────────────

  loadMenus(lang?: string, opts?: CallOptions): Promise<Record<string, unknown>> {
    const q = lang ? `?lang=${encodeURIComponent(lang)}` : "";
    return this.getJson(`/web/webclient/load_menus${q}`, opts);
  }

  loadAction<T = Record<string, unknown>>(actionId: number | string, context?: OdooContext): Promise<T> {
    return this.route<T>("/web/action/load", { action_id: actionId, context: { ...this.ctx, ...context } });
  }

  runAction<T = unknown>(actionId: number | string, context?: OdooContext): Promise<T> {
    return this.route<T>("/web/action/run", { action_id: actionId, context: { ...this.ctx, ...context } });
  }

  loadBreadcrumbs<T = unknown[]>(actions: unknown[]): Promise<T> {
    return this.route<T>("/web/action/load_breadcrumbs", { actions });
  }

  translations<T = unknown>(lang?: string, opts?: CallOptions): Promise<T> {
    const q = lang ? `?lang=${encodeURIComponent(lang)}` : "";
    return this.getJson<T>(`/web/webclient/translations${q}`, opts);
  }
}
