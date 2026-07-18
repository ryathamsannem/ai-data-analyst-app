import type { ChartKind, ChartRow } from "@/app/chart-types";
import {
  balanceHorizontalOuterMargins,
  balanceVerticalOuterMargins,
  collectSampleTickStrings,
  computeCategoryAxisBottomMargin,
  computeHorizontalBarAxisLayout,
  computeVerticalValueAxisLayout,
  estimateCartesianPlotInnerWidthPx,
  computeVerticalCategoryAxisPlan,
} from "@/lib/chart-axis-layout";
import type { PresentationExportSpec } from "@/lib/chart-png-export-layout";
import type { ChartPresentationContract } from "@/lib/chart-platform/chart-presentation-contract";
import {
  coercePercentDisplayNumber,
  metricFormatUsesPercent,
  metricLabelImpliesScoreLike,
  readChartRowRawValue,
  resolveMetricValueFormat,
  type MetricFormatContext,
} from "@/lib/metric-value-format";
import {
  inferBoundedMetricBounds,
  isLowVarianceOnBoundedScale,
  resolveFocusedBoundedBarValueAxisTicks,
  resolveFocusedRateBarValueAxisTicks,
  resolveOverviewBarValueDomain,
} from "@/lib/overview-bar-value-domain";
import { resolveOverviewBarCountValueAxisTicks } from "@/lib/overview-premium-axis-domain";

export type AxisPresentationPlanStatus = "supported" | "unsupported";
export type AxisScaleKind = "categorical" | "numeric" | "none";
export type AxisOrientation = "x" | "y" | "none";

export type AxisPresentationAxisPlan = {
  scale: AxisScaleKind;
  orientation: AxisOrientation;
  widthPx: number | null;
  heightPx: number | null;
  domain: readonly [number, number] | null;
  tickCount: number | null;
  tickValues: readonly number[] | null;
  tickFormatterId: string | null;
};

export type AxisPresentationMargins = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

export type AxisPresentationPlan = {
  version: 1;
  planId: string;
  status: AxisPresentationPlanStatus;
  chartKind: ChartKind;
  surfaceProfileId: string;
  valueAxis: AxisPresentationAxisPlan;
  categoryAxis: AxisPresentationAxisPlan;
  margins: AxisPresentationMargins | null;
  categoryOrientation: "x" | "y" | "none";
  valueOrientation: "x" | "y" | "none";
  diagnostics: {
    reason: string | null;
    rowCount: number;
    plotWidthPx: number | null;
    plotHeightPx: number | null;
  };
};

export type HBarValueAxisProps = {
  domain?: readonly [number, number];
  ticks?: readonly number[];
  tickCount?: number;
  allowDataOverflow?: boolean;
};

export type VerticalBarValueAxisProps = {
  domain?: readonly [number, number];
  ticks?: readonly number[];
  allowDataOverflow?: boolean;
};

type ResolveAxisPresentationPlanArgs = {
  profileId: string;
  contract: ChartPresentationContract;
  kind: ChartKind;
  spec?: PresentationExportSpec | null;
};

const EXPORT_AXIS_TICK_FONT_PX = 11;
const EXPORT_AXIS_TITLE_FONT_PX = 11;

function finiteRows(rows: readonly ChartRow[]): ChartRow[] {
  return rows.filter((row) => Number.isFinite(row.value));
}

function noOpAxisPlan(args: {
  profileId: string;
  contract: ChartPresentationContract;
  kind: ChartKind;
  reason: string;
  spec?: PresentationExportSpec | null;
}): AxisPresentationPlan {
  return {
    version: 1,
    planId: `axis-plan:${args.kind}:diagnostic-only:v1`,
    status: "unsupported",
    chartKind: args.kind,
    surfaceProfileId: args.profileId,
    valueAxis: {
      scale: "none",
      orientation: "none",
      widthPx: null,
      heightPx: null,
      domain: null,
      tickCount: null,
      tickValues: null,
      tickFormatterId: null,
    },
    categoryAxis: {
      scale: "none",
      orientation: "none",
      widthPx: null,
      heightPx: null,
      domain: null,
      tickCount: null,
      tickValues: null,
      tickFormatterId: null,
    },
    margins: null,
    categoryOrientation: "none",
    valueOrientation: "none",
    diagnostics: {
      reason: args.reason,
      rowCount: args.contract.data.rowCount,
      plotWidthPx: args.spec?.width ?? null,
      plotHeightPx: args.spec?.height ?? null,
    },
  };
}

function resolveExportBarValueDomain(args: {
  contract: ChartPresentationContract;
  kind: ChartKind;
}): readonly [number, number] | null {
  const domain = resolveOverviewBarValueDomain(args.contract.data.rows, {
    chartTitle: args.contract.semantics.title,
    metricLabel: args.contract.semantics.metric.label,
    presentationKind: args.kind,
    executiveRounding: false,
  });
  return domain ?? null;
}

