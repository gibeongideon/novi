# Runs inside `odoo shell` (env is predefined). Creates NOVI test users and an admin API key.
# Prints one line "NOVI_SEED_JSON=<json>" that seed-dev.sh stores in .cache/dev-credentials.json.
# Stock ORM calls only; nothing is installed or modified in Odoo code.
import json
from datetime import timedelta

from odoo import fields

TOTP_SECRET = "NOVIDEV2FASECRETNOVIDEV2FASECRET"  # base32, dev only

USERS = [
    ("sales", "Sally Sales", ["sales_team.group_sale_salesman"]),
    ("accountant", "Arthur Accountant", ["account.group_account_user"]),
    ("stock", "Stella Stock", ["stock.group_stock_user"]),
    ("hr", "Harriet HR", ["hr.group_hr_user"]),
    ("restricted", "Rita Restricted", ["base.group_user"]),
    ("twofa", "Tom Twofactor", ["base.group_user"]),
]

Users = env["res.users"].with_context(no_reset_password=True, mail_create_nosubscribe=True)
out = {"db": env.cr.dbname, "users": {}}

for login, name, groups in USERS:
    user = Users.search([("login", "=", login)], limit=1)
    group_ids = [env.ref(xmlid).id for xmlid in groups]
    if not user:
        user = Users.create({"name": name, "login": login, "email": f"{login}@novi.test", "password": login,
                             "group_ids": [(6, 0, group_ids)]})
    else:
        user.write({"password": login, "group_ids": [(6, 0, group_ids)]})
    out["users"][login] = {"id": user.id, "login": login, "password": login}

portal = Users.search([("login", "=", "portal")], limit=1)
if not portal:
    portal = Users.create({"name": "Paul Portal", "login": "portal", "email": "portal@novi.test",
                           "password": "portal", "group_ids": [(6, 0, [env.ref("base.group_portal").id])]})
out["users"]["portal"] = {"id": portal.id, "login": "portal", "password": "portal"}

# 2FA: write the secret column directly (the field is NO_ACCESS through the ORM).
twofa = Users.search([("login", "=", "twofa")], limit=1)
env.cr.execute("UPDATE res_users SET totp_secret = %s WHERE id = %s", (TOTP_SECRET, twofa.id))
out["users"]["twofa"]["totp_secret"] = TOTP_SECRET

admin = env.ref("base.user_admin")
admin.write({"password": "admin"})
out["users"]["admin"] = {"id": admin.id, "login": admin.login, "password": "admin"}
key = env["res.users.apikeys"].with_user(admin)._generate(
    "rpc", "novi-dev-contract-tests", fields.Datetime.now() + timedelta(days=90))
out["users"]["admin"]["api_key"] = key

env.cr.commit()
print("NOVI_SEED_JSON=" + json.dumps(out))
