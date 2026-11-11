/**
 * How the browser signs in (P1.6). One interface, two implementations:
 *  - gatewayAuth(): through the NOVI gateway, supports Odoo 2FA + trusted devices (D-15)
 *  - directAuth():  straight to Odoo (/web/session/authenticate), no 2FA, for setups without a gateway
 */
import { AccessDenied, type SessionInfo, TwoFactorRequiredError } from "@novi/odoo-client";

export type LoginResult = { status: "ok" } | { status: "twoFactor"; challenge: string };
export type LoginFailure = "credentials" | "code" | "expired" | "twoFactorUnsupported" | "other";

export class LoginError extends Error {
  constructor(
    readonly reason: LoginFailure,
    message: string,
  ) {
    super(message);
    this.name = "LoginError";
  }
}

export interface AuthClient {
  login(login: string, password: string): Promise<LoginResult>;
  verifyCode(challenge: string, code: string, remember: boolean): Promise<void>;
}

export function gatewayAuth(base = "", fetchImpl: typeof fetch = (...a) => fetch(...a)): AuthClient {
  const post = async (path: string, body: unknown) => {
    const res = await fetchImpl(`${base}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as {
      status?: string;
      challenge?: string;
      reason?: LoginFailure;
      message?: string;
    };
    if (!res.ok) throw new LoginError(json.reason ?? "other", json.message ?? `HTTP ${res.status}`);
    return json;
  };
  return {
    async login(login, password) {
      const r = await post("/api/auth/login", { login, password });
      return r.status === "twoFactor" ? { status: "twoFactor", challenge: r.challenge! } : { status: "ok" };
    },
    async verifyCode(challenge, code, remember) {
      await post("/api/auth/totp", { challenge, code, remember });
    },
  };
}

export function directAuth(
  t: {
    authenticate(login: string, password: string, db?: string): Promise<SessionInfo>;
  },
  db: string,
): AuthClient {
  return {
    async login(login, password) {
      try {
        await t.authenticate(login, password, db);
        return { status: "ok" };
      } catch (err) {
        if (err instanceof TwoFactorRequiredError) throw new LoginError("twoFactorUnsupported", err.message);
        if (err instanceof AccessDenied) throw new LoginError("credentials", err.message);
        throw err;
      }
    },
    async verifyCode() {
      throw new LoginError("twoFactorUnsupported", "Two-factor sign-in needs the NOVI gateway");
    },
  };
}
