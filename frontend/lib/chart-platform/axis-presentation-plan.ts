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
import { resolveOverviewBarValueDomain } from "@/lib/overview-bar-value-domain";

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

export type HBarExportValueAxisProps = {
  domain?: readonly [number, number];
  ticks?: readonly number[];
  tickCount?: number;
  allowDataOverflow: boolean;
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
    executiveRounding: true,
  });
  return domain ?? null;
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
      domain: resolveExportBarValueDomain(args),
      tickCount: null,
      tickValues: null,
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
      domain: resolveExportBarValueDomain(args),
      tickCount: null,
      tickValues: null,
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

export function resolveHBarExportValueAxisProps(args: {
  plan: AxisPresentationPlan | null | undefined;
  chartKind: ChartKind;
  pngCaptureMode: boolean;
}): HBarExportValueAxisProps | null {
  const { plan, chartKind, pngCaptureMode } = args;
  if (!pngCaptureMode || chartKind !== "bar_horizontal") return null;
  if (!plan || plan.status !== "supported") return null;
  if (plan.chartKind !== "bar_horizontal" || plan.valueOrientation !== "x") return null;
  if (plan.valueAxis.scale !== "numeric") return null;

  const out: HBarExportValueAxisProps = {
    allowDataOverflow: true,
  };

  if (plan.valueAxis.domain) {
    out.domain = plan.valueAxis.domain;
  }
  if (plan.valueAxis.tickValues?.length) {
    out.ticks = plan.valueAxis.tickValues;
  }
  if (plan.valueAxis.tickCount != null && plan.valueAxis.tickCount > 0) {
    out.tickCount = plan.valueAxis.tickCount;
  }

  return out.domain || out.ticks || out.tickCount ? out : null;
}
