import type { FormSchema, ModelsInfo } from "@novi/odoo-meta";
import { describe, expect, it } from "vitest";

import { OdooRecord, type OnchangeWarning, type Rpc } from "../src/index.js";

const models = {
  "x.order": {
    fields: {
      name: { type: "char" },
      partner_id: { type: "many2one", relation: "x.partner" },
      pricelist_id: { type: "many2one", relation: "x.pricelist" },
      note: { type: "text" },
      amount_total: { type: "monetary", readonly: true },
      line_ids: { type: "one2many", relation: "x.line", relation_field: "order_id" },
    },
  },
  "x.line": {
    fields: {
      product_id: { type: "many2one", relation: "x.product" },
      price_unit: { type: "float" },
      qty: { type: "float" },
      tax_ids: { type: "many2many", relation: "x.tax" },
      price_subtotal: { type: "monetary", readonly: true },
    },
  },
} as unknown as ModelsInfo;

const lineList = {
  viewType: "list",
  model: "x.line",
  fields: models["x.line"]!.fields,
  access: {},
  columns: [
    { type: "field", name: "product_id", onChange: true },
    { type: "field", name: "price_unit" },
    { type: "field", name: "qty", onChange: true },
    { type: "field", name: "tax_ids" },
    { type: "field", name: "price_subtotal" },
  ],
  headerButtons: [],
  groupRows: {},
};
const schema = {
  viewType: "form",
  model: "x.order",
  fields: models["x.order"]!.fields,
  access: {},
  children: [
    { type: "field", name: "name" },
    { type: "field", name: "partner_id", onChange: true, context: "{'show_address': 1}" },
    { type: "field", name: "pricelist_id" },
    { type: "field", name: "note" },
    { type: "field", name: "amount_total" },
    { type: "field", name: "line_ids", onChange: true, views: { list: lineList } },
  ],
} as unknown as FormSchema;
const spec = {
  name: {},
  partner_id: { fields: { display_name: {} } },
  pricelist_id: { fields: { display_name: {} } },
  note: {},
  amount_total: {},
  line_ids: {
    fields: {
      product_id: { fields: { display_name: {} } },
      price_unit: {},
      qty: {},
      tax_ids: { fields: { display_name: {} } },
      price_subtotal: {},
    },
  },
};

type Call = { model: string; method: string; ids?: number[]; kwargs?: Record<string, unknown> };
/** A fake Odoo whose answers can be held back to create races. */
function fakeOdoo(answer: (c: Call) => unknown) {
  const calls: Call[] = [];
  const held: (() => void)[] = [];
  let hold = false;
  const rpc: Rpc = (model, method, call = {}) => {
    const c = { model, method, ...call, kwargs: structuredClone(call.kwargs) };
    calls.push(c);
    const result = answer(c);
    if (!hold) return Promise.resolve(result as never);
    return new Promise((resolve) => held.push(() => resolve(result as never)));
  };
  return {
    rpc,
    calls,
    holdAnswers: () => (hold = true),
    release: () => {
      hold = false;
      held.splice(0).forEach((r) => r());
    },
  };
}
const config = (rpc: Rpc, onWarning?: (w: OnchangeWarning) => void) => ({
  model: "x.order",
  models,
  spec,
  schema,
  onWarning,
});

