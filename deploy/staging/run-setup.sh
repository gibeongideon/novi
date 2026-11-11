#!/usr/bin/env bash
# One command to prepare the staging server for GitHub Actions deploys (run from your laptop):
#   bash deploy/staging/run-setup.sh
# Asks for the dashboard password, hashes it locally, then runs setup-server.sh on the server
# over your existing trader SSH access (creates user "novi", installs the deploy key, adds the
# novi.dafeapp.com Caddy site with backup + validation). Safe to re-run.
set -euo pipefail
cd "$(dirname "$0")"
HOST="${NOVI_STAGING_HOST:-68.183.91.240}"
ADMIN_KEY="${NOVI_ADMIN_KEY:-$HOME/.ssh/vps_basket_ed25519}"
ADMIN_USER="${NOVI_ADMIN_USER:-trader}"
PUB="${NOVI_DEPLOY_PUB:-$HOME/.ssh/novi_deploy.pub}"

[ -f "$PUB" ] || { echo "Deploy public key $PUB not found (ssh-keygen -t ed25519 -f ~/.ssh/novi_deploy -N '')" >&2; exit 1; }
read -rsp "Choose the novi.dafeapp.com dashboard password: " PW; echo
[ ${#PW} -ge 10 ] || { echo "Use at least 10 characters." >&2; exit 1; }
HASH="$(docker run --rm caddy:2-alpine caddy hash-password --plaintext "$PW")"
unset PW

{ printf "export NOVI_AUTH_HASH='%s'\nexport DEPLOY_PUBKEY='%s'\n" "$HASH" "$(cat "$PUB")"
  cat setup-server.sh; } | ssh -i "$ADMIN_KEY" -o IdentitiesOnly=yes "$ADMIN_USER@$HOST" 'sudo bash -s'

echo
echo "Checking the deploy key can log in as novi…"
ssh -i "${PUB%.pub}" -o IdentitiesOnly=yes -o BatchMode=yes "novi@$HOST" 'echo "  OK: deploy key accepted for $(whoami)"'
echo "Now re-run the GitHub workflow (Actions → Deploy staging → Re-run) or push to main."
