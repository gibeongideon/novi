/**
 * P2.10 "Done when", live: the sale order, partner, product and employee forms load through the
 * same code the form screen uses (`loadFormView`: the action's form view, its context, the
 * record), show their header/sheet/notebook structure, and save an edit that reads back from
 * Odoo. Each edit is put back afterwards.
 */
import { ActionManager, baseEvalContext, loadFormView, type Rpc } from "@novi/engine";
import { type JsonRpcTransport, Orm } from "@novi/odoo-client";
import type { FormNode } from "@novi/odoo-meta";
import { beforeAll, describe, expect, it } from "vitest";

import { odooUp, session } from "./helpers.js";

const FORMS = [
  ["sale.action_quotations_with_onboarding", "sale.order", "client_order_ref"],
  ["contacts.action_contacts", "res.partner", "ref"],
  ["product.product_template_action", "product.template", "default_code"],
  ["hr.open_view_employee_list_my", "hr.employee", "job_title"],
] as const;

const kinds = (nodes: readonly FormNode[], out = new Set<string>()): Set<string> => {
  for (const n of nodes) {
    out.add(n.type);
    if ("children" in n && Array.isArray(n.children)) kinds(n.children as FormNode[], out);
    if (n.type === "notebook") kinds(n.pages, out);
  }
  return out;
};

describe.runIf(odooUp)("P2.10 forms render and save, live", () => {
  let t: JsonRpcTransport;
  let rpc: Rpc;
  let am: ActionManager;
  let base: ReturnType<typeof baseEvalContext>;
  beforeAll(async () => {
    t = await session("admin");
    rpc = ((model, method, call) => t.call(model, method, call)) as Rpc;
    const info = await t.getSessionInfo();
    base = { ...baseEvalContext(info), uid: info.uid ?? 0 };
    am = new ActionManager(t, () => base);
  });

  it.each(FORMS)("%s", async (xmlid, model, field) => {
    const d = await am.resolve(xmlid);
    if (d.kind !== "window") throw new Error(d.kind);
    const [row] = await new Orm(t).call<{ id: number }[]>(model, "search_read", undefined, {
      domain: [],
      fields: ["id"],
      limit: 1,
    });
    const id = row!.id;
    const target = {
      model,
      viewId: d.action.views.find(([, type]) => type === "form")?.[0] ?? false,
      resId: id,
      context: d.action.context,
      actionId: d.action.id,
    };
    const form = await loadFormView(rpc, target, base);
    expect(form.record.id).toBe(id);
    const structure = kinds(form.schema.children);
    expect(structure.has("sheet")).toBe(true);
    expect(structure.has("field")).toBe(true);
    const node = form.record.nodes().find((n) => n.name === field)!;
    expect(node, `${field} is on the form`).toBeDefined();
    expect(form.record.isReadonly(node)).toBe(false);

    // edit and save, as the screen does; reading the record again shows the change
    const before = form.record.values[field];
    const value = `NOVI ${Date.now()}`;
    form.record.update({ [field]: value });
    expect(await form.record.save()).toBe(true);
    const again = await loadFormView(rpc, target, base);
    expect(again.record.values[field]).toBe(value);
    again.record.update({ [field]: before });
    expect(await again.record.save()).toBe(true);
  });

  it("opens a new record with Odoo's defaults", async () => {
    const d = await am.resolve("contacts.action_contacts");
    if (d.kind !== "window") throw new Error(d.kind);
    const form = await loadFormView(rpc, { model: "res.partner", context: d.action.context }, base);
    expect(form.record.isNew).toBe(true);
    expect(form.record.invalidFields()).toContain("name");
  });
});
