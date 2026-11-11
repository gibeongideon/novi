#!/usr/bin/env node
// Licence policy for production dependencies (P0.2.4): fail on copyleft licences that
// would affect a proprietary SaaS frontend/platform. Dev-only tools are not checked.
import { execSync } from "node:child_process";

const FORBIDDEN = /\b(A?GPL|SSPL|EUPL|OSL|CPAL|RPL)\b/i;
// Packages reviewed and explicitly allowed despite matching (name → reason).
const ALLOW = {};

const raw = execSync("pnpm licenses list --prod --json", { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const byLicense = JSON.parse(raw || "{}");

const violations = [];
let total = 0;
for (const [license, pkgs] of Object.entries(byLicense)) {
  for (const p of pkgs) {
    total++;
    if (FORBIDDEN.test(license) && !ALLOW[p.name]) {
      violations.push(`${p.name}@${(p.versions ?? [p.version]).join(",")}  (${license})`);
    }
  }
}

if (violations.length) {
  console.error(`Licence policy: ${violations.length} forbidden production dependenc(ies):`);
  for (const v of violations) console.error("  - " + v);
  console.error(
    "Add a reviewed exception to ALLOW in scripts/check-licenses.mjs only with a recorded decision.",
  );
  process.exit(1);
}
console.log(`Licence policy OK (${total} production packages checked).`);
