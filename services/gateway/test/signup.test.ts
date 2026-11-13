import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

const dir = mkdtempSync(join(tmpdir(), "novi-signup-"));
process.env.SIGNUPS_DIR = join(dir, "signups");
process.env.PLATFORM_SECRET = Buffer.alloc(32, 7).toString("base64");

const { buildServer, FileTenantRegistry } = await import("../src/index.js");
const { SignupStore } = await import("@novi/provisioner");

const mail: { to: string; subject: string; text: string }[] = [];
const tenantsFile = join(dir, "tenants.json");
new FileTenantRegistry(tenantsFile).upsert({
  slug: "taken",
  hosts: ["taken.localhost"],
  odooUrl: "http://x",
  db: "x",
  status: "active",
});
const app = await buildServer(
  { port: 0, host: "127.0.0.1", tenantsFile, pendingTtlMs: 1000, platformHosts: ["localhost"] },
  { mailer: { send: async (to, subject, text) => void mail.push({ to, subject, text }) } },
);
afterAll(() => app.close());

const post = (payload: Record<string, unknown>, host = "localhost:8080", ip = "10.0.0.1") =>
  app.inject({ method: "POST", url: "/api/signup", payload, headers: { host, "x-forwarded-for": ip } });
const good = {
  company: "Kilimo Fresh Ltd",
  email: "Owner@Kilimo.test",
  password: "Strong-Pass-2026",
  country: "KE",
};

describe("sign-up (P1.3)", () => {
  let id = "";
  beforeAll(async () => {
    const res = await post(good);
    expect(res.statusCode).toBe(202);
    id = res.json().id;
  });

  it("is offered only on the platform host", async () => {
    expect(
      (await app.inject({ url: "/api/signup/config", headers: { host: "localhost:8080" } })).json().enabled,
    ).toBe(true);
    expect(
      (await app.inject({ url: "/api/signup/config", headers: { host: "taken.localhost:8080" } })).json()
        .enabled,
    ).toBe(false);
    expect((await post(good, "taken.localhost:8080", "10.0.0.9")).statusCode).toBe(404);
  });

  it("stores the sign-up with an encrypted password and emails a verification link", async () => {
    const s = new SignupStore(process.env.SIGNUPS_DIR!).get(id)!;
    expect(s).toMatchObject({ slug: "kilimofresh", email: "owner@kilimo.test", status: "verify" });
    expect(JSON.stringify(s)).not.toContain("Strong-Pass-2026");
    expect(mail[0]!.to).toBe("owner@kilimo.test");
    expect(mail[0]!.text).toContain(`http://localhost:8080/api/signup/verify?token=${s.verifyToken}`);
  });

  it("verification queues provisioning once; the status page shows no private data", async () => {
    const token = new SignupStore(process.env.SIGNUPS_DIR!).get(id)!.verifyToken!;
    const v = await app.inject({
      url: `/api/signup/verify?token=${token}`,
      headers: { host: "localhost:8080" },
    });
    expect(v.statusCode).toBe(302);
    expect(v.headers.location).toBe(`/signup/status/${id}`);
    const again = await app.inject({
      url: `/api/signup/verify?token=${token}`,
      headers: { host: "localhost:8080" },
    });
    expect(again.headers.location).toBe("/signup?invalid=1");
    const st = (await app.inject({ url: `/api/signup/${id}`, headers: { host: "localhost:8080" } })).json();
    expect(st).toEqual({ status: "queued", company: "Kilimo Fresh Ltd", slug: "kilimofresh", steps: [] });
  });

  it("validates input and refuses taken workspace names", async () => {
    expect((await post({ ...good, email: "nope" }, undefined, "10.0.0.2")).json().field).toBe("email");
    expect((await post({ ...good, password: "short" }, undefined, "10.0.0.2")).json().field).toBe("password");
    expect((await post({ ...good, country: "XX" }, undefined, "10.0.0.2")).json().field).toBe("country");
    const taken = await post({ ...good, slug: "taken" }, undefined, "10.0.0.3");
    expect(taken.statusCode).toBe(409);
    expect(taken.json().suggestion).toMatch(/^taken\d{2}$/);
    expect((await post(good, undefined, "10.0.0.3")).statusCode).toBe(409); // kilimofresh is pending
  });

  it("suggests and checks the workspace name with the server's naming rule", async () => {
    const r = (q: string) =>
      app.inject({ url: `/api/signup/slug?${q}`, headers: { host: "localhost:8080" } }).then((x) => x.json());
    expect(await r("company=Nyota%20Traders%20Ltd")).toEqual({
      slug: "nyotatraders",
      valid: true,
      available: true,
    });
    expect(await r("slug=taken")).toEqual({ slug: "taken", valid: true, available: false });
    expect((await r("slug=Bad-Name")).valid).toBe(false);
  });

  it("limits sign-ups per IP (bot protection without a captcha)", async () => {
    const codes = [];
    for (let i = 0; i < 6; i++)
      codes.push((await post({ ...good, slug: `rate${i}x` }, undefined, "10.0.0.50")).statusCode);
    expect(codes.slice(0, 5).every((c) => c === 202)).toBe(true);
    expect(codes[5]).toBe(429);
  });
});
