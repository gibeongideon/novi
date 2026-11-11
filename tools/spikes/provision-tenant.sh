#!/usr/bin/env bash
# P0.11 spike: provision an isolated tenant (own DB role + database + filestore + Odoo container)
# from the stock image, and time every step. Mirrors the provisioner state machine (PLAN §2b).
#
#   bash tools/spikes/provision-tenant.sh create acme "Acme Ltd" KE owner@acme.test 'S3cret!pass' [port]
#   bash tools/spikes/provision-tenant.sh destroy acme
#
# Uses the dev Postgres from infra/compose (pnpm odoo:up). Results: .cache/tenants/<id>/timings.json
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
IMAGE="${ODOO_IMAGE:-novi/odoo20:stock}"
NET="novi-dev_default"
DBC="novi-dev-db-1"
MODULES="${NOVI_TENANT_MODULES:-base,web,mail,sale_management,crm,account,stock,hr}"

cmd="${1:-}"; id="${2:-}"
[[ "$id" =~ ^[a-z][a-z0-9]{1,30}$ ]] || { echo "tenant id must match ^[a-z][a-z0-9]{1,30}$" >&2; exit 2; }
DB="tenant_${id}"; ROLE="tenant_${id}"; CT="novi-tenant-${id}"; VOL="novi-tenant-${id}-filestore"
DIR="$ROOT/.cache/tenants/$id"
psql() { docker exec -i "$DBC" psql -v ON_ERROR_STOP=1 -U odoo -d postgres -tA "$@"; }

if [ "$cmd" = destroy ]; then
  docker rm -f "$CT" >/dev/null 2>&1 || true
  docker volume rm "$VOL" >/dev/null 2>&1 || true
  psql -c "DROP DATABASE IF EXISTS \"$DB\" WITH (FORCE);" >/dev/null
  psql -c "DROP ROLE IF EXISTS \"$ROLE\";" >/dev/null
  rm -rf "$DIR"
  echo "destroyed $id"; exit 0
fi
[ "$cmd" = create ] || { echo "usage: $0 create|destroy <id> ..." >&2; exit 2; }
COMPANY="${3:?company}"; COUNTRY="${4:?country code}"; EMAIL="${5:?admin email}"; PASS="${6:?admin password}"
PORT="${7:-18169}"

mkdir -p "$DIR"; chmod 700 "$DIR"
declare -A T; t0=$(date +%s%3N); last=$t0
step() { local now; now=$(date +%s%3N); T[$1]=$((now - last)); last=$now; echo "  ✓ $1 ($(( T[$1] ))ms)"; }

echo "==> provisioning $id"
DBPASS="$(openssl rand -hex 16)"
psql -c "CREATE ROLE \"$ROLE\" LOGIN PASSWORD '$DBPASS' NOCREATEDB NOCREATEROLE NOSUPERUSER;" >/dev/null
psql -c "CREATE DATABASE \"$DB\" OWNER \"$ROLE\" ENCODING 'UTF8' TEMPLATE template0;" >/dev/null
psql -c "REVOKE ALL ON DATABASE \"$DB\" FROM PUBLIC;" >/dev/null
step create_db

docker volume create "$VOL" >/dev/null
docker run --rm -v "$VOL":/var/lib/odoo --entrypoint "" --user root "$IMAGE" chown -R odoo:odoo /var/lib/odoo
step create_filestore

cat > "$DIR/odoo.conf" <<CONF
[options]
db_host = db
db_port = 5432
db_user = $ROLE
db_password = $DBPASS
db_name = $DB
dbfilter = ^$DB\$
list_db = False
admin_passwd = $(openssl rand -hex 24)
data_dir = /var/lib/odoo
proxy_mode = True
workers = 0
max_cron_threads = 1
limit_memory_hard = 1610612736
CONF
chmod 644 "$DIR/odoo.conf"

docker run --rm --network "$NET" -v "$DIR/odoo.conf":/etc/odoo/odoo.conf:ro -v "$VOL":/var/lib/odoo \
  "$IMAGE" --config=/etc/odoo/odoo.conf -d "$DB" -i "$MODULES" --stop-after-init \
  > "$DIR/init.log" 2>&1 || { echo "module init failed, see $DIR/init.log" >&2; exit 1; }
step init_modules

docker run -d --name "$CT" --network "$NET" --memory 1g --cpus 1 --restart unless-stopped \
  -p "127.0.0.1:$PORT:8069" -v "$DIR/odoo.conf":/etc/odoo/odoo.conf:ro -v "$VOL":/var/lib/odoo "$IMAGE" >/dev/null
for _ in $(seq 1 120); do curl -fsS "http://127.0.0.1:$PORT/web/health" >/dev/null 2>&1 && break; sleep 1; done
curl -fsS "http://127.0.0.1:$PORT/web/health" >/dev/null
step start_instance

(cd "$ROOT/tools/spikes" && pnpm exec tsx src/bootstrap-admin.ts "http://127.0.0.1:$PORT" "$DB" "$COMPANY" "$COUNTRY" "$EMAIL" "$PASS")
step bootstrap_admin

total=$(( $(date +%s%3N) - t0 ))
MEM=$(docker stats --no-stream --format '{{.MemUsage}}' "$CT")
DBSIZE=$(psql -c "SELECT pg_size_pretty(pg_database_size('$DB'));")
cat > "$DIR/timings.json" <<JSON
{"tenant":"$id","db":"$DB","modules":"$MODULES","ms":{"create_db":${T[create_db]},"create_filestore":${T[create_filestore]},"init_modules":${T[init_modules]},"start_instance":${T[start_instance]},"bootstrap_admin":${T[bootstrap_admin]},"total":$total},"idle_memory":"$MEM","db_size":"$DBSIZE"}
JSON
echo "==> $id ready in $((total / 1000))s at http://127.0.0.1:$PORT  (idle memory $MEM, db $DBSIZE)"
echo "    timings: $DIR/timings.json"
