#!/usr/bin/env node
// Creates (or tops up) library package skeletons. Never overwrites existing files.
// Usage: node scripts/scaffold-packages.mjs
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const libs = [
  [
    "packages/odoo-client",
    "@novi/odoo-client",
    "Transports, typed errors and helpers for talking to an unmodified Odoo 20",
    [],
  ],
  [
    "packages/odoo-expr",
    "@novi/odoo-expr",
    "Evaluator for Odoo Python expressions and domains used in view arch",
    [],
  ],
  [
    "packages/odoo-meta",
    "@novi/odoo-meta",
    "Odoo view arch XML → normalized ViewSchema, plus field specification builder",
    ["@novi/odoo-expr"],
  ],
  [
    "packages/engine",
    "@novi/engine",
    "Headless runtime: records, onchange, save, actions, routing, access",
    ["@novi/odoo-client", "@novi/odoo-meta", "@novi/odoo-expr"],
  ],
  ["packages/ui", "@novi/ui", "NOVI design system: tokens, Tailwind preset, primitives", []],
  ["packages/fields", "@novi/fields", "Field widget registry and core widgets", ["@novi/engine", "@novi/ui"]],
  [
    "packages/views",
    "@novi/views",
    "List, Form, Kanban, Calendar, Pivot, Graph, Activity and Search views",
    ["@novi/engine", "@novi/fields", "@novi/ui"],
  ],
  [
    "packages/chatter",
    "@novi/chatter",
    "Chatter: messages, followers, activities, attachments",
    ["@novi/odoo-client", "@novi/ui"],
  ],
  [
    "packages/realtime",
    "@novi/realtime",
    "Odoo bus (websocket) client and query invalidation",
    ["@novi/odoo-client"],
  ],
  [
    "packages/shell",
    "@novi/shell",
    "App shell: launcher, menus, command palette, breadcrumbs",
    ["@novi/engine", "@novi/ui"],
  ],
  [
    "packages/apps/sales",
    "@novi/app-sales",
    "Bespoke Sales screens (overrides)",
    ["@novi/engine", "@novi/views"],
  ],
  ["packages/apps/crm", "@novi/app-crm", "Bespoke CRM screens (overrides)", ["@novi/engine", "@novi/views"]],
  [
    "packages/apps/accounting",
    "@novi/app-accounting",
    "Bespoke Accounting screens (overrides)",
    ["@novi/engine", "@novi/views"],
  ],
  [
    "packages/apps/inventory",
    "@novi/app-inventory",
    "Bespoke Inventory screens (overrides)",
    ["@novi/engine", "@novi/views"],
  ],
  ["packages/apps/hr", "@novi/app-hr", "Bespoke HR screens (overrides)", ["@novi/engine", "@novi/views"]],
];

const write = (file, content) => {
  if (existsSync(file)) return false;
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
  return true;
};

let created = 0;
for (const [dir, name, description, deps] of libs) {
  const abs = join(root, dir);
  const base = relative(abs, join(root, "tsconfig.base.json"));
  const pkg = {
    name,
    version: "0.0.0",
    private: true,
    description,
    type: "module",
    main: "./dist/index.js",
    types: "./dist/index.d.ts",
    exports: { ".": { types: "./dist/index.d.ts", import: "./dist/index.js" } },
    files: ["dist"],
    scripts: {
      build: "tsup src/index.ts --format esm --dts --clean",
      typecheck: "tsc --noEmit",
      lint: "eslint src",
      test: "vitest run --passWithNoTests",
    },
    dependencies: Object.fromEntries(deps.map((d) => [d, "workspace:*"])),
  };
  if (!deps.length) delete pkg.dependencies;
  if (write(join(abs, "package.json"), JSON.stringify(pkg, null, 2) + "\n")) created++;
  write(
    join(abs, "tsconfig.json"),
    JSON.stringify(
      { extends: base, compilerOptions: { outDir: "dist", rootDir: "." }, include: ["src"] },
      null,
      2,
    ) + "\n",
  );
  write(
    join(abs, "src/index.ts"),
    `/** ${name}: ${description}. */\nexport const PACKAGE_NAME = "${name}";\n`,
  );
}
console.log(`scaffold: ${created} new package(s)`);
