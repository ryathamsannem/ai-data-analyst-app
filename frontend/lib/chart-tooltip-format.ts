import type { ChartRow } from "@/app/chart-types";
import {
  humanizeColumnName,
  polishMetricDisplay,
  stripIntentNoiseFromMetricLabel,
} from "@/lib/analytics-metadata";
import { sanitizeExecutiveMeasureLabel } from "@/lib/insight-card-titles";
import {
  formatExecutiveMetricValue,
  type MetricFormatContext,
} from "@/lib/metric-value-format";

/** Clean measure phrase for tooltip series labels (not axis-truncated). */
export function chartTooltipMetricLabel(raw: string): string {
  const trimmed = raw.replace(/\s+/g, " ").trim();
  if (!trimmed) return "Value";

  const withoutBreakdown = trimmed.replace(/\s+by\s+.+$/i, "").trim();
  let s = sanitizeExecutiveMeasureLabel(withoutBreakdown);
  if (!s) {
    s = polishMetricDisplay(stripIntentNoiseFromMetricLabel(withoutBreakdown));
  }
  if (!s || /[_]/.test(s)) {
    s = polishMetricDisplay(humanizeColumnName(withoutBreakdown));
  }
  s = s.replace(/\s+by\s+.+$/i, "").trim();
  s = s.replace(/^(?:total|avg|average|sum)\s+/i, "").trim();
  s = s.replace(/\s+(Pct|Percent|Percentage)\b/gi, "").trim();
  s = s.replace(/\s+%\s*$/g, "").trim();
  if (!s) return "Value";
  return s;
}

export function formatChartTooltipCategoryLine(
  categoryAxisLabel: string,
  categoryValue: string
): string {
  const axis = categoryAxisLabel.trim() || "Category";
  const val = String(categoryValue ?? "").trim() || "—";
  return `${axis}: ${val}`;
}

export function formatChartTooltipValueLine(
  row: ChartRow,
  metricLabel: string,
  ctx: MetricFormatContext
): [string, string] {
  const name = chartTooltipMetricLabel(metricLabel);
  const formatted = formatExecutiveMetricValue(row, ctx);
  return [formatted, `${name}:`];
}

export function buildChartCartesianTooltipHandlers(
  categoryAxisLabel: string,
  metricLabel: string,
  metricCtx: MetricFormatContext,
  options?: { categoryFormatter?: (value: string) => string }
): {
  labelFormatter: (label: unknown) => string;
  formatter: (
    value: unknown,
    name: unknown,
    item: { payload?: ChartRow }
  ) => [string, string];
} {
  return {
    labelFormatter: (label) =>
      formatChartTooltipCategoryLine(
        categoryAxisLabel,
        options?.categoryFormatter?.(String(label ?? "")) ??
          String(label ?? "")
      ),
    formatter: (value, _name, item) => {
      const payload = item?.payload;
      const row: ChartRow =
        payload ??
        ({
          name: "",
          value: typeof value === "number" ? value : Number(value),
        } as ChartRow);
      return formatChartTooltipValueLine(row, metricLabel, metricCtx);
    },
  };
}
