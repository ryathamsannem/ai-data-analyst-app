"use client";

import { memo } from "react";
import {
  ovCardElevated,
  ovChipAccent,
  ovLabel,
  ovSectionDesc,
  ovSectionTitle,
} from "@/lib/overview-ui";

function SparkleIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      className="text-[color:var(--accent)]"
      aria-hidden
    >
      <path
        d="M12 2l1.2 3.6L17 7l-3.8 1.2L12 12l-1.2-3.8L7 7l3.8-1.4L12 2zM5 14l.8 2.4L8 17l-2.2.7L5 20l-.8-2.3L2 17l2.2-.6L5 14zM19 14l.8 2.4L22 17l-2.2.7L19 20l-.8-2.3L16 17l2.2-.6L19 14z"
        fill="currentColor"
        opacity="0.9"
      />
    </svg>
  );
}

function InsightRowIcon() {
  return (
    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-[color:var(--accent-wash)] text-[color:var(--accent)]">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <path d="M9 12l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="12" cy="12" r="9" />
      </svg>
    </span>
  );
}

export const OverviewAiSummaryPanel = memo(function OverviewAiSummaryPanel({
  bullets,
}: {
  bullets: string[];
}) {
  return (
    <section
      className={`overview-ai-summary-card relative overflow-hidden p-5 sm:p-6 ${ovCardElevated} ring-1 ring-[color:var(--accent)]/10`}
    >
      <div
        className="overview-ai-summary-card__glow pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-[color:var(--accent-wash)] blur-3xl"
        aria-hidden
      />
      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[color:var(--accent-muted)] bg-[color:var(--accent-wash)] shadow-[var(--shadow-sm)]">
            <SparkleIcon />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className={ovSectionTitle}>AI Summary</h2>
              <span className={ovChipAccent}>Auto-generated</span>
            </div>
            <p className={`mt-1.5 ${ovSectionDesc}`}>
              Based on your file, KPI cards, and auto-dashboard charts—updates when you
              upload, switch sheets, or change mapping.
            </p>
          </div>
        </div>
        <span className={`hidden shrink-0 sm:inline ${ovLabel}`}>Insights</span>
      </div>

      <ul className="relative mt-5 space-y-2.5">
        {bullets.map((line, idx) => (
          <li
            key={idx}
            className="saas-btn-premium !flex !h-auto !w-full !cursor-default !justify-start gap-3 !rounded-xl !px-3.5 !py-3 !text-left !text-sm !font-normal !leading-relaxed hover:!-translate-y-0.5"
          >
            <InsightRowIcon />
            <span className="min-w-0 flex-1 pt-0.5">{line}</span>
          </li>
        ))}
      </ul>
    </section>
  );
});

OverviewAiSummaryPanel.displayName = "OverviewAiSummaryPanel";
