import { describe, expect, it } from "vitest";

import { parseCookies, serializeCookie } from "../src/auth/cookies.js";
import { PendingLogins } from "../src/auth/pending.js";

describe("pending 2FA logins", () => {
  it("are single use and expire", () => {
    let now = 0;
    const p = new PendingLogins<string>(1000, 10, () => now);
    const a = p.add("alice");
    expect(p.take(a)).toBe("alice");
    expect(p.take(a)).toBeUndefined(); // single use
    const b = p.add("bob");
    now = 1001;
    expect(p.take(b)).toBeUndefined(); // expired
  });

  it("challenge ids are unguessable and the store is capped", () => {
    const p = new PendingLogins<number>(60_000, 3);
    const ids = [1, 2, 3, 4].map((n) => p.add(n));
    expect(new Set(ids).size).toBe(4);
    expect(ids[0]!.length).toBeGreaterThanOrEqual(32);
    expect(p.size).toBe(3);
    expect(p.take(ids[0]!)).toBeUndefined(); // oldest evicted
  });
});

describe("cookies", () => {
  it("parses a Cookie header", () => {
    expect(parseCookies("session_id=abc; td_id=x%3Dy")).toEqual({ session_id: "abc", td_id: "x=y" });
    expect(parseCookies(undefined)).toEqual({});
  });
  it("serialises HttpOnly, SameSite=Lax, Secure only over https", () => {
    expect(serializeCookie("session_id", "abc", { maxAge: 60, secure: false })).toBe(
      "session_id=abc; Path=/; HttpOnly; SameSite=Lax; Max-Age=60",
    );
    expect(serializeCookie("td_id", "k", { maxAge: 60, secure: true })).toContain("; Secure");
  });
});
