/**
 * P2.9 "Done when", live: partner, product and invoice lists match Odoo's data and actions.
 * Oracle: Odoo's own web client (requests captured in headless Chromium, .cache/client-specs.json,
 * `pnpm --filter @novi/contract-tests capture-specs`). For each action, NOVI's list sends the same
 * domain (incl. the search view's default filters), context, limit and count limit; shows the same
 * records and count Odoo answers to the client's request; and offers the same Action/Print menus.
 */
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import type { RecordList } from "@novi/engine";
import { ActionManager, baseEvalContext, loadListView, type Rpc } from "@novi/engine";
import { type JsonRpcTransport, Orm } from "@novi/odoo-client";
import { beforeAll, describe, expect, it } from "vitest";

import { odooUp, session } from "./helpers.js";

interface Capture {
  step: string;
  model: string;
  method: string;
  kwargs: Record<string, unknown>;
  result?: { views: { list?: { toolbar?: { action?: { id: number }[]; print?: { id: number }[] } } } };
}
const file = fileURLToPath(new URL("../../../.cache/client-specs.json", import.meta.url));
const captures: Capture[] | null = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : null;

const ACTIONS = [
  ["contacts.action_contacts", "res.partner"],
  ["product.product_template_action", "product.template"],
  ["account.action_move_out_invoice_type", "account.move"],
  ["sale.action_quotations_with_onboarding", "sale.order"], // "My Quotations" default filter
] as const;

describe.runIf(odooUp && captures)("P2.9 lists match Odoo's own client, live", () => {
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

  it.each(ACTIONS)("%s", async (xmlid, model) => {
    const client = captures!.find(
      (c) => c.step === `${xmlid}:main` && c.method === "web_search_read" && c.model === model,
    )!;
    const clientViews = captures!.find(
      (c) => c.step === `${xmlid}:main` && c.method === "get_views" && c.model === model,
    )!;
    expect(client, "captured client read").toBeDefined();

    const d = await am.resolve(xmlid);
    if (d.kind !== "window") throw new Error(d.kind);
    const data = (await loadListView(rpc, d.action, base))!;
    const list = data.list as RecordList;
    const cfg = list.config;

    // the same request as Odoo's client
    const strip = (c: Record<string, unknown>) =>
      Object.fromEntries(Object.entries(c).filter(([k]) => k !== "bin_size"));
    expect(cfg.domain).toEqual(client.kwargs.domain);
    expect({ ...strip(cfg.context ?? {}) }).toEqual(client.kwargs.context);
    expect(cfg.limit).toBe(client.kwargs.limit);
    expect(cfg.countLimit).toBe(client.kwargs.count_limit);
    expect(cfg.order ?? "").toBe(client.kwargs.order);

    // the same data as Odoo answers to the client's request
    const orm = new Orm(t);
    const odoo = await orm.call<{ records: { id: number }[]; length: number }>(
      model,
      "web_search_read",
      undefined,
      {
        domain: client.kwargs.domain,
        specification: {},
        offset: 0,
        limit: client.kwargs.limit,
        order: client.kwargs.order,
        count_limit: client.kwargs.count_limit,
        context: client.kwargs.context,
      },
    );
    expect(list.records.map((r) => r.id)).toEqual(odoo.records.map((r) => r.id));
    expect(list.length).toBe(odoo.length);

    // the same Action / Print menus
    const toolbar = clientViews.result?.views.list?.toolbar;
    if (toolbar) {
      expect(data.toolbar.action.map((a) => a.id).sort()).toEqual(
        (toolbar.action ?? []).map((a) => a.id).sort(),
      );
      expect(data.toolbar.print.map((a) => a.id).sort()).toEqual(
        (toolbar.print ?? []).map((a) => a.id).sort(),
      );
    }
  });
});
