/**
 * Auth bridge, same-domain mode (P1.6.1/P1.6.2, D-15). The browser can't run Odoo's 2FA step, so
 * the gateway does it server-side through stock Odoo routes and then hands the browser Odoo's own
 * `session_id` cookie (same origin), exactly what a normal Odoo login would have set.
 *   POST /api/auth/login  { login, password }        → 200 ok | 200 { twoFactor, challenge } | 401
 *   POST /api/auth/totp   { challenge, code, remember } → 200 ok | 401
 */
import { AccessDenied, JsonRpcTransport, TwoFactorRequiredError } from "@novi/odoo-client";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import type { GatewayConfig } from "../config.js";
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
  const denied = (reply: FastifyReply, reason: "credentials" | "code" | "expired", message: string) =>
    reply.code(401).send({ status: "denied", reason, message });

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
      if (err instanceof AccessDenied) return denied(reply, "credentials", err.message);
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
}
