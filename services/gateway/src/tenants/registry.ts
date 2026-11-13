/**
 * Tenant registry (P1.2): which host belongs to which customer's own Odoo (D-10).
 * File-backed on purpose (Musk step 2): one gateway instance needs no database. The file is
 * re-read when it changes, so the provisioner can add tenants without restarting the gateway.
 * Move to Postgres only when several gateway instances must share it.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export interface Tenant {
  slug: string;
  /** Hostnames without port, e.g. ["acme.novi.app", "erp.acme.co.ke"]. */
  hosts: string[];
  /** The tenant's own Odoo (internal URL). */
  odooUrl: string;
  /** Websocket endpoint; defaults to odooUrl (single-process Odoo serves both). */
  wsUrl?: string;
  db: string;
  status: "active" | "suspended";
  createdAt?: string;
}

/** "Acme.Novi.App:443" → "acme.novi.app" */
export function normalizeHost(host: string | undefined): string {
  return (host ?? "").toLowerCase().replace(/:\d+$/, "").replace(/\.$/, "");
}

export class FileTenantRegistry {
  private cache: Tenant[] = [];
  private mtime = -1;

  constructor(private readonly path: string) {}

  list(): Tenant[] {
    this.reloadIfChanged();
    return this.cache;
  }

  byHost(host: string | undefined): Tenant | undefined {
    const h = normalizeHost(host);
    return this.list().find((t) => t.hosts.includes(h));
  }

  bySlug(slug: string): Tenant | undefined {
    return this.list().find((t) => t.slug === slug);
  }

  upsert(tenant: Tenant): void {
    if (!/^[a-z][a-z0-9-]{1,40}$/.test(tenant.slug)) throw new Error(`invalid tenant slug: ${tenant.slug}`);
    const hosts = tenant.hosts.map(normalizeHost);
    const clash = this.list().find((t) => t.slug !== tenant.slug && t.hosts.some((h) => hosts.includes(h)));
    if (clash) throw new Error(`host already used by tenant ${clash.slug}`);
    this.write([...this.list().filter((t) => t.slug !== tenant.slug), { ...tenant, hosts }]);
  }

  remove(slug: string): boolean {
    const before = this.list();
    const after = before.filter((t) => t.slug !== slug);
    if (after.length !== before.length) this.write(after);
    return after.length !== before.length;
  }

  private reloadIfChanged(): void {
    if (!existsSync(this.path)) {
      this.cache = [];
      this.mtime = -1;
      return;
    }
    const m = statSync(this.path).mtimeMs;
    if (m === this.mtime) return;
    this.cache = JSON.parse(readFileSync(this.path, "utf8")) as Tenant[];
    this.mtime = m;
  }

  /** Atomic write (temp file + rename), so a reader never sees half a file. */
  private write(tenants: Tenant[]): void {
    mkdirSync(dirname(this.path), { recursive: true });
    const tmp = `${this.path}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(tenants, null, 2) + "\n", { mode: 0o600 });
    renameSync(tmp, this.path);
    this.reloadIfChanged();
  }
}
