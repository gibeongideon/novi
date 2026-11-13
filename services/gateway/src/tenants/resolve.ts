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

/**
 * Attaches `request.tenant` (null on the platform host, e.g. the sign-up pages). Requests that
 * reach Odoo (proxied routes, sign-in) require an active tenant: unknown → 404, suspended → 503.
 */
export function registerTenancy(
  app: FastifyInstance,
  resolve: (host?: string) => Tenant | null,
  needsTenant: (url: string) => boolean,
): void {
  app.decorateRequest("tenant", null);
  app.addHook("onRequest", async (req: FastifyRequest, reply) => {
    req.tenant = resolve(req.headers.host);
    if (!needsTenant(req.url)) return;
    if (!req.tenant) return reply.code(404).send({ status: "unknown_tenant" });
    if (req.tenant.status !== "active") return reply.code(503).send({ status: "suspended" });
  });
}
