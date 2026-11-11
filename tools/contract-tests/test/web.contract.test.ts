import { Orm } from "@novi/odoo-client";
import { describe, expect, it } from "vitest";
import WebSocket from "ws";

import { ODOO_WS_URL, odooUp, session, shape } from "./helpers.js";

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
  it("websocket subscription receives discuss.channel/new_message for a posted message", async () => {
    const t = await session();
    const orm = new Orm(t);
    const [channel] = await orm.call<{ id: number }[]>("discuss.channel", "search_read", undefined, {
      domain: [["channel_type", "=", "channel"]],
      fields: ["id"],
      limit: 1,
    });
    // Odoo downgrades the socket to a public session unless Origin's host equals the Host header
    const origin = ODOO_WS_URL.replace(/^ws/, "http");
    const ws = new WebSocket(`${ODOO_WS_URL}/websocket?version=saas-19.5-1`, {
      headers: { Cookie: `session_id=${t.sessionId}`, Origin: origin },
    });
    const received: { id: number; message: { type: string; payload: unknown } }[] = [];
    ws.on("message", (data) => received.push(...(JSON.parse(String(data)) as typeof received)));
    await new Promise<void>((resolve, reject) => {
      ws.once("open", () => resolve());
      ws.once("error", reject);
    });
    // Odoo 20 requires check_outdated in the subscribe payload
    ws.send(
      JSON.stringify({ event_name: "subscribe", data: { channels: [], last: 0, check_outdated: false } }),
    );
    await new Promise((r) => setTimeout(r, 1000));
    received.length = 0; // drop replayed history

    const body = `NOVI bus test ${Date.now()}`;
    await t.route("/mail/message/post", {
      thread_model: "discuss.channel",
      thread_id: channel!.id,
      post_data: { body, message_type: "comment", subtype_xmlid: "mail.mt_comment" },
    });
    const deadline = Date.now() + 15_000;
    const hit = () => received.find((n) => n.message.type === "discuss.channel/new_message");
    while (!hit() && Date.now() < deadline) await new Promise((r) => setTimeout(r, 200));
    ws.close();
    expect(hit()).toBeTruthy();
    expect(JSON.stringify(hit())).toContain("NOVI bus test");
  });
});
