#!/usr/bin/env bash
# The production edge locally (P1.5.6): stock Caddy with on-demand TLS in front of `pnpm serve`.
#   pnpm serve   (in another terminal)
#   pnpm edge    → https://acme.localhost:8443 (Caddy's local CA; the browser will warn once)
# Only hosts the gateway confirms get a certificate; unknown hosts fail the TLS handshake.
set -euo pipefail
cd "$(dirname "$0")/.."
docker rm -f novi-edge >/dev/null 2>&1 || true
exec docker run --rm --name novi-edge --network host \
  -e CADDY_LOCAL_CERTS=local_certs -e CADDY_HTTP_PORT=8081 -e CADDY_HTTPS_PORT=8443 \
  -e GATEWAY="127.0.0.1:${PORT:-8080}" \
  -v "$PWD/infra/caddy/Caddyfile:/etc/caddy/Caddyfile:ro" -v novi-edge-data:/data \
  caddy:2-alpine
