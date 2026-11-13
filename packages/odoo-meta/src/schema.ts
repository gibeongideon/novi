/**
 * ViewSchema (P2.3.2): what an Odoo view *means*, as plain JSON, for NOVI's own renderers.
 * No Odoo CSS classes or DOM survive except a few semantic hints; layout is NOVI's (D-23).
 * Modifiers stay Python expressions for `@novi/odoo-expr`; constant ones are folded to booleans.
 * Field metadata is referenced by name from `fields` (one copy per view, P2.3.7).
 */
import type { FieldInfo } from "@novi/odoo-client";
import type { PyValue } from "@novi/odoo-expr";

/** `true`/`false`, or an expression evaluated per record (`"state != 'draft'"`). */
export type Modifier = boolean | string;

export interface Modifiers {
  invisible?: Modifier;
  readonly?: Modifier;
  required?: Modifier;
  /** List columns: hide the whole column (evaluated with the parent/context, not the row). */
  columnInvisible?: Modifier;
}

/** `decoration-danger="expr"` → `{ danger: "expr" }` (bf, it, danger, info, muted, primary, success, warning). */
export type Decorations = Record<string, string>;

export interface FieldNode extends Modifiers {
  type: "field";
  name: string;
  /** Label override from the arch (else the field's own `string`). */
  string?: string;
  widget?: string;
  /** Static widget options; `optionsExpr` when they read record values. */
  options?: Record<string, PyValue>;
  optionsExpr?: string;
  /** Python expressions evaluated per record. */
  context?: string;
  domain?: string;
  placeholder?: string;
  help?: string;
  nolabel?: boolean;
  colspan?: number;
  /** Changing this field asks Odoo for an onchange (`on_change="1"` from get_views). */
  onChange?: boolean;
  /** Relational access computed by get_views for the current user. */
  canCreate?: boolean;
  canWrite?: boolean;
  forceSave?: boolean;
  decorations?: Decorations;
  /** List columns. */
  optional?: "show" | "hide";
  sum?: string;
  avg?: string;
  width?: string;
  /** Statusbar: states shown even when not reached. */
  statusbarVisible?: string[];
  /** x2many: preferred sub-view and the inline sub-views from the arch. */
  mode?: string;
  views?: Partial<Record<"list" | "form" | "kanban", ViewSchema>>;
  /** Kanban cards: what the value is for, so NOVI's card can place it. */
  role?: CardRole;
}

export interface ButtonNode extends Modifiers {
  type: "button";
  name?: string;
  /** `object` (model method), `action` (action id/xmlid), or `special` (save/cancel in dialogs). */
  kind?: "object" | "action";
  special?: string;
  string?: string;
  icon?: string;
  help?: string;
  context?: string;
  confirm?: string;
  /** Emphasised by the arch (`btn-primary` / `oe_highlight`): NOVI's primary action. */
  primary?: boolean;
  hotkey?: string;
  /** Smart buttons hold a stat field inside. */
  children?: FormNode[];
}

export interface GroupNode extends Modifiers {
  type: "group";
  name?: string;
  string?: string;
  col?: number;
  colspan?: number;
  children: FormNode[];
}

export interface PageNode extends Modifiers {
  type: "page";
  name?: string;
  string: string;
  children: FormNode[];
}

export interface NotebookNode extends Modifiers {
  type: "notebook";
  pages: PageNode[];
}

/** Containers whose meaning is their position: action bar, main card, dialog footer. */
export interface SectionNode extends Modifiers {
  type: "header" | "sheet" | "footer";
  children: FormNode[];
}

export interface LabelNode extends Modifiers {
  type: "label";
  for?: string;
  string?: string;
}

export interface SeparatorNode extends Modifiers {
  type: "separator";
  string?: string;
}

/** A named Odoo view widget (not a field), e.g. a ribbon or a document link. */
export interface WidgetNode extends Modifiers {
  type: "widget";
  name: string;
  attrs: Record<string, string>;
}

export interface ChatterNode extends Modifiers {
  type: "chatter";
}

/** Settings screens (`res.config.settings`): app → block → setting. */
export interface SettingsNode extends Modifiers {
  type: "app" | "block" | "setting";
  name?: string;
  string?: string;
  help?: string;
  children: FormNode[];
}

/**
 * Any other markup (div, span, h1, p, a, …), kept for its content and structure. `hint` names
 * the few Odoo layout conventions that carry meaning; NOVI renders them its own way.
 */