describe("defaults (P2.6.1)", () => {
  it("asks onchange with no field names and keeps the defaults as values to save", async () => {
    const odoo = fakeOdoo(() => ({ value: { name: "New", note: false, amount_total: 0, line_ids: [] } }));
    const r = await OdooRecord.createWithDefaults(odoo.rpc, config(odoo.rpc));
    expect(odoo.calls[0]).toMatchObject({
      model: "x.order",
      method: "onchange",
      ids: [],
      kwargs: { values: {}, field_names: [], fields_spec: spec },
    });
    expect(r.isNew).toBe(true);
    expect(r.values.name).toBe("New");
    expect(r.serializedChanges()).toEqual({ name: "New", note: false }); // amount_total is read-only: not saved
  });

  it("gives a new line its model's defaults, sending the parent's values under the inverse field", async () => {
    const odoo = fakeOdoo((c) =>
      c.model === "x.line"
        ? { value: { qty: 1, price_unit: 0, tax_ids: [[4, 5, { id: 5, display_name: "15%" }]] } }
        : { value: {} },
    );
    const order = new OdooRecord(odoo.rpc, config(odoo.rpc), {
      id: 9,
      name: "SO9",
      partner_id: { id: 7, display_name: "Acme" },
      line_ids: [],
    });
    order.update({ note: "rush" });
    const line = await order.list("line_ids").addWithDefaults();
    const ask = odoo.calls.find((c) => c.model === "x.line")!;
    expect(ask).toMatchObject({
      method: "onchange",
      ids: [],
      kwargs: { field_names: [], values: { order_id: { note: "rush", id: 9 } } },
    });
    expect(line.values.qty).toBe(1);
    expect(line.list("tax_ids").ids).toEqual([5]);
    await order.idle();
    expect(order.serializedChanges().line_ids).toEqual([
      [0, expect.stringMatching(/^virtual_/), { qty: 1, price_unit: 0, tax_ids: [[4, 5]] }],
    ]);
  });
});

describe("field changes (P2.6.2, P2.6.3)", () => {
  it("asks onchange only for fields marked on_change, with the field's context, and applies the answer", async () => {
    const warnings: OnchangeWarning[] = [];
    const odoo = fakeOdoo(() => ({
      value: { pricelist_id: { id: 3, display_name: "EUR" } },
      warning: { title: "Careful", message: "Blocked customer", type: "dialog" },
    }));
    const r = new OdooRecord(
      odoo.rpc,
      config(odoo.rpc, (w) => warnings.push(w)),
      { id: 9, name: "SO9", partner_id: false, line_ids: [] },
    );
    r.update({ note: "no onchange" });
    expect(odoo.calls).toEqual([]);
    r.update({ partner_id: { id: 7, display_name: "Acme" } });
    await r.idle();
    expect(odoo.calls[0]).toMatchObject({
      ids: [9],
      kwargs: {
        values: { note: "no onchange", partner_id: 7 },
        field_names: ["partner_id"],
        context: { show_address: 1 },
      },
    });
    expect(r.values.pricelist_id).toEqual({ id: 3, display_name: "EUR" });
    expect(r.dirtyFields().sort()).toEqual(["note", "partner_id", "pricelist_id"]); // onchange values are saved too
    expect(warnings).toEqual([{ title: "Careful", message: "Blocked customer", type: "dialog" }]);
  });
});

describe("serialised onchanges (P2.6.4)", () => {
  it("runs one at a time, merges what arrives meanwhile, and never overwrites a newer user value", async () => {
    // only the first call left before the user typed: its `name` must not land
    const odoo = fakeOdoo(() => ({
      value: {
        ...(odoo.calls.length === 1 ? { name: "stale name from the first call" } : {}),
        pricelist_id: { id: 3, display_name: "EUR" },
      },
    }));
    const r = new OdooRecord(odoo.rpc, config(odoo.rpc), {
      id: 9,
      name: "SO9",
      partner_id: false,
      line_ids: [],
    });
    odoo.holdAnswers();
    r.update({ partner_id: { id: 7, display_name: "Acme" } }); // call 1 in flight
    r.update({ name: "typed by the user" }); // typed while waiting
    r.update({ partner_id: { id: 8, display_name: "Beta" } }); // queued
    r.list("line_ids").add({ qty: 1 }); // queued too: merged into the same next call
    expect(odoo.calls.length).toBe(1);
    odoo.release();
    await new Promise((s) => setTimeout(s, 0));
    odoo.release();
    await r.idle();
    expect(odoo.calls.map((c) => c.kwargs!.field_names)).toEqual([
      ["partner_id"],
      ["partner_id", "line_ids"],
    ]);
    expect(odoo.calls[1]!.kwargs!.values).toMatchObject({ partner_id: 8, name: "typed by the user" });
    expect(r.values.name).toBe("typed by the user"); // neither answer overwrote it
    expect(r.values.pricelist_id).toEqual({ id: 3, display_name: "EUR" });
  });

  it("save waits for pending onchanges", async () => {
    const odoo = fakeOdoo((c) =>
      c.method === "onchange"
        ? { value: { pricelist_id: { id: 3, display_name: "EUR" } } }
        : [{ id: 9, name: "SO9" }],
    );
    const r = new OdooRecord(odoo.rpc, config(odoo.rpc), {
      id: 9,
      name: "SO9",
      partner_id: false,
      line_ids: [],
    });
    odoo.holdAnswers();
    r.update({ partner_id: { id: 7, display_name: "Acme" } });
    const saving = r.save();
    odoo.release();
    await new Promise((s) => setTimeout(s, 0));
    odoo.release();
    await saving;
    const save = odoo.calls.find((c) => c.method === "web_save")!;
    expect(save.kwargs!.vals).toEqual({ partner_id: 7, pricelist_id: 3 });
  });
});

