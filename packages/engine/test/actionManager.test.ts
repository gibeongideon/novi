import { AccessError, RedirectWarning, UserError, ValidationError } from "@novi/odoo-client";
import type { ModelsInfo } from "@novi/odoo-meta";
import { describe, expect, it } from "vitest";

import {
  ActionManager,
  type ActionTransport,
  decodeStack,
  describeError,
  encodeStack,
  InvalidRecordError,
  OdooRecord,
  type RawAction,
  type Rpc,
} from "../src/index.js";

const base = () => ({
  uid: 2,
  context: { lang: "en_US", allowed_company_ids: [1] } as never,
  allowed_company_ids: [1],
  current_company_id: 1,
});

function fakeTransport(actions: Record<string, RawAction>, buttonAnswer: unknown = false) {
  const calls: string[] = [];
  const t: ActionTransport = {
    loadAction: async (id) => {
      calls.push(`load:${id}`);
      return actions[String(id)] as never;
    },
    runAction: async (id, ctx) => {
      calls.push(`run:${id}:${JSON.stringify(ctx?.active_ids)}`);
      return actions[`after:${id}`] as never;
    },
    callButton: async (model, method, ids, ctx) => {
      calls.push(`button:${model}.${method}:${ids}:${JSON.stringify(ctx?.from_button ?? null)}`);
      return buttonAnswer as never;
    },
  };
  return { t, calls };
}

describe("ActionManager.resolve (P2.8.1–P2.8.6)", () => {
  it("opens window actions with their domain and context evaluated for the active record", async () => {
    const { t } = fakeTransport({
      "7": {
        type: "ir.actions.act_window",
        id: 7,
        name: "Orders",
        res_model: "sale.order",
        views: [
          [false, "list"],
          [3, "form"],
          [false, "search"],
        ],
        domain: "[('partner_id', '=', active_id), ('company_id', 'in', allowed_company_ids)]",
        context: "{'default_partner_id': active_id}",
        target: "new",
      },
    });
    const d = await new ActionManager(t, base).resolve(7, { activeModel: "res.partner", activeIds: [9] });
    expect(d).toEqual({
      kind: "window",
      action: {
        id: 7,
        name: "Orders",
        model: "sale.order",
        resId: undefined,
        views: [
          [false, "list"],
          [3, "form"],
        ],
        searchViewId: false,
        viewType: "list",
        domain: ["&", ["partner_id", "=", 9], ["company_id", "in", [1]]],
        context: {
          lang: "en_US",
          allowed_company_ids: [1],
          active_id: 9,
          active_ids: [9],
          active_model: "res.partner",
          default_partner_id: 9,
        },
        target: "new",
        limit: undefined,
      },
    });
  });

  it("runs server actions and resolves what they return, including notifications with a next action", async () => {
    const { t, calls } = fakeTransport({
      "5": { type: "ir.actions.server", id: 5 },
      "after:5": {
        type: "ir.actions.client",
        tag: "display_notification",
        params: {
          title: "Done",
          message: "Sent",
          type: "success",
          next: { type: "ir.actions.act_window_close" },
        },
      },
    });
    expect(await new ActionManager(t, base).resolve(5, { activeModel: "x", activeIds: [1, 2] })).toEqual({
      kind: "notification",
      title: "Done",
      message: "Sent",
      type: "success",
      sticky: false,
      next: { kind: "close", infos: undefined },
    });
    expect(calls).toContain("run:5:[1,2]");
  });

  it("turns reports, links and client actions into something to show", async () => {
    const { t } = fakeTransport({
      r: {
        type: "ir.actions.report",
        report_type: "qweb-pdf",
        report_name: "sale.report_saleorder",
        name: "Quotation",
      },
      d: {
        type: "ir.actions.report",
        report_type: "qweb-html",
        report_name: "x.summary",
        data: { period: "2026" },
        context: { active_ids: [3] },
      },
      c: { type: "ir.actions.client", id: 44, tag: "mail.action_discuss", params: { a: 1 } },
      reload: { type: "ir.actions.client", tag: "soft_reload" },
    });
    const am = new ActionManager(t, base);
    expect(await am.resolve("r", { activeModel: "sale.order", activeIds: [1, 2] })).toEqual({
      kind: "report",
      url: "/report/pdf/sale.report_saleorder/1,2",
      reportType: "qweb-pdf",
      name: "Quotation",
    });
    expect(await am.resolve("d")).toMatchObject({
      kind: "report",
      url: `/report/html/x.summary/3?options=${encodeURIComponent('{"period":"2026"}')}`,
    });
    expect(await am.resolve("c")).toEqual({
      kind: "client",
      tag: "mail.action_discuss",
      params: { a: 1 },
      fallbackUrl: "/odoo/action-44",
    });
    expect(await am.resolve("reload")).toEqual({ kind: "reload" });
    expect(await am.resolve({ type: "ir.actions.act_url", url: "/web/content/1", target: "self" })).toEqual({
      kind: "url",
      url: "/web/content/1",
      target: "self",
    });
    await expect(am.resolve({ type: "ir.actions.unknown" })).rejects.toThrow(/Unknown action type/);
  });
});

