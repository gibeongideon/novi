/**
 * Arch → ViewSchema (P2.3.3–P2.3.7). Scope comes from the harvested corpus (every primary form,
 * list, kanban and search view of the dev Odoo, `corpus/harvest.py`): the tags and attributes
 * that occur there, read for their meaning. Unknown markup is kept as generic `markup` (never an
 * error), so a new Odoo tag degrades gracefully instead of breaking a screen.
 */
import type { FieldInfo } from "@novi/odoo-client";
import { evaluate, ExprError, type PyValue } from "@novi/odoo-expr";

import type {
  ButtonNode,
  CardRole,
  ColumnNode,
  Decorations,
  FieldNode,
  FormNode,
  FormSchema,
  KanbanSchema,
  ListSchema,
  MarkupHint,
  Modifier,
  Modifiers,
  SearchFilter,
  SearchSchema,
  ViewAccess,
  ViewSchema,
  WidgetNode,
} from "./schema.js";
import { elements, parseXml, textOf, type XmlElement } from "./xml.js";

/** `get_views()` → `models`: field metadata per model (main model and related ones). */
export type ModelsInfo = Record<string, { fields: Record<string, FieldInfo> }>;

export interface ParseOptions {
  arch: string;
  model: string;
  models: ModelsInfo;
}

const TRUE = new Set(["1", "True", "true"]);
const FALSE = new Set(["0", "False", "false", ""]);

/** Constant modifiers become booleans; anything else stays an expression for odoo-expr. */
function modifier(v: string | undefined): Modifier | undefined {
  if (v === undefined) return undefined;
  const s = v.trim();
  return TRUE.has(s) ? true : FALSE.has(s) ? false : s;
}
const flag = (v: string | undefined): boolean | undefined =>
  v === undefined ? undefined : TRUE.has(v.trim()) ? true : FALSE.has(v.trim()) ? false : undefined;
const num = (v: string | undefined): number | undefined =>
  v === undefined || v === "" ? undefined : Number(v);
const classes = (el: XmlElement) => (el.attrs.class ?? "").split(/\s+/).filter(Boolean);

/** Drops undefined keys so schemas stay small and JSON-stable. */
function clean<T extends object>(o: T): T {
  for (const k of Object.keys(o) as (keyof T)[]) if (o[k] === undefined) delete o[k];
  return o;
}

function modifiers(a: Record<string, string>): Modifiers {
  return clean({
    invisible: modifier(a.invisible),
    readonly: modifier(a.readonly),
    required: modifier(a.required),
    columnInvisible: modifier(a.column_invisible),
  });
}

function decorations(a: Record<string, string>): Decorations | undefined {
  const out: Decorations = {};
  for (const [k, v] of Object.entries(a)) if (k.startsWith("decoration-")) out[k.slice(11)] = v;
  return Object.keys(out).length ? out : undefined;
}

/** Static options become an object; options that read record values stay an expression. */
function options(v: string | undefined): Pick<FieldNode, "options" | "optionsExpr"> {
  if (!v?.trim()) return {};
  try {
    const value = evaluate(v);
    return value && typeof value === "object" && !Array.isArray(value)
      ? { options: value as Record<string, PyValue> }
      : { optionsExpr: v };
  } catch (err) {
    if (err instanceof ExprError) return { optionsExpr: v }; // reads record values: per record
    throw err; // syntax errors are real defects: surface them
  }
}

function access(a: Record<string, string>): ViewAccess {
  return clean({
    create: flag(a.create),
    edit: flag(a.edit),
    delete: flag(a.delete),
    duplicate: flag(a.duplicate),
    import: flag(a.import),
    export: flag(a.export_xlsx),
  });
}

interface Ctx {
  model: string;
  models: ModelsInfo;
}
const fieldsOf = (c: Ctx) => c.models[c.model]?.fields ?? {};

