#!/usr/bin/env bash
# Builds the stock Odoo 20 image (novi/odoo20:stock) from the tarball in the repo root.
# The tarball is hard-linked into a minimal build context, so Docker never uploads the whole repo.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
TARBALL="$(ls "$ROOT"/odoo_20.0+e.*.tar.gz 2>/dev/null | head -1 || true)"
[ -n "$TARBALL" ] || { echo "Odoo tarball odoo_20.0+e.*.tar.gz not found in $ROOT" >&2; exit 1; }

CTX="$ROOT/.cache/odoo20-context"
mkdir -p "$CTX"
cp "$ROOT/infra/images/odoo20/Dockerfile" "$CTX/Dockerfile"
ln -f "$TARBALL" "$CTX/odoo.tar.gz" 2>/dev/null || cp "$TARBALL" "$CTX/odoo.tar.gz"
sha256sum "$TARBALL" | awk '{print $1}' > "$CTX/odoo.tar.gz.sha256"

TAG="${ODOO_IMAGE:-novi/odoo20:stock}"
docker build --label "novi.odoo.tarball.sha256=$(cat "$CTX/odoo.tar.gz.sha256")" -t "$TAG" "$CTX"
echo "Built $TAG (tarball sha256 $(cat "$CTX/odoo.tar.gz.sha256"))"
