/**
 * Generic list renderer (L4, P2.9 first slice: read-only). Columns, labels and alignment come
 * from the view schema and Odoo's field metadata; every cell renders through the field registry
 * (widget → type default → fallback); cell `invisible` and row `decoration-*` are evaluated by
 * odoo-expr on each row. Not yet: sorting, paging, grouping, selection, inline editing (P2.9).
 */
import { fieldRegistry } from "@novi/fields";
import { evaluateBool } from "@novi/odoo-expr";
import { type FieldNode, type ListSchema, recordEvalValues } from "@novi/odoo-meta";
import { cn, useT } from "@novi/ui";

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

export interface ListViewProps {
  schema: ListSchema;
  records: Record<string, unknown>[];
  /** Base evaluation context (user context, uid…). */
  evalContext?: Record<string, unknown>;
  onOpen?(id: number): void;
}

export function ListView({ schema, records, evalContext = {}, onOpen }: ListViewProps) {
  const t = useT();
  // what the list shows by default (optional="hide" columns wait for the column picker, P2.9.2);
  // column_invisible is evaluated once for the whole list (context, parent), not per row
  const columns = schema.columns.filter(
    (c): c is FieldNode =>
      c.type === "field" &&
      c.invisible !== true &&
      !holds(c.columnInvisible, evalContext) &&
      c.optional !== "hide" &&
      c.widget !== "handle" &&
      // images wait for their own widget (P2.13.9)
      !["binary", "image"].includes(schema.fields[c.name]?.type ?? ""),
  );
  if (!records.length) return <p className="py-10 text-center text-text-muted">{t("noRecords")}</p>;
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-surface">
      <table className="w-full border-collapse text-sm">
        <thead className="bg-surface-sunken text-left text-text-muted">
          <tr>
            {columns.map((c) => (
              <th
                key={c.name}
                scope="col"
                className={cn(
                  "whitespace-nowrap px-3 py-2 font-medium",
                  NUMERIC.has(schema.fields[c.name]?.type ?? "") && "text-right",
                )}
              >
                {c.string ?? schema.fields[c.name]?.string ?? c.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {records.map((rec) => {
            const ctx = { ...evalContext, ...recordEvalValues(rec, schema.fields) };
            const decoration = Object.entries(schema.decorations ?? {})
              .filter(([, expr]) => holds(expr, ctx))
              .map(([name]) => DECORATION[name]);
            const id = rec.id as number;
            return (
              <tr
                key={id}
                tabIndex={onOpen ? 0 : undefined}
                onClick={onOpen ? () => onOpen(id) : undefined}
                onKeyDown={onOpen ? (e) => e.key === "Enter" && onOpen(id) : undefined}
                className={cn(
                  "border-t border-border",
                  onOpen && "cursor-pointer hover:bg-surface-sunken focus-visible:bg-surface-sunken",
                  decoration,
                )}
              >
                {columns.map((c) => {
                  const meta = schema.fields[c.name] ?? { type: "char" };
                  const Cell = fieldRegistry.resolve(meta.type, c.widget).component;
                  const cellDecoration = Object.entries(c.decorations ?? {})
                    .filter(([, expr]) => holds(expr, ctx))
                    .map(([name]) => DECORATION[name]);
                  return (
                    <td
                      key={c.name}
                      className={cn(
                        "max-w-xs truncate px-3 py-2",
                        NUMERIC.has(meta.type) && "text-right tabular-nums",
                        cellDecoration,
                      )}
                    >
                      {holds(c.invisible, ctx) ? null : (
                        <Cell
                          name={c.name}
                          value={rec[c.name]}
                          meta={meta}
                          options={c.options ?? {}}
                          mode="read"
                          readonly
                          required={false}
                          context={ctx}
                          onChange={() => undefined}
                        />
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
