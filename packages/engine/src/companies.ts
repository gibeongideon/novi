/**
 * Multi-company (P1.12.2). Same mechanism as Odoo's own client, so everything stays consistent:
 * every call carries `allowed_company_ids` (first = current company), and the choice is kept in
 * Odoo's `cids` cookie ("1-3"), which Odoo's http routes (reports, "Open in Odoo") also read.
 */
import type { SessionInfo } from "@novi/odoo-client";

export interface Company {
  id: number;
  name: string;
  sequence?: number;
  parent_id?: number | false;
}

export const CIDS_COOKIE = "cids";

export function allowedCompanies(info: SessionInfo | null): Company[] {
  const uc = info?.user_companies as { allowed_companies?: Record<string, Company> } | undefined;
  return Object.values(uc?.allowed_companies ?? {}).sort(
    (a, b) => (a.sequence ?? 0) - (b.sequence ?? 0) || a.name.localeCompare(b.name),
  );
}

export function parseCids(raw: string | undefined): number[] {
  return (raw ?? "")
    .split("-")
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0);
}

/** Active companies: the saved cookie choice if still allowed, else the user's current company. */
export function activeCompanyIds(info: SessionInfo | null, cookie: string | undefined): number[] {
  const allowed = new Set(allowedCompanies(info).map((c) => c.id));
  const saved = parseCids(cookie).filter((id) => allowed.has(id));
  if (saved.length) return saved;
  const current = (info?.user_companies as { current_company?: number } | undefined)?.current_company;
  return current ? [current] : [];
}

export function readCidsCookie(): string | undefined {
  if (typeof document === "undefined") return undefined;
  return document.cookie
    .split("; ")
    .find((c) => c.startsWith(`${CIDS_COOKIE}=`))
    ?.slice(CIDS_COOKIE.length + 1);
}

export function writeCidsCookie(ids: number[]): void {
  if (typeof document === "undefined") return;
  document.cookie = `${CIDS_COOKIE}=${ids.join("-")}; path=/; max-age=31536000; SameSite=Lax`;
}
