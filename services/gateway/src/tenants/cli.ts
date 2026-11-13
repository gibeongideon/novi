/**
 * Manage the tenant registry from scripts (the provisioner spike calls this):
 *   tsx services/gateway/src/tenants/cli.ts add <slug> --host acme.localhost --odoo http://127.0.0.1:18169 --db tenant_acme
 *   tsx services/gateway/src/tenants/cli.ts remove <slug>
 *   tsx services/gateway/src/tenants/cli.ts list
 */
import { loadConfig } from "../config.js";
import { FileTenantRegistry } from "./registry.js";

const [cmd, slug, ...rest] = process.argv.slice(2);
const opt = (name: string) => {
  const i = rest.indexOf(`--${name}`);
  return i >= 0 ? rest[i + 1] : undefined;
};
const registry = new FileTenantRegistry(loadConfig().tenantsFile);

if (cmd === "add" && slug) {
  const odooUrl = opt("odoo");
  const db = opt("db");
  const hosts = rest.flatMap((v, i) => (rest[i - 1] === "--host" ? [v] : []));
  if (!odooUrl || !db || !hosts.length) throw new Error("add needs --host (repeatable), --odoo and --db");
  registry.upsert({
    slug,
    hosts,
    odooUrl,
    db,
    wsUrl: opt("ws"),
    status: "active",
    createdAt: new Date().toISOString(),
  });
  console.log(`tenant ${slug} → ${hosts.join(", ")} → ${odooUrl} (${db})`);
} else if (cmd === "remove" && slug) {
  console.log(registry.remove(slug) ? `removed ${slug}` : `no tenant ${slug}`);
} else if (cmd === "list") {
  for (const t of registry.list())
    console.log(`${t.slug.padEnd(12)} ${t.status.padEnd(9)} ${t.hosts.join(",")} → ${t.odooUrl} (${t.db})`);
} else {
  console.error(
    "usage: cli.ts add <slug> --host <h> [--host <h2>] --odoo <url> --db <db> [--ws <url>] | remove <slug> | list",
  );
  process.exit(2);
}