function fieldNode(el: XmlElement, c: Ctx): FieldNode {
  const a = el.attrs;
  const node: FieldNode = clean({
    type: "field",
    name: a.name ?? "",
    string: a.string,
    widget: a.widget,
    ...options(a.options),
    context: a.context,
    domain: a.domain,
    placeholder: a.placeholder,
    help: a.help,
    nolabel: flag(a.nolabel),
    colspan: num(a.colspan),
    onChange: flag(a.on_change),
    canCreate: flag(a.can_create),
    canWrite: flag(a.can_write),
    forceSave: flag(a.force_save),
    decorations: decorations(a),
    optional: a.optional === "show" || a.optional === "hide" ? a.optional : undefined,
    sum: a.sum,
    avg: a.avg,
    width: a.width,
    statusbarVisible: a.statusbar_visible?.split(",").map((s) => s.trim()),
    mode: a.mode,
    ...modifiers(a),
  } as FieldNode);
  // x2many inline sub-views are parsed against the related model
  const sub = elements(el).filter((x) => x.tag === "list" || x.tag === "form" || x.tag === "kanban");
  const relation = fieldsOf(c)[node.name]?.relation;
  if (sub.length && relation) {
    const subCtx = { model: relation, models: c.models };
    node.views = Object.fromEntries(sub.map((x) => [x.tag, parseRoot(x, subCtx)]));
  }
  return node;
}

function buttonNode(el: XmlElement, c: Ctx): ButtonNode {
  const a = el.attrs;
  const cls = classes(el);
  const children = parseForm(elements(el), c);
  return clean({
    type: "button",
    name: a.name,
    kind: a.type === "object" || a.type === "action" ? a.type : undefined,
    special: a.special,
    string: a.string ?? a.title,
    icon: a.icon,
    help: a.help,
    context: a.context,
    confirm: a.confirm,
    primary: cls.includes("btn-primary") || cls.includes("oe_highlight") || undefined,
    hotkey: a["data-hotkey"],
    children: children.length ? children : undefined,
    ...modifiers(a),
  } as ButtonNode);
}

function widgetNode(el: XmlElement): WidgetNode {
  const { name = "", invisible, readonly, required, column_invisible, ...attrs } = el.attrs;
  return clean({
    type: "widget",
    name,
    attrs,
    ...modifiers({ invisible, readonly, required, column_invisible } as Record<string, string>),
  } as WidgetNode);
}

const HINTS: [string, MarkupHint][] = [
  ["oe_button_box", "buttonBox"],
  ["oe_title", "title"],
  ["oe_avatar", "avatar"],
  ["alert", "alert"],
  ["o_row", "row"],
  ["oe_inline", "inline"],
  ["text-muted", "muted"],
  ["o_form_label", "help"],
];

function parseForm(nodes: XmlElement["children"], c: Ctx): FormNode[] {
  const out: FormNode[] = [];
  for (const n of nodes) {
    if (typeof n === "string") {
      out.push({ type: "text", text: n.replace(/\s+/g, " ").trim() });
      continue;
    }
    const a = n.attrs;
    const kids = () => parseForm(n.children, c);
    switch (n.tag) {
      case "field":
        out.push(fieldNode(n, c));
        break;
      case "button":
        out.push(buttonNode(n, c));
        break;
      case "group":
        out.push(
          clean({
            type: "group",
            name: a.name,
            string: a.string,
            col: num(a.col),
            colspan: num(a.colspan),
            children: kids(),
            ...modifiers(a),
          } as FormNode),
        );
        break;
      case "notebook":
        // non-page children (helper fields) are kept next to the notebook
        out.push(
          ...parseForm(
            n.children.filter((p) => typeof p !== "string" && p.tag !== "page"),
            c,
          ),
        );
        out.push(
          clean({
            type: "notebook",
            pages: elements(n)
              .filter((p) => p.tag === "page")
              .map((p) =>
                clean({
                  type: "page",
                  name: p.attrs.name,
                  string: p.attrs.string ?? "",
                  children: parseForm(p.children, c),
                  ...modifiers(p.attrs),
                } as const),
              ),
            ...modifiers(a),
          } as FormNode),
        );
        break;
      case "header":
      case "sheet":
      case "footer":
        out.push(clean({ type: n.tag, children: kids(), ...modifiers(a) } as FormNode));
        break;
      case "label":
        out.push(
          clean({
            type: "label",
            for: a.for,
            string: a.string ?? (textOf(n) || undefined),
            ...modifiers(a),
          } as FormNode),
        );
        break;
      case "separator":
        out.push(clean({ type: "separator", string: a.string, ...modifiers(a) } as FormNode));
        break;
      case "widget":
        out.push(widgetNode(n));
        break;
      case "chatter":
        out.push(clean({ type: "chatter", ...modifiers(a) } as FormNode));
        break;
      case "app":
      case "block":
      case "setting":
        out.push(
          clean({
            type: n.tag,
            name: a.name ?? a.id,
            string: a.string ?? a.title ?? a["data-string"],
            help: a.help,
            children: kids(),
            ...modifiers(a),
          } as FormNode),
        );
        break;
      case "t": // QWeb grouping inside forms: transparent
        out.push(...kids());
        break;
      default: {
        const cls = classes(n);
        const hint = n.attrs.role === "alert" ? "alert" : HINTS.find(([k]) => cls.includes(k))?.[1];
        out.push(
          clean({
            type: "markup",
            tag: n.tag,
            hint,
            href: a.href,
            children: kids(),
            ...modifiers(a),
          } as FormNode),
        );
      }
    }
  }
  return out;
}

