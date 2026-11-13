#!/usr/bin/env bash
# Production-like local run: build the web app and serve it from the gateway (no Vite), per tenant.
#   pnpm serve           → http://localhost:8080 (demo Odoo), http://<tenant>.localhost:8080 (each tenant)
# Tenants are created with infra/provisioning/tenant.sh (they register themselves with the gateway).
set -euo pipefail
cd "$(dirname "$0")/.."
pnpm -s turbo run build --filter=@novi/web... --filter=@novi/gateway... >/dev/null
echo "NOVI (production build) on http://localhost:${PORT:-8080}; tenants: http://<slug>.localhost:${PORT:-8080}"
pnpm exec tsx services/gateway/src/tenants/cli.ts list || true
# production mode needs the sign-up secret explicitly; locally it is the generated dev key
key=.cache/platform/secret
[ -f "$key" ] || { mkdir -p "$(dirname "$key")"; (umask 077; openssl rand -base64 32 > "$key"); }
export PLATFORM_SECRET="${PLATFORM_SECRET:-$(cat "$key")}"
# the provisioner turns confirmed sign-ups into workspaces (P1.4); it stops with this script
pnpm exec tsx services/provisioner/src/worker.ts &
trap 'kill $! 2>/dev/null' EXIT
PORT="${PORT:-8080}" WEB_DIST="$PWD/apps/web/dist" NODE_ENV=production node services/gateway/dist/index.js
