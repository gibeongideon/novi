/**
 * An x2many field's lines (P2.5.4): add, edit, remove, link, clear or replace them locally, then
 * hand `web_save` the command list. Commands come from the final state compared with what was
 * read (not from a log of clicks), so any sequence of edits yields the same, minimal list:
 *   CREATE [0, virtual_id, vals]  new line        UPDATE [1, id, vals]  edited existing line
 *   DELETE [2, id]       one2many removed  UNLINK [3, id]        many2many removed
 *   LINK   [4, id]       existing record added
 *   CLEAR  [5]           many2many emptied (then re-added lines are linked)
 *   SET    [6, 0, ids]   many2many replaced as a whole
 * New lines carry their virtual id (as Odoo's client does) so onchange answers can address them.
 * Every user change tells the parent, which runs its onchange on this field (P2.6.5).
 */
import type { Specification } from "@novi/odoo-client";
import type { ViewSchema } from "@novi/odoo-meta";

import { Observable } from "./observable.js";
import { OdooRecord, type RecordConfig, type Values } from "./record.js";

export type Command =
  | [0, string | 0, Values]
  | [1, number | string, Values]
  | [2, number]
  | [3, number]
  | [4, number, Values?]
  | [5]
  | [6, 0, number[]];

export class X2ManyList extends Observable {
  /** Lines in their current order (existing and new). */
  records: OdooRecord[] = [];
  /** Ids of all lines as read, including those beyond the loaded page. */
  private original: number[] = [];
  private cleared = false;
  private replaced = false;
  private rows: Values[] | number[] = [];

  constructor(
    readonly parent: OdooRecord,
    readonly field: string,
    readonly spec: Specification,
    rows: Values[] | number[],
  ) {
    super();
    this.load(rows);
  }

  get type(): "one2many" | "many2many" {
    return this.parent.fields[this.field]?.type === "many2many" ? "many2many" : "one2many";
  }

  get relation(): string {
    return String(this.parent.fields[this.field]?.relation ?? "");
  }

  /** Ids for expressions: saved ids, and virtual ids for new lines. */
  get ids(): (number | string)[] {
    return this.records.map((r) => r.id ?? r.virtualId);
  }

  get dirty(): boolean {
    return (
      this.cleared ||
      this.replaced ||
      this.records.some((r) => r.isNew || r.dirty) ||
      this.original.some((id) => !this.records.some((r) => r.id === id))
    );
  }

  /** Adds a new line locally (its values are its changes; no defaults asked). */
  add(values: Values = {}): OdooRecord {
    const line = this.track(OdooRecord.create(this.parent.rpc, this.lineConfig(), values, this.parent));
    this.records = [...this.records, line];
    this.changed();
    return line;
  }

  /** Adds a new line with Odoo's defaults for it (its model's onchange, with the parent's values). */
  async addWithDefaults(values: Values = {}): Promise<OdooRecord> {
    const line = this.track(
      await OdooRecord.createWithDefaults(this.parent.rpc, this.lineConfig(), this.parent),
    );
    this.records = [...this.records, line];
    this.changed();
    if (Object.keys(values).length) line.update(values);
    return line;
  }

  /** Adds an existing record (many2many tags, or re-attaching a line): `{ id, display_name, … }`. */
  link(row: Values & { id: number }): OdooRecord {
    const line = this.linkSilently(row);
    this.changed();
    return line;
  }

  /** Removes a line: deleted (one2many) or unlinked (many2many) on save; a new line just goes. */
  remove(line: OdooRecord | number): void {
    this.drop(line);
    this.changed();
  }

  /** Empties the field (many2many: CLEAR; one2many: every line deleted). */
  clear(): void {
    this.records = [];
    this.cleared = true;
    this.changed();
  }

  /** Replaces the whole many2many selection (SET), e.g. a tag picker's final choice. */
  replaceWith(rows: (Values & { id: number })[]): void {
    this.setSilently(rows);
    this.changed();
  }

