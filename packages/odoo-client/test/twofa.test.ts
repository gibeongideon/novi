import { describe, expect, it, vi } from "vitest";

import { AccessDenied, JsonRpcTransport, TwoFactorRequiredError } from "../src/index.js";

const rpc = (result: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result }), {
    headers: { "Content-Type": "application/json", ...headers },
  });

describe("2FA relay (completeTwoFactor)", () => {
  it("reuses the pre-login session, posts csrf + code to /web/login/totp, then confirms uid", async () => {
    const seen: { url: string; init: RequestInit }[] = [];
    const fetch = vi.fn(async (u: string | URL | Request, init: RequestInit = {}) => {
      const url = String(u);
      seen.push({ url, init });
      if (url.endsWith("/web/session/authenticate"))
        return rpc({ uid: null }, { "Set-Cookie": "session_id=pre; Path=/" });
      if (url.endsWith("/web/login/totp") && init.method === "GET")
        return new Response('<form><input type="hidden" name="csrf_token" value="tok123"/></form>', {
          headers: { "Content-Type": "text/html" },
        });
      if (url.endsWith("/web/login/totp"))
        return new Response(null, {
          status: 303,
          headers: { Location: "/odoo", "Set-Cookie": "session_id=final; Path=/" },
        });
      return rpc({ uid: 9, user_context: { lang: "en_US" } });
    }) as unknown as typeof globalThis.fetch;

    const t = new JsonRpcTransport({ baseUrl: "http://o", db: "d", fetch });
    await expect(t.authenticate("twofa", "pw")).rejects.toBeInstanceOf(TwoFactorRequiredError);
    const info = await t.completeTwoFactor("123 456");
    expect(info.uid).toBe(9);
    expect(t.sessionId).toBe("final");

    const post = seen.find((s) => s.url.endsWith("/web/login/totp") && s.init.method === "POST")!;
    expect(String(post.init.body)).toBe("totp_token=123456&csrf_token=tok123");
    expect((post.init.headers as Record<string, string>).Cookie).toBe("session_id=pre");
  });

  it("fails clearly without a pending 2FA login", async () => {
    const fetch = vi.fn(
      async () => new Response("<html>login</html>", { status: 200 }),
    ) as unknown as typeof globalThis.fetch;
    const t = new JsonRpcTransport({ baseUrl: "http://o", fetch });
    await expect(t.completeTwoFactor("000000")).rejects.toBeInstanceOf(AccessDenied);
  });
});
