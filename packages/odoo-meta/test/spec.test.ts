import { describe, expect, it } from "vitest";

import { buildSpec, type ModelsInfo, normalizeOrder, parseView, recordEvalValues } from "../src/index.js";

const models = {
  "x.order": {
    fields: {
      name: { type: "char" },
      state: { type: "selection" },
      partner_id: { type: "many2one", relation: "x.partner" },
      company_id: { type: "many2one", relation: "res.company" },
      line_ids: { type: "one2many", relation: "x.line" },
      tag_ids: { type: "many2many", relation: "x.tag" },
      amount: { type: "monetary" },
      currency_id: { type: "many2one", relation: "res.currency" },
      origin: { type: "reference" },
    },
  },
  "x.line": {
    fields: {
      sequence: { type: "integer" },
      product_id: { type: "many2one", relation: "x.product" },
      note: { type: "text" },
      uom_id: { type: "many2one", relation: "uom" },
    },
  },
} as unknown as ModelsInfo;
const spec = (arch: string) => buildSpec(parseView({ arch, model: "x.order", models }));

describe("specification builder (P2.4)", () => {
  it("reads names of visible many2one/reference, ids of hidden ones, and display_name for forms", () => {
    expect(
      spec(
        `<form><field name="partner_id"/><field name="company_id" invisible="1"/><field name="origin"/></form>`,
      ),
    ).toEqual({
      partner_id: { fields: { display_name: {} } },
      company_id: { fields: {} },
      origin: { fields: { display_name: {} } },
      display_name: {},
    });
  });

  it("reads x2many rows from the inline list plus the line form, ordered by the handle", () => {
    const s = spec(
      `<form><field name="line_ids"><list><field name="sequence" widget="handle"/><field name="product_id"/></list><form><field name="note"/><field name="uom_id"/></form></field></form>`,
    );
    expect(s.line_ids).toEqual({
      fields: {
        sequence: {},
        product_id: { fields: { display_name: {} } },
        note: {},
        uom_id: { fields: {} },
      },
      limit: 40,
      order: "sequence ASC, id ASC",
    });
  });

  it("keeps only the record-independent keys of a field context", () => {
    const s = spec(
      `<form><field name="partner_id" context="{'show_address': 1, 'default_company_id': company_id}"/><field name="company_id"/></form>`,
    );
    expect(s.partner_id).toEqual({ fields: { display_name: {} }, context: { show_address: 1 } });
  });

  it("lists ids only for x2many outside forms, names for tag widgets", () => {
    expect(
      spec(
        `<list><field name="line_ids"/><field name="tag_ids" widget="many2many_tags" options="{'color_field': 'color'}"/></list>`,
      ),
    ).toEqual({
      line_ids: {},
      tag_ids: { fields: { display_name: {}, color: {} } },
    });
  });

  it("loads fields that expressions and widget options read but the view doesn't show", () => {
    const s = spec(
      `<list><field name="amount" options="{'currency_field': 'currency_id'}" invisible="state == 'draft' or not partner_id"/></list>`,
    );
    expect(Object.keys(s).sort()).toEqual(["amount", "currency_id", "partner_id", "state"]);
    expect(s.partner_id).toEqual({ fields: {} });
  });

  it("normalises orders and turns rows into expression values", () => {
    expect(normalizeOrder("date desc, name")).toBe("date DESC, name ASC");
    const ctx = recordEvalValues(
      { id: 3, partner_id: { id: 7, display_name: "A" }, line_ids: [{ id: 1 }, { id: 2 }], name: false },
      models["x.order"]!.fields,
    );
    expect(ctx).toEqual({ id: 3, partner_id: 7, line_ids: [1, 2], name: false });
  });
});
