"""
Expression corpus for @novi/odoo-expr (P2.1.3): every Python expression in the arch of every view
installed in the dev database, with reference results computed by Odoo's own safe_eval (real
Python semantics) on sample values chosen per field type.

Runs inside `odoo shell` (needs `env`); prints one JSON document between markers. The output is
derived from Odoo and therefore lives in .cache only (never committed). Regenerate with
`pnpm --filter @novi/odoo-expr corpus`.
"""
import ast
import json
import re
from types import SimpleNamespace

from lxml import etree
from odoo.tools.safe_eval import datetime as s_datetime
from odoo.tools.safe_eval import dateutil as s_dateutil
from odoo.tools.safe_eval import safe_eval
from odoo.tools.safe_eval import time as s_time

BOOL_ATTRS = {"invisible", "readonly", "required", "column_invisible"}
VALUE_ATTRS = {"domain", "context", "filter_domain", "options"}
KNOWN = {
    "True", "False", "None", "context", "uid", "parent", "datetime", "relativedelta", "time",
    "context_today", "today", "now", "current_date", "len", "bool", "str", "int", "float", "abs",
    "min", "max", "any", "all", "set", "list", "dict", "tuple", "round", "sum", "sorted",
}
# results that depend on the clock can't be compared run to run: parse-only
DYNAMIC = re.compile(r"\b(now|today|context_today|current_date|strftime|time\.|datetime\.)")
SAMPLES = 3
CONTEXTS = [{}, {"lang": "en_US", "tz": "UTC", "uid": 2, "active_test": False}, {"default_type": "out_invoice"}]


def pool(field):
    t = field.type if field else None
    if t == "boolean":
        return [True, False]
    if t == "selection":
        try:
            keys = [k for k, _ in field._description_selection(env)]  # noqa: F821 (odoo shell)
        except Exception:
            keys = []
        return (keys[:3] or ["a"]) + [False]
    if t in ("many2one", "many2one_reference"):
        return [False, 7]
    if t in ("one2many", "many2many"):
        return [[], [3, 4]]
    if t == "integer":
        return [0, 5]
    if t in ("float", "monetary"):
        return [0.0, 2.5]
    if t in ("char", "text", "html"):
        return [False, "abc"]
    if t == "date":
        return [False, "2026-01-15"]
    if t == "datetime":
        return [False, "2026-01-15 10:00:00"]
    return [False, 1]


def pick(values, name, i):
    return values[(i + sum(map(ord, name))) % len(values)]


def names_in(expr):
    tree = ast.parse(expr.strip(), mode="eval")
    names, parent_attrs = set(), set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Name) and node.id not in KNOWN:
            names.add(node.id)
        if isinstance(node, ast.Attribute) and isinstance(node.value, ast.Name) and node.value.id == "parent":
            parent_attrs.add(node.attr)
    return names, parent_attrs


def jsonable(v):
    if isinstance(v, (list, tuple)):
        return [jsonable(x) for x in v]
    if isinstance(v, dict):
        return {str(k): jsonable(x) for k, x in v.items()}
    if v is None or isinstance(v, (bool, int, float, str)):
        return v
    raise TypeError(type(v).__name__)


def expressions(arch):
    root = etree.fromstring(arch.encode())
    for el in root.iter():
        if not isinstance(el.tag, str):
            continue
        for attr in BOOL_ATTRS | VALUE_ATTRS:
            v = el.get(attr)
            if v is not None and v.strip():
                yield attr, v
        name = el.get("name")
        if el.tag == "attribute" and name in BOOL_ATTRS | VALUE_ATTRS and (el.text or "").strip():
            if not any(el.get(k) for k in ("add", "remove", "separator")):
                yield name, el.text


seen, entries, skipped = set(), [], 0
views = env["ir.ui.view"].with_context(active_test=False).search([])  # noqa: F821
for view in views:
    try:
        found = list(expressions(view.arch_db or "<x/>"))
    except Exception:
        skipped += 1
        continue
    for kind, expr in found:
        key = (expr, kind, view.model)
        if key in seen:
            continue
        seen.add(key)
        entry = {"expr": expr, "kind": kind, "model": view.model, "dynamic": bool(DYNAMIC.search(expr))}
        try:
            names, parent_attrs = names_in(expr)
        except SyntaxError as e:
            entry["pythonSyntaxError"] = str(e)
            entries.append(entry)
            continue
        fields = env[view.model]._fields if view.model in env else {}  # noqa: F821
        samples = []
        for i in range(SAMPLES):
            values = {n: pick(pool(fields.get(n)), n, i) for n in sorted(names)}
            parent = {a: pick([False, 1, "abc"], a, i) for a in sorted(parent_attrs)}
            context = CONTEXTS[i % len(CONTEXTS)]
            sample = {"values": values, "parent": parent, "context": context}
            if not entry["dynamic"]:
                ctx = dict(values, context=dict(context), uid=2, parent=SimpleNamespace(**parent))
                ctx.update(datetime=s_datetime, time=s_time, relativedelta=s_dateutil.relativedelta.relativedelta)
                try:
                    sample["result"] = jsonable(safe_eval(expr.strip(), ctx))
                except Exception as e:  # Python refuses: no reference result for this sample
                    sample["error"] = type(e).__name__
            samples.append(sample)
        entry["samples"] = samples
        entries.append(entry)

print("@@CORPUS@@" + json.dumps({"views": len(views), "unparsableArch": skipped, "entries": entries}) + "@@END@@")
