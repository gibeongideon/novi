/**
 * P2.1.4: every expression in every view of the dev Odoo parses, and evaluation matches Odoo's
 * own Python (safe_eval) on sampled values. The corpus is generated from the live Odoo into
 * .cache (`pnpm --filter @novi/odoo-expr corpus`) and never committed; skipped when absent.
 */
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { Domain, DomainError, evaluate, parse, PyDate, type PyValue } from "../src/index.js";

interface Sample {
  values: Record<string, PyValue>;
  parent: Record<string, PyValue>;
  context: Record<string, PyValue>;
  result?: unknown;
  error?: string;
  domain?: Oracle;
}
/** What Odoo's own Domain class made of a value: list form, Python text, negation, or an error. */
interface Oracle {
  list?: unknown;
  repr?: string;
  not?: unknown;
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
const corpus: {
  entries: Entry[];
  domainPairs: { a: PyValue; b: PyValue; and: unknown; or: unknown }[];
  domainSynthetic: { input: PyValue; odoo: Oracle }[];
} | null = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : null;

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

  /** Our Domain against Odoo's on one value; returns a description of the first difference. */
  const compare = (value: PyValue, odoo: Oracle, withRepr: boolean): string | null => {
    try {
      const d = Domain.from(value);
      if (odoo.error) return `accepted, Odoo raised ${odoo.error}`;
      const json = (v: unknown) => JSON.stringify(v);
      if (json(plain(d.toList())) !== json(odoo.list))
        return `list ${json(plain(d.toList()))} ≠ ${json(odoo.list)}`;
      if (json(plain(d.not().toList())) !== json(odoo.not))
        return `not ${json(plain(d.not().toList()))} ≠ ${json(odoo.not)}`;
      // JS has one number type: Odoo prints whole floats as `0.0`, NOVI as `0` (same value in a domain)
      if (withRepr && d.toString() !== odoo.repr?.replace(/(\d)\.0\b/g, "$1"))
        return `repr ${d.toString()} ≠ ${odoo.repr}`;
      return null;
    } catch (err) {
      if (err instanceof DomainError && odoo.error === err.pyType) return null;
      return `${(err as Error).message} (Odoo: ${odoo.error ?? "ok"})`;
    }
  };

  it("reads, prints and negates every view domain exactly like Odoo's Domain class", () => {
    const diffs: string[] = [];
    let total = 0;
    for (const e of entries)
      for (const s of e.samples ?? []) {
        if (!s.domain || !("result" in s)) continue;
        total++;
        const value = evaluate(e.expr, { ...s.values, context: s.context, uid: 2, parent: s.parent });
        const diff = compare(value, s.domain, true);
        if (diff) diffs.push(`${e.expr.replace(/\s+/g, " ").slice(0, 80)}: ${diff}`);
      }
    expect(total).toBeGreaterThan(1000);
    expect(diffs.slice(0, 10)).toEqual([]);
  });

  it("covers every operator Odoo registers, and its errors (synthetic cases from Odoo)", () => {
    const diffs = corpus!.domainSynthetic
      .map((c) => [c, compare(c.input, c.odoo, false)] as const)
      .filter(([, d]) => d)
      .map(([c, d]) => `${JSON.stringify(c.input)}: ${d}`);
    expect(diffs).toEqual([]);
  });

  it("combines like Domain.AND / Domain.OR on pairs of real domains", () => {
    const diffs: string[] = [];
    for (const p of corpus!.domainPairs) {
      const and = JSON.stringify(plain(Domain.and([p.a, p.b]).toList()));
      const or = JSON.stringify(plain(Domain.or([p.a, p.b]).toList()));
      if (and !== JSON.stringify(p.and)) diffs.push(`AND ${and} ≠ ${JSON.stringify(p.and)}`);
      if (or !== JSON.stringify(p.or)) diffs.push(`OR ${or} ≠ ${JSON.stringify(p.or)}`);
    }
    expect(corpus!.domainPairs.length).toBeGreaterThan(500);
    expect(diffs.slice(0, 10)).toEqual([]);
  });
});
