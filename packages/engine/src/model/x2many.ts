/**
 * An x2many field's lines (P2.5.4): add, edit, remove, link, clear or replace them locally, then
 * hand `web_save` the command list. Commands come from the final state compared with what was
 * read (not from a log of clicks), so any sequence of edits yields the same, minimal list:
 *   CREATE [0, 0, vals]  new line          UPDATE [1, id, vals]  edited existing line
 *   DELETE [2, id]       one2many removed  UNLINK [3, id]        many2many removed
 *   LINK   [4, id]       existing record added
 *   CLEAR  [5]           many2many emptied (then re-added lines are linked)
 *   SET    [6, 0, ids]   many2many replaced as a whole
 */
import type { Specification } from "@novi/odoo-client";
import type { ViewSchema } from "@novi/odoo-meta";

import { Observable } from "./observable.js";
import { OdooRecord, type Values } from "./record.js";

export type Command =
  [0, 0, Values] | [1, number, Values] | [2, number] | [3, number] | [4, number] | [5] | [6, 0, number[]];

export class X2ManyList extends Observable {
  /** Lines in their current order (existing and new). */
  records: OdooRecord[] = [];
  /** Ids of all lines as read, including those beyond the loaded page. */
  private original: number[] = [];
  private cleared = false;
  private replaced = false;

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

  /** Adds a new line (its values are its changes). */
  add(values: Values = {}): OdooRecord {
    const line = OdooRecord.create(this.parent.rpc, this.lineConfig(), values, this.parent);
    this.track(line);
    this.records = [...this.records, line];
    this.notify();
    return line;
  }

  /** Adds an existing record (many2many tags, or re-attaching a line): `{ id, display_name, … }`. */
  link(row: Values & { id: number }): OdooRecord {
    const existing = this.records.find((r) => r.id === row.id);
    if (existing) return existing;
    const line = new OdooRecord(this.parent.rpc, this.lineConfig(), row, this.parent);
    this.track(line);
    this.records = [...this.records, line];
    this.notify();
    return line;
  }

  /** Removes a line: deleted (one2many) or unlinked (many2many) on save; a new line just goes. */
  remove(line: OdooRecord | number): void {
    this.records = this.records.filter((r) => r !== line && (typeof line !== "number" || r.id !== line));
    this.notify();
  }

  /** Empties the field (many2many: CLEAR; one2many: every line deleted). */
  clear(): void {
    this.records = [];
    this.cleared = true;
    this.notify();
  }

  /** Replaces the whole many2many selection (SET), e.g. a tag picker's final choice. */
  replaceWith(rows: (Values & { id: number })[]): void {
    this.records = rows.map(
      (row) =>
        this.records.find((r) => r.id === row.id) ??
        this.track(new OdooRecord(this.parent.rpc, this.lineConfig(), row, this.parent)),
    );
    this.replaced = true;
    this.notify();
  }

  /** The `web_save` commands that turn what was read into the current lines. */
  commands(): Command[] {
    const out: Command[] = [];
    const existing = this.records.filter((r) => !r.isNew).map((r) => r.id!);
    const many2many = this.type === "many2many";
    if (many2many && this.replaced) out.push([6, 0, existing]);
    else {
      if (many2many && this.cleared) out.push([5]);
      const removedFrom = many2many && this.cleared ? [] : this.original;
      for (const id of removedFrom) if (!existing.includes(id)) out.push(many2many ? [3, id] : [2, id]);
      const linkedBefore = many2many && this.cleared ? [] : this.original;
      for (const id of existing) if (!linkedBefore.includes(id)) out.push([4, id]);
    }
    for (const r of this.records) if (!r.isNew && r.dirty) out.push([1, r.id!, r.serializedChanges()]);
    for (const r of this.records) if (r.isNew) out.push([0, 0, r.serializedChanges()]);
    return out;
  }

  /** Back to the lines as read. */
  discard(): void {
    this.load(this.rows);
    this.notify();
  }

  private rows: Values[] | number[] = [];

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
  private lineConfig() {
    const node = this.parent.config.schema
      ? this.parent.nodes().find((n) => n.name === this.field)
      : undefined;
    const schema: ViewSchema | undefined = node?.views?.list ?? node?.views?.kanban ?? node?.views?.form;
    return {
      model: this.relation,
      models: this.parent.config.models,
      spec: this.spec,
      schema,
      context: this.parent.config.context,
      evalContext: this.parent.config.evalContext,
    };
  }
}
