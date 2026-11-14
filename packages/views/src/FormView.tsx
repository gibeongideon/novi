/**
 * The generic form (P2.10, L4): renders any Odoo form view from its ViewSchema on a live
 * OdooRecord, in NOVI's own layout (D-23). The arch decides *what* is shown; this file decides
 * *how*, once, for every model:
 *   header      → status stepper + action buttons        sheet    → card
 *   group       → label/value rows, or columns of groups  notebook → tabs
 *   button box  → stat chips     title → large name       avatar   → round image
 * Modifiers (invisible / readonly / required) are re-evaluated on every change by the record.
 */
import { type OdooRecord, useModel, useRelatedRecords } from "@novi/engine";
import { fieldRegistry } from "@novi/fields";
import { safeEvaluate } from "@novi/odoo-expr";
import type {
  ButtonNode,
  FieldNode,
  FormNode,
  FormSchema,
  GroupNode,
  ListSchema,
  MarkupNode,
  SettingsNode,
} from "@novi/odoo-meta";
import { Avatar, Badge, Button, cn, type Step, Stepper, Tabs, useT } from "@novi/ui";
import { createContext, Fragment, type ReactNode, useContext } from "react";

import { leadField, ReadCell, visibleColumns } from "./ListView.js";

const NUMERIC = new Set(["integer", "float", "monetary"]);

export interface FormViewProps {
  record: OdooRecord;
  /** A button of the view was clicked (header, smart button, footer, in the sheet). */
  onButton(button: ButtonNode): void;
  /** The status bar moved the record to another step: save it (Odoo's client saves at once). */
  onSave?(): void;
  /** Mark required-but-empty fields (after a refused save). */
  showErrors?: boolean;
  /** Shown beside the sheet when the view has a chatter (P2.10.8). */
  chatter?: ReactNode;
}

interface Ctx {
  record: OdooRecord;
  invalid: Set<string>;
  showErrors: boolean;
  onButton(button: ButtonNode): void;
  onSave?(): void;
}
const FormCtx = createContext<Ctx | null>(null);
const useForm = () => useContext(FormCtx)!;

export function FormView({ record, onButton, onSave, showErrors = false, chatter }: FormViewProps) {
  useModel(record);
  const schema = record.config.schema as FormSchema;
  const invalid = new Set(showErrors ? record.invalidFields() : []);
  const hasChatter = !!chatter && schema.children.some((n) => n.type === "chatter");
  return (
    <FormCtx.Provider value={{ record, invalid, showErrors, onButton, onSave }}>
      <div className={cn("grid gap-4", hasChatter && "xl:grid-cols-[minmax(0,1fr)_20rem]")}>
        <div className="grid min-w-0 content-start gap-4">
          <Nodes nodes={schema.children} />
        </div>
        {hasChatter ? <aside className="min-w-0">{chatter}</aside> : null}
      </div>
    </FormCtx.Provider>
  );
}

function Nodes({ nodes }: { nodes: readonly FormNode[] }) {
  return (
    <>
      {nodes.map((n, i) => (
        <Node key={i} node={n} />
      ))}
    </>
  );
}

