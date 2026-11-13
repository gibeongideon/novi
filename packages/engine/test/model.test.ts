import type { ModelsInfo } from "@novi/odoo-meta";
import { describe, expect, it } from "vitest";

import { GroupedList, OdooRecord, RecordList, type Rpc } from "../src/index.js";

const models = {
  "x.order": {
    fields: {
      name: { type: "char", required: true },
      state: { type: "selection" },
      amount: { type: "monetary" },
      qty: { type: "integer", required: true },
      partner_id: { type: "many2one", relation: "x.partner" },
      note: { type: "text", readonly: true },
      line_ids: { type: "one2many", relation: "x.line" },
      tag_ids: { type: "many2many", relation: "x.tag" },
    },
  },
  "x.line": {
    fields: {
      product: { type: "char" },
      qty: { type: "float" },
      sub_ids: { type: "one2many", relation: "x.sub" },
    },
  },
  "x.sub": { fields: { label: { type: "char" } } },
  "x.tag": { fields: { display_name: { type: "char" } } },
} as unknown as ModelsInfo;

const spec = {
  name: {},
  state: {},
  amount: {},
  qty: {},
  partner_id: { fields: { display_name: {} } },
  note: {},
  line_ids: { fields: { product: {}, qty: {}, sub_ids: { fields: { label: {} } } } },
  tag_ids: { fields: { display_name: {} } },
};

const row = () => ({
  id: 9,
  name: "SO9",
  state: "draft",
  amount: 0,
  qty: 0,
  partner_id: { id: 7, display_name: "Acme" },
  note: false,
  line_ids: [
    { id: 1, product: "A", qty: 1, sub_ids: [] },
    { id: 2, product: "B", qty: 2, sub_ids: [] },
  ],
  tag_ids: [
    { id: 11, display_name: "red" },
    { id: 12, display_name: "blue" },
  ],
});

/** A fake Odoo: records calls, answers from `replies` by method. */
function fakeRpc(replies: Record<string, unknown> = {}) {
  const calls: { model: string; method: string; ids?: number[]; kwargs?: Record<string, unknown> }[] = [];
  const rpc: Rpc = async (model, method, call = {}) => {
    calls.push({ model, method, ...call });
    const r = replies[method];
    return (typeof r === "function" ? (r as (c: unknown) => unknown)(call) : r) as never;
  };
  return { rpc, calls };
}

/** A new line's CREATE carries its virtual id (as Odoo's client sends it). */
const V = expect.stringMatching(/^virtual_/);

const config = { model: "x.order", models, spec };
const record = () => new OdooRecord(fakeRpc().rpc, config, row());

