# NOVI — working rules

NOVI is a React + TypeScript frontend engine and gateway for an **unmodified** Odoo 20 backend. The architecture is in PLAN.md and the status is in ROADMAP.md.

## Hard rules
- Never modify Odoo source code or propose an Odoo add-on (DECISIONS D-01). Anything Odoo lacks goes in the gateway.
- Use only the Odoo endpoints listed in PLAN.md §1. Never use `/jsonrpc` or `/xmlrpc`.
- Never copy Odoo OWL/SCSS/JS UI code. All UI is written from scratch.
- `odoo_20.0+e.20261111.tar.gz` is reference material only. Don't commit it or anything extracted from it.

## Design algorithm (all work, not only UI): Musk's five steps, in order
1. Make requirements less dumb: each has a named owner and gets questioned. 2. Delete parts and processes (if you add back < 10%, you didn't delete enough). 3. Simplify/optimise only what survived. 4. Accelerate cycle time. 5. Automate last. "The best part is no part." Details: `docs/design/UI-RULES.md` §0b. Combined with YAGNI (don't build ahead of need) and DRY (one source per piece of knowledge).

## UI work: read before designing anything
- **Before designing or building any UI** (component, widget, view, override, or Figma), read `docs/design/UI-RULES.md` and answer its pre-flight checklist (§0). Architecture: `docs/design/COMPONENT-ARCHITECTURE.md`.
- **DRY is mandatory:** every piece of knowledge (labels, options, rules, formatting, colours, spacing, data access) has one source. Extend existing components; never fork them. Extract on the third occurrence (rule of three), not before.
- Respect the layers L0 tokens → L1 primitives → L2 patterns → L3 fields → L4 views → L5 overrides. Only `engine` talks to Odoo. ESLint enforces the boundaries and bans hard-coded colours and inline styles in UI packages.
- Generic first: render from Odoo metadata; model-specific UI only as a registered L5 override with a reason.

## Progress workflow (every session)
1. Read **ROADMAP.md → "Now / Next"** to find the current task. The detailed checklist is in **TASKS.md**.
2. Work only on tasks in the current phase. Phases run strictly in order: don't start phase N+1 until every Gate checkbox of phase N in TASKS.md is ticked.
3. In TASKS.md, mark a task `[~]` when starting and tick subtasks as they finish. A task is `[x]` only when every subtask is ticked and its "Done when" is true. Follow the "How to update" steps in ROADMAP.md.
4. Add a CHANGELOG.md entry with the task ID for every completed task.
5. Record any scope or architecture change in DECISIONS.md. Add newly discovered work as new subtasks and never renumber IDs.
6. Commit messages start with the subtask ID: `P2.6.2: apply onchange values`.
