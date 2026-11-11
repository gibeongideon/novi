// Flat ESLint config shared by the whole monorepo.
import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import simpleImportSort from "eslint-plugin-simple-import-sort";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/coverage/**",
      "**/.turbo/**",
      "**/node_modules/**",
      ".cache/**",
      "docs/coverage/**",
      "deploy/staging/progress/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: { "simple-import-sort": simpleImportSort, "react-hooks": reactHooks },
    rules: {
      "simple-import-sort/imports": "error",
      "simple-import-sort/exports": "error",
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },

  // ── UI layer boundaries (docs/design/COMPONENT-ARCHITECTURE.md §1, §6) ───────────────────
  // A layer imports only from layers below it. Only `engine` (and the headless chatter/realtime
  // data modules) may talk to Odoo through @novi/odoo-client.
  layer("packages/ui/**", "L0–L2 (ui) must stay Odoo-agnostic", [
    "@novi/odoo-client",
    "@novi/odoo-meta",
    "@novi/odoo-expr",
    "@novi/engine",
    "@novi/fields",
    "@novi/views",
    "@novi/shell",
    "@novi/chatter",
    "@novi/realtime",
    "@novi/app-*",
  ]),
  layer("packages/fields/**", "L3 (fields) may not depend on views, shell, apps or Odoo transport", [
    "@novi/odoo-client",
    "@novi/views",
    "@novi/shell",
    "@novi/app-*",
  ]),
  layer("packages/views/**", "L4 (views) may not depend on shell, apps or Odoo transport", [
    "@novi/odoo-client",
    "@novi/shell",
    "@novi/app-*",
  ]),
  layer("packages/shell/**", "shell uses engine hooks, not the Odoo transport or app overrides", [
    "@novi/odoo-client",
    "@novi/app-*",
  ]),
  layer("packages/apps/**", "L5 overrides compose L2–L4 and engine hooks only", ["@novi/odoo-client"]),

  // ── Tokens only: no hard-coded colours or inline styles in UI code (UI-RULES §1, §4) ──────
  {
    files: [
      "packages/{ui,fields,views,shell,chatter}/src/**/*.{ts,tsx}",
      "packages/apps/*/src/**/*.{ts,tsx}",
    ],
    ignores: ["packages/ui/src/tokens.ts", "packages/ui/src/contrast.ts", "**/*.test.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "Literal[value=/#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\\b/]",
          message: "Hard-coded colour: use a design token (packages/ui/src/tokens.ts).",
        },
        {
          selector: "Literal[value=/\\b(?:rgb|rgba|hsl|hsla)\\(/]",
          message: "Hard-coded colour: use a design token (packages/ui/src/tokens.ts).",
        },
        {
          selector: "JSXAttribute[name.name='style']",
          message: "No inline styles in UI packages: use tokens/Tailwind classes or a pattern variant.",
        },
      ],
    },
  },
);

/** ESLint block forbidding imports of higher layers from the given package glob. */
function layer(glob, message, forbidden) {
  return {
    files: [`${glob}/*.{ts,tsx}`],
    rules: {
      "no-restricted-imports": ["error", { patterns: [{ group: forbidden, message }] }],
    },
  };
}