function base(root: XmlElement, c: Ctx) {
  return clean({
    model: c.model,
    fields: fieldsOf(c),
    string: root.attrs.string,
    jsClass: root.attrs.js_class,
    access: access(root.attrs),
  });
}

function parseList(root: XmlElement, c: Ctx): ListSchema {
  const a = root.attrs;
  const columns: ListSchema["columns"] = [];
  const headerButtons: ButtonNode[] = [];
  const groupRows: ListSchema["groupRows"] = {};
  for (const el of elements(root)) {
    if (el.tag === "field") columns.push(fieldNode(el, c));
    else if (el.tag === "button") columns.push(buttonNode(el, c));
    else if (el.tag === "widget") columns.push(widgetNode(el));
    else if (el.tag === "header")
      headerButtons.push(
        ...elements(el)
          .filter((b) => b.tag === "button")
          .map((b) => buttonNode(b, c)),
      );
    else if (el.tag === "column")
      columns.push(
        clean({
          type: "column",
          string: el.attrs.string,
          children: elements(el).flatMap((x): (FieldNode | ButtonNode | WidgetNode)[] =>
            x.tag === "field"
              ? [fieldNode(x, c)]
              : x.tag === "button"
                ? [buttonNode(x, c)]
                : x.tag === "widget"
                  ? [widgetNode(x)]
                  : [],
          ),
          ...modifiers(el.attrs),
        } as ColumnNode),
      );
    else if (el.tag === "groupby" && el.attrs.name) {
      const model = fieldsOf(c)[el.attrs.name]?.relation ?? c.model;
      const g = { model, models: c.models };
      groupRows[el.attrs.name] = {
        model,
        nodes: elements(el).flatMap((x): (FieldNode | ButtonNode)[] =>
          x.tag === "field" ? [fieldNode(x, g)] : x.tag === "button" ? [buttonNode(x, g)] : [],
        ),
      };
    }
    // <control>/<create>: x2many "add a line" controls, rendered by NOVI's own sub-list
  }
  return clean({
    viewType: "list",
    ...base(root, c),
    editable: a.editable === "top" || a.editable === "bottom" ? a.editable : undefined,
    multiEdit: flag(a.multi_edit),
    defaultOrder: a.default_order,
    defaultGroupBy: a.default_group_by,
    limit: num(a.limit),
    expand: flag(a.expand),
    openFormView: flag(a.open_form_view),
    decorations: decorations(a),
    columns,
    headerButtons,
    groupRows,
  } as ListSchema);
}

const ROLE_BY_WIDGET: Record<string, CardRole> = {
  many2many_tags: "tags",
  many2many_avatar_user: "avatar",
  many2many_avatar_employee: "avatar",
  many2one_avatar: "avatar",
  many2one_avatar_user: "avatar",
  many2one_avatar_employee: "avatar",
  image: "image",
  attachment_image: "image",
  priority: "priority",
  kanban_activity: "activity",
  kanban_color_picker: "color",
  boolean_favorite: "favorite",
  monetary: "amount",
  badge: "status",
  label_selection: "status",
  state_selection: "status",
  date: "date",
  remaining_days: "date",
  relative_date: "date",
};
const EMPHASIS = /^(fw-bold|fw-bolder|fs-\d|h[1-5]|o_kanban_record_title|o_text_overflow)$/;

