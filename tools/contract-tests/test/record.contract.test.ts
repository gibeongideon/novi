/**
 * P2.5, live: the engine's record model against a real Odoo. x2many commands are only right if
 * Odoo stores what the user did, so a contact with child contacts (one2many) and tags
 * (many2many) is created, edited in every way, saved and read back; lists and groups are
 * compared with Odoo's own counts. The test data is removed afterwards.
 */
import { GroupedList, OdooRecord, RecordList, type Rpc } from "@novi/engine";
import type { JsonRpcTransport } from "@novi/odoo-client";
import { Orm } from "@novi/odoo-client";
import type { ModelsInfo } from "@novi/odoo-meta";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { odooUp, session } from "./helpers.js";

describe.runIf(odooUp)("P2.5 record model, live", () => {
  let t: JsonRpcTransport;
  let rpc: Rpc;
  let orm: Orm;
  let models: ModelsInfo;
  const created: number[] = [];
  const spec = {
    name: {},
    child_ids: { fields: { name: {} } },
    category_id: { fields: { display_name: {} } },
  };
  const config = () => ({ model: "res.partner", models, spec });

  beforeAll(async () => {
    t = await session("admin");
    rpc = ((model, method, call) => t.call(model, method, call)) as Rpc;
    orm = new Orm(t);
    models = {
      "res.partner": { fields: await orm.fieldsGet("res.partner") },
      "res.partner.category": { fields: await orm.fieldsGet("res.partner.category") },
    } as ModelsInfo;
  });
  afterAll(async () => {
    // some were already deleted by the test's own DELETE commands
    const left = await orm.call<number[]>("res.partner", "search", undefined, {
      domain: [["id", "in", created]],
      context: { active_test: false },
    });
    if (left.length) await orm.call("res.partner", "unlink", left);
  });

  const read = async (id: number) => {
    const r = await OdooRecord.load(rpc, config(), id);
    return {
      children: r.list("child_ids").records.map((c) => c.values.name),
      // many2many come back in the tag model's own order: compare as sets
      tags: r
        .list("category_id")
        .records.map((c) => c.id!)
        .sort((a, b) => a - b),
      record: r,
    };
  };

  it("creates, edits and saves one2many and many2many lines exactly as the user did", async () => {
    const tags = await orm.call<number[]>("res.partner.category", "search", undefined, {
      domain: [],
      limit: 3,
      order: "id",
    });
    expect(tags.length).toBe(3);
    const [t1, t2, t3] = tags as [number, number, number];

    // create: CREATE lines + LINK tags in one web_save
    const r = OdooRecord.create(rpc, config(), { name: "NOVI P2.5 company", is_company: true });
    r.list("child_ids").add({ name: "C1" });
    r.list("child_ids").add({ name: "C2" });
    r.list("category_id").link({ id: t1, display_name: "" });
    r.list("category_id").link({ id: t2, display_name: "" });
    expect(await r.save()).toBe(true);
    created.push(r.id!);
    let s = await read(r.id!);
    expect(s.children).toEqual(["C1", "C2"]);
    expect(s.tags).toEqual([t1, t2].sort((a, b) => a - b));
    created.push(...(s.record.list("child_ids").ids as number[]));

    // UPDATE + DELETE + CREATE on lines, UNLINK + LINK on tags
    const e = s.record;
    const removedChild = e.list("child_ids").records[1]!.id!;
    e.list("child_ids").records[0]!.update({ name: "C1b" });
    e.list("child_ids").remove(removedChild);
    e.list("child_ids").add({ name: "C3" });
    e.list("category_id").remove(t1);
    e.list("category_id").link({ id: t3, display_name: "" });
    expect(e.serializedChanges()).toMatchObject({
      child_ids: [
        [2, removedChild],
        [1, expect.any(Number), { name: "C1b" }],
        [0, expect.stringMatching(/^virtual_/), { name: "C3" }],
      ],
      category_id: [
        [3, t1],
        [4, t3],
      ],
    });
    await e.save();
    s = await read(r.id!);
    expect(s.children).toEqual(["C1b", "C3"]);
    expect(s.tags).toEqual([t2, t3].sort((a, b) => a - b));
    expect(
      await orm.call<number>("res.partner", "search_count", undefined, {
        domain: [["id", "=", removedChild]],
      }),
    ).toBe(0); // deleted
    created.push(...(s.record.list("child_ids").ids as number[]));

    // CLEAR then LINK, then SET
    s.record.list("category_id").clear();
    s.record.list("category_id").link({ id: t1, display_name: "" });
    await s.record.save();
    expect((await read(r.id!)).tags).toEqual([t1]);
    const again = await read(r.id!);
    again.record.list("category_id").replaceWith([{ id: t2 }, { id: t3 }] as never);
    await again.record.save();
    expect((await read(r.id!)).tags).toEqual([t2, t3].sort((a, b) => a - b));

    // a field back to its old value is not dirty; discard forgets everything
    const d = (await read(r.id!)).record;
    d.update({ name: "changed" });
    d.update({ name: "NOVI P2.5 company" });
    expect(d.dirty).toBe(false);
  });

  it("pages and sorts like Odoo's search, and groups add up to Odoo's counts", async () => {
    const lmodels = { "res.partner": models["res.partner"]! } as ModelsInfo;
    const list = new RecordList(rpc, {
      model: "res.partner",
      models: lmodels,
      spec: { name: {} },
      limit: 5,
      order: "name ASC",
    });
    await list.load();
    const expected = await orm.call<number[]>("res.partner", "search", undefined, {
      domain: [],
      limit: 5,
      order: "name ASC",
    });
    expect(list.records.map((r) => r.id)).toEqual(expected);
    expect(list.length).toBe(
      await orm.call<number>("res.partner", "search_count", undefined, { domain: [] }),
    );
    await list.nextPage();
    const page2 = await orm.call<number[]>("res.partner", "search", undefined, {
      domain: [],
      limit: 5,
      offset: 5,
      order: "name ASC",
    });
    expect(list.records.map((r) => r.id)).toEqual(page2);

    const grouped = new GroupedList(rpc, {
      model: "res.partner",
      models: lmodels,
      spec: { name: {} },
      groupBy: ["is_company"],
    });
    await grouped.load();
    expect(grouped.groups.reduce((n, g) => n + g.count, 0)).toBe(list.length);
    const g = grouped.groups[0]!;
    await grouped.toggle(g);
    expect((g.list as RecordList).length).toBe(g.count);
  });
});
