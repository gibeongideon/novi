/**
 * Session (cookie) transport: the same endpoints Odoo's own web client uses.
 *   POST /web/dataset/call_kw/<model>/<method>   {jsonrpc, method:"call", params:{model, method, args, kwargs}}
 * Needed for everything that is cookie-only: chatter, menus, actions, reports, websocket.
 */
import {
  AccessDenied,
  errorFromOdoo,
  isOdooErrorData,
  NetworkError,
  NotFoundError,
  PasswordTooShortError,
  SessionExpiredError,
  TwoFactorRequiredError,
  UserError,
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

/** Odoo auth_totp trusted-device cookie name. */
const TRUSTED_DEVICE_COOKIE = "td_id";
/**
 * Odoo names a remembered device from the browser User-Agent and crashes (HTTP 500) when it can't
 * parse one. The gateway should pass the end user's real UA; this is the fallback.
 */
const DEFAULT_RELAY_UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 NOVI-Gateway";

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
    this.csrf = undefined;
    return info;
  }

  /**
   * Second login step for 2FA users (server-side only, P0.10 relay).
   * After `authenticate()` threw TwoFactorRequiredError, Odoo keeps `pre_uid` in this session.
   * We fetch the CSRF token from the stock `/web/login/totp` page and post the 6-digit code to it,
   * exactly like a browser would; Odoo then finalises the session. No Odoo changes needed.
   */
  async completeTwoFactor(
    code: string,
    opts: { remember?: boolean; userAgent?: string } = {},
  ): Promise<SessionInfo> {
    const ua = opts.userAgent ?? DEFAULT_RELAY_UA;
    const page = await this.totpPage(ua);
    // A valid trusted-device cookie makes Odoo finalise the session without a code
    if (page.redirected) return this.finalizeTwoFactor();
    const csrf = page.csrf;
    if (!csrf) {
      throw new AccessDenied("No pending 2FA login in this session (call authenticate() first)", {
        status: page.status,
      });
    }
    const form: Record<string, string> = { totp_token: code.replace(/\s/g, ""), csrf_token: csrf };
    if (opts.remember) form.remember = "1";
    await this.http.send({
      url: "/web/login/totp",
      method: "POST",
      headers: { Accept: "text/html", "User-Agent": ua },
      form,
      retry: false,
    });
    return this.finalizeTwoFactor();
  }

  /**
   * Trusted-device login (P0.10.3): after `authenticate()` threw TwoFactorRequiredError, a valid
   * `td_id` cookie (from an earlier `completeTwoFactor(code, { remember: true })`) lets Odoo skip
   * the code. Returns the session, or null when the device is not (or no longer) trusted.
   */
  async resumeTrustedDevice(userAgent = DEFAULT_RELAY_UA): Promise<SessionInfo | null> {
    if (!this.trustedDevice) return null;
    const page = await this.totpPage(userAgent);
    return page.redirected ? this.finalizeTwoFactor() : null;
  }

  /** Odoo's trusted-device cookie (`td_id`), to store per user in the gateway vault. */
  get trustedDevice(): string | undefined {
    return this.http.jar?.get(TRUSTED_DEVICE_COOKIE);
  }

  set trustedDevice(key: string | undefined) {
    if (!this.http.jar) throw new Error("trustedDevice can only be set server-side");
    if (key) this.http.jar.set(TRUSTED_DEVICE_COOKIE, key);
  }

  private totpPage(userAgent: string) {
    return this.formPage("/web/login/totp", { "User-Agent": userAgent });
  }

  /**
   * One of Odoo's server-rendered form pages (2FA, password reset), fetched in this session so its
   * CSRF token is valid for the POST that follows. Server-side only: it needs the cookie jar.
   */
  private async formPage(url: string, headers: Record<string, string> = {}) {
    if (!this.http.jar) throw new Error("Odoo form relay is server-side only (gateway)");
    const res = await this.http.send({
      url,
      method: "GET",
      headers: { Accept: "text/html", ...headers },
      retry: false,
    });
    const redirected = res.status >= 300 && res.status < 400;
    const html = redirected ? "" : await res.text();
    const csrf = html.match(/name="csrf_token"[^>]*value="([^"]+)"/)?.[1];
    return { status: res.status, redirected, html, csrf };
  }

  /** Odoo's message in a rendered form page (`alert-danger` = error, `alert-success` = done). */
  private static formOutcome(html: string): { error?: string; message?: string } {
    const text = (cls: string) =>
      html
        .match(new RegExp(`class="alert ${cls}"[^>]*>([\\s\\S]*?)</p>`))?.[1]
        ?.replace(/<[^>]+>/g, "")
        .replace(/&#39;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, "&")
        .trim();
    return { error: text("alert-danger"), message: text("alert-success") };
  }

  /**
   * Ask Odoo to email a password-reset link (stock `auth_signup`, P1.6.5). Throws UserError with
   * Odoo's message when Odoo refuses (unknown login, mail failure, reset disabled).
   */
  async requestPasswordReset(login: string): Promise<void> {
    const page = await this.formPage("/web/reset_password");
    if (!page.csrf) throw new NotFoundError("Password reset is disabled", { status: page.status });
    await this.submitForm("/web/reset_password", { login, csrf_token: page.csrf });
  }

  /** Set a new password with the token from Odoo's reset email (the user then signs in normally). */
  async resetPassword(token: string, password: string): Promise<void> {
    const url = `/web/reset_password?token=${encodeURIComponent(token)}`;
    const page = await this.formPage(url);
    const before = JsonRpcTransport.formOutcome(page.html);
    if (!page.csrf || before.error)
      throw new UserError(before.error ?? "Invalid reset link", { status: page.status });
    // Odoo invalidates the token even when it rejects the password, so check its rule first
    const min = Number(page.html.match(/name="password"[^>]*minlength="(\d+)"/)?.[1] ?? 0);
    if (password.length < min) throw new PasswordTooShortError(min);
    await this.submitForm(url, { token, password, confirm_password: password, csrf_token: page.csrf });
  }

  /**
   * The tenant's enabled OAuth providers (stock `auth_oauth`, P1.14) as Odoo itself would link them
   * on its login page: each URL goes to the identity provider and comes back to this Odoo's
   * `/auth_oauth/signin`, then to `redirect`. With a reset/invitation `token`, the first sign-in
   * links that identity to the invited user.
   */
  async oauthProviders(opts: { redirect: string; token?: string }): Promise<{ name: string; url: string }[]> {
    const q = new URLSearchParams({ redirect: opts.redirect, ...(opts.token ? { token: opts.token } : {}) });
    const { html } = await this.formPage(`/web/login?${q}`);
    const unescape = (s: string) =>
      s
        .replace(/&amp;/g, "&")
        .replace(/&#34;|&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">");
    const links = html.matchAll(/<a\b[^>]*href="([^"]*response_type=token[^"]*)"[^>]*>([\s\S]*?)<\/a>/g);
    return [...links].map((m) => ({
      url: unescape(m[1]!),
      name: unescape(m[2]!.replace(/<[^>]+>/g, "").trim()),
    }));
  }

  private async submitForm(url: string, form: Record<string, string>): Promise<void> {
    const res = await this.http.send({
      url,
      method: "POST",
      headers: { Accept: "text/html" },
      form,
      retry: false,
    });
    const { error, message } = JsonRpcTransport.formOutcome(await res.text());
    if (error || !message)
      throw new UserError(error ?? `Unexpected response (HTTP ${res.status})`, { status: res.status });
  }

  /**
   * A failed step leaves the session in its pre-login state: get_session_info then fails
   * ("user is not connected") or returns no uid. Both mean the verification failed.
   */
  private async finalizeTwoFactor(): Promise<SessionInfo> {
    let info: SessionInfo;
    try {
      info = await this.getSessionInfo({ retry: false });
    } catch (cause) {
      throw new AccessDenied("Two-factor verification failed", { cause });
    }
    if (!info.uid) throw new AccessDenied("Two-factor verification failed");
    if (info.user_context) this.setContext(info.user_context);
    this.csrf = undefined;
    return info;
  }

  // ── CSRF-protected http routes (upload, export, get_definitions, logout) ─────

  private csrf: { token: string; expires: number } | undefined;

  /**
   * CSRF token for `type="http"` POST routes. Odoo 20 only exposes it in the web client page
   * (`/odoo` → `csrf_token: "<hmac>o<expiry>"`), so we read it from there once and cache it
   * until shortly before the expiry encoded in the token.
   */
  async getCsrfToken(opts: CallOptions = {}): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    if (this.csrf && this.csrf.expires - 300 > now) return this.csrf.token;
    const res = await this.http.send({
      url: "/odoo",
      method: "GET",
      headers: { Accept: "text/html" },
      signal: opts.signal,
      retry: true,
    });
    if (res.status >= 300 && res.status < 400) {
      throw new SessionExpiredError("Not logged in (redirected while fetching the CSRF token)", {
        status: res.status,
      });
    }
    const html = await res.text();
    const token = html.match(/csrf_token["']?\s*:\s*["']([0-9a-f]+o?(\d+)?)["']/)?.[1];
    if (!token) throw new NetworkError("CSRF token not found in /odoo page", { status: res.status });
    const expiry = Number(token.split("o")[1] ?? 0);
    this.csrf = { token, expires: expiry || now + 3600 };
    return token;
  }

  /** POST to a CSRF-protected `type="http"` route with form fields; returns the raw Response. */
  async postForm(path: string, form: Record<string, string>, opts: CallOptions = {}): Promise<Response> {
    const csrf_token = await this.getCsrfToken(opts);
    const res = await this.http.send({
      url: path,
      method: "POST",
      form: { ...form, csrf_token },
      signal: opts.signal,
      retry: false,
    });
    if (res.status >= 300 && res.status < 400) {
      throw new SessionExpiredError(`Redirected to login from ${path}`, { status: res.status });
    }
    if (!res.ok) {
      const text = await res.text();
      throw new NetworkError(`HTTP ${res.status} from ${path}: ${text.slice(0, 160)}`, {
        status: res.status,
      });
    }
    return res;
  }

  /** Model definitions used by the web client (`/web/model/get_definitions`, CSRF-protected http route). */
  async getModelDefinitions<T = Record<string, unknown>>(
    modelNames: string[],
    opts?: CallOptions,
  ): Promise<T> {
    const res = await this.postForm(
      "/web/model/get_definitions",
      { model_names: JSON.stringify(modelNames) },
      opts,
    );
    return (await readJson(res, "/web/model/get_definitions")) as T;
  }

  getSessionInfo(opts?: CallOptions): Promise<SessionInfo> {
    return this.route<SessionInfo>("/web/session/get_session_info", {}, { retry: true, ...opts });
  }

  async destroy(): Promise<void> {
    try {
      await this.route("/web/session/destroy");
    } finally {
      this.http.jar?.clear();
      this.csrf = undefined;
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
