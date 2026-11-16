/**
 * Search (P2.12), headless: what the user searches for, as a plain serialisable state (kept in
 * the URL, P2.12.7), and the domain, group-bys and context it means for Odoo. Odoo's rules:
 * filters of one group are OR'ed, groups are AND'ed; values searched in one field are OR'ed;
 * date filters take periods (this month, last quarter, 2025…); a favourite (`ir.filters`) adds
 * its own domain and grouping. The action's `search_default_*` keys give the starting state.
 */
import type { OdooContext } from "@novi/odoo-client";
import { Domain, type EvalContext, evaluate, pyRepr, type PyValue } from "@novi/odoo-expr";
import type { SearchFilter, SearchSchema } from "@novi/odoo-meta";

export interface SearchFieldValue {
  /** The search field (`partner_id`). */
  name: string;
  /** What was typed, or the id of the record picked from the suggestions. */
  value: string | number;
  /** What the facet shows ("Azure Interior"). */
  label: string;
}

export interface SearchState {
  /** Active filters, by key (`filterKey`). */
  filters: string[];
  /** Date filters: the chosen periods (`month`, `month-1`, `q2`, `year-1`…), by filter key. */
  periods?: Record<string, string[]>;
  /** Group-bys in order (`stage_id`, `date_order:month`). */
  groupBy: string[];
  fields: SearchFieldValue[];
  /** The `ir.filters` favourite applied. */
  favorite?: number;
}

/** A saved search (`ir.filters`). */
export interface Favorite {
  id: number;
  name: string;
  domain: string;
  context: string;
  is_default: boolean;
  user_ids: number[];
  sort?: string;
}

export const EMPTY_SEARCH: SearchState = { filters: [], groupBy: [], fields: [] };

/** A filter's key: its name, or its position for unnamed filters. */
export function filterKey(f: SearchFilter, group: number, index: number): string {
  return f.name ?? `${group}.${index}`;
}

/** The starting state: the search view's defaults the action turns on (`search_default_<name>`). */
export function defaultState(search: SearchSchema | undefined, context: OdooContext): SearchState {
  if (!search) return EMPTY_SEARCH;
  const on = (name?: string) => (name ? context[`search_default_${name}`] : undefined);
  const state: SearchState = { filters: [], groupBy: [], fields: [] };
  search.filterGroups.forEach((group, gi) =>
    group.forEach((f, fi) => {
      if (on(f.name) && !f.date) state.filters.push(filterKey(f, gi, fi));
    }),
  );
  for (const field of search.searchFields) {
    const value = on(field.name);
    if (value === undefined || value === false) continue;
    state.fields.push({ name: field.name, value: value as string | number, label: String(value) });
  }
  state.groupBy = search.groupBys
    .filter((g) => on(g.name))
    .sort((a, b) => Number(on(a.name)) - Number(on(b.name)))
    .map((g) => g.fieldName);
  return state;
}

/** What a state means for Odoo: the domain to add to the action's, the group-bys, extra context. */
export function searchQuery(
  search: SearchSchema | undefined,
  state: SearchState,
  evalContext: EvalContext,
  favorites: readonly Favorite[] = [],
  today = new Date(),
): { domain: PyValue[]; groupBy: string[]; context: OdooContext } {
  const ctx = { ...evalContext };
  const parts: Domain[] = [];
  const context: OdooContext = {};
  const groupBy = [...state.groupBy];
  if (search) {
    search.filterGroups.forEach((group, gi) => {
      const active = group
        .map((f, fi) => ({ f, key: filterKey(f, gi, fi) }))
        .filter(({ key }) => state.filters.includes(key));
      const ors: Domain[] = [];
      for (const { f, key } of active) {
        if (f.date) {
          const periods = state.periods?.[key]?.length ? state.periods[key]! : [f.defaultPeriod ?? "month"];
          const type = search.fields[f.date]?.type === "datetime" ? "datetime" : "date";
          ors.push(periodDomain(f.date, type, periods, today));
        } else if (f.domain) ors.push(Domain.parse(f.domain, ctx));
        if (f.context) Object.assign(context, safeContext(f.context, ctx));
      }
      if (ors.length) parts.push(Domain.or(ors));
    });
    const byField = new Map<string, Domain[]>();
    for (const v of state.fields) {
      const field = search.searchFields.find((f) => f.name === v.name);
      if (!field) continue;
      const meta = search.fields[field.name];
      const d = field.filterDomain
        ? Domain.parse(field.filterDomain, { ...ctx, self: v.value as PyValue })
        : Domain.from([
            [
              field.name,
              field.operator ??
                (typeof v.value === "number" || meta?.type === "selection" || meta?.type === "boolean"
                  ? "="
                  : "ilike"),
              v.value as PyValue,
            ],
          ]);
      byField.set(v.name, [...(byField.get(v.name) ?? []), d]);
    }
    for (const ds of byField.values()) parts.push(Domain.or(ds));
  }
  const fav = state.favorite !== undefined ? favorites.find((f) => f.id === state.favorite) : undefined;
  if (fav) {
    parts.push(Domain.parse(fav.domain || "[]", ctx));
    const favContext = safeContext(fav.context, ctx);
    const g = favContext.group_by;
    groupBy.push(...(typeof g === "string" ? [g] : Array.isArray(g) ? (g as string[]) : []));
    delete favContext.group_by;
    Object.assign(context, favContext);
  }
  delete context.group_by;
  return { domain: parts.length ? Domain.and(parts).toList() : [], groupBy, context };
}

