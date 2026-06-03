"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { ChartKind, ChartRow } from "../app/chart-types";
import { fallbackChartNumericDisplay } from "../app/chart-types";
import {
  buildFinalChartPresentationMeta,
  chartKindToApiChartType,
  computeFinalChartPresentation,
} from "../lib/final-chart-presentation";
import {
  freezeVisualizationContract,
  type VisualizationContract,
} from "../lib/selected-visualization";
import {
  chartKindToTimelineType,
  type TimelineChartType,
} from "../lib/chart-layout-config";

export type ChartSource = "ai" | "auto_dashboard";

export type FinalChartPresentationMeta = {
  chartType: ChartKind;
  orientation: "vertical" | "horizontal" | "radial" | "cartesian2d";
  metric?: string;
  dimension?: string;
  dateColumn?: string | null;
  aggregation?: string;
  /** Adaptive bucket label (Monthly, Weekly, …) from engine time-series metadata. */
  grain?: string | null;
};

export type AutoDashboardLike = {
  title: string;
  chartType: string;
  labels: string[];
  values: number[];
};

export type ChartSnapshot = {
  id: string;
  source: ChartSource;
  createdAt: number;
  title: string;
  subtitle: string;
  chartKind: ChartKind;
  chartData: ChartRow[];
  /** Hydrated visualization from `/ask` (stacked/scatter metadata); dashboard charts use a minimal stub. */
  visualization: unknown | null;
  question?: string;
  /** Stable key within current auto-dashboard payload (title-based). */
  dashboardChartKey?: string;
  /** Single resolved presentation; same rules as Overview / exports. */
  finalPresentation?: FinalChartPresentationMeta;
  /** Server conversation turn id (BI copilot thread). */
  questionTurnId?: string;
  parentTurnId?: string;
  /** Prior insight chart this answer extended (follow-up lineage). */
  derivedFromChartId?: string;
  /** Filters + mapping fingerprint; same logical chart updates in place instead of duplicating. */
  analysisContextKey?: string;
  /** Metric · aggregation · grouping · filters — merges equivalent questions. */
  semanticIntentKey?: string;
  /** Normalized presentation for parity across Overview / Insights / PDF. */
  timelineChartType?: TimelineChartType;
  /** Frozen visualization contract — kind, dimension, narrative scope. */
  contract?: VisualizationContract;
};

