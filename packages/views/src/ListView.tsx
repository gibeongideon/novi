/**
 * Generic list renderer (L4, P2.9). Everything comes from the view schema, Odoo's field metadata
 * and the engine's live list model (RecordList / GroupedList): columns, labels, alignment, sorting,
 * selection, optional columns (remembered per view in the browser, as Odoo does), group rows with
 * counts and totals, page totals, drag-to-reorder by the handle, row buttons, Odoo's decorations
 * and show/hide rules. Every cell renders through the field registry.
 * Not here: inline editing (needs the edit widgets, P2.13), the pager and bulk actions (the
 * screen's control bar).
 */
import { type Group, GroupedList, type OdooRecord, RecordList, useModel } from "@novi/engine";
import { fieldRegistry } from "@novi/fields";
import { type EvalContext, evaluateBool } from "@novi/odoo-expr";
import type { ButtonNode, FieldNode, ListSchema } from "@novi/odoo-meta";
import {
  Button,
  cn,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
  useT,
} from "@novi/ui";
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Columns3, GripVertical } from "lucide-react";
import { type ReactNode, useState } from "react";

const NUMERIC = new Set(["integer", "float", "monetary"]);
/** Odoo decoration names → NOVI's own tokens (meaning kept, look ours). */
const DECORATION: Record<string, string> = {
  danger: "text-danger",
  warning: "text-warning",
  success: "text-success",
  info: "text-info",
  primary: "text-primary",
  muted: "text-text-muted",
  bf: "font-semibold",
  it: "italic",
};

const holds = (expr: string | boolean | undefined, ctx: Record<string, unknown>): boolean => {
  if (typeof expr !== "string") return !!expr;
  try {
    return evaluateBool(expr, ctx as never);
  } catch {
    return false; // an expression we can't evaluate never hides or styles data
  }
};

const decorations = (decs: Record<string, string> | undefined, ctx: Record<string, unknown>) =>
  Object.entries(decs ?? {})
    .filter(([, expr]) => holds(expr, ctx))
    .map(([name]) => DECORATION[name]);

export interface ListViewProps {
  schema: ListSchema;
  list: RecordList | GroupedList;
  /** Base evaluation context (user context, uid, companies…). */
  evalContext?: EvalContext;
  /** Remembers the optional columns the user picked (per view). */
  storageKey?: string;
  onOpen?(record: OdooRecord): void;
  onButton?(record: OdooRecord, button: ButtonNode): void;
}

type Column = FieldNode | ButtonNode;

function readShown(key: string | undefined, schema: ListSchema): Set<string> {
  const defaults = schema.columns
    .filter((c) => c.type === "field" && c.optional === "show")
    .map((c) => (c as FieldNode).name);
  if (!key) return new Set(defaults);
  try {
    const saved = localStorage.getItem(`novi.list.optional.${key}`);
    return new Set(saved ? (JSON.parse(saved) as string[]) : defaults);
  } catch {
    return new Set(defaults);
  }
}

