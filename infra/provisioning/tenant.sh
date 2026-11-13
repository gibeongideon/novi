#!/usr/bin/env bash
# Tenant provisioning (P1.4; proven in the P0.11 spike): provision an isolated tenant (own DB role + database + filestore + Odoo container)
# from the stock image, and time every step. Mirrors the provisioner state machine (PLAN §2b).
#
# Fast path (D-16): clone a pre-initialised template database per (plan, country) instead of
# installing modules for every sign-up. Seconds instead of minutes.
#
#   bash infra/provisioning/tenant.sh template starter KE          # build/refresh template (once)
#   TENANT_ADMIN_PASSWORD='S3cret!pass' bash infra/provisioning/tenant.sh create acme "Acme Ltd" KE owner@acme.test [port]
#   bash infra/provisioning/tenant.sh destroy acme
#   bash infra/provisioning/tenant.sh destroy-template starter KE
# Normally driven by the provisioner service (P1.4), which runs sign-ups through it.
#
# Env: NOVI_PLAN (default starter), NOVI_TENANT_MODULES, ODOO_IMAGE.
# Uses the dev Postgres from infra/compose (pnpm odoo:up). Results: .cache/tenants/<id>/timings.json
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
IMAGE="${ODOO_IMAGE:-novi/odoo20:stock}"
NET="novi-dev_default"
DBC="novi-dev-db-1"
PLAN="${NOVI_PLAN:-starter}"
MODULES="${NOVI_TENANT_MODULES:-base,web,mail,auth_password_policy,auth_oauth,sale_management,crm,account,stock,hr}"
TPL_ROLE="novi_tpl"
# Platform admin role (the superuser this script runs psql as). Owns the template *databases*,
# so REASSIGN OWNED BY novi_tpl (which also moves shared objects such as databases!) can never
# hand a template to a tenant.
PLATFORM_ROLE="odoo"
# Outgoing mail for tenants (password reset, invitations, documents). Production: an external relay
# (TENANT_SMTP_HOST/PORT/USER/PASSWORD/SSL). Locally: Mailpit joins each tenant network as "smtp".
SMTP_HOST="${TENANT_SMTP_HOST:-smtp}"; SMTP_PORT="${TENANT_SMTP_PORT:-1025}"
MAILPIT="novi-dev-mailpit-1"

psql() { docker exec -i "$DBC" psql -v ON_ERROR_STOP=1 -U odoo -d "${PGDB:-postgres}" -tA "$@"; }
tpl_names() { # plan cc -> TPL_DB TPL_VOL
  local p="${1,,}" c="${2,,}"
  [[ "$p" =~ ^[a-z][a-z0-9]{1,20}$ && "$c" =~ ^[a-z]{2}$ ]] || { echo "bad plan/country" >&2; exit 2; }
  TPL_DB="novi_tpl_${p}_${c}"; TPL_VOL="novi-tpl-${p}-${c}-filestore"
}
image_id() { docker image inspect --format '{{.Id}}' "$IMAGE"; }
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
smtp_server = $SMTP_HOST
smtp_port = $SMTP_PORT
smtp_user = ${TENANT_SMTP_USER:-False}
smtp_password = ${TENANT_SMTP_PASSWORD:-False}
smtp_ssl = ${TENANT_SMTP_SSL:-False}
CONF
  chmod 644 "$1"
}

