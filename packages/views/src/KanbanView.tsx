/**
 * Generic kanban (L4, P2.11): cards from the kanban schema's sections and field roles, through
 * the field registry; columns from the engine's GroupedList (Odoo's `default_group_by` or the
 * search's), with counts, the progress bar and its sum, fold/unfold, drag and drop between
 * columns, quick create and "load more". Ungrouped, the cards flow in a grid. NOVI's own card
 * layout (D-23): Odoo's QWeb templates only tell what each value is for.
 */
import type { GroupedList } from "@novi/engine";
import { type Group, type OdooRecord, RecordList, useFormView, useModel } from "@novi/engine";
import { fieldRegistry } from "@novi/fields";
import type { EvalContext } from "@novi/odoo-expr";
import type { ButtonNode, CardRole, FieldNode, KanbanSchema, WidgetNode } from "@novi/odoo-meta";
import { Badge, Button, cn, Input, useT } from "@novi/ui";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { type ReactNode, useState } from "react";

import { FormView } from "./FormView.js";

export interface KanbanViewProps {
  schema: KanbanSchema;
  list: RecordList | GroupedList;
  evalContext?: EvalContext;
  onOpen?(record: OdooRecord): void;
  onButton?(record: OdooRecord, button: ButtonNode): void;
  /** A save or move was refused (Odoo's error): the screen shows its error dialog. */
  onError?(error: unknown): void;
}

/** Odoo's progress-bar colour names → NOVI's tokens. */
const BAR: Record<string, string> = {
  success: "fill-success",
  warning: "fill-warning",
  danger: "fill-danger",
  info: "fill-info",
  muted: "fill-text-muted",
};

/** The bar's coloured parts, left to right: [value, colour, start, count]. */
function segments(colors: Record<string, string>, counts: Record<string, number>) {
  let x = 0;
  return Object.entries(colors).flatMap(([value, colour]) => {
    const n = counts[value] ?? 0;
    if (!n) return [];
    const part = [value, colour, x, n] as const;
    x += n;
    return [part];
  });
}

type CardNode = FieldNode | ButtonNode | WidgetNode;

export function KanbanView({ schema, list, evalContext = {}, onOpen, onButton, onError }: KanbanViewProps) {
  useModel(list);
  const guard = (step: () => Promise<unknown>) => void step().catch((e: unknown) => onError?.(e));
  const card = (rec: OdooRecord, draggable: boolean) => (
    <Card
      key={rec.id ?? rec.virtualId}
      record={rec}
      schema={schema}
      evalContext={evalContext}
      draggable={draggable}
      onOpen={onOpen}
      onButton={onButton}
      guard={guard}
    />
  );
  if (list instanceof RecordList)
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
        {list.records.map((r) => card(r, false))}
        <LoadMore list={list} guard={guard} />
      </div>
    );
  const field = list.config.groupBy[0] ?? "";
  // records move between columns only when the column is a plain field (not `date:month`)
  const canMove = schema.recordsDraggable !== false && !field.includes(":");
  return (
    <div className="flex items-start gap-3 overflow-x-auto pb-3">
      {list.groups.map((g, i) => (
        <Column
          key={i}
          group={g}
          list={list}
          schema={schema}
          guard={guard}
          card={(r) => card(r, canMove)}
          canMove={canMove}
        />
      ))}
    </div>
  );
}

