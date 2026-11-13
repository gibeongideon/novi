#!/usr/bin/env bash
# Regenerate .cache/expr-corpus.json from the dev Odoo (P2.1.3). Derived from Odoo: never committed.
set -euo pipefail
cd "$(dirname "$0")/../../.."
CT="${ODOO_CONTAINER:-novi-dev-odoo-1}"; DB="${ODOO_DB:-novi_demo}"
mkdir -p .cache
docker exec -i "$CT" python3 /opt/odoo/setup/odoo shell -c /etc/odoo/odoo.conf -d "$DB" --no-http --log-level=warn \
  < packages/odoo-expr/corpus/harvest.py 2>/dev/null |
  python3 -c 'import re,sys; m=re.search(r"@@CORPUS@@(.*)@@END@@", sys.stdin.read(), re.S); sys.exit("no corpus in output") if not m else open(".cache/expr-corpus.json","w").write(m.group(1))'
python3 - <<'PY'
import json
d = json.load(open(".cache/expr-corpus.json"))
print(f"expression corpus: {len(d['entries'])} expressions from {d['views']} views")
PY
