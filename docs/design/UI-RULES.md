# NOVI UI rules

**Read this before designing or building any UI**, whether a screen, component, widget, pattern, Figma frame or app override. It applies to designers and developers alike, and to Claude.

Architecture: [COMPONENT-ARCHITECTURE.md](COMPONENT-ARCHITECTURE.md) · Tokens and layout grammar: [DESIGN-SYSTEM.md](DESIGN-SYSTEM.md)

---

## 0. The pre-flight checklist (answer before you start)

1. **Does it already exist?** Search `packages/ui`, `packages/fields`, `packages/views` and Storybook. If something similar exists, **extend it with a prop or slot**; don't create a sibling.
2. **Which layer is it?** L1 primitive, L2 pattern, L3 field widget, L4 view renderer, or L5 override. If you can't say, the design isn't clear yet.
3. **Is it Odoo-generic?** Would it work for *any* model that has this field type or view type? If not, it's an L5 override and needs a reason (UAT feedback or a workflow the arch can't express).
4. **Is there a real need today?** A scanner count, a task in TASKS.md or a user request. "Might be useful" is not a need (YAGNI).
5. **Where does every piece of knowledge come from?** Labels, options, rules, colours, spacing and formatting each have exactly one source (see §1). If you're typing it in, stop.
6. **What are its states?** Loading, empty, error, read-only, disabled, invalid, long content, RTL, mobile and dark mode. Design all of them, not just the happy path.

7. **What did you delete?** Name the props, variants, steps or parts you removed or refused to add (Musk step 2). "Nothing" usually means you didn't look.

When all seven have answers, build it.

---

## 0b. Musk's design algorithm: "the best part is no part"

Apply these five steps **in this order** to every design, component, prop, screen, service and process. Most waste comes from doing them out of order, e.g. polishing or automating something that shouldn't exist.

1. **Make the requirement less dumb.** Every requirement has a **named owner** (a person, not "the team" or "Odoo does it"). Question it, including requirements from smart or senior people. If no one can defend it, delete it.
2. **Delete the part or process.** Remove every prop, variant, screen, step, setting, dependency or abstraction you can. If you aren't adding back at least ~10% of what you delete, you didn't delete enough. A field Odoo already renders well needs no custom widget, and a step users never take needs no button.
3. **Simplify, then optimise**, but only what survived step 2. Never optimise something that shouldn't exist: no memoising, caching or virtualising a component before you know it's needed.
4. **Accelerate cycle time.** Make the loop from idea to feedback fast: Storybook first, hot reload, small PRs, `pnpm verify` before push, show users early.
5. **Automate last.** Generators, codemods, CI gates and scripts come only after the manual process has been proven right. Automating a wrong process just makes mistakes faster.

**Companion rules**
- **First principles:** reason from what Odoo actually provides (metadata, server rules) and what the user actually needs, not from how other ERPs or the old OWL client look.
- **The best part is no part.** Every component, prop, dependency and line of code is a liability that must be built, tested, documented and maintained. The cheapest UI is the one generated from metadata you already have.
- **The best process is no process.** Don't add a review step, setting or approval unless it prevents a real, observed failure.
- **Every requirement and every L5 override names its owner** (`reason` + owner in the override registry, owner in TASKS/DECISIONS).
- **Delete on a schedule.** At the end of each phase, list components, props and overrides with no usage (scanner + Storybook) and delete them.

How it combines with DRY and YAGNI: **Musk** decides *whether* a part should exist, **YAGNI** says not to build it before it's needed, and **DRY** makes sure the parts that survive have one source each.

## 1. DRY: one source for every piece of knowledge

DRY is about **knowledge, not text**. Each fact lives in exactly one place, and everything else refers to it.