function Column({
  group,
  list,
  schema,
  guard,
  card,
  canMove,
}: {
  group: Group;
  list: GroupedList;
  schema: KanbanSchema;
  guard(step: () => Promise<unknown>): void;
  card(r: OdooRecord): ReactNode;
  canMove: boolean;
}) {
  const t = useT();
  const [over, setOver] = useState(false);
  const [creating, setCreating] = useState(false);
  const label = group.label === false ? t("noGroupValue") : group.label;
  if (group.folded)
    return (
      <button
        type="button"
        onClick={() => guard(() => list.toggle(group))}
        className="flex w-10 shrink-0 flex-col items-center gap-2 rounded-lg bg-surface-sunken py-3 text-sm hover:bg-border"
        aria-label={`${label} (${group.count})`}
      >
        <ChevronRight aria-hidden className="size-4" />
        <span className="[writing-mode:vertical-rl]">{label}</span>
        <Badge>{group.count}</Badge>
      </button>
    );
  const records = group.list instanceof RecordList ? group.list : undefined;
  const sumField = schema.progressbar?.sumField;
  const canCreate = schema.quickCreate !== false && schema.access.create !== false;
  return (
    <section
      aria-label={label}
      className={cn(
        "grid w-72 shrink-0 grid-cols-[minmax(0,1fr)] content-start gap-2 rounded-lg bg-surface-sunken p-2",
        over && "outline outline-2 outline-primary",
      )}
      onDragOver={
        canMove
          ? (e) => {
              e.preventDefault();
              setOver(true);
            }
          : undefined
      }
      onDragLeave={() => setOver(false)}
      onDrop={
        canMove
          ? (e) => {
              setOver(false);
              const key = e.dataTransfer.getData("text/x-novi-record");
              const rec = list.groups
                .flatMap((g) => (g.list instanceof RecordList ? g.list.records : []))
                .find((r) => String(r.id) === key);
              if (rec && !groupHolds(group, rec)) guard(() => list.moveTo(rec, group));
            }
          : undefined
      }
    >
      <header className="flex items-center gap-1 px-1">
        <h2 className="min-w-0 truncate text-sm font-semibold">{label}</h2>
        <span className="text-sm text-text-muted">{group.count}</span>
        <span className="ms-auto flex items-center">
          {canCreate ? (
            <Button
              variant="ghost"
              size="icon"
              aria-label={t("quickCreate")}
              onClick={() => setCreating(true)}
            >
              <Plus aria-hidden />
            </Button>
          ) : null}
          <Button
            variant="ghost"
            size="icon"
            aria-label={t("fold")}
            onClick={() => guard(() => list.toggle(group))}
          >
            <ChevronLeft aria-hidden />
          </Button>
        </span>
      </header>
      {schema.progressbar ? (
        <Progress
          group={group}
          colors={schema.progressbar.colors}
          sum={sumField ? group.aggregates[sumField] : undefined}
          schema={schema}
        />
      ) : null}
      {creating ? (
        <QuickCreate
          schema={schema}
          list={list}
          group={group}
          guard={guard}
          onDone={() => setCreating(false)}
        />
      ) : null}
      {records?.records.map(card)}
      {records ? <LoadMore list={records} guard={guard} /> : null}
    </section>
  );
}

/** The record is already in this column. */
const groupHolds = (group: Group, rec: OdooRecord) =>
  group.list instanceof RecordList && group.list.records.includes(rec);

/** The column's records by the bar's field (coloured), and the bar's sum (e.g. expected revenue). */
function Progress({
  group,
  colors,
  sum,
  schema,
}: {
  group: Group;
  colors: Record<string, string>;
  sum: number | undefined;
  schema: KanbanSchema;
}) {
  const counts = group.progress ?? {};
  const total = Math.max(group.count, 1);
  const sumField = schema.progressbar?.sumField;
  const meta = sumField ? schema.fields[sumField] : undefined;
  const Sum = meta ? fieldRegistry.resolve(meta.type).component : undefined;
  return (
    <div className="flex items-center gap-2 px-1">
      <svg
        className="h-1.5 flex-1 overflow-hidden rounded-full fill-border"
        viewBox={`0 0 ${total} 1`}
        preserveAspectRatio="none"
        aria-hidden
      >
        <rect width={total} height={1} />
        {segments(colors, counts).map(([value, colour, x, n]) => (
          <rect key={value} x={x} width={n} height={1} className={BAR[colour] ?? "fill-text-muted"}>
            <title>{`${value}: ${n}`}</title>
          </rect>
        ))}
      </svg>
      {Sum && sum !== undefined ? (
        <span className="text-xs font-medium tabular-nums">
          <Sum
            name={sumField!}
            value={sum}
            meta={meta!}
            options={{}}
            mode="read"
            readonly
            required={false}
            context={{}}
            onChange={() => undefined}
          />
        </span>
      ) : null}
    </div>
  );
}

/**
 * A new record in a column (P2.11.4): the view's quick-create form (`quick_create_view`, loaded
 * with `form_view_ref`), or just a name (`name_create`), with the column as the default.
 */
function QuickCreate({
  schema,
  list,
  group,
  guard,
  onDone,
}: {
  schema: KanbanSchema;
  list: GroupedList;
  group: Group;
  guard(step: () => Promise<unknown>): void;
  onDone(): void;
}) {
  const t = useT();
  const [name, setName] = useState("");
  const [showErrors, setShowErrors] = useState(false);
  const field = list.config.groupBy[0]!;
  const key = Array.isArray(group.value) ? group.value[0] : group.value;
  const context = {
    ...list.config.context,
    ...(key !== false && key !== null ? { [`default_${field}`]: key } : {}),
    ...(schema.quickCreateView ? { form_view_ref: schema.quickCreateView } : {}),
  };
  const form = useFormView(schema.quickCreateView ? { model: list.config.model, context } : undefined);
  const record = form.data?.record;
  const add = () =>
    guard(async () => {
      if (record) {
        if (!(await record.save())) return setShowErrors(true); // the form marks what's missing
        await list.load();
      } else if (name.trim()) await list.quickCreate(group, name.trim());
      onDone();
    });
  return (
    <div className="grid gap-2 rounded-lg border border-primary bg-surface p-2">
      {schema.quickCreateView ? (
        record ? (
          <FormView record={record} onButton={() => undefined} showErrors={showErrors} />
        ) : null
      ) : (
        <Input
          autoFocus
          aria-label={t("quickCreate")}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") add();
            if (e.key === "Escape") onDone();
          }}
        />
      )}
      <div className="flex gap-2">
        <Button variant="primary" size="sm" onClick={add}>
          {t("add")}
        </Button>
        <Button variant="ghost" size="sm" onClick={onDone}>
          {t("discard")}
        </Button>
      </div>
    </div>
  );
}

