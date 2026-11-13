import type { FastifyInstance, FastifyRequest } from "fastify";

import type { GatewayConfig } from "../config.js";
import { FileTenantRegistry, type Tenant } from "./registry.js";

declare module "fastify" {
  interface FastifyRequest {
    /** The customer this request belongs to, from its Host header (P1.2.2). */
    tenant: Tenant | null;
  }
}

export function tenantResolver(config: GatewayConfig) {
  const registry = new FileTenantRegistry(config.tenantsFile);
  return (host: string | undefined): Tenant | null => registry.byHost(host) ?? config.defaultTenant ?? null;
}

/** Attaches `request.tenant`; unknown or suspended tenants never reach Odoo. */
export function registerTenancy(app: FastifyInstance, resolve: (host?: string) => Tenant | null): void {
  app.decorateRequest("tenant", null);
  app.addHook("onRequest", async (req: FastifyRequest, reply) => {
    if (req.url === "/healthz" || req.url === "/readyz") return;
    const tenant = resolve(req.headers.host);
    if (!tenant) return reply.code(404).send({ status: "unknown_tenant" });
    if (tenant.status !== "active") return reply.code(503).send({ status: "suspended" });
    req.tenant = tenant;
  });
}
