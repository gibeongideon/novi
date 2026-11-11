/** Low-level HTTP plumbing shared by both transports: timeouts, abort, retries, hooks, cookies. */
import { AbortError, NetworkError, OdooError } from "./errors.js";
import type { RetryPolicy, TransportOptions } from "./types.js";

/** Minimal cookie jar for server-side use (Node has no browser cookie store). */
export class CookieJar {
  private readonly cookies = new Map<string, string>();

  /** Absorbs Set-Cookie headers from a response. Expired cookies are removed. */
  store(res: Response): void {
    const headers = res.headers as Headers & { getSetCookie?: () => string[] };
    const list = headers.getSetCookie?.() ?? splitSetCookie(res.headers.get("set-cookie"));
    for (const line of list) {
      const [pair, ...attrs] = line.split(";");
      const eq = pair?.indexOf("=") ?? -1;
      if (!pair || eq < 1) continue;
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();
      const expired = attrs.some((a) => {
        const [k, v] = a.split("=");
        const key = k?.trim().toLowerCase();
        if (key === "max-age") return Number(v) <= 0;
        if (key === "expires") return v !== undefined && Date.parse(v) < Date.now();
        return false;
      });
      if (expired || value === "") this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
  }

  header(): string | undefined {
    if (!this.cookies.size) return undefined;
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ");
  }

  get(name: string): string | undefined {
    return this.cookies.get(name);
  }

  set(name: string, value: string): void {
    this.cookies.set(name, value);
  }

  clear(): void {
    this.cookies.clear();
  }
}

function splitSetCookie(raw: string | null): string[] {
  if (!raw) return [];
  // Commas also appear inside Expires dates; split only on ", <token>=".
  return raw.split(/,(?=\s*[^;,=\s]+=)/).map((s) => s.trim());
}

const isBrowser = typeof window !== "undefined" && typeof document !== "undefined";

export interface HttpRequest {
  url: string;
  method: "GET" | "POST";
  headers?: Record<string, string>;
  body?: unknown;
  /** Form fields, sent as application/x-www-form-urlencoded (Odoo `type="http"` POST routes). */
  form?: Record<string, string>;
  signal?: AbortSignal | undefined;
  /** Retry on network errors / 502-504. Only for idempotent calls. */
  retry: boolean;
}

export class Http {
  readonly baseUrl: string;
  readonly jar: CookieJar | null;
  private readonly fetchImpl: typeof fetch;
  private readonly retryPolicy: RetryPolicy;
  private readonly timeoutMs: number;

  constructor(private readonly opts: TransportOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, "");
    const f = opts.fetch ?? globalThis.fetch;
    if (!f) throw new Error("No fetch implementation available");
    this.fetchImpl = f.bind(globalThis);
    // Browsers manage cookies themselves (credentials: "include"); Node needs a jar.
    this.jar = isBrowser && !opts.fetch ? null : new CookieJar();
    this.retryPolicy = { retries: 2, baseDelayMs: 300, ...opts.retry };
    this.timeoutMs = opts.timeoutMs ?? 60_000;
  }

  url(path: string): string {
    return /^https?:\/\//.test(path) ? path : `${this.baseUrl}${path.startsWith("/") ? "" : "/"}${path}`;
  }

  /** Performs the request with timeout, abort, hooks and (optional) retries. Returns the raw Response. */
  async send(req: HttpRequest): Promise<Response> {
    const attempts = req.retry ? this.retryPolicy.retries + 1 : 1;
    let lastErr: unknown;
    for (let attempt = 0; attempt < attempts; attempt++) {
      if (attempt > 0) await sleep(this.retryPolicy.baseDelayMs * 2 ** (attempt - 1), req.signal);
      try {
        const res = await this.once(req);
        if (req.retry && res.status >= 502 && res.status <= 504 && attempt < attempts - 1) {
          lastErr = new NetworkError(`HTTP ${res.status} from ${req.url}`, { status: res.status });
          continue;
        }
        return res;
      } catch (err) {
        if (err instanceof AbortError) throw err;
        lastErr = err;
      }
    }
    throw lastErr instanceof OdooError
      ? lastErr
      : new NetworkError(`Request to ${req.url} failed: ${String(lastErr)}`, { cause: lastErr });
  }

  private async once(req: HttpRequest): Promise<Response> {
    const url = this.url(req.url);
    const ctrl = new AbortController();
    const onAbort = () => ctrl.abort(req.signal?.reason);
    if (req.signal?.aborted) throw new AbortError("Request aborted");
    req.signal?.addEventListener("abort", onAbort, { once: true });
    const timer = setTimeout(() => ctrl.abort(new Error("timeout")), this.timeoutMs);

    const headers: Record<string, string> = {
      Accept: "application/json",
      ...this.opts.headers,
      ...req.headers,
    };
    let payload: string | undefined;
    if (req.form) {
      headers["Content-Type"] = "application/x-www-form-urlencoded";
      payload = new URLSearchParams(req.form).toString();
    } else if (req.body !== undefined) {
      headers["Content-Type"] = "application/json";
      payload = JSON.stringify(req.body);
    }
    const cookie = this.jar?.header();
    if (cookie) headers.Cookie = cookie;

    this.opts.onRequest?.({ url, method: req.method, body: req.body });
    const started = Date.now();
    try {
      const res = await this.fetchImpl(url, {
        method: req.method,
        headers,
        body: payload,
        signal: ctrl.signal,
        credentials: "include",
        redirect: "manual",
      });
      this.jar?.store(res);
      this.opts.onResponse?.({
        url,
        method: req.method,
        body: req.body,
        status: res.status,
        ok: res.ok,
        durationMs: Date.now() - started,
      });
      return res;
    } catch (err) {
      if (req.signal?.aborted) throw new AbortError("Request aborted", { cause: err });
      if (ctrl.signal.aborted)
        throw new NetworkError(`Timeout after ${this.timeoutMs} ms: ${url}`, { cause: err });
      throw new NetworkError(`Network error calling ${url}: ${String(err)}`, { cause: err });
    } finally {
      clearTimeout(timer);
      req.signal?.removeEventListener("abort", onAbort);
    }
  }
}

/** Parses a JSON body or throws a NetworkError (proxies often answer with HTML). */
export async function readJson(res: Response, url: string): Promise<unknown> {
  const text = await res.text();
  try {
    return text ? (JSON.parse(text) as unknown) : null;
  } catch (cause) {
    throw new NetworkError(`Expected JSON from ${url} (HTTP ${res.status}), got: ${text.slice(0, 120)}`, {
      status: res.status,
      cause,
    });
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new AbortError("Request aborted"));
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        reject(new AbortError("Request aborted"));
      },
      { once: true },
    );
  });
}
