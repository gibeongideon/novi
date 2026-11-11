# NOVI

A metadata-driven React + TypeScript frontend and SaaS platform for an **unmodified Odoo 20** backend.

- **Plan / architecture:** [PLAN.md](PLAN.md)
- **What's next:** [ROADMAP.md](ROADMAP.md) · **all tasks:** [TASKS.md](TASKS.md)
- **History:** [CHANGELOG.md](CHANGELOG.md) · **decisions:** [DECISIONS.md](DECISIONS.md)
- **Staging deploy:** [DEPLOYMENT.md](DEPLOYMENT.md)
- **Live progress dashboard:** https://novi.dafeapp.com (password protected)

## Prerequisites

- Node ≥ 20.11 (`nvm use`) and pnpm 9 (`corepack enable pnpm`)
- Docker with Compose v2 (local Odoo 20)
- The Odoo tarball `odoo_20.0+e.*.tar.gz` in the repo root (never committed)

## Quick start

```bash
pnpm install
pnpm build && pnpm test          # all packages

pnpm odoo:build                  # build stock Odoo 20 image from the tarball (~10 min, once)
pnpm odoo:up                     # Postgres + Odoo + Mailpit
pnpm odoo:seed                   # create novi_demo with pilot apps, demo data and test users
pnpm test:contract               # API contract suite against local Odoo
pnpm scan                        # coverage report → docs/coverage/

pnpm --filter @novi/web dev      # web app skeleton
```

Local services: Odoo http://localhost:18069 (admin / admin) · Mailpit http://localhost:8025

`pnpm odoo:seed` writes the test users, the 2FA user's TOTP secret and an **admin API key** to `.cache/dev-credentials.json` (git-ignored). To create an API key by hand for JSON-2 testing: log in to Odoo → avatar → **My Profile** → **Account Security** → **New API Key** (scope: RPC). Then call `POST /json/2/<model>/<method>` with `Authorization: bearer <key>` and `X-Odoo-Database: novi_demo`.

## Layout

| Path | What |
|---|---|
| `packages/odoo-client` | Talking to Odoo: JSON-RPC (session) and JSON-2 (bearer) transports, typed errors |
| `packages/odoo-expr` · `odoo-meta` · `engine` | Expression evaluator, arch → ViewSchema, headless runtime |
| `packages/ui` · `fields` · `views` · `chatter` · `realtime` · `shell` | Design system and UI building blocks |
| `packages/apps/*` | Bespoke screens per app (sales, crm, accounting, inventory, hr) |
| `apps/web` · `apps/admin` | Customer SPA and platform admin console |
| `services/gateway` · `services/provisioner` | BFF and tenant lifecycle worker |
| `tools/*` | Contract tests, coverage scanner, progress dashboard, spikes |
| `infra/` | Odoo image, local compose, server setup |

## Rules

Odoo is never modified and no Odoo add-on is installed (D-01). Work follows [TASKS.md](TASKS.md) in order, and commits start with a task ID (`P0.4.2: …`). See [CLAUDE.md](CLAUDE.md).
