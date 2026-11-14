/**
 * P2.7 "Done when", live: create, edit, delete, duplicate and archive work on 10 different models,
 * each through its own real form view (get_views → schema → spec), with the same generic code a
 * screen will use. Required fields still empty after Odoo's defaults are filled by type. Every
 * step is checked with Odoo; all test records are removed.
 */
import { OdooRecord, type Rpc } from "@novi/engine";
import { type JsonRpcTransport, Orm } from "@novi/odoo-client";
import { buildSpec, type FormSchema, type ModelsInfo, parseView } from "@novi/odoo-meta";
import { beforeAll, describe, expect, it } from "vitest";

import { odooUp, session } from "./helpers.js";

const MODELS = [
  "res.partner",
  "res.partner.category",
  "product.template",
  "product.category",
  "crm.tag",
  "hr.department",
  "hr.job",
  "project.project",
  "project.tags",
  "mail.activity.type",
];

describe.runIf(odooUp)("P2.7 records on 10 models, live", () => {
  let t: JsonRpcTransport;
  let rpc: Rpc;
  let orm: Orm;
  beforeAll(async () => {
    t = await session("admin");
    rpc = ((model, method, call) => t.call(model, method, call)) as Rpc;
    orm = new Orm(t);
  });
  const exists = async (model: string, id: number) =>
    orm.call<number>(model, "search_count", undefined, {
      domain: [["id", "=", id]],
      context: { active_test: false },
    });

  it.each(MODELS)("%s: create, edit, duplicate, archive, delete", async (model) => {
    const views = await t.call<{ views: { form: { arch: string } }; models: ModelsInfo }>(
      model,
      "get_views",
      {
        kwargs: { views: [[false, "form"]], options: {} },
      },
    );
    const schema = parseView({ arch: views.views.form.arch, model, models: views.models }) as FormSchema;
    const info = await t.getSessionInfo();
    const config = {
      model,
      models: views.models,
      spec: buildSpec(schema),
      schema,
      context: info.user_context ?? {},
      evalContext: { uid: info.uid ?? 0 },
    };
    const fields = views.models[model]!.fields;
    const label = `NOVI ${model} ${Date.now()}`;

    // create: Odoo's defaults, then whatever required field is still empty, filled by its type
    const rec = await OdooRecord.createWithDefaults(rpc, config);
    if (fields.name?.type === "char") rec.update({ name: label });
    await rec.idle();
    for (const name of rec.invalidFields()) {
      const meta = fields[name]!;
      if (meta.type === "many2one") {
        const [row] = await orm.call<{ id: number; display_name: string }[]>(
          String(meta.relation),
          "search_read",
          undefined,
          { domain: [], fields: ["display_name"], limit: 1 },
        );
        rec.update({ [name]: row });
      } else if (meta.type === "selection")
        rec.update({ [name]: (meta.selection as [string, string][])[0]![0] });
      else if (["integer", "float", "monetary"].includes(meta.type)) rec.update({ [name]: 1 });
      else if (meta.type === "date") rec.update({ [name]: new Date().toISOString().slice(0, 10) });
      else rec.update({ [name]: label });
    }
    await rec.idle();
    expect(rec.invalidFields()).toEqual([]);
    expect(await rec.save()).toBe(true);
    const id = rec.id!;
    expect(await exists(model, id)).toBe(1);

    // edit: only the change is sent; reading it back shows it
    if (fields.name?.type === "char") {
      rec.update({ name: `${label} edited` });
      expect(rec.serializedChanges()).toEqual({ name: `${label} edited` });
      await rec.save();
      expect((await OdooRecord.load(rpc, config, id)).values.name).toBe(`${label} edited`);
    }

    // duplicate
    const copy = await rec.duplicate();
    expect(copy).not.toBe(id);
    expect(await exists(model, copy)).toBe(1);

    // archive / restore, where the model can be archived
    if (fields.active) {
      await rec.setArchived(true);
      expect(rec.values.active).toBe(false);
      await rec.setArchived(false);
      expect(rec.values.active).toBe(true);
    }

    // delete both
    await rec.delete();
    await new OdooRecord(rpc, config, { id: copy }).delete();
    expect(await exists(model, id)).toBe(0);
    expect(await exists(model, copy)).toBe(0);
  });
});
