import { buildServer } from "@novi/gateway";
import { afterAll, describe, expect, it } from "vitest";

import { freshTotp, ODOO_DB, ODOO_URL, odooUp, user } from "./helpers.js";

/** P1.1 first slice: the gateway's auth bridge against real Odoo (same-domain mode). */
describe.runIf(odooUp)("P1.6 gateway auth bridge", () => {
  const app = buildServer({ port: 0, odooUrl: ODOO_URL, odooDb: ODOO_DB, pendingTtlMs: 60_000 });
  afterAll(() => app.close());

  const login = (login: string, password: string, cookie?: string) =>
    app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { login, password },
      headers: {
        "user-agent": "Mozilla/5.0 (X11; Linux x86_64) Chrome/130.0 Safari/537.36",
        ...(cookie ? { cookie } : {}),
      },
    });
  const cookiesOf = (res: Awaited<ReturnType<typeof login>>) =>
    ([] as string[]).concat(res.headers["set-cookie"] ?? []);
  const sessionWorks = async (setCookies: string[]) => {
    const sid = setCookies.find((c) => c.startsWith("session_id="))!.split(";")[0]!;
    const r = await fetch(`${ODOO_URL}/web/session/get_session_info`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: sid },
      body: JSON.stringify({ jsonrpc: "2.0", method: "call", params: {} }),
    });
    return ((await r.json()) as { result?: { uid?: number } }).result?.uid;
  };

  it("password login hands the browser a working Odoo session cookie", async () => {
    const res = await login("admin", user("admin").password);
    expect(res.json()).toEqual({ status: "ok" });
    const cookies = cookiesOf(res);
    expect(cookies[0]).toMatch(/^session_id=.+; Path=\/; HttpOnly; SameSite=Lax/);
    expect(await sessionWorks(cookies)).toBe(user("admin").id);
  });

  it("wrong password → 401 with Odoo's message", async () => {
    const res = await login("admin", "nope");
    expect(res.statusCode).toBe(401);
    expect(res.json().reason).toBe("credentials");
    expect(res.json().message).toMatch(/access denied/i); // Odoo's text; the login screen shows a friendlier NOVI message
  });

  it("2FA: password → challenge → code → session; remembered device skips the code next time", async () => {
    const u = user("twofa");
    const first = await login(u.login, u.password);
    expect(first.json().status).toBe("twoFactor");
    const ok = await app.inject({
      method: "POST",
      url: "/api/auth/totp",
      payload: { challenge: first.json().challenge, code: await freshTotp(u.totp_secret!), remember: true },
      headers: { "user-agent": "Mozilla/5.0 (X11; Linux x86_64) Chrome/130.0 Safari/537.36" },
    });
    expect(ok.json()).toEqual({ status: "ok" });
    const cookies = cookiesOf(ok);
    expect(await sessionWorks(cookies)).toBe(u.id);
    const td = cookies.find((c) => c.startsWith("td_id="))!.split(";")[0]!;

    const again = await login(u.login, u.password, td);
    expect(again.json()).toEqual({ status: "ok" }); // no code asked
    expect(await sessionWorks(cookiesOf(again))).toBe(u.id);
  }, 90_000);

  it("a challenge is single use and a wrong code is refused", async () => {
    const u = user("twofa");
    const first = await login(u.login, u.password);
    const challenge = first.json().challenge;
    const bad = await app.inject({
      method: "POST",
      url: "/api/auth/totp",
      payload: { challenge, code: "000000" },
    });
    expect(bad.statusCode).toBe(401);
    expect(bad.json().reason).toBe("code");
    const reuse = await app.inject({
      method: "POST",
      url: "/api/auth/totp",
      payload: { challenge, code: "123456" },
    });
    expect(reuse.json().reason).toBe("expired");
  });
});
