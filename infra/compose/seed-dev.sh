#!/usr/bin/env bash
# Creates the novi_demo database (pilot apps + demo data) and test users, using stock Odoo only.
# Writes credentials to .cache/dev-credentials.json (git-ignored) for contract tests and spikes.
set -euo pipefail
cd "$(dirname "$0")"
ROOT="$(cd ../.. && pwd)"
DC="docker compose -f docker-compose.dev.yml"
DB=novi_demo
MODULES="${NOVI_MODULES:-sale_management,crm,account_accountant,stock,hr,hr_holidays,hr_attendance,hr_expense,auth_totp,api_doc}"
ODOO="python3 /opt/odoo/setup/odoo --config=/etc/odoo/odoo.conf"

$DC up -d db mailpit
if $DC exec -T db psql -U odoo -d postgres -tAc "select 1 from pg_database where datname='$DB'" | grep -q 1; then
  echo "==> $DB already exists (use pnpm odoo:reset to start over)"
else
  echo "==> creating $DB with: $MODULES  (takes several minutes)"
  $DC run --rm --no-deps --entrypoint "" odoo $ODOO -d "$DB" -i "$MODULES" --with-demo --stop-after-init
fi

$DC up -d odoo
echo "==> seeding users"
OUT=$($DC exec -T odoo $ODOO shell -d "$DB" --no-http < seed_users.py 2>/dev/null | grep '^NOVI_SEED_JSON=' | tail -1)
[ -n "$OUT" ] || { echo "seeding failed (run: pnpm odoo:logs)" >&2; exit 1; }
mkdir -p "$ROOT/.cache"
echo "${OUT#NOVI_SEED_JSON=}" > "$ROOT/.cache/dev-credentials.json"
chmod 600 "$ROOT/.cache/dev-credentials.json"
echo "==> done. Odoo: http://localhost:8069 (admin/admin) · credentials: .cache/dev-credentials.json"
