/** Gateway configuration from the environment (defaults = local dev stack, D-21). */
export interface GatewayConfig {
  port: number;
  odooUrl: string;
  odooDb: string;
  /** How long a password-OK-but-needs-2FA login waits for its code. */
  pendingTtlMs: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): GatewayConfig {
  return {
    port: Number(env.PORT ?? 4000),
    odooUrl: env.ODOO_URL ?? "http://127.0.0.1:18069",
    odooDb: env.ODOO_DB ?? "novi_demo",
    pendingTtlMs: Number(env.PENDING_2FA_TTL_MS ?? 5 * 60_000),
  };
}
