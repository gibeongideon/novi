/**
 * Specification builder (P2.4): which fields a view reads, in Odoo's `web_read` /
 * `web_search_read` format, nested for relational fields so one call loads a whole screen.
 * The rules follow what Odoo's own web client requests, observed live (capture-client-specs):
 *  - many2one: `{fields: {display_name: {}}}`, or `{fields: {}}` (id only) when hidden;
 *    reference fields read the target's name too;
 *  - x2many in a form: the rows of its inline list/kanban plus the fields of its inline form
 *    (the line dialog) (`limit`, `order`); elsewhere ids only,
 *    or names for tag-like widgets;
 *  - field contexts: the keys that don't need record values (each key evaluated on its own),
 *    none for hidden fields, the first occurrence's when a field appears several times;
 *  - forms always read `display_name` (breadcrumbs);
 *  - fields named by widget options (`currency_field`, `end_date_field`, …) are loaded;
 *  - every field an expression reads is loaded too (`get_views` adds most as invisible fields, not
 *    those of kanban card buttons or `parent.<field>` of sub-lists), proven on every view live.
 * Extra fields that particular widgets need (avatars, activities…) come from the widget
 * registry (P2.13), not from here.
 */
import type { FieldInfo, OdooContext, Specification } from "@novi/odoo-client";
import {
  type EvalContext,
  evaluate,
  evaluateNode,
  parse,
  type PyValue,
  referencedNames,
} from "@novi/odoo-expr";

import type { FieldNode, FormNode, ListSchema, ViewSchema } from "./schema.js";

/** Rows of an x2many sub-list read up front (Odoo's page size for embedded lists). */
export const X2MANY_LIMIT = 40;

export interface SpecOptions {
  /** Base evaluation context (user context, uid…) for field contexts. */
  evalContext?: EvalContext;
}

const SAME_RECORD_OPTIONS = ["currency_field", "start_date_field", "end_date_field"];
const NAME_WIDGETS = /tags|checkboxes|avatar|x2many_buttons/;

/** Names in Odoo's evaluation context that are not fields of the record. */
const NOT_FIELDS = new Set([
  "context",
  "uid",
  "parent",
  "self",
  "active_id",
  "active_ids",
  "active_model",
  "allowed_company_ids",
  "current_company_id",
  "context_today",
  "current_date",
  "today",
  "now",
  "relativedelta",
  "datetime",
  "time",
  "bool",
  "len",
  "ids",
  "id", // always returned
  "true",
  "false",
  "null",
]);

/** Every field node of a view that is read with the records (sub-views excluded: nested specs). */
export function viewFields(s: ViewSchema): FieldNode[] {
  const out: FieldNode[] = [];
  const walk = (nodes: readonly unknown[]): void => {
    for (const n of nodes as FormNode[]) {
      if (n.type === "field") out.push(n);
      else if (n.type === "notebook") n.pages.forEach((p) => walk(p.children));
      else if ("children" in n && n.children) walk(n.children);
    }
  };
  if (s.viewType === "form") walk(s.children);
  else if (s.viewType === "list") walk(s.columns);
  else if (s.viewType === "kanban") {
    // declared at the kanban root or read by the card templates: used by the card, not hidden
    for (const name of [...s.extraFields, ...s.templateFields]) out.push({ type: "field", name });
    walk([...s.card.main, ...s.card.aside, ...s.card.footer]);
  }
  return out;
}

/** Every expression a view evaluates per record (modifiers, field domains/contexts, decorations). */
function expressionsOf(schema: ViewSchema): string[] {
  const out: string[] = [];
  const visit = (n: unknown): void => {
    if (!n || typeof n !== "object") return;
    if (Array.isArray(n)) return n.forEach(visit);
    const node = n as Record<string, unknown>;
    for (const k of [
      "invisible",
      "readonly",
      "required",
      "columnInvisible",
      "domain",
      "context",
      "optionsExpr",
    ])
      if (typeof node[k] === "string") out.push(node[k] as string);
    if (node.decorations) out.push(...Object.values(node.decorations as Record<string, string>));
    for (const [k, v] of Object.entries(node))
      if (k !== "fields" && k !== "views" && k !== "groupRows") visit(v);
  };
  if (schema.viewType === "form") visit(schema.children);
  else if (schema.viewType === "list") visit([schema.columns, { decorations: schema.decorations }]);
  else if (schema.viewType === "kanban") visit(schema.card);
  return out;
}

