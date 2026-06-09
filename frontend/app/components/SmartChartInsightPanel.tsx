"use client";

import type { SmartChartIntel } from "@/lib/smart-chart-intelligence";
import {
  aiInsightsSmartReadBody,
  aiInsightsSmartReadBodyLead,
  aiInsightsSmartReadBlurb,
  aiInsightsSmartReadRecCard,
  aiInsightsSmartReadRecLabel,
  aiInsightsSmartReadRecValue,
  aiInsightsSmartReadShell,
  aiInsightsSmartReadSignalCard,
  aiInsightsSmartReadSignalHint,
  aiInsightsSmartReadSignalLabel,
  aiInsightsSmartReadSignalsLabel,
  aiInsightsSmartReadSignalValue,
  aiInsightsSmartReadTitle,
} from "@/lib/ai-insights-ui";

export type SmartInsightCard = {
  key: string;
  title: string;
  value: string;
  hint?: string;
  ariaLabel?: string;
  dotClass?: string;
};

export function SmartChartInsightPanel(props: {
  intel: SmartChartIntel | null;
  cards: SmartInsightCard[];
}) {
  const { intel, cards } = props;
  if (!intel?.active) return null;

  const strip = cards.slice(0, 3);

  return (
    <div className={aiInsightsSmartReadShell}>
      <h4 className={aiInsightsSmartReadTitle}>AI read on this chart</h4>

      <div className="flex flex-col gap-2 text-sm sm:flex-row sm:flex-wrap sm:items-start sm:gap-2.5">
        <div className={aiInsightsSmartReadRecCard}>
          <p className={aiInsightsSmartReadRecLabel}>Chart view</p>
          <p className={aiInsightsSmartReadRecValue}>{intel.recommendedLabel}</p>
          <p className="mt-1.5 text-xs leading-relaxed text-emerald-900/85 dark:text-emerald-200/85">
            Matches the chart type used for this view.
          </p>
        </div>
      </div>

      <p className={aiInsightsSmartReadBody}>
        <span className={aiInsightsSmartReadBodyLead}>Why this chart · </span>
        {intel.whyThisChart}
      </p>

      {intel.recommendationBlurb?.trim() &&
      intel.recommendationBlurb.trim() !== intel.whyThisChart.trim() ? (
        <p className={aiInsightsSmartReadBlurb}>{intel.recommendationBlurb}</p>
      ) : null}

      {strip.length > 0 ? (
        <div className="mt-3">
          <p className={aiInsightsSmartReadSignalsLabel}>Signals</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 sm:gap-2.5">
            {strip.map((c) => (
              <div
                key={c.key}
                className={aiInsightsSmartReadSignalCard}
                title={c.ariaLabel}
                aria-label={
                  c.ariaLabel ? `${c.title}: ${c.value}. ${c.ariaLabel}` : undefined
                }
              >
                {c.dotClass ? (
                  <div
                    className={`absolute left-0 top-0 h-full w-[3px] rounded-l-xl ${c.dotClass}`}
                    aria-hidden
                  />
                ) : null}
                <div className={c.dotClass ? "min-w-0 pl-2" : "min-w-0"}>
                  <p className={aiInsightsSmartReadSignalLabel}>{c.title}</p>
                  <p className={aiInsightsSmartReadSignalValue}>{c.value}</p>
                  {c.hint ? (
                    <p className={aiInsightsSmartReadSignalHint}>{c.hint}</p>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {intel.anomalyNote ? (
        <div className="mt-4 rounded-xl border border-amber-200/50 bg-amber-50/45 px-3 py-2.5 dark:border-amber-500/22 dark:bg-amber-950/35">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-amber-900/75 dark:text-amber-200/80">
            Anomaly check
          </p>
          <p className="text-xs leading-relaxed text-amber-950/90 dark:text-amber-100/90">
            {intel.anomalyNote}
          </p>
        </div>
      ) : null}
    </div>
  );
}