export interface MarkupNode extends Modifiers {
  type: "markup";
  tag: string;
  hint?: MarkupHint;
  href?: string;
  children: FormNode[];
}
export type MarkupHint = "buttonBox" | "title" | "avatar" | "alert" | "row" | "inline" | "muted" | "help";

export interface TextNode {
  type: "text";
  text: string;
}

export type FormNode =
  | FieldNode
  | ButtonNode
  | GroupNode
  | NotebookNode
  | PageNode
  | SectionNode
  | LabelNode
  | SeparatorNode
  | WidgetNode
  | ChatterNode
  | SettingsNode
  | MarkupNode
  | TextNode;

/** What a view root allows (`create="0"` etc.); absent = Odoo's default (allowed). */
export interface ViewAccess {
  create?: boolean;
  edit?: boolean;
  delete?: boolean;
  duplicate?: boolean;
  import?: boolean;
  export?: boolean;
}

interface ViewBase {
  model: string;
  /** Metadata of the fields this view uses, from get_views (P2.3.7). */
  fields: Record<string, FieldInfo>;
  string?: string;
  /** An Odoo JS view class NOVI doesn't run: the generic renderer, an override, or the iframe. */
  jsClass?: string;
  access: ViewAccess;
}

export interface FormSchema extends ViewBase {
  viewType: "form";
  children: FormNode[];
}

export interface ListSchema extends ViewBase {
  viewType: "list";
  editable?: "top" | "bottom";
  multiEdit?: boolean;
  defaultOrder?: string;
  defaultGroupBy?: string;
  limit?: number;
  expand?: boolean;
  openFormView?: boolean;
  decorations?: Decorations;
  columns: (FieldNode | ButtonNode | WidgetNode | ColumnNode)[];
  /** Buttons shown when records are selected. */
  headerButtons: ButtonNode[];
  /**
   * Per group-by field: fields/buttons shown on that group's row. They belong to the *grouped*
   * record (the many2one's model), e.g. `<groupby name="move_id">` → `account.move`.
   */
  groupRows: Record<string, { model: string; nodes: (FieldNode | ButtonNode)[] }>;
}

/** Several fields shown together in one list column (`<column>`). */
export interface ColumnNode extends Modifiers {
  type: "column";
  string?: string;
  children: (FieldNode | ButtonNode | WidgetNode)[];
}

export type CardRole =
  | "title"
  | "subtitle"
  | "avatar"
  | "image"
  | "tags"
  | "priority"
  | "status"
  | "activity"
  | "favorite"
  | "color"
  | "amount"
  | "date"
  | "body";

export interface KanbanSchema extends ViewBase {
  viewType: "kanban";
  defaultGroupBy?: string;
  defaultOrder?: string;
  /** Field holding the card colour (`highlight_color`). */
  colorField?: string;
  quickCreate?: boolean;
  quickCreateView?: string;
  recordsDraggable?: boolean;
  groupCreate?: boolean;
  groupEdit?: boolean;
  groupDelete?: boolean;
  archivable?: boolean;
  progressbar?: { field: string; colors: Record<string, string>; sumField?: string };
  /** Fields the card needs loaded, declared outside the template. */
  extraFields: string[];
  /** The card by section; field `role` says what each value is for. */
  card: Record<"main" | "aside" | "footer", (FieldNode | ButtonNode | WidgetNode)[]>;
  /** The card has an actions menu (`t-name="menu"`). */
  hasMenu: boolean;
}

export interface SearchFilter {
  name?: string;
  string: string;
  domain?: string;
  context?: string;
  /** Date filter on this field, with period options. */
  date?: string;
  defaultPeriod?: string;
  help?: string;
  invisible?: Modifier;
}
export interface SearchGroupBy {
  name?: string;
  string: string;
  /** `field` or `field:interval`. */
  fieldName: string;
  invisible?: Modifier;
}
export interface SearchField {
  name: string;
  string?: string;
  filterDomain?: string;
  operator?: string;
  context?: string;
  domain?: string;
  invisible?: Modifier;
}
export interface SearchPanelSection {
  name: string;
  string?: string;
  select: "one" | "multi";
  icon?: string;
  enableCounters?: boolean;
  expand?: boolean;
  hierarchize?: boolean;
  limit?: number;
  groupby?: string;
  domain?: string;
}
export interface SearchSchema extends ViewBase {
  viewType: "search";
  searchFields: SearchField[];
  /** OR within a group, AND across groups (Odoo's separator rule). */
  filterGroups: SearchFilter[][];
  groupBys: SearchGroupBy[];
  panel: SearchPanelSection[];
}

export type ViewSchema = FormSchema | ListSchema | KanbanSchema | SearchSchema;
