import { describe, expect, it } from "vitest";

import { buildServer } from "../src/index.js";

describe("gateway health", () => {
  it("responds on /healthz", async () => {
    const app = buildServer();
    const res = await app.inject({ method: "GET", url: "/healthz" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok" });
    await app.close();
  });
});
