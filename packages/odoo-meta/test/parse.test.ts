import { describe, expect, it } from "vitest";

import {
  type FormSchema,
  type KanbanSchema,
  type ListSchema,
  type ModelsInfo,
  parseView,
  parseXml,
  type SearchSchema,
} from "../src/index.js";

const models: ModelsInfo = {
  "x.order": {
    fields: {
      name: { type: "char", string: "Reference" },
      state: { type: "selection", string: "Status" },
      partner_id: { type: "many2one", string: "Customer", relation: "x.partner" },
      line_ids: { type: "one2many", string: "Lines", relation: "x.line" },
      tag_ids: { type: "many2many", string: "Tags", relation: "x.tag" },
      amount: { type: "monetary", string: "Total" },
      date: { type: "date", string: "Date" },
      user_id: { type: "many2one", string: "Owner", relation: "res.users" },
      priority: { type: "selection", string: "Priority" },
    },
  },
  "x.line": {
    fields: { product: { type: "char", string: "Product" }, qty: { type: "float", string: "Qty" } },
  },
  "x.partner": { fields: { email: { type: "char", string: "Email" } } },
} as unknown as ModelsInfo;
const parse = (arch: string) => parseView({ arch, model: "x.order", models });

describe("xml reader", () => {
  it("reads elements, attributes, entities, text and comments", () => {
    const x = parseXml(
      `<?xml version="1.0"?><a b="1 &lt; 2" c='&quot;q&quot;'><!-- c --><i/>t &amp; u<![CDATA[<raw>]]></a>`,
    );
    expect(x).toEqual({
      tag: "a",
      attrs: { b: "1 < 2", c: '"q"' },
      children: [{ tag: "i", attrs: {}, children: [] }, "t & u", "<raw>"],
    });
    expect(() => parseXml("<a><b></a>")).toThrow(/unexpected <\/a>/);
  });
});

describe("form", () => {
  const s = parse(`
    <form string="Order" create="0">
      <header><button name="confirm" type="object" string="Confirm" class="btn-primary" invisible="state != 'draft'"/>
        <field name="state" widget="statusbar" statusbar_visible="draft,sale"/></header>
      <sheet>
        <div class="oe_button_box" name="button_box"><button name="open" type="object" icon="fa-list"><field name="amount" widget="statinfo"/></button></div>
        <div class="oe_title"><h1><field name="name" placeholder="New"/></h1></div>
        <group col="2"><field name="partner_id" options="{'no_create': True}" on_change="1" can_create="True"/>
          <field name="date" readonly="1" required="state == 'sale'" options="{'currency_field': currency_id}"/></group>
        <notebook><field name="tag_ids" invisible="1"/>
          <page string="Lines" name="lines"><field name="line_ids"><list editable="bottom"><field name="product"/><field name="qty" sum="Total"/></list></field></page>
        </notebook>
      </sheet>
      <chatter/>
    </form>`) as FormSchema;

  it("reads sections, buttons, groups and modifiers", () => {
    expect(s.access).toEqual({ create: false });
    const [header, sheet, chatter] = s.children;
    expect(header).toMatchObject({
      type: "header",
      children: [
        { type: "button", name: "confirm", kind: "object", primary: true, invisible: "state != 'draft'" },
        { type: "field", name: "state", widget: "statusbar", statusbarVisible: ["draft", "sale"] },
      ],
    });
    expect(chatter).toEqual({ type: "chatter" });
    expect(sheet).toMatchObject({ type: "sheet" });
    const [box, title, group, notebook] = (sheet as { children: unknown[] }).children as Record<
      string,
      unknown
    >[];
    expect(box).toMatchObject({
      type: "markup",
      hint: "buttonBox",
      children: [
        {
          type: "button",
          icon: "fa-list",
          children: [{ type: "field", name: "amount", widget: "statinfo" }],
        },
      ],
    });
    expect(title).toMatchObject({
      type: "markup",
      hint: "title",
      children: [
        { type: "markup", tag: "h1", children: [{ type: "field", name: "name", placeholder: "New" }] },
      ],
    });
    expect(group).toEqual({
      type: "group",
      col: 2,
      children: [
        { type: "field", name: "partner_id", options: { no_create: true }, onChange: true, canCreate: true },
        {
          type: "field",
          name: "date",
          readonly: true,
          required: "state == 'sale'",
          optionsExpr: "{'currency_field': currency_id}",
        },
      ],
    });
    expect(notebook).toMatchObject({ type: "field", name: "tag_ids", invisible: true }); // helper field kept beside the notebook
  });

  it("parses x2many inline views against the related model", () => {
    const nb = (s.children[1] as { children: Record<string, unknown>[] }).children[4] as {
      pages: { children: { views: { list: ListSchema } }[] }[];
    };
    const lines = nb.pages[0]!.children[0]!.views.list;
    expect(lines.model).toBe("x.line");
    expect(lines.editable).toBe("bottom");
    expect(lines.columns).toEqual([
      { type: "field", name: "product" },
      { type: "field", name: "qty", sum: "Total" },
    ]);
    expect(Object.keys(lines.fields)).toEqual(["product", "qty"]);
  });
});

