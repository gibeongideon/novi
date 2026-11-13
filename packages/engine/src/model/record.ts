/**
 * One Odoo record in the engine (P2.5.1): values as `web_read` returns them, the user's changes on
 * top (dirty tracking), modifiers evaluated live with odoo-expr, the required check, and the
 * values `web_save` expects (x2many as commands, P2.5.4). Headless: React subscribes (P2.5.5).
 * Onchange (P2.6) and buttons/actions (P2.7–P2.8) build on this.
 */
import type { FieldInfo, OdooContext, Specification } from "@novi/odoo-client";
import { type EvalContext, safeEvaluate, truthy } from "@novi/odoo-expr";
import { type FieldNode, type ModelsInfo, type Modifier, viewFields, type ViewSchema } from "@novi/odoo-meta";

import { Observable, type Rpc } from "./observable.js";
import { X2ManyList } from "./x2many.js";

export type Values = Record<string, unknown>;

export interface RecordConfig {
  model: string;
  /** Field metadata per model, as `get_views` returns it (main and related models). */
  models: ModelsInfo;
  /** What to read and to read back after saving (from odoo-meta's buildSpec). */
  spec: Specification;
  /** The view showing the record: its field nodes carry the modifiers and drive validation. */
  schema?: ViewSchema;
  /** Context sent with every call (user + action). */
  context?: OdooContext;
  /** Base of the expression context (uid, allowed companies…); `context` is added. */
  evalContext?: EvalContext;
}

let virtualSeq = 0;

export class OdooRecord extends Observable {
  /** Database id; undefined until a new record is saved. */
  id: number | undefined;
  /** Stable key for new records (lists, x2many lines). */
  readonly virtualId: string;
  private data: Values = {};
  private changes: Values = {};
  private x2many = new Map<string, X2ManyList>();

  constructor(
    readonly rpc: Rpc,
    readonly config: RecordConfig,
    row: Values | undefined,
    /** The record holding this one when it is an x2many line (`parent` in expressions). */
    readonly parent?: OdooRecord,
  ) {
    super();
    this.virtualId = `virtual_${++virtualSeq}`;
    if (row) this.hydrate(row);
  }

  /** Reads one record with the configured specification. */
  static async load(rpc: Rpc, config: RecordConfig, id: number): Promise<OdooRecord> {
    const [row] = await rpc<Values[]>(config.model, "web_read", {
      ids: [id],
      kwargs: { specification: config.spec, context: config.context ?? {} },
    });
    if (!row) throw new Error(`${config.model} ${id} not found`);
    return new OdooRecord(rpc, config, row);
  }

  /** A new, unsaved record; `values` count as changes (defaults come from onchange, P2.6). */
  static create(rpc: Rpc, config: RecordConfig, values: Values = {}, parent?: OdooRecord): OdooRecord {
    const r = new OdooRecord(rpc, config, undefined, parent);
    r.hydrate({});
    r.update(values);
    return r;
  }

  get fields(): Record<string, FieldInfo> {
    return this.config.models[this.config.model]?.fields ?? {};
  }

  get isNew(): boolean {
    return this.id === undefined;
  }

  /** Current values: what was read, with the user's changes on top. */
  get values(): Values {
    return { ...this.data, ...this.changes, ...Object.fromEntries(this.x2many) };
  }

  /** The x2many list of a field (lines can be added, edited, removed; P2.5.4). */
  list(field: string): X2ManyList {
    const l = this.x2many.get(field);
    if (!l) throw new Error(`${field} is not an x2many field read by this view`);
    return l;
  }

  /** Sets values; many2one as `{ id, display_name }` or false. Setting a value back clears it. */
  update(changes: Values): void {
    for (const [name, value] of Object.entries(changes)) {
      if (this.x2many.has(name)) throw new Error(`use record.list("${name}") to change x2many lines`);
      if (same(value, this.data[name]) && name in this.data) delete this.changes[name];
      else this.changes[name] = value;
    }
    this.notify();
  }

  get dirty(): boolean {
    return Object.keys(this.changes).length > 0 || [...this.x2many.values()].some((l) => l.dirty);
  }

  dirtyFields(): string[] {
    return [...Object.keys(this.changes), ...[...this.x2many].filter(([, l]) => l.dirty).map(([k]) => k)];
  }

  /** Values as expressions see them: many2one → id, x2many → ids, reference → "model,id". */
  evalValues(): EvalContext {
    const out: EvalContext = { id: this.id ?? false };
    for (const [name, v] of Object.entries(this.values)) {
      const type = this.fields[name]?.type;
      if (v instanceof X2ManyList) out[name] = v.ids;
      else if (type === "many2one") out[name] = v && typeof v === "object" ? (v as { id: number }).id : false;
      else if (type === "reference" && v && typeof v === "object") {
        const r = (v as { id?: { id: number; model: string } }).id;
        out[name] = r ? `${r.model},${r.id}` : false;
      } else out[name] = (v ?? false) as never;
    }
    return out;
  }

