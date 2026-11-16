/**
 * P2.11, live: kanbans load like Odoo's own client loads them (requests captured in headless
 * Chromium, .cache/client-specs.json). The CRM pipeline: grouped by stage with every column
 * opened, the same domain (search defaults included), the same columns and counts as Odoo
 * answers the client. Projects: an ungrouped kanban, the same request as a list.
 */
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  ActionManager,
  baseEvalContext,
  GroupedList,
  loadKanbanView,
  RecordList,
  type Rpc,
} from "@novi/engine";
import type { JsonRpcTransport } from "@novi/odoo-client";
import { beforeAll, describe, expect, it } from "vitest";

import { odooUp, session } from "./helpers.js";

interface Capture {
  step: string;
  model: string;
  method: string;
  kwargs: Record<string, unknown>;
}
const file = fileURLToPath(new URL("../../../.cache/client-specs.json", import.meta.url));
const captures: Capture[] | null = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : null;
const client = (step: string, method: string) =>
  captures?.find((c) => c.step === `${step}:main` && c.method === method);

describe.runIf(odooUp && captures && client("crm.crm_lead_action_pipeline", "web_read_group"))(
  "P2.11 kanbans match Odoo's own client, live",
  () => {
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

    it("CRM pipeline: columns by stage, all opened, same request and data", async () => {
      const c = client("crm.crm_lead_action_pipeline", "web_read_group")!;
      const d = await am.resolve("crm.crm_lead_action_pipeline");
      if (d.kind !== "window") throw new Error(d.kind);
      const data = (await loadKanbanView(rpc, d.action, base))!;
      expect(data.list).toBeInstanceOf(GroupedList);
      const list = data.list as GroupedList;
      const cfg = list.config;
      expect(cfg.domain).toEqual(c.kwargs.domain);
      expect(cfg.groupBy).toEqual(c.kwargs.groupby);
      expect(cfg.autoUnfold).toBe(c.kwargs.auto_unfold);
      expect(cfg.unfoldLimit).toBe(c.kwargs.unfold_read_default_limit);
      expect(cfg.context?.read_group_expand).toBe(true);
      // the generic aggregates (progress bar sum and its currency); CRM's recurring revenue is
      // its own js_class (crm_kanban), Phase 4's override
      expect(c.kwargs.aggregates).toEqual(expect.arrayContaining(cfg.aggregates!));

      // the same columns, counts and opened records as Odoo answers the client's request
      const odoo = await t.call<{
        groups: { __count: number; __records?: { id: number }[]; stage_id: unknown }[];
      }>("crm.lead", "web_read_group", { kwargs: { ...c.kwargs, unfold_read_specification: {} } });
      expect(list.groups.map((g) => [g.value, g.count])).toEqual(
        odoo.groups.map((g) => [g.stage_id, g.__count]),
      );
      expect(
        list.groups.map((g) => (g.list as RecordList | undefined)?.records.map((r) => r.id) ?? []),
      ).toEqual(odoo.groups.map((g) => (g.__records ?? []).map((r) => r.id)));
    });

    it("CRM pipeline: progress bars per column from Odoo's read_progress_bar", async () => {
      const d = await am.resolve("crm.crm_lead_action_pipeline");
      if (d.kind !== "window") throw new Error(d.kind);
      const list = (await loadKanbanView(rpc, d.action, base))!.list as GroupedList;
      const withBars = list.groups.filter((g) => g.progress);
      expect(withBars.length).toBeGreaterThan(0);
      for (const g of withBars) {
        const counted = Object.values(g.progress!).reduce((a, b) => a + b, 0);
        expect(counted).toBeLessThanOrEqual(g.count); // records without an activity have no colour
      }
    });

    it("Projects: an ungrouped kanban reads like a list", async () => {
      const c = client("project.open_view_project_all", "web_search_read")!;
      const d = await am.resolve("project.open_view_project_all");
      if (d.kind !== "window") throw new Error(d.kind);
      const data = (await loadKanbanView(rpc, d.action, base))!;
      expect(data.list).toBeInstanceOf(RecordList);
      const cfg = (data.list as RecordList).config;
      expect(cfg.domain).toEqual(c.kwargs.domain);
      expect(cfg.limit).toBe(c.kwargs.limit);
      expect(cfg.order).toBe(c.kwargs.order);
    });
  },
);