function parseKanban(root: XmlElement, c: Ctx): KanbanSchema {
  const a = root.attrs;
  const fields = fieldsOf(c);
  const extraFields: string[] = [];
  let progressbar: KanbanSchema["progressbar"];
  let cardEl: XmlElement | undefined;
  let hasMenu = false;
  for (const el of elements(root)) {
    if (el.tag === "field" && el.attrs.name) extraFields.push(el.attrs.name);
    else if (el.tag === "progressbar" && el.attrs.field) {
      let colors: Record<string, string> = {};
      try {
        colors = JSON.parse(el.attrs.colors ?? "{}") as Record<string, string>;
      } catch {
        colors = (evaluate(el.attrs.colors ?? "{}") ?? {}) as Record<string, string>;
      }
      progressbar = clean({ field: el.attrs.field, colors, sumField: el.attrs.sum_field });
    } else if (el.tag === "card") cardEl = el;
    else if (el.tag === "templates")
      for (const t of elements(el)) {
        if (t.attrs["t-name"] === "card") cardEl = t;
        if (t.attrs["t-name"] === "menu") hasMenu = true;
      }
  }

  const card: KanbanSchema["card"] = { main: [], aside: [], footer: [] };
  const emphasised = new Set<FieldNode>();
  const walk = (el: XmlElement, section: keyof typeof card, emphasis: boolean) => {
    for (const x of elements(el)) {
      const sec = x.tag === "footer" || x.tag === "aside" ? x.tag : section;
      const emph =
        emphasis ||
        ["strong", "b", "h1", "h2", "h3", "h4", "h5"].includes(x.tag) ||
        classes(x).some((k) => EMPHASIS.test(k));
      if (x.tag === "field") {
        const f = fieldNode(x, c);
        if (emph) emphasised.add(f);
        card[sec].push(f);
      } else if (x.tag === "button") card[sec].push(buttonNode(x, c));
      else if (x.tag === "widget") card[sec].push(widgetNode(x));
      else walk(x, sec, emph);
    }
  };
  if (cardEl) walk(cardEl, "main", false);

  // fields read by the templates' QWeb expressions (`record.<field>.value`), not by <field> tags
  const refs = new Set<string>();
  const scan = (el: XmlElement) => {
    for (const [k, v] of Object.entries(el.attrs))
      if (k.startsWith("t-")) for (const m of v.matchAll(/\brecord\.([A-Za-z_]\w*)/g)) refs.add(m[1]!);
    elements(el).forEach(scan);
  };
  for (const el of elements(root)) if (el.tag === "templates" || el.tag === "card") scan(el);
  const templateFields = [...refs].filter((f) => fieldsOf(c)[f] && !extraFields.includes(f));

  // roles: by widget, then by type; one title (first emphasised value, else name/display_name)
  const all = [...card.main, ...card.aside, ...card.footer].filter((n): n is FieldNode => n.type === "field");
  for (const f of all) {
    const type = fields[f.name]?.type;
    f.role =
      (f.widget && ROLE_BY_WIDGET[f.widget]) ||
      (type === "many2many"
        ? "tags"
        : type === "date" || type === "datetime"
          ? "date"
          : type === "monetary"
            ? "amount"
            : undefined);
  }
  const textual = (f: FieldNode) =>
    !f.role && ["char", "many2one", "text", "selection"].includes(fields[f.name]?.type ?? "");
  const title =
    card.main.find((n): n is FieldNode => n.type === "field" && emphasised.has(n) && textual(n)) ??
    all.find((f) => !f.role && (f.name === "display_name" || f.name === "name"));
  if (title) title.role = "title";
  const subtitle = card.main.find((n): n is FieldNode => n.type === "field" && textual(n));
  if (subtitle) subtitle.role = "subtitle";
  for (const f of all) f.role ??= "body";

  return clean({
    viewType: "kanban",
    ...base(root, c),
    defaultGroupBy: a.default_group_by,
    defaultOrder: a.default_order,
    colorField: a.highlight_color,
    quickCreate: flag(a.quick_create),
    quickCreateView: a.quick_create_view,
    recordsDraggable: flag(a.records_draggable),
    groupCreate: flag(a.group_create),
    groupEdit: flag(a.group_edit),
    groupDelete: flag(a.group_delete),
    archivable: flag(a.archivable),
    progressbar,
    extraFields,
    templateFields,
    card,
    hasMenu,
  } as KanbanSchema);
}

