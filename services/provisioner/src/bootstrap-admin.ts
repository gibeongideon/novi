/**
 * P0.11 step "bootstrap admin": turns a freshly initialised tenant DB into the customer's own
 * account using stock ORM calls only (company name/country/currency, admin name/login/password).
 * Usage: TENANT_ADMIN_PASSWORD=… tsx src/bootstrap-admin.ts <url> <db> <company> <country-code> <admin-email>
 */
import { JsonRpcTransport, Orm } from "@novi/odoo-client";

const [url, db, company, countryCode, email] = process.argv.slice(2);
// from the environment, never argv (visible to every user via ps)
const password = process.env.TENANT_ADMIN_PASSWORD;
if (!url || !db || !company || !countryCode || !email || !password) {
  console.error(
    "usage: bootstrap-admin.ts <url> <db> <company> <country-code> <admin-email> <admin-password>",
  );
  process.exit(2);
}

const t = new JsonRpcTransport({ baseUrl: url, db });
// A fresh database (no demo data) has admin / admin
await t.authenticate("admin", "admin");
const orm = new Orm(t);

const [country] = await orm.call<{ id: number; currency_id: [number, string] | false }[]>(
  "res.country",
  "search_read",
  undefined,
  { domain: [["code", "=", countryCode.toUpperCase()]], fields: ["id", "currency_id"], limit: 1 },
);
if (!country) throw new Error(`Unknown country code ${countryCode}`);

const companyVals: Record<string, unknown> = { name: company, country_id: country.id, email };
if (country.currency_id) {
  // activate the currency first (inactive currencies cannot be assigned)
  await orm.call("res.currency", "write", [country.currency_id[0]], { vals: { active: true } });
  companyVals.currency_id = country.currency_id[0];
}
await orm.call("res.company", "write", [1], { vals: companyVals });

const session = await t.getSessionInfo();
await orm.call("res.users", "write", [session.uid as number], {
  vals: { name: `${company} Admin`, login: email, email, password },
});

// prove the new credentials work
const check = new JsonRpcTransport({ baseUrl: url, db });
const info = await check.authenticate(email, password);
console.log(JSON.stringify({ ok: true, uid: info.uid, company, country: countryCode, login: email }));
