# NOVI UI component architecture

**Goal:** a small set of highly reusable components that render *any* Odoo screen. Odoo already describes every screen as data: views (arch), fields (`fields_get`), actions and access. So we build **one component per Odoo concept**, not one per screen. A new Odoo app should need zero new components, and a new widget should need one.

Before designing or building any UI, also read the rules in [UI-RULES.md](UI-RULES.md).

---

## 1. The six layers

```text
 L5  App overrides      packages/apps/*        bespoke screens (CRM pipeline, invoice editor…)
       ▲ composes only L2–L4, registered by (model, view type, action)
 L4  View renderers     packages/views         one per Odoo view type: List, Form, Kanban, Search…
       ▲ ViewSchema in, L2 patterns + L3 fields out
 L3  Field widgets      packages/fields        one per Odoo field type / widget name, one contract
       ▲ FieldProps in (value, meta, modifiers, onChange)
 L2  Patterns           packages/ui/patterns   Odoo-agnostic composites: DataTable, Board, FormGrid…
       ▲ plain props, no Odoo knowledge
 L1  Primitives         packages/ui/primitives shadcn/ui-based: Button, Input, Dialog, Popover…
       ▲
 L0  Tokens             packages/ui/tokens     colours, type, space, radius, motion (exists, P0.9)

 Headless (no JSX)      packages/engine        data + behaviour hooks; the only layer that talks to Odoo
                        packages/odoo-client   transport (exists, P0.4)
```

**Dependency rule (enforced by ESLint, see §6):** a layer may import only from layers *below* it, plus `engine` hooks from L3 and up. Nothing in L0–L2 knows Odoo exists. Nothing in L1–L5 imports `@novi/odoo-client` directly.

| Layer | Knows about Odoo? | Fetches data? | Typical size |
|---|---|---|---|
| L0 Tokens | no | no | 1 file |
| L1 Primitives | no | no | ~25 components |
| L2 Patterns | no | no | ~15 components |
| L3 Fields | field *metadata* only | no (gets value + onChange) | ~40 widgets (scanner-driven) |
| L4 Views | ViewSchema | via `engine` hooks | ~10 renderers |
| L5 Apps | yes | via `engine` hooks | only where generic isn't good enough |

---

## 2. What each layer contains

### L0 Tokens (done: `packages/ui/src/tokens.ts`)
The single source of every visual value. Components use CSS variables or Tailwind classes generated from tokens. No hex codes, pixel sizes or shadows anywhere else.

### L1 Primitives: `packages/ui/primitives`
Accessible building blocks wrapped from shadcn/ui (Radix underneath):

- **Actions:** Button, IconButton, DropdownMenu
- **Inputs:** Input, Textarea, Select, Combobox, Checkbox, Radio, Switch, DatePicker
- **Overlays:** Dialog, Drawer, Popover, Tooltip, Toast
- **Structure:** Tabs, Card, Badge, Avatar, Skeleton, Breadcrumb, Command, Kbd

They are styled once, through tokens. Variants are props (`variant="primary" | "secondary" | "ghost" | "danger"`, `size="sm" | "md"`), never one-off classes passed in by callers.

### L2 Patterns: `packages/ui/patterns`
Odoo-agnostic composites that encode the **layout grammar** (DESIGN-SYSTEM.md §2) once:

| Pattern | Used by | Replaces Odoo concept |
|---|---|---|
| `PageHeader` (breadcrumbs, title, primary action, view switcher) | every view | control panel |
| `ActionBar` (primary/secondary/overflow) | Form header, List selection, wizards | `<header>` buttons, action menu |
| `Stepper` | Form | `statusbar` |
| `StatChip` / `StatChipRow` | Form | `oe_button_box` smart buttons |
| `FormGrid` (12-col, label/field cells, responsive) | Form, wizards, settings | `<group>` |
| `SectionTabs` (tabs → accordion on mobile) | Form | `<notebook>` |
| `DataTable` (virtual rows, sort, group rows, selection, inline edit cell slot) | List, one2many, export dialog | list view |
| `Board` (columns, drag-and-drop, fold, column header aggregates) | Kanban | kanban view |
| `RecordCard` (title, subtitle, tags, avatar, meta, footer slots) | Kanban, mobile list, search results | kanban card |
| `FacetSearch` (facets, filter/group menus, saved filters slot) | every multi-record view | search view |
| `SidePanel` (collapsible categories/filters) | List, Kanban | search panel |
| `DetailDrawer` | chatter, previews | chatter column |
| `EmptyState` | every view | `help` |
| `DialogShell` (sizes sm/md/lg/xl, footer actions) | wizards, confirmations, quick create | `target="new"` |
| `AsyncBoundary` (loading skeleton / error / retry) | everything that loads | n/a |

Patterns take **plain data and render-props/slots**. For example, `DataTable` receives `columns` and `rows` plus a `renderCell` slot. It never receives a model name.

### L3 Field widgets: `packages/fields`
**One contract for all ~40 widgets**, so views treat every field the same way:

```ts
interface FieldProps<V = unknown> {
  name: string;
  value: V;
  meta: FieldMeta;                 // from fields_get / get_views: type, string, relation, selection, digits, currency_field…
  options: Record<string, unknown>; // arch `options="{…}"`
  mode: "read" | "edit";
  readonly: boolean;                // already evaluated by odoo-expr
  required: boolean;                // already evaluated by odoo-expr
  invalid?: string;                 // message from Odoo validation
  context: OdooContext;             // record + user context, for domains / defaults
  onChange(value: V): void;         // engine turns this into onchange + dirty state
}
```

Widgets are registered once:

```ts
registerField({ widget: "many2many_tags", types: ["many2many"], component: Many2ManyTags, supportsInline: true });
registerField({ type: "monetary", component: Monetary });   // default widget for a field type
```

**Resolution order:** `widget=` from the arch → default widget for the field type → **fallback per type** (never crash; log for the coverage scanner).

Each widget renders both modes (read and edit), so list cells, form fields, kanban cards and mobile cards all reuse the same widget. Formatting (money, dates, numbers, durations) comes from **one** `engine/format` module that follows the user's lang, tz and currency from Odoo. Widgets never format by themselves.

### L4 View renderers: `packages/views`
One renderer per Odoo view type: `ListView`, `FormView`, `KanbanView`, `SearchView`, `CalendarView`, `PivotView`, `GraphView`, `ActivityView`. Each one:
1. receives a `ViewSchema` (from `odoo-meta`) and an `engine` record or list model,
2. maps schema nodes to L2 patterns and L3 widgets through **one node-renderer table** per view type (`{ group: FormGrid, notebook: SectionTabs, field: FieldSlot, button: ActionButton, … }`),
3. contains **no model-specific code**. If a renderer needs `if (model === "sale.order")`, that is an L5 override instead.

### L5 App overrides: `packages/apps/*`
Bespoke screens are allowed only when the generic renderer measurably fails users (UAT feedback, or a workflow the arch can't express). Overrides are registered, not hard-wired:

```ts
registerOverride({ model: "crm.lead", view: "kanban", component: PipelineBoard });          // whole view
registerOverride({ model: "sale.order", view: "form", slot: "order_line", component: QuoteLines }); // one slot
```

Overrides **compose** L2–L4 pieces (e.g. `PipelineBoard` = `Board` + `RecordCard` + forecast header). They don't fork them. Prefer the smallest override (a slot) over replacing a whole view.

### Headless: `packages/engine` hooks
The only route from UI to data. The contract stays the same everywhere:

| Hook | Purpose |
|---|---|
| `useAction(id)` | load action + views, routing, breadcrumbs |
| `useRecord(model, id, schema)` | values, dirty state, evaluated modifiers, `update`, `save`, `discard` |
| `useRecordList(model, schema, domain)` | paging, sort, group, selection, bulk actions |
| `useField(record, name)` | builds `FieldProps` for L3 (value, meta, modifiers, onChange) |
| `useButton(record, node)` | executes `type="object" | "action"` buttons, handles `confirm=` |
| `useAccess(model)` | create/write/unlink flags |
| `useFormat()` | lang/tz/currency-aware formatting (the single formatter) |

UI components call hooks. Hooks call `odoo-client`. There are no other paths.

---

## 3. What "fit to the Odoo backend" means concretely

- **Odoo is the source of truth for meaning:** labels (`string`), help texts, selection options, required/readonly/invisible, domains, defaults, currency/digits, access and translations all come from Odoo metadata. **The UI never restates them.** Writing "Customer" in JSX instead of reading `meta.string` is a bug.
- **Business rules stay on the server.** We don't re-validate amounts, compute totals or decide state transitions in React. `onchange` and `web_save` do that. The UI shows results and errors.
- **Every component degrades gracefully** when Odoo sends something new: unknown widget → type fallback, unknown view type or client action → iframe fallback (P2.14). Coverage is measured by the scanner, never guessed.
- **Generic first, bespoke by exception.** The generic renderers must reach ≥ 90% native coverage (P3 gate) before bespoke screens multiply.

---

## 4. Build order (maps to TASKS.md)

| Order | What | Task |
|---|---|---|
| 1 | Tokens | P0.9 ✅ |
| 2 | Primitives + Storybook + visual tests + boundary lint | P1.10, P1.17 |
| 3 | Patterns needed by the shell (PageHeader, EmptyState, DialogShell, AsyncBoundary) | P1.11–P1.12 |
| 4 | Field contract + registry + fallbacks, then widgets **in scanner order** | P2.13 |
| 5 | Patterns needed by views (DataTable, FormGrid, SectionTabs, Board, RecordCard, FacetSearch) | P2.9–P2.12 |
| 6 | View renderers | P2.9–P2.12, P3.1–P3.4 |
| 7 | App overrides, only after UAT shows the generic view isn't enough | P4–P6 |

Widgets are built in **coverage-scanner order** (most-used first: `statinfo`, `monetary`, `many2many_tags`, `web_ribbon`, `radio`, …; see docs/coverage). We don't build a widget before Odoo actually uses it (YAGNI).

---

## 5. Worked example: one widget, many places

`Monetary` is written once in L3. It then appears in:
- a list column (`DataTable` cell, read mode, aggregate in the group row)
- a form field (`FormGrid` cell, edit mode, currency from `meta.currency_field`)
- a kanban card footer (`RecordCard`, read mode)
- a pivot cell (read mode, via `useFormat`)
- a bespoke quote editor line (L5 reuses the same widget)

So a fix to monetary rounding or RTL alignment is made **once** and appears in all five places.

---

## 6. Enforcement (so the plan survives contact with deadlines)

| Guard | How |
|---|---|
| Layer boundaries | ESLint `no-restricted-imports` per package (in `eslint.config.js`): `ui` can't import `engine`/`odoo-client`/`fields`/`views`; `fields` can't import `views`/`apps`; UI packages can't import `odoo-client` |
| No hard-coded visuals | ESLint rule rejecting hex/rgb colour literals in UI packages; use tokens |
| Every component documented | A Storybook story per component and variant (P1.10.4), with visual regression (P1.10.5) and axe a11y checks |
| Reuse before create | PR template checklist (UI-RULES §0) + review |
| Widget coverage | Coverage scanner after each sprint; `supported.json` updated by the registry |
