# Plan: "NOVI" — a metadata-driven React frontend for an unmodified Odoo 20 backend

## Context

The goal is to replace Odoo 20's OWL web client with a modern SaaS-style UI while reusing **only Odoo's logic**: Python business code, ORM, access rights, record rules, workflows, reports and PostgreSQL. **Odoo's files are never edited and no Odoo add-on is installed.**

The product will be sold as a **white-label, multi-tenant SaaS**. **When a customer signs up, the platform automatically creates a new tenant: its own Odoo 20 instance (a stock container) with its own separate PostgreSQL database and filestore.** No data is shared between tenants (see §2b). Customers who already run Odoo 20 can instead connect their existing instance ("bring your own Odoo").

It must support two deployment modes:

- **Same domain:** the UI runs behind a reverse proxy on the same domain as Odoo.
- **Separate domain:** the UI and the gateway run on our own domain.

The pilot release covers:

- the generic engine,
- Sales and CRM,
- Accounting,
- Inventory and HR.

The workspace currently contains only `odoo_20.0+e.20261111.tar.gz`, which is used as the reference for the API. We do not hand-code every screen. The core is a **frontend engine** that reads Odoo's own metadata (views, fields, actions, menus, access) and renders a newly designed UI from it. That way every installed Odoo app works on day one, and only high-value screens get bespoke designs.

## 1. What we reuse from Odoo (verified in the 20.0 source)

| Need | Odoo 20 endpoint / method (stock) |
|---|---|
| Login / session | `/web/session/authenticate`, `/web/session/get_session_info`, `/web/session/destroy` (cookie `session_id`). With 2FA, `authenticate` returns `uid: null`, and the TOTP step is the HTML form at `/web/login/totp`. |
| Generic ORM calls | `/web/dataset/call_kw/<model>/<method>` (JSON-RPC envelope) and `/web/dataset/call_button` |
| Token/stateless API | `POST /json/2/<model>/<method>` with `Authorization: bearer <apikey>` and the `X-Odoo-Database` header (`addons/rpc/controllers/json2.py`). `/jsonrpc` and `/xmlrpc` are deprecated and will be removed in Odoo 22, so we don't use them. |
| Views + field metadata | `get_views(views, options)` returns the XML arch plus `models.fields` (`base/models/ir_ui_view.py`); also `fields_get` and `/web/model/get_definitions` |
| Read / write | `web_search_read(domain, specification, …)`, `web_read`, `web_save(vals, specification)`, `web_save_multi`, `web_unlink`, `web_resequence` (`web/models/models.py`) |
| Grouping / pivot | `web_read_group(domain, groupby, aggregates, …)`, `formatted_read_group`, `formatted_read_grouping_sets` |
| Onchange / defaults | `onchange(values, field_names, fields_spec)` returns `{value, warning}`; pass `field_names=[]` to get defaults |
| Relational search | `web_name_search(name, specification, domain, …)` |
| Navigation | `/web/webclient/load_menus`, `/web/action/load`, `/web/action/run`, `/web/action/load_breadcrumbs` |
| i18n | `/web/webclient/translations` |
| Files | `/web/image/...`, `/web/content/...`, `/web/binary/upload_attachment`, `/report/download`, `/report/<converter>/<name>/<ids>` |
| Export | `/web/export/get_fields`, `/web/export/csv`, `/web/export/xlsx` |
| Chatter | `/mail/store` (thread data), `/mail/message/post`, `/mail/message/update_content`, `/mail/message/reaction`, `/mail/thread/subscribe`, `/mail/attachment/upload` |
| Real-time | `/websocket?version=…` (`{event_name:"subscribe", data:{channels,last}}`); fallback `/websocket/peek_notifications` |
| Introspection (dev tooling) | `api_doc`: `/doc-bearer/index.json`, `/doc-bearer/<model>.json` |

**Constraint that shapes the architecture:** bearer/API-key auth works only on `/json/2`. The chatter, websocket, reports, menus routes and `/web/dataset/*` all need the **`session_id` cookie**. A browser on another domain can't hold that cookie reliably, so the separate-domain mode needs a gateway that holds the Odoo session on the server side.

## 2. Architecture

```
 Browser (React SPA, white-labelled per tenant)
        │  HTTPS (our JWT cookie)  + WSS
        ▼
 NOVI Gateway (BFF, Node/TS, multi-tenant)        ← our code, our DB
   • tenant registry, branding, feature flags
   • auth bridge (login, 2FA relay, SSO)
   • Odoo session vault (session_id per user, encrypted)
   • RPC proxy + allow-list + rate limits + audit
   • metadata cache (get_views / menus, keyed by tenant+uid+lang+version)
   • websocket relay (Odoo bus ⇄ client)
   • UI-prefs store (dashboards, layouts, saved columns)
        │  JSON-RPC (/web/*, /mail/*, /websocket) using the Odoo session cookie
        ▼
 Odoo 20 (UNMODIFIED)  →  PostgreSQL
```

