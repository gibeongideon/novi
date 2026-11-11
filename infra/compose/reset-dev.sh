#!/usr/bin/env bash
# Destroys the local Odoo database + filestore and re-seeds from scratch.
set -euo pipefail
cd "$(dirname "$0")"
docker compose -f docker-compose.dev.yml down -v
exec ./seed-dev.sh