describe("OdooRecord (P2.5.1)", () => {
  it("tracks changes on top of what was read; setting a value back clears it", () => {
    const r = record();
    expect(r.dirty).toBe(false);
    r.update({ name: "SO9b", partner_id: { id: 8, display_name: "Beta" } });
    expect(r.dirtyFields().sort()).toEqual(["name", "partner_id"]);
    expect(r.values.name).toBe("SO9b");
    expect(r.serializedChanges()).toEqual({ name: "SO9b", partner_id: 8 });
    r.update({ name: "SO9" });
    expect(r.dirtyFields()).toEqual(["partner_id"]);
    r.discard();
    expect(r.dirty).toBe(false);
  });

  it("evaluates modifiers with its values (many2one as id, x2many as ids)", () => {
    const r = record();
    expect(r.evalValues()).toMatchObject({ id: 9, partner_id: 7, line_ids: [1, 2], tag_ids: [11, 12] });
    expect(
      r.isInvisible({ type: "field", name: "amount", invisible: "state != 'draft' or not line_ids" }),
    ).toBe(false);
    r.update({ state: "sale" });
    expect(r.isInvisible({ type: "field", name: "amount", invisible: "state != 'draft'" })).toBe(true);
    expect(r.isReadonly({ type: "field", name: "note" })).toBe(true); // field metadata
    expect(r.isReadonly({ type: "field", name: "note", readonly: "state == 'draft'" })).toBe(false); // the arch decides
  });

  it("checks required values like Odoo: empty text fails, 0 is a value, invisible fields are skipped", () => {
    const r = record();
    expect(r.invalidFields()).toEqual([]); // qty 0 is a value
    r.update({ name: "" });
    expect(r.invalidFields()).toEqual(["name"]);
    const hidden = new OdooRecord(
      fakeRpc().rpc,
      {
        ...config,
        schema: {
          viewType: "form",
          model: "x.order",
          fields: models["x.order"]!.fields,
          access: {},
          children: [{ type: "field", name: "name", invisible: true }],
        },
      },
      { ...row(), name: false },
    );
    expect(hidden.invalidFields()).toEqual([]);
  });

  it("saves through web_save, reloads the result and refuses to save invalid records", async () => {
    const { rpc, calls } = fakeRpc({ web_save: [{ ...row(), name: "SO9b" }] });
    const r = new OdooRecord(rpc, config, row());
    r.update({ name: "" });
    expect(await r.save()).toBe(false);
    expect(calls).toEqual([]);
    r.update({ name: "SO9b" });
    expect(await r.save()).toBe(true);
    expect(calls[0]).toMatchObject({
      model: "x.order",
      method: "web_save",
      ids: [9],
      kwargs: { vals: { name: "SO9b" }, specification: spec },
    });
    expect(r.dirty).toBe(false);
    expect(r.values.name).toBe("SO9b");
  });

  it("creates new records with ids: [] and all their values", async () => {
    const { rpc, calls } = fakeRpc({ web_save: [{ ...row(), id: 50 }] });
    const r = OdooRecord.create(rpc, config, { name: "New", qty: 1 });
    r.list("line_ids").add({ product: "X", qty: 3 });
    expect(r.isNew).toBe(true);
    await r.save();
    expect(calls[0]).toMatchObject({
      ids: [],
      kwargs: { vals: { name: "New", qty: 1, line_ids: [[0, V, { product: "X", qty: 3 }]] } },
    });
    expect(r.id).toBe(50);
  });
});

