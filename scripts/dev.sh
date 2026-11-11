#!/usr/bin/env bash
# One command to see everything locally, with live reload:
#   web app   http://localhost:5173   (Vite HMR, Odoo proxied on the same origin)
#   progress  http://localhost:4321   (rebuilds when TASKS/ROADMAP/CHANGELOG change)
#   Odoo      http://localhost:18069  (admin / admin)
set -euo pipefail
cd "$(dirname "$0")/.."
if docker image inspect "${ODOO_IMAGE:-novi/odoo20:stock}" >/dev/null 2>&1; then
  docker compose -f infra/compose/docker-compose.dev.yml up -d --wait db mailpit odoo >/dev/null && echo "[odoo] http://localhost:18069"
  [ -f .cache/dev-credentials.json ] || bash infra/compose/seed-dev.sh
else
  echo "[odoo] image missing (pnpm odoo:build); starting without Odoo"
fi
exec pnpm exec turbo run dev --parallel --filter=@novi/web --filter=@novi/progress-dashboard "$@"
