import { describe, expect, it } from "vitest";

import { searchRecords, type SearchTransport } from "../src/index.js";

function fake(): SearchTransport & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async call<T>(model: string, method: string, c?: { kwargs?: Record<string, unknown> }) {
      calls.push(`${model}.${method}`);
      if (model === "hr.employee") throw new Error("AccessError"); // no access → skipped
      if (model === "sale.order") return [{ id: 7, display_name: "S00007" }] as T;
      if (model === "res.partner")
        return [{ id: 3, display_name: `Azure (${String(c?.kwargs?.name)})` }] as T;
      return [] as T;
    },
  };
}

describe("searchRecords", () => {
  it("searches installed models only, groups hits with Odoo's labels, skips errors and empties", async () => {
    const t = fake();
    const labels = { "res.partner": "Contact", "sale.order": "Sales Order", "hr.employee": "Employee" };
    const groups = await searchRecords(t, "az", labels);
    expect(t.calls.sort()).toEqual([
      "hr.employee.web_name_search",
      "res.partner.web_name_search",
      "sale.order.web_name_search",
    ]);
    expect(groups).toEqual([
      { model: "res.partner", label: "Contact", hits: [{ model: "res.partner", id: 3, name: "Azure (az)" }] },
      { model: "sale.order", label: "Sales Order", hits: [{ model: "sale.order", id: 7, name: "S00007" }] },
    ]);
  });
});
