/**
 * Auth bridge, same-domain mode (P1.6.1/P1.6.2, D-15). The browser can't run Odoo's 2FA step, so
 * the gateway does it server-side through stock Odoo routes and then hands the browser Odoo's own
 * `session_id` cookie (same origin), exactly what a normal Odoo login would have set.
 *   POST /api/auth/login  { login, password }        → 200 ok | 200 { twoFactor, challenge } | 401
 *   POST /api/auth/totp   { challenge, code, remember } → 200 ok | 401
 *   POST /api/auth/reset  { login }                    → 202 (always: no account probing)
 *   POST /api/auth/reset/confirm { token, password }   → 200 ok | 400 { reason: "tooShort", minLength }
 *                                                        | 400 { reason: "reset", message } (Odoo's reason)
 *   GET  /web/reset_password?token=…                   → 302 to NOVI's own reset page (P1.6.5)
 *   GET  /web/signup?token=…  (Odoo invitation link)   → 302 to the same page: an invitation token
 *                                                        sets the first password the same way
 *   GET  /api/auth/providers[?token=]                  → [{ name, url }] SSO providers (P1.14)
 *   GET  /web/login?oauth_error=…                      → 302 /?ssoError=… (Odoo's SSO failure → NOVI)
 */
import {
  AccessDenied,
  JsonRpcTransport,
  PasswordTooShortError,
  TwoFactorRequiredError,
  UserError,
} from "@novi/odoo-client";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import type { GatewayConfig } from "../config.js";
import { rateLimiter } from "../rateLimit.js";
import { parseCookies, serializeCookie } from "./cookies.js";
import { PendingLogins } from "./pending.js";

const ODOO_SESSION_MAX_AGE = 7 * 24 * 3600; // Odoo's own session lifetime
const TRUSTED_DEVICE_MAX_AGE = 90 * 24 * 3600; // Odoo's default trusted-device age

interface Pending {
  transport: JsonRpcTransport;
  userAgent: string;
}

