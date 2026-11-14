# NOVI — Master Task List

This is the complete, tickable list of everything that needs to be built. Each phase is done in order, top to bottom.

**Related files:**
- [ROADMAP.md](ROADMAP.md): phase status, "Now / Next" and the phase gates
- [PLAN.md](PLAN.md): architecture and the reasons behind it
- [CHANGELOG.md](CHANGELOG.md): what was done, and when
- [DECISIONS.md](DECISIONS.md): decision log

## Conventions

- **Markers:** `[ ]` todo · `[~]` in progress · `[x]` done · `[-]` dropped (add the reason inline) · `[!]` blocked (add the reason inline)
- **IDs:** `P<phase>.<task>.<subtask>`, e.g. `P2.4.3`. Use the task ID (`P2.4`) in the branch name (`p2.4-onchange-loop`) and in commits (`P2.4.3: apply onchange warnings`).
- **When a task is done:** it is done only when every subtask is ticked **and** its **Done when** line is true. Then add a CHANGELOG line and update "Now / Next" in ROADMAP.md.
- **Phase gate:** a phase is closed only when every **Gate** checkbox at the end of the phase is ticked. Until then, the next phase stays locked.
- **New work found mid-phase:** add it as a new subtask under the right task (next free number). Never renumber existing IDs.
- **Definition of Done (DoD), applies to every code task:**
  - typed (no `any` without a comment)
  - unit tests written
  - lint, typecheck and tests green in CI
  - reviewed via PR
  - docs or README updated if the public API changed
  - no Odoo code changed or copied

---

## Progress summary

| Phase | Tasks | Done | Status |
|---|---|---|---|
| 0 Foundations | 13 | 10 (+3 deferred, D-20/D-21) | ✅ |
| 1 Gateway, provisioning & shell | 17 | 16 (+1 carried: P1.14 blocked on OAuth apps; D-32) | ✅ |
| 2 Engine core | 16 | 8 | 🟦 |
| 3 Breadth | 12 | 0 | ⬜ |
| 4 Sales + CRM | 8 | 0 | ⬜ |
| 5 Accounting | 10 | 0 | ⬜ |
| 6 Inventory + HR | 11 | 0 | ⬜ |
| 7 SaaS hardening & GA | 14 | 0 | ⬜ |

(Update the **Done** column when you tick a task.)

---

# Phase 0 — Foundations (≈ 3 weeks)

**Goal:** a repo, a local Odoo 20, a proven client library, and answers to the two biggest unknowns (2FA and provisioning).

### P0.1 Monorepo setup
- [x] P0.1.1 Initialise git, set the default branch to `main`, protect the branch (PR required, CI required). *Branch protection is a GitHub setting the repo owner applies.*
- [x] P0.1.2 Set up a pnpm workspace and Turborepo pipeline (`build`, `lint`, `typecheck`, `test`, `dev`)
- [x] P0.1.3 Add a shared `tsconfig.base.json` (strict, `noUncheckedIndexedAccess`, path aliases)
- [x] P0.1.4 Add ESLint (typescript-eslint, react, react-hooks, import order) and a Prettier config
- [x] P0.1.5 Add Vitest config (workspace mode) and coverage reporting
- [x] P0.1.6 Create empty package skeletons: `odoo-client`, `odoo-expr`, `odoo-meta`, `engine`, `ui`, `fields`, `views`, `chatter`, `realtime`, `shell`, `apps/*`
- [x] P0.1.7 Create service and app skeletons: `services/gateway`, `services/provisioner`, `apps/web` (Vite + React), `apps/admin`
- [x] P0.1.8 Create tool skeletons: `tools/contract-tests`, `tools/coverage-scanner`; add `infra/compose`, `infra/images`
- [x] P0.1.9 Write the root README: repo layout, prerequisites, `pnpm dev` quick start
- [x] P0.1.10 Add Husky + lint-staged pre-commit hook, and a commitlint rule requiring the task-ID prefix

**Done when:** `pnpm install && pnpm build && pnpm test` passes on a clean clone.

### P0.2 CI/CD & versioning
- [x] P0.2.1 Add a CI workflow: install (with cache), lint, typecheck, test, build (affected packages only)
- [x] P0.2.2 Set up Changesets for package versioning and a private npm registry (GitHub Packages / Verdaccio)
- [x] P0.2.3 Add a Docker build job for `web`, `gateway` and `provisioner` (tagged by commit SHA)
- [x] P0.2.4 Add dependency scanning (Renovate/Dependabot) and a license checker (block GPL/AGPL deps in the frontend)
- [x] P0.2.5 Add PR template with a DoD checklist and a "Task ID" field

**Done when:** a PR runs the full pipeline and a merge to `main` publishes snapshot images.

### P0.3 Local Odoo 20 environment
- [x] P0.3.1 Write `infra/images/odoo20/Dockerfile` that builds a stock image from the tarball (no code changes, layer checksum recorded)
- [x] P0.3.2 Write `docker-compose.dev.yml` with PostgreSQL 16, Odoo 20, Redis and Mailpit (to catch outgoing mail)
- [x] P0.3.3 Write the Odoo config for dev (`dbfilter`, `list_db=False`, `proxy_mode`, workers for websocket/gevent)
- [x] P0.3.4 Write a seed script: create `novi_demo` with demo data and install `sale_management`, `crm`, `account_accountant`, `stock`, `hr`, `hr_holidays`, `hr_attendance`, `hr_expense`, `api_doc`
- [x] P0.3.5 Seed users: admin, a sales user, an accountant, a stock user, an HR officer, a portal user, and a 2FA-enabled user
- [x] P0.3.6 Add `make`/`pnpm` scripts: `odoo:up`, `odoo:reset`, `odoo:shell`, `odoo:logs`
- [x] P0.3.7 Document the API key creation steps for JSON-2 testing

**Done when:** one command brings up a seeded Odoo 20 at `localhost:8069` with every pilot app installed.

### P0.4 `odoo-client`: JSON-RPC (session) transport
- [x] P0.4.1 JSON-RPC 2.0 envelope builder and response/error parser
- [x] P0.4.2 `session.authenticate(db, login, password)`, `getSessionInfo()`, `destroy()`
- [x] P0.4.3 `callKw(model, method, args, kwargs)` via `/web/dataset/call_kw/<model>/<method>`
- [x] P0.4.4 `callButton(...)` via `/web/dataset/call_button`
- [x] P0.4.5 Helpers for route calls: `/web/action/load`, `/web/action/run`, `/web/webclient/load_menus`, `/web/webclient/translations`
- [x] P0.4.6 Cookie handling for Node (cookie jar) vs browser (credentials include)
- [x] P0.4.7 Context management (lang, tz, uid, allowed_company_ids) merged into every call
- [x] P0.4.8 Request batching / de-duplication of identical in-flight calls

**Done when:** contract tests can log in and read `res.partner` through this transport.

### P0.5 `odoo-client`: JSON-2 (bearer) transport
- [x] P0.5.1 `POST /json/2/<model>/<method>` with an `Authorization: bearer` header and `X-Odoo-Database`
- [x] P0.5.2 Confirm the request body envelope against `Json2Dispatcher` (record the finding in DECISIONS, D-14)
- [x] P0.5.3 Map 404/422/401/403 to typed errors
- [x] P0.5.4 `/web/version` version detection and a capability flag set
- [x] P0.5.5 Common `Transport` interface so the engine doesn't care which transport is used

**Done when:** the same test suite passes on both transports for ORM methods.

### P0.6 `odoo-client`: errors, retries, cancellation
- [x] P0.6.1 Typed errors: `UserError`, `ValidationError`, `AccessError`, `MissingError`, `RedirectWarning`, `SessionExpired`, `NetworkError`
- [x] P0.6.2 Parse Odoo error payloads (name, message, arguments, debug), keeping `data.context` for RedirectWarning actions
- [x] P0.6.3 Retry policy for safe calls only (reads), with exponential backoff
- [x] P0.6.4 `AbortSignal` support on every call
- [x] P0.6.5 Hooks: `onSessionExpired`, `onRequest`, `onResponse` (for logging and telemetry)

**Done when:** every error type has a test reproducing it against real Odoo.

### P0.7 Contract test suite
- [x] P0.7.1 Test harness: start Odoo (compose), wait for health, reset the DB per suite
- [x] P0.7.2 Auth contracts: authenticate, session info, destroy, wrong password, 2FA user returns `uid: null`
- [x] P0.7.3 Metadata contracts: `get_views` (form/list/kanban/search), `fields_get`, `/web/model/get_definitions`
- [x] P0.7.4 Data contracts: `web_search_read`, `web_read`, `web_save` (create/update), `web_unlink`, `onchange`, `web_name_search`, `web_read_group`, `formatted_read_group`
- [x] P0.7.5 Navigation contracts: `load_menus`, `action/load`, `action/run`, `load_breadcrumbs`
- [x] P0.7.6 File contracts: `/web/image`, `/web/content`, `upload_attachment`, `/report/download`
- [x] P0.7.7 Mail contracts: `/mail/store`, `/mail/message/post`
- [x] P0.7.8 Bus contracts: websocket connect, subscribe, receive a notification triggered by a write
- [x] P0.7.9 Snapshot the response shapes; CI fails if Odoo's response shape changes

**Done when:** the full suite is green in CI against the dockerised Odoo 20.

