# NOVI staging deployment (novi.dafeapp.com)

**Temporary setup until the MVP** (DECISIONS D-12). NOVI staging lives on the **MT5 server** (`68.183.91.240`, DigitalOcean Bangalore, 2 vCPU / 4 GB). That server is busy with live trading, so NOVI adds **static files only**: no Docker, no new processes, no measurable load. The server's existing native Caddy serves them, next to `braelaspin.dafeapp.com`.

```text
Browser ──HTTPS──▶ Caddy on MT5 server (native, 80/443, automatic TLS)
                     ├─ braelaspin.dafeapp.com → existing app (unchanged)
                     └─ novi.dafeapp.com      → /opt/novi/progress  (static, basic auth)
GitHub push to main ──▶ Actions builds dashboard ──SSH as user "novi"──▶ /opt/novi/progress
```

- The deploy key logs in as **`novi`**, an unprivileged user with no sudo who owns only `/opt/novi`. It can't touch the trading bots or other apps.
- The workflow only connects if the server presents one of the verified host keys committed in [`deploy/staging/known_hosts`](deploy/staging/known_hosts) (strict OpenSSH checking), so it can never deploy to an impostor. No fingerprint secret is needed; if the server is rebuilt, update that file.
- The **staging Odoo, gateway and web app (P0.3 / P1) will NOT go on this server**, which is already at its memory limit. They need another server (≥ 8 GB) before then.

---

## One-time setup

### 1. Server (from your laptop, in the NOVI repo)
```bash
cd ~/Desktop/CODE/NOVI
HASH="$(docker run --rm caddy:2-alpine caddy hash-password --plaintext 'YOUR-PASSWORD')"
{ printf "export NOVI_AUTH_HASH='%s'\nexport DEPLOY_PUBKEY='%s'\n" "$HASH" "$(cat ~/.ssh/novi_deploy.pub)"
  cat deploy/staging/setup-server.sh; } | ssh -i ~/.ssh/vps_basket_ed25519 trader@68.183.91.240 'sudo bash -s'
```
[`setup-server.sh`](deploy/staging/setup-server.sh):
- creates the `novi` user and `/opt/novi`
- authorises the deploy key for that user only
- backs up `/etc/caddy/Caddyfile`, then appends a `novi.dafeapp.com` block
- validates the new config and reloads Caddy gracefully; if validation fails, nothing changes
- prints the host key fingerprint

It's safe to re-run.

### 2. GitHub secrets
In the NOVI repo, go to **Settings → Secrets and variables → Actions**:

| Secret | Value |
|---|---|
| `VPS_HOST` | `68.183.91.240` |
| `VPS_USER` | `novi` |
| `VPS_SSH_KEY` | Full output of `cat ~/.ssh/novi_deploy` (including the BEGIN/END lines) |

### 3. DNS (Cloudflare, `dafeapp.com` zone)
Add `A` record `novi` → `68.183.91.240`, using the **same proxy setting as `braelaspin`**.

### 4. Deploy
Push to `main`, or go to **Actions → Deploy staging → Run workflow**. Then open **https://novi.dafeapp.com** and log in as `novi`.

---

## Undo / move elsewhere later
```bash
ssh -i ~/.ssh/vps_basket_ed25519 trader@68.183.91.240
sudo cp /etc/caddy/Caddyfile.bak-before-novi-* /etc/caddy/Caddyfile && sudo systemctl reload caddy
sudo userdel -r novi && sudo rm -rf /opt/novi
```
Then delete the DNS record and update the GitHub secrets for the new server.

## Troubleshooting
| Symptom | Check |
|---|---|
| `Missing GitHub secret …` / key or fingerprint format error | Step 2 |
| `Permission denied (publickey)` | Step 1 not run yet, or `VPS_USER` is not `novi`. Re-run step 1 (it re-installs the key) |
| `Host key verification failed` / `no verified host key` | `VPS_HOST` must be `68.183.91.240`; if the server was rebuilt, refresh `deploy/staging/known_hosts` from the provider console |
| Certificate / site not reachable | DNS record (step 3); on the server: `sudo journalctl -u caddy -n 50` |
| Login keeps asking | Re-run step 1 with a new password (it won't duplicate the block; to change the password, edit the hash in `/etc/caddy/Caddyfile` and `sudo systemctl reload caddy`) |
