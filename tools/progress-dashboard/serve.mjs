#!/usr/bin/env node
// Local progress dashboard with live rebuild: http://localhost:4321
// Rebuilds whenever TASKS.md, ROADMAP.md or CHANGELOG.md changes; the page refreshes itself.
import { execFileSync } from "node:child_process";
import { readFileSync, watch } from "node:fs";
import { createServer } from "node:http";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const out = join(root, ".cache/progress");
const port = Number(process.env.PORT ?? 4321);

function build() {
  execFileSync(process.execPath, [join(here, "build.mjs"), "--root", root, "--out", out, "--refresh", "3"], {
    stdio: ["ignore", "ignore", "inherit"],
  });
  console.log(`[progress] rebuilt ${new Date().toLocaleTimeString()}`);
}

build();
let timer;
for (const f of ["TASKS.md", "ROADMAP.md", "CHANGELOG.md"]) {
  watch(join(root, f), () => {
    clearTimeout(timer);
    timer = setTimeout(build, 200);
  });
}

createServer((req, res) => {
  const file = req.url?.startsWith("/progress.json") ? "progress.json" : "index.html";
  try {
    res.writeHead(200, {
      "Content-Type": file.endsWith(".json") ? "application/json" : "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    });
    res.end(readFileSync(join(out, file)));
  } catch {
    res.writeHead(503).end("building…");
  }
}).listen(port, "127.0.0.1", () => console.log(`[progress] http://localhost:${port}`));
