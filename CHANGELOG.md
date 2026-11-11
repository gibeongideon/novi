# Changelog

All notable changes to NOVI are recorded here, newest first. Every entry references a task ID from [ROADMAP.md](ROADMAP.md).

Format: `- [TaskID] Short description (author)` under a dated heading. Group entries as **Added / Changed / Fixed / Removed** when a day has several.

## Unreleased

### 2026-11-11
- [P1.11] Local dev server: `pnpm dev` runs the web app (5173, Odoo proxied same-origin) and a live progress dashboard (4321) next to local Odoo (18069).
- [P1.17.5] Single formatter `createFormatter()` driven by Odoo's own lang/currency/tz settings (en_US, de_DE, Indian grouping, tz conversion, parse); verified against live Odoo.
- [P1.17.4] Field widget contract (`FieldProps`) + `FieldRegistry` (widget → type default → fallback, manifest) and `OverrideRegistry` (action > model specificity, slots, mandatory reason + owner); shared Odoo metadata types re-exported by `@novi/odoo-meta`.
- [—] Musk's five-step design algorithm added to the rules (UI-RULES §0b, CLAUDE.md, PR template; D-22).
- [—] **Phase 0 closed** (gate ticked or deferred by D-20/D-21). Phase 1 started.
- [P0.7] Local-first verification: `pnpm verify` starts/seeds local Odoo and runs lint, typecheck, unit and live contract tests and build; contract CI made manual-only until the MVP (D-21).
- [P0.10.3] 2FA trusted devices verified live (gateway must forward the user's browser User-Agent).
- [P0.7] CI workflow for live contract tests against the private Odoo image; slimmer two-stage Odoo image; GHCR push script.
- [—] D-20: Figma kit/design sign-off deferred to the Phase 2 gate, licensing/cost to the Phase 4 gate.
- [P1.17] UI architecture and rules: layered component plan (L0–L5 + headless engine), UI-RULES with DRY single-source table and pre-flight checklist, ESLint layer boundaries and token-only rule, CLAUDE.md + PR template wired (D-19).
- [P0.13] Staging live: https://novi.dafeapp.com serves the progress dashboard (MT5 server, `novi` user, Caddy basic auth); deploys on every push to `main`.
- [P0.11] Template-based provisioning: frozen template DB per (plan, country) with localisation; sign-up clones it in **8–13 s** instead of 160 s, with per-tenant secrets, ownership reassignment and stronger DB isolation (D-18).
- [P0.1–P0.11] **Phase 0 implementation.**
  - Monorepo (22 packages) with CI, Docker images, Changesets, Renovate and a licence policy.
  - Stock Odoo 20 image built from the tarball, with a local stack and seed (pilot apps, demo data, 8 test users, API key).
  - `@novi/odoo-client` (JSON-RPC + JSON-2, typed errors, retries, abort, CSRF, 2FA relay), 21 unit tests.
  - Live contract suite **27/27 green** against Odoo 20.
  - Coverage scanner, with a first report: 499 actions, 1,691 views, baseline 0%.
  - Design tokens with tenant theming and WCAG contrast validation.
  - 2FA relay verified (D-15).
  - Provisioning spike: isolated tenant in **160 s**, 158 MB idle (D-16).
  - Odoo 20 gotchas recorded (D-17).
- [P0.13] Staging moved to the MT5 server as static files only: `setup-server.sh`, simplified workflow (host-key pinned, unprivileged `novi` user), removed Docker staging files, reverted dafeapp edits (D-12 updated).
- [P0.13] Live staging: progress dashboard generator, `deploy/staging` stack, `deploy-staging.yml` GitHub Actions workflow, DEPLOYMENT.md; dafeapp Caddy routes novi.dafeapp.com (D-12). Replaced Kubernetes/Helm with Docker Compose across plan and tasks (D-13).
- [—] Added TASKS.md (master tickable task list, 99 tasks across 8 phases, with Done-when criteria and phase gates); ROADMAP.md now holds only status, phases and milestones.
- [—] Added tenant provisioning: sign-up creates its own Odoo instance and separate DB (PLAN §2b, D-10, D-11, roadmap tasks P0.11–P0.12, P1.1a–e, P7.1a–c).
- [—] Project planning: approved architecture plan ([PLAN.md](PLAN.md)), created ROADMAP, CHANGELOG and DECISIONS trackers.
