/**
 * P2.12 "Done when", live on 10 actions: every filter (date filters with their periods), the
 * first text field search and every group-by of each action's own search view turn into a
 * domain / grouping Odoo accepts, through the same loader the screens use; a favourite saved
 * from a search reads back through Odoo's `ir.filters.get_filters` and gives the same records.
 */
import {
  ActionManager,
  baseEvalContext,
  canGroupBy,
  filterKey,
  GroupedList,
  loadListView,
  RecordList,
  type Rpc,
  saveFavorite,
  searchQuery,
  type SearchState,
} from "@novi/engine";
import type { JsonRpcTransport } from "@novi/odoo-client";
import { beforeAll, describe, expect, it } from "vitest";

import { odooUp, session } from "./helpers.js";

const ACTIONS = [
  "sale.action_quotations_with_onboarding",
  "sale.action_orders",
  "crm.crm_lead_action_pipeline",
  "contacts.action_contacts",
  "product.product_template_action",
  "account.action_move_out_invoice_type",
  "account.action_move_in_invoice_type",
  "hr.open_view_employee_list_my",
  "project.open_view_project_all",
  "stock.action_picking_tree_all",
];
const EMPTY: SearchState = { filters: [], groupBy: [], fields: [] };

describe.runIf(odooUp)("P2.12 search on 10 actions, live", () => {
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

  it.each(ACTIONS)("%s: filters, field search, group-bys", async (xmlid) => {
    const d = await am.resolve(xmlid);
    if (d.kind !== "window") throw new Error(d.kind);
    const action = { ...d.action, views: [[false, "list"] as [false, string], ...d.action.views] };
    const first = (await loadListView(rpc, action, base, EMPTY))!;
    const search = first.search!;
    const states: SearchState[] = [];
    search.filterGroups.forEach((group, gi) =>
      group.forEach((f, fi) => {
        if (f.invisible === true) return;
        const key = filterKey(f, gi, fi);
        states.push({ ...EMPTY, filters: [key] });
        if (f.date) states.push({ ...EMPTY, filters: [key], periods: { [key]: ["q1", "year-1"] } });
      }),
    );
    const text = search.searchFields.find((f) => f.invisible !== true);
    if (text) states.push({ ...EMPTY, fields: [{ name: text.name, value: "a", label: "a" }] });
    const fields = first.list.config.models[action.model]!.fields;
    // the group-bys the menu offers (properties are grouped by one property: not yet)
    for (const g of search.groupBys.filter((x) => x.invisible !== true && canGroupBy(x.fieldName, fields)))
      states.push({ ...EMPTY, groupBy: [g.fieldName] });
    expect(states.length).toBeGreaterThan(0);

    for (const state of states) {
      const data = (await loadListView(rpc, action, base, state).catch((e: Error) => {
        throw new Error(`${xmlid} ${JSON.stringify(state)}: ${e.message}`);
      }))!; // Odoo runs every request
      if (state.groupBy.length) expect(data.list).toBeInstanceOf(GroupedList);
      else expect(data.list).toBeInstanceOf(RecordList);
    }
  });

  it("a favourite reads back through ir.filters and gives the same records", async () => {
    const d = await am.resolve("sale.action_quotations_with_onboarding");
    if (d.kind !== "window") throw new Error(d.kind);
    const state: SearchState = { ...EMPTY, filters: ["my_quotation"] };
    const data = (await loadListView(rpc, d.action, base, state))!;
    const q = searchQuery(data.search, state, data.evalContext, data.favorites);
    const id = await saveFavorite((m, method, a) => t.call(m, method, a), {
      name: `NOVI contract ${Date.now()}`,
      model: "sale.order",
      actionId: d.action.id,
      domain: q.domain,
      groupBy: [],
      isDefault: false,
      shared: false,
      uid: Number(base.uid),
    });
    try {
      const fav = (await loadListView(rpc, d.action, base, { ...EMPTY, favorite: id }))!;
      expect(fav.favorites.map((f) => f.id)).toContain(id); // as get_filters returns it
      expect((fav.list as RecordList).records.map((r) => r.id)).toEqual(
        (data.list as RecordList).records.map((r) => r.id),
      );
    } finally {
      await t.call("ir.filters", "unlink", { ids: [id], kwargs: {} });
    }
  });
});
