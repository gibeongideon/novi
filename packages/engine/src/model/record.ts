/**
 * One Odoo record in the engine (P2.5.1, P2.6): values as `web_read` returns them, the user's
 * changes on top (dirty tracking), modifiers evaluated live with odoo-expr, the required check,
 * the values `web_save` expects (x2many as commands, P2.5.4), and onchange the way Odoo's own
 * client does it (observed in its sources, not copied):
 *  - a new record asks `onchange(values, [], spec)` for its defaults; a new line asks its own model,
 *    with the parent's changes under the inverse field (`order_id`);
 *  - changing a field marked `on_change` asks `onchange(changes, [field], spec)`; a line's change
 *    asks the line model, then the parent's onchange on the x2many field;
 *  - onchanges run one at a time; names arriving meanwhile go into one follow-up call; an answer
 *    never overwrites a value the user changed after the request left (P2.6.4).
 * Headless: React subscribes (P2.5.5).
 */
import type { FieldInfo, OdooContext, Specification } from "@novi/odoo-client";
import { type EvalContext, safeEvaluate, truthy } from "@novi/odoo-expr";
import { type FieldNode, type ModelsInfo, type Modifier, viewFields, type ViewSchema } from "@novi/odoo-meta";

import { Observable, type Rpc } from "./observable.js";
import { type Command, X2ManyList } from "./x2many.js";

export type Values = Record<string, unknown>;

/** Odoo's onchange warning (`type`: "dialog" or "notification"). */
export interface OnchangeWarning {
  title: string;
  message: string;
  type?: string;
}

export interface RecordConfig {
  model: string;
  /** Field metadata per model, as `get_views` returns it (main and related models). */
  models: ModelsInfo;
  /** What to read and to read back after saving (from odoo-meta's buildSpec). */
  spec: Specification;
  /** The view showing the record: its field nodes carry modifiers, `on_change` flags, validation. */
  schema?: ViewSchema;
  /** Context sent with every call (user + action). */
  context?: OdooContext;
  /** Base of the expression context (uid, allowed companies…); `context` is added. */
  evalContext?: EvalContext;
  /** x2many lines: the parent's x2many field and the line model's inverse field (`order_id`). */
  parentField?: string;
  relationField?: string;
  /** Onchange warnings, for the UI to show as a dialog or a notification (P2.6.3). */
  onWarning?(warning: OnchangeWarning): void;
}

let virtualSeq = 0;

export class OdooRecord extends Observable {
  /** Database id; undefined until a new record is saved. */
  id: number | undefined;
  /** Stable key for new records (lists, x2many lines, onchange commands). */
  readonly virtualId: string;
  private data: Values = {};
  private changes: Values = {};
  private x2many = new Map<string, X2ManyList>();
  /** Onchange serialisation: the running call, the names waiting for the next one. */
  private running: Promise<void> = Promise.resolve();
  private queued = new Set<string>();
  private busy = false;
  /** Per field: the edit counter value of the user's last change (race guard). */
  private editedAt = new Map<string, number>();
  private edits = 0;
  /** Values a widget couldn't accept (e.g. "12,3.4" in a number field): field → message. */
  private parseErrors = new Map<string, string>();

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

  /** A new, unsaved record without asking Odoo; `values` count as changes. */
  static create(rpc: Rpc, config: RecordConfig, values: Values = {}, parent?: OdooRecord): OdooRecord {
    const r = new OdooRecord(rpc, config, undefined, parent);
    r.hydrate({});
    r.applyServerValues(values);
    return r;
  }

  /** A new record with Odoo's defaults (`onchange` with no field names, P2.6.1). */
  static async createWithDefaults(rpc: Rpc, config: RecordConfig, parent?: OdooRecord): Promise<OdooRecord> {
    const r = OdooRecord.create(rpc, config, {}, parent);
    const result = await rpc<{ value?: Values; warning?: OnchangeWarning }>(config.model, "onchange", {
      ids: [],
      kwargs: {
        values: r.onchangeValues(),
        field_names: [],
        fields_spec: config.spec,
        context: config.context ?? {},
      },
    });
    if (result.warning) config.onWarning?.(result.warning);
    r.applyServerValues(result.value ?? {});
    return r;
  }

  get fields(): Record<string, FieldInfo> {
    return this.config.models[this.config.model]?.fields ?? {};
  }

  get isNew(): boolean {
    return this.id === undefined;
  }

  /** Current values: what was read, with the changes on top. */
  get values(): Values {
    return { ...this.data, ...this.changes, ...Object.fromEntries(this.x2many) };
  }

  /** The x2many list of a field (lines can be added, edited, removed; P2.5.4). */
  list(field: string): X2ManyList {
    const l = this.x2many.get(field);
    if (!l) throw new Error(`${field} is not an x2many field read by this view`);
    return l;
  }

