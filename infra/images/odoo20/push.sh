#!/usr/bin/env bash
# Pushes the locally built stock Odoo 20 image to the PRIVATE GitHub Container Registry so CI can
# run the live contract suite. The package must stay private (Odoo Enterprise code).
#   docker login ghcr.io -u <github-user>      # token with write:packages, once
#   bash infra/images/odoo20/push.sh
set -euo pipefail
SRC="${ODOO_IMAGE:-novi/odoo20:stock}"
DEST="${NOVI_ODOO_REGISTRY_IMAGE:-ghcr.io/gibeongideon/novi-odoo20}"
SHA="$(docker image inspect "$SRC" --format '{{ index .Config.Labels "novi.odoo.tarball.sha256" }}' | cut -c1-12)"
[ -n "$SHA" ] || { echo "image $SRC has no tarball label; build it with pnpm odoo:build" >&2; exit 1; }
docker tag "$SRC" "$DEST:stock"
docker tag "$SRC" "$DEST:tarball-$SHA"
docker push "$DEST:tarball-$SHA"
docker push "$DEST:stock"
echo "Pushed $DEST:stock and :tarball-$SHA"
echo "Check it is PRIVATE: https://github.com/users/gibeongideon/packages/container/package/novi-odoo20/settings"
