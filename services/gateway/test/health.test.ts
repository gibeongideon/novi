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