function Node({ node }: { node: FormNode }): ReactNode {
  const { record } = useForm();
  if (node.type === "text") return node.text;
  if (record.isInvisible(node)) return null;
  switch (node.type) {
    case "header":
      return <Header nodes={node.children} />;
    case "sheet":
      return (
        <section className="relative grid gap-5 rounded-lg border border-border bg-surface p-4 shadow-sm sm:p-6">
          <Nodes nodes={node.children} />
        </section>
      );
    case "footer":
      return (
        <div className="flex flex-wrap gap-2 border-t border-border pt-4">
          <Nodes nodes={node.children} />
        </div>
      );
    case "group":
      return <Group node={node} />;
    case "notebook": {
      const pages = node.pages.filter((p) => !record.isInvisible(p));
      return (
        <Tabs
          items={pages.map((p, i) => ({
            key: p.name ?? String(i),
            label: p.string,
            content: (
              <div className="grid gap-4">
                <Nodes nodes={p.children} />
              </div>
            ),
          }))}
        />
      );
    }
    case "page":
      return <Nodes nodes={node.children} />;
    case "field":
      return <FieldSlot node={node} />;
    case "label":
      return <FieldLabel node={node} />;
    case "button":
      return <ActionButton node={node} />;
    case "separator":
      return node.string ? (
        <h3 className="border-b border-border pb-1 text-sm font-semibold uppercase tracking-wide text-text-muted">
          {node.string}
        </h3>
      ) : (
        <hr className="border-border" />
      );
    case "widget":
      // the ribbon ("Paid", "Archived") is the one view widget with meaning in a generic form
      return node.name === "web_ribbon" && node.attrs.title ? (
        <Badge tone="info" className="absolute end-4 top-4">
          {node.attrs.title}
        </Badge>
      ) : null;
    case "chatter":
      return null; // the chatter slot sits beside the sheet (FormView)
    case "app":
    case "block":
    case "setting":
      return <Settings node={node} />;
    case "markup":
      return <Markup node={node} />;
  }
}

/** Status bar(s) and the record's actions. */
function Header({ nodes }: { nodes: readonly FormNode[] }) {
  const { record } = useForm();
  const visible = nodes.filter((n) => n.type !== "text" && !record.isInvisible(n));
  const bars = visible.filter((n): n is FieldNode => n.type === "field" && n.widget === "statusbar");
  const rest = visible.filter((n) => !bars.includes(n as FieldNode));
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Nodes nodes={rest} />
      <div className="ms-auto">
        {bars.map((b) => (
          <Statusbar key={b.name} node={b} />
        ))}
      </div>
    </div>
  );
}

function Statusbar({ node }: { node: FieldNode }) {
  const { record, onSave } = useForm();
  const meta = record.fields[node.name];
  const value = record.values[node.name] as unknown;
  const isM2o = meta?.type === "many2one";
  const related = useRelatedRecords(meta?.relation as string | undefined, record.fieldDomain(node), isM2o);
  const current = isM2o
    ? (((value as { id?: number } | false) || undefined)?.id ?? false)
    : (value as string);
  let steps: Step[] = isM2o
    ? (related.data ?? []).map((r) => ({ key: r.id, label: r.display_name }))
    : (meta?.selection ?? []).map(([key, label]) => ({ key, label }));
  if (!isM2o && node.statusbarVisible?.length)
    steps = steps.filter((s) => node.statusbarVisible!.includes(String(s.key)) || s.key === current);
  const clickable = !!node.options?.clickable && !record.isReadonly(node);
  return (
    <Stepper
      aria-label={node.string ?? meta?.string}
      steps={steps}
      current={current}
      onSelect={
        clickable
          ? (key) => {
              const step = steps.find((s) => s.key === key)!;
              record.update({ [node.name]: isM2o ? { id: key, display_name: step.label } : key });
              onSave?.();
            }
          : undefined
      }
    />
  );
}

/**
 * Odoo's group: a group of groups is columns (two by default, `col` otherwise); a group of
 * fields is label/value rows, where a `<label for>` labels the node after it.
 */
