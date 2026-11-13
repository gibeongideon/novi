import { existsSync } from "node:fs";
import { join } from "node:path";

import fastifyStatic from "@fastify/static";
import Fastify from "fastify";

import { registerAuthRoutes } from "./auth/routes.js";
import { type GatewayConfig, loadConfig } from "./config.js";
import { isProxied, registerProxy, registerWebsocketProxy } from "./proxy.js";
import { registerTenancy, tenantResolver } from "./tenants/resolve.js";

export { type GatewayConfig, loadConfig } from "./config.js";
export { FileTenantRegistry, normalizeHost, type Tenant } from "./tenants/registry.js";

/**
 * NOVI gateway: per-tenant same-origin entry point (D-26, D-27).
 *   /healthz /readyz      liveness
 *   /api/auth/*           sign-in incl. Odoo 2FA, against the tenant's own Odoo
 *   Odoo routes           reverse-proxied to the tenant's Odoo (allow-list), websocket included
 *   everything else       the built web app (when WEB_DIST is set), SPA fallback
 */
export async function buildServer(config: GatewayConfig = loadConfig()) {
  // trustProxy: behind Caddy/Vite, req.ip is the end user's IP (forwarded to Odoo)
  const app = Fastify({ logger: process.env.NODE_ENV !== "test", trustProxy: true });
  const resolve = tenantResolver(config);

  app.get("/healthz", async () => ({ status: "ok" }));
  app.get("/readyz", async () => ({ status: "ready" }));
  registerTenancy(app, resolve);
  registerAuthRoutes(app, config);
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