export function ListView({ schema, list, evalContext = {}, storageKey, onOpen, onButton }: ListViewProps) {
  const t = useT();
  useModel(list);
  const [shown, setShown] = useState(() => readShown(storageKey, schema));
  const [dragged, setDragged] = useState<number | null>(null);

  const meta = (name: string) => schema.fields[name] ?? { type: "char" };
  const optional = schema.columns.filter((c): c is FieldNode => c.type === "field" && !!c.optional);
  // column_invisible is evaluated once for the whole list (context, parent), not per row
  const columns = schema.columns.filter(
    (c): c is Column =>
      (c.type === "field" &&
        c.invisible !== true &&
        !holds(c.columnInvisible, evalContext) &&
        (!c.optional || shown.has(c.name)) &&
        c.widget !== "handle" &&
        // images wait for their own widget (P2.13.9)
        !["binary", "image"].includes(meta(c.name).type)) ||
      (c.type === "button" && !holds(c.columnInvisible, evalContext)),
  );
  const handle = schema.columns.find((c): c is FieldNode => c.type === "field" && c.widget === "handle");
  const flat = list instanceof RecordList ? list : undefined;
  const canDrag = !!handle && !!flat;
  const [sortField, sortDir] = (flat?.order ?? "").split(",")[0]!.trim().split(/\s+/);

  const toggleOptional = (name: string, on: boolean) => {
    const next = new Set(shown);
    if (on) next.add(name);
    else next.delete(name);
    setShown(next);
    try {
      if (storageKey) localStorage.setItem(`novi.list.optional.${storageKey}`, JSON.stringify([...next]));
    } catch {
      // per-browser convenience only
    }
  };

  const cell = (rec: OdooRecord, c: Column, ctx: Record<string, unknown>): ReactNode => {
    if (c.type === "button") {
      if (holds(c.invisible, ctx)) return null;
      return (
        <Button
          variant={c.primary ? "primary" : "secondary"}
          size="sm"
          title={c.help ?? c.string}
          onClick={(e) => {
            e.stopPropagation();
            onButton?.(rec, c);
          }}
        >
          {c.string ?? c.name}
        </Button>
      );
    }
    if (holds(c.invisible, ctx)) return null;
    const m = meta(c.name);
    const Cell = fieldRegistry.resolve(m.type, c.widget).component;
    return (
      <Cell
        name={c.name}
        value={rec.values[c.name]}
        meta={m}
        options={c.options ?? {}}
        mode="read"
        readonly
        required={false}
        context={ctx}
        onChange={() => undefined}
      />
    );
  };

  /** A total formatted like the column's values (through the same field widget). */
  const total = (c: FieldNode, value: number | undefined) => {
    if (value === undefined) return null;
    const m = meta(c.name);
    const Cell = fieldRegistry.resolve(m.type).component;
    return (
      <Cell
        name={c.name}
        value={value}
        meta={m}
        options={{}}
        mode="read"
        readonly
        required={false}
        context={{}}
        onChange={() => undefined}
      />
    );
  };

  const row = (rec: OdooRecord, records: RecordList, index: number, depth: number) => {
    const ctx = { ...evalContext, ...rec.evalValues() };
    const id = rec.id!;
    const selected = records.selection.has(id);
    return (
      <tr
        key={rec.id ?? rec.virtualId}
        tabIndex={onOpen ? 0 : undefined}
        onClick={onOpen ? () => onOpen(rec) : undefined}
        onKeyDown={onOpen ? (e) => e.key === "Enter" && onOpen(rec) : undefined}
        onDragOver={canDrag ? (e) => e.preventDefault() : undefined}
        onDrop={
          canDrag && dragged !== null
            ? () => {
                void flat!.resequence(dragged, index, handle!.name);
                setDragged(null);
              }
            : undefined
        }
        className={cn(
          "border-t border-border",
          onOpen && "cursor-pointer hover:bg-surface-sunken focus-visible:bg-surface-sunken",
          selected && "bg-surface-sunken",
          decorations(schema.decorations, ctx),
        )}
      >
        <td className="w-8 px-3 py-2" onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            className="size-4 accent-primary"
            aria-label={t("selectRecord")}
            checked={selected}
            onChange={(e) => records.select(id, e.target.checked)}
          />
        </td>
        {canDrag ? (
          <td
            className="w-6 cursor-grab text-text-muted"
            draggable
            onDragStart={() => setDragged(id)}
            onClick={(e) => e.stopPropagation()}
          >
            <GripVertical className="size-4" aria-hidden />
          </td>
        ) : null}
        {columns.map((c, i) => {
          const numeric = c.type === "field" && NUMERIC.has(meta(c.name).type);
          return (
            <td
              key={`${c.type}-${c.type === "field" ? c.name : (c.name ?? i)}`}
              className={cn(
                "max-w-xs truncate px-3 py-2",
                numeric && "text-right tabular-nums",
                i === 0 && depth > 0 && "ps-6",
                c.type === "field" && decorations(c.decorations, ctx),
              )}
            >
              {cell(rec, c, ctx)}
            </td>
          );
        })}
        {optional.length ? <td /> : null}
      </tr>
    );
  };

  const groupRows = (g: GroupedList, depth: number): ReactNode[] =>
    g.groups.flatMap((group: Group, gi: number) => {
      const out: ReactNode[] = [
        <tr
          key={`g-${depth}-${gi}`}
          className="cursor-pointer border-t border-border bg-surface-sunken/60 font-medium hover:bg-surface-sunken"
          onClick={() => void g.toggle(group)}
        >
          <td className="px-3 py-2">
            {group.folded ? (
              <ChevronRight className="size-4" aria-hidden />
            ) : (
              <ChevronDown className="size-4" aria-hidden />
            )}
          </td>
          {canDrag ? <td /> : null}
          {columns.map((c, i) =>
            i === 0 ? (
              <td key="label" className={cn("px-3 py-2", depth > 0 && "ps-6")}>
                {group.label === false ? t("noGroupValue") : group.label}{" "}
                <span className="font-normal text-text-muted">({group.count})</span>
              </td>
            ) : (
              <td key={`a-${i}`} className="px-3 py-2 text-right tabular-nums">
                {c.type === "field" ? total(c, group.aggregates[c.name]) : null}
              </td>
            ),
          )}
          {optional.length ? <td /> : null}
        </tr>,
      ];
      if (!group.folded && group.list) {
        if (group.list instanceof GroupedList) out.push(...groupRows(group.list, depth + 1));
        else out.push(...group.list.records.map((r, i) => row(r, group.list as RecordList, i, depth + 1)));
      }
      return out;
    });

  const pageTotals =
    flat && columns.some((c) => c.type === "field" && (c.sum || c.avg))
      ? columns.map((c) => {
          if (c.type !== "field" || !(c.sum || c.avg)) return undefined;
          const values = flat.records.map((r) => Number(r.values[c.name] ?? 0));
          const sum = values.reduce((a, b) => a + b, 0);
          return c.sum ? sum : values.length ? sum / values.length : 0;
        })
      : undefined;
  const allSelected =
    !!flat && flat.records.length > 0 && flat.records.every((r) => flat.selection.has(r.id!));

  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-surface">
      <table className="w-full border-collapse text-sm">
        <thead className="bg-surface-sunken text-left text-text-muted">
          <tr>
            <th scope="col" className="w-8 px-3 py-2">
              {flat ? (
                <input
                  type="checkbox"
                  className="size-4 accent-primary"
                  aria-label={t("selectAll")}
                  checked={allSelected}
                  onChange={(e) => flat.selectAll(e.target.checked)}
                />
              ) : null}
            </th>
            {canDrag ? <th scope="col" className="w-6" /> : null}
            {columns.map((c, i) => {
              if (c.type === "button") return <th key={`b-${i}`} scope="col" />;
              const m = meta(c.name);
              const label = c.string ?? m.string ?? c.name;
              const sortable = !!flat && m.sortable !== false;
              const active = sortField === c.name;
              return (
                <th
                  key={c.name}
                  scope="col"
                  aria-sort={active ? (sortDir === "DESC" ? "descending" : "ascending") : undefined}
                  className={cn(
                    "whitespace-nowrap px-3 py-2 font-medium",
                    NUMERIC.has(m.type) && "text-right",
                  )}
                >
                  {sortable ? (
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 hover:text-text"
                      title={t("sortBy", { name: String(label) })}
                      onClick={() => void flat!.sortBy(c.name)}
                    >
                      {label}
                      {active ? (
                        sortDir === "DESC" ? (
                          <ArrowDown className="size-3.5" aria-hidden />
                        ) : (
                          <ArrowUp className="size-3.5" aria-hidden />
                        )
                      ) : null}
                    </button>
                  ) : (
                    label
                  )}
                </th>
              );
            })}
            {optional.length ? (
              <th scope="col" className="w-8 px-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" aria-label={t("optionalColumns")}>
                      <Columns3 aria-hidden />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {optional.map((c) => (
                      <DropdownMenuCheckboxItem
                        key={c.name}
                        checked={shown.has(c.name)}
                        onCheckedChange={(on) => toggleOptional(c.name, on === true)}
                        onSelect={(e) => e.preventDefault()}
                      >
                        {c.string ?? meta(c.name).string ?? c.name}
                      </DropdownMenuCheckboxItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {flat ? flat.records.map((r, i) => row(r, flat, i, 0)) : groupRows(list as GroupedList, 0)}
        </tbody>
        {pageTotals ? (
          <tfoot className="border-t border-border font-medium">
            <tr>
              <td />
              {canDrag ? <td /> : null}
              {columns.map((c, i) => (
                <td key={`t-${i}`} className="px-3 py-2 text-right tabular-nums">
                  {c.type === "field" ? total(c, pageTotals[i]) : null}
                </td>
              ))}
              {optional.length ? <td /> : null}
            </tr>
          </tfoot>
        ) : null}
      </table>
    </div>
  );
}
