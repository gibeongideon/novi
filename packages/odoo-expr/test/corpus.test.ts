/**
 * P2.1.4: every expression in every view of the dev Odoo parses, and evaluation matches Odoo's
 * own Python (safe_eval) on sampled values. The corpus is generated from the live Odoo into
 * .cache (`pnpm --filter @novi/odoo-expr corpus`) and never committed; skipped when absent.
 */
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { evaluate, parse, PyDate, type PyValue } from "../src/index.js";

interface Sample {
  values: Record<string, PyValue>;
  parent: Record<string, PyValue>;
  context: Record<string, PyValue>;
  result?: unknown;
  error?: string;
}
interface Entry {
  expr: string;
  kind: string;
  model: string;
  dynamic: boolean;
  samples?: Sample[];
}

const file = fileURLToPath(new URL("../../../.cache/expr-corpus.json", import.meta.url));
const corpus: { entries: Entry[] } | null = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : null;

/** Python's JSON view of a value: tuples are lists, dates are not expected here. */
const plain = (v: PyValue): unknown =>
  Array.isArray(v)
    ? v.map(plain)
    : v instanceof PyDate
      ? v.strftime("%Y-%m-%d")
      : v && typeof v === "object"
        ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, plain(x as PyValue)]))
        : v;

if (!corpus && process.env.CONTRACT_REQUIRED)
  it("needs the expression corpus (pnpm --filter @novi/odoo-expr corpus)", () => {
    throw new Error(`missing ${file}`);
  });

describe.runIf(corpus)("odoo-expr corpus (all views of Odoo 20)", () => {
  const entries = corpus!.entries;

  it("parses 100% of the expressions", () => {
    const failures = entries.filter((e) => {
      try {
        parse(e.expr);
        return false;
      } catch {
        return true;
      }
    });
    expect(failures.map((e) => e.expr)).toEqual([]);
    expect(entries.length).toBeGreaterThan(1000);
  });

  it("evaluates like Odoo's Python on ≥ 99% of sampled values", () => {
    let total = 0;
    const mismatches: string[] = [];
    for (const e of entries) {
      for (const s of e.samples ?? []) {
        if (!("result" in s)) continue; // dynamic (clock) or Python itself refused
        total++;
        const ctx = { ...s.values, context: s.context, uid: 2, parent: s.parent };
        let got: unknown;
        try {
          got = plain(evaluate(e.expr, ctx));
        } catch (err) {
          got = `!${(err as Error).message}`;
        }
        if (JSON.stringify(got) !== JSON.stringify(s.result))
          mismatches.push(
            `${e.expr.replace(/\s+/g, " ").slice(0, 100)} → ${JSON.stringify(got)?.slice(0, 80)} ≠ ${JSON.stringify(s.result)?.slice(0, 80)}`,
          );
      }
    }
    const parity = 1 - mismatches.length / total;
    if (mismatches.length)
      console.log(
        `parity ${(parity * 100).toFixed(2)}% (${total} samples)\n${mismatches.slice(0, 15).join("\n")}`,
      );
    expect(total).toBeGreaterThan(5000);
    expect(parity).toBeGreaterThanOrEqual(0.99);
  });
});
