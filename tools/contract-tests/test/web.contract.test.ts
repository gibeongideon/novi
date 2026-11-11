import { Orm } from "@novi/odoo-client";
import { describe, expect, it } from "vitest";
import WebSocket from "ws";

import { ODOO_URL, odooUp, session, shape } from "./helpers.js";

describe.runIf(odooUp)("P0.7.5 navigation contracts", () => {
  it("load_menus returns a root with children and app entries", async () => {
    const t = await session();
    const menus = (await t.loadMenus()) as Record<string, { name?: string; children?: number[] }>;
    expect(menus.root?.children?.length).toBeGreaterThan(3);
    const names = Object.values(menus).map((m) => m.name);
    expect(names).toEqual(expect.arrayContaining(["Sales", "CRM", "Inventory", "Employees"]));
  });

  it("/web/action/load resolves an xml id to an act_window", async () => {
    const t = await session();
    const action = await t.loadAction<Record<string, unknown>>("sale.action_orders");
    expect(action).toMatchObject({ type: "ir.actions.act_window", res_model: "sale.order" });
    expect(Object.keys(action)).toEqual(expect.arrayContaining(["views", "domain", "context", "id"]));
  });

  it("/web/action/load_breadcrumbs answers for a record path", async () => {
    const t = await session();
    const action = await t.loadAction<{ id: number }>("sale.action_orders");
    const crumbs = await t.loadBreadcrumbs<unknown[]>([{ action: action.id, model: "sale.order" }]);
    expect(Array.isArray(crumbs)).toBe(true);
  });

  it("translations route returns lang parameters and modules", async () => {
    const t = await session();
    const tr = await t.translations<Record<string, unknown>>("en_US");
    expect(tr).toHaveProperty("lang_parameters");
  });
});

describe.runIf(odooUp)("P0.7.6 file contracts", () => {
  it("/web/image serves a partner avatar", async () => {
    const t = await session();
    const res = await t.http.send({ url: "/web/image/res.partner/3/avatar_128", method: "GET", retry: true });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/^image\//);
  });

  it("/report/pdf renders a quotation PDF", async () => {
    const t = await session();
    const orm = new Orm(t);
    const { records } = await orm.webSearchRead("sale.order", { specification: { id: {} }, limit: 1 });
    const res = await t.http.send({
      url: `/report/pdf/sale.report_saleorder/${records[0]!.id}`,
      method: "GET",
      retry: false,
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/pdf");
  });
});

describe.runIf(odooUp)("P0.7.7 mail contracts", () => {
  it("/mail/message/post logs a note and /mail/store returns the thread", async () => {
    const t = await session();
    const posted = await t.route<Record<string, unknown>>("/mail/message/post", {
      thread_model: "res.partner",
      thread_id: 3,
      post_data: { body: "NOVI contract note", message_type: "comment", subtype_xmlid: "mail.mt_note" },
    });
    expect(posted).toBeTruthy();
    const store = await t.route<Record<string, unknown>>("/mail/store", {
      fetch_params: [
        [
          "mail.thread",
          { thread_model: "res.partner", thread_id: 3, request_list: ["followers", "attachments"] },
        ],
      ],
    });
    expect(shape(store, 1)).toBeTypeOf("object");
  });
});

describe.runIf(odooUp)("P0.7.8 bus contracts", () => {
  it("websocket accepts a subscription and pushes notifications for a new message", async () => {
    const t = await session();
    const wsUrl =
      ODOO_URL.replace(/^http/, "ws").replace(/:8069\b/, ":8072") + "/websocket?version=saas-19.5-1";
    const ws = new WebSocket(wsUrl, { headers: { Cookie: `session_id=${t.sessionId}`, Origin: ODOO_URL } });
    const received: unknown[] = [];
    await new Promise<void>((resolve, reject) => {
      ws.once("open", () => resolve());
      ws.once("error", reject);
    });
    ws.on("message", (data) => received.push(...(JSON.parse(String(data)) as unknown[])));
    ws.send(JSON.stringify({ event_name: "subscribe", data: { channels: [], last: 0 } }));
    await new Promise((r) => setTimeout(r, 500));

    // A message on a partner the admin follows produces a bus notification for the admin's partner
    const partnerId = 3;
    await t
      .route("/mail/thread/subscribe", { res_model: "res.partner", res_id: partnerId, partner_ids: [] })
      .catch(() => undefined);
    await t.route("/mail/message/post", {
      thread_model: "res.partner",
      thread_id: partnerId,
      post_data: { body: "NOVI bus test", message_type: "comment", subtype_xmlid: "mail.mt_comment" },
    });
    const deadline = Date.now() + 15_000;
    while (!received.length && Date.now() < deadline) await new Promise((r) => setTimeout(r, 200));
    ws.close();
    expect(received.length).toBeGreaterThan(0);
    expect(received[0]).toHaveProperty("message");
  });
});
