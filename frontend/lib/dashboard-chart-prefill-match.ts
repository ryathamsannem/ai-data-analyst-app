import type { ChartKind, ChartRow } from "@/app/chart-types";
import { getCanonicalChartTitle } from "@/lib/canonical-chart-title";
import type { VisualizationContract } from "@/lib/selected-visualization";

/** Title embedded in Overview / Charts ASK AI prefill questions. */
export function extractDashboardChartTitleFromPrefillQuestion(
  question: string
): string | null {
  const m = /^Summarize what the chart "([^"]+)" shows/i.exec(question.trim());
  return m?.[1]?.trim() || null;
}

/** Match prefill title to auto-dashboard snapshot (raw or canonical title). */
export function dashboardPrefillTitleMatchesChart(args: {
  snapshotTitle: string;
  snapshotKind: ChartKind;
  snapshotContract: VisualizationContract | null;
  snapshotRows: ChartRow[];
  dashTitleFromQuestion: string;
}): boolean {
  const qTitle = args.dashTitleFromQuestion.trim();
  if (!qTitle) return false;
  if (args.snapshotTitle.trim() === qTitle) return true;

  const specBase = {
    chartType: args.snapshotKind,
    contract: args.snapshotContract,
    labels: args.snapshotRows.map((r) => String(r.name ?? "")),
    values: args.snapshotRows.map((r) => r.value),
    aggregationKey: args.snapshotContract?.aggregation ?? "sum",
  };

  const snapshotCanonical = getCanonicalChartTitle({
    rawTitle: args.snapshotTitle,
    ...specBase,
  });
  if (snapshotCanonical.trim() === qTitle) return true;

  const questionCanonical = getCanonicalChartTitle({
    rawTitle: qTitle,
    ...specBase,
  });
  return snapshotCanonical.trim() === questionCanonical.trim();
}
