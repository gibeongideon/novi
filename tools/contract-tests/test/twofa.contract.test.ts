import { JsonRpcTransport, TwoFactorRequiredError } from "@novi/odoo-client";
import { describe, expect, it } from "vitest";

import { freshTotp, ODOO_DB, ODOO_URL, odooUp, user } from "./helpers.js";

/** P0.10: 2FA login through stock Odoo routes only (authenticate → /web/login/totp). */
describe.runIf(odooUp)("P0.10 2FA relay", () => {
  const login = () => {
    const u = user("twofa");
    const t = new JsonRpcTransport({ baseUrl: ODOO_URL, db: ODOO_DB });
    return { u, t, pre: t.authenticate(u.login, u.password) };
  };

  it("logs a TOTP user in without any Odoo changes", async () => {
    const { u, t, pre } = login();
    await expect(pre).rejects.toBeInstanceOf(TwoFactorRequiredError);
    const info = await t.completeTwoFactor(await freshTotp(u.totp_secret!));
    expect(info.uid).toBe(u.id);
    const count = await t.call<number>("res.partner", "search_count", { kwargs: { domain: [] } });
    expect(count).toBeGreaterThan(0);
  });

  it("rejects a wrong code", async () => {
    const { t, pre } = login();
    await pre.catch(() => undefined);
    await expect(t.completeTwoFactor("000000")).rejects.toThrow(/verification failed/i);
  });

  it("P0.10.3 remembered device skips the code on the next login", async () => {
    const first = login();
    await first.pre.catch(() => undefined);
    await first.t.completeTwoFactor(await freshTotp(first.u.totp_secret!), { remember: true });
    const td = first.t.trustedDevice;
    expect(td, "Odoo should set the td_id cookie").toBeTruthy();

    // a brand-new session (e.g. next day): password, then the stored device key instead of a code
    const second = login();
    second.t.trustedDevice = td;
    await expect(second.pre).rejects.toBeInstanceOf(TwoFactorRequiredError);
    const info = await second.t.resumeTrustedDevice();
    expect(info?.uid).toBe(second.u.id);
  }, 90_000);

  it("an unknown device key does not bypass 2FA", async () => {
    const { t, pre } = login();
    t.trustedDevice = "not-a-real-device-key";
    await pre.catch(() => undefined);
    expect(await t.resumeTrustedDevice()).toBeNull();
  });
});
