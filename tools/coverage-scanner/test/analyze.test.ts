import { describe, expect, it } from "vitest";

import { analyzeArch, coverage, emptyUsage, parseAttrs, toMarkdown } from "../src/analyze.js";

const FORM = `<form>
  <header><field name="state" widget="statusbar" statusbar_visible="draft,sale"/></header>
  <sheet>
    <widget name="web_ribbon" title="Archived" invisible="active"/>
    <field name="name"/>
    <field name="partner_id" widget='res_partner_many2one'/>
    <field name="date_order"/>
    <field name="order_line">
      <list editable="bottom"><field name="product_id"/><field name="price_unit"/></list>
    </field>
  </sheet>
</form>`;

describe("analyzeArch", () => {
  it("counts view types, widgets and default field types", () => {
    const u = emptyUsage();
    analyzeArch(
      u,
      "form",
      FORM,
      "sale.order",
      {
        state: { type: "selection" },
        name: { type: "char" },
        partner_id: { type: "many2one" },
        date_order: { type: "datetime" },
        order_line: { type: "one2many" },
      },
      { "sale.order.line": { product_id: { type: "many2one" }, price_unit: { type: "float" } } },
    );
    expect(u.viewTypes.get("form")).toBe(1);
    expect(u.widgets.get("statusbar")).toBe(1);
    expect(u.widgets.get("res_partner_many2one")).toBe(1);
    expect(u.widgets.get("<widget>web_ribbon")).toBe(1);
    expect(u.fieldTypes.get("char")).toBe(1);
    expect(u.fieldTypes.get("many2one")).toBe(1); // product_id via related model
    expect(u.fieldTypes.get("float")).toBe(1);
    expect(u.examples.get("statusbar")).toEqual(new Set(["sale.order:form"]));
  });

  it("parses single and double quoted attributes", () => {
    expect(parseAttrs(` name="a" widget='b' invisible="state != 'draft'"`)).toEqual({
      name: "a",
      widget: "b",
      invisible: "state != 'draft'",
    });
  });
});

describe("coverage", () => {
  it("is usage weighted and lists missing items by usage", () => {
    const used = new Map([
      ["many2one", 10],
      ["char", 30],
      ["html", 5],
    ]);
    const c = coverage("Field types", used, ["char"]);
    expect(c.pct).toBe(66.7);
    expect(c.missing).toEqual([
      ["many2one", 10],
      ["html", 5],
    ]);
  });

  it("renders a markdown report", () => {
    const md = toMarkdown({
      db: "demo",
      odooVersion: "20.0",
      generatedAt: "now",
      counts: { windowActions: 1, clientActions: 0, serverActions: 0, reports: 0, views: 2, errors: 0 },
      coverage: [coverage("Widgets", new Map([["statusbar", 2]]), [])],
      examples: { statusbar: ["sale.order:form"] },
      errors: [],
    });
    expect(md).toContain("| Widgets | 0 | 2 | **0%** |");
    expect(md).toContain("`statusbar` | 2 | sale.order:form");
  });
});
