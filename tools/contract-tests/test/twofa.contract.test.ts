import { JsonRpcTransport, TwoFactorRequiredError } from "@novi/odoo-client";
import { describe, expect, it } from "vitest";

import { ODOO_DB, ODOO_URL, odooUp, totp, user } from "./helpers.js";

/** P0.10 spike: 2FA login through stock Odoo routes only (authenticate → /web/login/totp). */
describe.runIf(odooUp)("P0.10 2FA relay", () => {
  it("logs a TOTP user in without any Odoo changes", async () => {
    const u = user("twofa");
    const t = new JsonRpcTransport({ baseUrl: ODOO_URL, db: ODOO_DB });
    const started = Date.now();
    await expect(t.authenticate(u.login, u.password)).rejects.toBeInstanceOf(TwoFactorRequiredError);
    const info = await t.completeTwoFactor(await totp(u.totp_secret!));
    expect(info.uid).toBe(u.id);
    // the finalised session can now use the ORM like any other
    const count = await t.call<number>("res.partner", "search_count", { kwargs: { domain: [] } });
    expect(count).toBeGreaterThan(0);
    console.log(`2FA relay login took ${Date.now() - started} ms`);
  });

  it("rejects a wrong code", async () => {
    const u = user("twofa");
    const t = new JsonRpcTransport({ baseUrl: ODOO_URL, db: ODOO_DB });
    await t.authenticate(u.login, u.password).catch(() => undefined);
    await expect(t.completeTwoFactor("000000")).rejects.toThrow(/verification failed/i);
  });
});