- **Mode A (same domain):** the gateway runs as a sidecar on the same domain, e.g. `/api/*`. In this mode it can also pass the browser's own Odoo `session_id` through unchanged.
- **Mode B (separate domain):** the gateway keeps the Odoo session in its vault and the browser holds only our cookie.
- **Same code in both modes.** One config flag (`sessionStrategy: passthrough | vault`) selects the mode.
- **Our own data stays out of Odoo.** Dashboards, column layouts, tenant branding and similar live in the gateway's own Postgres (or Redis for cache), so the "zero install" rule holds.
- **Odoo's own features stay in Odoo.** Favourite filters stay in Odoo's `ir.filters` and activities stay in `mail.activity`, so users see the same data in both UIs.

## 2b. Tenant provisioning (self-service sign-up → own instance + own DB)

```
 Sign-up page ──▶ Gateway /signup ──▶ Provisioner (job queue) ──▶ Docker host (Compose)
                                         │                          • Own compose project: stock Odoo 20 image
                                         │                          • Own database  (tenant_<id>) on PG cluster
                                         │                          • Own filestore volume
                                         ▼                          • Own Odoo config: dbfilter=^tenant_<id>$,
                                  Tenant registry (gateway DB)        list_db=False, admin_passwd random
```

**Sign-up flow** (idempotent and resumable; each step is recorded so it can be retried or rolled back):

1. Validate the account (email verification, plan or trial), then create the tenant record with status `provisioning`.
2. Create the database `tenant_<id>`. On the shared PostgreSQL cluster it gets its own DB role. Premium plans can get a dedicated PostgreSQL instance.
3. Deploy the tenant's Odoo instance: the same stock Odoo 20 image with a per-tenant `odoo.conf` and filestore volume. Initialise it with the Odoo CLI (`odoo -d tenant_<id> -i base,<plan modules> --without-demo`, plus language, country and company). **We don't use `/web/database/create`**: the database manager stays disabled.
4. Bootstrap the customer's admin user with ORM calls through stock endpoints (name, login, password, company details), then store the encrypted service credentials in the vault.
5. Register the tenant URL in the gateway (`<slug>.novi.app` or a custom domain), apply the default branding, and set the status to `active`.
6. Send a welcome email and auto-login link.

**Lifecycle operations** handled by the provisioner:
- install or uninstall apps when the plan changes (module install via standard `button_immediate_install` RPC)
- suspend or resume (stop the tenant containers)
- backups (per-DB `pg_dump` + filestore snapshot) and restore
- Odoo version upgrades, applied per tenant in waves
- delete with a GDPR export

**Optional density tier:** for cheap or free trials, several tenant databases can share one Odoo deployment through `dbfilter` by hostname, while each tenant still has its own database. Paid tiers get a dedicated instance. The tier is a field on the tenant, so moving between tiers is a provisioner operation.

## 3. Repository and packages (pnpm + Turborepo monorepo)

```
novi/
  packages/
    odoo-client/     transport: JsonRpcTransport (call_kw), Json2Transport (bearer), typed errors,
                     batching, retries, AbortSignal; Odoo version detection (/web/version)
    odoo-expr/       Python-expression & domain evaluator (invisible/readonly/required/
                     column_invisible, domain & context strings), domain builder/serializer
    odoo-meta/       arch XML → normalized ViewSchema (form/list/kanban/search/calendar/
                     pivot/graph/activity), field-spec builder for web_read/web_search_read
    engine/          headless runtime (no UI): Record/RecordList/DynamicGroupList models,
                     dirty tracking, x2many command builder, onchange loop, web_save,
                     button execution → action results, ActionManager, router/breadcrumbs,
                     access (check_access_rights, `create/edit/delete` arch attrs), i18n, formatters
    ui/              design system: Tailwind tokens + shadcn/ui primitives, themeable (tenant tokens)
    fields/          widget registry: char, text, html, int/float/monetary, date/datetime, boolean,
                     selection, many2one, many2many_tags, one2many (inline list), binary/image,
                     priority, statusbar, badge, handle, progressbar, phone/email/url, …
                     + fallback widget per field type
    views/           List (TanStack Table: virtual scroll, inline edit, group/aggregate, bulk),
                     Form (sheet/notebook/group layout → responsive grid), Kanban (dnd-kit,
                     quick create, progress bars), Calendar, Pivot, Graph, Activity, Search
                     (facets, filters, group-by, favorites via ir.filters, search panel)
    chatter/         /mail/store client, composer, followers, activities, attachments
    realtime/        bus client (subscribe, reconnect, last-id), TanStack Query invalidation
    shell/           app launcher, sidebar from load_menus, command palette (⌘K), breadcrumbs,
                     notifications, company switcher, user menu, iframe fallback host
    apps/            bespoke "override" screens registered by model/view/action:
      sales/ crm/ accounting/ inventory/ hr/  (dashboards, pipeline, invoice editor …)
  services/
    gateway/         Fastify BFF (section 2), tenant admin API, /signup
    provisioner/     tenant lifecycle worker (BullMQ jobs → Docker Engine API / compose + PostgreSQL admin):
                     create / install-apps / suspend / backup / restore / upgrade / delete
  infra/
    compose/         platform stack (web, gateway, provisioner) + odoo-tenant template (one compose project per tenant)
    images/          stock Odoo 20 image build (from tarball, no code changes)
  apps/
    web/             Vite SPA that composes packages + tenant theme
    admin/           tenant onboarding console (connect Odoo, branding, enabled apps)
  tools/
    coverage-scanner/  walks every action/view in a tenant DB and reports unsupported
                       widgets/client actions → drives backlog
    contract-tests/    API contract suite against stock Odoo 20 (docker)
```

