"use client";

import { memo } from "react";
import { useDevRenderCount } from "@/lib/dev-render-count";

export type AiExecutiveInsightFact = {
  key: string;
  title: string;
  value: string;
  hint?: string;
  dotClass: string;
};

/**
 * AI Insights — at-a-glance facts derived from the current visualization (not Overview).
 * Keeps layout/visual language aligned with existing insight cards.
 */
export const AiExecutiveInsightsPanel = memo(function AiExecutiveInsightsPanel({
  cards,
  narrativeBrief,
}: {
  cards: readonly AiExecutiveInsightFact[];
  /** Optional first-line context from the AI answer (executive skim). */
  narrativeBrief?: string;
}) {
  useDevRenderCount("AiExecutiveInsightsPanel");
  if (!cards.length) return null;

  const brief = narrativeBrief?.replace(/\s+/g, " ").trim();

  return (
    <div className="mt-3 rounded-2xl border border-slate-200/60 bg-[color:var(--surface-subtle)] p-3 sm:p-3.5 shadow-[var(--shadow-sm)] transition-shadow duration-300 hover:shadow-[var(--shadow-md)]">
      <div className="mb-2 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between sm:gap-3">
        <div className="min-w-0">
          <h3 className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500">
            Executive insights
          </h3>
          <p className="mt-0.5 text-xs text-slate-500">
            Key facts from this visualization — same signals used in export summaries.
          </p>
        </div>
      </div>

      {brief ? (
        <p className="mb-3 rounded-xl border border-slate-200/70 bg-white/80 px-3 py-2 text-sm leading-snug text-slate-800 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          <span className="font-semibold text-slate-900">AI context · </span>
          {brief}
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
        {cards.map((c) => (
          <div
            key={c.key}
            className="relative overflow-hidden rounded-xl border border-white/80 bg-gradient-to-b from-white to-slate-50/90 px-3 py-2.5 shadow-[0_1px_2px_rgba(15,23,42,0.045)]"
          >
            <div
              className={`absolute left-0 top-0 h-full w-[3px] rounded-l-xl ${c.dotClass}`}
              aria-hidden
            />
            <div className="min-w-0 pl-2">
              <div className="flex items-center gap-1.5">
                <span
                  className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${c.dotClass}`}
                  aria-hidden
                />
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 leading-tight">
                  {c.title}
                </p>
              </div>
              <p className="mt-1.5 text-[15px] font-bold text-slate-900 leading-snug break-words">
                {c.value}
              </p>
              {c.hint ? (
                <p className="mt-0.5 text-[11px] text-slate-500 leading-snug">{c.hint}</p>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
});

AiExecutiveInsightsPanel.displayName = "AiExecutiveInsightsPanel";
