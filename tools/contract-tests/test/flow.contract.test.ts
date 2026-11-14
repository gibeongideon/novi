/**
 * P2.8 "Done when", live: the buttons of the demo sales → accounting flow work through NOVI's
 * ActionManager. Every button is taken from the real form views (as a screen would show it) and
 * run with `executeButton`; wizards open from the returned action with their own form views.
 *   quotation → Confirm → Create Invoice (wizard) → invoice → Confirm (post) → Pay (wizard) → paid
 * The records stay in the demo database as a realistic paid order (named "NOVI flow test").
 */
import {
  type ActionDescriptor,
  ActionManager,
  baseEvalContext,
  OdooRecord,
  type RecordConfig,
  type Rpc,
} from "@novi/engine";
import { type JsonRpcTransport, Orm } from "@novi/odoo-client";
import { buildSpec, type ButtonNode, type FormSchema, type ModelsInfo, parseView } from "@novi/odoo-meta";
import { beforeAll, describe, expect, it } from "vitest";

import { odooUp, session } from "./helpers.js";

describe.runIf(odooUp)("P2.8 buttons of the sales → accounting flow, live", () => {
  let t: JsonRpcTransport;
  let rpc: Rpc;
  let orm: Orm;
  let am: ActionManager;
  let userContext: Record<string, unknown>;

  beforeAll(async () => {
    t = await session("admin");
    rpc = ((model, method, call) => t.call(model, method, call)) as Rpc;
    orm = new Orm(t);
    const info = await t.getSessionInfo();
    userContext = info.user_context ?? {};
    am = new ActionManager(t, () => ({ ...baseEvalContext(info), uid: info.uid ?? 0 }));
  });

  /** A model's form view as a screen loads it, and a record config for it. */
  const form = async (
    model: string,
    viewId: number | false = false,
    context: Record<string, unknown> = {},
  ): Promise<RecordConfig> => {
    const views = await t.call<{ views: { form: { arch: string } }; models: ModelsInfo }>(
      model,
      "get_views",
      {
        kwargs: { views: [[viewId, "form"]], options: {}, context: { ...userContext, ...context } },
      },
    );
    const schema = parseView({ arch: views.views.form.arch, model, models: views.models }) as FormSchema;
    return {
      model,
      models: views.models,
      spec: buildSpec(schema),
      schema,
      context: { ...userContext, ...context },
      evalContext: { uid: 2 },
    };
  };

  /** The visible button of a record's view, by method/action name or by its label. */
  const button = (record: OdooRecord, match: (b: ButtonNode) => boolean): ButtonNode => {
    const found: ButtonNode[] = [];
    const walk = (n: unknown): void => {
      if (!n || typeof n !== "object") return;
      if (Array.isArray(n)) return n.forEach(walk);
      const node = n as Record<string, unknown>;
      if (node.type === "button" && match(node as unknown as ButtonNode))
        found.push(node as unknown as ButtonNode);
      for (const [k, v] of Object.entries(node)) if (k !== "fields" && k !== "views") walk(v);
    };
    walk((record.config.schema as FormSchema).children);
    const visible = found.find((b) => !record.isInvisible(b as never));
    if (!visible) throw new Error(`no visible button among ${found.map((b) => b.name).join(", ") || "none"}`);
    return visible;
  };

  /** Opens a wizard (or record) the way the screen would from a window action. */
  const open = async (d: ActionDescriptor) => {
    expect(d.kind).toBe("window");
    const a = (d as Extract<ActionDescriptor, { kind: "window" }>).action;
    const view = a.views.find(([, type]) => type === "form")?.[0] ?? false;
    const config = await form(a.model, view, a.context);
    return a.resId ? OdooRecord.load(rpc, config, a.resId) : OdooRecord.createWithDefaults(rpc, config);
  };

  it("confirms, invoices, posts and pays a quotation through the views' own buttons", async () => {
    const [partner] = await orm.call<{ id: number; display_name: string }[]>(
      "res.partner",
      "search_read",
      undefined,
      {
        domain: [["customer_rank", ">", 0]],
        fields: ["display_name"],
        limit: 1,
      },
    );
    const [product] = await orm.call<{ id: number; display_name: string }[]>(
      "product.product",
      "search_read",
      undefined,
      {
        domain: [
          ["sale_ok", "=", true],
          ["type", "=", "service"],
          ["list_price", ">", 0],
          ["invoice_policy", "=", "order"],
        ],
        fields: ["display_name"],
        limit: 1,
      },
    );
    expect(product, "needs a service product invoiced on order in the demo data").toBeDefined();

    // a quotation, as the Sales screen creates it
    const order = await OdooRecord.createWithDefaults(rpc, await form("sale.order"));
    order.update({ partner_id: partner, client_order_ref: "NOVI flow test" });
    const line = await order.list("order_line").addWithDefaults();
    line.update({ product_id: product });
    await order.idle();
    expect(await order.save()).toBe(true);

    // Confirm
    await am.executeButton(
      order,
      button(order, (b) => b.name === "action_confirm"),
    );
    expect(order.values.state).toBe("sale");

    // Create Invoice → wizard → Create Draft
    const toWizard = await am.executeButton(
      order,
      button(order, (b) => b.kind === "action" && /invoice/i.test(b.string ?? "")),
    );
    const wizard = await open(toWizard);
    expect(wizard.config.model).toBe("sale.advance.payment.inv");
    const created = await am.executeButton(
      wizard,
      button(wizard, (b) => b.name === "create_invoices"),
    );
    await order.reload();
    const invoiceId =
      created.kind === "window" && created.action.resId
        ? created.action.resId
        : (order.list("invoice_ids").ids[0] as number);
    expect(invoiceId).toBeGreaterThan(0);

    // the invoice: Confirm (post)
    const invoice = await OdooRecord.load(rpc, await form("account.move"), invoiceId);
    expect(invoice.values.state).toBe("draft");
    await am.executeButton(
      invoice,
      button(invoice, (b) => b.name === "action_post"),
    );
    expect(invoice.values.state).toBe("posted");

    // Pay → wizard → Create Payment
    const toPayment = await am.executeButton(
      invoice,
      button(invoice, (b) => b.name === "action_register_payment"),
    );
    const pay = await open(toPayment);
    expect(pay.config.model).toBe("account.payment.register");
    await am.executeButton(
      pay,
      button(pay, (b) => b.name === "action_create_payments"),
    );
    await invoice.reload();
    expect(["paid", "in_payment"]).toContain(invoice.values.payment_state);
  });

  it("resolves every kind of action into something the screen can show", async () => {
    const report = await am.resolve("sale.action_report_saleorder", {
      activeModel: "sale.order",
      activeIds: [1],
    });
    expect(report).toMatchObject({ kind: "report", url: "/report/pdf/sale.report_saleorder/1" });
    const pdf = await fetch(
      `${process.env.ODOO_URL ?? "http://localhost:18069"}${(report as { url: string }).url}`,
      {
        headers: { Cookie: `session_id=${t.sessionId}` },
      },
    );
    expect(pdf.headers.get("content-type")).toMatch(/pdf/);

    const windowAction = await am.resolve("sale.action_quotations_with_onboarding");
    expect(windowAction).toMatchObject({
      kind: "window",
      action: { model: "sale.order", target: "current" },
    });

    const client = await am.resolve("mail.action_discuss");
    expect(client).toMatchObject({
      kind: "client",
      tag: "mail.action_discuss",
      fallbackUrl: expect.stringMatching(/^\/odoo\/action-\d+$/),
    });

    expect(
      await am.resolve({ type: "ir.actions.act_url", url: "https://www.example.com", target: "new" }),
    ).toEqual({ kind: "url", url: "https://www.example.com", target: "new" });
    expect(await am.resolve({ type: "ir.actions.act_window_close" })).toEqual({
      kind: "close",
      infos: undefined,
    });
    expect(await am.resolve(false)).toEqual({ kind: "none" });
  });
});
