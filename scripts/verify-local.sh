#!/usr/bin/env bash
# Full local verification, including the LIVE Odoo 20 contract suite (D-21: no Odoo in CI until MVP).
#   pnpm verify            # starts/seeds local Odoo if needed, then lint, typecheck, unit + contract tests, build
#   pnpm verify --no-odoo  # skip the live part (same as CI)
set -euo pipefail
cd "$(dirname "$0")/.."
LIVE=true; [ "${1:-}" = "--no-odoo" ] && LIVE=false
URL="${ODOO_URL:-http://127.0.0.1:18069}"
step() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }

if $LIVE; then
  step "Local Odoo 20"
  docker image inspect "${ODOO_IMAGE:-novi/odoo20:stock}" >/dev/null 2>&1 ||
    { echo "Odoo image missing: run pnpm odoo:build (needs the tarball in the repo root)"; exit 1; }
  docker compose -f infra/compose/docker-compose.dev.yml up -d --wait db mailpit odoo >/dev/null
  for _ in $(seq 1 60); do curl --noproxy '*' -fsS "$URL/web/health" >/dev/null 2>&1 && break; sleep 2; done
  curl --noproxy '*' -fsS "$URL/web/health" >/dev/null || { echo "Odoo not healthy at $URL (pnpm odoo:logs)"; exit 1; }
  [ -f .cache/dev-credentials.json ] || bash infra/compose/seed-dev.sh
  echo "Odoo up at $URL"
fi

step "Lint";       pnpm -s lint
step "Typecheck";  pnpm -s typecheck
step "Format";     pnpm -s format:check
step "Licences";   node scripts/check-licenses.mjs
if $LIVE; then
  step "Unit + live contract tests"; CONTRACT_REQUIRED=1 pnpm -s test
else
  step "Unit tests"; pnpm -s test
fi
step "Build";      pnpm -s build
printf '\n\033[32m✔ verify passed%s\033[0m\n' "$($LIVE && echo " (including live Odoo contract tests)")"
