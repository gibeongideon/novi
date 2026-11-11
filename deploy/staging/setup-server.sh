#!/usr/bin/env bash
# One-time setup of NOVI staging on an existing server that already runs Caddy natively
# (currently the MT5 server, 68.183.91.240). Static files only: no Docker, no new processes.
#
# What it does (idempotent, safe to re-run):
#   1. creates an unprivileged user "novi" (no sudo) that owns /opt/novi only
#   2. authorises the GitHub Actions deploy key for that user only
#   3. backs up /etc/caddy/Caddyfile, appends a novi.dafeapp.com site block (once),
#      validates the result and reloads Caddy gracefully. If validation fails,
#      nothing is changed.
#
# Run from your laptop, in the NOVI repo (fills in the hash + public key, executes remotely):
#   HASH="$(docker run --rm caddy:2-alpine caddy hash-password --plaintext 'YOUR-PASSWORD')"
#   { printf "export NOVI_AUTH_HASH='%s'\nexport DEPLOY_PUBKEY='%s'\n" "$HASH" "$(cat ~/.ssh/novi_deploy.pub)"
#     cat deploy/staging/setup-server.sh; } | ssh -i ~/.ssh/vps_basket_ed25519 trader@68.183.91.240 'sudo bash -s'
#
# Undo:  sudo cp /etc/caddy/Caddyfile.bak-before-novi-* /etc/caddy/Caddyfile && sudo systemctl reload caddy
#        sudo userdel -r novi && sudo rm -rf /opt/novi
set -euo pipefail

DOMAIN="${NOVI_DOMAIN:-novi.dafeapp.com}"
: "${NOVI_AUTH_HASH:?NOVI_AUTH_HASH is required (bcrypt hash from caddy hash-password)}"
: "${DEPLOY_PUBKEY:?DEPLOY_PUBKEY is required (contents of novi_deploy.pub)}"
case "$NOVI_AUTH_HASH" in \$2[aby]\$*) ;; *) echo "NOVI_AUTH_HASH does not look like a bcrypt hash" >&2; exit 1 ;; esac
case "$DEPLOY_PUBKEY" in ssh-ed25519\ *|ssh-rsa\ *) ;; *) echo "DEPLOY_PUBKEY does not look like a public key" >&2; exit 1 ;; esac
[ "$(id -u)" -eq 0 ] || { echo "run with sudo" >&2; exit 1; }

echo "==> user + folders"
id novi >/dev/null 2>&1 || useradd --create-home --shell /bin/bash novi
install -d -m 755 -o novi -g novi /opt/novi /opt/novi/progress
install -d -m 700 -o novi -g novi /home/novi/.ssh
printf '%s\n' "$DEPLOY_PUBKEY" > /home/novi/.ssh/authorized_keys
chown novi:novi /home/novi/.ssh/authorized_keys && chmod 600 /home/novi/.ssh/authorized_keys
[ -f /opt/novi/progress/index.html ] || {
  echo '<!doctype html><title>NOVI</title><p>NOVI staging is set up. The dashboard appears after the first GitHub Actions deploy.</p>' > /opt/novi/progress/index.html
  chown novi:novi /opt/novi/progress/index.html
}

echo "==> caddy"
CF=/etc/caddy/Caddyfile
if grep -qE "^${DOMAIN//./\\.} \{" "$CF"; then
  echo "site block for $DOMAIN already present, leaving Caddyfile untouched"
else
  TS=$(date +%Y%m%d-%H%M%S)
  cp -p "$CF" "$CF.bak-before-novi-$TS"
  TMP=$(mktemp)
  cat "$CF" > "$TMP"
  cat >> "$TMP" <<EOF

# ── NOVI staging: progress dashboard (static files only, no processes) ──────
# Deployed by GitHub Actions as user "novi" into /opt/novi/progress. Temporary until the NOVI MVP.
${DOMAIN} {
	basic_auth {
		novi ${NOVI_AUTH_HASH}
	}
	header {
		X-Robots-Tag "noindex, nofollow"
		X-Content-Type-Options nosniff
		Strict-Transport-Security "max-age=31536000"
		-Server
	}
	redir / /progress/ 302
	handle_path /progress* {
		root * /opt/novi/progress
		file_server
	}
	handle {
		respond "Not found" 404
	}
	encode gzip zstd
}
EOF
  if caddy validate --config "$TMP" --adapter caddyfile >/dev/null 2>&1; then
    install -m 644 -o root -g root "$TMP" "$CF"
    rm -f "$TMP"
    systemctl reload caddy
    sleep 2
    systemctl is-active --quiet caddy && echo "caddy reloaded OK (backup: $CF.bak-before-novi-$TS)"
  else
    caddy validate --config "$TMP" --adapter caddyfile || true
    rm -f "$TMP"
    echo "Validation FAILED, Caddyfile NOT changed." >&2
    exit 1
  fi
fi

echo "==> done. Host key fingerprint for the GitHub secret VPS_FINGERPRINT:"
ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub | awk '{print $2}'
