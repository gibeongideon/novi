# Changelog

All notable changes to NOVI are recorded here, newest first. Every entry references a task ID from [ROADMAP.md](ROADMAP.md).

Format: `- [TaskID] Short description (author)` under a dated heading. Group entries as **Added / Changed / Fixed / Removed** when a day has several.

## Unreleased

### 2026-11-14
- [P2.8] Action manager: menus and buttons now run any Odoo action (open screens and wizards, server actions, reports as PDF, links, notifications, closing dialogs); buttons save first and refresh the record like Odoo. Proven live on the whole demo sales → invoicing → payment flow using the screens' own buttons. Odoo's errors get a clear dialog (with Odoo's suggested action when it offers one). Screens Odoo builds in JavaScript (e.g. Discuss) open embedded inside NOVI. Fixed: action and wizard contexts were dropped on the way to Odoo.
- [P2.7] Records can be saved (only what changed), checked before saving (required values, values that couldn't be read), discarded, deleted, duplicated, archived and restored, alone or as a list selection, and several selected records can be edited at once. Closing the tab with unsaved changes asks first. Proven live on 10 different models through their own forms.
### 2026-11-13
- [P2.6] Onchange and defaults: new records and lines get Odoo's defaults, and changing a field (customer, product, quantity) asks Odoo for its consequences exactly as Odoo's own screens do; on a quotation line, choosing a product gives the same price, taxes and totals as Odoo (proven live). Fast typing can't make an old answer overwrite newer input.
- [P2.9.9] Fixed: some screens (e.g. Time Off → My Time Off) showed "name 'allowed_company_ids' is not defined". Action filters now get the same names Odoo's client provides (active companies, current company, and the record an action was opened from); a live test checks every window action of the demo database.
- [P2.5] Record model in the engine: records keep track of what the user changed, evaluate Odoo's show/hide, read-only and required rules live, check required values, and save; lines (order lines, contacts, tags) can be added, edited, removed, linked and replaced, and are saved exactly as Odoo expects (proven live on Odoo); lists page, sort, select and group like Odoo. React hooks keep screens in sync.
- [P2.4] Specification builder: NOVI now asks Odoo for exactly the fields a screen needs, in one call, the same way Odoo's own client does (checked against the official client and on every view live). [P2.9.9] First visible engine screen: every menu with a list view shows its records through NOVI's own engine (Odoo's columns, labels, colours and show/hide rules, user's number and date formats); click a row to open it. [P2.13.15] `useFormat`. Fixed: rebuilding the web app no longer leaves a running `pnpm serve` showing a blank page.
- [P2.3] `@novi/odoo-meta`: Odoo's form, list, kanban and search views are read into NOVI's own view schema (meaning, not Odoo's markup), with field details merged in. All 1,305 views of the dev Odoo parse without losing a field. Odoo test data is now refreshed only when the dev Odoo changes (verify stays fast).
- [P2.2] Domains (Odoo's record filters) in `@novi/odoo-expr`: read from views with live record values, combined (AND/OR), negated and written back exactly as Odoo 20 does, checked against Odoo on every domain in the installed views, all 22 operators and 1,048 real combinations.
- [P2.1] `@novi/odoo-expr`: NOVI's own evaluator for the Python expressions in Odoo views (show/hide, read-only, required, domains, contexts, options). Checked against every expression in the installed Odoo views: 100% parse and 100% the same results as Odoo's own Python on 18,597 test cases.
- [Phase 1] Closed (D-32): gate verified; gateway database, Redis and other unused infrastructure dropped; preferences, quick commands and metadata cache moved into Phase 2; real Google/Microsoft sign-in carried (waiting for OAuth apps). Phase 2 (engine core) started.
- [P1.14][P1.16] Single sign-on through Odoo's own OAuth ("Continue with …" on the login page; link an account from the emailed reset/invitation page); workspaces are now invitation-only (security fix: tenants allowed public portal sign-up) and Odoo's built-in "Odoo.com Accounts" login is switched off. New live end-to-end suite: sign-up → email → own Odoo → sign in → menus, tenant isolation, SSO with a stand-in identity provider. Phase 1 gate checks all verified.
- [P1.6] Sign-in complete (D-30): "Forgot password?" with NOVI's own reset pages (Odoo's emailed link opens NOVI, not Odoo); a clear message when Odoo's login cooldown kicks in; security fix: the gateway no longer believes a client-supplied IP, which let attackers dodge the cooldown; password rule (min 10) now enforced by every tenant's Odoo; tenants can send email. Logout and sliding session expiry verified live.
- [P1.5] Tenant isolation and TLS (D-29): every tenant gets its own network (it can reach only Postgres) and its database role can open only its own database; HTTPS for tenant addresses through stock Caddy with on-demand certificates approved by the gateway (`pnpm edge` → https://acme.localhost:8443). [P1.4.11] Templates record the Odoo image that built them and are never cloned for another image (the Kenya template was rebuilt).
- [P1.3][P1.4] Self-service sign-up and provisioner (D-28): sign-up page with live workspace-address preview, email confirmation, progress page and welcome email; a separate provisioner process turns confirmed sign-ups into their own Odoo instance and database (~10 s from the template), rolls back cleanly on failure and can be retried by an operator. Login page links to sign-up on the platform host only. `pnpm dev` and `pnpm serve` now run the provisioner; the provisioning script moved to `infra/provisioning/tenant.sh`.
- [P1.2.2] Multi-tenant gateway (D-27): tenant registry (host → each customer's own Odoo), same-origin reverse proxy with route allow-list and websocket, sign-in per tenant; session vault deleted. The provisioning spike registers/removes tenants; `pnpm serve` runs the production build on :8080 (`<tenant>.localhost:8080`); dev now goes through the gateway too. Verified with two isolated tenants (acme, beta).

### 2026-11-12
- [P1.6.2] Gateway first slice (D-26): two-factor sign-in in the browser (password → authenticator code, "don't ask again on this device"), Odoo session handed to the browser, real user IP/User-Agent forwarded to Odoo; login screen with friendly translated messages; `pnpm dev` now also starts the gateway; live tests for login, wrong password, 2FA, trusted device and single-use challenges.

### 2026-11-11
- [P1.13.2] Record search in the palette: Odoo's own name search across key business models, grouped under Odoo's model names, access-aware; record page with Open in Odoo until the form view lands.
- [P1.12.2] Company switcher (Odoo's `allowed_company_ids` + `cids` cookie), verified live; [P1.12.5] per-screen error boundary and automatic return to login when the Odoo session expires. Deferred with reasons: language switcher, notification centre, preferences screen, error dialog (→ P2.8.9), useFormat (→ P2.13.15).
- [P1.12.1] Theme is now a single always-visible sun/moon toggle in the top bar (flips what you see, remembered); the Theme menu section and the unused radio-item primitive were deleted.
- [P1.12.1] Light / Dark / System theme in the user menu (`useColorMode`, remembered per browser, applied before first paint); Accounting app mapped to Finance.
- [P1.11.1] Simplified modern app icons: white tile, soft shadow, app colour on the line icon only (hover tints the border); icons for To-do, Project and Databases.
- [P1.11.1] Launcher v3: icon-first gradient tiles in grouped islands that fit on one screen; descriptions moved to tooltips (and screen readers); subtle brand backdrop.
- [P7.7.2] Performance pass (D-25): Lighthouse on the production build = Performance 96–100, Accessibility 100, Best Practices 100; lazy-loaded search palette and action screen; `sideEffects` for tree-shaking; favicon, meta description, robots noindex; shared dev/preview Odoo proxy.
- [P1.13.1] Type-anywhere global search (D-24): palette opens on typing, ⌘K/Ctrl+K or the search icon; apps + all menus by path with word matching; launcher hero and search box removed for a cleaner home.
- [P1.11.1] Launcher redesign: gradient app tiles from a new tokenised 8-colour app palette (contrast-tested), apps grouped by purpose (Sell, Finance, Operations, People, Workspace, Admin) with descriptions, time-of-day greeting over a brand wash, app search, NOVI brand mark, accessible card names; light and dark.
- [P1.11.1] NOVI's own look (D-23): own app icons (Lucide set mapped per Odoo module, token colours), redesigned launcher (greeting + app cards), Odoo icon data removed from the engine; rule added to UI-RULES §4 and CLAUDE.md.
- [P1.11] App shell: login (same-domain, Odoo's own session), app launcher with real Odoo icons, app sidebar menus, routing with deep links, breadcrumbs from the menu tree; engine session/menu/action hooks (TanStack Query); verified end to end in a browser against local Odoo 20.
- [P0.3] Slim two-stage Odoo image (2.91 GB, was 5.43 GB) in use; all live contract tests pass on it.
- [P1.10] UI kit: Tailwind preset generated from tokens, `ThemeProvider` (runtime tenant theming with contrast guard, dark mode), NOVI i18n catalogue, 11 primitives (Button, Input, Badge, Avatar, Skeleton, Breadcrumb, Tooltip, DropdownMenu, Dialog, Toast, Command) with 26 Storybook stories and 15 behaviour tests; Storybook added to `pnpm dev` (:6006); web app uses the kit.
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