function metricFormatContextFromContract(
  contract: ChartPresentationContract,
  kind: ChartKind,
  rows: readonly ChartRow[]
): MetricFormatContext {
  return {
    chartTitle: contract.semantics.title,
    metricLabel: contract.semantics.metric.label,
    presentationKind: kind,
    chartRows: rows as ChartRow[],
  };
}

/** Export-plan tick values — mirrors session capture tick policy in cartesian-chart-decisions. */
function resolveExportBarValueAxisTickValues(args: {
  domain: readonly [number, number];
  contract: ChartPresentationContract;
  kind: ChartKind;
  rows: readonly ChartRow[];
}): readonly number[] | null {
  const { domain, contract, kind, rows } = args;
  const ctx = metricFormatContextFromContract(contract, kind, rows);

  if (kind !== "histogram" && resolveMetricValueFormat(ctx) === "number") {
    const countTicks = resolveOverviewBarCountValueAxisTicks(domain);
    if (countTicks) return countTicks;
  }

  const rawVals = rows
    .map((row) => readChartRowRawValue(row))
    .filter((v) => Number.isFinite(v));

  if (kind === "bar" && metricFormatUsesPercent(ctx) && domain[0] > 0) {
    if (rawVals.length >= 2) {
      const maxRaw = Math.max(...rawVals);
      const displayVals = rawVals.map((v) => coercePercentDisplayNumber(v));
      const maxDisplay = Math.max(...displayVals);
      const ticks = resolveFocusedRateBarValueAxisTicks(domain, maxRaw, maxDisplay);
      if (ticks) return ticks;
    }
  }

  if (domain[0] > 0 && rawVals.length >= 2) {
    const isPercent = metricFormatUsesPercent(ctx);
    const maxRawAbs = Math.max(...rawVals.map((v) => Math.abs(v)));
    const displayVals = isPercent
      ? rawVals.map((v) => coercePercentDisplayNumber(v, undefined, maxRawAbs))
      : rawVals;
    const minDisplay = Math.min(...displayVals);
    const maxDisplay = Math.max(...displayVals);
    const boundedBounds = inferBoundedMetricBounds({
      values: displayVals,
      metricLabel: ctx.metricLabel,
      chartTitle: ctx.chartTitle,
      isPercent,
    });
    const scoreLike = metricLabelImpliesScoreLike(ctx.metricLabel, ctx.chartTitle);
    const scaleMax = boundedBounds?.max ?? maxDisplay;
    if (
      scoreLike ||
      (boundedBounds &&
        isLowVarianceOnBoundedScale(
          maxDisplay - minDisplay,
          boundedBounds,
          rawVals.length
        ))
    ) {
      const ticks = resolveFocusedBoundedBarValueAxisTicks(domain, scaleMax);
      if (ticks) return ticks;
    }
  }

  return null;
}

function resolveHorizontalBarPlan(args: {
  profileId: string;
  contract: ChartPresentationContract;
  kind: ChartKind;
  spec: PresentationExportSpec;
}): AxisPresentationPlan {
  const rows = finiteRows(args.contract.data.rows);
  const hb = computeHorizontalBarAxisLayout({
    categoryTickStrings: rows.map((row) => String(row.name ?? "")),
    valueAxisLabel: args.contract.semantics.metric.label,
    valueAxisFull: args.contract.semantics.metric.label,
    categoryAxisLabel: args.contract.semantics.category?.label ?? "Category",
    chartLayoutMode: "export",
    tickFontSizePx: EXPORT_AXIS_TICK_FONT_PX,
    titleFontSizePx: EXPORT_AXIS_TITLE_FONT_PX,
    maxValueAxisTitleWidthPx: Math.max(120, args.spec.width - 72),
  });
  const balanced = balanceHorizontalOuterMargins({
    marginLeft: hb.marginLeft,
    chartLayoutMode: "export",
  });
  const valueDomain = resolveExportBarValueDomain(args);
  const valueTickValues =
    valueDomain == null
      ? null
      : resolveExportBarValueAxisTickValues({
          domain: valueDomain,
          contract: args.contract,
          kind: args.kind,
          rows,
        });

  return {
    version: 1,
    planId: "axis-plan:horizontal-bar:export:v1",
    status: "supported",
    chartKind: args.kind,
    surfaceProfileId: args.profileId,
    valueAxis: {
      scale: "numeric",
      orientation: "x",
      widthPx: null,
      heightPx: null,
      domain: valueDomain,
      tickCount: null,
      tickValues: valueTickValues,
      tickFormatterId: "formatAxisTickFromRows",
    },
    categoryAxis: {
      scale: "categorical",
      orientation: "y",
      widthPx: hb.categoryAxisWidth,
      heightPx: null,
      domain: null,
      tickCount: rows.length,
      tickValues: null,
      tickFormatterId: "WrappedCategoryYAxisTick",
    },
    margins: {
      top: 16,
      right: balanced.marginRight,
      bottom: Math.max(hb.marginBottom, 22),
      left: balanced.marginLeft,
    },
    categoryOrientation: "y",
    valueOrientation: "x",
    diagnostics: {
      reason: null,
      rowCount: args.contract.data.rowCount,
      plotWidthPx: args.spec.width,
      plotHeightPx: args.spec.height,
    },
  };
}

