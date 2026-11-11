# Changelog

All notable changes to NOVI are recorded here, newest first. Every entry references a task ID from [ROADMAP.md](ROADMAP.md).

Format: `- [TaskID] Short description (author)` under a dated heading. Group entries as **Added / Changed / Fixed / Removed** when a day has several.

## Unreleased

### 2026-11-11
- [P0.13] Staging moved to the MT5 server as static files only: `setup-server.sh`, simplified workflow (host-key pinned, unprivileged `novi` user), removed Docker staging files, reverted dafeapp edits (D-12 updated).
- [P0.13] Live staging: progress dashboard generator, `deploy/staging` stack, `deploy-staging.yml` GitHub Actions workflow, DEPLOYMENT.md; dafeapp Caddy routes novi.dafeapp.com (D-12). Replaced Kubernetes/Helm with Docker Compose across plan and tasks (D-13).
- [—] Added TASKS.md (master tickable task list, 99 tasks across 8 phases, with Done-when criteria and phase gates); ROADMAP.md now holds only status, phases and milestones.
- [—] Added tenant provisioning: sign-up creates its own Odoo instance and separate DB (PLAN §2b, D-10, D-11, roadmap tasks P0.11–P0.12, P1.1a–e, P7.1a–c).
- [—] Project planning: approved architecture plan ([PLAN.md](PLAN.md)), created ROADMAP, CHANGELOG and DECISIONS trackers.
