import Fastify from "fastify";

import { registerAuthRoutes } from "./auth/routes.js";
import { type GatewayConfig, loadConfig } from "./config.js";

export function buildServer(config: GatewayConfig = loadConfig()) {
  // trustProxy: behind Vite/Caddy, req.ip is the end user's IP (forwarded to Odoo)
  const app = Fastify({ logger: process.env.NODE_ENV !== "test", trustProxy: true });
  app.get("/healthz", async () => ({ status: "ok" }));
  app.get("/readyz", async () => ({ status: "ready" }));
  registerAuthRoutes(app, config);
  return app;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const config = loadConfig();
  buildServer(config)
    .listen({ port: config.port, host: "127.0.0.1" })
    .catch((err: unknown) => {
      console.error(err);
      process.exit(1);
    });
}
