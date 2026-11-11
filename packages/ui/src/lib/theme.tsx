/**
 * Runtime theming (P1.10.3) and light/dark mode. One provider at the app root: injects the token
 * CSS variables (with the tenant's validated overrides) and owns the colour mode, remembered per
 * browser. Components only use tokens; screens change the mode through useColorMode().
 */
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { validateTheme } from "../contrast";
import { type TenantTheme, themeStylesheet } from "../tokens";

export type ColorMode = "light" | "dark" | "system";

/** localStorage key; also read by the inline script in apps/web/index.html (no flash on load). */
export const COLOR_MODE_KEY = "novi.colorMode";

const isMode = (v: unknown): v is ColorMode => v === "light" || v === "dark" || v === "system";

function readStoredMode(): ColorMode | undefined {
  try {
    const v = localStorage.getItem(COLOR_MODE_KEY);
    return isMode(v) ? v : undefined;
  } catch {
    return undefined; // storage blocked (private mode, sandbox)
  }
}

interface ColorModeValue {
  mode: ColorMode;
  /** What the user actually sees right now ("system" resolved through the OS setting). */
  resolved: "light" | "dark";
  setMode(mode: ColorMode): void;
  /** Flip what the user sees: light ↔ dark (stored as an explicit choice). */
  toggle(): void;
}

const ColorModeContext = createContext<ColorModeValue>({
  mode: "system",
  resolved: "light",
  setMode: () => undefined,
  toggle: () => undefined,
});

const systemPrefersDark = () =>
  typeof window !== "undefined" && !!window.matchMedia?.("(prefers-color-scheme: dark)").matches;

export function useColorMode(): ColorModeValue {
  return useContext(ColorModeContext);
}

export interface ThemeProviderProps {
  theme?: TenantTheme;
  /** Used when the user hasn't chosen a mode yet in this browser. */
  defaultMode?: ColorMode;
  children: ReactNode;
}

export function ThemeProvider({ theme = {}, defaultMode = "system", children }: ThemeProviderProps) {
  // Unreadable tenant colours are ignored rather than shipped (contract in DESIGN-SYSTEM §3)
  const safeTheme = useMemo(() => {
    const issues = validateTheme(theme);
    if (issues.length && typeof console !== "undefined") {
      console.warn("[novi] tenant theme rejected (contrast):", issues);
    }
    return issues.length ? { ...theme, light: undefined, dark: undefined } : theme;
  }, [theme]);
  const css = useMemo(() => themeStylesheet(safeTheme), [safeTheme]);

  const [mode, setModeState] = useState<ColorMode>(() => readStoredMode() ?? defaultMode);
  const setMode = useCallback((next: ColorMode) => {
    setModeState(next);
    try {
      localStorage.setItem(COLOR_MODE_KEY, next);
    } catch {
      /* not persisted; still applied for this session */
    }
  }, []);

  const [systemDark, setSystemDark] = useState(systemPrefersDark);
  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!mq) return;
    const onChange = () => setSystemDark(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (mode === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", mode);
  }, [mode]);

  const resolved: "light" | "dark" = mode === "system" ? (systemDark ? "dark" : "light") : mode;
  const toggle = useCallback(() => setMode(resolved === "dark" ? "light" : "dark"), [resolved, setMode]);
  const value = useMemo(() => ({ mode, resolved, setMode, toggle }), [mode, resolved, setMode, toggle]);
  return (
    <ColorModeContext.Provider value={value}>
      <style data-novi-theme dangerouslySetInnerHTML={{ __html: css }} />
      {children}
    </ColorModeContext.Provider>
  );
}