odoo_once() { # conf volume args...   (one-off Odoo CLI run)
  local conf="$1" vol="$2"; shift 2
  docker run --rm -i --network "${ODOO_NET:-$NET}" -v "$conf":/etc/odoo/odoo.conf:ro -v "$vol":/var/lib/odoo "$IMAGE" "$@"
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

  # freeze: nobody can log in as the template role or connect to the template, and the template
  # database itself belongs to the platform role (not novi_tpl): see PLATFORM_ROLE above
  psql -c "ALTER ROLE \"$TPL_ROLE\" NOLOGIN;" >/dev/null
  psql -c "ALTER DATABASE \"$TPL_DB\" OWNER TO \"$PLATFORM_ROLE\";" >/dev/null
  psql -c "ALTER DATABASE \"$TPL_DB\" WITH IS_TEMPLATE true ALLOW_CONNECTIONS false;" >/dev/null
  step freeze
  image_id > "$DIR/image"  # the template is only valid for the image that built it
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
# own network per tenant (P1.5.4): the only other member is Postgres (alias "db"), so tenants have
# no network path to each other, to the platform services or to the dev Odoo
TNET="novi-tenant-${id}"
DIR="$ROOT/.cache/tenants/$id"

if [ "$cmd" = destroy ]; then
  docker rm -f "$CT" >/dev/null 2>&1 || true
  docker volume rm "$VOL" >/dev/null 2>&1 || true
  docker network disconnect -f "$TNET" "$DBC" >/dev/null 2>&1 || true
  docker network disconnect -f "$TNET" "$MAILPIT" >/dev/null 2>&1 || true
  docker network rm "$TNET" >/dev/null 2>&1 || true
  psql -c "DROP DATABASE IF EXISTS \"$DB\" WITH (FORCE);" >/dev/null
  psql -c "DROP ROLE IF EXISTS \"$ROLE\";" >/dev/null
  rm -rf "$DIR"
  (cd "$ROOT" && pnpm exec tsx services/gateway/src/tenants/cli.ts remove "$id" >/dev/null) || true
  echo "destroyed $id"; exit 0
fi
[ "$cmd" = create ] || { echo "usage: $0 template|create|destroy|destroy-template ..." >&2; exit 2; }
COMPANY="${3:?company}"; COUNTRY="${4:?country code}"; EMAIL="${5:?admin email}"
# the admin password comes from the environment, never argv (argv is visible to every user via ps)
: "${TENANT_ADMIN_PASSWORD:?set TENANT_ADMIN_PASSWORD}"
PORT="${6:-18169}"
tpl_names "$PLAN" "$COUNTRY"
FAST=false; db_exists "$TPL_DB" && FAST=true
# a template built by another Odoo image would give the tenant modules that don't match the code:
# take the slow path and say how to rebuild (P1.4.11)
if $FAST && [ "$(cat "$ROOT/.cache/templates/$TPL_DB/image" 2>/dev/null)" != "$(image_id)" ]; then
  echo "    template $TPL_DB was built by another image; rebuild: tenant.sh template $PLAN $COUNTRY" >&2
  FAST=false
fi

mkdir -p "$DIR"; chmod 700 "$DIR"
# a tenant role may connect only to its own database (plus the empty maintenance DB "postgres", which
# Odoo's dbfilter lookup needs): Postgres grants CONNECT to PUBLIC by default; tenant DBs revoke it
# below, this covers every other database on the cluster (e.g. a demo or platform DB)
psql -c "DO \$\$ DECLARE d text; BEGIN FOR d IN SELECT datname FROM pg_database WHERE datname NOT IN ('postgres','template0','template1') LOOP EXECUTE format('REVOKE CONNECT ON DATABASE %I FROM PUBLIC', d); END LOOP; END \$\$;" >/dev/null
docker network create "$TNET" >/dev/null
docker network connect --alias db "$TNET" "$DBC"
if [ -z "${TENANT_SMTP_HOST:-}" ] && docker container inspect "$MAILPIT" >/dev/null 2>&1; then
  docker network connect --alias smtp "$TNET" "$MAILPIT"  # local dev only
fi
export ODOO_NET="$TNET"
clock_start
echo "==> provisioning $id ($( $FAST && echo "fast path: clone $TPL_DB" || echo "slow path: no template for $PLAN/$COUNTRY" ))"
DBPASS="$(openssl rand -hex 16)"
psql -c "CREATE ROLE \"$ROLE\" LOGIN PASSWORD '$DBPASS' NOCREATEDB NOCREATEROLE NOSUPERUSER;" >/dev/null

tpl_owner() { psql -c "SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname='$TPL_DB'"; }
shared_owned() { psql -c "SELECT count(*) FROM pg_database WHERE datdba = (SELECT oid FROM pg_roles WHERE rolname='$TPL_ROLE')"; }
if $FAST; then
  # guard: the template role must own no databases, otherwise REASSIGN OWNED would give them away
  [ "$(shared_owned)" = 0 ] || { echo "ABORT: $TPL_ROLE owns databases; fix template ownership first" >&2; exit 1; }
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
  [ "$(tpl_owner)" = "$PLATFORM_ROLE" ] || { echo "ABORT: template ownership changed to $(tpl_owner)" >&2; exit 1; }
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

docker run -d --name "$CT" --network "$TNET" --memory 1g --cpus 1 --restart unless-stopped \
  -p "127.0.0.1:$PORT:8069" -v "$DIR/odoo.conf":/etc/odoo/odoo.conf:ro -v "$VOL":/var/lib/odoo "$IMAGE" >/dev/null
for _ in $(seq 1 120); do curl --noproxy '*' -fsS "http://127.0.0.1:$PORT/web/health" >/dev/null 2>&1 && break; sleep 0.5; done
curl --noproxy '*' -fsS "http://127.0.0.1:$PORT/web/health" >/dev/null
step start_instance

(cd "$ROOT/services/provisioner" && pnpm exec tsx src/bootstrap-admin.ts "http://127.0.0.1:$PORT" "$DB" "$COMPANY" "$COUNTRY" "$EMAIL")
step bootstrap_admin

# register with the gateway (P1.2): <id>.localhost now reaches this tenant's own Odoo
(cd "$ROOT" && pnpm exec tsx services/gateway/src/tenants/cli.ts add "$id" --host "${TENANT_HOST:-$id.localhost}" \
  --odoo "http://127.0.0.1:$PORT" --db "$DB")
step register_gateway

total=$(( $(date +%s%3N) - t0 ))
MEM=$(docker stats --no-stream --format '{{.MemUsage}}' "$CT")
DBSIZE=$(psql -c "SELECT pg_size_pretty(pg_database_size('$DB'));")
steps=""; for k in "${!T[@]}"; do steps+="\"$k\":${T[$k]},"; done
cat > "$DIR/timings.json" <<JSON
{"tenant":"$id","db":"$DB","path":"$( $FAST && echo template || echo install )","template":"$( $FAST && echo "$TPL_DB" )","modules":"$MODULES","ms":{${steps}"total":$total},"idle_memory":"$MEM","db_size":"$DBSIZE"}
JSON
echo "==> $id ready in $(awk "BEGIN{printf \"%.1f\", $total/1000}")s at http://127.0.0.1:$PORT  (idle memory $MEM, db $DBSIZE)"
echo "    timings: $DIR/timings.json"
