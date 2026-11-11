#!/usr/bin/env bash
# P0.11 spike: provision an isolated tenant (own DB role + database + filestore + Odoo container)
# from the stock image, and time every step. Mirrors the provisioner state machine (PLAN §2b).
#
# Fast path (D-16): clone a pre-initialised template database per (plan, country) instead of
# installing modules for every sign-up. Seconds instead of minutes.
#
#   bash tools/spikes/provision-tenant.sh template starter KE          # build/refresh template (once)
#   bash tools/spikes/provision-tenant.sh create acme "Acme Ltd" KE owner@acme.test 'S3cret!pass' [port]
#   bash tools/spikes/provision-tenant.sh destroy acme
#   bash tools/spikes/provision-tenant.sh destroy-template starter KE
#
# Env: NOVI_PLAN (default starter), NOVI_TENANT_MODULES, ODOO_IMAGE.
# Uses the dev Postgres from infra/compose (pnpm odoo:up). Results: .cache/tenants/<id>/timings.json
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
IMAGE="${ODOO_IMAGE:-novi/odoo20:stock}"
NET="novi-dev_default"
DBC="novi-dev-db-1"
PLAN="${NOVI_PLAN:-starter}"
MODULES="${NOVI_TENANT_MODULES:-base,web,mail,sale_management,crm,account,stock,hr}"
TPL_ROLE="novi_tpl"

psql() { docker exec -i "$DBC" psql -v ON_ERROR_STOP=1 -U odoo -d "${PGDB:-postgres}" -tA "$@"; }
tpl_names() { # plan cc -> TPL_DB TPL_VOL
  local p="${1,,}" c="${2,,}"
  [[ "$p" =~ ^[a-z][a-z0-9]{1,20}$ && "$c" =~ ^[a-z]{2}$ ]] || { echo "bad plan/country" >&2; exit 2; }
  TPL_DB="novi_tpl_${p}_${c}"; TPL_VOL="novi-tpl-${p}-${c}-filestore"
}
db_exists() { [ "$(psql -c "SELECT 1 FROM pg_database WHERE datname='$1'")" = 1 ]; }

write_conf() { # file role password db
  cat > "$1" <<CONF
[options]
db_host = db
db_port = 5432
db_user = $2
db_password = $3
db_name = $4
dbfilter = ^$4\$
list_db = False
admin_passwd = $(openssl rand -hex 24)
data_dir = /var/lib/odoo
proxy_mode = True
http_interface = 0.0.0.0
workers = 0
max_cron_threads = 1
limit_memory_hard = 1610612736
CONF
  chmod 644 "$1"
}

odoo_once() { # conf volume args...   (one-off Odoo CLI run)
  local conf="$1" vol="$2"; shift 2
  docker run --rm -i --network "$NET" -v "$conf":/etc/odoo/odoo.conf:ro -v "$vol":/var/lib/odoo "$IMAGE" "$@"
}

declare -A T; t0=0; last=0
clock_start() { t0=$(date +%s%3N); last=$t0; }
step() { local now; now=$(date +%s%3N); T[$1]=$((now - last)); last=$now; echo "  ✓ $1 ($(( T[$1] ))ms)"; }

cmd="${1:-}"