Each package is versioned and published to a private npm registry with changesets, so the engine can be reused by other products such as a mobile shell. Deployment is a Docker image for `web` (static) plus an image for `gateway`, deployed with Docker Compose (no Kubernetes until scale requires it, D-13).

**State and data:**

- TanStack Query holds the server state. Its keys are `tenant/model/ids/spec/context`.
- Zustand holds the UI state: shell, breadcrumbs, open dialogs and form draft state inside `engine`.
- Real-time bus messages invalidate the related queries.

## 4. How the engine renders any Odoo screen ("unpacking Odoo style")

1. **Route to action.** The route looks like `/:tenant/action/:actionId?view=list&id=…`. `ActionManager` calls `/web/action/load` and gets back an `ir.actions.act_window` with `res_model`, `views`, `domain`, `context` and `search_view_id`.
2. **Load views.** It calls `get_views(views, {load_filters, toolbar, action_id})`. `odoo-meta` parses the XML arch into a **ViewSchema** (a plain JSON tree with resolved field metadata and modifiers compiled by `odoo-expr`).
3. **Read data.** It builds the `specification` from the schema (only the visible fields, plus nested specs for relational fields), then calls `web_search_read` or `web_read`.
4. **Render.** Our layout system renders the schema. Odoo's `<sheet>/<group>/<notebook>` become a 12-column responsive grid, tabs and cards. Header buttons become a primary/secondary action bar. `statusbar` becomes a stepper. The chatter goes into a side drawer. The renderer only cares about the meaning of the schema, not Odoo's DOM or CSS.
5. **Edit.** A field change sends `onchange(values, [field], spec)`, which applies the values and shows any warnings. Saving sends `web_save(vals, spec)` with x2many commands. Buttons go through `call_button` or `/web/action/run`, and the returned action is fed back into the ActionManager (wizards open as dialogs, reports go to `/report/download`).
6. **Overrides.** The registry is checked in this order, and the first match wins:
   1. `apps/*` override for `(model, viewType, actionXmlId)`
   2. field widget override
   3. generic renderer
   4. **iframe fallback** for unsupported OWL client actions (Discuss, Spreadsheet, POS, …) that loads Odoo's own `/odoo/action-…`. This keeps 100% of features reachable from day one while native versions are built.
7. **Access.** We don't re-implement access rules. We respect the view's `create/edit/delete` attrs and `groups` (already filtered server side by `get_views`) and the `check_access_rights` probes, and Odoo still enforces everything on every call. If Odoo raises an `AccessError` or `UserError`, we show it as a toast or dialog.

## 5. Delivery phases (strictly sequential, one squad ≈ 4 FE + 1 BE/platform + 1 designer + 1 QA)

The task breakdown and live status are in **ROADMAP.md**. Each phase starts only when the previous phase's exit criteria are met.

