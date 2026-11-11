/**
 * Runtime theming (P1.10.3): injects the token CSS variables (with the tenant's validated
 * overrides) and controls light/dark. One provider at the app root; components only use tokens.
 */
import { type ReactNode, useEffect, useMemo } from "react";

import { validateTheme } from "../contrast";
import { type TenantTheme, themeStylesheet } from "../tokens";

export type ColorMode = "light" | "dark" | "system";

export interface ThemeProviderProps {
  theme?: TenantTheme;
  mode?: ColorMode;
  children: ReactNode;
}

export function ThemeProvider({ theme = {}, mode = "system", children }: ThemeProviderProps) {
  // Unreadable tenant colours are ignored rather than shipped (contract in DESIGN-SYSTEM §3)
  const safeTheme = useMemo(() => {
    const issues = validateTheme(theme);
    if (issues.length && typeof console !== "undefined") {
      console.warn("[novi] tenant theme rejected (contrast):", issues);
    }
    return issues.length ? { ...theme, light: undefined, dark: undefined } : theme;
  }, [theme]);
  const css = useMemo(() => themeStylesheet(safeTheme), [safeTheme]);

  useEffect(() => {
    const root = document.documentElement;
    if (mode === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", mode);
  }, [mode]);

  return (
    <>
      <style data-novi-theme dangerouslySetInnerHTML={{ __html: css }} />
      {children}
    </>
  );
}
