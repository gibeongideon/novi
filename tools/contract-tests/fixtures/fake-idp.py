"""
A minimal OAuth2 identity provider for the SSO tests (P1.14), standing in for Google: implicit
flow as Odoo's stock auth_oauth uses it. Python stdlib only, so it runs in the Odoo image.

  GET /authorize?redirect_uri&state[&login_hint=email]  → 302 redirect_uri#access_token=…&state=…
  GET /userinfo?access_token=… (or Authorization: Bearer) → {"sub", "email", "name"}

The token simply encodes the email: this is a test double, never deploy it.
"""
import base64
import json
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import parse_qs, urlencode, urlparse


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        url = urlparse(self.path)
        q = {k: v[0] for k, v in parse_qs(url.query).items()}
        if url.path == "/authorize":
            email = q.get("login_hint", "sso-user@example.test")
            token = "tok-" + base64.urlsafe_b64encode(email.encode()).decode()
            fragment = urlencode({"access_token": token, "token_type": "Bearer", "state": q["state"]})
            self.send_response(302)
            self.send_header("Location", q["redirect_uri"] + "#" + fragment)
            self.end_headers()
        elif url.path == "/userinfo":
            token = self.headers.get("Authorization", "").removeprefix("Bearer ") or q.get("access_token", "")
            if not token.startswith("tok-"):
                self.send_response(401)
                self.end_headers()
                return
            email = base64.urlsafe_b64decode(token[4:]).decode()
            body = json.dumps({"sub": "sub-" + email, "email": email, "name": email}).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(body)
        else:
            self.send_response(404)
            self.end_headers()

    def log_message(self, *args):
        pass


HTTPServer(("0.0.0.0", 8000), Handler).serve_forever()
