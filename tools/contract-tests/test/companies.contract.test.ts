import { activeCompanyIds, allowedCompanies } from "@novi/engine";
import { Orm } from "@novi/odoo-client";
import { describe, expect, it } from "vitest";

import { odooUp, session } from "./helpers.js";

/** P1.12.2: the company context NOVI sends really scopes what Odoo returns. */
describe.runIf(odooUp)("P1.12.2 multi-company context", () => {
  it("allowed_company_ids scopes records to the active company", async () => {
    const t = await session();
    const info = await t.getSessionInfo();
    const companies = allowedCompanies(info);
    expect(companies.length).toBeGreaterThan(1);
    expect(activeCompanyIds(info, undefined)).toEqual([
      info.user_companies && (info.user_companies as { current_company: number }).current_company,
    ]);

    const orm = new Orm(t);
    const companyIdsOfOrders = async (ids: number[]) => {
      const res = await orm.webSearchRead<{ company_id: { id: number } }>("sale.order", {
        specification: { company_id: { fields: {} } },
        context: { allowed_company_ids: ids },
        limit: 200,
      });
      return new Set(res.records.map((r) => r.company_id.id));
    };
    for (const c of companies) {
      const seen = await companyIdsOfOrders([c.id]);
      expect(
        [...seen].every((id) => id === c.id),
        `${c.name}: only its own orders`,
      ).toBe(true);
    }
  });
});
