/**
 * Lists of records (P2.5.2, P2.5.3). `RecordList`: one page of `web_search_read` with paging,
 * sorting, selection and Odoo's count limit. `GroupedList`: `web_read_group` groups (count,
 * aggregates, the domain that opens them), folded or unfolded, nested for several group-bys.
 * Rows are `OdooRecord`s, so list views edit inline with the same record model.
 */
import type { OdooContext, Specification } from "@novi/odoo-client";
import { Domain, type EvalContext, type PyValue } from "@novi/odoo-expr";
import type { ModelsInfo, ViewSchema } from "@novi/odoo-meta";

import { Observable, type Rpc } from "./observable.js";
import { OdooRecord, serialize, type Values } from "./record.js";

export interface ListConfig {
  model: string;
  models: ModelsInfo;
  spec: Specification;
  schema?: ViewSchema;
  domain?: unknown[];
  context?: OdooContext;
  evalContext?: EvalContext;
  /** Default sort, e.g. `"date_order DESC, id DESC"` (view `default_order`). */
  order?: string;
  limit?: number;
  /** Count at most this many records (Odoo shows "1-80 / 10000+" beyond it). */
  countLimit?: number;
}

export class RecordList extends Observable {
  records: OdooRecord[] = [];
  /** Matching records (capped at the count limit). */
  length = 0;
  offset = 0;
  readonly limit: number;
  order: string | undefined;
  readonly selection = new Set<number>();
  loading = false;

  constructor(
    readonly rpc: Rpc,
    readonly config: ListConfig,
  ) {
    super();
    this.limit = config.limit ?? 80;
    this.order = config.order;
  }

  /** True when the real count is larger than what was counted ("10000+"). */
  get lengthIsEstimate(): boolean {
    return !!this.config.countLimit && this.length >= this.config.countLimit;
  }

  async load(): Promise<this> {
    this.loading = true;
    this.notify();
    const r = await this.rpc<{ records: Values[]; length: number }>(this.config.model, "web_search_read", {
      kwargs: {
        domain: this.config.domain ?? [],
        specification: this.config.spec,
        offset: this.offset,
        limit: this.limit,
        ...(this.order ? { order: this.order } : {}),
        ...(this.config.countLimit ? { count_limit: this.config.countLimit } : {}),
        context: { ...this.config.context, bin_size: true },
      },
    });
    const recordConfig = { ...this.config, spec: this.config.spec };
    this.records = r.records.map((row) => new OdooRecord(this.rpc, recordConfig, row));
    this.length = r.length;
    this.loading = false;
    for (const id of [...this.selection])
      if (!this.records.some((rec) => rec.id === id)) this.selection.delete(id);
    this.notify();
    return this;
  }

  /**
   * Appends the next records after those shown (kanban columns, P2.11.6): offset = what's
   * loaded, same limit; the shown records stay as they are.
   */
  async loadMore(): Promise<this> {
    if (this.records.length >= this.length) return this;
    const r = await this.rpc<{ records: Values[]; length: number }>(this.config.model, "web_search_read", {
      kwargs: {
        domain: this.config.domain ?? [],
        specification: this.config.spec,
        offset: this.records.length,
        limit: this.limit,
        ...(this.order ? { order: this.order } : {}),
        ...(this.config.countLimit ? { count_limit: this.config.countLimit } : {}),
        context: { ...this.config.context, bin_size: true },
      },
    });
    const more = r.records.map((row) => new OdooRecord(this.rpc, this.config, row));
    this.records = [...this.records, ...more];
    this.length = r.length;
    this.notify();
    return this;
  }

  /** Moves to the page starting at `offset` (clamped to the list). */
  async goTo(offset: number): Promise<this> {
    this.offset = Math.max(0, Math.min(offset, Math.max(0, this.length - 1)));
    return this.load();
  }

  nextPage(): Promise<this> {
    return this.goTo(this.offset + this.limit >= this.length ? 0 : this.offset + this.limit);
  }

  previousPage(): Promise<this> {
    const last = Math.floor(Math.max(0, this.length - 1) / this.limit) * this.limit;
    return this.goTo(this.offset === 0 ? last : this.offset - this.limit);
  }

  /** Sorts by a field; clicking the same field again flips the direction (Odoo's column header). */
  sortBy(field: string): Promise<this> {
    const [first] = (this.order ?? "").split(",");
    const [current, dir] = (first ?? "").trim().split(/\s+/);
    this.order = `${field} ${current === field && dir?.toUpperCase() !== "DESC" ? "DESC" : "ASC"}`;
    this.offset = 0;
    return this.load();
  }

  select(id: number, selected = true): void {
    if (selected) this.selection.add(id);
    else this.selection.delete(id);
    this.notify();
  }

  /** Ids of the selected records. */
  get selectedIds(): number[] {
    return [...this.selection];
  }

  /** Deletes the selected records (`web_unlink`) and reloads. */
  async deleteSelected(): Promise<void> {
    await bulk(this, "web_unlink");
    this.selection.clear();
    await this.load();
  }

