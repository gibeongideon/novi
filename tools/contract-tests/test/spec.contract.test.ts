/**
 * P2.4, live: for every form, list and kanban view of the dev Odoo, NOVI's specification reads
 * real records through NOVI's own client, and every expression in the view (show/hide, read-only,
 * required, field domains and contexts) evaluates on those rows without a missing field. That
 * proves "fields needed by modifiers" end to end: arch (P2.3) → spec (P2.4) → expressions (P2.1).
 * Uses the arch corpus in .cache (pnpm --filter @novi/odoo-meta corpus).
 */
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { Orm } from "@novi/odoo-client";
import { type EvalContext, evaluate } from "@novi/odoo-expr";
import { buildSpec, type ModelsInfo, parseView, recordEvalValues, type ViewSchema } from "@novi/odoo-meta";
import { describe, expect, it } from "vitest";

import { odooUp, session } from "./helpers.js";

const file = fileURLToPath(new URL("../../../.cache/arch-corpus.json", import.meta.url));
const corpus: {
  views: { id: number; xmlid: string; model: string; type: string; arch: string }[];
  models: ModelsInfo;
} | null = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : null;

/** Expressions of a view, with the sub-view schema they belong to (rows of x2many lists). */
function expressions(
  s: ViewSchema,
): { expr: string; where: string; sub?: { field: string; schema: ViewSchema } }[] {
  const out: ReturnType<typeof expressions> = [];
  const visit = (n: unknown, sub?: { field: string; schema: ViewSchema }): void => {
    if (!n || typeof n !== "object") return;
    if (Array.isArray(n)) return n.forEach((x) => visit(x, sub));
    const node = n as Record<string, unknown>;
    for (const k of ["invisible", "readonly", "required", "domain", "context"] as const)
      if (
        typeof node[k] === "string" &&
        (node.type === "field" || node.type === "button" || k === "invisible" || k === "readonly")
      )
        out.push({
          expr: node[k] as string,
          where: `${String(node.type)} ${String(node.name ?? "")} ${k}`,
          sub,
        });
    if (node.type === "field" && node.views) {
      const list = (node.views as Record<string, ViewSchema>).list;
      if (list) visit((list as { columns: unknown }).columns, { field: String(node.name), schema: list });
      return;
    }
    for (const [k, v] of Object.entries(node))
      if (k !== "fields" && k !== "views" && k !== "groupRows") visit(v, sub);
  };
  visit(
    s.viewType === "form"
      ? s.children
      : s.viewType === "list"
        ? s.columns
        : s.viewType === "kanban"
          ? s.card
          : [],
  );
  return out;
}

describe.runIf(odooUp && corpus)("P2.4 specifications on every view, live", () => {
  it("reads real records and every view expression finds its fields", async () => {
    const orm = new Orm(await session("admin"));
    const base: EvalContext = { uid: 2, allowed_company_ids: [1], current_company_id: 1 };
    const rejected: string[] = [];
    const missing = new Map<string, string>();
    let reads = 0;
    let rows = 0;
    let evaluated = 0;
    for (const v of corpus!.views.filter((x) => x.type !== "search")) {
      const schema = parseView({ arch: v.arch, model: v.model, models: corpus!.models });
      const specification = buildSpec(schema, { evalContext: { ...base, context: {} } });
      let records: Record<string, unknown>[];
      try {
        records = (
          await orm.webSearchRead(v.model, {
            specification,
            limit: 2,
            context: { bin_size: true, active_test: false },
          })
        ).records;
        reads++;
      } catch (err) {
        const msg = (err as Error).message;
        // Odoo refusing the read itself (access, a model needing an active record) is not a spec defect
        if (/Invalid field|not a valid field|specification|KeyError/i.test(msg))
          rejected.push(`${v.xmlid}: ${msg.slice(0, 160)}`);
        continue;
      }
      for (const rec of records) {
        rows++;
        const own = { ...base, context: {}, parent: {}, ...recordEvalValues(rec, schema.fields) };
        for (const e of expressions(schema)) {
          let ctx: EvalContext = own;
          if (e.sub) {
            const line = (rec[e.sub.field] as Record<string, unknown>[] | undefined)?.find(
              (x) => Object.keys(x).length > 1,
            );
            if (!line) continue;
            ctx = {
              ...base,
              context: {},
              ...recordEvalValues(line, e.sub.schema.fields),
              parent: own as never,
            };
          }
          evaluated++;
          try {
            evaluate(e.expr, ctx);
          } catch (err) {
            const m = /name '([^']+)' is not defined/.exec((err as Error).message);
            if (m && !missing.has(`${v.model}.${m[1]}`))
              missing.set(`${v.model}.${m[1]}`, `${v.xmlid} ${e.where}: ${e.expr.slice(0, 80)}`);
          }
        }
      }
    }
    console.log(
      `P2.4 live: ${reads} views read, ${rows} rows, ${evaluated} expressions evaluated, ${missing.size} missing names`,
    );
    if (rejected.length || missing.size) console.log([...rejected, ...missing.values()].join("\n"));
    expect(rejected).toEqual([]);
    expect([...missing.values()]).toEqual([]);
    expect(reads).toBeGreaterThan(900);
  }, 600_000);
});
