import { AccessError, MissingError, Orm, UserError, ValidationError } from "@novi/odoo-client";
import { afterAll, describe, expect, it } from "vitest";

import { both, json2, odooUp, session, shape } from "./helpers.js";

describe.runIf(odooUp)("P0.7.3 metadata contracts", () => {
  it("get_views returns XML arch per view type plus field metadata", async () => {
    const orm = new Orm(await session());
    const res = await orm.getViews(
      "res.partner",
      [
        [false, "list"],
        [false, "form"],
        [false, "kanban"],
        [false, "search"],
      ],
      { load_filters: true, toolbar: true },
    );
    for (const type of ["list", "form", "kanban", "search"]) {
      expect(res.views[type]?.arch).toMatch(/^<\w+/);
    }
    const fields = res.models["res.partner"]?.fields ?? {};
    expect(fields.name?.type).toBe("char");
    expect(fields.country_id).toMatchObject({ type: "many2one", relation: "res.country" });
    expect(shape(res.views.form, 1)).toMatchSnapshot();
  });

  it("modifiers use Python expressions, not attrs/states (Odoo ≥ 17)", async () => {
    const orm = new Orm(await session());
    const res = await orm.getViews("sale.order", [[false, "form"]]);
    const arch = res.views.form!.arch;
    expect(arch).not.toMatch(/\sattrs="/);
    expect(arch).toMatch(/\sinvisible="[^"]+"/);
  });

  it("fields_get returns typed field descriptions", async () => {
    const orm = new Orm(await session());
    const fields = await orm.fieldsGet("sale.order", ["type", "string", "relation", "selection"]);
    expect(fields.state?.type).toBe("selection");
    expect(fields.order_line).toMatchObject({ type: "one2many", relation: "sale.order.line" });
  });

  it("/web/model/get_definitions (CSRF-protected http route) describes models", async () => {
    const t = await session();
    const defs = await t.getModelDefinitions<Record<string, { fields?: Record<string, unknown> }>>([
      "res.partner",
    ]);
    expect(defs["res.partner"]?.fields).toHaveProperty("name");
  });
});

describe.runIf(odooUp)("P0.7.4 data contracts (both transports)", () => {
  const created: number[] = [];
  afterAll(async () => {
    if (created.length) await new Orm(await session()).webUnlink("res.partner", created);
  });

  it("web_search_read returns {length, records} with nested specs", async () => {
    for (const [name, orm] of await both()) {
      const res = await orm.webSearchRead("res.partner", {
        domain: [["is_company", "=", true]],
        specification: { name: {}, country_id: { fields: { display_name: {} } } },
        limit: 5,
        order: "id asc",
      });
      expect(res.length, name).toBeGreaterThan(0);
      expect(res.records.length, name).toBeLessThanOrEqual(5);
      expect(res.records[0], name).toHaveProperty("name");
      expect(shape(res), name).toMatchSnapshot(`web_search_read shape`);
    }
  });

  it("web_save creates and updates, web_read reads back", async () => {
    for (const [name, orm] of await both()) {
      const [rec] = await orm.webSave("res.partner", [], { name: `NOVI contract ${name}` }, { name: {} });
      expect(rec?.id, name).toBeTypeOf("number");
      created.push(rec!.id!);
      await orm.webSave("res.partner", [rec!.id!], { city: "Nairobi" }, { city: {} });
      const [back] = await orm.webRead("res.partner", [rec!.id!], { name: {}, city: {} });
      expect(back, name).toMatchObject({ name: `NOVI contract ${name}`, city: "Nairobi" });
    }
  });

  it("onchange with field_names=[] returns defaults for a new record", async () => {
    const orm = new Orm(await session());
    const res = await orm.onchange("sale.order", [], {}, [], {
      partner_id: {},
      date_order: {},
      state: {},
      order_line: { fields: { product_id: {}, product_uom_qty: {} } },
    });
    expect(res.value).toHaveProperty("state", "draft");
    expect(shape(res, 1)).toMatchSnapshot();
  });

  it("onchange on partner_id fills dependent fields", async () => {
    const orm = new Orm(await session());
    const { records } = await orm.webSearchRead("res.partner", {
      domain: [["customer_rank", ">", 0]],
      specification: { id: {} },
      limit: 1,
    });
    const partnerId = records[0]!.id!;
    const res = await orm.onchange("sale.order", [], { partner_id: partnerId }, ["partner_id"], {
      partner_id: {},
      pricelist_id: {},
      partner_invoice_id: {},
    });
    expect(res.value).toHaveProperty("partner_invoice_id");
  });

  it("web_name_search returns display names", async () => {
    for (const [name, orm] of await both()) {
      const res = await orm.webNameSearch("res.country", "Ken", { display_name: {} });
      expect(
        res.map((r) => r.display_name),
        name,
      ).toContain("Kenya");
    }
  });

  it("web_read_group and formatted_read_group aggregate", async () => {
    const orm = new Orm(await session());
    const grouped = await orm.webReadGroup<{ groups: unknown[]; length: number }>("sale.order", {
      groupby: ["state"],
      aggregates: ["amount_total:sum"],
    });
    expect(grouped.groups.length).toBeGreaterThan(0);
    expect(shape(grouped)).toMatchSnapshot();

    const formatted = await orm.call<unknown[]>("sale.order", "formatted_read_group", undefined, {
      domain: [],
      groupby: ["state"],
      aggregates: ["amount_total:sum"],
    });
    expect(Array.isArray(formatted)).toBe(true);
  });

  it("error mapping: MissingError, ValidationError/UserError, AccessError", async () => {
    const admin = new Orm(await session());
    // web_read silently drops missing ids (returns []), so probe MissingError with write
    expect(await admin.webRead("res.partner", [999_999_999], { name: {} })).toEqual([]);
    await expect(
      admin.call("res.partner", "write", [999_999_999], { vals: { name: "x" } }),
    ).rejects.toBeInstanceOf(MissingError);
    await expect(admin.webSave("res.partner", [], {}, { name: {} })).rejects.toBeInstanceOf(UserError);
    const restricted = new Orm(await session("restricted"));
    await expect(restricted.webSave("res.groups", [], { name: "x" }, {})).rejects.toBeInstanceOf(AccessError);
    // json2 maps the same exception from the HTTP status + body
    await expect(
      new Orm(json2()).call("res.partner", "write", [999_999_999], { vals: { name: "x" } }),
    ).rejects.toBeInstanceOf(MissingError);
    expect(ValidationError.prototype).toBeInstanceOf(UserError);
  });
});
