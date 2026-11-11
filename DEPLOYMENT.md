# NOVI staging deployment (novi.dafeapp.com)

**Temporary setup until the MVP** (DECISIONS D-12): NOVI runs on the dafeapp server as a separate Docker Compose project. It has no Kubernetes (D-13) and doesn't touch dafeapp's containers, ports, volumes or database.

```
Browser ──HTTPS──▶ dafeapp Caddy (80/443, owns TLS)
                     ├─ dafeapp.com        → dafeapp web   (unchanged)
                     └─ novi.dafeapp.com   → novi-proxy:80 over docker network "edge"
                                               └─ /opt/novi  (compose project "novi")
                                                    ├─ /progress  live progress dashboard
                                                    └─ later: web app, gateway, Odoo 20
```

**What happens on every push to `main`:** GitHub Actions builds the progress dashboard from TASKS.md, copies `deploy/staging/*` to `/opt/novi` and runs `docker compose -p novi up -d`. It takes about 1–2 minutes.

---

## One-time setup

### 1. GitHub repo
1. Create a **private** repo, e.g. `gibeongideon/novi`, with **no** README, license or .gitignore (the repo already has them).
2. Locally:
   ```bash
   cd ~/Desktop/CODE/NOVI
   git remote add origin git@github.com:<owner>/novi.git
   git add -A && git commit -m "P0.13: project plan, tracking and staging CI/CD"
   git push -u origin main
   ```
   The Odoo tarball is excluded by `.gitignore`. Never push it.

### 2. GitHub Actions secrets
In the repo, go to **Settings → Secrets and variables → Actions → New repository secret**:

| Secret | Value |
|---|---|
| `VPS_HOST` | dafeapp server IP (`192.34.61.66`) |
| `VPS_USER` | SSH user (same as dafeapp's `DO_USER`, e.g. `root`) |
| `VPS_SSH_KEY` | Private SSH key that can log in as that user. The same key as dafeapp's `DO_SSH_KEY` works, but a dedicated deploy key is better (see below). |

**Recommended dedicated key:**
```bash
ssh-keygen -t ed25519 -f ~/.ssh/novi_deploy -C "novi-github-actions" -N ""
ssh-copy-id -i ~/.ssh/novi_deploy.pub root@192.34.61.66
cat ~/.ssh/novi_deploy        # paste this into VPS_SSH_KEY
```

### 3. Server
```bash
ssh root@192.34.61.66
mkdir -p /opt/novi && cd /opt/novi
docker network inspect edge >/dev/null 2>&1 || docker network create edge
docker run --rm caddy:2-alpine caddy hash-password --plaintext 'CHOOSE-A-PASSWORD'
nano .env
```
Put this in `/opt/novi/.env`, keeping the hash in **single quotes**:
```env
NOVI_AUTH_USER=novi
NOVI_AUTH_HASH='$2a$14$...paste-hash...'
```
Also check there's enough free memory: `free -h`. NOVI needs very little now (the Caddy container is capped at 128 MB). Staging Odoo will need about 2 GB later.

### 4. DNS (Cloudflare, where dafeapp.com is managed)
Add an `A` record: `novi` → `192.34.61.66`, with the same proxy setting as the existing `dafeapp.com` record.

### 5. dafeapp side (one-time, already prepared, uncommitted in the dafeapp repo)
The changes add 19 lines and remove none:
- `Caddyfile`: a new `novi.dafeapp.com { reverse_proxy novi-proxy:80 }` block
- `docker-compose.prod.yml`: `caddy` also joins the external `edge` network
- `.github/workflows/deploy.yml`: creates the `edge` network before `up`

Review them with `git diff`, commit, and run dafeapp's deploy workflow as usual. When it's done, check that https://dafeapp.com still works.

### 6. First NOVI deploy
Push to `main`, or run **Actions → Deploy staging → Run workflow**. Then open **https://novi.dafeapp.com** and log in with the basic-auth user. It redirects to `/progress/`.

---

## Why dafeapp is safe
- NOVI publishes **no host ports**, so it can't conflict with 80/443 or anything else.
- Only `novi-proxy` joins `edge`. NOVI can't reach dafeapp's `web`, `db` or `redis`, which stay on dafeapp's private network.
- Separate project name (`novi`), folder (`/opt/novi`) and volumes (`novi_*`). `--remove-orphans` only affects the `novi` project.
- Every NOVI service has a memory/CPU limit.
- If NOVI is down, only novi.dafeapp.com returns 502. dafeapp.com is unaffected.

## Remove NOVI from this server (when moving after the MVP)
```bash
cd /opt/novi && docker compose -p novi down -v && rm -rf /opt/novi
```
Then remove the `novi.dafeapp.com` block (and optionally the `edge` network lines) from dafeapp's repo, and delete the DNS record.

## Troubleshooting
| Symptom | Check |
|---|---|
| Workflow fails "Missing GitHub secret" | Step 2 |
| Workflow fails "/opt/novi/.env missing or placeholders" | Step 3 |
| 502 on novi.dafeapp.com | `docker compose -p novi ps` on the server; is `edge` attached to dafeapp's caddy? `docker network inspect edge` |
| Certificate error | DNS record (step 4); `docker logs <dafeapp caddy container>` |
| 401 loop | Hash not in single quotes in `.env`; regenerate it |
