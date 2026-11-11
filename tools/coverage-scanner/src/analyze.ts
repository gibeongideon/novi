/**
 * Pure analysis of Odoo view archs (no network): which view types, widgets and field types
 * a database actually uses, and how much of that the NOVI engine supports.
 */

export interface Supported {
  viewTypes: string[];
  widgets: string[];
  fieldTypes: string[];
  clientActions: string[];
}

export interface FieldMeta {
  type: string;
}

export interface Usage {
  /** view type → number of action views using it */
  viewTypes: Map<string, number>;
  /** widget name → occurrences (`widget="…"` on <field>) */
  widgets: Map<string, number>;
  /** field type (for <field> without explicit widget) → occurrences */
  fieldTypes: Map<string, number>;
  /** client action tag → number of actions */
  clientActions: Map<string, number>;
  /** widgets → example "model:viewType" locations (max 3) */
  examples: Map<string, Set<string>>;
}

export function emptyUsage(): Usage {
  return {
    viewTypes: new Map(),
    widgets: new Map(),
    fieldTypes: new Map(),
    clientActions: new Map(),
    examples: new Map(),
  };
}

const inc = (m: Map<string, number>, k: string, n = 1) => m.set(k, (m.get(k) ?? 0) + n);

/** Parses `key="value"` attributes of one XML start tag. */
export function parseAttrs(tagBody: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of tagBody.matchAll(/([\w:.-]+)\s*=\s*"([^"]*)"/g)) out[m[1]!] = m[2]!;
  for (const m of tagBody.matchAll(/([\w:.-]+)\s*=\s*'([^']*)'/g)) out[m[1]!] ??= m[2]!;
  return out;
}

/**
 * Records one arch into `usage`. `fields` is the model's field metadata from get_views,
 * used to classify <field> elements that rely on the default widget for their type.
 * Fields inside sub-views (x2many) reference other models; their type is looked up when known.
 */
export function analyzeArch(
  usage: Usage,
  viewType: string,
  arch: string,
  model: string,
  fields: Record<string, FieldMeta>,
  relatedFields: Record<string, Record<string, FieldMeta>> = {},
): void {
  inc(usage.viewTypes, viewType);
  // Kanban/QWeb templates contain <field> too; same rules apply.
  for (const m of arch.matchAll(/<field\b([^>]*?)\/?>/g)) {
    const attrs = parseAttrs(m[1] ?? "");
    const name = attrs.name;
    if (!name) continue;
    if (attrs.widget) {
      inc(usage.widgets, attrs.widget);
      const ex = usage.examples.get(attrs.widget) ?? new Set<string>();
      if (ex.size < 3) ex.add(`${model}:${viewType}`);
      usage.examples.set(attrs.widget, ex);
      continue;
    }
    const type = fields[name]?.type ?? findInRelated(relatedFields, name);
    if (type) inc(usage.fieldTypes, type);
  }
  // Widgets used outside <field> (e.g. <widget name="web_ribbon"/>)
  for (const m of arch.matchAll(/<widget\b([^>]*?)\/?>/g)) {
    const name = parseAttrs(m[1] ?? "").name;
    if (name) inc(usage.widgets, `<widget>${name}`);
  }
}

function findInRelated(related: Record<string, Record<string, FieldMeta>>, name: string): string | undefined {
  for (const f of Object.values(related)) if (f[name]) return f[name].type;
  return undefined;
}

export interface Coverage {
  label: string;
  supported: number;
  total: number;
  pct: number;
  missing: [string, number][];
}

/** Usage-weighted coverage: % of occurrences that the engine renders natively. */
export function coverage(label: string, used: Map<string, number>, supported: string[]): Coverage {
  const sup = new Set(supported);
  let total = 0;
  let ok = 0;
  const missing: [string, number][] = [];
  for (const [k, n] of used) {
    total += n;
    if (sup.has(k)) ok += n;
    else missing.push([k, n]);
  }
  missing.sort((a, b) => b[1] - a[1]);
  return { label, supported: ok, total, pct: total ? Math.round((ok / total) * 1000) / 10 : 100, missing };
}

export interface Report {
  db: string;
  odooVersion: string;
  generatedAt: string;
  counts: {
    windowActions: number;
    clientActions: number;
    serverActions: number;
    reports: number;
    views: number;
    errors: number;
  };
  coverage: Coverage[];
  examples: Record<string, string[]>;
  errors: string[];
}

export function toMarkdown(r: Report): string {
  const lines: string[] = [];
  lines.push(`# Coverage report: ${r.db}`, "");
  lines.push(`Odoo ${r.odooVersion} · generated ${r.generatedAt} · \`pnpm scan\``, "");
  lines.push(
    `Scanned **${r.counts.windowActions}** window actions (**${r.counts.views}** views), ` +
      `${r.counts.clientActions} client actions, ${r.counts.serverActions} server actions, ${r.counts.reports} reports.`,
    "",
  );
  lines.push("| Area | Native | Occurrences | Coverage |", "|---|---|---|---|");
  for (const c of r.coverage) lines.push(`| ${c.label} | ${c.supported} | ${c.total} | **${c.pct}%** |`);
  lines.push("");
  for (const c of r.coverage) {
    if (!c.missing.length) continue;
    lines.push(`## Missing ${c.label.toLowerCase()} (by usage)`, "");
    lines.push("| Name | Uses | Examples |", "|---|---|---|");
    for (const [name, n] of c.missing.slice(0, 40)) {
      lines.push(`| \`${name}\` | ${n} | ${(r.examples[name] ?? []).join(", ")} |`);
    }
    if (c.missing.length > 40) lines.push(`| … ${c.missing.length - 40} more | | |`);
    lines.push("");
  }
  if (r.errors.length) {
    lines.push(`## Scan errors (${r.errors.length})`, "");
    for (const e of r.errors.slice(0, 20)) lines.push(`- ${e}`);
    lines.push("");
  }
  return lines.join("\n");
}
