"use client";

import { forwardRef, memo, useCallback, useMemo } from "react";
import type { ChartSnapshot } from "@/contexts/chart-session-context";
import { getCanonicalChartTitle } from "@/lib/canonical-chart-title";
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
      <span className="shrink-0 rounded-full border border-emerald-200/50 bg-emerald-50/80 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-emerald-900/85">
        AI
      </span>
    ) : (
      <span className="shrink-0 rounded-full border border-slate-200/60 bg-slate-100/90 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-slate-700">
        Auto
      </span>
    );

  return (
    <li className="min-h-[118px]">
      <button
        type="button"
        onClick={handleClick}
        aria-current={isSelected ? "true" : undefined}
        className={`flex h-full min-h-[118px] w-full flex-col rounded-xl border p-3 text-left transition-all duration-500 ease-out ${
          isSelected
            ? "border-indigo-300/75 bg-gradient-to-br from-indigo-50/95 via-white to-slate-50/25 shadow-[0_6px_26px_-8px_rgba(79,70,229,0.26),0_0_0_1px_rgba(165,180,252,0.35)] ring-1 ring-indigo-400/22"
            : "border-slate-200/55 bg-white/40 shadow-[0_1px_2px_rgba(15,23,42,0.035)] hover:border-indigo-200/50 hover:bg-white hover:shadow-[0_12px_32px_-14px_rgba(15,23,42,0.11),0_0_28px_-14px_rgba(99,102,241,0.14)]"
        }`}
      >
        <div className="flex items-start justify-between gap-2">
          <span
            className="min-w-0 flex-1 break-words text-sm font-medium leading-snug text-slate-900 line-clamp-2"
            title={displayTitle}
          >
            {displayTitle}
          </span>
          {badge}
        </div>
        <p className="mt-2 text-[11px] font-medium tabular-nums text-slate-500">
          {whenLabel}
        </p>
        {snap.question && variant === "ai" ? (
          <p
            className="mt-1 line-clamp-2 text-[11px] leading-snug text-slate-600"
            title={snap.question}
          >
            <span className="text-slate-400">Prompt · </span>
            {snap.question}
          </p>
        ) : (
          <span className="flex-1" aria-hidden />
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
      <aside
        ref={ref}
        className="timeline-scroll-fine min-w-0 w-full max-w-full shrink-0 rounded-2xl border border-slate-200/45 bg-gradient-to-b from-white/95 to-slate-50/40 p-4 shadow-[0_1px_3px_rgba(15,23,42,0.05)] ring-1 ring-slate-900/[0.025] backdrop-blur-[2px] transition-shadow duration-500 ease-out hover:border-slate-300/50 hover:shadow-[0_8px_28px_-14px_rgba(15,23,42,0.08)] sm:p-5 max-h-[min(72vh,540px)] overflow-y-auto overscroll-y-contain lg:max-w-none"
      >
        <h3 className="text-sm font-semibold tracking-tight text-slate-900">
          Timeline
        </h3>
        <p className="mb-4 mt-1 text-[11px] leading-relaxed text-slate-500">
          Newest AI charts first. Timestamps use your local time.
        </p>
        {historyEmpty ? (
          <p className="text-sm leading-relaxed text-slate-600">
            No charts yet. Open{" "}
            <span className="font-medium text-slate-800">Overview</span> for auto charts or{" "}
            <span className="font-medium text-slate-800">AI Insights</span> for question-driven
            visuals.
          </p>
        ) : (
          <div className="flex flex-col gap-5">
            {sections.aiSorted.length > 0 ? (
              <div>
                <h4 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                  From AI
                </h4>
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
                <h4 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                  Auto dashboard
                </h4>
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
      </aside>
    );
  })
);

ChartsTimelineAside.displayName = "ChartsTimelineAside";

/** Alias for perf docs / external memo targets — same component as `ChartTimelineCard`. */
export { ChartTimelineCard as TimelineItem };
