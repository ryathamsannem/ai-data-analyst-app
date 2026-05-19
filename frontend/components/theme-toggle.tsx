"use client";

import { memo, useCallback, useEffect, useState } from "react";
import {
  applyResolvedTheme,
  persistTheme,
  readStoredTheme,
  resolveTheme,
  type ResolvedTheme,
  type StoredTheme,
} from "@/lib/theme";

export const ThemeToggle = memo(function ThemeToggle({
  className = "",
}: {
  className?: string;
}) {
  const [resolved, setResolved] = useState<ResolvedTheme>("light");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const stored = readStoredTheme();
    const initial = resolveTheme(stored);
    applyResolvedTheme(initial);
    setResolved(initial);
    setMounted(true);
  }, []);

  useEffect(() => {
    if (readStoredTheme() !== null) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      const next = mq.matches ? "dark" : "light";
      applyResolvedTheme(next);
      setResolved(next);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const toggle = useCallback(() => {
    const next: StoredTheme = resolved === "dark" ? "light" : "dark";
    persistTheme(next);
    applyResolvedTheme(next);
    setResolved(next);
  }, [resolved]);

  const label =
    resolved === "dark" ? "Switch to light mode" : "Switch to dark mode";

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      title={label}
      className={
        "inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[color:var(--border-default)] bg-[color:var(--surface-elevated)] text-[color:var(--text-muted)] shadow-[var(--shadow-sm)] transition duration-200 hover:border-[color:var(--accent-muted)] hover:text-[color:var(--foreground)] hover:shadow-[var(--shadow-md)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)]/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--background)] " +
        className
      }
    >
      <span className="sr-only">{label}</span>
      {mounted ? (
        resolved === "dark" ? (
          <SunIcon />
        ) : (
          <MoonIcon />
        )
      ) : (
        <span className="inline-block h-4 w-4" aria-hidden />
      )}
    </button>
  );
});

ThemeToggle.displayName = "ThemeToggle";

function SunIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}
