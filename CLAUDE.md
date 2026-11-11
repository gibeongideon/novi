# NOVI — working rules

NOVI is a React + TypeScript frontend engine and gateway for an **unmodified** Odoo 20 backend. The architecture is in PLAN.md and the status is in ROADMAP.md.

## Hard rules
- Never modify Odoo source code or propose an Odoo add-on (DECISIONS D-01). Anything Odoo lacks goes in the gateway.
- Use only the Odoo endpoints listed in PLAN.md §1. Never use `/jsonrpc` or `/xmlrpc`.
- Never copy Odoo OWL/SCSS/JS UI code. All UI is written from scratch.
- `odoo_20.0+e.20261111.tar.gz` is reference material only. Don't commit it or anything extracted from it.

## Progress workflow (every session)
1. Read **ROADMAP.md → "Now / Next"** to find the current task. The detailed checklist is in **TASKS.md**.
2. Work only on tasks in the current phase. Phases run strictly in order: don't start phase N+1 until every Gate checkbox of phase N in TASKS.md is ticked.
3. In TASKS.md, mark a task `[~]` when starting and tick subtasks as they finish. A task is `[x]` only when every subtask is ticked and its "Done when" is true. Follow the "How to update" steps in ROADMAP.md.
4. Add a CHANGELOG.md entry with the task ID for every completed task.
5. Record any scope or architecture change in DECISIONS.md. Add newly discovered work as new subtasks and never renumber IDs.
6. Commit messages start with the subtask ID: `P2.6.2: apply onchange values`.
