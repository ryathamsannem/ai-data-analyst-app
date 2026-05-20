"use client";

import { memo } from "react";
import { useDevRenderCount } from "@/lib/dev-render-count";
import {
  aiInsightsExecutiveBrief,
  aiInsightsExecutiveBriefLabel,
  aiInsightsExecutiveCard,
  aiInsightsExecutiveCardBody,
  aiInsightsExecutiveCardHeader,
  aiInsightsExecutiveCardHint,
  aiInsightsExecutiveCardHintSpacer,
  aiInsightsExecutiveCardLabel,
  aiInsightsExecutiveCardValue,
  aiInsightsExecutiveDesc,
  aiInsightsExecutiveGrid,
  aiInsightsExecutiveShell,
  aiInsightsExecutiveTitle,
} from "@/lib/ai-insights-ui";

export type AiExecutiveInsightFact = {
  key: string;
  title: string;
  value: string;
  hint?: string;
  dotClass: string;
};

/**
 * AI Insights — at-a-glance facts derived from the current visualization (not Overview).
 */
export const AiExecutiveInsightsPanel = memo(function AiExecutiveInsightsPanel({
  cards,
  narrativeBrief,
}: {
  cards: readonly AiExecutiveInsightFact[];
  narrativeBrief?: string;
}) {
  useDevRenderCount("AiExecutiveInsightsPanel");
  if (!cards.length) return null;

  const brief = narrativeBrief?.replace(/\s+/g, " ").trim();

  return (
    <div className={aiInsightsExecutiveShell}>
      <div className="mb-3.5 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between sm:gap-3">
        <div className="min-w-0">
          <h3 className={aiInsightsExecutiveTitle}>Executive insights</h3>
          <p className={aiInsightsExecutiveDesc}>
            Key facts from this visualization — same signals used in export summaries.
          </p>
        </div>
      </div>

      {brief ? (
        <p className={aiInsightsExecutiveBrief}>
          <span className={aiInsightsExecutiveBriefLabel}>AI context · </span>
          {brief}
        </p>
      ) : null}

      <div className={aiInsightsExecutiveGrid}>
        {cards.map((c) => (
          <div
            key={c.key}
            className={aiInsightsExecutiveCard}
          >
            <div
              className={`absolute left-0 top-0 h-full w-[3px] rounded-l-xl ${c.dotClass}`}
              aria-hidden
            />
            <div className={aiInsightsExecutiveCardBody}>
              <div className={aiInsightsExecutiveCardHeader}>
                <span
                  className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${c.dotClass}`}
                  aria-hidden
                />
                <p className={aiInsightsExecutiveCardLabel}>{c.title}</p>
              </div>
              <div className="flex flex-1 flex-col justify-end">
                <p className={aiInsightsExecutiveCardValue}>{c.value}</p>
                {c.hint ? (
                  <p className={aiInsightsExecutiveCardHint}>{c.hint}</p>
                ) : (
                  <span className={aiInsightsExecutiveCardHintSpacer} aria-hidden />
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
});

AiExecutiveInsightsPanel.displayName = "AiExecutiveInsightsPanel";
