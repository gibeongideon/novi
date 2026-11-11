import { createFormatter, type CurrencyInfo, type LangParameters } from "@novi/engine";
import { Orm } from "@novi/odoo-client";
import { describe, expect, it } from "vitest";

import { odooUp, session } from "./helpers.js";

/** P1.17.5: the single formatter consumes Odoo's own settings exactly as Odoo 20 sends them. */
describe.runIf(odooUp)("P1.17.5 formatter from live Odoo settings", () => {
  it("formats a real sale order total with the user's lang, tz and currency", async () => {
    const t = await session();
    const info = await t.getSessionInfo();
    const { lang_parameters } = await t.translations<{ lang_parameters: LangParameters }>(
      String(info.user_context?.lang ?? "en_US"),
    );
    const f = createFormatter({
      lang: lang_parameters,
      currencies: info.currencies as Record<string, CurrencyInfo>,
      tz: info.user_context?.tz as string | undefined,
    });

    const [order] = (
      await new Orm(t).webSearchRead<{
        amount_total: number;
        currency_id: { id: number };
        date_order: string;
      }>("sale.order", {
        specification: { amount_total: {}, currency_id: { fields: {} }, date_order: {} },
        domain: [["amount_total", ">", 1000]],
        limit: 1,
      })
    ).records;
    expect(order).toBeTruthy();
    expect(f.monetary(order!.amount_total, order!.currency_id.id)).toMatch(
      /^\$\u00a0\d{1,3}(,\d{3})*\.\d{2}$/,
    );
    expect(f.datetime(order!.date_order)).toMatch(/^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2} (AM|PM)$/);
  });
});
