/**
 * WCAG 2.1 contrast checks (P0.9.5). Used to validate tenant colour overrides before
 * they are accepted, so white-labelling can never make the UI unreadable.
 */
import { color, type ColorScheme, type TenantTheme } from "./tokens.js";

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function parseHex(hex: string): [number, number, number] {
  const m = hex.trim().match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) throw new Error(`Invalid hex colour: ${hex}`);
  let h = m[1]!;
  if (h.length === 3) h = [...h].map((c) => c + c).join("");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

export function luminance(hex: string): number {
  const [r, g, b] = parseHex(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(a: string, b: string): number {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return Math.round(((l1 + 0.05) / (l2 + 0.05)) * 100) / 100;
}

export interface ContrastIssue {
  scheme: ColorScheme;
  pair: string;
  ratio: number;
  required: number;
}

/**
 * Checks the pairs that matter once a tenant overrides colours:
 *  - text on primary buttons (4.5:1, normal text)
 *  - primary/accent as text or icons on the surface (3:1, UI components / large text)
 */
export function validateTheme(theme: TenantTheme): ContrastIssue[] {
  const issues: ContrastIssue[] = [];
  for (const scheme of ["light", "dark"] as const) {
    const c = { ...color[scheme], ...(theme[scheme] ?? {}) };
    const checks: [string, string, string, number][] = [
      ["primaryText on primary", c.primaryText, c.primary, 4.5],
      ["primary on surface", c.primary, c.surface, 3],
      ["accent on surface", c.accent, c.surface, 3],
      ["text on bg", c.text, c.bg, 4.5],
    ];
    for (const [pair, fg, bg, required] of checks) {
      const ratio = contrastRatio(fg, bg);
      if (ratio < required) issues.push({ scheme, pair, ratio, required });
    }
  }
  return issues;
}