function LoadMore({ list, guard }: { list: RecordList; guard(step: () => Promise<unknown>): void }) {
  const t = useT();
  if (list.records.length >= list.length) return null;
  return (
    <Button variant="ghost" size="sm" onClick={() => guard(() => list.loadMore())}>
      {t("loadMore", { n: list.length - list.records.length })}
    </Button>
  );
}

/** Where each role goes on NOVI's card. */
const TOP: CardRole[] = ["title", "subtitle"];
const CORNER: CardRole[] = ["priority", "favorite", "status"];
const FOOT: CardRole[] = ["date", "amount", "activity", "avatar"];

function Card({
  record,
  schema,
  evalContext,
  draggable,
  onOpen,
  onButton,
  guard,
}: {
  record: OdooRecord;
  schema: KanbanSchema;
  evalContext: EvalContext;
  draggable: boolean;
  onOpen?(record: OdooRecord): void;
  onButton?(record: OdooRecord, button: ButtonNode): void;
  guard(step: () => Promise<unknown>): void;
}) {
  useModel(record);
  const ctx = { ...evalContext, ...record.evalContext() };
  const nodes = [...schema.card.main, ...schema.card.aside, ...schema.card.footer].filter(
    (n): n is CardNode => n.type !== "widget" && !record.isInvisible(n),
  );
  // an Odoo widget NOVI doesn't have (activity, rotting days…) shows nothing on a card: its raw
  // value would be noise; it is counted by the coverage scanner instead
  const known = (f: FieldNode) =>
    !f.widget || fieldRegistry.resolve(schema.fields[f.name]!.type, f.widget).source === "widget";
  const fields = nodes.filter(
    (n): n is FieldNode => n.type === "field" && !!schema.fields[n.name] && known(n),
  );
  const by = (roles: CardRole[]) => fields.filter((f) => roles.includes(f.role ?? "body"));
  const body = fields.filter((f) => ![...TOP, ...CORNER, ...FOOT].includes(f.role ?? "body"));
  const buttons = nodes.filter((n): n is ButtonNode => n.type === "button" && !!n.string);
  const value = (f: FieldNode, cls?: string) => {
    const meta = schema.fields[f.name]!;
    const W = fieldRegistry.resolve(meta.type, f.widget).component;
    return (
      <span key={f.name} className={cls}>
        <W
          name={f.name}
          value={
            meta.type === "one2many" || meta.type === "many2many"
              ? record.list(f.name).records.map((r) => ({ id: r.id, display_name: r.values.display_name }))
              : record.values[f.name]
          }
          meta={meta}
          options={f.options ?? {}}
          mode="read"
          readonly={record.isReadonly(f)}
          required={false}
          context={ctx}
          label={f.string ?? meta.string}
          owner={{ model: record.config.model, id: record.id }}
          compact={f.role === "avatar"}
          // a card edits in place only what Odoo's cards do (priority stars, favourites): saved at once
          onChange={(v) =>
            guard(async () => {
              record.update({ [f.name]: v });
              await record.save();
            })
          }
        />
      </span>
    );
  };
  return (
    <article
      tabIndex={0}
      draggable={draggable}
      onDragStart={(e) => e.dataTransfer.setData("text/x-novi-record", String(record.id))}
      onClick={() => onOpen?.(record)}
      onKeyDown={(e) => e.key === "Enter" && onOpen?.(record)}
      className="grid min-w-0 cursor-pointer gap-2 overflow-hidden rounded-lg border border-border bg-surface p-3 text-sm shadow-sm hover:border-primary focus-visible:border-primary"
    >
      <div className="flex items-start gap-2">
        <div className="grid min-w-0 flex-1">
          {by(["title"]).map((f) => value(f, "truncate font-semibold"))}
          {by(["subtitle"]).map((f) => value(f, "truncate text-text-muted"))}
        </div>
        {by(CORNER).map((f) => value(f))}
      </div>
      {body.length ? <div className="grid gap-1">{body.map((f) => value(f, "min-w-0 truncate"))}</div> : null}
      {by(["date", "amount", "activity", "avatar"]).length || buttons.length ? (
        <div className="flex flex-wrap items-center gap-2 text-text-muted">
          {by(["date", "activity"]).map((f) => value(f))}
          {buttons.map((b, i) => (
            <Button
              key={i}
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onButton?.(record, b);
              }}
            >
              {b.string}
            </Button>
          ))}
          <span className="ms-auto flex items-center gap-2">
            {by(["amount"]).map((f) => value(f, "font-medium text-text tabular-nums"))}
            {by(["avatar"]).map((f) => value(f))}
          </span>
        </div>
      ) : null}
    </article>
  );
}