/** The parts of a field's context that don't depend on the record (Odoo evaluates key by key). */
function staticContext(expr: string, opts: SpecOptions): OdooContext | undefined {
  const ctx = opts.evalContext ?? { context: {}, uid: 0 };
  try {
    const node = parse(expr);
    if (node.t !== "dict") {
      const v = evaluate(expr, ctx);
      return v && typeof v === "object" && !Array.isArray(v) ? (v as OdooContext) : undefined;
    }
    const out: OdooContext = {};
    for (const [k, v] of node.entries) {
      try {
        out[String(evaluateNode(k, ctx))] = evaluateNode(v, ctx);
      } catch {
        // reads record values: applied when the user edits, not when reading
      }
    }
    return Object.keys(out).length ? out : undefined;
  } catch {
    return undefined;
  }
}

/** `"date desc, name"` → `"date DESC, name ASC"` (how Odoo's client sends orders). */
export function normalizeOrder(order: string): string {
  return order
    .split(",")
    .map((part) => {
      const [field, dir] = part.trim().split(/\s+/);
      return `${field} ${dir?.toUpperCase() === "DESC" ? "DESC" : "ASC"}`;
    })
    .join(", ");
}

/** Sub-list order: its `default_order`, else its drag handle, else the model's own order. */
function subOrder(sub: ViewSchema): string | undefined {
  if (sub.viewType !== "list" && sub.viewType !== "kanban") return undefined;
  if (sub.defaultOrder) return normalizeOrder(sub.defaultOrder);
  if (sub.viewType !== "list") return undefined;
  const handle = (sub as ListSchema).columns.find((c) => c.type === "field" && c.widget === "handle");
  return handle && handle.type === "field" ? `${handle.name} ASC, id ASC` : undefined;
}

/** Merges two specs of the same field: fields to read merge; the context is the first one's. */
function merge(a: Specification[string], b: Specification[string]): Specification[string] {
  const out = { ...a, ...b };
  if (a.context) out.context = a.context;
  else delete out.context;
  if (a.fields || b.fields) {
    out.fields = { ...a.fields };
    for (const [k, v] of Object.entries(b.fields ?? {}))
      out.fields[k] = out.fields[k] ? merge(out.fields[k]!, v) : v;
  }
  if (a.limit !== undefined && b.limit !== undefined) out.limit = Math.max(a.limit, b.limit);
  return out;
}

interface Built {
  spec: Specification;
  /** `parent.<field>` reads of this (sub-)view: the parent record must load them. */
  parentFields: string[];
}