function Group({ node }: { node: GroupNode }) {
  const { record } = useForm();
  const kids = node.children.filter((c) => c.type === "text" || !record.isInvisible(c));
  const title = node.string ? <h3 className="text-sm font-semibold text-text">{node.string}</h3> : null;
  if (kids.some((c) => c.type === "group")) {
    const cols = Math.min(node.col ?? 2, 4);
    return (
      <div className="grid gap-3">
        {title}
        <div
          className={cn(
            "grid gap-x-8 gap-y-4",
            cols >= 2 && "md:grid-cols-2",
            cols >= 3 && "xl:grid-cols-3",
            cols >= 4 && "2xl:grid-cols-4",
          )}
        >
          {kids.map((c, i) => (
            <div key={i} className={cn("min-w-0", c.type !== "group" && "md:col-span-full")}>
              <Node node={c} />
            </div>
          ))}
        </div>
      </div>
    );
  }
  const rows: ReactNode[] = [];
  for (let i = 0; i < kids.length; i++) {
    const c = kids[i]!;
    if (c.type === "label" && c.for) {
      const next = kids[i + 1];
      rows.push(
        <Fragment key={i}>
          <FieldLabel node={c} />
          <div className="min-w-0">{next ? <Node node={next} /> : null}</div>
        </Fragment>,
      );
      i++;
    } else if (c.type === "field" && !c.nolabel && fieldShowsLabel(record, c)) {
      rows.push(
        <Fragment key={i}>
          <FieldLabel node={{ for: c.name, string: c.string }} />
          <div className="min-w-0">
            <FieldSlot node={c} labelled />
          </div>
        </Fragment>,
      );
    } else
      rows.push(
        <div key={i} className="min-w-0 sm:col-span-2">
          <Node node={c} />
        </div>,
      );
  }
  return (
    <div className="grid content-start gap-3">
      {title}
      <div className="grid items-center gap-x-4 gap-y-2 sm:grid-cols-[minmax(7rem,35%)_minmax(0,1fr)]">
        {rows}
      </div>
    </div>
  );
}

/** x2many lists take the whole row, with their label above (as a section). */
const fieldShowsLabel = (record: OdooRecord, node: FieldNode) =>
  !["one2many", "many2many"].includes(record.fields[node.name]?.type ?? "") ||
  node.widget === "many2many_tags";

function FieldLabel({ node }: { node: { for?: string; string?: string } }) {
  const { record, invalid } = useForm();
  const field = node.for ? record.fields[node.for] : undefined;
  const fieldNode = node.for ? record.nodes().find((n) => n.name === node.for) : undefined;
  const required = fieldNode ? record.isRequired(fieldNode) && !record.isReadonly(fieldNode) : false;
  return (
    <label
      htmlFor={node.for}
      title={field?.help as string | undefined}
      className={cn(
        "text-sm font-medium text-text-muted",
        node.for && invalid.has(node.for) && "text-danger",
      )}
    >
      {node.string ?? field?.string ?? ""}
      {required ? <span aria-hidden> *</span> : null}
    </label>
  );
}

function FieldSlot({ node, labelled = false }: { node: FieldNode; labelled?: boolean }) {
  const { record, invalid } = useForm();
  const t = useT();
  if (record.isInvisible(node)) return null;
  const meta = record.fields[node.name];
  if (!meta) return null;
  const isX2m = meta.type === "one2many" || meta.type === "many2many";
  if (isX2m && node.widget !== "many2many_tags") return <Lines node={node} />;
  const ctx = record.evalContext();
  const options = node.optionsExpr
    ? (safeEvaluate(node.optionsExpr, ctx, {}) as Record<string, unknown>)
    : (node.options ?? {});
  const W = fieldRegistry.resolve(meta.type, node.widget).component;
  const relational = ["many2one", "many2many", "one2many"].includes(meta.type);
  return (
    <W
      name={node.name}
      value={isX2m ? record.list(node.name).records.map((r) => r.values) : record.values[node.name]}
      meta={meta}
      options={options}
      mode="edit"
      readonly={record.isReadonly(node)}
      required={record.isRequired(node)}
      invalid={record.fieldError(node.name) ?? (invalid.has(node.name) ? t("requiredField") : undefined)}
      context={ctx}
      domain={relational ? record.fieldDomain(node) : undefined}
      placeholder={node.placeholder}
      label={labelled ? undefined : (node.string ?? meta.string)}
      onChange={(v) => record.update({ [node.name]: v })}
      onInvalid={(m) => record.markInvalid(node.name, m)}
    />
  );
}

/**
 * One2many / many2many lines, read-only for now (editing lines in place is P2.13.8): the inline
 * list view's columns, each value through its field widget.
 */