/** A filter's or favourite's context string, evaluated; `{}` when it can't be. */
function safeContext(source: string, ctx: EvalContext): OdooContext {
  try {
    const v = evaluate(source, ctx);
    return v && typeof v === "object" && !Array.isArray(v) ? ({ ...(v as object) } as OdooContext) : {};
  } catch {
    return {};
  }
}

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** Date filter options Odoo offers: this and the two previous months, quarters, this and two previous years. */
export const PERIODS = [
  "month",
  "month-1",
  "month-2",
  "q1",
  "q2",
  "q3",
  "q4",
  "year",
  "year-1",
  "year-2",
] as const;

/**
 * A date filter's periods as a domain, as Odoo's client builds it: the chosen months/quarters
 * within each chosen year (this year when none is chosen), OR'ed; a year alone is the whole year.
 */
export function periodDomain(
  field: string,
  type: "date" | "datetime",
  periods: readonly string[],
  today: Date,
): Domain {
  const y0 = today.getFullYear();
  const m0 = today.getMonth() + 1;
  const years = periods.filter((p) => p.startsWith("year")).map((p) => y0 - Number(p.split("-")[1] ?? 0));
  const ranges: [string, string][] = [];
  const months = periods
    .filter((p) => p.startsWith("month"))
    .map((p) => {
      const back = Number(p.split("-")[1] ?? 0);
      const d = new Date(y0, m0 - 1 - back, 1);
      return { y: d.getFullYear(), m: d.getMonth() + 1 };
    });
  const quarters = periods.filter((p) => /^q[1-4]$/.test(p)).map((p) => Number(p[1]));
  if (!months.length && !quarters.length) for (const y of years) ranges.push([ymd(y, 1, 1), ymd(y, 12, 31)]);
  for (const { y, m } of months)
    for (const yy of years.length ? years : [y]) ranges.push([ymd(yy, m, 1), ymd(yy, m, lastDay(yy, m))]);
  for (const q of quarters)
    for (const yy of years.length ? years : [y0]) {
      const m = (q - 1) * 3 + 1;
      ranges.push([ymd(yy, m, 1), ymd(yy, m + 2, lastDay(yy, m + 2))]);
    }
  const bound = (d: string, end: boolean) =>
    type === "datetime" ? `${d} ${end ? "23:59:59" : "00:00:00"}` : d;
  return Domain.or(
    ranges.map(([a, b]) =>
      Domain.from(["&", [field, ">=", bound(a, false)], [field, "<=", bound(b, true)]] as PyValue[]),
    ),
  );
}

/** What saving the current search as a favourite needs (P2.12.5). */
export interface FavoriteDraft {
  name: string;
  model: string;
  actionId?: number;
  /** The search's own domain (not the action's) and grouping. */
  domain: PyValue[];
  groupBy: string[];
  isDefault: boolean;
  /** Shared with everyone, or kept for the signed-in user. */
  shared: boolean;
  uid: number;
}

/** Saves a favourite as Odoo's client does (`ir.filters.create_filter`); returns its id. */
export async function saveFavorite(
  call: <T>(model: string, method: string, args: { kwargs: Record<string, unknown> }) => Promise<T>,
  draft: FavoriteDraft,
): Promise<number> {
  const created = await call<number | number[]>("ir.filters", "create_filter", {
    kwargs: {
      vals: {
        name: draft.name,
        model_id: draft.model,
        action_id: draft.actionId ?? false,
        domain: draft.domain.length ? Domain.from(draft.domain).toString() : "[]", // as Odoo's client: no TRUE leaf
        context: pyRepr({ group_by: draft.groupBy } as never),
        sort: "[]",
        is_default: draft.isDefault,
        user_ids: draft.shared ? [] : [[6, 0, [draft.uid]]],
      },
    },
  });
  return Array.isArray(created) ? created[0]! : created;
}

/**
 * Whether a list can be grouped by this field (`field` or `field:interval`): stored, groupable,
 * not a relation list nor properties (those are grouped by one property, not supported yet).
 */
export function canGroupBy(
  groupBy: string,
  fields: Record<string, { type: string; store?: boolean; groupable?: boolean }>,
): boolean {
  const f = fields[groupBy.split(":")[0]!];
  return (
    !!f &&
    f.groupable !== false &&
    f.store !== false &&
    !["one2many", "many2many", "binary", "properties", "properties_definition", "json"].includes(f.type)
  );
}
