/**
 * NOVI design tokens (P0.9.1). Brand-neutral defaults; tenants override a small, safe subset
 * (see TENANT_OVERRIDABLE). Every token becomes a CSS variable `--novi-<group>-<name>`.
 */

export type ColorScheme = "light" | "dark";

export const color = {
  light: {
    bg: "#f7f7f5",
    surface: "#ffffff",
    surfaceSunken: "#f0efeb",
    text: "#1d1d1b",
    textMuted: "#6b6b66",
    border: "#e4e3df",
    primary: "#2f5fd0",
    primaryText: "#ffffff",
    accent: "#0f8b8d",
    success: "#1f7a45",
    warning: "#a86a00",
    danger: "#c2412d",
    info: "#2f6fde",
    focus: "#2f5fd0",
  },
  dark: {
    bg: "#141413",
    surface: "#1d1d1b",
    surfaceSunken: "#262624",
    text: "#ecebe7",
    textMuted: "#a3a39d",
    border: "#34342f",
    primary: "#7ea2f2",
    primaryText: "#10131a",
    accent: "#4cc3c4",
    success: "#4cc27e",
    warning: "#e3a93a",
    danger: "#ef7d69",
    info: "#7ea2f2",
    focus: "#7ea2f2",
  },
} as const satisfies Record<ColorScheme, Record<string, string>>;

export type ColorToken = keyof typeof color.light;

export const typography = {
  fontSans: `"Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`,
  fontMono: `ui-monospace, "SF Mono", Menlo, Consolas, monospace`,
  /** rem sizes: xs, sm, base, lg, xl, 2xl, 3xl */
  size: {
    xs: "0.75rem",
    sm: "0.875rem",
    base: "0.9375rem",
    lg: "1.0625rem",
    xl: "1.25rem",
    "2xl": "1.5rem",
    "3xl": "1.875rem",
  },
  weight: { regular: "400", medium: "500", semibold: "600", bold: "700" },
  lineHeight: { tight: "1.25", normal: "1.5" },
} as const;

/** 4px grid */
export const space = {
  0: "0",
  1: "4px",
  2: "8px",
  3: "12px",
  4: "16px",
  5: "20px",
  6: "24px",
  8: "32px",
  10: "40px",
  12: "48px",
  16: "64px",
} as const;

export const radius = { sm: "4px", md: "8px", lg: "12px", xl: "16px", full: "9999px" } as const;

export const shadow = {
  sm: "0 1px 2px rgb(0 0 0 / 0.06)",
  md: "0 4px 12px rgb(0 0 0 / 0.08)",
  lg: "0 12px 32px rgb(0 0 0 / 0.12)",
} as const;

export const motion = {
  fast: "120ms",
  normal: "200ms",
  slow: "320ms",
  easing: "cubic-bezier(0.2, 0, 0, 1)",
} as const;

/** Layout grammar (P0.9.2): how Odoo structures map onto NOVI layout. */
export const layout = {
  sidebarWidth: "248px",
  headerHeight: "56px",
  contentMaxWidth: "1280px",
  formColumns: 12,
  dialog: { sm: "420px", md: "640px", lg: "880px", xl: "1120px" },
  drawer: "440px",
  gutterMobile: "16px",
} as const;

/** The only tokens a tenant may override (P0.9.4 theming contract). */
export const TENANT_OVERRIDABLE = ["primary", "primaryText", "accent"] as const;
export type TenantColorOverride = Partial<Record<(typeof TENANT_OVERRIDABLE)[number], string>>;

export interface TenantTheme {
  /** Product name shown in the shell and emails. */
  name?: string;
  logoUrl?: string;
  faviconUrl?: string;
  /** Optional Google Font family name; falls back to the default stack. */
  fontFamily?: string;
  light?: TenantColorOverride;
  dark?: TenantColorOverride;
}

const kebab = (s: string) => s.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase());

/** CSS custom properties for one scheme, with tenant overrides applied. */
export function cssVariables(scheme: ColorScheme, theme: TenantTheme = {}): Record<string, string> {
  const vars: Record<string, string> = {};
  const colors = { ...color[scheme], ...(theme[scheme] ?? {}) };
  for (const [k, v] of Object.entries(colors)) vars[`--novi-color-${kebab(k)}`] = v;
  vars["--novi-font-sans"] = theme.fontFamily
    ? `"${theme.fontFamily}", ${typography.fontSans}`
    : typography.fontSans;
  vars["--novi-font-mono"] = typography.fontMono;
  for (const [k, v] of Object.entries(typography.size)) vars[`--novi-text-${k}`] = v;
  for (const [k, v] of Object.entries(space)) vars[`--novi-space-${k}`] = v;
  for (const [k, v] of Object.entries(radius)) vars[`--novi-radius-${k}`] = v;
  for (const [k, v] of Object.entries(shadow)) vars[`--novi-shadow-${k}`] = v;
  for (const [k, v] of Object.entries(motion)) vars[`--novi-motion-${k}`] = v;
  return vars;
}

/** Full stylesheet: light on :root, dark via prefers-color-scheme and [data-theme="dark"]. */
export function themeStylesheet(theme: TenantTheme = {}): string {
  const block = (sel: string, vars: Record<string, string>) =>
    `${sel}{${Object.entries(vars)
      .map(([k, v]) => `${k}:${v}`)
      .join(";")}}`;
  const dark = cssVariables("dark", theme);
  return [
    block(":root", cssVariables("light", theme)),
    `@media (prefers-color-scheme: dark){${block(':root:not([data-theme="light"])', dark)}}`,
    block(':root[data-theme="dark"]', dark),
  ].join("\n");
}
