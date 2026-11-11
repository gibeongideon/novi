import { describe, expect, it } from "vitest";

import { OverrideRegistry } from "../src/index.js";

const Pipeline = () => null;
const SalesPipeline = () => null;
const QuoteLines = () => null;
const owner = "sales lead";

function registry() {
  return new OverrideRegistry()
    .register({ model: "crm.lead", view: "kanban", component: Pipeline, reason: "forecast header", owner })
    .register({
      model: "crm.lead",
      view: "kanban",
      action: "crm.crm_lead_action_pipeline",
      component: SalesPipeline,
      reason: "sales team pipeline",
      owner,
    })
    .register({
      model: "sale.order",
      view: "form",
      slot: "order_line",
      component: QuoteLines,
      reason: "keyboard-first lines",
      owner,
    });
}

describe("OverrideRegistry", () => {
  it("action-specific beats model-wide; unknown action falls back to model-wide", () => {
    const r = registry();
    expect(
      r.view({ model: "crm.lead", view: "kanban", action: "crm.crm_lead_action_pipeline" })?.component,
    ).toBe(SalesPipeline);
    expect(r.view({ model: "crm.lead", view: "kanban", action: 999 })?.component).toBe(Pipeline);
    expect(r.view({ model: "crm.lead", view: "list" })).toBeUndefined();
  });

  it("slots are separate from whole-view overrides", () => {
    const r = registry();
    expect(r.view({ model: "sale.order", view: "form" })).toBeUndefined();
    expect(r.slot({ model: "sale.order", view: "form" }, "order_line")?.component).toBe(QuoteLines);
    expect(r.slot({ model: "sale.order", view: "form" }, "partner_id")).toBeUndefined();
  });

  it("requires a reason and a named owner (UI-RULES §0b), and rejects duplicates", () => {
    const r = registry();
    const base = { model: "x", view: "form" as const, component: Pipeline };
    expect(() => r.register({ ...base, reason: " ", owner })).toThrow(/reason and an owner/);
    expect(() => r.register({ ...base, reason: "r", owner: "" })).toThrow(/reason and an owner/);
    expect(() =>
      r.register({ model: "crm.lead", view: "kanban", component: Pipeline, reason: "again", owner }),
    ).toThrow(/already registered/);
  });
});
