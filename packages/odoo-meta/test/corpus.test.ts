/**
 * P2.3.8: every primary form, list, kanban and search view of the dev Odoo parses into a schema,
 * losslessly for fields, and every field resolves to the metadata get_views returned. The corpus
 * comes from the live Odoo into .cache (`pnpm --filter @novi/odoo-meta corpus`), never committed;
 * so instead of snapshots (which would be Odoo-derived files) the test checks invariants.
 */
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { type ModelsInfo, parseView, parseXml, type ViewSchema, type XmlElement } from "../src/index.js";

interface View {
  id: number;
  xmlid: string;
  model: string;
  type: string;
  arch: string;
}
const file = fileURLToPath(new URL("../../../.cache/arch-corpus.json", import.meta.url));
const corpus: { views: View[]; models: ModelsInfo } | null = existsSync(file)
  ? JSON.parse(readFileSync(file, "utf8"))
  : null;

if (!corpus && process.env.CONTRACT_REQUIRED)
  it("needs the arch corpus (pnpm --filter @novi/odoo-meta corpus)", () => {
    throw new Error(`missing ${file}`);
  });

/** Field names in the schema, with the model they must belong to (sub-views use the comodel). */
function schemaFields(s: ViewSchema, out: [string, string][] = []): [string, string][] {
  const visit = (n: unknown): void => {
    if (!n || typeof n !== "object") return;
    if (Array.isArray(n)) return n.forEach(visit);
    const node = n as Record<string, unknown>;
    if (node.type === "field" && typeof node.name === "string") {
      out.push([s.model, node.name]);
      for (const sub of Object.values((node.views ?? {}) as Record<string, ViewSchema>))
        schemaFields(sub, out);
      return;
    }
    for (const [k, v] of Object.entries(node)) if (k !== "fields" && k !== "views") visit(v);
  };
  if (s.viewType === "search") {
    s.searchFields.forEach((f) => out.push([s.model, f.name]));
    s.panel.forEach((p) => out.push([s.model, p.name]));
  } else if (s.viewType === "kanban") {
    s.extraFields.forEach((f) => out.push([s.model, f]));
    visit(s.card);
  } else if (s.viewType === "list") {
    visit([s.columns, s.headerButtons]);
    for (const g of Object.values(s.groupRows))
      schemaFields({ ...s, model: g.model, columns: g.nodes, headerButtons: [], groupRows: {} }, out);
  } else visit(s.children);
  return out;
}

/** `<field>` elements the schema must keep (kanban: card template + declarations; not other templates). */
function archFields(root: XmlElement): number {
  const count = (el: XmlElement): number =>
    (el.tag === "field" ? 1 : 0) +
    el.children.reduce((n, c) => n + (typeof c === "string" ? 0 : count(c)), 0);
  if (root.tag !== "kanban") {
    // search filters/groups hold no fields; searchpanel fields are counted
    return count(root);
  }
  let n = 0;
  for (const el of root.children) {
    if (typeof el === "string") continue;
    if (el.tag === "field") n++;
    if (el.tag === "card") n += count(el);
    if (el.tag === "templates")
      for (const t of el.children) if (typeof t !== "string" && t.attrs["t-name"] === "card") n += count(t);
  }
  return n;
}

describe.runIf(corpus)("odoo-meta: every view of the dev Odoo", () => {
  const views = corpus!.views;
  const parsed: [View, ViewSchema][] = [];

  it("parses every view into a schema without errors", () => {
    const failures: string[] = [];
    for (const v of views) {
      try {
        parsed.push([v, parseView({ arch: v.arch, model: v.model, models: corpus!.models })]);
      } catch (err) {
        failures.push(`${v.xmlid || v.id} (${v.type}): ${(err as Error).message}`);
      }
    }
    expect(failures).toEqual([]);
    expect(parsed.length).toBeGreaterThan(1000);
  });

  it("keeps every field of the arch (lossless)", () => {
    const lost = parsed
      .filter(([v, s]) => schemaFields(s).length !== archFields(parseXml(v.arch)))
      .map(
        ([v, s]) =>
          `${v.xmlid || v.id}: arch ${archFields(parseXml(v.arch))} ≠ schema ${schemaFields(s).length}`,
      );
    expect(lost).toEqual([]);
  });

  it("resolves every field to the metadata get_views returned (P2.3.7)", () => {
    const missing = new Set<string>();
    for (const [, s] of parsed)
      for (const [model, name] of schemaFields(s))
        if (!corpus!.models[model]?.fields[name]) missing.add(`${model}.${name}`);
    expect([...missing]).toEqual([]);
  });
});