  /** The full expression context: base (uid…), context, the record's values and its parent. */
  evalContext(): EvalContext {
    return {
      ...this.config.evalContext,
      context: (this.config.context ?? {}) as never,
      ...this.evalValues(),
      ...(this.parent ? { parent: this.parent.evalValues() as never } : {}),
    };
  }

  private holds(modifier: Modifier | undefined): boolean | undefined {
    if (modifier === undefined) return undefined;
    if (typeof modifier === "boolean") return modifier;
    return truthy(safeEvaluate(modifier, this.evalContext(), false));
  }

  isInvisible(node: FieldNode): boolean {
    return this.holds(node.invisible) ?? false;
  }

  /** The arch decides when it says so; otherwise the field's own metadata. */
  isReadonly(node: FieldNode): boolean {
    return this.holds(node.readonly) ?? !!this.fields[node.name]?.readonly;
  }

  isRequired(node: FieldNode): boolean {
    return this.holds(node.required) ?? !!this.fields[node.name]?.required;
  }

  /** Field nodes of the view, or plain nodes for every field read (no view given). */
  nodes(): FieldNode[] {
    return this.config.schema
      ? viewFields(this.config.schema)
      : Object.keys(this.config.spec).map((name) => ({ type: "field", name }));
  }

  /** Required fields without a value (visible ones only, as Odoo checks), and invalid lines. */
  invalidFields(): string[] {
    const out = new Set<string>();
    for (const node of this.nodes()) {
      if (this.isInvisible(node) || !this.isRequired(node)) continue;
      if (isEmpty(this.values[node.name], this.fields[node.name]?.type)) out.add(node.name);
    }
    for (const [name, list] of this.x2many)
      if (list.records.some((r) => r.invalidFields().length)) out.add(name);
    return [...out];
  }

  /** The changed values in `web_save` form (all values for a new record). */
  serializedChanges(): Values {
    const out: Values = {};
    for (const [name, v] of Object.entries(this.changes)) out[name] = serialize(v, this.fields[name]?.type);
    for (const [name, list] of this.x2many)
      if (list.dirty || (this.isNew && list.records.length)) out[name] = list.commands();
    return out;
  }

  /** Saves through `web_save` and reloads the saved values. False when required values are missing. */
  async save(): Promise<boolean> {
    if (this.invalidFields().length) return false;
    if (!this.dirty && !this.isNew) return true;
    const [row] = await this.rpc<Values[]>(this.config.model, "web_save", {
      ids: this.id ? [this.id] : [],
      kwargs: {
        vals: this.serializedChanges(),
        specification: this.config.spec,
        context: this.config.context ?? {},
      },
    });
    this.hydrate(row ?? {});
    this.notify();
    return true;
  }

  /** Forgets the user's changes, including x2many line edits. */
  discard(): void {
    this.changes = {};
    for (const l of this.x2many.values()) l.discard();
    this.notify();
  }

  /** Makes `row` the saved state: plain values, and x2many lists built from their rows. */
  private hydrate(row: Values): void {
    this.id = typeof row.id === "number" ? row.id : this.id;
    this.changes = {};
    this.data = {};
    this.x2many = new Map();
    for (const [name, sub] of Object.entries(this.config.spec)) {
      const meta = this.fields[name];
      if (meta?.type === "one2many" || meta?.type === "many2many") {
        const list = new X2ManyList(
          this,
          name,
          sub.fields ?? {},
          (row[name] as Values[] | number[] | undefined) ?? [],
        );
        list.subscribe(() => this.notify());
        this.x2many.set(name, list);
      } else this.data[name] = row[name] ?? false;
    }
    for (const [name, v] of Object.entries(row))
      if (!(name in this.data) && !this.x2many.has(name) && name !== "id") this.data[name] = v;
  }
}

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? false) === JSON.stringify(b ?? false);
}

/** Odoo's notion of "no value" per field type (0 and false are values for numbers/booleans). */
export function isEmpty(v: unknown, type?: string): boolean {
  if (type === "boolean") return false;
  if (v instanceof X2ManyList) return v.records.length === 0;
  if (type === "integer" || type === "float" || type === "monetary")
    return v === false || v === null || v === undefined;
  return v === false || v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0);
}

/** A value in the form `web_save` expects. */
function serialize(v: unknown, type?: string): unknown {
  if (type === "many2one") return v && typeof v === "object" ? (v as { id: number }).id : false;
  if (type === "reference" && v && typeof v === "object") {
    const r = (v as { id?: { id: number; model: string } }).id;
    return r ? `${r.model},${r.id}` : false;
  }
  return v ?? false;
}
