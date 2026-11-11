# Decision Log

Key decisions that shape scope or architecture. Add new entries at the bottom and never delete old ones: if a decision is replaced, mark it **Superseded by D-xx**.

| ID | Date | Decision | Why | Status |
|---|---|---|---|---|
| D-01 | 2026-11-11 | Odoo 20 is used **unmodified**. No core edits and no custom Odoo add-ons ("zero install"). | Reuse only Odoo logic; upgrade-safe; product works on any customer's Odoo | Accepted |
| D-02 | 2026-11-11 | Gaps Odoo doesn't cover are filled in our own **gateway (BFF)**, not in Odoo. | Follows from D-01 | Accepted |
| D-03 | 2026-11-11 | Support **both** hosting modes: same domain (session passthrough) and separate domain (gateway session vault). | Customer flexibility; cookie-only Odoo routes need server-held sessions cross-domain | Accepted |
| D-04 | 2026-11-11 | Product is a **white-label multi-tenant SaaS**. | Business model | Accepted |
| D-05 | 2026-11-11 | Stack: React + TypeScript, Tailwind + shadcn/ui, TanStack Query, Zustand; Node/Fastify gateway; pnpm + Turborepo. | Team proposal, mainstream and hireable | Accepted |
| D-06 | 2026-11-11 | **Metadata-driven engine** renders Odoo views generically; bespoke screens only as overrides; iframe fallback for unsupported client actions. | Full coverage from day one; limited hand-coding | Accepted |
| D-07 | 2026-11-11 | Use `/web/*` JSON-RPC (cookie) and `/json/2` (bearer). Never use `/jsonrpc` or `/xmlrpc`. | `/jsonrpc` and `/xmlrpc` are deprecated in Odoo 19 and removed in 22 | Accepted |
| D-08 | 2026-11-11 | Phases are delivered **strictly sequentially** and gated by exit criteria. | Clear progress tracking | Accepted |
| D-09 | 2026-11-11 | Pilot scope: generic engine, Sales + CRM, Accounting, Inventory + HR. | Business priority | Accepted |
| D-10 | 2026-11-11 | **Sign-up auto-provisions a tenant with its own Odoo instance (stock container) and its own separate database and filestore.** "Bring your own Odoo" remains an option. | Full data isolation per customer; self-service SaaS | Accepted |
| D-11 | 2026-11-11 | Tenant databases are created with the Odoo CLI in a provisioner job. Never via `/web/database/create`: the DB manager is disabled, with `list_db=False` and a strict `dbfilter`. | Security; still zero changes to Odoo | Accepted |