describe("ActionManager.executeButton (P2.8.7)", () => {
  const models = {
    "x.order": { fields: { name: { type: "char", required: true }, state: { type: "selection" } } },
  } as unknown as ModelsInfo;
  const record = (rpcCalls: string[]) => {
    const rpc: Rpc = async (_m, method) => {
      rpcCalls.push(method);
      return (
        method === "web_read"
          ? [{ id: 1, name: "SO1", state: "sale" }]
          : [{ id: 1, name: "SO1", state: "draft" }]
      ) as never;
    };
    return new OdooRecord(
      rpc,
      { model: "x.order", models, spec: { name: {}, state: {} } },
      { id: 1, name: "SO1", state: "draft" },
    );
  };

  it("saves first, calls the method with the button's context, then reloads the record", async () => {
    const rpcCalls: string[] = [];
    const r = record(rpcCalls);
    r.update({ name: "SO1b" });
    const { t, calls } = fakeTransport({}, false);
    const d = await new ActionManager(t, base).executeButton(r, {
      type: "button",
      kind: "object",
      name: "action_confirm",
      context: "{'from_button': name}",
    });
    expect(d).toEqual({ kind: "none" });
    expect(rpcCalls).toEqual(["web_save", "web_read"]);
    expect(calls).toEqual(['button:x.order.action_confirm:1:"SO1"']);
    expect(r.values.state).toBe("sale");
  });

  it("opens action buttons for the record and doesn't reload when a screen opens", async () => {
    const rpcCalls: string[] = [];
    const { t, calls } = fakeTransport({
      "12": {
        type: "ir.actions.act_window",
        res_model: "x.wizard",
        views: [[false, "form"]],
        target: "current",
      },
    });
    const d = await new ActionManager(t, base).executeButton(record(rpcCalls), {
      type: "button",
      kind: "action",
      name: "12",
    });
    expect(d).toMatchObject({
      kind: "window",
      action: { model: "x.wizard", context: { active_id: 1, active_model: "x.order" } },
    });
    expect(calls).toEqual(["load:12"]);
    expect(rpcCalls).toEqual([]); // not dirty: no save; a screen opened: no reload
  });

  it("handles dialog buttons and refuses to run on an invalid record", async () => {
    const { t, calls } = fakeTransport({});
    const am = new ActionManager(t, base);
    const r = record([]);
    expect(await am.executeButton(r, { type: "button", special: "cancel" })).toEqual({ kind: "close" });
    r.update({ name: "" });
    await expect(am.executeButton(r, { type: "button", kind: "object", name: "x" })).rejects.toThrow(
      InvalidRecordError,
    );
    expect(calls).toEqual([]);
  });
});

describe("errors and the action stack (P2.8.8, P2.8.9)", () => {
  it("describes Odoo's errors for the dialog, with RedirectWarning's button", () => {
    const redirect = new RedirectWarning("Configure a journal", {
      data: {
        name: "odoo.exceptions.RedirectWarning",
        message: "Configure a journal",
        arguments: ["Configure a journal", 77, "Go to journals", { x: 1 }],
      },
    });
    expect(describeError(redirect)).toEqual({
      kind: "user",
      message: "Configure a journal",
      redirect: { action: 77, buttonText: "Go to journals", context: { x: 1 } },
    });
    expect(describeError(new ValidationError("Bad VAT")).kind).toBe("validation");
    expect(describeError(new AccessError("No rights")).kind).toBe("access");
    expect(describeError(new UserError("Nope"))).toEqual({ kind: "user", message: "Nope" });
    expect(describeError(new InvalidRecordError(["name"]))).toEqual({ kind: "invalid", message: "name" });
    expect(describeError(new Error("boom"))).toEqual({ kind: "internal", message: "boom" });
  });

  it("encodes the action stack in the URL and reads it back", () => {
    const stack = [
      { action: 12, resId: 42 },
      { action: "sale.action_orders" },
      { action: 30, resId: "new" as const },
    ];
    expect(encodeStack(stack)).toBe("/action/12/42/action/sale.action_orders/action/30/new");
    expect(decodeStack(encodeStack(stack))).toEqual(stack);
    expect(decodeStack("/action/5/junk/action/6")).toEqual([{ action: 5 }, { action: 6 }]);
  });
});