describe("list", () => {
  it("reads columns, decorations, optional columns, header buttons and group rows", () => {
    const s =
      parse(`<list multi_edit="1" default_order="date desc" decoration-muted="state == 'cancel'" export_xlsx="0">
      <header><button name="mass" type="object" string="Mass"/></header>
      <field name="name" decoration-bf="1"/><field name="date" optional="hide"/><field name="amount" sum="Total" column_invisible="context.get('hide')"/>
      <column string="Who"><field name="partner_id"/><field name="user_id"/></column>
      <groupby name="partner_id"><field name="email"/><button name="edit" type="object" icon="fa-pencil"/></groupby>
    </list>`) as ListSchema;
    expect(s).toMatchObject({
      viewType: "list",
      multiEdit: true,
      defaultOrder: "date desc",
      decorations: { muted: "state == 'cancel'" },
      access: { export: false },
    });
    expect(
      s.columns.map((c) => (c.type === "column" ? `[${c.children.length}]` : (c as { name?: string }).name)),
    ).toEqual(["name", "date", "amount", "[2]"]);
    expect(s.columns[1]).toMatchObject({ optional: "hide" });
    expect(s.columns[2]).toMatchObject({ sum: "Total", columnInvisible: "context.get('hide')" });
    expect(s.headerButtons).toMatchObject([{ name: "mass" }]);
    expect(s.groupRows.partner_id).toMatchObject({
      model: "x.partner",
      nodes: [{ name: "email" }, { name: "edit" }],
    });
  });
});

describe("kanban", () => {
  it("reads the card by section and gives each value a role", () => {
    const s = parse(`<kanban default_group_by="state" highlight_color="priority" quick_create="false">
      <field name="user_id"/>
      <progressbar field="state" colors='{"draft": "info", "sale": "success"}' sum_field="amount"/>
      <templates>
        <t t-name="menu"><a type="open">Edit</a></t>
        <t t-name="card">
          <field name="name" class="fw-bold"/>
          <field name="partner_id"/>
          <field name="tag_ids" widget="many2many_tags"/>
          <footer><field name="priority" widget="priority"/><field name="date"/><field name="user_id" widget="many2one_avatar_user"/></footer>
        </t>
      </templates>
    </kanban>`) as KanbanSchema;
    expect(s).toMatchObject({
      defaultGroupBy: "state",
      colorField: "priority",
      quickCreate: false,
      hasMenu: true,
      extraFields: ["user_id"],
    });
    expect(s.progressbar).toEqual({
      field: "state",
      colors: { draft: "info", sale: "success" },
      sumField: "amount",
    });
    const roles = (list: { name?: string; role?: string }[]) => list.map((f) => `${f.name}:${f.role}`);
    expect(roles(s.card.main as never)).toEqual(["name:title", "partner_id:subtitle", "tag_ids:tags"]);
    expect(roles(s.card.footer as never)).toEqual(["priority:priority", "date:date", "user_id:avatar"]);
  });
});

describe("search", () => {
  it("groups filters by separators, splits out group-bys, date filters and the search panel", () => {
    const s = parse(`<search>
      <field name="name" filter_domain="['|', ('name', 'ilike', self), ('partner_id', 'ilike', self)]"/>
      <filter name="draft" string="Draft" domain="[('state', '=', 'draft')]"/>
      <filter name="sale" string="Sales" domain="[('state', '=', 'sale')]"/>
      <separator/>
      <filter name="mine" string="Mine" domain="[('user_id', '=', uid)]"/>
      <filter name="date" string="Date" date="date" default_period="month"/>
      <group expand="0"><filter name="by_state" string="Status" context="{'group_by': 'state'}"/><filter name="by_month" string="Month" context="{'group_by': 'date:month'}"/></group>
      <searchpanel><field name="partner_id" select="multi" enable_counters="1"/></searchpanel>
    </search>`) as SearchSchema;
    expect(s.searchFields).toEqual([
      { name: "name", filterDomain: "['|', ('name', 'ilike', self), ('partner_id', 'ilike', self)]" },
    ]);
    expect(s.filterGroups.map((g) => g.map((f) => f.name))).toEqual([["draft", "sale"], ["mine"], ["date"]]);
    expect(s.filterGroups[2]![0]).toMatchObject({ date: "date", defaultPeriod: "month" });
    expect(s.groupBys).toEqual([
      { name: "by_state", string: "Status", fieldName: "state" },
      { name: "by_month", string: "Month", fieldName: "date:month" },
    ]);
    expect(s.panel).toEqual([{ name: "partner_id", select: "multi", enableCounters: true }]);
  });
});
