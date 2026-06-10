"use client";

import { memo, useMemo, type ReactNode } from "react";
import { ovCardInteractive, ovKpiGradientTop, ovMuted } from "@/lib/overview-ui";

type KpiCardData = {
  title: string;
  value: string;
  subtitle?: string | null;
};

function kpiValueTone(title: string): "people" | "metric" | "risk" | "neutral" {
  const t = title.toLowerCase();
  if (
    t.includes("employee") ||
    t.includes("headcount") ||
    t.includes("staff") ||
    t.includes("row") ||
    t.includes("record") ||
    (t.includes("count") && !t.includes("account"))
  ) {
    return "people";
  }
  if (
    t.includes("salary") ||
    t.includes("revenue") ||
    t.includes("sales") ||
    t.includes("profit") ||
    t.includes("cost") ||
    t.includes("amount") ||
    t.includes("budget")
  ) {
    return "metric";
  }
  if (
    t.includes("risk") ||
    t.includes("missing") ||
    t.includes("null") ||
    t.includes("gap") ||
    t.includes("alert") ||
    t.includes("issue")
  ) {
    return "risk";
  }
  return "neutral";
}

function kpiIconKind(title: string, index: number): "metric" | "trend" | "category" | "rows" {
  const t = title.toLowerCase();
  if (t.includes("row") || t.includes("record")) return "rows";
  if (t.includes("top") || t.includes("product") || t.includes("region")) return "category";
  if (t.includes("trend") || t.includes("growth") || t.includes("change")) return "trend";
  if (index % 4 === 1) return "trend";
  if (index % 4 === 2) return "category";
  if (index % 4 === 3) return "rows";
  return "metric";
}

function trendChipFromContext(contextLine: string): { label: string; tone: "up" | "down" | "neutral" } | null {
  const c = contextLine.toLowerCase();
  if (!c.trim()) return null;
  if (
    c.includes("highest") ||
    c.includes("peak") ||
    c.includes("largest") ||
    c.includes("increase") ||
    c.includes("growth") ||
    c.includes("up ")
  ) {
    return { label: "Peak", tone: "up" };
  }
  if (c.includes("lowest") || c.includes("decline") || c.includes("decrease") || c.includes("down ")) {
    return { label: "Low", tone: "down" };
  }
  return { label: "Insight", tone: "neutral" };
}

function KpiIcon({ kind }: { kind: ReturnType<typeof kpiIconKind> }) {
  const paths: Record<string, ReactNode> = {
    metric: (
      <>
        <path d="M4 19V5" />
        <path d="M8 17v-6" />
        <path d="M12 17V9" />
        <path d="M16 17v-3" />
        <path d="M20 17V7" />
      </>
    ),
    trend: <path d="M4 16l5-5 4 3 7-8" />,
    category: (
      <>
        <circle cx="12" cy="8" r="3" />
        <path d="M5 19c0-3.3 3.1-5 7-5s7 1.7 7 5" />
      </>
    ),
    rows: (
      <>
        <path d="M5 7h14M5 12h14M5 17h10" />
      </>
    ),
  };
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {paths[kind]}
    </svg>
  );
}

export const OverviewKpiCard = memo(function OverviewKpiCard({
  card,
  contextLine,
  index,
}: {
  card: KpiCardData;
  contextLine?: string | null;
  index: number;
}) {
  const iconKind = useMemo(() => kpiIconKind(card.title, index), [card.title, index]);
  const valueTone = useMemo(() => kpiValueTone(card.title), [card.title]);
  const valueToneClass =
    valueTone === "people"
      ? "overview-kpi-value overview-kpi-value--people"
      : valueTone === "metric"
        ? "overview-kpi-value overview-kpi-value--metric"
        : valueTone === "risk"
          ? "overview-kpi-value overview-kpi-value--risk"
          : "overview-kpi-value overview-kpi-value--neutral";
  const trend = useMemo(
    () => (contextLine ? trendChipFromContext(contextLine) : null),
    [contextLine],
  );

  const trendCls =
    trend?.tone === "up"
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
      : trend?.tone === "down"
        ? "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300"
        : "border-[color:var(--accent-muted)] bg-[color:var(--accent-wash)] text-[color:var(--accent)]";

  return (
    <article
      className={`overview-kpi-card group relative flex min-h-[140px] flex-col overflow-hidden p-4 sm:p-[1.125rem] ${ovCardInteractive}`}
    >
      <span className={`overview-kpi-card__accent ${ovKpiGradientTop}`} aria-hidden />
      <div className="flex items-start justify-between gap-2">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[color:var(--accent-wash)] text-[color:var(--accent)] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] transition duration-200 group-hover:scale-[1.02]">
          <KpiIcon kind={iconKind} />
        </span>
        {trend ? (
          <span
            className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${trendCls}`}
          >
            {trend.label}
          </span>
        ) : null}
      </div>
      <p className={`mt-4 ${ovMuted} text-[11px] font-semibold uppercase tracking-[0.06em]`}>
        {card.title}
      </p>
      <p className={valueToneClass}>{card.value}</p>
      {card.subtitle ? (
        <p className="mt-1.5 text-sm font-medium leading-snug text-[color:var(--text-muted)]">
          {card.subtitle}
        </p>
      ) : null}
      {contextLine ? (
        <p
          className={`mt-auto border-t border-[color:var(--border-default)] pt-3 text-xs leading-snug ${ovMuted}`}
        >
          {contextLine}
        </p>
      ) : (
        <span className="mt-auto block min-h-[0.5rem]" aria-hidden />
      )}
    </article>
  );
});

OverviewKpiCard.displayName = "OverviewKpiCard";
