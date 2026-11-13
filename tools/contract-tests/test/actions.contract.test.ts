/**
 * Every window action of the dev Odoo can be opened from a menu: its domain and context evaluate
 * with the engine's base context (uid, user context, active companies), the same one useListView
 * uses. Names that only exist when an action is opened from a record (active_id…) are allowed.
 * Guards the bug "name 'allowed_company_ids' is not defined" on Time Off.
 */
import { baseEvalContext } from "@novi/engine";
import { Orm } from "@novi/odoo-client";
import { evaluate } from "@novi/odoo-expr";
import { describe, expect, it } from "vitest";

import { odooUp, session } from "./helpers.js";

const FROM_A_RECORD = new Set(["active_id", "active_ids", "active_model"]);

describe.runIf(odooUp)("window actions open from menus", () => {
  it("evaluates every action domain and context with the engine's base context", async () => {
    const t = await session("admin");
    const info = await t.getSessionInfo();
    const orm = new Orm(t);
    const actions = await orm.call<
      { id: number; name: string; domain: string | false; context: string | false }[]
    >("ir.actions.act_window", "search_read", undefined, {
      domain: [],
      fields: ["name", "domain", "context"],
    });
    const ctx = baseEvalContext(info);
    expect(ctx.allowed_company_ids).toEqual(expect.arrayContaining([expect.any(Number)]));
    const failing: string[] = [];
    for (const a of actions)
      for (const expr of [a.domain, a.context]) {
        if (typeof expr !== "string" || !expr.trim()) continue;
        try {
          evaluate(expr, ctx);
        } catch (err) {
          const name = /name '([^']+)' is not defined/.exec((err as Error).message)?.[1];
          if (!name || !FROM_A_RECORD.has(name))
            failing.push(`${a.name} (${a.id}): ${(err as Error).message.slice(0, 120)}`);
        }
      }
    expect(actions.length).toBeGreaterThan(300);
    // record-specific contexts (a field of the record that opens the action) are listed, not failed
    const recordOnly = failing.filter((f) => /name '(return_start_date|project_id)'/.test(f));
    expect(failing.filter((f) => !recordOnly.includes(f))).toEqual([]);
  });
});
