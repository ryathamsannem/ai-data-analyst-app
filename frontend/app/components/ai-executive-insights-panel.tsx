"use client";

import { memo, useMemo, useState } from "react";
import { useDevRenderCount } from "@/lib/dev-render-count";
import {
  collapseNumberedExecutiveBrief,
  isNumberedExecutiveBrief,
} from "@/lib/executive-insights-brief";
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
  ariaLabel?: string;
  dotClass: string;
};

const BRIEF_COLLAPSE_CHARS = 280;

export function resolveExecutiveInsightsPanelView(args: {
  cards: readonly AiExecutiveInsightFact[];
  narrativeBrief?: string;
  suppressSignalCards?: boolean;
}): {
  showPanel: boolean;
  showSignalCards: boolean;
  showBrief: boolean;
} {
  const brief = args.narrativeBrief?.trim() ?? "";
  const showSignalCards =
    !args.suppressSignalCards && args.cards.length > 0;
  const showBrief = brief.length > 0;
  return {
    showPanel: showSignalCards || showBrief,
    showSignalCards,
    showBrief,
  };
}

/**
 * AI Insights — at-a-glance facts derived from the current visualization (not Overview).
 */
export const AiExecutiveInsightsPanel = memo(function AiExecutiveInsightsPanel({
  cards,
  narrativeBrief,
  suppressSignalCards = false,
}: {
  cards: readonly AiExecutiveInsightFact[];
  narrativeBrief?: string;
  suppressSignalCards?: boolean;
}) {
  useDevRenderCount("AiExecutiveInsightsPanel");
  const [briefExpanded, setBriefExpanded] = useState(false);

  const panelView = resolveExecutiveInsightsPanelView({
    cards,
    narrativeBrief,
    suppressSignalCards,
  });

  const briefRaw = narrativeBrief?.trim() ?? "";
  const briefIsNumbered = isNumberedExecutiveBrief(briefRaw);
  const brief = briefIsNumbered
    ? briefRaw
    : briefRaw.replace(/\s+/g, " ").trim();

  const { briefDisplay, briefCanExpand, briefPreLine } = useMemo(() => {
    if (!panelView.showBrief || !brief) {
      return { briefDisplay: "", briefCanExpand: false, briefPreLine: false };
    }
    if (briefIsNumbered) {
      if (briefExpanded) {
        return { briefDisplay: brief, briefCanExpand: true, briefPreLine: true };
      }
      const collapsed = collapseNumberedExecutiveBrief(brief, 2);
      return {
        briefDisplay: collapsed.display,
        briefCanExpand: collapsed.canExpand,
        briefPreLine: true,
      };
    }
    if (brief.length <= BRIEF_COLLAPSE_CHARS) {
      return { briefDisplay: brief, briefCanExpand: false, briefPreLine: false };
    }
    if (briefExpanded) {
      return { briefDisplay: brief, briefCanExpand: true, briefPreLine: false };
    }
    const slice = brief.slice(0, BRIEF_COLLAPSE_CHARS);
    const sp = slice.lastIndexOf(" ");
    const clipped =
      sp > BRIEF_COLLAPSE_CHARS - 80
        ? `${slice.slice(0, sp).trim()}…`
        : `${slice.trim()}…`;
    return { briefDisplay: clipped, briefCanExpand: true, briefPreLine: false };
  }, [brief, briefExpanded, briefIsNumbered, panelView.showBrief]);

  if (!panelView.showPanel) return null;

  return (
    <div className={aiInsightsExecutiveShell}>
      <div className="mb-3.5 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between sm:gap-3">
        <div className="min-w-0">
          <h3 className={aiInsightsExecutiveTitle}>Executive insights</h3>
          {panelView.showSignalCards ? (
            <p className={aiInsightsExecutiveDesc}>
              Key facts from this visualization — same signals used in export summaries.
            </p>
          ) : (
            <p className={aiInsightsExecutiveDesc}>
              Executive takeaway for this visualization.
            </p>
          )}
        </div>
      </div>

      {panelView.showBrief ? (
        <div className="mb-3.5 min-w-0">
          <p
            className={`${aiInsightsExecutiveBrief} break-words ${
              briefPreLine ? "whitespace-pre-line" : "whitespace-normal"
            }`}
          >
            <span className={aiInsightsExecutiveBriefLabel}>AI context · </span>
            {briefDisplay}
          </p>
          {briefCanExpand ? (
            <button
              type="button"
              onClick={() => setBriefExpanded((v) => !v)}
              className="mt-1.5 text-xs font-semibold text-[var(--accent)] hover:underline dark:text-indigo-300"
            >
              {briefExpanded ? "Show less" : "Show full summary"}
            </button>
          ) : null}
        </div>
      ) : null}

      {panelView.showSignalCards ? (
        <div className={aiInsightsExecutiveGrid}>
        {cards.map((c) => (
          <div
            key={c.key}
            className={aiInsightsExecutiveCard}
            title={c.ariaLabel}
            aria-label={c.ariaLabel ? `${c.title}: ${c.value}. ${c.ariaLabel}` : undefined}
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
                <p className={aiInsightsExecutiveCardValue} title={c.value}>
                  {c.value}
                </p>
                {c.hint ? (
                  <p className={aiInsightsExecutiveCardHint} title={c.hint}>
                    {c.hint}
                  </p>
                ) : (
                  <span className={aiInsightsExecutiveCardHintSpacer} aria-hidden />
                )}
              </div>
            </div>
          </div>
        ))}
        </div>
      ) : null}
    </div>
  );
});

AiExecutiveInsightsPanel.displayName = "AiExecutiveInsightsPanel";