### P0.8 Coverage scanner v1
- [x] P0.8.1 Enumerate every `ir.actions.*` and every view (`ir.ui.view`) per model (views via `get_views` per action, i.e. with inheritance applied)
- [x] P0.8.2 Parse arch and collect view types, `widget=` names, field types and client action tags
- [x] P0.8.3 Compare with the engine's supported-registry manifest (JSON)
- [x] P0.8.4 Output a Markdown + JSON report: % supported and the top missing widgets, ranked by usage
- [x] P0.8.5 CLI: `pnpm scan --tenant <url> --db <db>`

**Done when:** a report is produced for `novi_demo` and committed under `docs/coverage/`.

### P0.9 Design system foundation
- [x] P0.9.1 Brand-neutral design tokens: color (light/dark), typography, spacing, radius, shadow, motion
- [x] P0.9.2 Layout grammar: page header, action bar, sheet → card grid, tabs, side drawer, dialog sizes
- [-] P0.9.3 Figma kit: shell, list, form, kanban, search bar, dialogs, toasts, empty states *(deferred, D-20: now a Phase 2 gate item)*
- [x] P0.9.4 Theming contract: which tokens a tenant can override (logo, primary, accent, font)
- [x] P0.9.5 Accessibility baseline: contrast ratios, focus rings, keyboard map
- [-] P0.9.6 Design review and sign-off with stakeholders *(deferred, D-20: now a Phase 2 gate item)*

**Done when:** the Figma kit is approved and tokens are exported to `packages/ui/tokens`.

### P0.10 Spike: 2FA login without Odoo changes
- [x] P0.10.1 Server-side relay: GET `/web/login`, extract `csrf_token`, POST credentials
- [x] P0.10.2 Detect the redirect to `/web/login/totp`, then POST `totp_token` and capture `session_id` (simpler than planned: `authenticate` already leaves `pre_uid` in the session)
- [x] P0.10.3 Handle the trusted-device cookie: `completeTwoFactor(code, {remember, userAgent})` + `resumeTrustedDevice()`; verified live (the relay must send a real browser User-Agent, else Odoo 500s naming the device)
- [-] P0.10.4 Fallback flow: redirect to Odoo's login page and hand the session back to the gateway (not needed: the relay uses stock routes directly)
- [x] P0.10.5 Write up the result, risks and the chosen approach in DECISIONS.md

**Done when:** a 2FA user can log in through the relay script, and the decision is recorded.

### P0.11 Spike: tenant provisioning
- [x] P0.11.1 Script: create a PostgreSQL role and DB `tenant_<id>`
- [x] P0.11.2 Run `odoo -d tenant_<id> -i base,<modules> --without-demo --load-language` in a one-off container
- [x] P0.11.3 Bootstrap the admin user, company name, country and currency via RPC
- [x] P0.11.4 Start a tenant Odoo container with its own filestore volume and config
- [x] P0.11.5 Time each step; record total time and resource usage (RAM/CPU idle and under load): 160 s, 158 MB idle, 70 MB DB (D-16)
- [x] P0.11.6 Write the result to DECISIONS.md (target is < 5 min): 160 s install path, **8–13 s** template path (D-16, D-18)

**Done when:** one script creates a fresh, isolated, log-in-able tenant and the timings are recorded.

### P0.12 Business & legal prerequisites
- [-] P0.12.1 Confirm Odoo Enterprise hosting/partner terms and per-tenant subscription cost with Odoo S.A. *(deferred, D-20: licensing/cost now a Phase 4 gate item; legal also P7.9)*
- [-] P0.12.2 Decide Community-only vs Enterprise plans and record it in DECISIONS *(deferred, D-20: licensing/cost now a Phase 4 gate item; legal also P7.9)*
- [-] P0.12.3 Choose a cloud provider and region(s); estimate cost per tenant *(deferred, D-20: licensing/cost now a Phase 4 gate item; legal also P7.9)*
- [-] P0.12.4 Draft a data-protection position (GDPR / Kenya DPA): data location, processor terms *(deferred, D-20: licensing/cost now a Phase 4 gate item; legal also P7.9)*
- [-] P0.12.5 Pick a product domain (e.g. `novi.app`) and register it *(deferred, D-20: licensing/cost now a Phase 4 gate item; legal also P7.9)*

**Done when:** a licensing decision and a cost model per tenant are recorded.

### P0.13 Live staging & CI/CD (temporary home on the MT5 server)
- [x] P0.13.1 Progress dashboard generator (`tools/progress-dashboard/build.mjs`) from TASKS/ROADMAP/CHANGELOG + git log
- [x] P0.13.2 Server setup script `deploy/staging/setup-server.sh` (unprivileged `novi` user, Caddy site block with backup + validate + graceful reload); tested in a container
- [x] P0.13.3 GitHub Actions workflow `deploy-staging.yml` (push to `main` → build dashboard → upload as `novi`, host key pinned)
- [x] P0.13.4 Private GitHub repo created and `main` pushed
- [-] P0.13.5 dafeapp server: dropped. `192.34.61.66` is a DigitalOcean IP no longer ours (host key changed), so the dafeapp edits were reverted
- [x] P0.13.6 Run `setup-server.sh` on the MT5 server (68.183.91.240)
- [x] P0.13.7 GitHub secrets: `VPS_HOST=68.183.91.240`, `VPS_USER=novi`, `VPS_SSH_KEY` (host keys are pinned in `deploy/staging/known_hosts`; `VPS_FINGERPRINT` no longer used)
- [x] P0.13.8 DNS: `novi.dafeapp.com` A record → 68.183.91.240 (Cloudflare)
- [x] P0.13.9 First deploy green; https://novi.dafeapp.com/progress/ loads behind the login
- [-] P0.13.10 Get a separate staging server (≥ 8 GB) for Odoo, gateway and web *(deferred until the MVP, D-21: everything runs locally; the MT5 server only hosts the static dashboard)*
- [ ] P0.13.11 Fix stale server info in dafeapp (`SERVER_SETUP.md`, `DO_HOST` secret still point to 192.34.61.66)

**Done when:** every push to `main` updates https://novi.dafeapp.com within ~2 min, with no effect on the MT5 bots.

### Phase 0 Gate
- [x] Contract suite green against Odoo 20, run locally with `pnpm verify` (29/29). Running it in CI is deferred until the MVP (D-21)
- [x] Coverage report for the demo DB committed
- [x] 2FA approach decided (DECISIONS)
- [x] Provisioning spike < 5 min, recorded (DECISIONS)
- [-] Licensing decision recorded *(deferred to the Phase 4 gate, D-20)*
- [-] Design tokens and Figma kit approved *(tokens done; Figma kit + sign-off deferred to the Phase 2 gate, D-20)*

---

# Phase 1 — Gateway, tenant provisioning & shell (≈ 6 weeks)

**Goal:** a customer signs up, gets their own Odoo and database, logs in, and browses real menus in the new UI.

