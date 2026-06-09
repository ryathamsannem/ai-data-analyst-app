/** Resolved chart axis colors — UI tokens and PNG export. */

export type ResolvedChartAxisTheme = {
  tick: string;
  label: string;
  line: string;
  grid: string;
};

export const CHART_AXIS_CSS = {
  tick: "var(--chart-axis-tick)",
  label: "var(--chart-axis-label)",
  line: "var(--chart-axis-line)",
} as const;

const LIGHT_FALLBACK: ResolvedChartAxisTheme = {
  tick: "#64748b",
  label: "#475569",
  line: "#e2e8f0",
  grid: "#eef2f7",
};

const DARK_FALLBACK: ResolvedChartAxisTheme = {
  tick: "#94a3b8",
  label: "#cbd5e1",
  line: "rgba(148, 163, 184, 0.42)",
  grid: "rgba(148, 163, 184, 0.28)",
};

function readCssVar(el: Element, name: string, fallback: string): string {
  const v = getComputedStyle(el).getPropertyValue(name).trim();
  return v || fallback;
}

/** Read computed axis theme from nearest `.chart-viz-theme` or document root. */
export function readResolvedChartAxisTheme(
  scope?: Element | null
): ResolvedChartAxisTheme {
  if (typeof document === "undefined") return LIGHT_FALLBACK;

  const dark = document.documentElement.classList.contains("dark");
  const fallback = dark ? DARK_FALLBACK : LIGHT_FALLBACK;
  const host =
    (scope instanceof HTMLElement ? scope.closest(".chart-viz-theme") : null) ??
    document.documentElement;

  return {
    tick: readCssVar(host, "--chart-axis-tick", fallback.tick),
    label: readCssVar(host, "--chart-axis-label", fallback.label),
    line: readCssVar(host, "--chart-axis-line", fallback.line),
    grid: fallback.grid,
  };
}

export function chartLayoutWidthKey(widthPx: number, step = 8): number {
  const w = Math.max(0, widthPx);
  return Math.round(w / step) * step;
}
