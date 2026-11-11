#!/usr/bin/env node
/**
 * novi-scan: walks every window action of an Odoo database, loads its real (inherited) views
 * with get_views, and reports what the NOVI engine renders natively.
 *
 *   pnpm scan [--url http://localhost:18069] [--db novi_demo] [--login admin] [--password admin] [--out docs/coverage]
 *
 * Credentials default to .cache/dev-credentials.json (written by pnpm odoo:seed).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { getVersion, JsonRpcTransport, Orm } from "@novi/odoo-client";

import {
  analyzeArch,
  coverage,
  emptyUsage,
  type FieldMeta,
  type Report,
  type Supported,
  toMarkdown,
} from "./analyze.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");

function arg(name: string, def?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : def;
}

interface Seed {
  users: Record<string, { login: string; password: string }>;
}
const seedFile = join(repoRoot, ".cache/dev-credentials.json");
const seed: Seed | null = existsSync(seedFile) ? (JSON.parse(readFileSync(seedFile, "utf8")) as Seed) : null;

const url = arg("url", process.env.ODOO_URL ?? "http://localhost:18069")!;
const db = arg("db", process.env.ODOO_DB ?? "novi_demo")!;
const login = arg("login", seed?.users.admin?.login ?? "admin")!;
const password = arg("password", seed?.users.admin?.password ?? "admin")!;
const outDir = resolve(repoRoot, arg("out", "docs/coverage")!);
const supported = JSON.parse(readFileSync(join(here, "../supported.json"), "utf8")) as Supported;

interface WindowAction {
  id: number;
  name: string;
  res_model: string;
  views: [number | false, string][];
}

async function main(): Promise<void> {
  const version = await getVersion({ baseUrl: url });
  const t = new JsonRpcTransport({ baseUrl: url, db });
  await t.authenticate(login, password);
  const orm = new Orm(t);

  const actions = await orm.call<WindowAction[]>("ir.actions.act_window", "search_read", undefined, {
    domain: [],
    fields: ["id", "name", "res_model", "views"],
  });
  const clientActions = await orm.call<{ tag: string }[]>("ir.actions.client", "search_read", undefined, {
    domain: [],
    fields: ["tag"],
  });
  const serverCount = await orm.searchCount("ir.actions.server");
  const reportCount = await orm.searchCount("ir.actions.report");

  const usage = emptyUsage();
  for (const c of clientActions) usage.clientActions.set(c.tag, (usage.clientActions.get(c.tag) ?? 0) + 1);

  const errors: string[] = [];
  let views = 0;
  let done = 0;
  for (const action of actions) {
    done++;
    if (done % 50 === 0) process.stderr.write(`  ${done}/${actions.length} actions\n`);
    const viewList = action.views.length ? action.views : [[false, "list"] as [false, string]];
    // search view is always loaded by the client alongside the action
    const req: [number | false, string][] = [...viewList, [false, "search"]];
    try {
      const res = await orm.getViews(action.res_model, req, { action_id: action.id });
      const models = res.models as Record<string, { fields: Record<string, FieldMeta> }>;
      const own = models[action.res_model]?.fields ?? {};
      const related = Object.fromEntries(
        Object.entries(models)
          .filter(([m]) => m !== action.res_model)
          .map(([m, v]) => [m, v.fields]),
      );
      for (const [type, view] of Object.entries(res.views)) {
        views++;
        analyzeArch(usage, type, view.arch, action.res_model, own, related);
      }
    } catch (err) {
      errors.push(
        `action ${action.id} (${action.res_model}): ${(err as Error).message.replace(/\s+/g, " ").slice(0, 160)}`,
      );
    }
  }

  const report: Report = {
    db,
    odooVersion: version.version,
    generatedAt: new Date().toISOString().slice(0, 16).replace("T", " ") + " UTC",
    counts: {
      windowActions: actions.length,
      clientActions: clientActions.length,
      serverActions: serverCount,
      reports: reportCount,
      views,
      errors: errors.length,
    },
    coverage: [
      coverage("View types", usage.viewTypes, supported.viewTypes),
      coverage("Widgets", usage.widgets, supported.widgets),
      coverage("Field types (default widget)", usage.fieldTypes, supported.fieldTypes),
      coverage("Client actions", usage.clientActions, supported.clientActions),
    ],
    examples: Object.fromEntries([...usage.examples].map(([k, v]) => [k, [...v]])),
    errors,
  };

  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, `${db}.json`), JSON.stringify(report, null, 2) + "\n");
  writeFileSync(join(outDir, `${db}.md`), toMarkdown(report));
  for (const c of report.coverage)
    console.log(`${c.label.padEnd(30)} ${String(c.pct).padStart(5)}%  (${c.supported}/${c.total})`);
  console.log(`Report → ${join(outDir, `${db}.md`)}  (${views} views, ${errors.length} errors)`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
