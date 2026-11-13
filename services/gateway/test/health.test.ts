import { describe, expect, it } from "vitest";

import { buildServer } from "../src/index.js";

describe("gateway health", () => {
  it("responds on /healthz without needing a tenant", async () => {
    const app = await buildServer({
      port: 0,
      host: "127.0.0.1",
      tenantsFile: "/nonexistent.json",
      pendingTtlMs: 1000,
    });
    const res = await app.inject({ method: "GET", url: "/healthz", headers: { host: "unknown.example" } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok" });
    await app.close();
  });
});

describe("client IP (P1.6.6)", () => {
  it("believes X-Forwarded-For only from the local proxy, so clients can't pick their IP", async () => {
    const app = await buildServer({
      port: 0,
      host: "127.0.0.1",
      tenantsFile: "/nonexistent",
      pendingTtlMs: 1000,
    });
    app.get("/__ip", async (req) => req.ip);
    const ip = async (remoteAddress: string) =>
      (await app.inject({ url: "/__ip", remoteAddress, headers: { "x-forwarded-for": "1.2.3.4" } })).body;
    expect(await ip("127.0.0.1")).toBe("1.2.3.4"); // via Caddy / Vite
    expect(await ip("203.0.113.5")).toBe("203.0.113.5"); // a client sending its own header
    await app.close();
  });
});

describe("password reset link (P1.6.5)", () => {
  it("sends Odoo's emailed reset link to NOVI's own page", async () => {
    const app = await buildServer({
      port: 0,
      host: "127.0.0.1",
      tenantsFile: "/nonexistent",
      pendingTtlMs: 1000,
      defaultTenant: { slug: "t", hosts: [], odooUrl: "http://127.0.0.1:9", db: "t", status: "active" },
    });
    const res = await app.inject({ url: "/web/reset_password?db=t&token=a%2Bb" });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe("/reset-password?token=a%2Bb");
    // invitation links use the same token; Odoo's public sign-up page is never shown
    expect((await app.inject({ url: "/web/signup?token=inv" })).headers.location).toBe(
      "/reset-password?token=inv",
    );
    expect((await app.inject({ url: "/web/signup" })).headers.location).toBe("/reset-password");
    // a refused SSO sign-in comes back to NOVI's login with the reason
    expect((await app.inject({ url: "/web/login?oauth_error=3" })).headers.location).toBe("/?ssoError=3");
    await app.close();
  });
});
