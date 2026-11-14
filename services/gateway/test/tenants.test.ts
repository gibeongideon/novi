import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { buildServer } from "../src/index.js";
import { frameableBySameOrigin, isProxied } from "../src/proxy.js";
import { FileTenantRegistry, normalizeHost } from "../src/tenants/registry.js";

const tmpFile = () => join(mkdtempSync(join(tmpdir(), "novi-tenants-")), "tenants.json");
const acme = {
  slug: "acme",
  hosts: ["Acme.Novi.App"],
  odooUrl: "http://10.0.0.5:8069",
  db: "tenant_acme",
  status: "active" as const,
};

describe("tenant registry", () => {
  it("normalises hosts and resolves by host", () => {
    expect(normalizeHost("Acme.Novi.App:443")).toBe("acme.novi.app");
    const r = new FileTenantRegistry(tmpFile());
    r.upsert(acme);
    expect(r.byHost("acme.novi.app:8443")?.slug).toBe("acme");
    expect(r.byHost("other.novi.app")).toBeUndefined();
  });

  it("refuses a host already used by another tenant and invalid slugs", () => {
    const r = new FileTenantRegistry(tmpFile());
    r.upsert(acme);
    expect(() => r.upsert({ ...acme, slug: "evil" })).toThrow(/already used by tenant acme/);
    expect(() => r.upsert({ ...acme, slug: "Bad Slug", hosts: ["x.y"] })).toThrow(/invalid tenant slug/);
  });

  it("picks up changes written by another process (provisioner) without a restart", () => {
    const file = tmpFile();
    const gateway = new FileTenantRegistry(file);
    expect(gateway.byHost("acme.novi.app")).toBeUndefined();
    writeFileSync(file, JSON.stringify([{ ...acme, hosts: ["acme.novi.app"] }]));
    expect(gateway.byHost("acme.novi.app")?.db).toBe("tenant_acme");
  });
});

describe("routing", () => {
  it("gives NOVI its own paths, Odoo everything else, and never the database manager or legacy RPC", () => {
    for (const ok of [
      "/web/dataset/call_kw/res.partner/web_read",
      "/mail/store",
      "/discuss/channel/mark_as_read",
      "/calendar/attendee/accept",
      "/my/invoices/12?access_token=x",
      "/json/2/res.partner/search",
      "/report/pdf/x/1",
      "/odoo/action-1",
      "/websocket",
      "/auth_oauth/signin",
    ])
      expect(isProxied(ok), ok).toBe(true);
    for (const no of [
      "/web/database/manager",
      "/web/database/create",
      "/jsonrpc",
      "/xmlrpc/2/object",
      "/api/auth/login",
      "/",
      "/action/12/42",
      "/apps/3",
      "/assets/index-1.js",
      "/signup/status/x",
    ])
      expect(isProxied(no), no).toBe(false);
  });

  it("unknown hosts get 404 when there is no default tenant; suspended tenants 503", async () => {
    const file = tmpFile();
    new FileTenantRegistry(file).upsert({ ...acme, hosts: ["acme.novi.app"], status: "suspended" });
    const app = await buildServer({ port: 0, host: "127.0.0.1", tenantsFile: file, pendingTtlMs: 1000 });
    expect((await app.inject({ url: "/web/version", headers: { host: "nobody.novi.app" } })).statusCode).toBe(
      404,
    );
    expect((await app.inject({ url: "/web/version", headers: { host: "acme.novi.app" } })).statusCode).toBe(
      503,
    );
    await app.close();
  });

  it("allows TLS certificates only for active tenants and the platform host, never via the default tenant", async () => {
    const file = tmpFile();
    const reg = new FileTenantRegistry(file);
    reg.upsert({ ...acme, hosts: ["acme.novi.app"] });
    reg.upsert({ ...acme, slug: "beta", hosts: ["beta.novi.app"], db: "tenant_beta", status: "suspended" });
    const app = await buildServer({
      port: 0,
      host: "127.0.0.1",
      tenantsFile: file,
      pendingTtlMs: 1000,
      platformHosts: ["novi.app"],
      defaultTenant: { ...acme, slug: "demo", hosts: [] },
    });
    const ask = async (domain: string) =>
      (await app.inject({ url: `/api/tls/allowed?domain=${domain}` })).statusCode;
    expect(await ask("acme.novi.app")).toBe(200);
    expect(await ask("ACME.novi.app")).toBe(200);
    expect(await ask("novi.app")).toBe(200);
    expect(await ask("beta.novi.app")).toBe(404); // suspended
    expect(await ask("attacker.example")).toBe(404); // would otherwise fall back to the default tenant
    await app.close();
  });

  it("lets NOVI (same origin) embed Odoo screens while other sites still can't", () => {
    expect(frameableBySameOrigin({ "x-frame-options": "DENY", a: "1" })).toEqual({
      "x-frame-options": "SAMEORIGIN",
      a: "1",
    });
    expect(frameableBySameOrigin({ "x-frame-options": "SAMEORIGIN" })).toEqual({
      "x-frame-options": "SAMEORIGIN",
    });
    expect(frameableBySameOrigin({ b: "2" })).toEqual({ b: "2" });
  });
});