  /** Duplicates the selected records (`copy`); returns the new ids. */
  async duplicateSelected(): Promise<number[]> {
    const ids = await bulk<number[]>(this, "copy");
    await this.load();
    return ids;
  }

  /** Archives or restores the selected records; returns Odoo's answer (it may be an action). */
  async setArchivedSelected(archived: boolean): Promise<unknown> {
    const result = await bulk(this, archived ? "action_archive" : "action_unarchive");
    this.selection.clear();
    await this.load();
    return result;
  }

  /**
   * Writes the same values on every selected record (list multi-edit, P2.7.5) in one
   * `web_save_multi` call; values in `web_read` form (many2one as `{ id, display_name }`).
   */
  async writeSelected(values: Values): Promise<void> {
    await writeMany(this, values);
    await this.load();
  }

  /**
   * Drag-to-reorder (handle widget, P2.9.6): moves a record to `toIndex` on this page and lets
   * Odoo renumber the handle field for the page in its new order (`web_resequence`).
   */
  async resequence(id: number, toIndex: number, field = "sequence"): Promise<void> {
    const ids = this.records.map((r) => r.id!).filter((x) => x !== id);
    ids.splice(Math.max(0, Math.min(toIndex, ids.length)), 0, id);
    await this.rpc(this.config.model, "web_resequence", {
      ids,
      kwargs: {
        specification: this.config.spec,
        field_name: field,
        offset: this.offset,
        context: this.config.context ?? {},
      },
    });
    await this.load();
  }

  clearSelection(): void {
    this.selection.clear();
    this.notify();
  }

  /** Selects or clears every record of the page. */
  selectAll(selected = true): void {
    for (const r of this.records) {
      if (!r.id) continue;
      if (selected) this.selection.add(r.id);
      else this.selection.delete(r.id);
    }
    this.notify();
  }
}

/** One group of a grouped list. */
export interface Group {
  /** Raw group value: many2one `[id, name]`, selection key, date range start, false. */
  value: unknown;
  /** What Odoo shows for the group (name, selection label, "October 2026"), or false for none. */
  label: string | false;
  count: number;
  /** Aggregates by field (`amount_total` → sum). */
  aggregates: Record<string, number>;
  /** The full domain of the group's records. */
  domain: unknown[];
  folded: boolean;
  /** Unfolded: its records (last group-by) or its sub-groups. */
  list?: RecordList | GroupedList;
  /** Kanban progress bar: records per value of the bar's field (`{planned: 3, overdue: 1}`). */
  progress?: Record<string, number>;
}

export interface GroupedConfig extends ListConfig {
  /** Group-bys, outermost first (`partner_id`, `date_order:month`). */
  groupBy: string[];
  /** Aggregate specs, e.g. `amount_total:sum` (view `sum`/`avg` columns). */
  aggregates?: string[];
  /** Open groups right away (kanban: unfolds unless Odoo says `__fold`). */
  autoUnfold?: boolean;
  /** Records read per opened group (kanban columns: Odoo's `unfold_read_default_limit`). */
  unfoldLimit?: number;
  /** Kanban `<progressbar>`: counts per column read with `read_progress_bar` (P2.11.5). */
  progressbar?: { field: string; colors: Record<string, string> };
}

export class GroupedList extends Observable {
  groups: Group[] = [];
  /** Number of groups. */
  length = 0;

  constructor(
    readonly rpc: Rpc,
    readonly config: GroupedConfig,
  ) {
    super();
  }

  async load(): Promise<this> {
    const [groupBy, ...rest] = this.config.groupBy;
    if (!groupBy) throw new Error("GroupedList needs at least one group-by");
    const last = rest.length === 0;
    const r = await this.rpc<{ groups: Values[]; length: number }>(this.config.model, "web_read_group", {
      kwargs: {
        domain: this.config.domain ?? [],
        groupby: [groupBy],
        aggregates: this.config.aggregates ?? [],
        ...(this.config.limit ? { limit: this.config.limit } : {}),
        ...(this.config.order ? { order: this.config.order } : {}),
        auto_unfold: !!this.config.autoUnfold && last,
        ...(this.config.autoUnfold && last && this.config.unfoldLimit
          ? { unfold_read_default_limit: this.config.unfoldLimit }
          : {}),
        ...(last ? { unfold_read_specification: this.config.spec } : {}),
        context: this.config.context ?? {},
      },
    });
    this.length = r.length;
    this.groups = r.groups.map((g) => this.toGroup(g, groupBy, rest));
    if (this.config.progressbar) await this.loadProgress(groupBy);
    this.notify();
    return this;
  }

  /** Per column, how many records have each value of the progress bar's field (Odoo's keys: str(id)). */
  private async loadProgress(groupBy: string): Promise<void> {
    const bar = this.config.progressbar!;
    const counts = await this.rpc<Record<string, Record<string, number>>>(
      this.config.model,
      "read_progress_bar",
      {
        kwargs: {
          domain: this.config.domain ?? [],
          group_by: groupBy,
          progress_bar: { field: bar.field, colors: bar.colors },
          context: this.config.context ?? {},
        },
      },
    );
    for (const g of this.groups) {
      const key = Array.isArray(g.value) ? g.value[0] : g.value;
      g.progress = counts[String(key === false || key === null ? "False" : key)];
    }
  }

