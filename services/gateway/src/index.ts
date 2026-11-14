import { existsSync } from "node:fs";
import { join } from "node:path";

import fastifyStatic from "@fastify/static";
import { loadKey, type Mailer, platformConfig, SignupStore, smtpMailer } from "@novi/provisioner";
import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";

import { registerAuthRoutes } from "./auth/routes.js";
import { type GatewayConfig, loadConfig } from "./config.js";
import { isProxied, registerProxy, registerWebsocketProxy } from "./proxy.js";
import { registerSignupRoutes } from "./signup/routes.js";
import { FileTenantRegistry, normalizeHost } from "./tenants/registry.js";
import { registerTenancy, tenantResolver } from "./tenants/resolve.js";

export { type GatewayConfig, loadConfig } from "./config.js";
export { FileTenantRegistry, normalizeHost, type Tenant } from "./tenants/registry.js";

/**
 * NOVI gateway: per-tenant same-origin entry point (D-26, D-27).
 *   /healthz /readyz      liveness
 *   /api/auth/*           sign-in incl. Odoo 2FA, against the tenant's own Odoo
 *   /api/signup*          self-service sign-up (platform host only, P1.3)
 *   /api/tls/allowed      Caddy's on-demand TLS check: certificates only for known hosts (P1.5.6)
 *   Odoo routes           reverse-proxied to the tenant's Odoo (allow-list), websocket included
 *   everything else       the built web app (when WEB_DIST is set), SPA fallback
 */
export async function buildServer(config: GatewayConfig = loadConfig(), deps: { mailer?: Mailer } = {}) {
  // behind Caddy/Vite (trusted proxies only), req.ip is the end user's IP (forwarded to Odoo)
  const app = Fastify({
    logger: process.env.NODE_ENV !== "test",
    trustProxy: config.trustProxy ?? "loopback",
  });
  const resolve = tenantResolver(config);
  const registry = new FileTenantRegistry(config.tenantsFile);

  app.get("/healthz", async () => ({ status: "ok" }));
  app.get("/readyz", async () => ({ status: "ready" }));
  registerTenancy(app, resolve, (url) => isProxied(url) || url.startsWith("/api/auth/"));
  registerAuthRoutes(app, config);
  // registry only, never the local default tenant: any other answer would let anyone who points a
  // domain at us make Caddy request certificates for it
  app.get<{ Querystring: { domain?: string } }>("/api/tls/allowed", async (req, reply) => {
    const host = normalizeHost(req.query.domain);
    const known = config.platformHosts?.includes(host) || registry.byHost(host)?.status === "active";
    return reply.code(known ? 200 : 404).send({ status: known ? "ok" : "unknown" });
  });
  if (config.platformHosts?.length) {
    const pc = platformConfig();
    registerSignupRoutes(app, {
      store: new SignupStore(pc.signupsDir),
      key: loadKey(process.env, pc.devKeyFile),
      mailer: deps.mailer ?? smtpMailer(),
      registry,
      platformHosts: config.platformHosts,
    });
  }
  // the built web app (production / pnpm serve): files looked up on each request (a rebuild never
  // strands a running gateway); app routes (/apps/…, /action/…) get the shell; a missing asset is a 404
  const dist = config.webDist && existsSync(join(config.webDist, "index.html")) ? config.webDist : undefined;
  if (dist) await app.register(fastifyStatic, { root: dist, serve: false });
  const serveApp = dist
    ? (req: FastifyRequest, reply: FastifyReply) => {
        const path = decodeURIComponent(req.url.split("?")[0]!);
        const isFile = path.startsWith("/assets/") || /\.[a-z0-9]+$/i.test(path);
        if (!isFile) return reply.type("text/html").sendFile("index.html");
        return existsSync(join(dist, path))
          ? reply.sendFile(path.slice(1))
          : reply.code(404).send({ status: "not_found" });
      }
    : undefined;
  await registerProxy(app, serveApp);
  registerWebsocketProxy(app, resolve);
  return app;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const config = loadConfig();
  buildServer(config)
    .then((app) => app.listen({ port: config.port, host: config.host }))
    .catch((err: unknown) => {
      console.error(err);
      process.exit(1);
    });
}