function build(schema: ViewSchema, opts: SpecOptions): Built {
  const spec: Specification = {};
  const fromChildren: string[] = [];
  const inForm = schema.viewType === "form";

  const fieldSpec = (node: FieldNode): Specification[string] => {
    const s: Specification[string] = {};
    const type = schema.fields[node.name]?.type;
    const relational = type === "many2one" || type === "one2many" || type === "many2many";
    const hidden = node.invisible === true || node.columnInvisible === true;
    if (type === "many2one") s.fields = hidden ? {} : { display_name: {} };
    // reference fields point at any model: read the target's name to show it
    if ((type === "reference" || type === "many2one_reference") && !hidden) s.fields = { display_name: {} };
    if (type === "one2many" || type === "many2many") {
      const modes = (node.mode ?? "list").split(",").map((m) => m.trim()) as ("list" | "kanban")[];
      const sub = inForm
        ? (modes.map((m) => node.views?.[m]).find(Boolean) ?? node.views?.list ?? node.views?.kanban)
        : undefined;
      if (sub) {
        const inner = build(sub, opts);
        fromChildren.push(...inner.parentFields);
        s.fields = inner.spec;
        // the line's inline form (edit dialog) is read up front too, so opening a line costs no call
        const lineForm = node.views?.form;
        if (lineForm) {
          const f = build(lineForm, opts);
          fromChildren.push(...f.parentFields);
          delete f.spec.display_name;
          // many2one shown only in the dialog: id now, its name when the dialog opens (as Odoo)
          for (const [k, v] of Object.entries(f.spec))
            if (!s.fields[k] && lineForm.fields[k]?.type === "many2one") f.spec[k] = { ...v, fields: {} };
          for (const [k, v] of Object.entries(f.spec)) s.fields[k] = s.fields[k] ? merge(s.fields[k]!, v) : v;
        }
        s.limit = (sub.viewType === "list" && sub.limit) || X2MANY_LIMIT;
        const order = subOrder(sub);
        if (order) s.order = order;
      } else if ((inForm && !hidden) || (node.widget && NAME_WIDGETS.test(node.widget)))
        s.fields = { display_name: {} };
      // tag colours live on the related records
      const colorField = node.options?.color_field;
      if (typeof colorField === "string" && s.fields) s.fields[colorField] = {};
    }
    // a hidden field sends no context (it is never edited from here)
    if (relational && node.context && !hidden) {
      const ctx = staticContext(node.context, opts);
      if (ctx) s.context = ctx;
    }
    return s;
  };

  for (const node of viewFields(schema)) {
    const s = fieldSpec(node);
    spec[node.name] = spec[node.name] ? merge(spec[node.name]!, s) : s;
  }

  // fields that expressions read but the view doesn't show
  const need = (name: string) => {
    if (NOT_FIELDS.has(name) || spec[name]) return;
    spec[name] = schema.fields[name]?.type === "many2one" ? { fields: {} } : {};
  };
  const parentFields = new Set<string>();
  for (const expr of expressionsOf(schema)) {
    try {
      const r = referencedNames(expr);
      r.names.forEach(need);
      r.parentFields.forEach((f) => parentFields.add(f));
    } catch {
      // unparsable expressions are reported where they are evaluated
    }
  }
  fromChildren.forEach(need);
  // widget options that name another field of the same record (other `*_field` options, like
  // fold_field or icon_field, name fields of a related model)
  for (const node of viewFields(schema))
    for (const k of SAME_RECORD_OPTIONS) {
      const v = node.options?.[k];
      if (typeof v === "string") need(v);
    }
  if (inForm) spec.display_name ??= {};
  return { spec, parentFields: [...parentFields].filter((f) => !NOT_FIELDS.has(f)) };
}

/** The `specification` that reads everything a form, list or kanban view shows. */
export function buildSpec(schema: ViewSchema, opts: SpecOptions = {}): Specification {
  return build(schema, opts).spec;
}

/**
 * A row from `web_read` as expressions see it (Odoo's record evaluation context): many2one → id
 * or false, x2many → list of ids, reference → "model,id"; other values unchanged.
 */
export function recordEvalValues(
  values: Record<string, unknown>,
  fields: Record<string, FieldInfo>,
): EvalContext {
  const out: EvalContext = {};
  for (const [name, v] of Object.entries(values)) {
    const type = fields[name]?.type;
    if (type === "many2one")
      out[name] =
        v && typeof v === "object" ? ((v as { id: number }).id ?? false) : ((v as PyValue) ?? false);
    else if (type === "one2many" || type === "many2many")
      out[name] = Array.isArray(v)
        ? v.map((x) => (x && typeof x === "object" ? (x as { id: number }).id : (x as number)))
        : [];
    else if (type === "reference" && v && typeof v === "object") {
      const r = v as { id?: { id: number; model: string } };
      out[name] = r.id ? `${r.id.model},${r.id.id}` : false;
    } else out[name] = (v ?? false) as PyValue;
  }
  return out;
}