describe("x2many commands (P2.5.4): every combination", () => {
  const lines = () => {
    const r = record();
    return { r, o2m: r.list("line_ids"), m2m: r.list("tag_ids") };
  };

  it("one2many: create, update, delete, link", () => {
    let { o2m } = lines();
    o2m.add({ product: "C" });
    expect(o2m.commands()).toEqual([[0, V, { product: "C" }]]);

    ({ o2m } = lines());
    o2m.records[0]!.update({ qty: 5 });
    expect(o2m.commands()).toEqual([[1, 1, { qty: 5 }]]);

    ({ o2m } = lines());
    o2m.remove(2);
    expect(o2m.commands()).toEqual([[2, 2]]);

    ({ o2m } = lines());
    o2m.link({ id: 77, product: "Z", qty: 0, sub_ids: [] });
    expect(o2m.commands()).toEqual([[4, 77]]);
  });

  it("one2many: edits collapse, and a removed line keeps only its delete", () => {
    let { o2m } = lines();
    const c = o2m.add({ product: "C" });
    c.update({ qty: 2 });
    c.update({ product: "C2" });
    expect(o2m.commands()).toEqual([[0, V, { product: "C2", qty: 2 }]]); // one create, final values

    ({ o2m } = lines());
    const n = o2m.add({ product: "tmp" });
    o2m.remove(n);
    expect(o2m.commands()).toEqual([]); // created then removed: nothing to send

    ({ o2m } = lines());
    o2m.records[0]!.update({ qty: 5 });
    o2m.records[0]!.update({ product: "A2" });
    expect(o2m.commands()).toEqual([[1, 1, { qty: 5, product: "A2" }]]);

    ({ o2m } = lines());
    o2m.records[1]!.update({ qty: 9 });
    o2m.remove(2);
    expect(o2m.commands()).toEqual([[2, 2]]); // edited then removed: just the delete

    ({ o2m } = lines());
    o2m.records[0]!.update({ qty: 5 });
    o2m.records[0]!.update({ qty: 1 });
    expect(o2m.commands()).toEqual([]); // edited back: nothing
  });

  it("one2many: clear deletes every line; mixed edits come out in a stable order", () => {
    let { o2m } = lines();
    o2m.clear();
    expect(o2m.commands()).toEqual([
      [2, 1],
      [2, 2],
    ]);

    ({ o2m } = lines());
    o2m.add({ product: "N" });
    o2m.remove(1);
    o2m.records[0]!.update({ qty: 7 });
    o2m.link({ id: 77, product: "Z", qty: 0, sub_ids: [] });
    expect(o2m.commands()).toEqual([
      [2, 1],
      [4, 77],
      [1, 2, { qty: 7 }],
      [0, V, { product: "N" }],
    ]);
  });

  it("many2many: link, unlink, cancel out, clear, set", () => {
    let { m2m } = lines();
    m2m.link({ id: 13, display_name: "green" });
    expect(m2m.commands()).toEqual([[4, 13]]);

    ({ m2m } = lines());
    m2m.remove(11);
    expect(m2m.commands()).toEqual([[3, 11]]);

    ({ m2m } = lines());
    m2m.link({ id: 13, display_name: "green" });
    m2m.remove(13);
    expect(m2m.commands()).toEqual([]); // linked then removed

    ({ m2m } = lines());
    m2m.remove(11);
    m2m.link({ id: 11, display_name: "red" });
    expect(m2m.commands()).toEqual([]); // removed then put back

    ({ m2m } = lines());
    m2m.clear();
    expect(m2m.commands()).toEqual([[5]]);

    ({ m2m } = lines());
    m2m.clear();
    m2m.link({ id: 11, display_name: "red" });
    m2m.add({ display_name: "new tag" });
    expect(m2m.commands()).toEqual([[5], [4, 11], [0, V, { display_name: "new tag" }]]);

    ({ m2m } = lines());
    m2m.replaceWith([
      { id: 12, display_name: "blue" },
      { id: 14, display_name: "pink" },
    ]);
    expect(m2m.commands()).toEqual([[6, 0, [12, 14]]]);

    ({ m2m } = lines());
    m2m.replaceWith([{ id: 12, display_name: "blue" }]);
    m2m.add({ display_name: "fresh" });
    m2m.records[0]!.update({ display_name: "navy" });
    expect(m2m.commands()).toEqual([
      [6, 0, [12]],
      [1, 12, { display_name: "navy" }],
      [0, V, { display_name: "fresh" }],
    ]);
  });

  it("nested lines carry their own commands, and the parent sees the change", () => {
    const { r, o2m } = lines();
    let notified = 0;
    r.subscribe(() => notified++);
    const line = o2m.add({ product: "Kit" });
    line.list("sub_ids").add({ label: "part 1" });
    o2m.records[0]!.list("sub_ids").add({ label: "extra" });
    expect(r.dirty).toBe(true);
    expect(notified).toBeGreaterThan(0);
    expect(r.serializedChanges()).toEqual({
      line_ids: [
        [1, 1, { sub_ids: [[0, V, { label: "extra" }]] }],
        [0, V, { product: "Kit", sub_ids: [[0, V, { label: "part 1" }]] }],
      ],
    });
    expect(line.evalContext()).toMatchObject({ parent: { id: 9, partner_id: 7 } });
  });

  it("discard returns the lines to what was read", () => {
    const { r, o2m, m2m } = lines();
    o2m.add({ product: "C" });
    o2m.remove(1);
    m2m.clear();
    r.discard();
    expect(o2m.commands()).toEqual([]);
    expect(m2m.commands()).toEqual([]);
    expect(o2m.ids).toEqual([1, 2]);
  });
});