function Lines({ node }: { node: FieldNode }) {
  const { record } = useForm();
  const t = useT();
  const list = record.list(node.name);
  const sub = node.views?.list as ListSchema | undefined;
  const parentCtx = record.evalContext();
  const columns = sub ? visibleColumns(sub, { ...parentCtx, parent: parentCtx as never }, new Set()) : [];
  const label = node.string ?? record.fields[node.name]?.string;
  if (!columns.length) {
    const names = list.records.map((r) => String(r.values.display_name ?? "")).filter(Boolean);
    return names.length ? (
      <div className="flex flex-wrap gap-1">
        {names.map((n, i) => (
          <Badge key={i}>{n}</Badge>
        ))}
      </div>
    ) : null;
  }
  return (
    <div className="grid gap-2">
      {label && !node.nolabel ? <h3 className="text-sm font-semibold">{label}</h3> : null}
      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full text-sm">
          <thead className="bg-surface-sunken text-left text-text-muted">
            <tr>
              {columns.map((c, i) => {
                const f = leadField(c);
                const m = f ? sub!.fields[f.name] : undefined;
                return (
                  <th
                    key={i}
                    scope="col"
                    className={cn(
                      "whitespace-nowrap px-3 py-2 font-medium",
                      m && NUMERIC.has(m.type) && "text-end",
                    )}
                  >
                    {(c.type === "column" ? c.string : undefined) ?? f?.string ?? m?.string}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {list.records.map((line) => {
              const ctx = line.evalContext();
              return (
                <tr key={line.id ?? line.virtualId} className="border-t border-border">
                  {columns.map((c, i) => {
                    const f = leadField(c);
                    const numeric = !!f && NUMERIC.has(sub!.fields[f.name]?.type ?? "");
                    return (
                      <td key={i} className={cn("px-3 py-2 align-top", numeric && "text-end tabular-nums")}>
                        <ReadCell record={line} node={c} fields={sub!.fields} context={ctx} />
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            {!list.records.length ? (
              <tr>
                <td colSpan={columns.length} className="px-3 py-4 text-center text-text-muted">
                  {t("noRecords")}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** A button of the view; with stat fields inside, a smart-button chip (count + label). */
function ActionButton({ node }: { node: ButtonNode }) {
  const { onButton } = useForm();
  const stat = node.children?.length;
  return (
    <Button
      type="button"
      variant={node.primary ? "primary" : "secondary"}
      size="sm"
      title={node.help}
      className={stat ? "h-auto min-h-8 py-1" : undefined}
      onClick={() => onButton(node)}
    >
      {stat ? <StatContent nodes={node.children!} /> : (node.string ?? node.name)}
    </Button>
  );
}

function StatContent({ nodes }: { nodes: readonly FormNode[] }) {
  const { record } = useForm();
  return (
    <span className="flex items-baseline gap-1.5">
      {nodes.map((n, i) => {
        if (n.type === "text") return <span key={i}>{n.text}</span>;
        if (record.isInvisible(n)) return null;
        if (n.type === "field") {
          const meta = record.fields[n.name];
          if (!meta) return null;
          const W = fieldRegistry.resolve(
            meta.type,
            n.widget === "statinfo" ? undefined : n.widget,
          ).component;
          return (
            <Fragment key={i}>
              <span className="font-semibold tabular-nums">
                <W
                  name={n.name}
                  value={record.values[n.name]}
                  meta={meta}
                  options={n.options ?? {}}
                  mode="read"
                  readonly
                  required={false}
                  context={record.evalContext()}
                  onChange={() => undefined}
                />
              </span>
              {n.widget === "statinfo" && !n.nolabel ? (
                <span className="text-text-muted">{n.string ?? meta.string}</span>
              ) : null}
            </Fragment>
          );
        }
        return n.type === "markup" ? <StatContent key={i} nodes={n.children} /> : null;
      })}
    </span>
  );
}

function Markup({ node }: { node: MarkupNode }) {
  const { record } = useForm();
  switch (node.hint) {
    case "buttonBox": {
      const buttons = node.children.filter((c) => c.type !== "text" && !record.isInvisible(c));
      return buttons.length ? (
        <div className="flex flex-wrap gap-2">
          <Nodes nodes={buttons} />
        </div>
      ) : null;
    }
    case "title":
      return (
        <div className="grid gap-1 text-2xl font-semibold [&_input]:h-11 [&_input]:text-2xl [&_input]:font-semibold">
          <Nodes nodes={node.children} />
        </div>
      );
    case "avatar":
      return <AvatarSlot node={node} />;
    case "alert":
      return (
        <div role="status" className="rounded-md border border-info bg-surface-sunken px-4 py-3 text-sm">
          <Nodes nodes={node.children} />
        </div>
      );
    case "row":
    case "inline":
      return (
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Nodes nodes={node.children} />
        </div>
      );
    case "muted":
    case "help":
      return (
        <div className="text-sm text-text-muted">
          <Nodes nodes={node.children} />
        </div>
      );
  }
  if (node.tag === "a" && node.href && /^(https?:|mailto:|\/)/.test(node.href))
    return (
      <a href={node.href} target="_blank" rel="noreferrer" className="text-primary underline">
        <Nodes nodes={node.children} />
      </a>
    );
  if (/^h[1-6]$/.test(node.tag))
    return (
      <div className="font-semibold">
        <Nodes nodes={node.children} />
      </div>
    );
  return ["span", "b", "strong", "i", "em", "small"].includes(node.tag) ? (
    <span>
      <Nodes nodes={node.children} />
    </span>
  ) : (
    <div className="grid min-w-0 gap-2">
      <Nodes nodes={node.children} />
    </div>
  );
}

/** The record's image, or its initials; served by Odoo's `/web/image` route. */
function AvatarSlot({ node }: { node: MarkupNode }) {
  const { record } = useForm();
  const field = findField(node.children, (n) =>
    ["image", "binary"].includes(record.fields[n.name]?.type ?? ""),
  );
  if (!field) return <Nodes nodes={node.children} />;
  const has = !!record.values[field.name] && record.id;
  const stamp = encodeURIComponent(String(record.values.write_date ?? ""));
  return (
    <div className="float-end ms-4">
      <Avatar
        size="xl"
        name={String(record.values.display_name ?? record.values.name ?? "")}
        src={has ? `/web/image/${record.config.model}/${record.id}/${field.name}?unique=${stamp}` : undefined}
      />
    </div>
  );
}

const findField = (nodes: readonly FormNode[], match: (n: FieldNode) => boolean): FieldNode | undefined => {
  for (const n of nodes) {
    if (n.type === "field" && match(n)) return n;
    const kids = "children" in n && Array.isArray(n.children) ? (n.children as FormNode[]) : [];
    const found = findField(kids, match);
    if (found) return found;
  }
  return undefined;
};

/** Settings screens: app → section, block → card of settings, setting → one option with help. */
function Settings({ node }: { node: SettingsNode }) {
  if (node.type === "app")
    return (
      <section className="grid gap-4">
        {node.string ? <h2 className="text-lg font-semibold">{node.string}</h2> : null}
        <Nodes nodes={node.children} />
      </section>
    );
  if (node.type === "block")
    return (
      <section className="grid gap-3 rounded-lg border border-border p-4">
        {node.string ? <h3 className="font-semibold">{node.string}</h3> : null}
        <div className="grid gap-4 md:grid-cols-2">
          <Nodes nodes={node.children} />
        </div>
      </section>
    );
  return (
    <div className="grid content-start gap-1">
      {node.string ? <span className="text-sm font-medium">{node.string}</span> : null}
      <Nodes nodes={node.children} />
      {node.help ? <p className="text-sm text-text-muted">{node.help}</p> : null}
    </div>
  );
}
