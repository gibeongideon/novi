/** Shared types for the Odoo transports. */

export type OdooContext = Record<string, unknown>;

/** Unified ORM call: works on both transports. JSON-2 only accepts named arguments. */
export interface OrmCall {
  /** Record ids for record methods (`write`, `action_confirm`, `web_read` …). Omit for model methods. */
  ids?: number[];
  /** Named arguments of the method (`domain`, `specification`, `vals` …). */
  kwargs?: Record<string, unknown>;
  /** Extra context, merged over the transport's default context. */
  context?: OdooContext;
}

export interface CallOptions {
  signal?: AbortSignal;
  /** Override retry policy for this call (defaults: reads retried, writes never). */
  retry?: boolean;
}

export interface RequestInfo {
  url: string;
  method: string;
  body?: unknown;
}

export interface ResponseInfo extends RequestInfo {
  status: number;
  durationMs: number;
  ok: boolean;
}

export interface TransportHooks {
  onRequest?: (req: RequestInfo) => void;
  onResponse?: (res: ResponseInfo) => void;
  /** Called once per failing call when Odoo reports the session as expired. */
  onSessionExpired?: (error: Error) => void;
}

export interface RetryPolicy {
  /** Max additional attempts for safe calls (default 2). */
  retries: number;
  /** Initial backoff in ms, doubled each attempt (default 300). */
  baseDelayMs: number;
}

export interface TransportOptions extends TransportHooks {
  /** Odoo base URL, e.g. "http://localhost:8069" (no trailing slash needed). */
  baseUrl: string;
  /** Database name. Sent as X-Odoo-Database on JSON-2; used for authenticate on JSON-RPC. */
  db?: string;
  /** Default context merged into every call (lang, tz, allowed_company_ids …). */
  context?: OdooContext;
  /** Custom fetch (tests, Node polyfills). Defaults to globalThis.fetch. */
  fetch?: typeof fetch;
  /**
   * Headers sent with every request. The gateway uses it to pass the end user's IP
   * (`X-Forwarded-For`, so Odoo's per-IP login cooldown never locks everyone out) and User-Agent.
   */
  headers?: Record<string, string>;
  retry?: Partial<RetryPolicy>;
  /** Request timeout in ms (default 60 000). */
  timeoutMs?: number;
}

/** Anything that can run ORM methods. Implemented by both transports. */
export interface OrmTransport {
  call<T = unknown>(model: string, method: string, call?: OrmCall, opts?: CallOptions): Promise<T>;
  readonly context: OdooContext;
  setContext(patch: OdooContext): void;
}

/** Methods that never write: safe to retry and to de-duplicate while in flight. */
export const READ_METHODS = new Set([
  "read",
  "search",
  "search_read",
  "search_count",
  "name_search",
  "fields_get",
  "get_views",
  "web_read",
  "web_search_read",
  "web_read_group",
  "web_name_search",
  "read_group",
  "formatted_read_group",
  "formatted_read_grouping_sets",
  "default_get",
  "check_access_rights",
  "has_access",
  "onchange",
  "load_web_menus",
]);

export interface VersionInfo {
  version: string;
  version_info: [number, number, number, string, number, string?];
  [k: string]: unknown;
}

export interface Capabilities {
  major: number;
  /** POST /json/2/<model>/<method> with bearer API keys (Odoo ≥ 19). */
  json2: boolean;
  /** Legacy /jsonrpc and /xmlrpc (deprecated in 19, removed in 22). Never used by NOVI. */
  legacyRpc: boolean;
}
