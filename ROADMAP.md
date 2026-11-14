# NOVI Roadmap

This file shows **where we are and what's next**. Every tickable task is in **[TASKS.md](TASKS.md)**. The architecture is in [PLAN.md](PLAN.md), completed work in [CHANGELOG.md](CHANGELOG.md) and decisions in [DECISIONS.md](DECISIONS.md).

Phases run **strictly in order**. A phase unlocks only when every **Gate** checkbox of the previous phase in TASKS.md is ticked.

---

## ▶ Now / Next

| | |
|---|---|
| **Current phase** | Phase 2 — Engine core |
| **In progress** | — |
| **Next task** | `P2.10.11` palette quick commands (new invoice, new lead…), then `P2.11` kanban and `P2.13` widgets (lines editing, tags, email/phone links) |
| **Blockers** | P1.14.2 needs the platform's Google Cloud / Microsoft Entra OAuth client IDs |
| **Open business items** | Deferred by D-20: Figma kit + design sign-off (Phase 2 gate), Odoo licence + cost (Phase 4 gate) |
| **Last updated** | 2026-11-14 |

---

## Phases

| # | Phase | Weeks (sequential) | Est. | Goal | Status | Started | Completed |
|---|---|---|---|---|---|---|---|
| 0 | Foundations | 1–3 | 3 w | Repo, local Odoo 20, client library, 2FA and provisioning spikes, live staging | ✅ Done | 2026-11-11 | 2026-11-11 |
| 1 | Gateway, tenant provisioning & shell | 4–9 | 6 w | Sign-up → own Odoo + own DB; login; browse menus | ✅ Done (P1.14.2 carried, blocked) | 2026-11-11 | 2026-11-13 |
| 2 | Engine core | 10–17 | 8 w | Any list/form/kanban opens, edits and saves | 🟦 In progress | 2026-11-13 | |
| 3 | Breadth | 18–23 | 6 w | ≥ 90% views native; chatter, reports, realtime | 🔒 Locked | | |
| 4 | Sales + CRM | 24–28 | 5 w | Bespoke pipeline, quotation editor, dashboards | 🔒 Locked | | |
| 5 | Accounting | 29–35 | 7 w | Invoices, payments, reconciliation, reports to the cent | 🔒 Locked | | |
| 6 | Inventory + HR | 36–41 | 6 w | Transfers, stock, employees, time off, expenses | 🔒 Locked | | |
| 7 | SaaS hardening & GA | 42–46 | 5 w | Billing, lifecycle, security, observability, launch | 🔒 Locked | | |

Status legend: ⬜ Not started · 🟦 In progress · ✅ Done · 🔒 Locked

## Milestones

| Milestone | After phase | What it means |
|---|---|---|
| **M0 — Tech proven** | 0 | Both biggest risks (2FA, provisioning) solved on paper and in a script |
| **M1 — First tenant live** | 1 | Self-service sign-up creates a working, isolated instance |
| **M2 — Generic UI** | 2 | Every Odoo app usable through the new engine |
| **M3 — Feature complete (generic)** | 3 | Chatter, reports, realtime, ≥ 90% native coverage |
| **M4 — Pilot: Sales** | 4 | First pilot customer using Sales/CRM |
| **M5 — Pilot: Finance** | 5 | Accountants working in NOVI |
| **M6 — Pilot: Ops & HR** | 6 | All pilot apps signed off |
| **M7 — General Availability** | 7 | Public launch |

## How to update

1. When you start a task, mark it `[~]` in TASKS.md and set **In progress** above.
2. When it's done, tick every subtask in TASKS.md, update the **Done** count in TASKS.md's progress summary, and add a line to CHANGELOG.md.
3. Set **Next task** above to the next unticked task in the current phase.
4. When a phase gate is fully ticked, set the phase ✅ and its **Completed** date, set the next phase 🟦 and its **Started** date, and update **Current phase**.
5. Record any blocker in **Blockers** and mark the task `[!]` in TASKS.md.