describe("lines (P2.6.5)", () => {
  it("a line change asks the line model with its parent, then the parent; answers address lines by virtual id", async () => {
    const odoo = fakeOdoo((c) => {
      if (c.model === "x.line")
        return { value: { price_unit: 750, tax_ids: [[4, 5, { id: 5, display_name: "15%" }]] } };
      const line = (c.kwargs!.values as { line_ids: [number, string, unknown][] }).line_ids[0]!;
      return { value: { amount_total: 862.5, line_ids: [[1, line[1], { price_subtotal: 750 }]] } };
    });
    const order = new OdooRecord(odoo.rpc, config(odoo.rpc), {
      id: 9,
      name: "SO9",
      partner_id: { id: 7, display_name: "Acme" },
      line_ids: [],
    });
    const line = order.list("line_ids").add({ qty: 1 });
    await order.idle();
    odoo.calls.length = 0;
    line.update({ product_id: { id: 15, display_name: "Desk" } });
    await order.idle();
    expect(odoo.calls.map((c) => `${c.model}:${JSON.stringify(c.kwargs!.field_names)}`)).toEqual([
      'x.line:["product_id"]',
      'x.order:["line_ids"]',
    ]);
    expect(odoo.calls[0]!.kwargs!.values).toMatchObject({ product_id: 15, qty: 1, order_id: { id: 9 } });
    expect(line.values).toMatchObject({ price_unit: 750, price_subtotal: 750 });
    expect(line.list("tax_ids").ids).toEqual([5]);
    expect(order.values.amount_total).toBe(862.5);
    // saving sends the line with what the user and Odoo set (read-only subtotal left out)
    expect(order.serializedChanges("save").line_ids).toEqual([
      [0, line.virtualId, { qty: 1, product_id: 15, price_unit: 750, tax_ids: [[4, 5]] }],
    ]);
  });
});

describe("line validation", () => {
  it("doesn't require a new line's link to its parent (saving the parent sets it)", () => {
    const odoo = fakeOdoo(() => ({ value: {} }));
    const lineModels = {
      ...models,
      "x.line": {
        fields: {
          ...models["x.line"]!.fields,
          order_id: { type: "many2one", relation: "x.order", required: true },
        },
      },
    } as unknown as ModelsInfo;
    const order = new OdooRecord(
      odoo.rpc,
      {
        ...config(odoo.rpc),
        models: lineModels,
        spec: { ...spec, line_ids: { fields: { ...spec.line_ids.fields, order_id: { fields: {} } } } },
      },
      { id: 9, name: "SO9", line_ids: [] },
    );
    const line = order.list("line_ids").add({ qty: 1 });
    expect(line.invalidFields()).toEqual([]);
  });
});
