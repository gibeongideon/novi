/** Gateway configuration from the environment (defaults = local dev stack, D-21). */
import { fileURLToPath } from "node:url";

import type { Tenant } from "./tenants/registry.js";

export interface GatewayConfig {
  port: number;
  host: string;
  /** Tenant registry file (P1.2). */
  tenantsFile: string;
  /**
   * Tenant used when the request host isn't registered. Local dev only (the shared demo Odoo);
   * unset in production, where unknown hosts get 404.
   */
  defaultTenant?: Tenant;
  /** Built web app to serve for tenant hosts (production / `pnpm preview`); unset in Vite dev. */
  webDist?: string;
  /** How long a password-OK-but-needs-2FA login waits for its code. */
  pendingTtlMs: number;
  /** Hosts that serve the sign-up pages (the platform, not a workspace). */
  platformHosts?: string[];
  /**
   * Proxies whose X-Forwarded-For is believed (proxy-addr syntax). Default: loopback only, i.e. the
   * local Caddy / Vite. Anything wider lets clients pick their own IP and dodge Odoo's per-IP
   * login cooldown (P1.6.6).
   */
  trustProxy?: string;
}

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));

export function loadConfig(env: NodeJS.ProcessEnv = process.env): GatewayConfig {
  const odooUrl = env.ODOO_URL ?? "http://127.0.0.1:18069";
  return {
    port: Number(env.PORT ?? 4000),
    host: env.HOST ?? "127.0.0.1",
    tenantsFile: env.TENANTS_FILE ?? `${repoRoot}.cache/tenants.json`,
    defaultTenant:
      env.DEFAULT_TENANT === "off"
        ? undefined
        : {
            slug: "local",
            hosts: [],
            odooUrl,
            wsUrl: env.ODOO_WS_URL ?? "http://127.0.0.1:18072",
            db: env.ODOO_DB ?? "novi_demo",
            status: "active",
          },
    webDist: env.WEB_DIST,
    pendingTtlMs: Number(env.PENDING_2FA_TTL_MS ?? 5 * 60_000),
    trustProxy: env.TRUST_PROXY ?? "loopback",
    platformHosts: (env.PLATFORM_HOSTS ?? "localhost").split(",").map((h) => h.trim()),
  };
}
