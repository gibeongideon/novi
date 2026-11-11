import { describe, expect, it } from "vitest";

import {
  appPalette,
  color,
  contrastRatio,
  cssVariables,
  themeStylesheet,
  validateTheme,
} from "../src/index.js";

describe("tokens", () => {
  it("light and dark schemes define the same tokens", () => {
    expect(Object.keys(color.dark).sort()).toEqual(Object.keys(color.light).sort());
  });

  it("generates CSS variables with tenant overrides", () => {
    const vars = cssVariables("light", { light: { primary: "#0a6640" }, fontFamily: "Manrope" });
    expect(vars["--novi-color-primary"]).toBe("#0a6640");
    expect(vars["--novi-color-surface-sunken"]).toBe(color.light.surfaceSunken);
    expect(vars["--novi-font-sans"]).toMatch(/^"Manrope", /);
  });

  it("stylesheet covers light, system dark and forced dark", () => {
    const css = themeStylesheet();
    expect(css).toContain(":root{");
    expect(css).toContain('@media (prefers-color-scheme: dark){:root:not([data-theme="light"])');
    expect(css).toContain(':root[data-theme="dark"]');
  });
});

describe("contrast (WCAG 2.1)", () => {
  it("computes known ratios", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBe(21);
    expect(contrastRatio("#777777", "#ffffff")).toBeCloseTo(4.48, 1);
  });

  it("default theme passes all checks", () => {
    expect(validateTheme({})).toEqual([]);
  });

  it("rejects an unreadable tenant primary", () => {
    const issues = validateTheme({ light: { primary: "#ffe066", primaryText: "#ffffff" } });
    expect(issues.map((i) => i.pair)).toEqual(
      expect.arrayContaining(["primaryText on primary", "primary on surface"]),
    );
  });
});

describe("app tile palette", () => {
  it("app colours stay readable as icons on a white tile (≥ 3:1)", () => {
    for (const p of appPalette.light)
      expect(contrastRatio("#ffffff", p.from), p.from).toBeGreaterThanOrEqual(3);
  });
  it("emits one CSS variable pair per palette entry", () => {
    const vars = cssVariables("dark");
    expect(vars["--novi-app-1-from"]).toBe(appPalette.dark[0].from);
    expect(vars["--novi-app-8-to"]).toBe(appPalette.dark[7].to);
  });
});
