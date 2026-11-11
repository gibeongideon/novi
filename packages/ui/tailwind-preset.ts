/**
 * Tailwind preset generated from the design tokens (P1.10.1). Every value points at a token CSS
 * variable (`--novi-…`, emitted by themeStylesheet()), so tokens.ts stays the single source and
 * tenant themes / dark mode switch at runtime without rebuilding CSS.
 * Apps use it:  presets: [noviPreset], content: [..., "../../packages/ui/src/**\/*.tsx"]
 */
import type { Config } from "tailwindcss";

import { color, layout, radius, shadow, space, typography } from "./src/tokens";

const kebab = (s: string) => s.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase());
const vars = <T extends object>(obj: T, prefix: string, name: (k: string) => string = (k) => k) =>
  Object.fromEntries(Object.keys(obj).map((k) => [name(k), `var(--novi-${prefix}-${kebab(k)})`]));

const noviPreset: Partial<Config> = {
  darkMode: ["selector", '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        ...vars(color.light, "color", kebab),
        // Tailwind's preflight reads gray.400 for placeholders; point it at the token (no stray hex)
        gray: { 400: "var(--novi-color-text-muted)" },
      },
      // preflight's default border colour → token
      borderColor: { DEFAULT: "var(--novi-color-border)" },
      fontFamily: { sans: "var(--novi-font-sans)", mono: "var(--novi-font-mono)" },
      fontSize: vars(typography.size, "text"),
      spacing: {
        ...vars(space, "space"),
        // layout tokens (single source: tokens.layout) → w-sidebar, h-header, inset-y-header…
        sidebar: layout.sidebarWidth,
        header: layout.headerHeight,
        drawer: layout.drawer,
      },
      maxWidth: {
        content: layout.contentMaxWidth,
        "dialog-sm": layout.dialog.sm,
        "dialog-md": layout.dialog.md,
        "dialog-lg": layout.dialog.lg,
        "dialog-xl": layout.dialog.xl,
      },
      borderRadius: vars(radius, "radius"),
      boxShadow: vars(shadow, "shadow"),
      transitionDuration: { fast: "var(--novi-motion-fast)", DEFAULT: "var(--novi-motion-normal)" },
      transitionTimingFunction: { DEFAULT: "var(--novi-motion-easing)" },
      ringColor: { DEFAULT: "var(--novi-color-focus)" },
    },
  },
};

export default noviPreset;
