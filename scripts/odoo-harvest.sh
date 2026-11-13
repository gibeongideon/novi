#!/usr/bin/env bash
# Run a harvest script in the dev Odoo's shell and keep its JSON in .cache (never committed:
# the output is derived from Odoo). Skips the run when the dev database's views and modules are
# unchanged since the last harvest (fingerprint), so `pnpm verify` stays fast.
#   scripts/odoo-harvest.sh <harvest.py> <name>   → .cache/<name>.json   (FORCE=1 to always run)
set -euo pipefail
cd "$(dirname "$0")/.."
SCRIPT="$1"; OUT=".cache/$2.json"; STAMP=".cache/$2.stamp"
CT="${ODOO_CONTAINER:-novi-dev-odoo-1}"; DB="${ODOO_DB:-novi_demo}"; PG="${PG_CONTAINER:-novi-dev-db-1}"
mkdir -p .cache
fingerprint="$(sha1sum "$SCRIPT" | cut -c1-12)-$(docker exec "$PG" psql -U odoo -d "$DB" -tAc \
  "select (select count(*)||'/'||max(write_date) from ir_ui_view)||'/'||(select count(*)||'/'||max(write_date) from ir_module_module where state='installed')")"
if [ -z "${FORCE:-}" ] && [ -f "$OUT" ] && [ "$(cat "$STAMP" 2>/dev/null)" = "$fingerprint" ]; then
  echo "$2: up to date"; exit 0
fi
docker exec -i "$CT" python3 /opt/odoo/setup/odoo shell -c /etc/odoo/odoo.conf -d "$DB" --no-http --log-level=warn \
  < "$SCRIPT" 2>/dev/null |
  python3 -c 'import re,sys; m=re.search(r"@@CORPUS@@(.*)@@END@@", sys.stdin.read(), re.S); sys.exit("no corpus in output") if not m else open(sys.argv[1],"w").write(m.group(1))' "$OUT"
echo "$fingerprint" > "$STAMP"
echo "$2: harvested ($(du -h "$OUT" | cut -f1))"
