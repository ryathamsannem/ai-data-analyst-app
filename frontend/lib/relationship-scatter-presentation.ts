/**
 * Relationship / correlation scatter — shared presentation guards and copy.
 */

import type { ChartKind, ChartRow } from "@/app/chart-types";
import { humanizeColumnName, polishMetricDisplay } from "@/lib/analytics-metadata";
import { apiChartStringToKind } from "@/lib/smart-chart-intelligence";
import { isSyntheticScatterPointLabel } from "@/lib/relationship-scatter-labels";

export function rowsHaveScatterPoints(rows: ChartRow[]): boolean {
  return rows.some(
    (r) => typeof r.x === "number" && Number.isFinite(r.x as number)
  );
}

/** API or rows indicate a numeric relationship scatter (not a time-series line). */
export function isRelationshipScatterPresentation(args: {
  apiChartType: string;
  chartKindPinned?: ChartKind | null;
  rows: ChartRow[];
}): boolean {
  if (args.chartKindPinned === "scatter") return true;
  if (apiChartStringToKind(args.apiChartType) === "scatter") return true;
  return rowsHaveScatterPoints(args.rows);
}

/** Synthetic Point N labels must not trigger weekly/monthly trend mode. */
export function labelsLookTemporalForPresentation(labels: string[]): boolean {
  if (labels.length < 2) return false;
  const meaningful = labels.filter((l) => !isSyntheticScatterPointLabel(String(l)));
  if (meaningful.length < 2) return false;
  return meaningful.every((l) => labelLooksTemporalForChart(l));
}

function labelLooksTemporalForChart(name: string): boolean {
  const s = String(name ?? "").trim();
  if (!s) return false;
  if (/^(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/i.test(s))
    return true;
  if (/\bq[1-4]\b(?:\s*[''\u2019]?|\/|\s|,)\s*\d{2,4}$/i.test(s)) return true;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return true;
  if (/^w\d{1,2}\b/i.test(s) || /\bweek\b/i.test(s)) return true;
  if (/^\d{4}-w\d{1,2}$/i.test(s)) return true;
  if (isSyntheticScatterPointLabel(s)) return false;
  const parsed = Date.parse(s);
  return !Number.isNaN(parsed);
}

export function buildRelationshipScatterAiContext(args: {
  xLabel: string;
  yLabel: string;
  observationCount: number;
}): string {
  const x =
    polishMetricDisplay(humanizeColumnName(args.xLabel.trim())) ||
    polishMetricDisplay(args.xLabel.trim()) ||
    "X";
  const y =
    polishMetricDisplay(humanizeColumnName(args.yLabel.trim())) ||
    polishMetricDisplay(args.yLabel.trim()) ||
    "Y";
  const n = Math.max(0, args.observationCount);
  const obs =
    n === 1 ? "1 observation" : `${n.toLocaleString()} observations`;
  return `This scatter plot compares ${x} and ${y} across ${obs}.`;
}
