#!/usr/bin/env bash
# Production-like local run: build the web app and serve it from the gateway (no Vite), per tenant.
#   pnpm serve           → http://localhost:8080 (demo Odoo), http://<tenant>.localhost:8080 (each tenant)
# Tenants are created with tools/spikes/provision-tenant.sh (they register themselves with the gateway).
set -euo pipefail
cd "$(dirname "$0")/.."
pnpm -s turbo run build --filter=@novi/web... --filter=@novi/gateway >/dev/null
echo "NOVI (production build) on http://localhost:${PORT:-8080}; tenants: http://<slug>.localhost:${PORT:-8080}"
pnpm exec tsx services/gateway/src/tenants/cli.ts list || true
PORT="${PORT:-8080}" WEB_DIST="$PWD/apps/web/dist" NODE_ENV=production exec node services/gateway/dist/index.js