function resolveVerticalBarPlan(args: {
  profileId: string;
  contract: ChartPresentationContract;
  kind: ChartKind;
  spec: PresentationExportSpec;
}): AxisPresentationPlan {
  const rows = finiteRows(args.contract.data.rows);
  const tickSamples = collectSampleTickStrings(rows);
  const verticalValueLayout = computeVerticalValueAxisLayout({
    valueAxisLabel: args.contract.semantics.metric.label,
    valueAxisMeasureLabel: args.contract.semantics.metric.label,
    tickSampleStrings: tickSamples,
    chartLayoutMode: "export",
    tickFontSizePx: EXPORT_AXIS_TICK_FONT_PX,
    titleFontSizePx: EXPORT_AXIS_TITLE_FONT_PX,
    plotInnerHeightPx: Math.max(180, Math.floor(args.spec.height * 0.72)),
  });
  const balanced = balanceVerticalOuterMargins({
    marginLeft: verticalValueLayout.marginLeft,
    chartLayoutMode: "export",
  });
  const innerWidth = estimateCartesianPlotInnerWidthPx({
    viewportWidthPx: args.spec.width,
    marginLeftPx: balanced.marginLeft,
    marginRightPx: balanced.marginRight,
    variant: "main",
  });
  const categoryPlan = computeVerticalCategoryAxisPlan({
    categoryLabels: rows.map((row) => String(row.name ?? "")),
    estimatedPlotInnerWidthPx: innerWidth,
    chartLayoutMode: "export",
    disableHorizontalFallback: true,
  });
  const bottom = computeCategoryAxisBottomMargin({
    categoryTickStrings: rows.map((row) => String(row.name ?? "")),
    angled: categoryPlan.angled,
    tickFontSizePx: categoryPlan.tickFontSizePx,
    chartLayoutMode: "export",
  });
  const valueDomain = resolveExportBarValueDomain(args);
  const valueTickValues =
    valueDomain == null
      ? null
      : resolveExportBarValueAxisTickValues({
          domain: valueDomain,
          contract: args.contract,
          kind: args.kind,
          rows,
        });

  return {
    version: 1,
    planId: "axis-plan:bar:export:v1",
    status: "supported",
    chartKind: args.kind,
    surfaceProfileId: args.profileId,
    valueAxis: {
      scale: "numeric",
      orientation: "y",
      widthPx: verticalValueLayout.yAxisWidth,
      heightPx: null,
      domain: valueDomain,
      tickCount: null,
      tickValues: valueTickValues,
      tickFormatterId: "formatAxisTickFromRows",
    },
    categoryAxis: {
      scale: "categorical",
      orientation: "x",
      widthPx: null,
      heightPx: categoryPlan.xAxisHeightPx,
      domain: null,
      tickCount: rows.length,
      tickValues: null,
      tickFormatterId: "formatChartAxisCategoryTick",
    },
    margins: {
      top: 16,
      right: balanced.marginRight,
      bottom,
      left: balanced.marginLeft,
    },
    categoryOrientation: "x",
    valueOrientation: "y",
    diagnostics: {
      reason: null,
      rowCount: args.contract.data.rowCount,
      plotWidthPx: args.spec.width,
      plotHeightPx: args.spec.height,
    },
  };
}

export function resolveAxisPresentationPlan({
  profileId,
  contract,
  kind,
  spec,
}: ResolveAxisPresentationPlanArgs): AxisPresentationPlan {
  if (!spec) {
    return noOpAxisPlan({
      profileId,
      contract,
      kind,
      spec,
      reason: "axis planning is export-facing; live profile has no capture spec",
    });
  }

  if (kind === "bar_horizontal") {
    return resolveHorizontalBarPlan({ profileId, contract, kind, spec });
  }

  if (kind === "bar") {
    return resolveVerticalBarPlan({ profileId, contract, kind, spec });
  }

  return noOpAxisPlan({
    profileId,
    contract,
    kind,
    spec,
    reason: "axis presentation plan is diagnostic-only for this chart kind",
  });
}