  /** Selected record ids across the open groups. */
  get selectedIds(): number[] {
    return this.groups.flatMap((g) => (g.list ? g.list.selectedIds : []));
  }

  /** Clears the selection in every open group. */
  clearSelection(): void {
    for (const g of this.groups) g.list?.clearSelection();
    this.notify();
  }

  /** Bulk actions on the selection across groups; the groups reload afterwards. */
  async deleteSelected(): Promise<void> {
    await bulk(this, "web_unlink");
    await this.load();
  }

  async duplicateSelected(): Promise<number[]> {
    const ids = await bulk<number[]>(this, "copy");
    await this.load();
    return ids;
  }

  async setArchivedSelected(archived: boolean): Promise<unknown> {
    const result = await bulk(this, archived ? "action_archive" : "action_unarchive");
    await this.load();
    return result;
  }

  async writeSelected(values: Values): Promise<void> {
    await writeMany(this, values);
    await this.load();
  }

  /**
   * Kanban quick create without a quick-create form (P2.11.4): a record named `name` in the
   * group's column (`name_create` with the column as default, as Odoo's client), then reloads.
   */
  async quickCreate(group: Group, name: string): Promise<number> {
    const field = this.config.groupBy[0]!;
    const key = Array.isArray(group.value) ? group.value[0] : group.value;
    const [id] = await this.rpc<[number, string]>(this.config.model, "name_create", {
      kwargs: {
        name,
        context: {
          ...this.config.context,
          ...(key !== false && key !== null ? { [`default_${field}`]: key } : {}),
        },
      },
    });
    await this.load();
    return id;
  }

  /**
   * Moves a record to another column (kanban drag and drop, P2.11.3): writes the group field
   * with the column's value and saves, then reloads the columns (counts, totals, bars).
   */
  async moveTo(record: OdooRecord, group: Group): Promise<boolean> {
    const field = this.config.groupBy[0]!;
    const v = group.value;
    record.update({ [field]: Array.isArray(v) ? { id: v[0], display_name: v[1] } : v });
    const ok = await record.save();
    await this.load();
    return ok;
  }

  /** Opens or closes a group; opening loads its records or its sub-groups. */
  async toggle(group: Group): Promise<void> {
    group.folded = !group.folded;
    if (!group.folded && !group.list) {
      const [, ...rest] = this.config.groupBy;
      const sub = { ...this.config, domain: group.domain };
      group.list = rest.length
        ? new GroupedList(this.rpc, { ...sub, groupBy: rest })
        : new RecordList(this.rpc, sub);
      group.list.subscribe(() => this.notify());
      await group.list.load();
    }
    this.notify();
  }

  private toGroup(g: Values, groupBy: string, rest: string[]): Group {
    const value = g[groupBy];
    const aggregates: Record<string, number> = {};
    for (const spec of this.config.aggregates ?? []) {
      const v = g[spec];
      if (typeof v === "number") aggregates[spec.split(":")[0]!] = v;
    }
    // the group's records: the list's domain AND the group's own condition (Odoo's Domain rules)
    const domain = Domain.and([
      (this.config.domain ?? []) as PyValue[],
      g.__extra_domain as PyValue[],
    ]).toList();
    const group: Group = {
      value,
      label: Array.isArray(value)
        ? String(value[1])
        : value === false || value === null
          ? false
          : String(value),
      count: Number(g.__count ?? 0),
      aggregates,
      domain,
      folded: !Array.isArray(g.__records) && !Array.isArray(g.__groups),
    };
    if (Array.isArray(g.__records) && !rest.length) {
      const list = new RecordList(this.rpc, { ...this.config, domain: group.domain });
      list.records = (g.__records as Values[]).map((row) => new OdooRecord(this.rpc, this.config, row));
      list.length = group.count;
      list.subscribe(() => this.notify());
      group.list = list;
    }
    return group;
  }
}

/** One call on the selected records of a list (flat or grouped): delete, copy, archive… */
function bulk<T = unknown>(list: RecordList | GroupedList, method: string): Promise<T> {
  return list.rpc<T>(list.config.model, method, {
    ids: list.selectedIds,
    kwargs: { context: list.config.context ?? {} },
  });
}

/** The same values on every selected record, in one `web_save_multi` call. */
async function writeMany(list: RecordList | GroupedList, values: Values): Promise<void> {
  const fields = list.config.models[list.config.model]?.fields ?? {};
  const vals = Object.fromEntries(Object.entries(values).map(([k, v]) => [k, serialize(v, fields[k]?.type)]));
  await list.rpc(list.config.model, "web_save_multi", {
    ids: list.selectedIds,
    kwargs: {
      vals_list: list.selectedIds.map(() => vals),
      specification: list.config.spec,
      context: list.config.context ?? {},
    },
  });
}
