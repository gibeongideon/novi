# NOVI design system: foundations (P0.9)

The tokens live in code: [`packages/ui/src/tokens.ts`](../../packages/ui/src/tokens.ts). This document covers the parts that aren't a value: how Odoo's structures map onto NOVI layout, what tenants may change, and the accessibility baseline. The Figma kit (P0.9.3) mirrors these names one to one.

## 1. Tokens (P0.9.1)

| Group | Names | Notes |
|---|---|---|
| Colour | `bg`, `surface`, `surfaceSunken`, `text`, `textMuted`, `border`, `primary`, `primaryText`, `accent`, `success`, `warning`, `danger`, `info`, `focus` | Light + dark, same names. CSS: `--novi-color-<kebab-name>` |
| Type | `fontSans`, `fontMono`, sizes `xs…3xl`, weights, line heights | Base size 15px for dense business UI |
| Space | 4px grid: `0,1,2,3,4,5,6,8,10,12,16` | `--novi-space-4` = 16px |
| Radius / shadow / motion | `sm…xl`, `sm/md/lg`, `fast/normal/slow` + easing | Motion respects `prefers-reduced-motion` |

`themeStylesheet(theme)` emits light on `:root`, dark under `prefers-color-scheme` (unless `data-theme="light"`) and under `[data-theme="dark"]`.

## 2. Layout grammar: Odoo → NOVI (P0.9.2)

| Odoo arch | NOVI rendering |
|---|---|
| Action + breadcrumbs | **Page header**: breadcrumb trail, title, primary action (New), view switcher, search bar below |
| `<header>` buttons | **Action bar**: first `oe_highlight` button is primary, the rest secondary; overflow into a "⋯" menu on narrow screens |
| `<field widget="statusbar">` | **Stepper** at the right of the action bar (collapses to a badge on mobile) |
| `<div class="oe_button_box">` | **Stat chips** row under the title |
| `<div class="oe_title">` + avatar | **Record heading** (large title, subtitle, avatar left) |
| `<sheet>` | **Card** on the page background, max width `contentMaxWidth` |
| `<group>` / `<group col="N">` | **12-column grid**; label above field below 640px, label left above |
| `<notebook>` / `<page>` | **Tabs** (scrollable; become an accordion on mobile) |
| `one2many` inline list | **Embedded table** with add-line row; dialog form when the line view has no `editable` |
| Chatter | **Side drawer** (`drawer` width) on ≥1280px, a "Activity" tab below that |
| Wizards (`target="new"`) | **Dialog** sized by arch `size` (`sm/md/lg/xl`) |
| List view | **Data table**: sticky header, virtual rows, selection column, bulk-action bar |
| Kanban | **Board**: columns with count/aggregate header and fold; cards from template schema |
| Empty `help` | **Empty state** illustration + Odoo's help HTML + primary action |

Dialog sizes: `sm 420 · md 640 · lg 880 · xl 1120`. Sidebar 248px, header 56px, mobile gutter 16px.

## 3. Theming contract (P0.9.4)

Tenants may set:
- product name, logo, favicon, and font family (a Google Font name)
- **only** these colours, per scheme: `primary`, `primaryText`, `accent`

Everything else (neutrals, semantic colours, spacing, radius) is fixed so screens stay consistent and readable. Overrides are rejected unless `validateTheme()` passes:

| Pair | Minimum |
|---|---|
| `primaryText` on `primary` | 4.5 : 1 |
| `primary` on `surface` | 3 : 1 |
| `accent` on `surface` | 3 : 1 |

## 4. Accessibility baseline (P0.9.5)

- WCAG 2.1 AA: text contrast ≥ 4.5:1, UI components ≥ 3:1 (enforced for tenant colours, tested for defaults).
- A visible focus ring on every interactive element: 2px `focus` colour + 2px offset. Never remove outlines without a replacement.
- Every control is reachable by keyboard; dialogs trap focus and restore it on close.
- Hit targets are at least 32×32px on desktop and 44×44px on touch.
- Status is never shown by colour alone: badges carry text, and decorations carry an icon or label.
- Respect `prefers-reduced-motion` (no movement-based transitions).

**Keyboard map:**

| Keys | Action |
|---|---|
| `⌘/Ctrl K` | Command palette |
| `Alt N` | New record |
| `Alt S` | Save |
| `Alt J` / `Alt K` | Next / previous record |
| `Esc` | Discard changes or close dialog (asks first if there are unsaved changes) |
| `/` | Focus search |

## 5. Still to do (people, not code)

- P0.9.3 Figma kit built on these tokens and the layout grammar
- P0.9.6 Design review and sign-off