export function formatAxisPresentationPlanSummary(
  plan: AxisPresentationPlan
): Record<string, unknown> {
  return {
    planId: plan.planId,
    status: plan.status,
    chartKind: plan.chartKind,
    valueOrientation: plan.valueOrientation,
    categoryOrientation: plan.categoryOrientation,
    valueDomain: plan.valueAxis.domain,
    valueTickCount: plan.valueAxis.tickCount,
    valueTickValues: plan.valueAxis.tickValues,
    valueTickFormatterId: plan.valueAxis.tickFormatterId,
    valueAxisWidthPx: plan.valueAxis.widthPx,
    valueAxisHeightPx: plan.valueAxis.heightPx,
    categoryAxisWidthPx: plan.categoryAxis.widthPx,
    categoryAxisHeightPx: plan.categoryAxis.heightPx,
    categoryTickCount: plan.categoryAxis.tickCount,
    categoryTickFormatterId: plan.categoryAxis.tickFormatterId,
    margins: plan.margins,
    reason: plan.diagnostics.reason,
  };
}

export function compareAxisPresentationPlans(
  a: AxisPresentationPlan,
  b: AxisPresentationPlan
): string[] {
  const aSummary = formatAxisPresentationPlanSummary(a);
  const bSummary = formatAxisPresentationPlanSummary(b);
  return Object.keys(aSummary).flatMap((key) => {
    const av = JSON.stringify(aSummary[key]);
    const bv = JSON.stringify(bSummary[key]);
    return av === bv ? [] : [`${key} ${a.surfaceProfileId}=${av} ${b.surfaceProfileId}=${bv}`];
  });
}

function propsFromHorizontalBarPlan(
  plan: AxisPresentationPlan | null | undefined
): HBarValueAxisProps | null {
  if (!plan || plan.status !== "supported") return null;
  if (plan.chartKind !== "bar_horizontal" || plan.valueOrientation !== "x") return null;
  if (plan.valueAxis.scale !== "numeric") return null;

  const out: HBarValueAxisProps = {};

  if (plan.valueAxis.domain) {
    out.domain = plan.valueAxis.domain;
    out.allowDataOverflow = true;
  }
  if (plan.valueAxis.tickValues?.length) {
    out.ticks = plan.valueAxis.tickValues;
  }
  if (plan.valueAxis.tickCount != null && plan.valueAxis.tickCount > 0) {
    out.tickCount = plan.valueAxis.tickCount;
  }

  return out.domain || out.ticks || out.tickCount ? out : null;
}

function propsFromVerticalBarPlan(
  plan: AxisPresentationPlan | null | undefined
): VerticalBarValueAxisProps | null {
  if (!plan || plan.status !== "supported") return null;
  if (plan.chartKind !== "bar" || plan.valueOrientation !== "y") return null;
  if (plan.valueAxis.scale !== "numeric") return null;

  if (!plan.valueAxis.domain) return null;

  const out: VerticalBarValueAxisProps = {
    domain: plan.valueAxis.domain,
    allowDataOverflow: false,
  };
  if (plan.valueAxis.tickValues?.length) {
    out.ticks = plan.valueAxis.tickValues;
  }
  return out;
}

export function resolveVerticalBarValueAxisProps(args: {
  plan?: AxisPresentationPlan | null;
  chartKind: ChartKind;
  rows: readonly ChartRow[];
  chartTitle?: string | null;
  metricLabel?: string | null;
  executiveRounding?: boolean;
}): VerticalBarValueAxisProps | null {
  const { plan, chartKind, rows, chartTitle, metricLabel, executiveRounding = false } =
    args;
  if (chartKind !== "bar" && chartKind !== "histogram") return null;

  if (chartKind === "bar") {
    const planned = propsFromVerticalBarPlan(plan);
    if (planned) return planned;
  }

  const domain = resolveOverviewBarValueDomain(rows, {
    chartTitle: chartTitle ?? undefined,
    metricLabel: metricLabel ?? undefined,
    presentationKind: chartKind,
    executiveRounding,
  });
  if (!domain) return null;
  return {
    domain,
    allowDataOverflow: false,
  };
}

export function resolveHBarValueAxisProps(args: {
  plan?: AxisPresentationPlan | null;
  chartKind: ChartKind;
  rows: readonly ChartRow[];
  chartTitle?: string | null;
  metricLabel?: string | null;
  executiveRounding?: boolean;
}): HBarValueAxisProps | null {
  const { plan, chartKind, rows, chartTitle, metricLabel, executiveRounding = false } = args;
  if (chartKind !== "bar_horizontal") return null;

  const planned = propsFromHorizontalBarPlan(plan);
  if (planned) return planned;

  const domain = resolveOverviewBarValueDomain(rows, {
    chartTitle: chartTitle ?? undefined,
    metricLabel: metricLabel ?? undefined,
    presentationKind: chartKind,
    executiveRounding,
  });
  if (!domain) return null;
  return {
    domain,
    allowDataOverflow: true,
  };
}