### P1.1 Gateway service foundation
- [x] P1.1.1 Fastify app with structured logging (pino), request IDs, health/readiness endpoints *(Fastify's built-in pino logger with a request id on every log line; `/healthz`, `/readyz`)*
- [x] P1.1.2 Config loading from the environment; secrets from the environment (`PLATFORM_SECRET`, SMTP) *(D-32: a vault/KMS → P7.8.3 secrets rotation)*
- [-] P1.1.3 Gateway Postgres schema and migrations *(dropped, D-32: the gateway stores nothing that needs a database: tenants and sign-ups are files (D-27/D-28), sessions are Odoo's, preferences stay in Odoo (`ir.filters`, user settings). Add one when a feature needs shared state)*
- [-] P1.1.4 Redis connection *(dropped, D-32: no queue (D-28), no gateway cache yet (P2.16.5), rate limits in memory)*
- [-] P1.1.5 OpenAPI spec for the gateway's own endpoints *(deferred to P7.11, D-32: the only client is NOVI's own engine, typed in `@novi/engine`; endpoints are documented at the top of each route file)*

**Done when:** the gateway runs in compose, migrations apply, and health checks pass.

### P1.2 Tenant registry
- [x] P1.2.1 Tenant model: slug, hosts, odooUrl, db, status (`active|suspended`), createdAt *(provisioning states live in the sign-up record (P1.4); tier/plan/branding arrive with P7.2/P7.3)*
- [x] P1.2.2 Resolve the tenant by hostname (`<slug>.novi.app` and custom domains) (gateway resolves `request.tenant` from the Host header; unknown → 404, suspended → 503; verified with acme/beta)
- [-] P1.2.3 "Bring your own Odoo" registration *(deferred to Phase 7, D-32: no customer has asked; the registry already accepts any Odoo URL via the CLI)*
- [x] P1.2.4 Internal admin: list, add, remove tenants (`services/gateway/src/tenants/cli.ts`) and sign-ups (`services/provisioner/src/cli.ts`) *(an HTTP admin API comes with the admin console P7.1)*

**Done when:** requests are routed to the correct tenant context by hostname.

### P1.3 Sign-up flow
- [x] P1.3.1 Sign-up page: company name, email, password, country, workspace address *(D-28: admin name, language and plan/trial deleted: Odoo's user name is the email until the owner edits it; English only until the language switcher; one starter plan until billing in P7)*
- [x] P1.3.2 Slug generation and availability check *(server-side `slugify` is the one naming rule; live preview + 409 with a suggestion)*
- [x] P1.3.3 Email verification (token link) before provisioning starts *(password sealed with AES-256-GCM until provisioning, then wiped)*
- [x] P1.3.4 Bot protection: 5 sign-ups per IP per hour *(captcha deleted, D-28: email verification already gates provisioning; add one only if abuse appears)*
- [x] P1.3.5 Progress screen that polls provisioning status *(no email or internal error exposed)*
- [x] P1.3.6 Welcome email with the tenant URL *(one-time auto-login link deleted, D-28: the owner just chose the password; a login token would be a second credential to secure)*

**Done when:** a new user goes from the sign-up form to a verified, queued tenant.

### P1.4 Provisioner worker
- [x] P1.4.1 Job queue with a step-based state machine, persisted per tenant *(D-28: one JSON record per sign-up on disk, polled by one worker; BullMQ/Redis deleted until there is more than one worker)*
- [x] P1.4.2 Step: create the DB role and database (`tenant_<id>`) with least-privilege grants
- [x] P1.4.3 Step: create the filestore volume
- [x] P1.4.4 Step: run the module-init job (Odoo CLI) for the plan's modules and country *(fast path clones the template instead; slow path for countries without a template)*
- [x] P1.4.5 Step: start the tenant Odoo container *(one `docker run` per tenant with memory/CPU limits; a compose template is P1.5.1 if still needed)*
- [x] P1.4.6 Step: wait for health, then bootstrap the admin user and company via RPC
- [x] P1.4.7 Step: register the URL, set status `active` *(no service credentials to store since the vault was deleted, D-27)*
- [x] P1.4.8 Idempotency: a retry or a run interrupted by a restart first destroys its leftovers, then re-runs the whole job (~10 s) *(per-step resume deleted: the whole job is cheaper than tracking it)*
- [x] P1.4.9 Rollback on failure (container, volume, DB, role, files, gateway entry); status `failed` with the reason for operators *(alerting → P7 observability)*
- [x] P1.4.10 Operator action: `provisioner cli retry <id|slug>` *(admin console UI → P7)*
- [x] P1.4.11 Template DB per (plan, country) + clone fast path from `infra/provisioning/tenant.sh` (D-18): template DBs owned by the platform role, guard against `REASSIGN OWNED` moving shared objects; rebuild templates on image/plan change *(the template records the image that built it; with another image `create` takes the slow path and prints the rebuild command, so a stale template is never cloned)*

**Done when:** sign-up results in an active tenant in < 5 min, and a forced failure rolls back cleanly.

### P1.5 Tenant infrastructure (Docker Compose)
- [-] P1.5.1 `odoo-tenant` compose template *(dropped, D-29: `infra/provisioning/tenant.sh` already defines the tenant (container, filestore volume, `odoo.conf` mode 644 in a 700 dir, `--restart unless-stopped`); a compose file per tenant would be a second definition)*
- [x] P1.5.2 Odoo config hardening: `list_db=False`, `dbfilter=^tenant_<id>$`, random `admin_passwd`, `proxy_mode` *(verified live: database manager disabled and database RPC refused on the tenant; the gateway also never proxies `/web/database`)*
- [-] P1.5.3 Separate HTTP and websocket (gevent) ports *(dropped, D-29: tenants run threaded (`workers = 0`), so Odoo serves the websocket on the HTTP port; verified 101 through Caddy → gateway → tenant. Needed only if a plan gets `workers > 0`)*
- [x] P1.5.4 Separate docker network per tenant: a tenant container can reach only Postgres (alias `db`) *(the gateway reaches it through its loopback port; verified: no path to other tenants, the dev Odoo, Mailpit or any host port; a tenant's DB role can connect only to its own database: CONNECT revoked from PUBLIC on every other database)*
- [x] P1.5.5 Memory/CPU limits: 1 GB, 1 CPU per tenant (one plan exists; per-tier values arrive with plans in P7)
- [x] P1.5.6 Caddy TLS for tenant hosts: stock Caddy with **on-demand TLS** instead of a wildcard DNS challenge (D-29: no DNS plugin or credentials, custom domains work the same way); the gateway's `/api/tls/allowed` approves only active tenants and the platform host; routing stays in the gateway. `pnpm edge` runs it locally (https://acme.localhost:8443)
- [-] P1.5.7 `platform` compose stack *(deferred to the MVP deployment, D-24 local-first; Redis and gateway Postgres dropped by D-27/D-28: the stack is Caddy, gateway (serves the web app) and provisioner)*

**Done when:** two tenants run side by side in staging with no network path between them. *(verified locally with four tenants, staging deploy waits for the MVP, D-24)*

### P1.6 Auth bridge
- [x] P1.6.1 Password login → Odoo `authenticate` → issue our own session (httpOnly JWT cookie + refresh) (same-domain mode: gateway checks the password with Odoo and hands the browser Odoo's own `session_id` cookie; NOVI's own JWT session arrives with the vault mode P1.7)
- [x] P1.6.2 2FA login using the approach chosen in P0.10 (gateway relays Odoo's TOTP step; trusted devices via `td_id`; real browser User-Agent forwarded; verified in a browser and by live tests)
- [x] P1.6.3 Logout (our session + Odoo `destroy`) *(no NOVI session since D-27: logout is Odoo's `destroy`; verified live that the old cookie is rejected afterwards. Odoo's "log out from all devices" belongs to the account-security screen with preferences)*
- [x] P1.6.4 Session expiry and silent refresh; 401 → redirect to login *(no refresh token needed: Odoo re-issues its 7-day `session_id` cookie on every request (verified through the gateway), so the session slides with activity; an expired session returns to login (P1.12.5))*
- [x] P1.6.5 Password reset (relay to Odoo's `auth_signup` reset flow) *(NOVI pages for request + new password; Odoo's emailed link redirects to NOVI's page; same answer for unknown accounts; 5 requests/IP/hour; tenants get outgoing mail (D-30); Odoo's password rule (stock `auth_password_policy`, min 10 from one constant) is checked before submitting because Odoo spends the link even when it refuses the password)*
- [x] P1.6.6 Brute-force protection and lockout *(Odoo's own per-IP cooldown, verified through the gateway: 10 failures → 60 s; the screen says so instead of "wrong password". Fixed: the gateway trusted any client's X-Forwarded-For, so an attacker could dodge the cooldown with fake IPs; now only the local proxy (Caddy/Vite) is believed. Per-account limits for IP-rotating attacks → P1.8.3)*

**Done when:** normal and 2FA users can log in and out, and expired sessions recover.

### P1.7 Session vault & both modes
- [-] P1.7.1 Encrypted storage of the Odoo `session_id` per (tenant, user) using envelope encryption *(deleted by D-27: the gateway is a same-origin proxy, so Odoo's own HttpOnly cookie stays in the browser per tenant host; nothing to vault)*
- [-] P1.7.2 `sessionStrategy=vault`: the gateway attaches the Odoo cookie on outbound calls *(deleted by D-27)*
- [x] P1.7.3 `sessionStrategy=passthrough`: same-domain mode, the browser's own cookie is forwarded (the only mode now: the gateway passes the browser's Odoo cookie through, in same-domain and separate-domain hosting alike)
- [-] P1.7.4 Config per tenant; both modes covered by e2e tests *(deleted by D-27: one mode, covered by gateway live tests and the acme/beta isolation run)*

**Done when:** the same UI build works in both modes.

### P1.8 RPC proxy
- [x] P1.8.1 Proxy `/api/rpc/*` → Odoo `/web/dataset/*`, `/web/action/*`, `/mail/*`, file routes (same-origin reverse proxy of the Odoo routes the app uses (`/web`, `/json/2`, `/mail`, `/report`, `/odoo`, `/websocket`) to each tenant's own Odoo; Host kept, X-Forwarded-* set)
- [x] P1.8.2 Allow-list of routes and methods (block `/web/database/*`, private methods) (allow-list by route prefix; `/web/database/*`, `/jsonrpc`, `/xmlrpc` unreachable; Odoo still enforces method access) *(replaced by D-40: NOVI's own paths + a deny-list (database manager, legacy RPC); everything else goes to the tenant's Odoo, so new apps' routes work without a gateway change)*
- [-] P1.8.3 Rate limiting per user and per tenant *(deferred to P7.7/P7.8, D-32: sign-up and reset are limited per IP; login by Odoo's cooldown; per-account limits against IP-rotating attacks and per-tenant API quotas need load data first)*
- [-] P1.8.4 Audit log for writes *(deferred to P7.9, D-32: Odoo already records who changed what (`write_uid`/`write_date`, chatter field tracking); a separate gateway log only if a compliance requirement asks for it)*
- [x] P1.8.5 Streaming for file downloads/uploads (no buffering in memory) (bodies streamed through untouched by reply-from: no JSON re-parsing, uploads not buffered)
- [x] P1.8.6 Websocket relay for `/websocket` (vault mode) (websocket upgrade piped to the tenant's Odoo with Host/Origin kept (D-17); verified: live notification through the gateway for acme, and in dev via Vite)

**Done when:** all contract tests also pass when run **through** the gateway.

### P1.9 Metadata cache
- [-] P1.9.1 Cache `get_views`, `load_menus`, translations *(moved to P2.16.5, D-32: measure first (Musk step 3); the browser already caches them per session with TanStack Query)*
- [-] P1.9.2 Invalidate on module install/upgrade and manual purge *(moved with P1.9.1 to P2.16.5)*
- [-] P1.9.3 Measure: target a cache-hit view load in < 50 ms *(moved: the measurement is P2.16.2's performance budget)*

**Done when:** repeat view loads are served from cache, and invalidation is proven by a test.

### P1.10 `ui` package (component library)
- [x] P1.10.1 Tailwind preset from the tokens (P0.9), with dark mode (`packages/ui/tailwind-preset.ts`: every value is a token CSS variable; preflight grey/border routed to tokens, 0 hex in app CSS)
- [x] P1.10.2 shadcn/ui primitives: Button, Input, Select, Combobox, Checkbox, Radio, Switch, Textarea, DatePicker, Dialog, Drawer, Popover, Tooltip, DropdownMenu, Tabs, Badge, Avatar, Toast, Skeleton, Table base, Card, Breadcrumb, Command *(Musk step 2: 11 primitives the shell needs (Button, Input, Badge, Avatar, Skeleton, Breadcrumb, Tooltip, DropdownMenu, Dialog, Toast, Command); the other 14 moved to P2.13.14)*
- [x] P1.10.3 Runtime tenant theming (CSS variables from the tenant config) (`ThemeProvider`: injects token variables, applies tenant colours only if `validateTheme()` passes, light/dark/system)
- [x] P1.10.4 Storybook with every component and its state variants (26 stories incl. states; light/dark toolbar; a11y addon set to error; `pnpm dev` → :6006)
- [-] P1.10.5 Visual regression tests (Storybook snapshots) *(moved to P2.16.4, Musk step 5 "automate last": snapshot once primitives and views stabilise)*
- [-] P1.10.7 CI/lint check: every exported component in `ui`/`fields`/`views` has a `*.stories.tsx` (ex-P1.17.6) *(still deferred, automate last: add when stories start drifting from components)*
- [x] P1.10.6 NOVI i18n catalogue for NOVI-owned strings (Save, Discard…), created with the first primitive that needs one (`I18nProvider`/`useT` with NOVI-owned strings only; Odoo text never goes here)

**Done when:** Storybook is published and every primitive has stories and a11y checks.

### P1.17 UI architecture guardrails (DRY and reuse)
- [x] P1.17.1 Component architecture plan: layers L0–L5 + headless engine, field contract, override registry (`docs/design/COMPONENT-ARCHITECTURE.md`)
- [x] P1.17.2 UI rules with the pre-flight checklist and DRY single-source table (`docs/design/UI-RULES.md`), linked from CLAUDE.md and the PR template
- [x] P1.17.3 ESLint layer boundaries (`no-restricted-imports` per package) + ban on hard-coded colours / inline styles in UI packages
- [x] P1.17.4 `FieldProps` contract + `registerField` / `registerOverride` registries with type fallbacks (types only, no widgets yet) (`@novi/fields` FieldRegistry, `@novi/views` OverrideRegistry with reason + owner)
- [x] P1.17.5 Single formatter `createFormatter()` in `@novi/engine` from Odoo `lang_parameters` + session currencies + tz (numbers, monetary, percentage, float_time, date, datetime, parseNumber), unit tests + live contract test. *Musk step 2: the React hook and the i18n catalogue were cut here and moved to where they're first needed (P1.10.6, P1.11.6)*
- [-] P1.17.6 CI check: every exported component in `ui`/`fields`/`views` has a `*.stories.tsx` *(moved to P1.10.7, Musk step 5 \"automate last\": nothing to check until the first stories exist)*
- [-] P1.17.7 Registry writes `tools/coverage-scanner/supported.json` automatically (no hand-maintained list) *(moved to P2.13.13: no widgets are registered yet; automate when the first one lands)*

**Done when:** a new widget or pattern can only be added through the registry and stories, and lint fails on boundary or token violations.

### P1.11 Shell: navigation
- [x] P1.11.1 App launcher (home grid) from `load_menus` root items with icons (real Odoo app icons from `load_menus`; verified in browser against local Odoo)
- [x] P1.11.2 Sidebar / top menu of the current app, with nested menus (sections as headings, active entry highlighted; an app root's action resolves to its sidebar entry like Odoo)
- [x] P1.11.3 Router: `/:app/action/:id`, `/:app/:model/:id`, deep links, browser back/forward (`/`, `/apps/:id`, `/action/:id?menu=`; deep links survive reload; `pnpm dev` serves it with Odoo same-origin)
- [x] P1.11.4 Breadcrumbs (restored from URL via `load_breadcrumbs`) (derived from the already-loaded menu tree; *Musk step 2: `load_breadcrumbs` call deleted*; one `menuUrl()` helper for launcher/breadcrumbs/redirect)
- [x] P1.11.5 Responsive layout: desktop, tablet, mobile (bottom nav) *(sidebar collapses behind a menu button on small screens; Musk step 2: mobile bottom nav deleted until users ask for it)*
- [-] P1.11.6 `useFormat()` React hook over `createFormatter()` (settings from session + translations, cached per user/lang) *(moved to P2.13.15: first consumer is the first field widget)*

**Done when:** every menu of every installed app is reachable and deep links survive a reload.

### P1.12 Shell: user context
- [-] P1.12.1 User menu: profile, preferences (lang, tz), API keys, logout *(sign-out done; preferences moved to P2.10.9, D-32: they are Odoo's own user-preferences form, which the generic form view will render, so no bespoke screen)*
- [x] P1.12.2 Multi-company switcher (`allowed_company_ids` in context) (top-bar switcher, shown only with >1 company; `allowed_company_ids` on every call + Odoo's `cids` cookie; verified live: Odoo returns only the active company's records)
- [-] P1.12.3 Translations loaded and applied, with a language switcher *(deferred: only English is installed; build the switcher when a second language exists)*
- [-] P1.12.4 Notifications/toast centre *(deferred to P3.8/P3.9: nothing sends notifications until the live-update bus exists)*
- [x] P1.12.5 Global error boundary and an error dialog for Odoo errors (error boundary per screen with Reload; expired Odoo session → login screen; *Musk step 2: the Odoo error dialog moves to P2.8.9, where Save/buttons first need it*)

**Done when:** switching language or company updates every subsequent call's context.

### P1.13 Command palette (⌘K)
- [x] P1.13.1 Search menus and actions (type anywhere, ⌘K/Ctrl+K or the top-bar search button; apps + every menu by full path; word matching instead of fuzzy; D-24)
- [x] P1.13.2 Search records (global `web_name_search` across key models) (Odoo `web_name_search` over contacts, sales/purchase orders, invoices, leads, products, employees; Odoo's model names as headings; skips models not installed or not readable; 250 ms debounce; opens `/record/:model/:id`; verified live)
- [-] P1.13.3 Recent items and quick commands *(moved to P2.8.10, D-32: "new invoice" needs the form view)*

**Done when:** ⌘K opens any menu or record in ≤ 3 keystrokes after typing.

### P1.14 SSO
- [x] P1.14.1 OAuth providers via Odoo `auth_oauth` redirect flow, then session capture *(D-31: "Continue with …" from the provider list Odoo renders; the return leg `/auth_oauth/` is proxied so Odoo sets its own session on the tenant host (nothing to capture); refused sign-ins come back to NOVI's login with a message; an identity is linked by choosing the provider on the emailed reset/invitation page. Verified live with a stand-in identity provider (`tools/contract-tests/fixtures/fake-idp.py`))*
- [!] P1.14.2 Google and Microsoft tested *(blocked: needs the platform's own Google Cloud / Microsoft Entra OAuth app (client ID) from the product owner. Google accepts only exact redirect URIs, so one client for all tenant hosts needs P1.14.4 first)*
- [ ] P1.14.4 Platform SSO callback: one redirect URI (`https://<platform>/sso/callback`) that forwards the provider's answer to the right tenant's `/auth_oauth/signin` (tenant from the state's database), and each tenant's provider record filled from platform config; build together with P1.14.2
- [-] P1.14.3 Option for enterprise customers: Keycloak (or similar) as the identity provider through Odoo's stock `auth_oauth`; only if a customer needs corporate SSO (extra server, Musk step 2) *(dropped until a customer asks: the same stock provider record works for any OAuth2 implicit-flow IdP, as the stand-in proves)*

**Done when:** a user can log in with Google into a tenant.

### P1.15 Apps per plan
- [-] P1.15.1 Plan → module list mapping *(moved to P7.3.1, D-32: one plan exists until billing; its modules are `NOVI_TENANT_MODULES` in the template)*
- [-] P1.15.2 Install/uninstall as a provisioner job *(moved to P7.3.4 with plan changes; workspace admins can already install apps through Odoo's Apps screen)*
- [-] P1.15.3 Invalidate the metadata cache after module changes *(moved with the cache to P2.16.5)*

**Done when:** a plan upgrade installs the new apps and their menus appear.

### P1.16 Phase 1 testing
- [x] P1.16.1 E2E: sign-up → verify → provision → sign in → browse menus *(`tools/contract-tests/test/platform.contract.test.ts`, live, ~16 s; auto-login was deleted by D-28)*
- [x] P1.16.2 Isolation test: tenant A session/credentials can't access tenant B *(same suite; network isolation verified in P1.5.4)*
- [-] P1.16.3 E2E for both session modes *(dropped: one mode since D-27)*
- [-] P1.16.4 Load test: 20 concurrent sign-ups *(deferred to staging, D-24: 20 tenants need ~4 GB RAM. Note for that test: one worker provisions one at a time (~11–16 s each), so the 20th customer waits ≈ 4–5 min, at the < 5 min target; add workers before marketing pushes)*

**Done when:** all of the above are green in CI/staging. *(green in `pnpm verify` locally, D-24)*

### Phase 1 Gate
- [x] New sign-up gets an isolated instance (own containers, DB, filestore) in < 5 min *(11–16 s from the template; platform e2e)*
- [x] Isolation verified between two tenants *(sessions, credentials, network, database roles: P1.5.4, P1.16.2)*
- [x] Login works in both modes (incl. 2FA) *(one mode since D-27; password, 2FA + trusted device, reset, SSO: gateway and platform contract tests)*
- [x] All menus of installed apps browsable *(launcher, sidebar, breadcrumbs, palette; each screen opens in Odoo until the Phase 2 engine renders it)*

---

# Phase 2 — Engine core (≈ 8 weeks)

**Goal:** any standard Odoo list, form or kanban opens, edits and saves through the generic engine.

### P2.1 `odoo-expr`: expression evaluator
- [x] P2.1.1 Tokenizer and parser for the Python expression subset used in arch (literals, names, tuples/lists/dicts, `not and or`, chained comparisons incl. `in`/`is`, `+ - * / // %`, `x if c else y`, attribute, subscript, calls with keywords) *(scope taken from the harvested corpus, not from Python, D-33)*
- [x] P2.1.2 Evaluator with a context (record values, `context`, `uid`, `parent`, `self`, `allowed_company_ids`, `context_today()`, `relativedelta`, `strftime`) with Python semantics *(`datetime`/`time` modules and `now`/`today` names dropped: no installed view uses them (D-33); they raise a clear error if one ever does)*
- [x] P2.1.3 Harvest every `invisible/readonly/required/column_invisible/domain/context/filter_domain/options` expression from all views into a test corpus *(`packages/odoo-expr/corpus/harvest.py` in the dev Odoo's shell → `.cache/expr-corpus.json`, regenerated by `pnpm verify`, never committed: 6,346 expressions from 2,523 views)*
- [x] P2.1.4 Corpus test: 100% parse; evaluation matches Odoo on sampled records *(100% parse; 100% match with Odoo's Python `safe_eval` on 18,597 sampled value sets; the 126 clock-dependent expressions are parse-checked and date maths is unit-tested with a fixed today)*
- [x] P2.1.5 Clear errors for unsupported constructs (`ExprSyntaxError`/`ExprError` with the expression; `safeEvaluate` logs once and returns a fallback, never crashes the view)

**Done when:** the corpus passes 100% parsing and ≥ 99% evaluation parity.

### P2.2 `odoo-expr`: domains
- [x] P2.2.1 Parse domain strings and arrays (prefix `&`, `|`, `!` notation) *(`Domain.parse/from`, read exactly like Odoo 20's `Domain` class: implicit AND, TRUE/FALSE leaves, `None` → `False`, same errors)*
- [x] P2.2.2 Evaluate dynamic domains with record/context values (`Domain.parse(expr, ctx)` through odoo-expr)
- [x] P2.2.3 Domain builder API: `Domain.and/or`, `.not()`, `.toList()` (RPC), `.toString()` (Python text for `ir.filters`) *(same flattening, TRUE/FALSE absorption, operator inversion and De Morgan as Odoo; whole floats print as `0` not `0.0`, same meaning)*
- [-] P2.2.4 Client-side domain matching for local filtering *(deferred until a view needs it, D-34: Odoo filters on the server and nothing NOVI renders filters locally yet)*

**Done when:** domain tests cover every operator Odoo supports.

### P2.3 `odoo-meta`: arch parser
- [x] P2.3.1 XML parsing (works in both browser and Node) *(NOVI's own small reader, no dependency)*
- [x] P2.3.2 ViewSchema types (JSON) for form, list, kanban, search *(meaning only, no Odoo CSS/DOM; modifiers stay expressions for odoo-expr, constants folded to booleans; D-35)*
- [x] P2.3.3 Form: header/sheet/footer, group (col/colspan), notebook/page, field, button (smart buttons with stat fields), label, separator, widget, chatter, settings app/block/setting, x2many inline sub-views; other markup kept with semantic hints (`buttonBox`, `title`, `avatar`, `alert`, `row`, …)
- [x] P2.3.4 List: columns (incl. `<column>` groups), `editable`, `decoration-*`, `sum/avg`, `optional`, widgets, row buttons, header (bulk) buttons, group rows read against the grouped record's model
- [x] P2.3.5 Kanban: card by section (main/aside/footer) with a role per value (title, subtitle, avatar, image, tags, priority, status, activity, favorite, color, amount, date, body), no QWeb interpretation; `default_group_by`, `progressbar`, `quick_create`, colour field, menu *(118/130 cards get a title; 5 are dashboard-style)*
- [x] P2.3.6 Search: fields (`filter_domain`, operator), filter groups by Odoo's separator rule, date filters, group-bys (from `context`), search panel
- [x] P2.3.7 Merge field metadata from `get_views().models` into the schema (main and related models; x2many sub-views and group rows use the related model)
- [x] P2.3.8 Every view in the demo DB: 1,305 primary form/list/kanban/search views parse; lossless for fields; every field resolves to get_views metadata *(invariant tests on a live corpus in `.cache` instead of snapshots, which would be Odoo-derived files, D-35)*

**Done when:** every view in the demo DB parses into a schema without errors.

### P2.4 `odoo-meta`: specification builder
- [x] P2.4.1 Build the `specification` from a schema: fields shown, kanban template fields (`record.x` in QWeb), fields named by expressions (incl. `parent.x` into the parent's spec) and by widget options (`currency_field`, date ranges); forms add `display_name` *(D-36)*
- [x] P2.4.2 Nested specs: many2one/reference `display_name` (ids only when hidden); x2many in forms = inline list/kanban rows + the inline line form's fields, `limit` 40, `order` from `default_order` or the drag handle; ids/tag names outside forms
- [x] P2.4.3 Context per field: the record-independent keys of the `context` attr (evaluated key by key), none for hidden fields, the first occurrence's when a field repeats

**Done when:** specs for the demo DB match what the official client requests (spot-checked on 20 views). *(17 screens captured live from Odoo's own client in headless Chromium: identical apart from fields Odoo's JS widgets add (122, P2.13 input) and 5 one-label cases; and all 1,049 readable views read live with every expression resolved)*

### P2.5 Engine: record model
- [x] P2.5.1 `OdooRecord`: values as read + changes on top (setting a value back clears it), modifiers evaluated live (the arch decides, else field metadata), Odoo's required check (visible fields; 0/false are values), `web_save` values, save/discard, new records *(D-37)*
- [x] P2.5.2 `RecordList`: pages (wrapping like Odoo's pager), sort toggle per field, selection of the visible page, count limit ("10000+")
- [x] P2.5.3 `GroupedList`: `web_read_group` groups with count, aggregates and their domain (odoo-expr `Domain.and`), lazy unfold into records or sub-groups, groups Odoo already unfolded (kanban)
- [x] P2.5.4 x2many lines (`X2ManyList`, lines are records with `parent`): add, edit, remove, link, clear, replace → CREATE/UPDATE/DELETE/UNLINK/LINK/CLEAR/SET computed from the final state, nested lines included
- [x] P2.5.5 Change notification: one observable base (`version` + `subscribe`), `useModel` over `useSyncExternalStore`; `useRecord` (TanStack Query load, save refreshes cached lists), `useRecordList`

**Done when:** unit tests cover all x2many command combinations. *(every command alone, collapsing/cancelling pairs, clear/replace followed by edits, nested lines, discard; plus a live round-trip on the dev Odoo: what Odoo stores matches every edit)*

### P2.6 Engine: onchange & defaults
- [x] P2.6.1 New record: `onchange(values, [], spec)` → defaults (`createWithDefaults`); new lines ask their own model with the parent's values under the inverse field (`addWithDefaults`), as Odoo's client does *(D-38)*
- [x] P2.6.2 Field change: `onchange` for fields marked `on_change` (with the field's own context), answers applied (x2many as commands, new lines addressed by virtual id); save leaves out read-only values unless `force_save`
- [-] P2.6.3 Show onchange warnings *(engine part done: warnings reach `onWarning` with Odoo's title, message and type; showing them as a dialog or notification moved to P2.10.10 with the form view)*
- [x] P2.6.4 Serialised onchanges: one call at a time, names arriving meanwhile merged into one follow-up call, answers never overwrite a value the user changed after the request left; save waits for pending onchanges *(no timer debounce: merging makes it unnecessary)*
- [x] P2.6.5 Nested onchange inside lines: the line model's onchange (parent values under the inverse field), then the parent's onchange on the x2many field once the line's answer is in; a line's link to its parent isn't required before the parent is saved

**Done when:** the sale order line product change updates price/taxes exactly like Odoo. *(live: NOVI's line price, taxes, description, quantity, subtotal and order total equal the same order created by Odoo itself, and what NOVI's save stores)*

### P2.7 Engine: save, delete, actions on records
- [x] P2.7.1 `web_save(vals, spec)` with only changed values (read-only values left out unless `force_save`; save waits for onchanges)
- [x] P2.7.2 Validation before save: Odoo's required check (visible fields), values a widget couldn't parse (`markInvalid` → message under the field, save refused until edited); Odoo's own errors on save reach the caller as typed errors (shown by P2.8.9)
- [x] P2.7.3 Discard (record and lines back to what was read) and a guard when closing/reloading the tab with unsaved changes (`useLeaveGuard`); leaving to another NOVI screen is guarded by the form's save/discard bar (P2.10.6)
- [x] P2.7.4 Delete (`web_unlink`), duplicate (`copy`), archive/unarchive through the model's own `action_archive`/`action_unarchive` (their answer, possibly an action, returned for P2.8), reload; the same on a list selection
- [x] P2.7.5 Bulk write on the selected records (`web_save_multi`, one call, same values for each)

**Done when:** create/edit/delete/duplicate/archive all work on 10 different models. *(live, generic, each through its own form view: partners, partner tags, products, product categories, CRM tags, departments, jobs, projects, project tags, activity types)*

### P2.8 ActionManager
- [x] P2.8.1 `ir.actions.act_window` → window descriptor: target (current, new = dialog, fullscreen/main), view modes, record id, domain and context evaluated with the active record and companies, limit *(D-39)*
- [x] P2.8.2 `ir.actions.server` via `/web/action/run` with the active records; what it returns is resolved in turn
- [x] P2.8.3 `ir.actions.report` → PDF/HTML/text URL (records, report options) to preview or download *(verified: the sales order PDF downloads)*
- [x] P2.8.4 `ir.actions.act_url` (new tab / same tab / download)
- [x] P2.8.5 `ir.actions.client`: `display_notification` (with its next action) and `reload` built in; any other tag shows Odoo's own screen embedded and labelled, with "open in a new tab" (the gateway lets the same origin frame it, D-39)
- [x] P2.8.6 `ir.actions.act_window_close` → close descriptor (with its infos) for the dialog and the parent reload
- [x] P2.8.7 Buttons: save first, `type="object"` via call_button and `type="action"` with the button's context evaluated on the record, `special` save/cancel, record reloaded unless a screen opens; `confirm` text is asked by the screen before running
- [-] P2.8.8 Action stack in the URL *(engine part done: `encodeStack`/`decodeStack` (`/action/12/42/action/30`); driving navigation and the breadcrumb bar from it moved to P2.10.12 with the form view)*
- [x] P2.8.9 Error dialog: NOVI's title per kind of error, Odoo's message as sent, RedirectWarning's button opens its action, technical details for unexpected errors only (`describeError` + `ErrorDialog`)
- [-] P2.8.10 Palette quick commands and recent items *(moved to P2.10.11: they open new records in the form view)*

**Done when:** every button in the demo sales/accounting flows works. *(live: quotation → Confirm → Create Invoice wizard → Confirm invoice → Pay wizard → paid, every button taken from the real form views)*

### P2.9 List view
- [ ] P2.9.1 TanStack Table with virtual scrolling (10k rows smooth)
- [ ] P2.9.2 Sort, column resize/reorder, optional columns toggle (saved in gateway prefs)
- [ ] P2.9.3 Grouped rows with aggregates and lazy loading
- [ ] P2.9.4 Inline editing (`editable="top|bottom"`), keyboard navigation
- [ ] P2.9.5 Selection + bulk actions menu (action/print toolbar from `get_views` toolbar)
- [ ] P2.9.6 Row decorations, handle widget (resequence), row buttons
- [ ] P2.9.7 Pager and record count (with `count_limit`)
- [ ] P2.9.8 Empty state (view `help` html)
- [x] P2.9.9 First slice, read-only (shown in the browser on every action with a list view): columns from the schema through the field registry, Odoo labels, number alignment, row/cell decorations and cell `invisible` per row, `column_invisible` with the action context, open a record; skipped for now: images, optional-hidden columns *(D-36)*

**Done when:** partner, product and invoice lists match Odoo's data and actions.

### P2.10 Form view
- [ ] P2.10.1 Layout renderer: sheet → card, groups → responsive 12-column grid, notebook → tabs
- [ ] P2.10.2 Header: statusbar stepper + primary/secondary action buttons
- [ ] P2.10.3 Smart buttons (`oe_button_box`) → stat chips
- [ ] P2.10.4 Title area (`oe_title`), avatar/image
- [ ] P2.10.5 Modifiers live: invisible / readonly / required re-evaluated on change
- [ ] P2.10.6 Edit-mode UX: always editable, save/discard bar when dirty, autosave on leave (configurable)
- [ ] P2.10.7 Record pager (prev/next within the list)
- [ ] P2.10.8 Chatter slot (drawer placeholder until P3.7)
- [ ] P2.10.9 User preferences = Odoo's own preferences form (`res.users` preferences view: language, timezone, signature, API keys, "log out from all devices") opened from the user menu through the generic form view (ex-P1.12.1)
- [ ] P2.10.10 Show onchange warnings from the engine (`onWarning`): `dialog` as a dialog, `notification` as a toast (ex-P2.6.3)
- [ ] P2.10.11 Palette quick commands (new invoice, new lead…) and recent items (ex-P2.8.10)
- [ ] P2.10.12 Breadcrumbs from the action stack in the URL (`encodeStack`/`decodeStack`): list → record → action from a button, restored on reload (ex-P2.8.8)

**Done when:** the sale order, partner, product and employee forms render and save correctly.

### P2.11 Kanban view
- [ ] P2.11.1 Card renderer from the kanban schema
- [ ] P2.11.2 Columns by `default_group_by`, fold/unfold, column counts and aggregates
- [ ] P2.11.3 Drag-and-drop between columns (write the group field) and within a column (resequence)
- [ ] P2.11.4 Quick create (simple form or `quick_create_view`)
- [ ] P2.11.5 Progress bars (`progressbar` attr)
- [ ] P2.11.6 Infinite load per column

**Done when:** the CRM pipeline works generically (before the bespoke version in P4).

### P2.12 Search
- [ ] P2.12.1 Search bar with facets (field search, filters, group-bys)
- [ ] P2.12.2 Filter groups (OR within a group, AND across groups), date filters (period options)
- [ ] P2.12.3 Custom filter builder (domain editor)
- [ ] P2.12.4 Custom group-by
- [ ] P2.12.5 Favourites: load/save/delete via `ir.filters`, default favourite, shared
- [ ] P2.12.6 Search panel (left sidebar categories/filters)
- [ ] P2.12.7 Search state in the URL

**Done when:** searching, grouping and favourites behave the same as in Odoo for 10 actions.

### P2.13 Core field widgets (with read/edit modes)
- [ ] P2.13.1 char, text, email, phone, url
- [ ] P2.13.2 integer, float, monetary (currency field, digits), percentage
- [ ] P2.13.3 boolean, boolean_toggle
- [ ] P2.13.4 selection, radio, badge, priority (stars)
- [ ] P2.13.5 date, datetime (tz-aware), daterange
- [ ] P2.13.6 many2one (search, create & edit, open record, `options` no_create/no_open)
- [ ] P2.13.7 many2many_tags (colours), many2many_checkboxes
- [ ] P2.13.8 one2many / many2many inline list (editable sub-list, dialog form)
- [ ] P2.13.9 html (rich text editor), binary (upload/download), image (preview, crop)
- [ ] P2.13.10 statusbar, handle, progressbar, color, statinfo, reference
- [~] P2.13.11 Fallback widget per field type for unknown `widget=` (logged for the scanner) *(read mode done: every type renders from metadata through the one formatter; edit mode with P2.13)*
- [x] P2.13.15 `useFormat()` React hook over `createFormatter()` (ex-P1.11.6): the user's language parameters (`/web/webclient/translations`), timezone and currencies from Odoo
- [ ] P2.13.16 Widget field dependencies (what each widget must also read: avatars → `write_date`, activities → `activity_*`, …), declared by each NOVI widget and merged into the spec; the client-spec capture lists the 122 Odoo needs today
- [ ] P2.13.14 Remaining primitives, built only when the first widget/view needs them: Select, Combobox, Checkbox, Radio, Switch, Textarea, DatePicker, Tabs, Drawer, Popover, Card, Table base (ex-P1.10.2)
- [ ] P2.13.13 Registry `manifest()` writes `tools/coverage-scanner/supported.json` automatically (ex-P1.17.7)
- [ ] P2.13.12 Widgets use the `FieldProps` contract and `registerField` registry from P1.17.4 (read + edit mode, all contexts)

**Done when:** every widget has stories, tests and works inside forms and lists.

### P2.14 Iframe fallback host
- [ ] P2.14.1 Embed Odoo's own action URL for unsupported client actions/views
- [ ] P2.14.2 Session sharing (same domain) / gateway-proxied frame (vault mode)
- [ ] P2.14.3 Clear "classic view" indicator and an "open in new tab" option

**Done when:** Discuss and a spreadsheet dashboard open inside the shell.

### P2.15 Access handling
- [ ] P2.15.1 Respect `create/edit/delete/duplicate` arch attrs and `groups` (already filtered by the server)
- [ ] P2.15.2 `check_access_rights` probes to hide create/edit buttons
- [ ] P2.15.3 Show AccessError gracefully (no crash, clear message)

**Done when:** a restricted user sees only what Odoo allows.

### P2.16 Parity harness & engine docs
- [ ] P2.16.1 Parity test: for 50 sampled actions, compare records, fields and buttons against Odoo for admin and a restricted user
- [ ] P2.16.2 Performance budget: list open < 1 s, form open < 800 ms (p75, staging)
- [ ] P2.16.4 Visual regression snapshots of Storybook (ex-P1.10.5)
- [ ] P2.16.3 Engine developer docs: how to write an override and a widget
- [ ] P2.16.5 Metadata cache (`get_views`, `load_menus`, translations) keyed by tenant + uid + lang + company + modules version, invalidated on module install/upgrade, only if P2.16.2 shows view loads missing the budget (ex-P1.9, P1.15.3)

**Done when:** the parity suite is green and the docs are published.

### Phase 2 Gate
- [ ] Figma kit (ex-P0.9.3) built on the tokens and design sign-off (ex-P0.9.6) done (D-20)
- [ ] Every act_window in the demo DB opens without crashing
- [ ] Parity tests pass on 50 sampled actions (admin + restricted)
- [ ] Coverage scanner shows List/Form/Kanban/Search supported

---

# Phase 3 — Breadth (≈ 6 weeks)

**Goal:** ≥ 90% of views render natively; files, reports, chatter and live updates work.

### P3.1 Calendar view
- [ ] P3.1.1 Month/week/day views, `date_start/date_stop/all_day` from the arch
- [ ] P3.1.2 Create by click/drag, move/resize to update dates
- [ ] P3.1.3 Colour by field, attendee filters sidebar
- [ ] P3.1.4 Quick create and popover

**Done when:** time off and CRM activities calendars work.

### P3.2 Pivot view
- [ ] P3.2.1 Row/column headers via `formatted_read_grouping_sets`
- [ ] P3.2.2 Expand/collapse, swap axes, multiple measures
- [ ] P3.2.3 Totals and comparison periods
- [ ] P3.2.4 Download xlsx; drill-down to list

**Done when:** sales and invoice analysis pivots match Odoo totals.

### P3.3 Graph view
- [ ] P3.3.1 Bar, line and pie charts (Recharts/ECharts) from `formatted_read_group`
- [ ] P3.3.2 Stacked, cumulative, measure switch, group-by switch
- [ ] P3.3.3 Click → filtered list

**Done when:** every graph view in the demo DB renders.

### P3.4 Activity view & activities
- [ ] P3.4.1 Activity matrix view (records × activity types)
- [ ] P3.4.2 Schedule, mark done, edit, cancel activities
- [ ] P3.4.3 "My activities" systray widget

**Done when:** a user can plan and complete activities on any record.

### P3.5 Export & import
- [ ] P3.5.1 Export dialog: field tree (`/web/export/get_fields`), templates, csv/xlsx
- [ ] P3.5.2 Import wizard via `base_import` RPC (upload, map columns, test, import)
- [ ] P3.5.3 Error report display for failed import rows

**Done when:** contacts can be exported and re-imported without data loss.

### P3.6 Reports & attachments
- [ ] P3.6.1 Print menu from the toolbar → `/report/download` (PDF), in-app PDF preview
- [ ] P3.6.2 Attachments panel: upload (drag-drop), list, preview, delete
- [ ] P3.6.3 Image/document preview (PDF, images)

**Done when:** printing an invoice and a quotation gives the same PDF as Odoo.

### P3.7 Chatter
- [ ] P3.7.1 `/mail/store` client: thread messages, followers, attachments, activities
- [ ] P3.7.2 Message list with author, date, tracking values (field changes)
- [ ] P3.7.3 Composer: log note vs send message, @mentions, attachments, full composer (templates)
- [ ] P3.7.4 Followers: add/remove, subscription types
- [ ] P3.7.5 Reactions, edit/delete own message, star
- [ ] P3.7.6 Layout: side drawer on desktop, tab on mobile

**Done when:** chatter on sale.order behaves like Odoo (post, log, follow, attach).

### P3.8 Realtime
- [ ] P3.8.1 Bus client: connect, subscribe, `last` id, reconnect with backoff, version check
- [ ] P3.8.2 Gateway websocket relay (vault mode)
- [ ] P3.8.3 Map bus notifications → query invalidation (record updates, new messages)
- [ ] P3.8.4 Presence and live chatter updates
- [ ] P3.8.5 Polling fallback via `/websocket/peek_notifications`

**Done when:** a change by user A appears for user B without a reload.

### P3.9 Notifications & mail UX
- [ ] P3.9.1 In-app notification inbox (mentions, assigned activities)
- [ ] P3.9.2 Browser push (optional, per user)

**Done when:** mentions show up in the inbox in real time.

### P3.10 Remaining widgets (from scanner backlog)
- [ ] P3.10.1 Rerun the scanner and rank the missing widgets by usage
- [ ] P3.10.2 Implement the top N until ≥ 90% coverage (add subtasks as P3.10.x)

**Done when:** the scanner reports ≥ 90%.

### P3.11 Settings screens
- [ ] P3.11.1 `res.config.settings` form (app sections, search within settings)
- [ ] P3.11.2 Users & companies management screens

**Done when:** an admin can change company settings and manage users in NOVI.

### P3.12 Mobile & accessibility pass
- [ ] P3.12.1 Mobile layouts for list (cards), form, kanban, search
- [ ] P3.12.2 Keyboard shortcuts map (save, new, discard, next/prev)
- [ ] P3.12.3 axe-core audit with no serious violations

**Done when:** core flows are usable on a phone and pass the axe audit.

### Phase 3 Gate
- [ ] Scanner ≥ 90% of views natively rendered
- [ ] Chatter, reports, attachments, export/import working
- [ ] Realtime updates verified across two browsers

---

# Phase 4 — Sales + CRM (≈ 5 weeks)

**Goal:** bespoke, best-in-class screens for the sales cycle.

### P4.1 CRM pipeline
- [ ] P4.1.1 Pipeline board: stage columns, expected revenue totals, win probability
- [ ] P4.1.2 Rich lead cards (customer, value, activity status, tags, owner)
- [ ] P4.1.3 Drag to stage, mark won/lost (lost reason wizard)
- [ ] P4.1.4 Filters: my pipeline, team, salesperson

**Done when:** sales users prefer it over the generic kanban (UAT feedback).

### P4.2 Lead / opportunity form
- [ ] P4.2.1 Redesigned layout (contact info, deal details, timeline)
- [ ] P4.2.2 Convert lead to opportunity, merge, create quotation

**Done when:** lead → opportunity → quotation works end to end.

### P4.3 Forecast & planning
- [ ] P4.3.1 Forecast by expected closing month
- [ ] P4.3.2 Activity planning view for sales reps

**Done when:** forecast totals match Odoo's forecast view.

### P4.4 Quotation editor
- [ ] P4.4.1 Lines editor: product search, quantity, UoM, price, discount, taxes, subtotal (keyboard-first)
- [ ] P4.4.2 Sections and notes, reordering
- [ ] P4.4.3 Optional products, pricelist and currency
- [ ] P4.4.4 Live totals panel (untaxed, taxes, total) driven by onchange

**Done when:** totals equal Odoo exactly on 20 test quotations.

### P4.5 Sales flows
- [ ] P4.5.1 Send by email (composer with template), preview the portal link
- [ ] P4.5.2 Confirm, cancel, set to quotation, create invoice wizard
- [ ] P4.5.3 Customer and product quick-create inline

**Done when:** the quote → send → confirm → invoice flow is complete.

### P4.6 Sales & CRM dashboards
- [ ] P4.6.1 KPIs: revenue, pipeline value, win rate, avg deal size, quotations to follow up
- [ ] P4.6.2 Charts: revenue by month, top customers, top products
- [ ] P4.6.3 Customisable widgets (prefs stored in the gateway)

**Done when:** KPI values match Odoo reporting for the same period.

### P4.7 Customers (contacts)
- [ ] P4.7.1 Customer 360 page: info, sales, invoices, open activities, chatter

**Done when:** the customer page shows the complete picture from Odoo data.

### P4.8 Testing & UAT
- [ ] P4.8.1 E2E: lead → opportunity → quotation → confirmed order → invoice
- [ ] P4.8.2 UAT with pilot sales users; record feedback as subtasks

**Done when:** UAT is signed off.

### Phase 4 Gate
- [ ] Odoo Enterprise hosting licence and per-tenant cost confirmed (ex-P0.12) before the pilot customer goes live (D-20)
- [ ] E2E green
- [ ] Pilot tenant UAT signed off

---

# Phase 5 — Accounting (≈ 7 weeks)

**Goal:** accountants can do their daily work, with figures identical to Odoo.

### P5.1 Invoice / bill editor
- [ ] P5.1.1 Customer invoice, vendor bill, credit note layouts
- [ ] P5.1.2 Lines with accounts, analytic distribution, taxes; journal items tab
- [ ] P5.1.3 Post, reset to draft, cancel, add credit note, send & print
- [ ] P5.1.4 Bill upload with PDF side-by-side (attachment preview)

**Done when:** invoice totals and journal entries are identical to Odoo.

### P5.2 Payments
- [ ] P5.2.1 Register payment wizard (full/partial, batch, write-off)
- [ ] P5.2.2 Payments list and form; outstanding credits widget (assign to invoice)

**Done when:** partial and full payments reconcile correctly.

### P5.3 Bank reconciliation
- [ ] P5.3.1 Bank statement lines list (per journal)
- [ ] P5.3.2 Matching UI: suggested matches, manual match, write-off, partner set
- [ ] P5.3.3 Reconciliation models applied
- [ ] P5.3.4 Bank statement import (via Odoo import RPC)

**Done when:** a month of demo statements can be reconciled entirely in NOVI.

### P5.4 Financial reports
- [ ] P5.4.1 Generic `account.report` renderer using its RPC methods (lines, unfold, options)
- [ ] P5.4.2 Balance sheet, P&L, cash flow, general ledger, trial balance, aged receivable/payable, tax report
- [ ] P5.4.3 Filters: dates, comparison, journals, analytic, multi-company
- [ ] P5.4.4 Export PDF/XLSX via Odoo's report export methods
- [ ] P5.4.5 Drill-down to journal items

**Done when:** every report's figures match Odoo to the cent.

### P5.5 Journal entries & chart of accounts
- [ ] P5.5.1 Journal entry editor (balanced lines check)
- [ ] P5.5.2 Chart of accounts, journals, taxes, fiscal positions screens (generic + polish)

**Done when:** manual journal entries post correctly.

### P5.6 Period closing & lock dates
- [ ] P5.6.1 Lock dates settings, tax return / closing flows (via Odoo actions)

**Done when:** lock dates are enforced and shown.

### P5.7 Accounting dashboard
- [ ] P5.7.1 Journal cards (bank balance, to reconcile, unpaid invoices, bills to pay)
- [ ] P5.7.2 KPIs: cash, receivables, payables, overdue, profit this month

**Done when:** dashboard numbers match Odoo's accounting dashboard.

### P5.8 Follow-ups
- [ ] P5.8.1 Customer statements and payment follow-up actions

**Done when:** a follow-up email/letter can be sent from NOVI.

### P5.9 Multi-currency & multi-company checks
- [ ] P5.9.1 Test invoices and payments in a foreign currency, exchange differences
- [ ] P5.9.2 Inter-company visibility respects company context

**Done when:** foreign-currency tests pass.

### P5.10 Testing & UAT
- [ ] P5.10.1 E2E: invoice → payment → bank reconcile → reports reflect it
- [ ] P5.10.2 Accountant UAT sign-off

**Done when:** UAT is signed off.

### Phase 5 Gate
- [ ] All financial reports match Odoo to the cent
- [ ] E2E green
- [ ] Accountant UAT signed off

---

# Phase 6 — Inventory + HR (≈ 6 weeks)

**Goal:** warehouse and HR teams can work fully in NOVI.

### P6.1 Transfers
- [ ] P6.1.1 Receipts / deliveries / internal transfers lists with state and readiness filters
- [ ] P6.1.2 Transfer form: operations lines, quantities, lots/serials, check availability, validate
- [ ] P6.1.3 Backorder wizard, return wizard
- [ ] P6.1.4 Barcode-friendly mode: scan input focus, big touch targets

**Done when:** receipt → stock → delivery works with lots/serials.

### P6.2 Products & stock
- [ ] P6.2.1 Product form polish (variants, UoM, routes, inventory tab)
- [ ] P6.2.2 Stock on hand, forecast and moves history
- [ ] P6.2.3 Inventory adjustments (physical count) flow

**Done when:** stock quantities match Odoo after adjustments.

### P6.3 Replenishment
- [ ] P6.3.1 Reordering rules list, replenishment report, order once / automate

**Done when:** replenishment creates the expected RFQs.

### P6.4 Inventory dashboard & reports
- [ ] P6.4.1 Operation-type cards (to process, late, waiting), stock valuation report

**Done when:** dashboard counts match Odoo.

### P6.5 Employees
- [ ] P6.5.1 Employee directory (cards, org chart)
- [ ] P6.5.2 Employee profile (work info, private info with access rules, documents)
- [ ] P6.5.3 Departments and job positions

**Done when:** HR officer and normal employee see the correct fields.

### P6.6 Time off
- [ ] P6.6.1 My time off: balances, request form, calendar
- [ ] P6.6.2 Manager approval inbox (approve/refuse/validate)
- [ ] P6.6.3 Allocations and accrual display

**Done when:** request → approve updates balances correctly.

### P6.7 Attendance
- [ ] P6.7.1 Check-in/check-out widget, kiosk-friendly mode
- [ ] P6.7.2 Attendance list and overtime display

**Done when:** check-in/out records appear in Odoo.

### P6.8 Expenses
- [ ] P6.8.1 Expense capture with receipt upload (mobile camera)
- [ ] P6.8.2 Expense reports: submit, approve, post, pay

**Done when:** expense → approval → accounting entry works.

### P6.9 HR dashboard
- [ ] P6.9.1 Headcount, absences today, pending approvals

**Done when:** numbers match Odoo.

### P6.10 Inventory ↔ Sales/Accounting links
- [ ] P6.10.1 Delivery status on sale orders, invoice from delivered quantities

**Done when:** a full order → delivery → invoice cycle works.

### P6.11 Testing & UAT
- [ ] P6.11.1 E2E: purchase receipt → stock → sale delivery
- [ ] P6.11.2 E2E: time-off request → approval; expense → payment
- [ ] P6.11.3 Warehouse and HR UAT sign-off

**Done when:** UAT is signed off.

### Phase 6 Gate
- [ ] E2E green
- [ ] Inventory and HR UAT signed off

---

# Phase 7 — SaaS hardening & GA (≈ 5 weeks)

**Goal:** production-ready, sellable, operable product.

### P7.1 Admin console (platform operators)
- [ ] P7.1.1 Tenant list/search, status, plan, resource usage
- [ ] P7.1.2 Tenant detail: logs link, provisioning history, retry, suspend, delete
- [ ] P7.1.3 Operator roles and audited actions

**Done when:** operators can manage all tenants without SSH-ing into servers.

### P7.2 Tenant self-service settings
- [ ] P7.2.1 Branding: logo, colours, favicon, email sender name
- [ ] P7.2.4 White-label Odoo's outgoing emails (password reset, invitations): Odoo's email layout still shows "Powered by Odoo"; change through stock mail-template/layout records per tenant, no add-on (found in P1.6.5)
- [ ] P7.2.2 Custom domain with automatic TLS (DNS verification)
- [ ] P7.2.3 App selection within plan limits; user seat management

**Done when:** a tenant can white-label their instance on a custom domain.

### P7.3 Billing & plans
- [ ] P7.3.1 Plans (apps, seats, resources), trial length
- [ ] P7.3.2 Payment provider integration (Stripe / M-Pesa / Paystack) and invoices
- [ ] P7.3.3 Trial expiry → reminder emails → suspend
- [ ] P7.3.4 Upgrade/downgrade → provisioner jobs (apps, resources)

**Done when:** a trial converts to paid and a non-payment suspends automatically.

### P7.4 Tenant lifecycle
- [ ] P7.4.1 Suspend/resume (stop containers, friendly suspended page)
- [ ] P7.4.2 Scheduled backups: per-DB `pg_dump` + filestore snapshot, retention policy, offsite copy
- [ ] P7.4.3 Restore to the same tenant or a new one; restore drill documented
- [ ] P7.4.4 Delete: grace period, GDPR data export, full resource removal
- [ ] P7.4.5 Odoo upgrade waves (canary tenants → all), with a rollback plan
- [ ] P7.4.6 Shared-instance density tier for trials (dbfilter by hostname), migration between tiers

**Done when:** backup → restore and delete have been tested end to end.

### P7.5 Feature flags
- [ ] P7.5.1 Flags per tenant/plan/user (e.g. native vs iframe for a screen)

**Done when:** a screen can be switched per tenant without a deploy.

### P7.6 Observability
- [ ] P7.6.1 OpenTelemetry traces: browser → gateway → Odoo call timings
- [ ] P7.6.2 Metrics dashboards: latency, error rate, provisioning time, active tenants
- [ ] P7.6.3 Alerts: failed provisioning, tenant down, error spikes, backup failures
- [ ] P7.6.4 Front-end error tracking (Sentry or similar)

**Done when:** on-call can see and get alerts on all critical paths.

### P7.7 Performance & load
- [ ] P7.7.1 Load test: N tenants × M users; gateway p95 overhead < 150 ms
- [ ] P7.7.2 Front-end budgets: bundle size, LCP < 2.5 s, code-splitting per app
- [ ] P7.7.3 Capacity plan per tier (nodes, DB sizing)

**Done when:** load targets are met and the capacity plan is recorded.

### P7.8 Security
- [ ] P7.8.1 Threat model (gateway, vault, provisioner, tenant isolation)
- [ ] P7.8.2 Security headers, CSP, CSRF on gateway endpoints, cookie flags
- [ ] P7.8.3 Secrets rotation (vault keys, DB passwords)
- [ ] P7.8.4 External penetration test and fixing every high/critical finding
- [ ] P7.8.5 Dependency and container image scanning in CI

**Done when:** the pentest report has no open high/critical issues.

### P7.9 Compliance & legal
- [ ] P7.9.1 Terms of service, privacy policy, DPA
- [ ] P7.9.2 Data residency options documented
- [ ] P7.9.3 Odoo licensing compliance confirmed for production

**Done when:** legal sign-off is received.

### P7.10 Accessibility & i18n
- [ ] P7.10.1 WCAG 2.1 AA audit and fixes
- [ ] P7.10.2 Translations for NOVI's own strings (en, fr, sw at minimum), RTL check

**Done when:** the audit passes and the languages ship.

### P7.11 Documentation
- [ ] P7.11.1 User guide per app
- [ ] P7.11.2 Admin/tenant guide (branding, users, domains)
- [ ] P7.11.3 Operator runbooks (provisioning, backup/restore, upgrades, incidents)
- [ ] P7.11.4 Developer docs (engine, widgets, overrides, packages)

**Done when:** docs are published.

### P7.12 Support & onboarding
- [ ] P7.12.1 In-app onboarding tour, sample data option for trials
- [ ] P7.12.2 Support channel / help widget, status page

**Done when:** a new user can get started without help.

### P7.13 Release engineering
- [ ] P7.13.1 Semantic versioning and release notes from the CHANGELOG
- [ ] P7.13.2 Staging → production promotion, blue/green or canary deploy for the platform

**Done when:** a release can be promoted and rolled back with one command.

### P7.14 GA readiness review
- [ ] P7.14.1 Go/no-go checklist review with stakeholders
- [ ] P7.14.2 Launch plan (marketing site, pricing page, sign-up open)

**Done when:** GA is approved.

### Phase 7 Gate — GA
- [ ] Billing, lifecycle, backups/restore verified
- [ ] Observability and alerts live
- [ ] Pentest clean, legal sign-off
- [ ] Docs published
- [ ] GA approved