| Phase | Weeks | Deliverables | Exit criteria |
|---|---|---|---|
| **0. Foundations** | 1–3 | Monorepo, CI, design tokens and Figma kit, Odoo 20 + demo-data docker, `odoo-client` (both transports), contract tests, `coverage-scanner` v1, 2FA spike | Contract suite green; scanner report on demo DB |
| **1. Gateway, provisioning and shell** | 4–9 | Tenant registry, **sign-up → own Odoo instance + own DB provisioner**, login (password, 2FA relay, SSO), session vault, RPC proxy, menus, app launcher, ⌘K, breadcrumbs, company switch, translations | A new sign-up gets a working isolated instance in < 5 min; log in in both modes and browse menus |
| **2. Engine core** | 10–17 | `odoo-expr`, `odoo-meta`, Record model, onchange and save, ActionManager, List / Form / Kanban / Search views, ~25 core widgets, iframe fallback | Any act_window in demo DB opens, edits and saves; parity tests pass on 50 sampled actions |
| **3. Breadth** | 18–23 | Calendar, Pivot, Graph, Activity views, export, import, reports and attachments, chatter, realtime bus | Scanner reports ≥ 90% of views natively rendered |
| **4. Sales + CRM** | 24–28 | CRM pipeline, quotation editor, Sales dashboard | UAT sign-off with pilot tenant |
| **5. Accounting** | 29–35 | Invoice/bill editor, payment wizard, bank reconciliation, financial reports, Accounting dashboard | Accountant UAT; totals match Odoo to the cent |
| **6. Inventory + HR** | 36–41 | Transfers, products and stock, replenishment; employees, time off, attendance, expenses | UAT sign-off |
| **7. SaaS hardening & GA** | 42–46 | Admin console, billing/plans, tenant lifecycle (suspend, backup/restore, upgrade waves, delete), custom domains, observability, load tests, pentest, docs | GA checklist |

## 6. Key risks and mitigations

- **Feature surface is huge.** Use generic rendering plus the iframe fallback, and let the coverage scanner drive the backlog, so the product is never "missing" a screen.
- **Python expressions in arch** (`invisible="state != 'draft'"`, domains, contexts). Build a dedicated `odoo-expr` package, test it against expressions harvested from all views in Odoo 20.
- **2FA / SSO with zero install.** The gateway relays Odoo's `/web/login` → `/web/login/totp` form flow on the server side and fetches the CSRF token from the page. If that fails, it redirects to Odoo's login page and passes the session back. Spike this in phase 1, week 1.
- **Odoo upgrades (21+).** Isolate the transport and metadata parsing behind `odoo-client` and `odoo-meta` adapters, version-detect with `/web/version`, and run contract tests per version. Move off `/web/dataset/call_kw` to `/json/2` only where cookie routes are not needed.
- **Enterprise client actions** (accounting reports, reconciliation, spreadsheets). Rebuild them natively in priority order, using the iframe fallback until then.
- **Security of the session vault.** Encrypt at rest, scope sessions per tenant and user, use short-lived JWTs, and keep an audit log. The gateway never widens permissions, because Odoo checks every call.
- **Licensing.** Odoo Enterprise UI code is proprietary, so we write all UI code from scratch and copy no OWL/SCSS assets. We only call HTTP APIs. **Hosting Enterprise instances for customers needs a valid Odoo Enterprise subscription per tenant database and a hosting/partner agreement with Odoo S.A.** Confirm this with Odoo before GA, or offer Community-only plans.
- **Cost and density of one instance per tenant.** Each Odoo container needs roughly 0.5–1 GB RAM. Mitigations: scale idle trial tenants to zero, the shared-instance density tier for trials, and per-plan resource limits.
- **Provisioning failures.** Each provisioner step is idempotent with compensation (rollback). Tenants stuck in `provisioning` raise an alert, and a retry is available from the admin console.
- **Tenant isolation.** Each tenant has its own DB role (no cross-DB access), a separate docker network per tenant, `list_db=False`, a strict `dbfilter`, and the database manager disabled.

## 7. Verification

- **Contract tests** (`tools/contract-tests`, Vitest) against dockerised stock Odoo 20 (from the tarball) with demo data. They cover every endpoint in section 1, both auth modes and the error shapes.
- **Engine unit tests:** arch → ViewSchema snapshots for all views in the demo DB; `odoo-expr` evaluates the same results as Odoo for the harvested expressions.
- **Parity tests:** for N sampled actions, compare the records, visible fields and button sets the engine produces with what `web_search_read` / `get_views` return for the same user. Run them as admin and as a restricted user to prove access rules hold.
- **Provisioning tests:** sign up two tenants in staging and confirm each gets its own containers, DB and filestore. Check that tenant A's session can't read tenant B's data, that deleting a tenant removes all of its resources, and that a backup restores to an identical state.
- **E2E** (Playwright) for business flows: lead → quote → confirm → deliver → invoice → pay → reconcile; time-off request → approve.
- **Coverage scanner** after each sprint, tracking the "% natively rendered" KPI.
- **Pilot tenant UAT** per phase. Watch gateway latency (p95 < 150 ms overhead) and use Lighthouse/a11y (WCAG 2.1 AA) checks.

## 8. First concrete steps after approval

1. Set up the monorepo skeleton and `docker-compose` running Odoo 20 from `odoo_20.0+e.20261111.tar.gz` with demo data.
2. Build `odoo-client` and contract tests for authenticate, call_kw, get_views, web_search_read and json2.
3. Run spikes: the 2FA relay through the gateway, and parsing one complex form (`sale.order`) into a ViewSchema and rendering it.
4. Agree on the design system: tokens, layout grammar and Figma components for list, form and kanban.
