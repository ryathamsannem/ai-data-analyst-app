"use client";

import type { SmartChartIntel } from "@/lib/smart-chart-intelligence";

export type SmartInsightCard = {
  key: string;
  title: string;
  value: string;
  hint?: string;
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
    <div className="rounded-2xl border border-indigo-100/45 bg-gradient-to-br from-indigo-50/35 via-white to-slate-50/30 px-3.5 py-3.5 shadow-[0_1px_3px_rgba(67,56,202,0.06),0_16px_40px_-20px_rgba(79,70,229,0.12)] ring-1 ring-indigo-900/[0.03] sm:px-4">
      <h4 className="mb-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-indigo-900/75">
        AI read on this chart
      </h4>

      <div className="flex flex-col gap-2.5 text-sm sm:flex-row sm:flex-wrap sm:items-start sm:gap-3">
        <div className="min-w-0 flex-1 rounded-xl border border-slate-200/50 bg-white/95 px-3.5 py-2.5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] sm:max-w-[min(100%,20rem)]">
          <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
            Recommended view
          </p>
          <p className="mt-1 font-semibold leading-snug text-slate-900">
            {intel.recommendedLabel}
          </p>
          {!intel.alignsWithRecommendation ? (
            <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
              For this question the assistant often starts from{" "}
              <span className="font-medium text-slate-800">{intel.suggestedLabel}</span>.
              You are viewing{" "}
              <span className="font-medium text-slate-800">{intel.currentLabel}</span>
              —both can be valid depending on emphasis.
            </p>
          ) : (
            <p className="mt-1.5 text-xs leading-relaxed text-emerald-900/85">
              Matches the chart type used for this view.
            </p>
          )}
        </div>
      </div>

      <p className="mt-3.5 border-t border-indigo-100/50 pt-3.5 text-sm leading-relaxed text-slate-700">
        <span className="font-semibold text-slate-900">Why this chart · </span>
        {intel.whyThisChart}
      </p>

      <p className="mt-2 text-xs leading-relaxed text-slate-500">{intel.recommendationBlurb}</p>

      {strip.length > 0 ? (
        <div className="mt-4">
          <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-slate-400">
            Signals
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 sm:gap-2.5">
            {strip.map((c) => (
              <div
                key={c.key}
                className="relative overflow-hidden rounded-xl border border-slate-200/45 bg-white/95 px-3 py-2.5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-shadow duration-200 hover:shadow-[0_4px_14px_-6px_rgba(15,23,42,0.08)]"
              >
                {c.dotClass ? (
                  <div
                    className={`absolute left-0 top-0 h-full w-[3px] rounded-l-xl ${c.dotClass}`}
                    aria-hidden
                  />
                ) : null}
                <div className={c.dotClass ? "min-w-0 pl-2" : "min-w-0"}>
                  <p className="text-[10px] font-medium uppercase tracking-wide leading-tight text-slate-400">
                    {c.title}
                  </p>
                  <p className="mt-1 break-words text-sm font-semibold leading-snug text-slate-900">
                    {c.value}
                  </p>
                  {c.hint ? (
                    <p className="mt-0.5 text-[11px] leading-snug text-slate-500">{c.hint}</p>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {intel.anomalyNote ? (
        <div className="mt-4 rounded-xl border border-amber-200/50 bg-amber-50/45 px-3 py-2.5">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-amber-900/75">
            Anomaly check
          </p>
          <p className="text-xs leading-relaxed text-amber-950/90">{intel.anomalyNote}</p>
        </div>
      ) : null}
    </div>
  );
}