export function registerAuthRoutes(app: FastifyInstance, config: GatewayConfig): void {
  const pending = new PendingLogins<Pending>(config.pendingTtlMs);

  /** A transport to *this tenant's* Odoo, on behalf of this browser (its IP and User-Agent). */
  const transportFor = (req: FastifyRequest) =>
    new JsonRpcTransport({
      baseUrl: req.tenant!.odooUrl,
      db: req.tenant!.db,
      headers: {
        "X-Forwarded-For": req.ip,
        "X-Forwarded-Host": req.headers.host ?? "",
        // so links Odoo builds (reset, SSO return) use https behind Caddy
        "X-Forwarded-Proto": req.protocol,
        "User-Agent": req.headers["user-agent"] ?? "NOVI-Gateway",
      },
    });

  const secure = (req: FastifyRequest) =>
    req.protocol === "https" || req.headers["x-forwarded-proto"] === "https";

  /** Hand the browser Odoo's session (and, if remembered, the trusted-device key). */
  const finish = (req: FastifyRequest, reply: FastifyReply, t: JsonRpcTransport) => {
    const cookies = [
      serializeCookie("session_id", t.sessionId ?? "", { maxAge: ODOO_SESSION_MAX_AGE, secure: secure(req) }),
    ];
    if (t.trustedDevice) {
      cookies.push(
        serializeCookie("td_id", t.trustedDevice, { maxAge: TRUSTED_DEVICE_MAX_AGE, secure: secure(req) }),
      );
    }
    return reply.header("Set-Cookie", cookies).send({ status: "ok" });
  };

  /** `reason` lets the UI show its own translated message; `message` is Odoo's/diagnostic text. */
  const denied = (
    reply: FastifyReply,
    reason: "credentials" | "code" | "expired" | "cooldown",
    message: string,
  ) => reply.code(401).send({ status: "denied", reason, message });

  /**
   * Odoo's per-IP login cooldown (P1.6.6) is an AccessDenied too; only its text tells them apart.
   * The gateway calls Odoo without a language, so the text is Odoo's English source string.
   */
  const loginDenied = (reply: FastifyReply, err: AccessDenied) =>
    denied(reply, /too many login failures/i.test(err.message) ? "cooldown" : "credentials", err.message);

  app.post<{ Body: { login?: string; password?: string } }>("/api/auth/login", async (req, reply) => {
    const { login, password } = req.body ?? {};
    if (!login || !password)
      return reply.code(400).send({ status: "invalid", message: "login and password required" });
    const t = transportFor(req);
    const td = parseCookies(req.headers.cookie).td_id;
    if (td) t.trustedDevice = td;
    try {
      await t.authenticate(login, password);
      return finish(req, reply, t);
    } catch (err) {
      if (err instanceof TwoFactorRequiredError) {
        const ua = req.headers["user-agent"] ?? "";
        // remembered device: Odoo finalises the session without a code
        if (td && (await t.resumeTrustedDevice(ua || undefined).catch(() => null)))
          return finish(req, reply, t);
        return reply.send({ status: "twoFactor", challenge: pending.add({ transport: t, userAgent: ua }) });
      }
      if (err instanceof AccessDenied) return loginDenied(reply, err);
      throw err;
    }
  });

  app.post<{ Body: { challenge?: string; code?: string; remember?: boolean } }>(
    "/api/auth/totp",
    async (req, reply) => {
      const { challenge, code, remember } = req.body ?? {};
      const p = challenge ? pending.take(challenge) : undefined;
      if (!p) return denied(reply, "expired", "Unknown or expired challenge");
      if (!code) return denied(reply, "code", "Code missing");
      try {
        await p.transport.completeTwoFactor(code, {
          remember: !!remember,
          userAgent: p.userAgent || undefined,
        });
        return finish(req, reply, p.transport);
      } catch (err) {
        if (err instanceof AccessDenied) return denied(reply, "code", err.message);
        throw err;
      }
    },
  );

  // ── password reset (P1.6.5): Odoo's stock auth_signup flow, relayed so users never see Odoo's UI
  const resetAllowed = rateLimiter(5, 3600_000); // no mailbox flooding through us

  app.post<{ Body: { login?: string } }>("/api/auth/reset", async (req, reply) => {
    const login = (req.body?.login ?? "").trim();
    if (!login) return reply.code(400).send({ status: "invalid", message: "login required" });
    if (!resetAllowed(req.ip)) return reply.code(429).send({ status: "invalid", reason: "rate" });
    // same answer whether or not the account exists; the reason stays in our logs only
    await transportFor(req)
      .requestPasswordReset(login)
      .catch((err: unknown) => req.log.warn({ err: (err as Error).message }, "password reset not sent"));
    return reply.code(202).send({ status: "sent" });
  });

  app.post<{ Body: { token?: string; password?: string } }>("/api/auth/reset/confirm", async (req, reply) => {
    const { token, password } = req.body ?? {};
    if (!token || !password)
      return reply.code(400).send({ status: "invalid", message: "token and password required" });
    try {
      await transportFor(req).resetPassword(token, password);
      return reply.send({ status: "ok" });
    } catch (err) {
      if (err instanceof PasswordTooShortError)
        return reply.code(400).send({ status: "invalid", reason: "tooShort", minLength: err.minLength });
      // Odoo's own (translated) reason: link expired or already used
      if (err instanceof UserError)
        return reply.code(400).send({ status: "invalid", reason: "reset", message: err.message });
      throw err;
    }
  });

  // links in Odoo's emails point at Odoo's pages: send the browser to NOVI's instead.
  // Odoo's own public sign-up page is never shown (workspaces are invitation-only, D-31).
  const toResetPage = async (req: FastifyRequest<{ Querystring: { token?: string } }>, reply: FastifyReply) =>
    reply.redirect(
      req.query.token ? `/reset-password?token=${encodeURIComponent(req.query.token)}` : "/reset-password",
    );
  app.get("/web/reset_password", toResetPage);
  app.get("/web/signup", toResetPage);

  // ── SSO (P1.14): Odoo's stock auth_oauth; the browser goes to the provider and back to
  // /auth_oauth/signin on this host (proxied), where Odoo sets its own session cookie
  app.get<{ Querystring: { token?: string } }>("/api/auth/providers", async (req) =>
    transportFor(req).oauthProviders({ redirect: "/", token: req.query.token || undefined }),
  );
  // a failed SSO sign-in lands on Odoo's login page: show NOVI's with the reason instead
  app.addHook("onRequest", async (req, reply) => {
    if (req.method !== "GET" || !req.url.startsWith("/web/login?")) return;
    const err = new URL(req.url, "http://x").searchParams.get("oauth_error");
    if (err) return reply.redirect(`/?ssoError=${encodeURIComponent(err)}`);
  });
}
