import type { ChartKind, ChartRow } from "@/app/chart-types";
import type { VerticalCategoryAxisPlan } from "@/lib/chart-axis-layout";
import {
  resolveHBarValueAxisProps,
  resolveVerticalBarValueAxisProps,
  type AxisPresentationPlan,
  type HBarValueAxisProps,
  type VerticalBarValueAxisProps,
} from "@/lib/chart-platform/axis-presentation-plan";
import {
  coercePercentDisplayNumber,
  metricFormatUsesPercent,
  readChartRowRawValue,
  resolveMetricValueFormat,
  type MetricFormatContext,
} from "@/lib/metric-value-format";
import {
  resolveFocusedRateBarValueAxisTicks,
  resolveOverviewBarValueDomain,
} from "@/lib/overview-bar-value-domain";
import {
  resolveOverviewBarCountValueAxisTicks,
  resolveScatterValueAxisProps,
  resolveTrendValueAxisProps,
  type ScatterValueAxisProps,
  type TrendAxisSurface,
} from "@/lib/overview-premium-axis-domain";

export type { ScatterValueAxisProps, TrendAxisSurface };

/** Which renderer pipeline is asking for cartesian decisions. */
export type CartesianChartPipeline = "overview" | "session";

/**
 * Context for bar / histogram / horizontal-bar value-axis domain policy.
 * Overview always uses live rounding (no executive rounding); session capture
 * may apply export axis plans and executive rounding.
 */
export type CartesianBarValueContext =
  | { pipeline: "overview"; capture: boolean }
  | {
      pipeline: "session";
      capture: boolean;
      exportAxisPlan?: AxisPresentationPlan | null;
    };

/**
 * Whether a cartesian plot should render as horizontal bars.
 * Overview may still honor a category-plan fallback; session kinds are
 * pre-resolved via `resolveBarFamilyKind` before ChartRenderer runs.
 */
export function cartesianUsesHorizontalPlot(
  presentationKind: ChartKind,
  categoryPlan?: Pick<VerticalCategoryAxisPlan, "renderAsHorizontalBar"> | null
): boolean {
  return (
    presentationKind === "bar_horizontal" ||
    (presentationKind === "bar" &&
      Boolean(categoryPlan?.renderAsHorizontalBar))
  );
}

/**
 * Shared bar-family value-axis props for Overview inline plots and ChartRenderer.
 * Returns `null` when the kind is not bar, histogram, or horizontal bar.
 */
function attachOverviewCountBarTicks(
  props: VerticalBarValueAxisProps | HBarValueAxisProps,
  ctx: MetricFormatContext,
  chartKind: ChartKind
): VerticalBarValueAxisProps | HBarValueAxisProps {
  if (chartKind === "histogram") return props;
  if (!props.domain) return props;
  if (resolveMetricValueFormat(ctx) !== "number") return props;
  const ticks = resolveOverviewBarCountValueAxisTicks(props.domain);
  if (!ticks) return props;
  return { ...props, ticks };
}

function attachOverviewBarValueAxisTicks(
  props: VerticalBarValueAxisProps | HBarValueAxisProps,
  ctx: MetricFormatContext,
  chartKind: ChartKind,
  domain: readonly [number, number],
  rows: readonly ChartRow[]
): VerticalBarValueAxisProps | HBarValueAxisProps {
  const withCount = attachOverviewCountBarTicks(props, ctx, chartKind);
  if (withCount.ticks) return withCount;

  if (chartKind !== "bar" || !metricFormatUsesPercent(ctx)) return props;

  const rawVals = rows
    .map((row) => readChartRowRawValue(row))
    .filter((v) => Number.isFinite(v));
  if (rawVals.length < 2 || domain[0] <= 0) return props;

  const maxRaw = Math.max(...rawVals);
  const displayVals = rawVals.map((v) => coercePercentDisplayNumber(v));
  const maxDisplay = Math.max(...displayVals);
  const ticks = resolveFocusedRateBarValueAxisTicks(domain, maxRaw, maxDisplay);
  if (!ticks) return props;
  return { ...props, ticks };
}

export function resolveCartesianBarValueAxisProps(args: {
  chartKind: ChartKind;
  rows: readonly ChartRow[];
  chartTitle?: string | null;
  metricLabel?: string | null;
  context: CartesianBarValueContext;
}): VerticalBarValueAxisProps | HBarValueAxisProps | null {
  const { chartKind, rows, chartTitle, metricLabel, context } = args;

  if (chartKind === "bar" || chartKind === "histogram") {
    if (context.pipeline === "overview") {
      const domain = resolveOverviewBarValueDomain(rows, {
        chartTitle: chartTitle ?? undefined,
        metricLabel: metricLabel ?? undefined,
        presentationKind: chartKind,
        executiveRounding: false,
      });
      if (!domain) return null;
      const ctx: MetricFormatContext = {
        chartTitle: chartTitle ?? undefined,
        metricLabel: metricLabel ?? undefined,
        presentationKind: chartKind,
        chartRows: rows as ChartRow[],
      };
      return attachOverviewBarValueAxisTicks(
        { domain, allowDataOverflow: false },
        ctx,
        chartKind,
        domain,
        rows
      );
    }
    const props = resolveVerticalBarValueAxisProps({
      plan: context.capture ? (context.exportAxisPlan ?? null) : null,
      chartKind,
      rows,
      chartTitle,
      metricLabel,
      executiveRounding: context.capture,
    });
    if (!props?.domain) return props;
    const ctx: MetricFormatContext = {
      chartTitle: chartTitle ?? undefined,
      metricLabel: metricLabel ?? undefined,
      presentationKind: chartKind,
      chartRows: rows as ChartRow[],
    };
    return attachOverviewBarValueAxisTicks(
      props,
      ctx,
      chartKind,
      props.domain,
      rows
    );
  }

  if (chartKind === "bar_horizontal") {
    if (context.pipeline === "overview") {
      const domain = resolveOverviewBarValueDomain(rows, {
        chartTitle: chartTitle ?? undefined,
        metricLabel: metricLabel ?? undefined,
        presentationKind: chartKind,
        executiveRounding: false,
        overviewHorizontalBarHeadroom: true,
      });
      if (!domain) return null;
      const ctx: MetricFormatContext = {
        chartTitle: chartTitle ?? undefined,
        metricLabel: metricLabel ?? undefined,
        presentationKind: chartKind,
        chartRows: rows as ChartRow[],
      };
      return attachOverviewBarValueAxisTicks(
        { domain, allowDataOverflow: false },
        ctx,
        chartKind,
        domain,
        rows
      );
    }
    return resolveHBarValueAxisProps({
      plan: context.capture ? (context.exportAxisPlan ?? null) : null,
      chartKind: "bar_horizontal",
      rows,
      chartTitle,
      metricLabel,
      executiveRounding: context.capture,
    });
  }

  return null;
}

/** Line / area Y-axis domain — same entry for Overview and session surfaces. */
export {
  resolveTrendValueAxisProps,
  resolveScatterValueAxisProps,
};