  /**
   * The user sets values (many2one as `{ id, display_name }` or false). Setting a value back
   * clears it. Fields marked `on_change` in the view then ask Odoo for their consequences.
   */
  update(changes: Values): void {
    for (const name of Object.keys(changes)) {
      this.editedAt.set(name, ++this.edits);
      this.parseErrors.delete(name);
    }
    this.setValues(changes);
    this.notify();
    const names = Object.keys(changes).filter((n) => this.triggersOnchange(n));
    if (names.length) this.scheduleOnchange(names);
    this.tellParent();
  }

  /**
   * A line tells its parent it changed, after its own onchange has answered (as Odoo's client
   * does): the parent's onchange must see the line's new values (price, taxes), not the old ones.
   */
  private tellParent(): void {
    if (!this.parent || !this.config.parentField) return;
    const parent = this.parent;
    const field = this.config.parentField;
    if (this.busy) void this.idle().then(() => parent.linesChanged(field));
    else parent.linesChanged(field);
  }

  /** A line of one of this record's x2many fields was added, edited or removed. */
  linesChanged(field: string): void {
    this.editedAt.set(field, ++this.edits);
    this.notify();
    if (this.triggersOnchange(field)) this.scheduleOnchange([field]);
    this.tellParent();
  }

  /** Resolves when no onchange is running or waiting, here or in any line. */
  async idle(): Promise<void> {
    do await this.running;
    while (this.busy || this.queued.size);
    for (const l of this.x2many.values()) for (const r of l.records) await r.idle();
    if (this.busy || this.queued.size) await this.idle();
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

  /**
   * A widget reports a value it can't turn into a field value (P2.7.2): the field shows the
   * message and saving is refused until the user corrects it (any `update` of the field).
   */
  markInvalid(field: string, message: string): void {
    this.parseErrors.set(field, message);
    this.notify();
  }

  /** The message to show under a field: the widget's parse error, if any. */
  fieldError(field: string): string | undefined {
    return this.parseErrors.get(field);
  }

  /** Required fields without a value (visible ones only, as Odoo checks), unparsable values, invalid lines. */
  invalidFields(): string[] {
    const out = new Set<string>(this.parseErrors.keys());
    for (const node of this.nodes()) {
      if (this.isInvisible(node) || !this.isRequired(node)) continue;
      if (node.name === this.config.relationField) continue; // a line's link to its parent is set by saving the parent
      if (isEmpty(this.values[node.name], this.fields[node.name]?.type)) out.add(node.name);
    }
    for (const [name, list] of this.x2many)
      if (list.records.some((r) => r.invalidFields().length)) out.add(name);
    return [...out];
  }

  /**
   * The changed values in `web_save` form (all values for a new record). For saving, read-only
   * fields are left out unless the view forces them (`force_save`), as Odoo's client does;
   * onchange calls get them all.
   */
  serializedChanges(purpose: "save" | "onchange" = "save"): Values {
    const out: Values = {};
    const nodes = purpose === "save" && this.config.schema ? this.nodes() : [];
    const skip = (name: string) => {
      if (purpose !== "save" || !this.config.schema) return false;
      const own = nodes.filter((n) => n.name === name);
      // not in the view (read for the spec only): its metadata decides (display_name, computed fields)
      if (!own.length) return !!this.fields[name]?.readonly;
      return own.every((n) => this.isReadonly(n) && !n.forceSave);
    };
    for (const [name, v] of Object.entries(this.changes))
      if (!skip(name)) out[name] = serialize(v, this.fields[name]?.type);
    for (const [name, list] of this.x2many)
      if ((list.dirty || (this.isNew && list.records.length)) && !skip(name))
        out[name] = list.commands(purpose);
    return out;
  }

  /** What an onchange call sends: this record's changes, and for a line its parent's under the inverse field. */
  onchangeValues(): Values {
    const values = this.serializedChanges("onchange");
    if (this.parent && this.config.relationField) {
      values[this.config.relationField] = {
        ...this.parent.onchangeValues(),
        ...(this.parent.id ? { id: this.parent.id } : {}),
      };
    }
    return values;
  }

  /** Saves through `web_save` and reloads the saved values. False when required values are missing. */
  async save(): Promise<boolean> {
    await this.idle();
    if (this.invalidFields().length) return false;
    if (!this.dirty && !this.isNew) return true;
    const [row] = await this.rpc<Values[]>(this.config.model, "web_save", {
      ids: this.id ? [this.id] : [],
      kwargs: {
        vals: this.serializedChanges("save"),
        specification: this.config.spec,
        context: this.config.context ?? {},
      },
    });
    this.hydrate(row ?? {});
    this.notify();
    return true;
  }

  /** Reads the record again (after an action changed it on the server); drops unsaved changes. */
  async reload(): Promise<void> {
    if (this.isNew) return;
    const [row] = await this.rpc<Values[]>(this.config.model, "web_read", {
      ids: [this.id!],
      kwargs: { specification: this.config.spec, context: this.config.context ?? {} },
    });
    if (row) this.hydrate(row);
    this.parseErrors.clear();
    this.notify();
  }

  /** Deletes the record (`web_unlink`). */
  async delete(): Promise<void> {
    if (this.isNew) return;
    await this.rpc(this.config.model, "web_unlink", {
      ids: [this.id!],
      kwargs: { context: this.config.context ?? {} },
    });
  }

  /** Duplicates the saved record (`copy`); returns the new record's id. */
  async duplicate(): Promise<number> {
    if (this.isNew) throw new Error("Save the record before duplicating it");
    const [id] = await this.rpc<number[]>(this.config.model, "copy", {
      ids: [this.id!],
      kwargs: { context: this.config.context ?? {} },
    });
    return id!;
  }

  /**
   * Archives or restores the record through the model's own method (`action_archive` /
   * `action_unarchive`), then reloads it. Returns what Odoo returned: some models answer with an
   * action (a wizard, a warning) for the action manager to run.
   */
  async setArchived(archived: boolean): Promise<unknown> {
    if (this.isNew) throw new Error("Save the record before archiving it");
    const result = await this.rpc(this.config.model, archived ? "action_archive" : "action_unarchive", {
      ids: [this.id!],
      kwargs: { context: this.config.context ?? {} },
    });
    await this.reload();
    return result;
  }

  /** Forgets the user's changes, including x2many line edits. */
  discard(): void {
    this.parseErrors.clear();
    this.changes = {};
    for (const l of this.x2many.values()) l.discard();
    this.notify();
  }

  /**
   * Values from Odoo (defaults, onchange results) in `web_read` form; x2many as commands.
   * They become changes (they are saved with the record) but trigger no further onchange.
   */
  applyServerValues(values: Values, skipEditedAfter?: number): void {
    const plain: Values = {};
    for (const [name, v] of Object.entries(values)) {
      if (skipEditedAfter !== undefined && (this.editedAt.get(name) ?? 0) > skipEditedAfter) continue; // the user changed it since
      const list = this.x2many.get(name);
      if (list) list.applyCommands(v as Command[]);
      else plain[name] = v;
    }
    this.setValues(plain);
    this.notify();
  }

  private setValues(changes: Values): void {
    for (const [name, value] of Object.entries(changes)) {
      if (this.x2many.has(name)) throw new Error(`use record.list("${name}") to change x2many lines`);
      if (!this.isNew && name in this.data && same(value, this.data[name])) delete this.changes[name];
      else this.changes[name] = value;
    }
  }

  private triggersOnchange(name: string): boolean {
    return this.nodes().some((n) => n.name === name && n.onChange);
  }

  /** Queues an onchange; names arriving while one runs are merged into the next call. */
  private scheduleOnchange(names: string[]): void {
    names.forEach((n) => this.queued.add(n));
    if (this.busy) return;
    this.busy = true;
    this.running = (async () => {
      try {
        while (this.queued.size) {
          const fieldNames = [...this.queued];
          this.queued.clear();
          await this.runOnchange(fieldNames);
        }
      } finally {
        this.busy = false;
      }
    })();
  }

  private async runOnchange(fieldNames: string[]): Promise<void> {
    const sentAt = this.edits;
    const result = await this.rpc<{ value?: Values; warning?: OnchangeWarning }>(
      this.config.model,
      "onchange",
      {
        ids: this.id ? [this.id] : [],
        kwargs: {
          values: this.onchangeValues(),
          field_names: fieldNames,
          fields_spec: this.config.spec,
          context: this.onchangeContext(fieldNames),
        },
      },
    );
    if (result.warning) this.config.onWarning?.(result.warning);
    this.applyServerValues(result.value ?? {}, sentAt);
  }

  /** A single-field onchange also gets that field's own context (as Odoo's client sends it). */
  private onchangeContext(fieldNames: string[]): OdooContext {
    const base = this.config.context ?? {};
    if (fieldNames.length !== 1) return base;
    const node = this.nodes().find((n) => n.name === fieldNames[0] && n.context);
    if (!node?.context) return base;
    const extra = safeEvaluate(node.context, this.evalContext(), {}, () => undefined);
    return extra && typeof extra === "object" && !Array.isArray(extra)
      ? { ...base, ...(extra as OdooContext) }
      : base;
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

/** A value in the form `web_save` / `onchange` expect. */
export function serialize(v: unknown, type?: string): unknown {
  if (type === "many2one") return v && typeof v === "object" ? (v as { id: number }).id : false;
  if (type === "reference" && v && typeof v === "object") {
    const r = (v as { id?: { id: number; model: string } }).id;
    return r ? `${r.model},${r.id}` : false;
  }
  return v ?? false;
}