| Knowledge | Single source | Never |
|---|---|---|
| Field label, help, placeholder | Odoo metadata (`meta.string`, `help`) + Odoo translations | hard-coded strings in JSX |
| Selection options, many2one targets, domains | `fields_get` / arch / `odoo-expr` | duplicated enums in TypeScript |
| Required / readonly / invisible | arch modifiers evaluated by `odoo-expr` | `if (state === "draft")` in a component |
| Business rules, totals, validation | Odoo server (`onchange`, `web_save`, constraints) | re-computing amounts or re-validating in React |
| Number, money, date and duration formatting | `engine` `useFormat()` (user lang/tz/currency) | `toFixed`, `toLocaleString` or date libraries inside widgets |
| Colours, spacing, radius, shadows, motion, type | tokens (`packages/ui/src/tokens.ts`) | hex/rgb literals, magic px values, inline styles |
| Layout grammar (how sheet/group/notebook render) | L2 patterns (`FormGrid`, `SectionTabs`…) | re-implementing a grid in a view or override |
| Icons | one icon set (`lucide-react`) via the `Icon` primitive | mixing icon libraries or inline SVG copies |
| NOVI's own UI strings ("Save", "Discard"…) | one i18n catalogue in `packages/ui` | literals in components |
| Data access | `engine` hooks | `fetch` or `odoo-client` calls inside components |
| Tenant branding | `TenantTheme` → CSS variables | per-tenant conditionals in components |

**Rule of three (AHA: Avoid Hasty Abstractions).** Two similar pieces of code that may evolve differently are not a violation; leave them. On the **third** occurrence, extract the shared component or hook. Never force unrelated things into one abstraction just because they look alike: a wrong abstraction costs more than duplication.

**Copy-paste is a smell, not a crime:** if you paste a block between two packages, add a `// TODO(dry): …` with a task ID, and fix it before the third paste.

---

## 2. Reuse and composition

- **Composition over configuration.** Prefer slots and children (`<Card header={…} footer={…}>`) to growing flag lists (`showHeader`, `headerVariant2`, `isCompactFooter`…). More than ~8 props is a sign the component should be split or given slots.
- **Extend; don't fork.** If a pattern almost fits, add a variant or slot to it. A forked copy (`DataTable2`, `MyBoard`) is not allowed.
- **Variants are a closed set.** `variant` and `size` props take documented values only. Callers don't pass ad-hoc `className` to change look and feel; `className` is for layout placement only (margin and grid position).
- **Overrides compose and slot in.** An L5 override replaces the smallest unit possible (a field slot before a section, a section before a whole view) and is built from L2–L4 parts.
- **One component, every context.** A field widget must work in a form, list cell, kanban card and mobile card (read and edit modes). Don't build list-only variants of widgets.
- **Headless logic lives in hooks.** Behaviour (state, keyboard handling, data) goes in `engine` hooks or small headless hooks, so the same logic can drive different visuals.

---

## 3. Odoo fit

- **Render from metadata.** Views come from the ViewSchema, and fields come from `fields_get`. Writing a screen by hand for one model is the exception (L5), never the default.
- **Never `if (model === …)` in L1–L4.** Model-specific behaviour is a registered override.
- **Unknown is not an error.** An unknown widget renders the type fallback, and an unknown view type or client action uses the iframe fallback. Both are logged for the coverage scanner.
- **Respect Odoo's decisions.** If Odoo says a field is readonly, a button invisible or an action forbidden, the UI follows. We change *how* it looks, never *what is allowed*.
- **Show Odoo's messages faithfully.** UserError, ValidationError, warnings from onchange and RedirectWarning actions are shown with their real text and offered actions.
- **Build in usage order.** New widgets and views follow the coverage scanner's ranking.

---

## 4. Visual design

- **NOVI has its own visual identity, not Odoo's (D-23).** Never reproduce Odoo's look, layout patterns, colours, icons, illustrations or other design assets. Use Odoo only for *data and meaning* (labels, fields, rules), never for *appearance*. App icons come from NOVI's icon set via `packages/shell/src/appIcons.ts`; Odoo's `webIconData` is ignored. If a screen "looks like Odoo", redesign it.

