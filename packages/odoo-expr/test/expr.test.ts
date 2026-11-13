import { describe, expect, it } from "vitest";

import {
  evaluate,
  evaluateBool,
  ExprError,
  ExprSyntaxError,
  isTuple,
  parse,
  safeEvaluate,
} from "../src/index.js";

describe("odoo-expr semantics (Python rules)", () => {
  const rec = {
    state: "draft",
    partner_id: 7,
    line_ids: [3, 4],
    amount: 0,
    name: false,
    context: { lang: "en_US" },
  };

  it("evaluates the common arch modifiers", () => {
    expect(evaluateBool("state != 'draft'", rec)).toBe(false);
    expect(evaluateBool("state not in ('sale', 'done') or not partner_id", rec)).toBe(true);
    expect(evaluateBool("not line_ids", rec)).toBe(false);
    expect(evaluateBool("amount == 0 and name", rec)).toBe(false);
    expect(evaluateBool("line_ids.length > 1", rec)).toBe(true); // Odoo web-client convention
  });

  it("and/or return an operand; None is not False; True == 1", () => {
    expect(evaluate("name or 'x'", rec)).toBe("x");
    expect(evaluate("partner_id and line_ids", rec)).toEqual([3, 4]);
    expect(evaluate("None == False")).toBe(false);
    expect(evaluate("True == 1")).toBe(true);
    expect(evaluate("1 < 2 < 3 and not (3 < 2 < 4)")).toBe(true);
  });

  it("builds domains and contexts with tuples, lists, dicts, if-else and +", () => {
    const d = evaluate(
      "[('partner_id', '=', partner_id)] + ([('state', 'in', ['a'])] if state else [])",
      rec,
    ) as unknown[];
    expect(d).toEqual([
      ["partner_id", "=", 7],
      ["state", "in", ["a"]],
    ]);
    expect(isTuple(d[0])).toBe(true);
    expect(evaluate("(1,) == [1]")).toBe(false);
    expect(
      evaluate(
        "{'default_partner_id': partner_id, 'lang': context.get('lang'), 'x': context.get('nope', 3),}",
        rec,
      ),
    ).toEqual({ default_partner_id: 7, lang: "en_US", x: 3 });
    expect(evaluate("context['lang']", rec)).toBe("en_US");
    expect(evaluate("allowed_company_ids[0]", { allowed_company_ids: [1, 2] })).toBe(1);
    expect(evaluate("',nacha,'.lower() not in (codes or '').lower()", { codes: ",NACHA," })).toBe(false);
    expect(evaluate("self + '%'", { self: "AB" })).toBe("AB%");
  });

  it("reads the parent record and calls with keyword arguments", () => {
    expect(evaluate("parent.state == 'posted'", { parent: { state: "posted" } })).toBe(true);
    const today = new Date(2026, 0, 31);
    expect(evaluate("(context_today() + relativedelta(months=1)).strftime('%Y-%m-%d')", {}, { today })).toBe(
      "2026-02-28",
    );
    expect(evaluate("(context_today() - relativedelta(days=31)).strftime('%Y-%m-%d')", {}, { today })).toBe(
      "2025-12-31",
    );
  });

  it("raises where Python raises, and never crashes a view through safeEvaluate", () => {
    expect(() => evaluate("unknown_field")).toThrow(ExprError);
    expect(() => evaluate("name < 3", { name: "x" })).toThrow(ExprError);
    expect(() => parse("lambda x: x")).toThrow(ExprSyntaxError);
    expect(() => parse("[x for x in y]")).toThrow(ExprSyntaxError);
    const errors: string[] = [];
    expect(safeEvaluate("state ==", rec, false, (e) => errors.push(e.name))).toBe(false);
    expect(errors).toEqual(["ExprSyntaxError"]);
  });
});