describe("RecordList (P2.5.2)", () => {
  const page = (offset: number, n: number) =>
    Array.from({ length: n }, (_, i) => ({ ...row(), id: offset + i + 1 }));

  it("pages, sorts (toggling direction), selects, and knows when the count is capped", async () => {
    const { rpc, calls } = fakeRpc({
      web_search_read: (c: { kwargs: { offset: number; limit: number } }) => ({
        records: page(c.kwargs.offset, Math.min(c.kwargs.limit, 25 - c.kwargs.offset)),
        length: 25,
      }),
    });
    const list = new RecordList(rpc, {
      ...config,
      limit: 10,
      domain: [["state", "=", "draft"]],
      order: "name ASC",
    });
    await list.load();
    expect(calls[0]!.kwargs).toMatchObject({
      domain: [["state", "=", "draft"]],
      offset: 0,
      limit: 10,
      order: "name ASC",
    });
    expect(list.records.map((r) => r.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

    await list.nextPage();
    await list.nextPage();
    expect(list.offset).toBe(20);
    await list.nextPage();
    expect(list.offset).toBe(0); // wraps like Odoo's pager
    await list.previousPage();
    expect(list.offset).toBe(20);

    await list.sortBy("name");
    expect(list.order).toBe("name DESC");
    await list.sortBy("name");
    expect(list.order).toBe("name ASC");
    await list.sortBy("amount");
    expect([list.order, list.offset]).toEqual(["amount ASC", 0]);

    list.select(3);
    list.selectAll();
    expect(list.selection.size).toBe(10);
    await list.nextPage();
    expect(list.selection.size).toBe(0); // selection is of the visible page

    const capped = new RecordList(fakeRpc({ web_search_read: { records: [], length: 10000 } }).rpc, {
      ...config,
      countLimit: 10000,
    });
    await capped.load();
    expect(capped.lengthIsEstimate).toBe(true);
  });
});

describe("GroupedList (P2.5.3)", () => {
  it("reads groups with counts and aggregates, unfolds them lazily, nests group-bys", async () => {
    const groups = [
      { partner_id: [7, "Acme"], __extra_domain: [["partner_id", "=", 7]], "amount:sum": 150, __count: 2 },
      { partner_id: false, __extra_domain: [["partner_id", "=", false]], "amount:sum": 0, __count: 1 },
    ];
    const { rpc, calls } = fakeRpc({
      web_read_group: (c: { kwargs: { groupby: string[] } }) =>
        c.kwargs.groupby[0] === "partner_id"
          ? { groups, length: 2 }
          : {
              groups: [{ state: "draft", __extra_domain: [["state", "=", "draft"]], __count: 2 }],
              length: 1,
            },
      web_search_read: { records: [row()], length: 1 },
    });
    const list = new GroupedList(rpc, {
      ...config,
      domain: [["qty", ">", 0]],
      groupBy: ["partner_id", "state"],
      aggregates: ["amount:sum"],
    });
    await list.load();
    expect(calls[0]).toMatchObject({
      method: "web_read_group",
      kwargs: { groupby: ["partner_id"], aggregates: ["amount:sum"], auto_unfold: false },
    });
    expect(list.groups.map((g) => [g.label, g.count, g.aggregates.amount, g.folded])).toEqual([
      ["Acme", 2, 150, true],
      [false, 1, 0, true],
    ]);
    expect(list.groups[0]!.domain).toEqual(["&", ["qty", ">", 0], ["partner_id", "=", 7]]);

    await list.toggle(list.groups[0]!);
    expect(calls[1]).toMatchObject({
      method: "web_read_group",
      kwargs: { groupby: ["state"], domain: ["&", ["qty", ">", 0], ["partner_id", "=", 7]] },
    });
    const sub = list.groups[0]!.list as GroupedList;
    expect(sub.groups[0]!.label).toBe("draft");
    await sub.toggle(sub.groups[0]!);
    expect(calls[2]).toMatchObject({
      method: "web_search_read",
      kwargs: { domain: ["&", "&", ["qty", ">", 0], ["partner_id", "=", 7], ["state", "=", "draft"]] },
    });
    await list.toggle(list.groups[0]!);
    expect(list.groups[0]!.folded).toBe(true);
  });

  it("keeps records Odoo already unfolded (kanban auto_unfold)", async () => {
    const { rpc } = fakeRpc({
      web_read_group: {
        groups: [
          { state: "draft", __extra_domain: [["state", "=", "draft"]], __count: 1, __records: [row()] },
        ],
        length: 1,
      },
    });
    const list = new GroupedList(rpc, { ...config, groupBy: ["state"], autoUnfold: true });
    await list.load();
    const g = list.groups[0]!;
    expect(g.folded).toBe(false);
    expect((g.list as RecordList).records[0]!.values.name).toBe("SO9");
  });
});
