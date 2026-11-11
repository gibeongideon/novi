/**
 * Stateless API-key transport (Odoo ≥ 19):
 *   POST /json/2/<model>/<method>
 *   Authorization: bearer <api key>     X-Odoo-Database: <db>
 *   body: { ids?, context?, ...named arguments }   → raw JSON result
 * Errors come back with a real HTTP status and the serialised exception as body
 * (odoo/http/dispatcher.py: Json2Dispatcher). Only ORM methods are reachable this way.
 */
import {
  BadRequestError,
  errorFromOdoo,
  isOdooErrorData,
  NetworkError,
  SessionExpiredError,
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

export interface Json2Options extends TransportOptions {
  /** User API key (Preferences → Account Security → New API key). */
  apiKey: string;
}

export class Json2Transport implements OrmTransport {
  readonly http: Http;
  private ctx: OdooContext;

  constructor(private readonly opts: Json2Options) {
    if (!opts.apiKey) throw new Error("Json2Transport: apiKey is required");
    this.http = new Http(opts);
    this.ctx = { ...opts.context };
  }

  get context(): OdooContext {
    return this.ctx;
  }

  setContext(patch: OdooContext): void {
    this.ctx = { ...this.ctx, ...patch };
  }

  async call<T = unknown>(
    model: string,
    method: string,
    call: OrmCall = {},
    opts: CallOptions = {},
  ): Promise<T> {
    const path = `/json/2/${model}/${method}`;
    const body: Record<string, unknown> = { ...call.kwargs };
    if (call.ids) body.ids = call.ids;
    const context = { ...this.ctx, ...call.context };
    if (Object.keys(context).length) body.context = context;

    const headers: Record<string, string> = { Authorization: `bearer ${this.opts.apiKey}` };
    if (this.opts.db) headers["X-Odoo-Database"] = this.opts.db;

    const res = await this.http.send({
      url: path,
      method: "POST",
      headers,
      body,
      signal: opts.signal,
      retry: opts.retry ?? READ_METHODS.has(method),
    });
    const json = await readJson(res, path);
    if (res.ok) return json as T;

    if (isOdooErrorData(json)) {
      const err = errorFromOdoo(json, { status: res.status });
      // An unknown/invalid API key surfaces as 401
      if (res.status === 401 && !(err instanceof SessionExpiredError)) {
        const e = new SessionExpiredError(err.message, { status: 401, data: json });
        this.opts.onSessionExpired?.(e);
        throw e;
      }
      if (err instanceof SessionExpiredError) this.opts.onSessionExpired?.(err);
      throw err;
    }
    if (res.status === 422 || res.status === 400) {
      throw new BadRequestError(`Bad request to ${path} (HTTP ${res.status})`, { status: res.status });
    }
    throw new NetworkError(`HTTP ${res.status} from ${path}`, { status: res.status });
  }
}
