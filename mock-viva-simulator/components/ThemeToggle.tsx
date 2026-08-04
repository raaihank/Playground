"use client";

import { useEffect, useState } from "react";
import { THEME_STORAGE_KEY, type Theme } from "@/lib/theme";

const ORDER: Theme[] = ["system", "light", "dark"];

const META: Record<Theme, { icon: string; label: string }> = {
  system: { icon: "🖥", label: "System theme" },
  light: { icon: "☀️", label: "Light theme" },
  dark: { icon: "🌙", label: "Dark theme" },
};

function systemPrefersDark(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function applyTheme(theme: Theme) {
  const dark = theme === "dark" || (theme === "system" && systemPrefersDark());
  document.documentElement.classList.toggle("dark", dark);
}

export default function ThemeToggle() {
  // Start from "system" so server and first client render match; the real stored
  // value is read in the effect below (after hydration) to avoid a mismatch.
  const [theme, setTheme] = useState<Theme>("system");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(THEME_STORAGE_KEY) as Theme | null;
    if (stored === "light" || stored === "dark" || stored === "system") {
      setTheme(stored);
    }
    setMounted(true);
  }, []);

  // Keep "system" in sync with live OS changes.
  useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme]);

  function cycle() {
    const next = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length];
    setTheme(next);
    localStorage.setItem(THEME_STORAGE_KEY, next);
    applyTheme(next);
  }

  const meta = META[theme];

  return (
    <button
      type="button"
      onClick={cycle}
      // Hidden until mounted so we never flash the wrong icon during hydration.
      suppressHydrationWarning
      aria-label={`${meta.label} (click to change)`}
      title={`${meta.label} — click to change`}
      className={`fixed bottom-4 right-4 z-50 flex h-10 w-10 items-center justify-center rounded-full border border-slate-300 bg-white/90 text-base shadow-md backdrop-blur transition-opacity hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800/90 dark:hover:bg-slate-700 ${mounted ? "opacity-100" : "opacity-0"}`}
    >
      <span aria-hidden>{meta.icon}</span>
    </button>
  );
}
