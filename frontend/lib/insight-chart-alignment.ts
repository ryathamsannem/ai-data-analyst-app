/**
 * Align pinned insight charts with the latest /ask analysis — prevents stale
 * trend snapshots from pairing with ranking answers.
 */

import { isTrendMode, type VisualizationContract } from "@/lib/selected-visualization";

export type ChartAnalysisAlignmentSnapshot = {
  contract?: VisualizationContract | null;
  visualization?: unknown;
  finalPresentation?: { metric?: string; dimension?: string } | null;
};

function provenanceFromVisualization(
  visualization: unknown
): { numericColumn?: string; categoryColumn?: string } | undefined {
  if (!visualization || typeof visualization !== "object") return undefined;
  const prov = (visualization as { provenance?: { numericColumn?: string; categoryColumn?: string } })
    .provenance;
  return prov && typeof prov === "object" ? prov : undefined;
}

export type ChartAnalysisAlignmentParsed = {
  metricColumn?: string | null;
  categoryColumn?: string | null;
  chartTypeInternal?: string | null;
  routingPlan?: { intent?: string | null } | null;
  analysisIntent?: unknown;
};

function normalizeIntentToken(s: string): string {
  return s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function snapshotMetricCategoryTokens(snap: ChartAnalysisAlignmentSnapshot): {
  metric: string;
  category: string;
} {
  const prov = provenanceFromVisualization(snap.visualization);
  const fp = snap.finalPresentation;
  return {
    metric: normalizeIntentToken(prov?.numericColumn ?? fp?.metric ?? ""),
    category: normalizeIntentToken(prov?.categoryColumn ?? fp?.dimension ?? ""),
  };
}

function analysisMetricCategoryTokens(
  parsed: ChartAnalysisAlignmentParsed | null
): { metric: string; category: string } {
  return {
    metric: normalizeIntentToken(parsed?.metricColumn ?? ""),
    category: normalizeIntentToken(parsed?.categoryColumn ?? ""),
  };
}

function metricCategoryTokensAlign(
  a: { metric: string; category: string },
  b: { metric: string; category: string }
): boolean {
  if (a.metric && b.metric && a.metric !== b.metric) return false;
  if (a.category && b.category && a.category !== b.category) return false;
  return true;
}

function analysisRoutingIntent(parsed: ChartAnalysisAlignmentParsed | null): string {
  const routing = parsed?.routingPlan?.intent;
  if (typeof routing === "string" && routing.trim()) return routing.trim().toLowerCase();
  const raw = parsed?.analysisIntent;
  if (typeof raw === "string") return raw.trim().toLowerCase();
  if (raw && typeof raw === "object") {
    const bucket =
      (raw as { routingBucket?: string }).routingBucket ??
      (raw as { primaryGoal?: string }).primaryGoal;
    if (typeof bucket === "string" && bucket.trim()) return bucket.trim().toLowerCase();
  }
  return "";
}

function analysisIsCategoryRanking(parsed: ChartAnalysisAlignmentParsed | null): boolean {
  if (!parsed) return false;
  const intent = analysisRoutingIntent(parsed);
  if (intent === "trend" || intent === "time_series") return false;
  const ct = (parsed.chartTypeInternal ?? "").trim().toLowerCase();
  if (ct === "bar" || ct === "bar_horizontal" || ct === "pie" || ct === "donut") {
    return true;
  }
  if (
    intent === "ranking" ||
    intent === "comparison" ||
    intent === "rank" ||
    intent === "outlier"
  ) {
    return ct !== "line" && ct !== "area";
  }
  return false;
}

/** True when snapshot series mode disagrees with the latest pandas analysis. */
export function chartPresentationConflictsWithAnalysis(
  snap: ChartAnalysisAlignmentSnapshot,
  parsed: ChartAnalysisAlignmentParsed | null
): boolean {
  if (!parsed) return false;
  const snapTrend = isTrendMode(snap.contract ?? null);
  const parsedRanking = analysisIsCategoryRanking(parsed);
  if (snapTrend && parsedRanking) return true;
  if (!metricCategoryTokensAlign(
    snapshotMetricCategoryTokens(snap),
    analysisMetricCategoryTokens(parsed)
  )) {
    return true;
  }
  return false;
}

export function chartSnapshotMatchesAnalysis(
  snap: ChartAnalysisAlignmentSnapshot,
  parsed: ChartAnalysisAlignmentParsed | null
): boolean {
  if (!parsed) return false;
  if (chartPresentationConflictsWithAnalysis(snap, parsed)) return false;
  return metricCategoryTokensAlign(
    snapshotMetricCategoryTokens(snap),
    analysisMetricCategoryTokens(parsed)
  );
}

/** Keep a pinned insight chart only for same-question re-asks or aligned follow-ups. */
export function shouldPreservePinnedInsightChart(args: {
  pinned: ChartAnalysisAlignmentSnapshot & { question?: string | null };
  question: string;
  parsed: ChartAnalysisAlignmentParsed | null;
  followUpDetected: boolean;
  normalizeQuestion?: (q: string) => string;
}): boolean {
  const norm = args.normalizeQuestion ?? ((q: string) => q.trim().toLowerCase().replace(/\s+/g, " "));
  const pinnedQ = norm(args.pinned.question ?? "");
  const newQ = norm(args.question);
  if (pinnedQ && newQ && pinnedQ === newQ) return true;

  if (isTrendMode(args.pinned.contract ?? null)) {
    if (!args.followUpDetected) return false;
    return chartSnapshotMatchesAnalysis(args.pinned, args.parsed);
  }

  if (!args.followUpDetected) return false;

  return chartSnapshotMatchesAnalysis(args.pinned, args.parsed);
}
