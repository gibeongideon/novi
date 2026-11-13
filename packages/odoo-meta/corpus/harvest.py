"""
Arch corpus for @novi/odoo-meta (P2.3.8): the combined arch of every primary form, list, kanban
and search view in the dev database, exactly as `get_views` returns it to a client (inheritance
applied, groups filtered for the admin user), with the field metadata of each model.

Runs inside `odoo shell`; prints one JSON document between markers. Derived from Odoo: lives in
.cache only, never committed. Regenerate with `pnpm --filter @novi/odoo-meta corpus`.
"""
import json

TYPES = ("form", "list", "kanban", "search")
views, failures, models = [], [], {}
for view in env["ir.ui.view"].search([("mode", "=", "primary"), ("type", "in", TYPES)], order="id"):  # noqa: F821
    if view.model not in env:  # noqa: F821
        continue
    try:
        result = env[view.model].get_views([(view.id, view.type)], {"toolbar": view.type != "search"})  # noqa: F821
    except Exception as e:  # a broken view is a finding, not a harvest failure
        failures.append({"id": view.id, "model": view.model, "type": view.type, "error": f"{type(e).__name__}: {e}"[:300]})
        continue
    v = result["views"][view.type]
    views.append({"id": view.id, "xmlid": view.xml_id, "model": view.model, "type": view.type, "arch": v["arch"], "toolbar": v.get("toolbar")})
    for m, info in result["models"].items():  # exactly what get_views returns (P2.3.7)
        models.setdefault(m, {"fields": {}})["fields"].update(info["fields"])
    env.cr.rollback()  # noqa: F821 (get_views is read-only; keep the transaction clean)

print("@@CORPUS@@" + json.dumps({"views": views, "failures": failures, "models": models}, default=str) + "@@END@@")
