import { useCallback, useEffect, useState } from "react";

const THEME_KEY = "isa-rag:theme";

export type ThemeMode = "dark" | "light";

export function readTheme(): ThemeMode {
  try {
    const v = localStorage.getItem(THEME_KEY);
    if (v === "light" || v === "dark") return v;
  } catch {
    /* ignore */
  }
  return "dark";
}

export function applyTheme(mode: ThemeMode): void {
  const root = document.documentElement;
  root.classList.add("wa-theme-shoelace", "wa-palette-shoelace");
  root.classList.toggle("wa-dark", mode === "dark");
  root.classList.toggle("wa-light", mode === "light");
  root.style.colorScheme = mode;
  try {
    localStorage.setItem(THEME_KEY, mode);
  } catch {
    /* ignore */
  }
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", mode === "light" ? "#f0f7ff" : "#060d18");
}

export function useTheme(): [ThemeMode, () => void] {
  const [mode, setMode] = useState<ThemeMode>(() => readTheme());
  useEffect(() => {
    applyTheme(mode);
  }, [mode]);
  const toggle = useCallback(() => {
    setMode((m) => (m === "dark" ? "light" : "dark"));
  }, []);
  return [mode, toggle];
}
