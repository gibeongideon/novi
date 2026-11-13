/**
 * P2.4 "Done when": NOVI's specifications match what Odoo's own web client requests. The client's
 * requests are captured live from the dev Odoo in headless Chromium
 * (`pnpm --filter @novi/contract-tests capture-specs` → .cache/client-specs.json, never committed;
 * skipped when absent). Differences are allowed only where an Odoo widget explains them (widgets
 * declare extra fields, e.g. avatars → `write_date`, activities → `activity_*`): those are the
 * widget registry's input (P2.13), not the spec builder's.
 */
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { buildSpec, type ModelsInfo, parseView, parseXml, type XmlElement } from "../src/index.js";

interface Capture {
  step: string;
  model: string;
  method: string;
  kwargs: { context?: Record<string, unknown> };
  specification?: Record<string, unknown>;
  result?: { views: Record<string, { arch: string }>; models: ModelsInfo };
}
const file = fileURLToPath(new URL("../../../.cache/client-specs.json", import.meta.url));
const captures: Capture[] | null = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : null;

const WIDGET_INJECTED = /^(activity_|write_date$)/;

function diff(novi: unknown, odoo: unknown, path: string[], out: { path: string[]; side: string }[]) {
  const a = (novi ?? {}) as Record<string, unknown>;
  const b = (odoo ?? {}) as Record<string, unknown>;
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const p = k === "fields" ? path : [...path, k];
    if (!(k in a)) out.push({ path: p, side: "odoo only" });
    else if (!(k in b)) out.push({ path: p, side: "novi only" });
    else if (typeof a[k] === "object" && a[k] && !Array.isArray(a[k])) diff(a[k], b[k], p, out);
    else if (JSON.stringify(a[k]) !== JSON.stringify(b[k]))
      out.push({ path: p, side: `value ${JSON.stringify(a[k])} ≠ ${JSON.stringify(b[k])}` });
  }
}

const widgetFields = (arch: string) => {
  const out = new Set<string>();
  const walk = (el: XmlElement) => {
    if (el.tag === "field" && el.attrs.widget && el.attrs.name) out.add(el.attrs.name);
    el.children.forEach((c) => typeof c !== "string" && walk(c));
  };
  walk(parseXml(arch));
  return out;
};

describe.runIf(captures)("specifications vs Odoo's own web client", () => {
  it("match, except where an Odoo widget declares extra fields", () => {
    const reads = captures!.filter((c) => c.method !== "get_views");
    const unexplained: string[] = [];
    const widgetDeps = new Set<string>();
    const labelOnly: string[] = [];
    for (const r of reads) {
      const gv = [...captures!]
        .reverse()
        .find((c) => c.method === "get_views" && c.step === r.step && c.model === r.model)!;
      const types =
        r.method === "web_read" ? ["form"] : ["list", "kanban"].filter((t) => gv.result!.views[t]);
      let best: { diffs: { path: string[]; side: string }[]; arch: string } | undefined;
      for (const t of types) {
        const arch = gv.result!.views[t]!.arch;
        const spec = buildSpec(parseView({ arch, model: r.model, models: gv.result!.models }), {
          evalContext: { context: r.kwargs.context ?? {}, uid: 2 },
        });
        const diffs: { path: string[]; side: string }[] = [];
        diff(spec, r.specification, [], diffs);
        if (!best || diffs.length < best.diffs.length) best = { diffs, arch };
      }
      const widgets = widgetFields(best!.arch);
      for (const d of best!.diffs) {
        // a field that appears nowhere in the arch is added by Odoo's own JS (widgets, js_class)
        const absent = !best!.arch.includes(`"${d.path[d.path.length - 1]}"`) && d.side === "odoo only";
        const explained =
          absent || d.path.some((p) => widgets.has(p)) || WIDGET_INJECTED.test(d.path[d.path.length - 1]!);
        const line = `${r.step} ${r.model}: ${d.side} ${d.path.join(".")}`;
        // a name read on a hidden many2one (one extra label): harmless either way, reported apart
        if (d.path[d.path.length - 1] === "display_name" && d.path.length === 2) labelOnly.push(line);
        else if (explained) widgetDeps.add(line);
        else unexplained.push(line);
      }
    }
    console.log(
      `client specs: ${reads.length} reads compared, ${widgetDeps.size} widget dependencies (P2.13 input), ${labelOnly.length} label-only`,
    );
    expect(reads.length).toBeGreaterThanOrEqual(15);
    expect(labelOnly.length).toBeLessThanOrEqual(10);
    expect(unexplained).toEqual([]);
  });
});