/** `group_by` of a search filter's context (`{'group_by': 'stage_id'}`), if any. */
function groupByOf(context: string | undefined): string | undefined {
  if (!context?.includes("group_by")) return undefined;
  try {
    const v = evaluate(context, { context: {}, uid: 0 }) as Record<string, PyValue>;
    const g = v?.group_by;
    return typeof g === "string" ? g : Array.isArray(g) && typeof g[0] === "string" ? g[0] : undefined;
  } catch {
    return /['"]group_by['"]\s*:\s*\[?\s*['"]([^'"]+)['"]/.exec(context)?.[1];
  }
}

function parseSearch(root: XmlElement, c: Ctx): SearchSchema {
  const schema: SearchSchema = {
    viewType: "search",
    ...base(root, c),
    searchFields: [],
    filterGroups: [],
    groupBys: [],
    panel: [],
  };
  let group: SearchFilter[] = [];
  const close = () => {
    if (group.length) schema.filterGroups.push(group);
    group = [];
  };
  const walk = (el: XmlElement) => {
    for (const x of elements(el)) {
      const a = x.attrs;
      if (x.tag === "filter") {
        const gb = groupByOf(a.context);
        if (gb) {
          schema.groupBys.push(
            clean({ name: a.name, string: a.string ?? gb, fieldName: gb, invisible: modifier(a.invisible) }),
          );
          continue;
        }
        const f = clean({
          name: a.name,
          string: a.string ?? a.name ?? "",
          domain: a.domain,
          context: a.context,
          date: a.date,
          defaultPeriod: a.default_period,
          help: a.help,
          invisible: modifier(a.invisible),
        });
        if (f.date) {
          close();
          schema.filterGroups.push([f]); // date filters stand alone
        } else group.push(f);
      } else if (x.tag === "separator") close();
      else if (x.tag === "field") {
        close();
        schema.searchFields.push(
          clean({
            name: a.name ?? "",
            string: a.string,
            filterDomain: a.filter_domain,
            operator: a.operator,
            context: a.context,
            domain: a.domain,
            invisible: modifier(a.invisible),
          }),
        );
      } else if (x.tag === "group") {
        close();
        walk(x);
        close();
      } else if (x.tag === "searchpanel") {
        for (const s of elements(x).filter((f) => f.tag === "field" && f.attrs.name)) {
          const p = s.attrs;
          schema.panel.push(
            clean({
              name: p.name!,
              string: p.string,
              select: p.select === "multi" ? "multi" : "one",
              icon: p.icon,
              enableCounters: flag(p.enable_counters),
              expand: flag(p.expand),
              hierarchize: flag(p.hierarchize),
              limit: num(p.limit),
              groupby: p.groupby,
              domain: p.domain,
            } as const),
          );
        }
      }
    }
  };
  walk(root);
  close();
  return schema;
}

function parseRoot(root: XmlElement, c: Ctx): ViewSchema {
  switch (root.tag) {
    case "form":
      return { viewType: "form", ...base(root, c), children: parseForm(root.children, c) } as FormSchema;
    case "list":
    case "tree":
      return parseList(root, c);
    case "kanban":
      return parseKanban(root, c);
    case "search":
      return parseSearch(root, c);
    default:
      throw new Error(`Unsupported view type <${root.tag}> (iframe fallback)`);
  }
}

/** Parses one view as returned by `get_views` into NOVI's ViewSchema. */
export function parseView({ arch, model, models }: ParseOptions): ViewSchema {
  return parseRoot(parseXml(arch), { model, models });
}
