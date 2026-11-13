/**
 * P2.6 "Done when", live: choosing a product on a quotation line in NOVI gives the same price,
 * taxes, description and totals as Odoo itself. NOVI's flow (real form view + spec, defaults,
 * customer, new line with defaults, product chosen, onchanges) is compared with the same order
 * created directly through Odoo's ORM, and with what NOVI's save stores. Data removed afterwards.
 */
import { OdooRecord, type Rpc } from "@novi/engine";
import { type JsonRpcTransport, Orm } from "@novi/odoo-client";
import { buildSpec, type FormSchema, type ModelsInfo, parseView } from "@novi/odoo-meta";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { odooUp, session } from "./helpers.js";

type Line = {
  price_unit: number;
  tax_ids: number[];
  name: string;
  product_uom_qty: number;
  price_subtotal: number;
};

describe.runIf(odooUp)("P2.6 onchange, live: a quotation line's product", () => {
  let t: JsonRpcTransport;
  let rpc: Rpc;
  let orm: Orm;
  const orders: number[] = [];

  beforeAll(async () => {
    t = await session("admin");
    rpc = ((model, method, call) => t.call(model, method, call)) as Rpc;
    orm = new Orm(t);
  });
  afterAll(async () => {
    if (orders.length) await orm.call("sale.order", "unlink", orders);
  });

  it("updates price, taxes and totals exactly like Odoo", async () => {
    const views = await t.call<{ views: { form: { arch: string } }; models: ModelsInfo }>(
      "sale.order",
      "get_views",
      {
        kwargs: { views: [[false, "form"]], options: {} },
      },
    );
    const schema = parseView({
      arch: views.views.form.arch,
      model: "sale.order",
      models: views.models,
    }) as FormSchema;
    const info = await t.getSessionInfo();
    const config = {
      model: "sale.order",
      models: views.models,
      spec: buildSpec(schema),
      schema,
      context: info.user_context ?? {},
      evalContext: { uid: info.uid ?? 0 },
    };

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
          ["taxes_id", "!=", false],
          ["list_price", ">", 0],
        ],
        fields: ["display_name"],
        limit: 1,
      },
    );

    // NOVI: new quotation with defaults → customer → new line with defaults → product
    const order = await OdooRecord.createWithDefaults(rpc, config);
    expect(order.values.state).toBe("draft");
    order.update({ partner_id: partner });
    await order.idle();
    const line = await order.list("order_line").addWithDefaults();
    line.update({ product_id: product });
    await order.idle();
    const shown = {
      price_unit: line.values.price_unit as number,
      tax_ids: (line.list("tax_ids").ids as number[]).sort((a, b) => a - b),
      name: line.values.name as string,
      product_uom_qty: line.values.product_uom_qty as number,
      price_subtotal: line.values.price_subtotal as number,
    };
    // the form shows totals through Odoo's tax-totals field (amount_total isn't on it)
    const totals = order.values.tax_totals as { total_amount_currency?: number; total_amount?: number };
    const shownTotal =
      (order.values.amount_total as number | undefined) ??
      totals.total_amount_currency ??
      totals.total_amount;
    expect(shown.price_unit).toBeGreaterThan(0);
    expect(shown.tax_ids.length).toBeGreaterThan(0);

    // Odoo itself: the same order created directly
    // (create through call_kw needs positional values; web_save creates the same way server-side)
    const [direct] = await orm.call<{ id: number }[]>("sale.order", "web_save", [], {
      vals: { partner_id: partner!.id, order_line: [[0, 0, { product_id: product!.id }]] },
      specification: {},
    });
    const directId = direct!.id;
    orders.push(directId);
    const readOrder = async (id: number) => {
      const [o] = await orm.call<{ amount_total: number; order_line: Line[] }[]>(
        "sale.order",
        "web_read",
        [id],
        {
          specification: {
            amount_total: {},
            order_line: {
              fields: { price_unit: {}, tax_ids: {}, name: {}, product_uom_qty: {}, price_subtotal: {} },
            },
          },
        },
      );
      const l = o!.order_line[0]!;
      return {
        total: o!.amount_total,
        line: { ...l, id: undefined, tax_ids: [...l.tax_ids].sort((a, b) => a - b) },
      };
    };
    const odoo = await readOrder(directId);
    expect({ ...shown, id: undefined }).toEqual(odoo.line);
    expect(shownTotal).toBe(odoo.total);

    // and NOVI's save stores what it showed
    expect(await order.save()).toBe(true);
    orders.push(order.id!);
    const saved = await readOrder(order.id!);
    expect(saved.line).toEqual(odoo.line);
    expect(saved.total).toBe(shownTotal);
  });
});
