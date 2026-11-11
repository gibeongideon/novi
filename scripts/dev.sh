#!/usr/bin/env bash
# One command to see everything locally, with live reload:
#   web app   http://localhost:5173   (Vite HMR, Odoo proxied on the same origin)
#   storybook http://localhost:6006   (UI components, light/dark, a11y checks)
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
cat <<'MSG'

  NOVI dev servers (keep this terminal open; Ctrl+C stops them)
    web app    http://localhost:5173
    storybook  http://localhost:6006   (ready ~15 s after start)
    progress   http://localhost:4321
    odoo       http://localhost:18069  (admin / admin)

MSG
exec pnpm exec turbo run dev --parallel --filter=@novi/web --filter=@novi/ui --filter=@novi/progress-dashboard "$@"