/** Alias: pinned visualization — single source of truth across Overview, Charts, AI Insights, PDF. */
export type SelectedVisualization = ChartSnapshot;

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `chart-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function normalizeDedupePart(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Stable session key for an auto-dashboard mini chart (raw API title). */
export function dashboardChartKeyFromTitle(title: string): string {
  return `dash::${title.trim().toLowerCase()}`;
}

export function buildAiChartDedupeKey(args: {
  semanticIntentKey?: string;
  title: string;
  question?: string;
  chartKind: ChartKind;
  analysisContextKey?: string;
}): string {
  const sem = args.semanticIntentKey?.trim();
  if (sem) {
    return ["intent", sem, args.analysisContextKey ?? ""].join("\u0001");
  }
  return [
    normalizeDedupePart(args.title),
    normalizeDedupePart(args.question ?? ""),
    String(args.chartKind ?? ""),
    args.analysisContextKey ?? "",
  ].join("\u0001");
}

function aiDedupeKeyFromSnapshot(h: ChartSnapshot): string {
  return buildAiChartDedupeKey({
    semanticIntentKey: h.semanticIntentKey,
    title: h.title,
    question: h.question,
    chartKind: h.chartKind,
    analysisContextKey: h.analysisContextKey,
  });
}

function normalizeMiniChartKind(raw: string): ChartKind {
  const c = raw.toLowerCase().replace(/\s+/g, "");
  if (c === "horizontalbar" || c === "bar_horizontal" || c === "horizontal_bar")
    return "bar_horizontal";
  if (c === "line") return "line";
  if (c === "area") return "area";
  if (c === "scatter") return "scatter";
  if (c === "histogram") return "histogram";
  if (c === "pie") return "pie";
  if (c === "donut") return "donut";
  return "bar";
}

function rowsFromMiniChart(
  mini: AutoDashboardLike,
  kindOverride?: ChartKind
): ChartRow[] {
  const chartKind = kindOverride ?? normalizeMiniChartKind(mini.chartType);
  const cap = Math.min(mini.labels.length, mini.values.length);
  const rows: ChartRow[] = [];
  for (let i = 0; i < cap; i++) {
    const v = mini.values[i];
    if (!Number.isFinite(v)) continue;
    const dispKind: ChartKind =
      chartKind === "donut"
        ? "pie"
        : chartKind === "bar_horizontal"
          ? "bar_horizontal"
          : chartKind === "histogram"
            ? "histogram"
            : "bar";
    rows.push({
      name: mini.labels[i] || "—",
      value: v,
      displayValue: fallbackChartNumericDisplay(dispKind, v),
    });
  }
  return rows;
}

/** Minimal visualization envelope so `renderDatasetChart` / export paths behave like AI charts. */
function stubVisualizationForMini(
  mini: AutoDashboardLike,
  chartKind: ChartKind,
  rows: ChartRow[]
): Record<string, unknown> {
  return {
    chartType: chartKindToApiChartType(chartKind),
    title: mini.title.trim(),
    subtitle: "Auto dashboard",
    labels: rows.map((r) => r.name),
    values: rows.map((r) => r.value),
    formattedValues: rows.map((r) => r.displayValue ?? ""),
    provenance: null,
    multiSeries: null,
    partialVisualizationWarning: null,
    interaction: null,
  };
}

export type ChartSessionValue = {
  datasetEpoch: number;
  history: ChartSnapshot[];
  activeId: string | null;
  activeSnapshot: ChartSnapshot | null;
  /** Pinned chart for AI Insights + PDF “insight” scope — synced via `selectChart` or set when an AI chart is pushed. */
  insightChartId: string | null;
  insightSnapshot: ChartSnapshot | null;
  setActiveChart: (id: string | null) => void;
  /** User-selected chart: pins both Charts tab + AI Insights (export “insight” scope) to the same snapshot. */
  selectChart: (id: string | null) => void;
  pushAIChart: (args: {
    title: string;
    subtitle: string;
    chartKind: ChartKind;
    chartData: ChartRow[];
    visualization: unknown | null;
    finalPresentation?: FinalChartPresentationMeta;
    question?: string;
    questionTurnId?: string;
    parentTurnId?: string;
    derivedFromChartId?: string;
    analysisContextKey?: string;
    semanticIntentKey?: string;
  }) => string;
  replaceAutoDashboardCharts: (charts: AutoDashboardLike[]) => void;
  invalidateForDatasetChange: () => void;
  clearInsightThread: () => void;
  /** Remove AI charts from session, clear insight pin; keeps auto-dashboard charts. */
  clearAiInsightSession: () => void;
};

const ChartSessionContext = createContext<ChartSessionValue | null>(null);

export function ChartSessionProvider({ children }: { children: ReactNode }) {
  const [datasetEpoch, setDatasetEpoch] = useState(0);
  const [history, setHistory] = useState<ChartSnapshot[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [insightChartId, setInsightChartId] = useState<string | null>(null);

  const activeSnapshot = useMemo(() => {
    if (!history.length || !activeId) return null;
    return history.find((h) => h.id === activeId) ?? null;
  }, [history, activeId]);

  const insightSnapshot = useMemo(() => {
    if (!insightChartId) return null;
    return history.find((h) => h.id === insightChartId) ?? null;
  }, [history, insightChartId]);

  const setActiveChart = useCallback((id: string | null) => {
    setActiveId(id);
  }, []);

  const selectChart = useCallback((id: string | null) => {
    setActiveId(id);
    setInsightChartId(id);
  }, []);

  const invalidateForDatasetChange = useCallback(() => {
    setHistory([]);
    setActiveId(null);
    setInsightChartId(null);
    setDatasetEpoch((e) => e + 1);
  }, []);

  const clearInsightThread = useCallback(() => {
    setInsightChartId(null);
  }, []);

  const clearAiInsightSession = useCallback(() => {
    setInsightChartId(null);
    setHistory((prev) => {
      const next = prev.filter((h) => h.source !== "ai");
      queueMicrotask(() => {
        setActiveId((cur) => {
          if (cur && next.some((x) => x.id === cur)) return cur;
          const lastDash = [...next]
            .reverse()
            .find((x) => x.source === "auto_dashboard");
          return lastDash?.id ?? null;
        });
      });
      return next;
    });
  }, []);

  const pushAIChart = useCallback(
    (args: {
      title: string;
      subtitle: string;
      chartKind: ChartKind;
      chartData: ChartRow[];
      visualization: unknown | null;
      finalPresentation?: FinalChartPresentationMeta;
      question?: string;
      questionTurnId?: string;
      parentTurnId?: string;
      derivedFromChartId?: string;
      analysisContextKey?: string;
      semanticIntentKey?: string;
    }): string => {
      const ctxKey = args.analysisContextKey?.trim() ?? "";
      const semKey = args.semanticIntentKey?.trim() ?? "";
      const snapBase: Omit<ChartSnapshot, "id" | "createdAt"> = {
        source: "ai",
        title: args.title.trim() || "AI chart",
        subtitle: args.subtitle.trim(),
        chartKind: args.chartKind,
        chartData: args.chartData,
        visualization: args.visualization,
        finalPresentation: args.finalPresentation,
        question: args.question?.trim(),
        questionTurnId: args.questionTurnId?.trim(),
        parentTurnId: args.parentTurnId?.trim(),
        derivedFromChartId: args.derivedFromChartId?.trim(),
        analysisContextKey: ctxKey || undefined,
        semanticIntentKey: semKey || undefined,
        timelineChartType: chartKindToTimelineType(args.chartKind),
      };
      let pushedId = "";
      setHistory((prev) => {
        const candKey = buildAiChartDedupeKey({
          semanticIntentKey: semKey,
          title: snapBase.title,
          question: snapBase.question,
          chartKind: snapBase.chartKind,
          analysisContextKey: ctxKey,
        });
        const dupIdx = prev.findIndex((h) => {
          if (h.source !== "ai") return false;
          if (aiDedupeKeyFromSnapshot(h) !== candKey) return false;
          const prevQ = normalizeDedupePart(h.question ?? "");
          const nextQ = normalizeDedupePart(snapBase.question ?? "");
          return !prevQ || !nextQ || prevQ === nextQ;
        });
        const id = dupIdx >= 0 ? prev[dupIdx].id : newId();
        const vizProv =
          snapBase.visualization &&
          typeof snapBase.visualization === "object" &&
          "provenance" in snapBase.visualization
            ? (snapBase.visualization as { provenance?: { timeSeriesAnalysis?: unknown } })
                .provenance
            : null;
        const tsMeta =
          vizProv?.timeSeriesAnalysis &&
          typeof vizProv.timeSeriesAnalysis === "object"
            ? (vizProv.timeSeriesAnalysis as Record<string, unknown>)
            : null;
        const contract = freezeVisualizationContract({
          id,
          source: "ai",
          title: snapBase.title,
          apiChartType: chartKindToApiChartType(snapBase.chartKind),
          chartKindPinned: snapBase.chartKind,
          labels: snapBase.chartData.map((r) => String(r.name ?? "")),
          values: snapBase.chartData.map((r) => Number(r.value)),
          rows: snapBase.chartData,
          question: snapBase.question,
          timeBucketLabelOverride: args.finalPresentation?.grain ?? null,
          timeSeriesAnalysis: tsMeta,
        });
        const snap: ChartSnapshot = {
          ...snapBase,
          id,
          createdAt: Date.now(),
          title: contract.displayTitle,
          chartKind: contract.chartType,
          timelineChartType: chartKindToTimelineType(contract.chartType),
          contract,
        };
        pushedId = snap.id;
        if (dupIdx >= 0) {
          const next = [...prev];
          next[dupIdx] = snap;
          return next;
        }
        return [...prev, snap];
      });
      setActiveId(pushedId);
      setInsightChartId(pushedId);
      return pushedId;
    },
    []
  );

  const replaceAutoDashboardCharts = useCallback((charts: AutoDashboardLike[]) => {
    setHistory((prev) => {
      const kept = prev.filter((h) => h.source !== "auto_dashboard");
      const added: ChartSnapshot[] = [];
      for (const mini of charts) {
        if (!mini?.title?.trim()) continue;
        const baseRows = rowsFromMiniChart(mini);
        if (!baseRows.length) continue;
        const finalKind = computeFinalChartPresentation({
          apiChartType: mini.chartType,
          title: mini.title.trim(),
          question: undefined,
          rows: baseRows,
        });
        const rows = rowsFromMiniChart(mini, finalKind);
        const snapId = newId();
        const key = dashboardChartKeyFromTitle(mini.title);
        const contract = freezeVisualizationContract({
          id: snapId,
          source: "auto_dashboard",
          title: mini.title.trim(),
          apiChartType: mini.chartType,
          chartKindPinned: finalKind,
          labels: rows.map((r) => String(r.name ?? "")),
          values: rows.map((r) => Number(r.value)),
          rows,
        });
        const viz = stubVisualizationForMini(mini, contract.chartType, rows);
        added.push({
          id: snapId,
          source: "auto_dashboard",
          createdAt: Date.now(),
          title: contract.displayTitle,
          subtitle: "Auto dashboard",
          chartKind: contract.chartType,
          chartData: rows,
          visualization: viz,
          dashboardChartKey: key,
          finalPresentation: buildFinalChartPresentationMeta(
            contract.chartType,
            rows,
            null
          ),
          timelineChartType: chartKindToTimelineType(contract.chartType),
          contract,
        });
      }
      const next = [...kept, ...added];
      queueMicrotask(() => {
        setActiveId((cur) => {
          if (cur && next.some((x) => x.id === cur)) return cur;
          const lastAi = [...next].reverse().find((x) => x.source === "ai");
          if (lastAi) return lastAi.id;
          return null;
        });
      });
      return next;
    });
  }, []);

  const value = useMemo<ChartSessionValue>(
    () => ({
      datasetEpoch,
      history,
      activeId,
      activeSnapshot,
      insightChartId,
      insightSnapshot,
      setActiveChart,
      selectChart,
      pushAIChart,
      replaceAutoDashboardCharts,
      invalidateForDatasetChange,
      clearInsightThread,
      clearAiInsightSession,
    }),
    [
      datasetEpoch,
      history,
      activeId,
      activeSnapshot,
      insightChartId,
      insightSnapshot,
      setActiveChart,
      selectChart,
      pushAIChart,
      replaceAutoDashboardCharts,
      invalidateForDatasetChange,
      clearInsightThread,
      clearAiInsightSession,
    ]
  );

  return (
    <ChartSessionContext.Provider value={value}>{children}</ChartSessionContext.Provider>
  );
}

export function useChartSession(): ChartSessionValue {
  const v = useContext(ChartSessionContext);
  if (!v) {
    throw new Error("useChartSession must be used within ChartSessionProvider");
  }
  return v;
}
