import { modelLabels, SEARCHABLE_MODELS, searchRecords } from "@novi/engine";
import { describe, expect, it } from "vitest";

import { odooUp, session } from "./helpers.js";

/** P1.13.2: record search uses Odoo's own matching, labels and access rules. */
describe.runIf(odooUp)("P1.13.2 record search", () => {
  it("finds contacts and orders by name with Odoo's model labels", async () => {
    const t = await session();
    const labels = await modelLabels(t, SEARCHABLE_MODELS);
    expect(labels["res.partner"]).toBe("Contact");
    expect(labels["sale.order"]).toBe("Sales Order");

    const azure = await searchRecords(t, "azure", labels);
    expect(azure.find((g) => g.model === "res.partner")?.hits.map((h) => h.name)).toContain("Azure Interior");

    const orders = await searchRecords(t, "S000", labels);
    expect(orders.find((g) => g.model === "sale.order")?.hits.length).toBeGreaterThan(0);
  });

  it("a restricted user only gets models they may read", async () => {
    const t = await session("restricted");
    const labels = await modelLabels(t, SEARCHABLE_MODELS).catch(() => ({}) as Record<string, string>);
    const groups = await searchRecords(t, "a", labels);
    // no errors bubble up; whatever comes back is readable by this user
    expect(Array.isArray(groups)).toBe(true);
    expect(groups.some((g) => g.model === "hr.employee" && g.hits.length > 0)).toBe(false);
  });
});
