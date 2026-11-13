import { existsSync } from "node:fs";
import { join } from "node:path";

import fastifyStatic from "@fastify/static";
import { loadKey, type Mailer, platformConfig, SignupStore, smtpMailer } from "@novi/provisioner";
import Fastify from "fastify";

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
  await registerProxy(app);
  registerWebsocketProxy(app, resolve);

  if (config.webDist && existsSync(join(config.webDist, "index.html"))) {
    await app.register(fastifyStatic, { root: config.webDist, wildcard: false });
    // client-side routes (/apps/…, /action/…) get the app shell
    app.setNotFoundHandler((req, reply) =>
      req.method === "GET" && !req.url.startsWith("/api/") && !isProxied(req.url)
        ? reply.type("text/html").sendFile("index.html")
        : reply.code(404).send({ status: "not_found" }),
    );
  }
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
