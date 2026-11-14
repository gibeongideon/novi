/**
 * An action's list, loaded the way Odoo's own client loads it (P2.9; parameters checked against
 * the client's captured requests): `get_views` for the list and search views (with the toolbar),
 * the search view's default filters (`search_default_*` in the action context, P2.12 first
 * slice), the view's default order, 80 rows per page, count limit 10001, and grouping when the
 * action or the defaults ask for it.
 */
import type { OdooContext } from "@novi/odoo-client";
import { Domain, type EvalContext, type PyValue } from "@novi/odoo-expr";
import {
  buildSpec,
  type ListSchema,
  type ModelsInfo,
  normalizeOrder,
  parseView,
  type SearchSchema,
} from "@novi/odoo-meta";

import type { WindowAction } from "./actions.js";
import { GroupedList, type ListConfig, RecordList } from "./model/lists.js";
import type { Rpc } from "./model/observable.js";

/** An entry of the "Action" / "Print" menus (`get_views` toolbar). */
export interface ToolbarItem {
  id: number;
  name: string;
  type?: string;
}

export interface ListViewData {
  action: WindowAction;
  schema: ListSchema;
  search?: SearchSchema;
  toolbar: { action: ToolbarItem[]; print: ToolbarItem[] };
  list: RecordList | GroupedList;
  /** User + action context and uid: what list-level expressions are evaluated with. */
  evalContext: EvalContext;
}

export const LIST_LIMIT = 80;
export const COUNT_LIMIT = 10001;

/** The domain and group-bys the search view's defaults turn on (`search_default_<name>`). */
export function defaultSearch(
  search: SearchSchema | undefined,
  context: OdooContext,
  evalContext: EvalContext,
): { domain: PyValue[]; groupBy: string[] } {
  if (!search) return { domain: [], groupBy: [] };
  const on = (name?: string) => (name ? context[`search_default_${name}`] : undefined);
  const ctx = { ...evalContext, context: context as never };
  const parts: Domain[] = [];
  for (const group of search.filterGroups) {
    const active = group.filter((f) => on(f.name) && f.domain && !f.date);
    if (active.length) parts.push(Domain.or(active.map((f) => Domain.parse(f.domain!, ctx))));
  }
  for (const field of search.searchFields) {
    const value = on(field.name);
    if (value === undefined || value === false) continue;
    if (field.filterDomain) parts.push(Domain.parse(field.filterDomain, { ...ctx, self: value as PyValue }));
    else {
      const op = field.operator ?? (typeof value === "number" ? "=" : "ilike");
      parts.push(Domain.from([[field.name, op, value as PyValue]]));
    }
  }
  const groupBy = search.groupBys
    .filter((g) => on(g.name))
    .sort((a, b) => Number(on(a.name)) - Number(on(b.name)))
    .map((g) => g.fieldName);
  return { domain: parts.length ? Domain.and(parts).toList() : [], groupBy };
}

/** What an action's expressions are evaluated with: the base, the active record(s), its context. */
export function actionEvalContext(context: OdooContext, base: EvalContext): EvalContext {
  return {
    ...base,
    ...Object.fromEntries(
      ["active_id", "active_ids", "active_model"]
        .filter((k) => k in context)
        .map((k) => [k, context[k] as PyValue]),
    ),
    context: context as never,
  };
}

/** The context reads are sent with: the action's, without the search defaults (as Odoo's client sends it). */
export function readContext(context: OdooContext): OdooContext {
  return Object.fromEntries(Object.entries(context).filter(([k]) => !k.startsWith("search_default_")));
}

/** A domain as Odoo's client sends it: no filter at all is `[]`, not the TRUE leaf. */
function noFilter(d: Domain): PyValue[] {
  return d.isTrue() ? [] : d.toList();
}

/** `group_by` in a context: a field, a list of fields, or nothing. */
function contextGroupBy(context: OdooContext): string[] {
  const g = context.group_by;
  return typeof g === "string" && g
    ? [g]
    : Array.isArray(g)
      ? g.filter((x): x is string => typeof x === "string")
      : [];
}

/** Loads an action's list view and builds its (grouped) list; null when the action has no list view. */
export async function loadListView(
  rpc: Rpc,
  action: WindowAction,
  base: EvalContext,
): Promise<ListViewData | null> {
  const listView = action.views.find(([, type]) => type === "list");
  if (!listView) return null;
  const views = await rpc<{
    views: { list: { arch: string; toolbar?: ListViewData["toolbar"] }; search?: { arch: string } };
    models: ModelsInfo;
  }>(action.model, "get_views", {
    kwargs: {
      views: [
        [listView[0], "list"],
        [action.searchViewId, "search"],
      ],
      options: { action_id: action.id ?? false, toolbar: true, load_filters: false },
      context: action.context,
    },
  });
  const schema = parseView({
    arch: views.views.list.arch,
    model: action.model,
    models: views.models,
  }) as ListSchema;
  const search = views.views.search
    ? (parseView({
        arch: views.views.search.arch,
        model: action.model,
        models: views.models,
      }) as SearchSchema)
    : undefined;
  const evalContext = actionEvalContext(action.context, base);
  const defaults = defaultSearch(search, action.context, evalContext);
  const context = readContext(action.context);
  const config: ListConfig = {
    model: action.model,
    models: views.models,
    spec: buildSpec(schema, { evalContext }),
    schema,
    domain: noFilter(Domain.and([action.domain, defaults.domain])),
    context,
    evalContext,
    order: schema.defaultOrder ? normalizeOrder(schema.defaultOrder) : undefined,
    limit: action.limit ?? schema.limit ?? LIST_LIMIT,
    countLimit: COUNT_LIMIT,
  };
  const groupBy = [...contextGroupBy(action.context), ...defaults.groupBy];
  const aggregates = schema.columns.flatMap((c) =>
    c.type === "field" && (c.sum || c.avg) ? [`${c.name}:${c.sum ? "sum" : "avg"}`] : [],
  );
  const list = groupBy.length
    ? new GroupedList(rpc, { ...config, groupBy, aggregates })
    : new RecordList(rpc, config);
  await list.load();
  return {
    action,
    schema,
    search,
    toolbar: { action: views.views.list.toolbar?.action ?? [], print: views.views.list.toolbar?.print ?? [] },
    list,
    evalContext,
  };
}
