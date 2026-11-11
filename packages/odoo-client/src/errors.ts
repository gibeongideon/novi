/**
 * Typed errors for everything Odoo (or the network) can throw at us.
 *
 * Odoo serialises exceptions the same way for both protocols (odoo/http: serialize_exception):
 *   { name: "odoo.exceptions.UserError", message, arguments, context, debug, timestamp }
 * JSON-RPC wraps it as  {"error": {"code", "message", "data": <serialised>}}  with HTTP 200;
 * JSON-2 returns it as the body with a real HTTP status (UserError → 422, AccessError → 403 …).
 */

/** Serialised Odoo exception payload (odoo/http serialize_exception). */
export interface OdooErrorData {
  name: string;
  message: string;
  arguments?: unknown[];
  context?: Record<string, unknown>;
  debug?: string;
  timestamp?: number;
}

export interface OdooErrorOptions {
  /** HTTP status when known (JSON-2, or non-200 responses). */
  status?: number;
  /** JSON-RPC error code (100 = session expired, 404 = not found, 0/200 = generic). */
  code?: number;
  data?: OdooErrorData;
  cause?: unknown;
}

/** Base class for every error raised by this package. */
export class OdooError extends Error {
  /** Fully qualified Odoo exception name, e.g. `odoo.exceptions.UserError`. */
  readonly odooName: string;
  readonly status: number | undefined;
  readonly code: number | undefined;
  readonly data: OdooErrorData | undefined;

  constructor(message: string, opts: OdooErrorOptions = {}) {
    super(message, opts.cause === undefined ? undefined : { cause: opts.cause });
    this.name = new.target.name;
    this.odooName = opts.data?.name ?? "";
    this.status = opts.status;
    this.code = opts.code;
    this.data = opts.data;
  }

  /** Server-side traceback (only present when the server exposes it). */
  get debug(): string | undefined {
    return this.data?.debug;
  }
}

/** Business rule violation shown to the end user (odoo.exceptions.UserError, HTTP 422). */
export class UserError extends OdooError {}
/** Constraint failure (odoo.exceptions.ValidationError). */
export class ValidationError extends UserError {}
/** The user lacks rights on a model/record (odoo.exceptions.AccessError, HTTP 403). */
export class AccessError extends UserError {}
/** Authentication failed (odoo.exceptions.AccessDenied, HTTP 403). */
export class AccessDenied extends UserError {}
/** Record no longer exists (odoo.exceptions.MissingError, HTTP 404). */
export class MissingError extends UserError {}
/** Record locked by another transaction (odoo.exceptions.LockError, HTTP 409). */
export class LockError extends UserError {}

/** Warning that offers to open an action (odoo.exceptions.RedirectWarning). */
export class RedirectWarning extends UserError {
  /** Action id / xml id / dict to open (arguments[1]). */
  get action(): unknown {
    return this.data?.arguments?.[1];
  }
  get buttonText(): string | undefined {
    const v = this.data?.arguments?.[2];
    return typeof v === "string" ? v : undefined;
  }
  get additionalContext(): Record<string, unknown> | undefined {
    const v = this.data?.arguments?.[3];
    return v && typeof v === "object" ? (v as Record<string, unknown>) : undefined;
  }
}

/** The session cookie is missing or expired (JSON-RPC code 100, or HTTP 401 on JSON-2). */
export class SessionExpiredError extends OdooError {}
/**
 * Password was right but the user has 2FA enabled: `/web/session/authenticate` returns `uid: null`.
 * The TOTP step only exists as the HTML form `/web/login/totp` (see DECISIONS for the relay approach).
 */
export class TwoFactorRequiredError extends OdooError {}
/** Route, model or method not found (JSON-RPC code 404 / HTTP 404 without an Odoo payload). */
export class NotFoundError extends OdooError {}
/** The request itself was rejected (e.g. JSON-2 argument mismatch → 422 BadRequest-style). */
export class BadRequestError extends OdooError {}
/** Connection failure, DNS, TLS, timeout, or a non-JSON reply (proxy error page …). */
export class NetworkError extends OdooError {}
/** The call was cancelled through an AbortSignal. */
export class AbortError extends OdooError {}

const BY_NAME: Record<string, new (message: string, opts?: OdooErrorOptions) => OdooError> = {
  "odoo.exceptions.UserError": UserError,
  "odoo.exceptions.ValidationError": ValidationError,
  "odoo.exceptions.AccessError": AccessError,
  "odoo.exceptions.AccessDenied": AccessDenied,
  "odoo.exceptions.MissingError": MissingError,
  "odoo.exceptions.LockError": LockError,
  "odoo.exceptions.RedirectWarning": RedirectWarning,
  "odoo.http.SessionExpiredException": SessionExpiredError,
  "odoo.http.session.SessionExpiredException": SessionExpiredError,
  "werkzeug.exceptions.NotFound": NotFoundError,
  "werkzeug.exceptions.BadRequest": BadRequestError,
  "werkzeug.exceptions.UnprocessableEntity": BadRequestError,
  "werkzeug.exceptions.Unauthorized": SessionExpiredError,
};

/** Builds the most specific error class for a serialised Odoo exception. */
export function errorFromOdoo(data: OdooErrorData, opts: Omit<OdooErrorOptions, "data"> = {}): OdooError {
  let Ctor = BY_NAME[data.name];
  if (!Ctor) {
    // Subclasses defined in addons keep the base class's last name segment rarely; fall back by suffix.
    const short = data.name.split(".").pop() ?? "";
    Ctor = Object.entries(BY_NAME).find(([k]) => k.endsWith("." + short))?.[1];
  }
  if (!Ctor) {
    if (opts.code === 100 || opts.status === 401) Ctor = SessionExpiredError;
    else if (opts.code === 404 || opts.status === 404) Ctor = NotFoundError;
    else Ctor = OdooError;
  }
  return new Ctor(data.message || data.name || "Odoo error", { ...opts, data });
}

export function isOdooErrorData(v: unknown): v is OdooErrorData {
  return !!v && typeof v === "object" && typeof (v as OdooErrorData).name === "string";
}
