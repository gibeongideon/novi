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

  /** Deletes the selected records (`web_unlink`) and reloads the page. */
  async deleteSelected(): Promise<void> {
    await this.rpc(this.config.model, "web_unlink", {
      ids: this.selectedIds,
      kwargs: { context: this.config.context ?? {} },
    });
    this.selection.clear();
    await this.load();
  }

  /** Duplicates the selected records (`copy`); returns the new ids. */
  async duplicateSelected(): Promise<number[]> {
    const ids = await this.rpc<number[]>(this.config.model, "copy", {
      ids: this.selectedIds,
      kwargs: { context: this.config.context ?? {} },
    });
    await this.load();
    return ids;
  }

  /** Archives or restores the selected records; returns Odoo's answer (it may be an action). */
  async setArchivedSelected(archived: boolean): Promise<unknown> {
    const result = await this.rpc(this.config.model, archived ? "action_archive" : "action_unarchive", {
      ids: this.selectedIds,
      kwargs: { context: this.config.context ?? {} },
    });
    this.selection.clear();
    await this.load();
    return result;
  }

  /**
   * Writes the same values on every selected record (list multi-edit, P2.7.5) in one
   * `web_save_multi` call; values in `web_read` form (many2one as `{ id, display_name }`).
   */
  async writeSelected(values: Values): Promise<void> {
    const fields = this.config.models[this.config.model]?.fields ?? {};
    const vals = Object.fromEntries(
      Object.entries(values).map(([k, v]) => [k, serialize(v, fields[k]?.type)]),
    );
    await this.rpc(this.config.model, "web_save_multi", {
      ids: this.selectedIds,
      kwargs: {
        vals_list: this.selectedIds.map(() => vals),
        specification: this.config.spec,
        context: this.config.context ?? {},
      },
    });
    await this.load();
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
}

export interface GroupedConfig extends ListConfig {
  /** Group-bys, outermost first (`partner_id`, `date_order:month`). */
  groupBy: string[];
  /** Aggregate specs, e.g. `amount_total:sum` (view `sum`/`avg` columns). */
  aggregates?: string[];
  /** Open groups right away (kanban: unfolds unless Odoo says `__fold`). */
  autoUnfold?: boolean;
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
        ...(last ? { unfold_read_specification: this.config.spec } : {}),
        context: this.config.context ?? {},
      },
    });
    this.length = r.length;
    this.groups = r.groups.map((g) => this.toGroup(g, groupBy, rest));
    this.notify();
    return this;
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
