"use client";

import { forwardRef, memo, useCallback, useMemo } from "react";
import type { ChartSnapshot } from "@/contexts/chart-session-context";
import { getCanonicalChartTitle } from "@/lib/canonical-chart-title";
import {
  chartsTabTimelineAside,
  chartsTabTimelineBadgeAi,
  chartsTabTimelineBadgeAuto,
  chartsTabTimelineCardBase,
  chartsTabTimelineCardIdle,
  chartsTabTimelineCardMeta,
  chartsTabTimelineCardPrompt,
  chartsTabTimelineCardSelected,
  chartsTabTimelineCardTitle,
  chartsTabTimelineDesc,
  chartsTabTimelineHeader,
  chartsTabTimelineScrollBody,
  chartsTabTimelineSectionLabel,
  chartsTabTimelineTitle,
} from "@/lib/charts-tab-ui";
import { useDevRenderCount } from "@/lib/dev-render-count";

export type ChartHistorySections = {
  aiSorted: ChartSnapshot[];
  autoSorted: ChartSnapshot[];
};

const dateTimeFmt =
  typeof Intl !== "undefined"
    ? new Intl.DateTimeFormat(undefined, {
        dateStyle: "short",
        timeStyle: "short",
      })
    : null;

function formatSnapWhen(createdAt: number): string {
  if (!dateTimeFmt) return new Date(createdAt).toLocaleString();
  return dateTimeFmt.format(new Date(createdAt));
}

type TimelineVariant = "ai" | "auto";

const ChartTimelineCard = memo(function ChartTimelineCard({
  snap,
  isSelected,
  whenLabel,
  variant,
  onSelect,
}: {
  snap: ChartSnapshot;
  isSelected: boolean;
  whenLabel: string;
  variant: TimelineVariant;
  onSelect: (id: string) => void;
}) {
  const handleClick = useCallback(() => {
    onSelect(snap.id);
  }, [onSelect, snap.id]);

  const displayTitle = useMemo(
    () =>
      getCanonicalChartTitle({
        rawTitle: snap.title,
        chartType: snap.chartKind,
        contract: snap.contract ?? null,
        labels: snap.chartData.map((r) => String(r.name ?? "")),
        values: snap.chartData.map((r) => r.value),
        aggregationKey: snap.contract?.aggregation ?? "sum",
      }),
    [snap.title, snap.chartKind, snap.contract, snap.chartData]
  );

  const badge =
    variant === "ai" ? (
      <span className={chartsTabTimelineBadgeAi}>AI</span>
    ) : (
      <span className={chartsTabTimelineBadgeAuto}>Auto</span>
    );

  return (
    <li className="min-h-[108px]">
      <button
        type="button"
        onClick={handleClick}
        aria-current={isSelected ? "true" : undefined}
        className={`${chartsTabTimelineCardBase} ${
          isSelected ? chartsTabTimelineCardSelected : chartsTabTimelineCardIdle
        }`}
      >
        <div className="flex min-w-0 items-start justify-between gap-2">
          <span className={chartsTabTimelineCardTitle} title={displayTitle}>
            {displayTitle}
          </span>
          {badge}
        </div>
        <p className={chartsTabTimelineCardMeta}>{whenLabel}</p>
        {snap.question && variant === "ai" ? (
          <p className={chartsTabTimelineCardPrompt} title={snap.question}>
            <span className="text-[color:var(--text-subtle)]">Prompt · </span>
            {snap.question}
          </p>
        ) : (
          <span className="flex-1 min-h-[1.25rem]" aria-hidden />
        )}
      </button>
    </li>
  );
});

export const ChartsTimelineAside = memo(
  forwardRef<
    HTMLDivElement,
    {
      sections: ChartHistorySections;
      activeChartId: string | null;
      onSelectChart: (id: string | null) => void;
      historyEmpty: boolean;
    }
  >(function ChartsTimelineAside(
    { sections, activeChartId, onSelectChart, historyEmpty },
    ref
  ) {
    useDevRenderCount("ChartsTimelineAside");

    const aiWhenById = useMemo(() => {
      const m = new Map<string, string>();
      for (const s of sections.aiSorted) {
        m.set(s.id, formatSnapWhen(s.createdAt));
      }
      return m;
    }, [sections.aiSorted]);

    const autoWhenById = useMemo(() => {
      const m = new Map<string, string>();
      for (const s of sections.autoSorted) {
        m.set(s.id, formatSnapWhen(s.createdAt));
      }
      return m;
    }, [sections.autoSorted]);

    return (
      <aside ref={ref} className={chartsTabTimelineAside}>
        <div className={chartsTabTimelineHeader}>
          <h3 className={chartsTabTimelineTitle}>Timeline</h3>
          <p className={chartsTabTimelineDesc}>
            Newest AI charts first. Timestamps use your local time.
          </p>
        </div>
        <div className={chartsTabTimelineScrollBody}>
          {historyEmpty ? (
            <p className="text-sm leading-relaxed text-[color:var(--text-muted)]">
              No charts yet. Open{" "}
              <span className="font-medium text-[var(--foreground)]">Overview</span> for
              auto charts or{" "}
              <span className="font-medium text-[var(--foreground)]">AI Insights</span>{" "}
              for question-driven visuals.
            </p>
          ) : (
            <div className="flex flex-col gap-5">
              {sections.aiSorted.length > 0 ? (
                <div>
                  <h4 className={chartsTabTimelineSectionLabel}>From AI</h4>
                  <ul className="flex flex-col gap-2.5">
                    {sections.aiSorted.map((snap) => (
                      <ChartTimelineCard
                        key={snap.id}
                        snap={snap}
                        isSelected={activeChartId === snap.id}
                        whenLabel={aiWhenById.get(snap.id) ?? ""}
                        variant="ai"
                        onSelect={onSelectChart}
                      />
                    ))}
                  </ul>
                </div>
              ) : null}
              {sections.autoSorted.length > 0 ? (
                <div>
                  <h4 className={chartsTabTimelineSectionLabel}>Auto dashboard</h4>
                  <ul className="flex flex-col gap-2.5">
                    {sections.autoSorted.map((snap) => (
                      <ChartTimelineCard
                        key={snap.id}
                        snap={snap}
                        isSelected={activeChartId === snap.id}
                        whenLabel={autoWhenById.get(snap.id) ?? ""}
                        variant="auto"
                        onSelect={onSelectChart}
                      />
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </aside>
    );
  })
);

ChartsTimelineAside.displayName = "ChartsTimelineAside";

/** Alias for perf docs / external memo targets — same component as `ChartTimelineCard`. */
export { ChartTimelineCard as TimelineItem };
