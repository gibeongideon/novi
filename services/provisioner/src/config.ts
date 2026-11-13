import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));

export interface PlatformConfig {
  repoRoot: string;
  signupsDir: string;
  devKeyFile: string;
  /** Workspaces live at <slug>.<baseDomain> (locally: acme.localhost). */
  baseDomain: string;
  /** Public URL of a workspace; {slug} is replaced. */
  workspaceUrl: string;
  /** First host port for local tenant containers. */
  firstPort: number;
}

export function platformConfig(env: NodeJS.ProcessEnv = process.env): PlatformConfig {
  return {
    repoRoot,
    signupsDir: env.SIGNUPS_DIR ?? `${repoRoot}.cache/platform/signups`,
    devKeyFile: `${repoRoot}.cache/platform/secret`,
    baseDomain: env.PLATFORM_BASE_DOMAIN ?? "localhost",
    workspaceUrl: env.WORKSPACE_URL ?? "http://{slug}.localhost:8080",
    firstPort: Number(env.TENANT_FIRST_PORT ?? 18200),
  };
}

/**
 * Minimum password length, the one rule for NOVI (P1.6.5): checked at sign-up before the tenant
 * exists, then written to each tenant's Odoo (`auth_password_policy.minlength`), which enforces it
 * on every later password change (reset, preferences, admin).
 */
export const MIN_PASSWORD_LENGTH = 10;

/** Countries offered at sign-up (each gets its Odoo accounting localisation; KE has a fast template). */
export const SUPPORTED_COUNTRIES = ["KE", "UG", "TZ", "RW", "NG", "GH", "ZA", "US", "GB"] as const;