  /** The commands that turn what was read into the current lines (`web_save` or `onchange`). */
  commands(purpose: "save" | "onchange" = "save"): Command[] {
    const out: Command[] = [];
    const existing = this.records.filter((r) => !r.isNew).map((r) => r.id!);
    const many2many = this.type === "many2many";
    if (many2many && this.replaced) out.push([6, 0, existing]);
    else {
      if (many2many && this.cleared) out.push([5]);
      const before = many2many && this.cleared ? [] : this.original;
      for (const id of before) if (!existing.includes(id)) out.push(many2many ? [3, id] : [2, id]);
      for (const id of existing) if (!before.includes(id)) out.push([4, id]);
    }
    for (const r of this.records) if (!r.isNew && r.dirty) out.push([1, r.id!, r.serializedChanges(purpose)]);
    for (const r of this.records) if (r.isNew) out.push([0, r.virtualId, r.serializedChanges(purpose)]);
    return out;
  }

  /** Odoo's answer to an onchange (or defaults) for this field: commands in `web_read` form. */
  applyCommands(commands: Command[]): void {
    for (const c of commands) {
      if (c[0] === 0) {
        const line = this.records.find((r) => r.virtualId === c[1]);
        if (line) line.applyServerValues(c[2]);
        else
          this.records = [
            ...this.records,
            this.track(OdooRecord.create(this.parent.rpc, this.lineConfig(), c[2], this.parent)),
          ];
      } else if (c[0] === 1)
        this.records.find((r) => r.id === c[1] || r.virtualId === c[1])?.applyServerValues(c[2]);
      else if (c[0] === 2 || c[0] === 3) this.drop(c[1]);
      else if (c[0] === 4) this.linkSilently({ id: c[1], ...(c[2] ?? {}) });
      else if (c[0] === 5) {
        this.records = [];
        this.cleared = true;
      } else if (c[0] === 6) this.setSilently(c[2].map((id) => ({ id })));
    }
    this.notify();
  }

  /** Back to the lines as read. */
  discard(): void {
    this.load(this.rows);
    this.notify();
  }

  private changed(): void {
    this.notify();
    this.parent.linesChanged(this.field);
  }

  private drop(line: OdooRecord | number | string): void {
    this.records = this.records.filter((r) => r !== line && r.id !== line && r.virtualId !== line);
  }

  private linkSilently(row: Values & { id: number }): OdooRecord {
    const existing = this.records.find((r) => r.id === row.id);
    if (existing) return existing;
    const line = this.track(new OdooRecord(this.parent.rpc, this.lineConfig(), row, this.parent));
    this.records = [...this.records, line];
    return line;
  }

  private setSilently(rows: (Values & { id: number })[]): void {
    this.records = rows.map(
      (row) =>
        this.records.find((r) => r.id === row.id) ??
        this.track(new OdooRecord(this.parent.rpc, this.lineConfig(), row, this.parent)),
    );
    this.replaced = true;
  }

  private load(rows: Values[] | number[]): void {
    this.rows = rows;
    this.cleared = false;
    this.replaced = false;
    this.original = rows.map((r) => (typeof r === "number" ? r : (r.id as number)));
    this.records = rows.map((r) =>
      this.track(
        new OdooRecord(
          this.parent.rpc,
          this.lineConfig(),
          typeof r === "number" ? { id: r } : r,
          this.parent,
        ),
      ),
    );
  }

  private track(line: OdooRecord): OdooRecord {
    line.subscribe(() => this.notify());
    return line;
  }

  /** Lines are records of the related model, read with the nested spec and the line view. */
  private lineConfig(): RecordConfig {
    const node = this.parent.config.schema
      ? this.parent.nodes().find((n) => n.name === this.field)
      : undefined;
    const schema: ViewSchema | undefined = node?.views?.list ?? node?.views?.kanban ?? node?.views?.form;
    const meta = this.parent.fields[this.field];
    return {
      model: this.relation,
      models: this.parent.config.models,
      spec: this.spec,
      schema,
      context: this.parent.config.context,
      evalContext: this.parent.config.evalContext,
      parentField: this.field,
      relationField: typeof meta?.relation_field === "string" ? meta.relation_field : undefined,
      onWarning: this.parent.config.onWarning,
    };
  }
}