# ── template: build a pre-initialised, connection-locked template DB for (plan, country) ──────
if [ "$cmd" = template ]; then
  tpl_names "${2:-$PLAN}" "${3:?country code}"; CC="${3^^}"
  DIR="$ROOT/.cache/templates/$TPL_DB"; mkdir -p "$DIR"; chmod 700 "$DIR"
  clock_start
  echo "==> building template $TPL_DB ($MODULES, country $CC)"
  if db_exists "$TPL_DB"; then
    psql -c "ALTER DATABASE \"$TPL_DB\" WITH IS_TEMPLATE false ALLOW_CONNECTIONS true;" >/dev/null
    psql -c "DROP DATABASE \"$TPL_DB\" WITH (FORCE);" >/dev/null
  fi
  docker volume rm "$TPL_VOL" >/dev/null 2>&1 || true
  PASS="$(openssl rand -hex 16)"
  if [ "$(psql -c "SELECT 1 FROM pg_roles WHERE rolname='$TPL_ROLE'")" = 1 ]; then
    psql -c "ALTER ROLE \"$TPL_ROLE\" LOGIN PASSWORD '$PASS';" >/dev/null
  else
    psql -c "CREATE ROLE \"$TPL_ROLE\" LOGIN PASSWORD '$PASS' NOCREATEDB NOCREATEROLE NOSUPERUSER;" >/dev/null
  fi
  psql -c "CREATE DATABASE \"$TPL_DB\" OWNER \"$TPL_ROLE\" ENCODING 'UTF8' TEMPLATE template0;" >/dev/null
  psql -c "REVOKE ALL ON DATABASE \"$TPL_DB\" FROM PUBLIC;" >/dev/null
  docker volume create "$TPL_VOL" >/dev/null
  docker run --rm -v "$TPL_VOL":/var/lib/odoo --entrypoint "" --user root "$IMAGE" chown -R odoo:odoo /var/lib/odoo
  write_conf "$DIR/odoo.conf" "$TPL_ROLE" "$PASS" "$TPL_DB"
  step create_db

  # base first, then the company country, so `account` installs the right localisation (l10n_xx)
  odoo_once "$DIR/odoo.conf" "$TPL_VOL" --config=/etc/odoo/odoo.conf -d "$TPL_DB" -i base --stop-after-init >"$DIR/init.log" 2>&1
  echo "env.company.country_id = env.ref('base.${CC,,}'); env.cr.commit()" |
    odoo_once "$DIR/odoo.conf" "$TPL_VOL" shell --config=/etc/odoo/odoo.conf -d "$TPL_DB" --no-http >>"$DIR/init.log" 2>&1
  odoo_once "$DIR/odoo.conf" "$TPL_VOL" --config=/etc/odoo/odoo.conf -d "$TPL_DB" -i "$MODULES" --stop-after-init >>"$DIR/init.log" 2>&1 ||
    { echo "module init failed, see $DIR/init.log" >&2; exit 1; }
  step init_modules

  # freeze: nobody can log in as the template role or connect to the template
  psql -c "ALTER ROLE \"$TPL_ROLE\" NOLOGIN;" >/dev/null
  psql -c "ALTER DATABASE \"$TPL_DB\" WITH IS_TEMPLATE true ALLOW_CONNECTIONS false;" >/dev/null
  step freeze
  SIZE=$(psql -c "SELECT pg_size_pretty(pg_database_size('$TPL_DB'));")
  L10N=$(grep -oE "l10n_[a-z_]+" "$DIR/init.log" | sort -u | head -3 | tr '\n' ' ')
  echo "==> template $TPL_DB ready in $(( ($(date +%s%3N) - t0) / 1000 ))s (db $SIZE; localisation: ${L10N:-generic})"
  exit 0
fi

if [ "$cmd" = destroy-template ]; then
  tpl_names "${2:-$PLAN}" "${3:?country code}"
  if db_exists "$TPL_DB"; then
    psql -c "ALTER DATABASE \"$TPL_DB\" WITH IS_TEMPLATE false ALLOW_CONNECTIONS true;" >/dev/null
    psql -c "DROP DATABASE \"$TPL_DB\" WITH (FORCE);" >/dev/null
  fi
  docker volume rm "$TPL_VOL" >/dev/null 2>&1 || true
  rm -rf "$ROOT/.cache/templates/$TPL_DB"
  echo "destroyed template $TPL_DB"; exit 0
fi

# ── tenants ───────────────────────────────────────────────────────────────────────────────
id="${2:-}"
[[ "$id" =~ ^[a-z][a-z0-9]{1,30}$ ]] || { echo "tenant id must match ^[a-z][a-z0-9]{1,30}$" >&2; exit 2; }
DB="tenant_${id}"; ROLE="tenant_${id}"; CT="novi-tenant-${id}"; VOL="novi-tenant-${id}-filestore"
DIR="$ROOT/.cache/tenants/$id"

if [ "$cmd" = destroy ]; then
  docker rm -f "$CT" >/dev/null 2>&1 || true
  docker volume rm "$VOL" >/dev/null 2>&1 || true
  psql -c "DROP DATABASE IF EXISTS \"$DB\" WITH (FORCE);" >/dev/null
  psql -c "DROP ROLE IF EXISTS \"$ROLE\";" >/dev/null
  rm -rf "$DIR"
  echo "destroyed $id"; exit 0
fi
[ "$cmd" = create ] || { echo "usage: $0 template|create|destroy|destroy-template ..." >&2; exit 2; }
COMPANY="${3:?company}"; COUNTRY="${4:?country code}"; EMAIL="${5:?admin email}"; PASS="${6:?admin password}"
PORT="${7:-18169}"
tpl_names "$PLAN" "$COUNTRY"
FAST=false; db_exists "$TPL_DB" && FAST=true

