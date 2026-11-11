#!/usr/bin/env node
// Builds a static progress dashboard from TASKS.md, ROADMAP.md, CHANGELOG.md and git history.
// Usage: node tools/progress-dashboard/build.mjs [--root .] [--out dist/progress]
// Zero dependencies on purpose: it runs in CI before the monorepo exists.

import { readFileSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { execSync } from "node:child_process";

const args = process.argv.slice(2);
const arg = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};
const root = resolve(arg("--root", "."));
const out = resolve(arg("--out", "dist/progress"));

const read = (f) => (existsSync(join(root, f)) ? readFileSync(join(root, f), "utf8") : "");
const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
// Minimal inline markdown: `code`, **bold**, [text](link) → text
const inline = (s) =>
  esc(s)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");

// ---------- Parse TASKS.md ----------
// Phase heading:  "# Phase 3 — Breadth (≈ 6 weeks)"
// Task heading:   "### P3.1 Calendar view"
// Gate heading:   "### Phase 3 Gate"  (also "### Phase 7 Gate — GA")
// Checkbox:       "- [x] P3.1.1 text"  or gate "- [ ] text"
function parseTasks(md) {
  const phases = [];
  let phase = null;
  let task = null;
  let inGate = false;
  for (const line of md.split("\n")) {
    let m;
    if ((m = line.match(/^# Phase (\d+) — (.+?)(?:\s*\(([^)]*)\))?\s*$/))) {
      phase = { num: +m[1], title: m[2].trim(), est: m[3] || "", goal: "", tasks: [], gate: [] };
      phases.push(phase);
      task = null;
      inGate = false;
    } else if (!phase) {
      continue;
    } else if ((m = line.match(/^\*\*Goal:\*\*\s*(.+)$/))) {
      phase.goal = m[1];
    } else if (/^### Phase \d+ Gate/.test(line)) {
      inGate = true;
      task = null;
    } else if ((m = line.match(/^### (P\d+\.\d+)\s+(.+)$/))) {
      task = { id: m[1], title: m[2].trim(), items: [], doneWhen: "" };
      phase.tasks.push(task);
      inGate = false;
    } else if ((m = line.match(/^- \[([ x~!\-])\]\s+(.+)$/))) {
      const item = { mark: m[1], text: m[2] };
      if (inGate) phase.gate.push(item);
      else if (task) task.items.push(item);
    } else if (task && (m = line.match(/^\*\*Done when:\*\*\s*(.+)$/))) {
      task.doneWhen = m[1];
    }
  }
  for (const p of phases) {
    for (const t of p.tasks) {
      const live = t.items.filter((i) => i.mark !== "-");
      t.total = live.length;
      t.done = live.filter((i) => i.mark === "x").length;
      t.status =
        t.items.some((i) => i.mark === "!") ? "blocked"
        : t.total > 0 && t.done === t.total ? "done"
        : t.done > 0 || t.items.some((i) => i.mark === "~") ? "progress"
        : "todo";
    }
    p.subTotal = p.tasks.reduce((a, t) => a + t.total, 0);
    p.subDone = p.tasks.reduce((a, t) => a + t.done, 0);
    p.tasksDone = p.tasks.filter((t) => t.status === "done").length;
    p.gateDone = p.gate.filter((g) => g.mark === "x").length;
    p.pct = p.subTotal ? Math.round((p.subDone / p.subTotal) * 100) : 0;
    p.status =
      p.gate.length && p.gateDone === p.gate.length ? "done"
      : p.subDone > 0 || p.tasks.some((t) => t.status !== "todo") ? "progress"
      : "todo";
  }
  return phases;
}

// ---------- Parse ROADMAP.md "Now / Next" table ----------
function parseNow(md) {
  const now = [];
  const sec = md.split(/^## /m).find((s) => s.startsWith("▶ Now") || s.startsWith("Now"));
  if (!sec) return now;
  for (const line of sec.split("\n")) {
    const m = line.match(/^\|\s*\*\*(.+?)\*\*\s*\|\s*(.+?)\s*\|\s*$/);
    if (m) now.push([m[1], m[2]]);
  }
  return now;
}

// ---------- Parse CHANGELOG.md (latest entries) ----------
function parseChangelog(md, limit = 15) {
  const entries = [];
  let date = "";
  for (const line of md.split("\n")) {
    let m;
    if ((m = line.match(/^###\s+(\d{4}-\d{2}-\d{2})/))) date = m[1];
    else if ((m = line.match(/^- (.+)$/)) && date) entries.push({ date, text: m[1] });
    if (entries.length >= limit) break;
  }
  return entries;
}

function gitLog(limit = 15) {
  try {
    const raw = execSync(`git -C "${root}" log -n ${limit} --pretty=format:%h%x09%ad%x09%an%x09%s --date=short`, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return raw
      .split("\n")
      .filter(Boolean)
      .map((l) => {
        const [hash, date, author, subject] = l.split("\t");
        return { hash, date, author, subject };
      });
  } catch {
    return [];
  }
}

// ---------- Render ----------
const phases = parseTasks(read("TASKS.md"));
const now = parseNow(read("ROADMAP.md"));
const changes = parseChangelog(read("CHANGELOG.md"));
const commits = gitLog();

const allSub = phases.reduce((a, p) => a + p.subTotal, 0);
const allDone = phases.reduce((a, p) => a + p.subDone, 0);
const allTasks = phases.reduce((a, p) => a + p.tasks.length, 0);
const allTasksDone = phases.reduce((a, p) => a + p.tasksDone, 0);
const overall = allSub ? Math.round((allDone / allSub) * 100) : 0;
const current = phases.find((p) => p.status !== "done") || phases[phases.length - 1];
const builtAt = new Date().toISOString().replace("T", " ").slice(0, 16) + " UTC";
const sha = process.env.GITHUB_SHA ? process.env.GITHUB_SHA.slice(0, 7) : "";

const statusLabel = { done: "Done", progress: "In progress", todo: "Not started", blocked: "Blocked" };
const markIcon = { x: "✓", "~": "◐", "!": "!", "-": "–", " ": "" };

const bar = (pct) =>
  `<div class="bar" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><span style="width:${pct}%"></span></div>`;

const phaseCards = phases
  .map((p) => {
    const tasks = p.tasks
      .map(
        (t) => `
      <details class="task ${t.status}">
        <summary>
          <span class="dot" aria-hidden="true"></span>
          <span class="tid">${esc(t.id)}</span>
          <span class="ttitle">${inline(t.title)}</span>
          <span class="tcount">${t.done}/${t.total}</span>
        </summary>
        <ul class="items">
          ${t.items
            .map(
              (i) =>
                `<li class="m${i.mark === " " ? "o" : i.mark === "-" ? "d" : i.mark === "!" ? "b" : i.mark === "~" ? "p" : "x"}"><span class="box">${markIcon[i.mark] ?? ""}</span><span>${inline(i.text)}</span></li>`,
            )
            .join("")}
        </ul>
        ${t.doneWhen ? `<p class="dw"><strong>Done when:</strong> ${inline(t.doneWhen)}</p>` : ""}
      </details>`,
      )
      .join("");
    const gate = p.gate
      .map((g) => `<li class="${g.mark === "x" ? "mx" : "mo"}"><span class="box">${g.mark === "x" ? "✓" : ""}</span><span>${inline(g.text)}</span></li>`)
      .join("");
    return `
    <section class="phase ${p.status}${p === current ? " current" : ""}" id="phase-${p.num}">
      <header>
        <div>
          <h2><span class="pn">Phase ${p.num}</span> ${esc(p.title)}</h2>
          <p class="goal">${inline(p.goal)}</p>
        </div>
        <div class="pmeta">
          <span class="badge ${p.status}">${p === current && p.status === "todo" ? "Next up" : statusLabel[p.status]}</span>
          <span class="est">${esc(p.est)}</span>
        </div>
      </header>
      ${bar(p.pct)}
      <p class="stats">${p.pct}% · ${p.tasksDone}/${p.tasks.length} tasks · ${p.subDone}/${p.subTotal} steps · gate ${p.gateDone}/${p.gate.length}</p>
      <div class="tasks">${tasks}</div>
      ${gate ? `<div class="gate"><h3>Phase gate</h3><ul class="items">${gate}</ul></div>` : ""}
    </section>`;
  })
  .join("");

const nav = phases
  .map(
    (p) =>
      `<a href="#phase-${p.num}" class="navp ${p.status}"><span>P${p.num}</span><span class="np">${esc(p.title)}</span><span class="nn">${p.pct}%</span>${bar(p.pct)}</a>`,
  )
  .join("");

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="refresh" content="120">
<title>NOVI Progress</title>
<style>
:root{--bg:#f7f7f5;--surface:#fff;--text:#1d1d1b;--muted:#6b6b66;--border:#e4e3df;--accent:#2f6fde;--done:#1f8a4c;--prog:#c98a12;--block:#c2412d;--track:#ecebe7;--code:#f0efeb}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#141413;--surface:#1d1d1b;--text:#ecebe7;--muted:#9a9a94;--border:#2e2e2b;--accent:#6b9cf0;--done:#4cc27e;--prog:#e3a93a;--block:#e86a55;--track:#2a2a27;--code:#262624}}
:root[data-theme="dark"]{--bg:#141413;--surface:#1d1d1b;--text:#ecebe7;--muted:#9a9a94;--border:#2e2e2b;--accent:#6b9cf0;--done:#4cc27e;--prog:#e3a93a;--block:#e86a55;--track:#2a2a27;--code:#262624}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font:15px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
.wrap{max-width:1100px;margin:0 auto;padding:24px 16px 64px}
h1{font-size:24px;margin:0}
h2{font-size:18px;margin:0}
h3{font-size:14px;margin:0 0 8px;text-transform:uppercase;letter-spacing:.04em;color:var(--muted)}
code{background:var(--code);padding:1px 5px;border-radius:4px;font-size:.9em}
.top{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;flex-wrap:wrap;margin-bottom:20px}
.sub{color:var(--muted);font-size:13px}
.hero{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin-bottom:20px}
.card{background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:16px}
.kpi{font-size:28px;font-weight:650;font-variant-numeric:tabular-nums}
.kl{color:var(--muted);font-size:13px}
.bar{height:8px;background:var(--track);border-radius:99px;overflow:hidden;margin:8px 0}
.bar span{display:block;height:100%;background:var(--accent);border-radius:99px}
.now table{width:100%;border-collapse:collapse}
.now td{padding:6px 0;border-bottom:1px solid var(--border);vertical-align:top}
.now td:first-child{color:var(--muted);width:180px;padding-right:12px}
.now tr:last-child td{border-bottom:0}
.navgrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(125px,1fr));gap:8px;margin:20px 0}
.navp{display:grid;grid-template-columns:auto 1fr;gap:2px 8px;text-decoration:none;color:var(--text);background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:10px}
.navp .np{grid-column:1/-1;font-size:12px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.navp .nn{justify-self:end;font-variant-numeric:tabular-nums;font-size:13px}
.navp .bar{grid-column:1/-1;margin:4px 0 0;height:5px}
.navp.done .bar span{background:var(--done)}
.phase{background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:16px;margin:12px 0}
.phase.current{border-color:var(--accent);box-shadow:0 0 0 1px var(--accent)}
.phase header{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap}
.pn{color:var(--muted);font-weight:500;margin-right:4px}
.goal{margin:4px 0 0;color:var(--muted);font-size:14px}
.pmeta{display:flex;flex-direction:column;align-items:flex-end;gap:4px}
.est{font-size:12px;color:var(--muted)}
.badge{font-size:12px;padding:2px 10px;border-radius:99px;border:1px solid var(--border);white-space:nowrap}
.badge.done{color:var(--done);border-color:var(--done)}
.badge.progress{color:var(--prog);border-color:var(--prog)}
.phase.done .bar span{background:var(--done)}
.stats{font-size:13px;color:var(--muted);margin:0 0 8px;font-variant-numeric:tabular-nums}
.task{border-top:1px solid var(--border)}
.task summary{display:flex;align-items:center;gap:10px;padding:8px 2px;cursor:pointer;list-style:none}
.task summary::-webkit-details-marker{display:none}
.dot{width:10px;height:10px;border-radius:50%;border:2px solid var(--muted);flex:none}
.task.done .dot{background:var(--done);border-color:var(--done)}
.task.progress .dot{border-color:var(--prog);background:linear-gradient(90deg,var(--prog) 50%,transparent 50%)}
.task.blocked .dot{background:var(--block);border-color:var(--block)}
.tid{font:12px ui-monospace,monospace;color:var(--muted);min-width:44px}
.ttitle{flex:1}
.tcount{font-size:12px;color:var(--muted);font-variant-numeric:tabular-nums}
.items{list-style:none;margin:0 0 8px;padding:0 0 0 22px}
.items li{display:flex;gap:8px;padding:3px 0;font-size:14px}
.box{flex:none;width:16px;height:16px;border:1.5px solid var(--muted);border-radius:4px;font-size:11px;line-height:13px;text-align:center;margin-top:3px}
.mx .box{background:var(--done);border-color:var(--done);color:#fff}
.mx>span:last-child{color:var(--muted);text-decoration:line-through}
.mp .box{border-color:var(--prog);color:var(--prog)}
.mb .box{border-color:var(--block);color:var(--block)}
.md>span:last-child{text-decoration:line-through;color:var(--muted)}
.dw{font-size:13px;color:var(--muted);margin:0 0 10px 22px}
.gate{border-top:1px dashed var(--border);margin-top:8px;padding-top:10px}
.gate .items{padding-left:0}
.cols{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:20px}
@media (max-width:760px){.cols{grid-template-columns:1fr}.now td:first-child{width:120px}}
.log{list-style:none;margin:0;padding:0}
.log li{padding:6px 0;border-bottom:1px solid var(--border);font-size:14px}
.log li:last-child{border-bottom:0}
.log .d{color:var(--muted);font-size:12px;font-variant-numeric:tabular-nums;margin-right:6px}
.empty{color:var(--muted);font-size:14px}
</style>
</head>
<body>
<div class="wrap">
  <div class="top">
    <div><h1>NOVI progress</h1><div class="sub">Odoo 20 frontend replacement · generated from TASKS.md</div></div>
    <div class="sub">Built ${esc(builtAt)}${sha ? ` · commit <code>${esc(sha)}</code>` : ""} · auto-refreshes</div>
  </div>

  <div class="hero">
    <div class="card"><div class="kl">Overall</div><div class="kpi">${overall}%</div>${bar(overall)}</div>
    <div class="card"><div class="kl">Current phase</div><div class="kpi">P${current ? current.num : "–"}</div><div class="kl">${current ? esc(current.title) : ""}</div></div>
    <div class="card"><div class="kl">Tasks done</div><div class="kpi">${allTasksDone}<span class="kl"> / ${allTasks}</span></div></div>
    <div class="card"><div class="kl">Steps done</div><div class="kpi">${allDone}<span class="kl"> / ${allSub}</span></div></div>
  </div>

  <div class="card now">
    <h3>Now / next</h3>
    ${now.length ? `<table>${now.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${inline(v)}</td></tr>`).join("")}</table>` : `<p class="empty">No "Now / Next" table found in ROADMAP.md.</p>`}
  </div>

  <nav class="navgrid" aria-label="Phases">${nav}</nav>

  ${phaseCards}

  <div class="cols">
    <div class="card"><h3>Changelog</h3>${changes.length ? `<ul class="log">${changes.map((c) => `<li><span class="d">${esc(c.date)}</span>${inline(c.text)}</li>`).join("")}</ul>` : `<p class="empty">No entries yet.</p>`}</div>
    <div class="card"><h3>Recent commits</h3>${commits.length ? `<ul class="log">${commits.map((c) => `<li><span class="d">${esc(c.date)}</span><code>${esc(c.hash)}</code> ${esc(c.subject)} <span class="d">— ${esc(c.author)}</span></li>`).join("")}</ul>` : `<p class="empty">No commits yet.</p>`}</div>
  </div>
</div>
</body>
</html>
`;

mkdirSync(out, { recursive: true });
writeFileSync(join(out, "index.html"), html);
writeFileSync(
  join(out, "progress.json"),
  JSON.stringify(
    {
      builtAt,
      commit: sha,
      overall,
      tasks: { done: allTasksDone, total: allTasks },
      steps: { done: allDone, total: allSub },
      currentPhase: current?.num ?? null,
      phases: phases.map(({ num, title, pct, status, tasksDone, subDone, subTotal, gateDone, gate, tasks }) => ({
        num, title, pct, status,
        tasks: { done: tasksDone, total: tasks.length },
        steps: { done: subDone, total: subTotal },
        gate: { done: gateDone, total: gate.length },
      })),
    },
    null,
    2,
  ),
);
console.log(`Progress dashboard → ${join(out, "index.html")} (overall ${overall}%, ${allTasksDone}/${allTasks} tasks, ${phases.length} phases)`);
