import {
  AccessDenied,
  JsonRpcTransport,
  SessionExpiredError,
  TwoFactorRequiredError,
} from "@novi/odoo-client";
import { describe, expect, it } from "vitest";

import { ODOO_DB, ODOO_URL, odooUp, session, shape, user } from "./helpers.js";

describe.runIf(odooUp)("P0.7.2 auth contracts", () => {
  it("authenticate returns session info with uid and user_context", async () => {
    const t = new JsonRpcTransport({ baseUrl: ODOO_URL, db: ODOO_DB });
    const info = await t.authenticate("admin", user("admin").password);
    expect(info.uid).toBe(user("admin").id);
    expect(t.sessionId).toMatch(/.{20,}/);
    expect(info.user_context).toHaveProperty("lang");
    expect(Object.keys(shape(info) as object)).toEqual(
      expect.arrayContaining(["uid", "user_context", "db", "server_version_info"]),
    );
  });

  it("wrong password raises AccessDenied", async () => {
    const t = new JsonRpcTransport({ baseUrl: ODOO_URL, db: ODOO_DB });
    await expect(t.authenticate("admin", "wrong-password")).rejects.toBeInstanceOf(AccessDenied);
  });

  it("2FA user gets uid null → TwoFactorRequiredError", async () => {
    const u = user("twofa");
    const t = new JsonRpcTransport({ baseUrl: ODOO_URL, db: ODOO_DB });
    await expect(t.authenticate(u.login, u.password)).rejects.toBeInstanceOf(TwoFactorRequiredError);
  });

  it("get_session_info works while logged in", async () => {
    const t = await session();
    const info = await t.getSessionInfo();
    expect(info.uid).toBe(user("admin").id);
  });

  it("destroyed session → SessionExpiredError on next call", async () => {
    const t = await session();
    const sid = t.sessionId;
    await t.destroy();
    t.sessionId = sid; // replay the dead cookie
    await expect(
      t.call("res.partner", "search_count", { kwargs: { domain: [] } }, { retry: false }),
    ).rejects.toBeInstanceOf(SessionExpiredError);
  });

  it("restricted user cannot read settings (AccessError)", async () => {
    const t = await session("restricted");
    await expect(
      t.call("res.config.settings", "default_get", { kwargs: { fields_list: [] } }, { retry: false }),
    ).rejects.toThrow();
  });
});