mkdir -p "$DIR"; chmod 700 "$DIR"
clock_start
echo "==> provisioning $id ($( $FAST && echo "fast path: clone $TPL_DB" || echo "slow path: no template for $PLAN/$COUNTRY" ))"
DBPASS="$(openssl rand -hex 16)"
psql -c "CREATE ROLE \"$ROLE\" LOGIN PASSWORD '$DBPASS' NOCREATEDB NOCREATEROLE NOSUPERUSER;" >/dev/null

if $FAST; then
  psql -c "CREATE DATABASE \"$DB\" OWNER \"$ROLE\" TEMPLATE \"$TPL_DB\";" >/dev/null
  psql -c "REVOKE ALL ON DATABASE \"$DB\" FROM PUBLIC;" >/dev/null
  # every table/sequence/view inside still belongs to the template role: hand them to the tenant,
  # and give the clone its own identity (database.secret signs sessions/tokens: never share it)
  PGDB="$DB" psql >/dev/null <<SQL
REASSIGN OWNED BY "$TPL_ROLE" TO "$ROLE";
UPDATE ir_config_parameter SET value = gen_random_uuid()::text WHERE key IN ('database.uuid', 'database.secret');
UPDATE ir_config_parameter SET value = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') WHERE key = 'database.create_date';
DELETE FROM ir_config_parameter WHERE key IN ('web.base.url', 'web.base.url.freeze');
SQL
  step clone_db
  docker volume create "$VOL" >/dev/null
  docker run --rm -v "$TPL_VOL":/src:ro -v "$VOL":/var/lib/odoo --entrypoint "" --user root "$IMAGE" sh -c \
    "mkdir -p /var/lib/odoo/filestore && if [ -d /src/filestore/$TPL_DB ]; then cp -a /src/filestore/$TPL_DB /var/lib/odoo/filestore/$DB; fi && chown -R odoo:odoo /var/lib/odoo"
  write_conf "$DIR/odoo.conf" "$ROLE" "$DBPASS" "$DB"
  step copy_filestore
else
  psql -c "CREATE DATABASE \"$DB\" OWNER \"$ROLE\" ENCODING 'UTF8' TEMPLATE template0;" >/dev/null
  psql -c "REVOKE ALL ON DATABASE \"$DB\" FROM PUBLIC;" >/dev/null
  step create_db
  docker volume create "$VOL" >/dev/null
  docker run --rm -v "$VOL":/var/lib/odoo --entrypoint "" --user root "$IMAGE" chown -R odoo:odoo /var/lib/odoo
  write_conf "$DIR/odoo.conf" "$ROLE" "$DBPASS" "$DB"
  step create_filestore
  odoo_once "$DIR/odoo.conf" "$VOL" --config=/etc/odoo/odoo.conf -d "$DB" -i "$MODULES" --stop-after-init \
    > "$DIR/init.log" 2>&1 || { echo "module init failed, see $DIR/init.log" >&2; exit 1; }
  step init_modules
fi

docker run -d --name "$CT" --network "$NET" --memory 1g --cpus 1 --restart unless-stopped \
  -p "127.0.0.1:$PORT:8069" -v "$DIR/odoo.conf":/etc/odoo/odoo.conf:ro -v "$VOL":/var/lib/odoo "$IMAGE" >/dev/null
for _ in $(seq 1 120); do curl --noproxy '*' -fsS "http://127.0.0.1:$PORT/web/health" >/dev/null 2>&1 && break; sleep 0.5; done
curl --noproxy '*' -fsS "http://127.0.0.1:$PORT/web/health" >/dev/null
step start_instance

(cd "$ROOT/tools/spikes" && pnpm exec tsx src/bootstrap-admin.ts "http://127.0.0.1:$PORT" "$DB" "$COMPANY" "$COUNTRY" "$EMAIL" "$PASS")
step bootstrap_admin

total=$(( $(date +%s%3N) - t0 ))
MEM=$(docker stats --no-stream --format '{{.MemUsage}}' "$CT")
DBSIZE=$(psql -c "SELECT pg_size_pretty(pg_database_size('$DB'));")
steps=""; for k in "${!T[@]}"; do steps+="\"$k\":${T[$k]},"; done
cat > "$DIR/timings.json" <<JSON
{"tenant":"$id","db":"$DB","path":"$( $FAST && echo template || echo install )","template":"$( $FAST && echo "$TPL_DB" )","modules":"$MODULES","ms":{${steps}"total":$total},"idle_memory":"$MEM","db_size":"$DBSIZE"}
JSON
echo "==> $id ready in $(awk "BEGIN{printf \"%.1f\", $total/1000}")s at http://127.0.0.1:$PORT  (idle memory $MEM, db $DBSIZE)"
echo "    timings: $DIR/timings.json"