- **Tokens only.** Every colour, size, radius, shadow and duration comes from tokens. If a token is missing, propose it (one place) rather than inlining a value.
- **Hierarchy through layout, not decoration.** One primary action per surface. Use secondary and ghost for the rest; overflow goes into a "⋯" menu.
- **Dense but breathable.** This is a business tool: 15px base text, compact rows (36–40px) in tables, comfortable form rows, a 4px spacing grid.
- **Consistent placement.** Primary action top-right of the page header; save and discard in the same place on every form; destructive actions last and visually distinct.
- **Status never by colour alone.** Badges carry text, and decorations carry an icon or label.
- **Light and dark from day one.** Every component is checked in both schemes and with a tenant primary colour applied.

---

## 5. States and behaviour (every component, every time)

| State | Requirement |
|---|---|
| Loading | Skeleton matching the final layout (no spinners over empty pages); keep the previous data while refetching |
| Empty | `EmptyState` with Odoo's `help` HTML when present, plus the primary action |
| Error | `AsyncBoundary` with the message and a retry; never a blank screen |
| Read-only / disabled | Visually distinct; read-only shows formatted values, not disabled inputs |
| Invalid | Inline message under the field, plus a summary on save |
| Dirty | Save/discard bar visible; leaving asks first |
| Long content | Truncate with a tooltip, wrap where meaning matters; test 3× longer translations |
| Many items | Virtualise lists and boards above ~100 rows |

**Optimistic UI only where Odoo can't reject the change** (e.g. folding a column). Anything Odoo validates waits for the server.

---

## 6. Accessibility (WCAG 2.1 AA, non-negotiable)

- Every interactive element is reachable and operable by keyboard, with a visible focus ring (`focus` token).
- Dialogs and drawers trap focus and restore it on close; Esc closes (asking first if there are unsaved changes).
- Inputs have programmatic labels: the Odoo `string` becomes the `<label>`.
- Contrast ≥ 4.5:1 for text and ≥ 3:1 for UI parts. Tenant colours are validated by `validateTheme()`.
- Use semantic HTML first; ARIA only to fill gaps (Radix primitives already do this).
- Respect `prefers-reduced-motion`.
- Hit targets ≥ 32px on desktop and ≥ 44px on touch.

## 7. Responsive and i18n

- **Mobile-first layouts:** FormGrid collapses to one column, tabs become an accordion, and list rows become cards below 640px.
- **Logical CSS properties** (`margin-inline-start`, not `margin-left`), so RTL works without a second stylesheet.
- No string concatenation for sentences. Use the i18n catalogue with placeholders.
- Dates, numbers and money only through `useFormat()`.

## 8. Performance

- Code-split per view type and per app override, so a user who never opens Accounting never downloads it.
- Request only the fields the view shows (the specification builder does this, so don't widen it by hand).
- Memoise per row in tables and boards; no inline object/array props in hot paths.
- Use the TanStack Query cache; never refetch what the bus already told us changed.

## 9. Naming and file conventions

- Components use `PascalCase` with one component per file; hooks are `useCamelCase`.
- Field widgets are named after the Odoo widget (`Many2ManyTags` for `many2many_tags`), so the scanner and registry map one-to-one.
- Every component folder contains the component, `*.stories.tsx`, `*.test.tsx` and an `index.ts` export. Nothing else is public.
- Props interfaces are exported as `<Name>Props`.

## 10. Definition of Done for UI work

- [ ] Pre-flight checklist (§0, all 7 questions) answered in the PR description
- [ ] Musk order respected (§0b): requirement owned, parts deleted before optimising or automating
- [ ] No duplicated knowledge (§1); reused or extended existing parts (§2)
- [ ] Works for any model with this field/view type (or is a registered L5 override with a reason)
- [ ] All states from §5 designed and implemented
- [ ] Storybook story for every variant and state, visual regression updated
- [ ] Keyboard and screen-reader pass; axe shows no serious issues; checked light, dark and tenant colour
- [ ] Mobile (360px) and RTL checked
- [ ] Lint is green, including the layer boundaries and no-hard-coded-colour rules
