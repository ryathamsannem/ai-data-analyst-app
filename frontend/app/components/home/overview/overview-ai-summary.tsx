"use client";

import { memo, useMemo, useState } from "react";
import {
  OVERVIEW_AI_SUMMARY_INITIAL_VISIBLE,
  partitionOverviewAiSummaryBullets,
} from "@/lib/overview-ai-summary";
import {
  ovBtnSecondarySm,
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
  const [expanded, setExpanded] = useState(false);
  const { initial, extra, hasMore } = useMemo(
    () => partitionOverviewAiSummaryBullets(bullets, OVERVIEW_AI_SUMMARY_INITIAL_VISIBLE),
    [bullets]
  );
  const visibleBullets = expanded ? bullets : initial;

  return (
    <section
      className={`overview-ai-summary-card relative overflow-hidden p-4 sm:p-5 ${ovCardElevated} ring-1 ring-[color:var(--accent)]/8`}
    >
      <div
        className="overview-ai-summary-card__glow pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full bg-[color:var(--accent-wash)] blur-3xl"
        aria-hidden
      />
      <div className="relative flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-2.5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[color:var(--accent-muted)] bg-[color:var(--accent-wash)] shadow-[var(--shadow-sm)]">
            <SparkleIcon />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className={ovSectionTitle}>AI Summary</h2>
              <span className={ovChipAccent}>Executive snapshot</span>
            </div>
            <p className={`mt-1 ${ovSectionDesc}`}>
              Key takeaways from your dataset—updates when you upload, switch sheets, or
              change mapping.
            </p>
          </div>
        </div>
        <span className={`hidden shrink-0 sm:inline ${ovLabel}`}>Insights</span>
      </div>

      <ul className="relative mt-3.5 space-y-2">
        {visibleBullets.map((line, idx) => (
          <li
            key={`${idx}-${line.slice(0, 24)}`}
            className="overview-ai-summary-card__insight saas-btn-premium !flex !h-auto !w-full !cursor-default !justify-start gap-2.5 !rounded-lg !px-3 !py-2.5 !text-left !text-sm !font-normal !leading-relaxed hover:!translate-y-0"
          >
            <InsightRowIcon />
            <span className="min-w-0 flex-1 pt-0.5">{line}</span>
          </li>
        ))}
      </ul>

      {hasMore ? (
        <div className="relative mt-2.5 flex justify-start">
          <button
            type="button"
            className={`${ovBtnSecondarySm} !text-[color:var(--accent)]`}
            aria-expanded={expanded}
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded
              ? "Show less"
              : `Show more insights (${extra.length} more)`}
          </button>
        </div>
      ) : null}
    </section>
  );
});

OverviewAiSummaryPanel.displayName = "OverviewAiSummaryPanel";
