"use client";

import { memo, useMemo } from "react";
import type { ChartKind, ChartRow } from "@/app/chart-types";
import { SHARED_CHART_LAYOUT, sessionDetailVerticalOuterMargins } from "@/lib/shared-chart-layout";
import {
  balanceHorizontalOuterMargins,
  balanceVerticalOuterMargins,
  collectSampleTickStrings,
  computeCategoryAxisBottomMargin,
  computeHorizontalBarAxisLayout,
  computePieChartMargins,
  computeVerticalValueAxisLayout,
  type VerticalCategoryAxisPlan,
} from "@/lib/chart-axis-layout";
import {
  computeLineAreaChartBottomMargin,
  computeLineAreaXAxisInterval,
  formatTrendXAxisTickLabel,
  lineAreaTickFontSizePx,
  lineAreaXAxisHeightPx,
  temporalTickStringsForChartRows,
  TREND_X_AXIS_ANGLE_DEG,
} from "@/lib/chart-time-x-axis";
import {
  CartesianXAxisTitleLabelContent,
  createHorizontalBottomAxisValueLabel,
  createVerticalValueAxisLabel,
} from "@/app/components/chart-value-axis-title";
import {
  getSharedDetailLayoutMetrics,
  radialChartOuterMargins,
  resolveVerticalBarPlotBottomPad,
  verticalCartesianOuterMargins,
} from "@/lib/chart-layout-config";
import {
  radialChartExportOuterMargins,
  RADIAL_EXPORT_LEGEND_FONT_PX,
  RADIAL_EXPORT_LEGEND_ICON_PX,
  RADIAL_EXPORT_LEGEND_PAD_TOP_PX,
  RADIAL_EXPORT_SLICE_STROKE_WIDTH,
  RADIAL_SESSION_LEGEND_FONT_PX,
  RADIAL_SESSION_LEGEND_ICON_PX,
  RADIAL_SESSION_LEGEND_PAD_TOP_PX,
  RADIAL_SESSION_SLICE_STROKE_WIDTH,
  SESSION_DETAIL_RADIAL_CY,
  resolveRadialChartRadii,
} from "@/lib/radial-export-layout";
import {
  OVERVIEW_MINI_RADIAL_LEGEND_PADDING_TOP_PX,
  OVERVIEW_MINI_RADIAL_SLICE_STROKE,
  OVERVIEW_MINI_RADIAL_SLICE_STROKE_WIDTH,
  scaleOverviewMiniRadialRadii,
  tightenOverviewMiniRadialMargins,
} from "@/lib/overview-mini-radial-polish";
import {
  formatAxisTickFromRows,
  formatAxisTickFromScatterX,
  formatChartAxisCategoryTick,
} from "@/lib/chart-axis-formatters";
import {
  formatOverviewLineYAxisTick,
  formatOverviewScatterAxisTick,
  OVERVIEW_LINE_LIVE_MARKER_R_PX,
  OVERVIEW_LINE_LIVE_MARKER_STROKE_PX,
  OVERVIEW_LINE_LIVE_STROKE_WIDTH_PX,
  resolveScatterValueAxisProps,
  resolveTrendValueAxisProps,
  sessionLineAreaDetailBottomMargin,
  sessionLineAreaDetailXAxisHeightPx,
  sessionTrendDetailPlotMargins,
} from "@/lib/overview-premium-axis-domain";
import {
  computeOverviewContinuousVerticalDashLayout,
  OVERVIEW_SCATTER_POINT_FILL_OPACITY,
  OVERVIEW_SCATTER_POINT_RADIUS_PX,
  OVERVIEW_SCATTER_POINT_STROKE_COLOR,
  OVERVIEW_SCATTER_POINT_STROKE_OPACITY,
  OVERVIEW_SCATTER_POINT_STROKE_PX,
} from "@/lib/overview-dashboard-plot-layout";
import { PIE_COLORS } from "@/lib/chart-palette";
import { formatRadialTooltipValue } from "@/lib/radial-chart-format";
import { buildChartCartesianTooltipHandlers, chartTooltipMetricLabel, formatChartTooltipCategoryLine } from "@/lib/chart-tooltip-format";
import { type MetricFormatContext } from "@/lib/metric-value-format";
import {
  CHART_AXIS_CSS,
  chartLayoutWidthKey,
} from "@/lib/chart-axis-theme";
import {
  resolveHBarValueAxisProps,
  resolveVerticalBarValueAxisProps,
  type AxisPresentationPlan,
} from "@/lib/chart-platform/axis-presentation-plan";
import { WrappedCategoryYAxisTick } from "@/app/components/chart-category-axis-tick";
import { useDevRenderCount } from "@/lib/dev-render-count";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Label,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  CartesianGrid,
  ScatterChart,
  Scatter,
} from "recharts";

/** Disable Recharts enter/exit animation above this point count (main + overview charts). */
const RECHARTS_ANIMATION_MAX_POINTS = 72;

const GRID_STROKE = "var(--chart-axis-line)";
const CHART_AXIS_LINE = CHART_AXIS_CSS.line;
const AXIS_TICK = CHART_AXIS_CSS.tick;
const CHART_TOOLTIP_FRAME = {
  cursor: false,
  contentStyle: {
    borderRadius: 14,
    border: "1px solid rgba(226, 232, 240, 0.95)",
    background: "rgba(255, 255, 255, 0.97)",
    boxShadow:
      "0 12px 32px -8px rgba(15, 23, 42, 0.11), 0 0 0 1px rgba(255, 255, 255, 0.75) inset",
    padding: "10px 14px",
    fontSize: 12,
  },
  labelStyle: {
    fontWeight: 600,
    marginBottom: 6,
    color: "#0f172a",
    fontSize: 12,
    letterSpacing: "-0.01em",
  },
  itemStyle: {
    color: "#475569",
    fontSize: 12,
    paddingTop: 2,
  },
  wrapperStyle: { outline: "none" as const },
} as const;
const AXIS_Y_TICK_VAL = {
  fontSize: 11,
  fill: AXIS_TICK,
  dx: 6,
} as const;

function rechartsContainerKey(
  kind: ChartKind,
  widthPx: number,
  heightPx: number,
  capture = false
): string {
  return `${kind}-${chartLayoutWidthKey(widthPx)}-${heightPx}${capture ? "-cap" : ""}`;
}

export type ChartRendererViz = {
  scatterXLabel?: string | null;
  scatterYLabel?: string | null;
  xColumn?: string | null;
  yColumn?: string | null;
  xMetricLabel?: string | null;
  yMetricLabel?: string | null;
  multiSeries?: {
    layout?: string;
    seriesKeys: string[];
    seriesLabels: Record<string, string>;
  } | null;
  interaction?: {
    drillDimensions?: { role: string; column: string; label: string }[];
  } | null;
} | null;

export type ChartRendererProps = {
  chartHeight: number;
  compact?: boolean;
  insightMode?: boolean;
  /** Detail-view layout preset (AI Insights + Charts) — margins, bar size, axis spacing. */
  detailViewLayout?: boolean;
  chartRows: ChartRow[];
  visualization: ChartRendererViz;
  presentationKind: ChartKind;
  axes: { categoryAxis: string; valueAxis: string; valueAxisCompact: string };
  viewportW: number;
  sessionCartesianPlanMain: VerticalCategoryAxisPlan | null;
  insightCartesianPlanMain: VerticalCategoryAxisPlan | null;
  tickTruncate: (v: string | number) => string;
  onInsightDrill: (primaryValue: string, secondaryRaw?: string) => void;
  /** Off-screen presentation capture — disable animation for stable PNG/PDF SVG. */
  pngCaptureMode?: boolean;
  /** Optional axis plan from export capture profiles; H-Bar falls back to shared domain policy. */
  exportAxisPresentationPlan?: AxisPresentationPlan | null;
  /** Overview auto-dashboard mini-card radial polish (size, legend gap, slice stroke). */
  overviewMiniRadial?: boolean;
};

function ChartRendererInner({
  chartHeight,
  compact = false,
  insightMode = false,
  detailViewLayout = false,
  chartRows,
  visualization,
  presentationKind,
  axes,
  viewportW,
  sessionCartesianPlanMain,
  insightCartesianPlanMain,
  tickTruncate,
  onInsightDrill,
  pngCaptureMode = false,
  exportAxisPresentationPlan = null,
  overviewMiniRadial = false,
}: ChartRendererProps) {
  useDevRenderCount("ChartRenderer");
  const rData = chartRows;
  const rViz = visualization;
  const rKind = presentationKind;
  const rAxes = axes;
  const isHistogram = rKind === "histogram";

  const formatCategoryTick = useMemo(
    () => (v: string | number) => formatChartAxisCategoryTick(String(v), compact),
    [compact]
  );

  const valueTickFormatter = useMemo(
    () => (tick: number) => formatAxisTickFromRows(rData, tick),
    [rData]
  );

  const scatterXTickFormatter = useMemo(
    () => (tick: number) => formatAxisTickFromScatterX(rData, tick),
    [rData]
  );

  const metricTooltipCtx = useMemo(
    (): MetricFormatContext => ({
      metricLabel: rAxes.valueAxis,
      chartTitle: rAxes.valueAxis,
      presentationKind: rKind,
    }),
    [rAxes.valueAxis, rKind]
  );

  const cartesianTooltip = useMemo(
    () =>
      buildChartCartesianTooltipHandlers(
        rAxes.categoryAxis,
        rAxes.valueAxis,
        metricTooltipCtx,
        rKind === "line" || rKind === "area"
          ? {
              categoryFormatter: (v) =>
                formatChartAxisCategoryTick(
                  formatTrendXAxisTickLabel(v),
                  compact
                ),
            }
          : rKind === "bar" || rKind === "histogram"
            ? { categoryFormatter: (v) => formatCategoryTick(v) }
            : undefined
      ),
    [
      rAxes.categoryAxis,
      rAxes.valueAxis,
      metricTooltipCtx,
      rKind,
      compact,
      formatCategoryTick,
    ]
  );

  const chartLayoutMode = compact ? "compact" : "full";
  const detailLayout = (insightMode || detailViewLayout) && !compact;

  const categoryTickStrings = useMemo(
    () => rData.map((r) => String(r.name ?? "")),
    [rData]
  );

  const cartesianLayout = useMemo(() => {
    if (rData.length === 0) return null;

    const tickSamples = collectSampleTickStrings(rData);

    const categoryPlan: VerticalCategoryAxisPlan | null =
      rKind === "bar" || rKind === "histogram" || rKind === "line" || rKind === "area"
        ? insightMode
          ? insightCartesianPlanMain
          : sessionCartesianPlanMain
        : null;

    const manyCategoryLegacy =
      categoryPlan == null &&
      (rKind === "bar_horizontal" ||
        (rKind === "bar" && rData.length > 8) ||
        (rKind === "histogram" && rData.length > 8) ||
        ((rKind === "line" || rKind === "area") && rData.length > 14) ||
        (rKind === "scatter" && rData.length > 22));

    const plotInnerHeightPx =
      chartLayoutMode === "full"
        ? Math.max(120, Math.floor(chartHeight * 0.86))
        : Math.max(72, Math.floor(chartHeight * 0.52));
    const verticalValueLayout = computeVerticalValueAxisLayout({
      valueAxisLabel: rAxes.valueAxisCompact,
      valueAxisMeasureLabel: rAxes.valueAxis,
      tickSampleStrings: tickSamples,
      chartLayoutMode,
      plotInnerHeightPx,
    });

    const vmBalanced = balanceVerticalOuterMargins({
      marginLeft: verticalValueLayout.marginLeft,
      chartLayoutMode,
    });

    const horizontalBarLayout =
      rKind === "bar_horizontal"
        ? computeHorizontalBarAxisLayout({
            categoryTickStrings,
            valueAxisLabel: rAxes.valueAxisCompact,
            valueAxisFull: rAxes.valueAxis,
            categoryAxisLabel: rAxes.categoryAxis,
            chartLayoutMode,
          })
        : null;

    const categoryAxisBottomMargin =
      rKind === "scatter" ||
      rKind === "pie" ||
      rKind === "donut" ||
      rKind === "bar_horizontal"
        ? 0
        : categoryPlan &&
            (rKind === "bar" || rKind === "histogram" || rKind === "line" || rKind === "area")
          ? computeCategoryAxisBottomMargin({
              categoryTickStrings,
              angled: categoryPlan.angled,
              tickFontSizePx: categoryPlan.tickFontSizePx,
              chartLayoutMode,
            })
          : computeCategoryAxisBottomMargin({
              categoryTickStrings,
              angled:
                manyCategoryLegacy &&
                (rKind === "bar" || rKind === "histogram" || rKind === "line" || rKind === "area"),
              chartLayoutMode,
            });

    return {
      tickSamples,
      categoryPlan,
      manyCategoryLegacy,
      plotInnerHeightPx,
      verticalValueLayout,
      vmBalanced,
      horizontalBarLayout,
      categoryAxisBottomMargin,
    };
  }, [
    rData,
    rKind,
    insightMode,
    insightCartesianPlanMain,
    sessionCartesianPlanMain,
    rAxes.valueAxisCompact,
    rAxes.valueAxis,
    rAxes.categoryAxis,
    chartLayoutMode,
    chartHeight,
    categoryTickStrings,
  ]);

  if (rData.length === 0 || !cartesianLayout) return null;

  const {
    categoryPlan,
    manyCategoryLegacy,
    verticalValueLayout,
    vmBalanced,
    horizontalBarLayout,
    categoryAxisBottomMargin,
  } = cartesianLayout;

  const detailLayoutViewportW = detailLayout
    ? getSharedDetailLayoutMetrics(rKind).planViewportPx
    : viewportW;
  const rechartsAnimActive =
    !pngCaptureMode && rData.length <= RECHARTS_ANIMATION_MAX_POINTS;
  const rechartsAnimDuration = pngCaptureMode ? 0 : undefined;

  const pickCartesianMargin = (bottomForCartesian: number) =>
    verticalCartesianOuterMargins(rKind, vmBalanced, bottomForCartesian, {
      insightUi: detailLayout,
      yAxisWidth: detailLayout ? verticalValueLayout.yAxisWidth : undefined,
      pointCount: detailLayout ? rData.length : undefined,
      lineChart: detailLayout && rKind === "line",
    });

  const insightVBarCatDense =
    detailLayout &&
    (rKind === "bar" || rKind === "histogram") &&
    rData.length >= 6;
  const insightHasCategoryLabel = Boolean(rAxes.categoryAxis?.trim());
  const insightVBarAngled =
    insightVBarCatDense ||
    Boolean(categoryPlan?.angled) ||
    (manyCategoryLegacy && (rKind === "bar" || rKind === "histogram"));
  const insightVBarXHeight =
    (categoryPlan?.xAxisHeightPx ??
      (manyCategoryLegacy ? (detailLayout ? 42 : 58) : detailLayout ? 24 : 36)) +
    (insightVBarCatDense ? 2 : 0);
  const insightVBarLabelOffset = insightVBarAngled ? -14 : -4;
  const insightVBarBottomPad =
    rKind === "bar" || rKind === "histogram"
      ? resolveVerticalBarPlotBottomPad({
          kind: rKind,
          categoryAxisBottomMargin,
          xAxisHeightPx: insightVBarXHeight,
          angled: insightVBarAngled,
          hasCategoryLabel: insightHasCategoryLabel,
          insightUi: detailLayout,
          denseCategories: insightVBarCatDense,
        })
      : categoryAxisBottomMargin;

  const insightVBarXInterval =
    categoryPlan?.interval ??
    (rData.length > 20
      ? "preserveStartEnd"
      : insightVBarCatDense && rData.length > 12
        ? 1
        : rData.length > 10
          ? 1
          : 0);

  const insightVBarXAngle = insightVBarCatDense
    ? -30
    : categoryPlan
      ? categoryPlan.angled
        ? categoryPlan.angleDeg
        : 0
      : manyCategoryLegacy
        ? -30
        : 0;
  const insightVBarXAnchor =
    insightVBarAngled ? "end" : "middle";

  const vizDrill = rViz?.interaction?.drillDimensions;
  const canInsightDrill = Boolean(vizDrill?.length);

  const metricTooltipName = rAxes.valueAxis;

  const stackedSpec = rViz?.multiSeries;
  const multiBarLayout = stackedSpec?.layout;
  const isGroupedDualMetric = multiBarLayout === "grouped_bar";
  const isStackedMulti = multiBarLayout === "stacked_bar";

  /** Dual-metric compare: side-by-side bars per category (never the summed `value` field). */
  if (
    isGroupedDualMetric &&
    stackedSpec &&
    stackedSpec.seriesKeys.length > 0
  ) {
    const keys = stackedSpec.seriesKeys;
    const hb =
      horizontalBarLayout ??
      computeHorizontalBarAxisLayout({
        categoryTickStrings: rData.map((r) => String(r.name ?? "")),
        valueAxisLabel: rAxes.valueAxisCompact,
        valueAxisFull: rAxes.valueAxis,
        categoryAxisLabel: rAxes.categoryAxis,
        chartLayoutMode,
      });
    const hmBalanced = balanceHorizontalOuterMargins({
      marginLeft: hb.marginLeft,
      chartLayoutMode,
    });
    return (
      <ResponsiveContainer
        key={rechartsContainerKey("bar_horizontal", viewportW, chartHeight, pngCaptureMode)}
        width="100%"
        height={chartHeight}
      >
        <BarChart
          layout="vertical"
          data={rData}
          margin={{
            left: hmBalanced.marginLeft,
            right: hmBalanced.marginRight,
            top: 16,
            bottom: Math.max(hb.marginBottom, compact ? 14 : 22),
          }}
        >
          <CartesianGrid
            horizontal={false}
            vertical
            stroke={GRID_STROKE}
            strokeDasharray="4 12"
            strokeOpacity={0.38}
          />
          <XAxis
            type="number"
            tick={{ fontSize: 11, fill: AXIS_TICK }}
            axisLine={{ stroke: CHART_AXIS_LINE }}
            tickLine={{ stroke: CHART_AXIS_LINE }}
            tickFormatter={valueTickFormatter}
          >
            {hb.showValueAxisTitle ? (
              <Label
                content={createHorizontalBottomAxisValueLabel(
                  hb.valueAxisTitleFull,
                  hb.valueAxisTitleDisplay
                )}
              />
            ) : null}
          </XAxis>
          <YAxis
            type="category"
            dataKey="name"
            width={hb.categoryAxisWidth}
            interval={compact ? 0 : rData.length > 18 ? 1 : 0}
            tick={
              <WrappedCategoryYAxisTick
                chartLayoutMode={chartLayoutMode}
                compact={compact}
              />
            }
            axisLine={{ stroke: CHART_AXIS_LINE }}
            tickLine={{ stroke: CHART_AXIS_LINE }}
          />
          <Tooltip
            {...CHART_TOOLTIP_FRAME}
            formatter={(v, name) => {
              const seriesKey = String(name ?? "");
              const label =
                stackedSpec.seriesLabels[seriesKey]?.trim() || seriesKey;
              const shown =
                v == null || v === ""
                  ? "—"
                  : typeof v === "number"
                    ? valueTickFormatter(v)
                    : String(v);
              return [shown, label];
            }}
            labelFormatter={(l) =>
              `${rAxes.categoryAxis} · ${tickTruncate(String(l ?? ""))}`
            }
          />
          <Legend
            wrapperStyle={{ fontSize: 10, paddingTop: 8 }}
            formatter={(v) => tickTruncate(String(v))}
          />
          {keys.map((k, i) => (
            <Bar
              key={k}
              dataKey={k}
              name={stackedSpec.seriesLabels[k] ?? k}
              fill={PIE_COLORS[i % PIE_COLORS.length]}
              radius={[0, 6, 6, 0]}
              maxBarSize={compact ? 22 : detailLayout ? 32 : 26}
              isAnimationActive={rechartsAnimActive}
            animationDuration={rechartsAnimDuration}
              cursor={canInsightDrill ? "pointer" : "default"}
              onClick={(entry: unknown) => {
                if (!canInsightDrill) return;
                const pl = entry as ChartRow & { name?: string };
                const nm = String(pl?.name ?? "").trim();
                if (!nm) return;
                onInsightDrill(nm, k);
              }}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    );
  }

  if (
    rKind === "bar" &&
    isStackedMulti &&
    stackedSpec &&
    stackedSpec.seriesKeys.length > 0
  ) {
    const keys = stackedSpec.seriesKeys;
    return (
      <ResponsiveContainer
        key={rechartsContainerKey(rKind, viewportW, chartHeight, pngCaptureMode)}
        width="100%"
        height={chartHeight}
      >
        <BarChart
          data={rData}
          margin={pickCartesianMargin(insightVBarBottomPad)}
        >
          <CartesianGrid
            vertical={false}
            horizontal
            stroke={GRID_STROKE}
            strokeDasharray="4 12"
            strokeOpacity={0.38}
          />
          <XAxis
            dataKey="name"
            tick={{
              fontSize: categoryPlan?.tickFontSizePx ?? 11,
              fill: AXIS_TICK,
            }}
            tickFormatter={formatCategoryTick}
            angle={insightVBarXAngle}
            textAnchor={insightVBarXAnchor}
            height={insightVBarXHeight}
            interval={insightVBarXInterval}
            minTickGap={compact ? 4 : detailLayout ? 28 : 14}
            axisLine={{ stroke: CHART_AXIS_LINE }}
            tickLine={{ stroke: CHART_AXIS_LINE }}
          >
            <Label
              value={rAxes.categoryAxis}
              position="insideBottom"
              offset={insightVBarLabelOffset}
              content={CartesianXAxisTitleLabelContent}
            />
          </XAxis>
          <YAxis
            tick={AXIS_Y_TICK_VAL}
            tickFormatter={valueTickFormatter}
            axisLine={{ stroke: CHART_AXIS_LINE }}
            tickLine={{ stroke: CHART_AXIS_LINE }}
            width={verticalValueLayout.yAxisWidth}
            label={
              verticalValueLayout.showValueAxisTitle
                ? {
                    content: createVerticalValueAxisLabel(
                      verticalValueLayout.valueAxisTitleFull,
                      verticalValueLayout.valueAxisTitleDisplay
                    ),
                  }
                : undefined
            }
          />
          <Tooltip
            {...CHART_TOOLTIP_FRAME}
            formatter={(v, name) => {
              return [String(v ?? "—"), String(name ?? "")];
            }}
            labelFormatter={(l) =>
              `${rAxes.categoryAxis} · ${tickTruncate(l)}`
            }
          />
          <Legend
            wrapperStyle={{ fontSize: 10, paddingTop: 8 }}
            formatter={(v) => tickTruncate(v)}
          />
          {keys.map((k, i) => (
            <Bar
              key={k}
              dataKey={k}
              name={stackedSpec.seriesLabels[k] ?? k}
              stackId="a"
              fill={PIE_COLORS[i % PIE_COLORS.length]}
              maxBarSize={compact ? 40 : 48}
              isAnimationActive={rechartsAnimActive}
            animationDuration={rechartsAnimDuration}
              cursor={canInsightDrill ? "pointer" : "default"}
              onClick={(d: unknown) => {
                if (!canInsightDrill) return;
                const payload = (d ?? {}) as ChartRow & Record<string, unknown>;
                const name = String(payload.name ?? "").trim();
                if (!name) return;
                onInsightDrill(name, k);
              }}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    );
  }

  if (rKind === "scatter") {
    const scatterAxisProps = resolveScatterValueAxisProps(rData);
    const scatterPremiumActive = scatterAxisProps != null;
    const scatterXMetricCtx: MetricFormatContext = {
      metricLabel: rAxes.categoryAxis,
      chartTitle: metricTooltipCtx.chartTitle,
      presentationKind: "scatter",
    };
    const detailScatterXTickFmt = scatterPremiumActive
      ? (tick: number) =>
          formatOverviewScatterAxisTick(tick, scatterXMetricCtx)
      : scatterXTickFormatter;
    const detailScatterYTickFmt = scatterPremiumActive
      ? (tick: number) =>
          formatOverviewScatterAxisTick(tick, metricTooltipCtx)
      : valueTickFormatter;
    const scatterYTickSamples = scatterAxisProps
      ? scatterAxisProps.y.ticks.map((t) => detailScatterYTickFmt(t))
      : collectSampleTickStrings(rData);
    const scatterValueLayout = scatterPremiumActive
      ? computeOverviewContinuousVerticalDashLayout(
          rAxes.valueAxis,
          scatterYTickSamples,
          chartHeight
        )
      : verticalValueLayout;
    const scatterMargins = scatterPremiumActive
      ? (() => {
          const sides = sessionDetailVerticalOuterMargins({
            yAxisWidth: scatterValueLayout.yAxisWidth,
            pointCount: rData.length,
          });
          return {
            top: 2,
            bottom: 20,
            left: sides.marginLeft,
            right: sides.marginRight,
          };
        })()
      : pickCartesianMargin(
          Math.max(
            manyCategoryLegacy ? 56 : 42,
            computeCategoryAxisBottomMargin({
              categoryTickStrings: [String(rAxes.categoryAxis || "—")],
              angled: false,
            }) + 8
          )
        );
    return (
      <ResponsiveContainer
        key={rechartsContainerKey(rKind, viewportW, chartHeight, pngCaptureMode)}
        width="100%"
        height={chartHeight}
      >
        <ScatterChart margin={scatterMargins}>
          <CartesianGrid
            stroke={GRID_STROKE}
            strokeDasharray="4 12"
            strokeOpacity={scatterPremiumActive ? 0.32 : 0.38}
          />
          <XAxis
            type="number"
            dataKey="x"
            tick={{ fontSize: 11, fill: AXIS_TICK }}
            tickFormatter={detailScatterXTickFmt}
            {...(scatterAxisProps ? scatterAxisProps.x : {})}
            axisLine={{ stroke: CHART_AXIS_LINE }}
            tickLine={{ stroke: CHART_AXIS_LINE }}
          >
            <Label
              value={rAxes.categoryAxis}
              position="insideBottom"
              offset={scatterPremiumActive ? -4 : -6}
              content={CartesianXAxisTitleLabelContent}
            />
          </XAxis>
          <YAxis
            type="number"
            dataKey="value"
            tick={AXIS_Y_TICK_VAL}
            tickFormatter={detailScatterYTickFmt}
            axisLine={{ stroke: CHART_AXIS_LINE }}
            tickLine={{ stroke: CHART_AXIS_LINE }}
            width={scatterValueLayout.yAxisWidth}
            {...(scatterAxisProps ? scatterAxisProps.y : {})}
            label={
              scatterValueLayout.showValueAxisTitle
                ? {
                    content: createVerticalValueAxisLabel(
                      scatterValueLayout.valueAxisTitleFull,
                      scatterValueLayout.valueAxisTitleDisplay
                    ),
                  }
                : undefined
            }
          />
          <Tooltip
            {...CHART_TOOLTIP_FRAME}
            formatter={(_v, _n, item) => {
              const p = item?.payload as ChartRow;
              const yd = p?.displayValue?.trim();
              const xd = p?.displayX?.trim();
              const yShow =
                yd ||
                (typeof p?.value === "number" ? String(p.value) : "—");
              const xShow =
                xd ||
                (typeof p?.x === "number" ? String(p.x) : "—");
              return [`${xShow} · ${yShow}`, "Values"];
            }}
            labelFormatter={(_, items) => {
              const arr =
                items as unknown as readonly { payload?: ChartRow }[];
              const p = arr?.[0]?.payload;
              return p?.name
                ? `${rAxes.categoryAxis} · ${String(p.name)}`
                : "Point";
            }}
          />
          <Scatter
            name="Points"
            data={rData}
            fill="#6366f1"
            fillOpacity={
              scatterPremiumActive
                ? OVERVIEW_SCATTER_POINT_FILL_OPACITY
                : 0.88
            }
            isAnimationActive={rechartsAnimActive}
            animationDuration={rechartsAnimDuration}
            {...(scatterPremiumActive
              ? {
                  shape: (props: {
                    cx?: number;
                    cy?: number;
                    fill?: string;
                    fillOpacity?: number;
                  }) => {
                    const { cx, cy, fill, fillOpacity } = props;
                    if (cx == null || cy == null) return <g />;
                    return (
                      <circle
                        cx={cx}
                        cy={cy}
                        r={OVERVIEW_SCATTER_POINT_RADIUS_PX}
                        fill={fill ?? "#6366f1"}
                        fillOpacity={
                          fillOpacity ?? OVERVIEW_SCATTER_POINT_FILL_OPACITY
                        }
                        stroke={OVERVIEW_SCATTER_POINT_STROKE_COLOR}
                        strokeOpacity={OVERVIEW_SCATTER_POINT_STROKE_OPACITY}
                        strokeWidth={OVERVIEW_SCATTER_POINT_STROKE_PX}
                      />
                    );
                  },
                }
              : {})}
          />
        </ScatterChart>
      </ResponsiveContainer>
    );
  }

  if (rKind === "pie" || rKind === "donut") {
    const polishOverviewMini =
      overviewMiniRadial && !insightMode && (rKind === "pie" || rKind === "donut");
    const piePad = computePieChartMargins(rAxes.valueAxisCompact);
    let radii = resolveRadialChartRadii({
      kind: rKind,
      plotHeightPx: chartHeight,
      plotWidthPx: viewportW,
      compact,
      pngCaptureMode,
      piePad,
    });
    let margins = pngCaptureMode
      ? radialChartExportOuterMargins(rKind, piePad)
      : radialChartOuterMargins(rKind, compact, piePad);
    if (polishOverviewMini) {
      radii = {
        ...scaleOverviewMiniRadialRadii(radii),
        cy: SESSION_DETAIL_RADIAL_CY,
      };
      margins = tightenOverviewMiniRadialMargins(margins);
    }
    const sliceStroke = polishOverviewMini
      ? OVERVIEW_MINI_RADIAL_SLICE_STROKE
      : "#fff";
    const legendFontSize = polishOverviewMini
      ? RADIAL_SESSION_LEGEND_FONT_PX
      : pngCaptureMode
        ? RADIAL_EXPORT_LEGEND_FONT_PX
        : RADIAL_SESSION_LEGEND_FONT_PX;
    const legendIconSize = polishOverviewMini
      ? RADIAL_SESSION_LEGEND_ICON_PX
      : pngCaptureMode
        ? RADIAL_EXPORT_LEGEND_ICON_PX
        : RADIAL_SESSION_LEGEND_ICON_PX;
    const sliceStrokeWidth = polishOverviewMini
      ? OVERVIEW_MINI_RADIAL_SLICE_STROKE_WIDTH
      : pngCaptureMode
        ? RADIAL_EXPORT_SLICE_STROKE_WIDTH
        : RADIAL_SESSION_SLICE_STROKE_WIDTH;
    const legendPaddingTop = polishOverviewMini
      ? OVERVIEW_MINI_RADIAL_LEGEND_PADDING_TOP_PX
      : pngCaptureMode
        ? RADIAL_EXPORT_LEGEND_PAD_TOP_PX
        : RADIAL_SESSION_LEGEND_PAD_TOP_PX;
    return (
      <ResponsiveContainer
        key={rechartsContainerKey(rKind, viewportW, chartHeight, pngCaptureMode)}
        width="100%"
        height={chartHeight}
      >
        <PieChart margin={margins}>
          <Pie
            data={rData}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy={radii.cy}
            innerRadius={radii.innerRadius}
            outerRadius={radii.outerRadius}
            paddingAngle={2}
            stroke={sliceStroke}
            strokeWidth={sliceStrokeWidth}
            isAnimationActive={rechartsAnimActive}
            animationDuration={rechartsAnimDuration}
            cursor={canInsightDrill ? "pointer" : "default"}
            onClick={(d) => {
              if (!canInsightDrill) return;
              const nm =
                typeof d === "object" &&
                d &&
                "name" in d &&
                typeof (d as { name?: unknown }).name !== "undefined"
                  ? String((d as { name?: string }).name ?? "").trim()
                  : "";
              if (!nm) return;
              onInsightDrill(nm);
            }}
          >
            {rData.map((_, i) => (
              <Cell
                key={`cell-${i}`}
                fill={PIE_COLORS[i % PIE_COLORS.length]}
              />
            ))}
          </Pie>
          <Tooltip
            {...CHART_TOOLTIP_FRAME}
            formatter={(v, _n, item) => {
              const p = item?.payload as ChartRow;
              return [
                formatRadialTooltipValue(rData, p, v),
                `${chartTooltipMetricLabel(rAxes.valueAxis)}:`,
              ];
            }}
            labelFormatter={(_, items) => {
              const arr = items as unknown as readonly { payload?: ChartRow }[];
              const p = arr?.[0]?.payload;
              return formatChartTooltipCategoryLine(
                rAxes.categoryAxis,
                String(p?.name ?? "")
              );
            }}
          />
          <Legend
            wrapperStyle={{ fontSize: legendFontSize, paddingTop: legendPaddingTop }}
            iconSize={legendIconSize}
            iconType="circle"
            formatter={(v) => tickTruncate(v)}
          />
        </PieChart>
      </ResponsiveContainer>
    );
  }

  const shouldRenderHorizontal = rKind === "bar_horizontal";

  if (shouldRenderHorizontal) {
    const hb =
      horizontalBarLayout ??
      computeHorizontalBarAxisLayout({
        categoryTickStrings: rData.map((r) => String(r.name ?? "")),
        valueAxisLabel: rAxes.valueAxisCompact,
        valueAxisFull: rAxes.valueAxis,
        categoryAxisLabel: rAxes.categoryAxis,
        chartLayoutMode,
      });
    const hmBalanced = balanceHorizontalOuterMargins({
      marginLeft: hb.marginLeft,
      chartLayoutMode,
    });
    const hBarValueAxisProps = resolveHBarValueAxisProps({
      plan: exportAxisPresentationPlan,
      chartKind: rKind,
      rows: rData,
      chartTitle: rAxes.valueAxis,
      metricLabel: rAxes.valueAxis,
      executiveRounding: pngCaptureMode,
    });
    return (
      <ResponsiveContainer
        key={rechartsContainerKey(rKind, viewportW, chartHeight, pngCaptureMode)}
        width="100%"
        height={chartHeight}
      >
        <BarChart
          layout="vertical"
          data={rData}
          margin={{
            left: hmBalanced.marginLeft,
            right: hmBalanced.marginRight,
            top: 16,
            bottom: Math.max(hb.marginBottom, compact ? 14 : 22),
          }}
        >
          <CartesianGrid
            horizontal={false}
            vertical
            stroke={GRID_STROKE}
            strokeDasharray="4 12"
            strokeOpacity={0.38}
          />
          <XAxis
            type="number"
            {...(hBarValueAxisProps ?? {})}
            tick={{ fontSize: 11, fill: AXIS_TICK }}
            axisLine={{ stroke: CHART_AXIS_LINE }}
            tickLine={{ stroke: CHART_AXIS_LINE }}
            tickFormatter={valueTickFormatter}
          >
            {hb.showValueAxisTitle ? (
              <Label
                content={createHorizontalBottomAxisValueLabel(
                  hb.valueAxisTitleFull,
                  hb.valueAxisTitleDisplay
                )}
              />
            ) : null}
          </XAxis>
          <YAxis
            type="category"
            dataKey="name"
            width={hb.categoryAxisWidth}
            interval={compact ? 0 : rData.length > 18 ? 1 : 0}
            tick={
              <WrappedCategoryYAxisTick
                chartLayoutMode={chartLayoutMode}
                compact={compact}
              />
            }
            axisLine={{ stroke: CHART_AXIS_LINE }}
            tickLine={{ stroke: CHART_AXIS_LINE }}
          />
          <Tooltip
            {...CHART_TOOLTIP_FRAME}
            formatter={cartesianTooltip.formatter}
            labelFormatter={cartesianTooltip.labelFormatter}
          />
          <Bar
            dataKey="value"
            fill="#6366f1"
            radius={[0, 8, 8, 0]}
            maxBarSize={compact ? 28 : detailLayout ? 48 : 36}
            activeBar={{ opacity: 0.88 }}
            isAnimationActive={rechartsAnimActive}
            animationDuration={rechartsAnimDuration}
            cursor={canInsightDrill ? "pointer" : "default"}
            onClick={(entry: unknown) => {
              if (!canInsightDrill) return;
              const pl = entry as ChartRow & { name?: string };
              const nm = String(pl?.name ?? "").trim();
              if (!nm) return;
              onInsightDrill(nm);
            }}
          />
        </BarChart>
      </ResponsiveContainer>
    );
  }

  if (rKind === "line" || rKind === "area") {
    const ChartBody =
      rKind === "area" ? AreaChart : LineChart;
    const temporalTickStrings = temporalTickStringsForChartRows(rData);
    const trendViewport = detailLayout ? detailLayoutViewportW : viewportW;
    const trendTickFs = lineAreaTickFontSizePx(compact, trendViewport);
    const lineAreaBottomMargin = detailLayout
      ? sessionLineAreaDetailBottomMargin(
          computeLineAreaChartBottomMargin({
            temporalTickStrings,
            tickFontSizePx: trendTickFs,
            chartLayoutMode,
          })
        )
      : Math.ceil(
          computeLineAreaChartBottomMargin({
            temporalTickStrings,
            tickFontSizePx: trendTickFs,
            chartLayoutMode,
          }) * 0.94
        );
    const trendInterval = computeLineAreaXAxisInterval(rData.length, {
      compact,
      viewportWidthPx: trendViewport,
    });
    const trendTickFormatter = (v: string | number) =>
      formatChartAxisCategoryTick(
        formatTrendXAxisTickLabel(String(v)),
        compact
      );
    const trendXAxisHeight = detailLayout
      ? sessionLineAreaDetailXAxisHeightPx()
      : lineAreaXAxisHeightPx(compact);
    const hideMarkers = rData.length > 45;
    const trendValueAxisProps = resolveTrendValueAxisProps({
      chartKind: rKind,
      values: rData.map((r) => r.value),
      surface: detailLayout ? "session" : "default",
    });
    const trendYTickFormatter = trendValueAxisProps
      ? (tick: number) => formatOverviewLineYAxisTick(tick, metricTooltipCtx)
      : valueTickFormatter;
    const premiumTickSamples = trendValueAxisProps
      ? trendValueAxisProps.ticks.map((t) => trendYTickFormatter(t))
      : collectSampleTickStrings(rData);
    const trendValueLayout = trendValueAxisProps
      ? computeVerticalValueAxisLayout({
          valueAxisLabel: rAxes.valueAxisCompact,
          valueAxisMeasureLabel: rAxes.valueAxis,
          tickSampleStrings: premiumTickSamples,
          chartLayoutMode: "full",
          plotInnerHeightPx: Math.max(220, Math.floor(chartHeight * 0.94)),
        })
      : verticalValueLayout;
    const plotMargin =
      detailLayout && trendValueAxisProps
        ? sessionTrendDetailPlotMargins({
            computedBottom: lineAreaBottomMargin,
            yAxisWidth: trendValueLayout.yAxisWidth,
            pointCount: rData.length,
            lineChart: rKind === "line",
          })
        : pickCartesianMargin(lineAreaBottomMargin);
    const detailLineStroke =
      detailLayout && rKind === "line"
        ? OVERVIEW_LINE_LIVE_STROKE_WIDTH_PX
        : 2.5;
    const detailDotR =
      detailLayout && rKind === "line"
        ? OVERVIEW_LINE_LIVE_MARKER_R_PX
        : compact
          ? 3.25
          : 3.75;
    const detailDotStroke =
      detailLayout && rKind === "line"
        ? OVERVIEW_LINE_LIVE_MARKER_STROKE_PX
        : 2;
    return (
      <ResponsiveContainer
        key={rechartsContainerKey(rKind, trendViewport, chartHeight, pngCaptureMode)}
        width="100%"
        height={chartHeight}
      >
        <ChartBody
          data={rData}
          margin={plotMargin}
        >
          <CartesianGrid
            vertical={false}
            horizontal
            stroke={GRID_STROKE}
            strokeDasharray="4 12"
            strokeOpacity={detailLayout ? 0.32 : 0.38}
          />
          <XAxis
            dataKey="name"
            tick={{
              fontSize: trendTickFs,
              fill: AXIS_TICK,
            }}
            tickFormatter={trendTickFormatter}
            angle={TREND_X_AXIS_ANGLE_DEG}
            textAnchor="end"
            height={trendXAxisHeight}
            interval={trendInterval}
            tickMargin={detailLayout ? 6 : 10}
            minTickGap={compact ? 6 : detailLayout ? 26 : 16}
            axisLine={{ stroke: CHART_AXIS_LINE }}
            tickLine={{ stroke: CHART_AXIS_LINE }}
          >
            <Label
              value={rAxes.categoryAxis}
              position="insideBottom"
              offset={detailLayout ? -8 : compact ? -20 : -24}
              content={CartesianXAxisTitleLabelContent}
            />
          </XAxis>
          <YAxis
            tick={AXIS_Y_TICK_VAL}
            tickFormatter={trendYTickFormatter}
            axisLine={{ stroke: CHART_AXIS_LINE }}
            tickLine={{ stroke: CHART_AXIS_LINE }}
            width={trendValueLayout.yAxisWidth}
            {...(trendValueAxisProps
              ? {
                  domain: trendValueAxisProps.domain,
                  ticks: trendValueAxisProps.ticks,
                  allowDataOverflow: trendValueAxisProps.allowDataOverflow,
                }
              : {})}
            label={
              trendValueLayout.showValueAxisTitle
                ? {
                    content: createVerticalValueAxisLabel(
                      trendValueLayout.valueAxisTitleFull,
                      trendValueLayout.valueAxisTitleDisplay
                    ),
                  }
                : undefined
            }
          />
          <Tooltip
            {...CHART_TOOLTIP_FRAME}
            formatter={(v, _n, item) => {
              const p = item?.payload as ChartRow;
              const d = p?.displayValue?.trim();
              const shown = d ?? (v == null ? "—" : v);
              return [shown, metricTooltipName];
            }}
            labelFormatter={(l) => trendTickFormatter(String(l ?? ""))}
          />
          {rKind === "area" ? (
            <Area
              type="monotone"
              dataKey="value"
              stroke="#4f46e5"
              strokeWidth={2.5}
              fill="#6366f1"
              fillOpacity={0.22}
              isAnimationActive={rechartsAnimActive}
            animationDuration={rechartsAnimDuration}
              dot={
                hideMarkers
                  ? false
                  : {
                      r: compact ? 3.25 : 3.75,
                      strokeWidth: 2,
                      stroke: "#fff",
                      fill: "#4f46e5",
                    }
              }
              activeDot={{ r: 6 }}
              connectNulls
            />
          ) : (
            <Line
              type="monotone"
              dataKey="value"
              stroke="#4f46e5"
              strokeWidth={detailLineStroke}
              isAnimationActive={rechartsAnimActive}
            animationDuration={rechartsAnimDuration}
              dot={
                hideMarkers
                  ? false
                  : {
                      r: detailDotR,
                      strokeWidth: detailDotStroke,
                      stroke: "#fff",
                      fill: "#4f46e5",
                    }
              }
              activeDot={{ r: 6 }}
              connectNulls
            />
          )}
        </ChartBody>
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer
      key={rechartsContainerKey(rKind, viewportW, chartHeight, pngCaptureMode)}
      width="100%"
      height={chartHeight}
    >
      <BarChart
        data={rData}
        barCategoryGap={
          isHistogram
            ? 2
            : detailLayout &&
                rData.length <= SHARED_CHART_LAYOUT.verticalBar.compactCategoryMax
              ? SHARED_CHART_LAYOUT.verticalBar.compactCategoryGap
              : detailLayout && rData.length <= 10
                ? "10%"
                : undefined
        }
        barGap={detailLayout && rData.length <= 6 ? 4 : undefined}
        margin={pickCartesianMargin(insightVBarBottomPad)}
      >
        <CartesianGrid
          vertical={false}
          horizontal
          stroke={GRID_STROKE}
          strokeDasharray="4 12"
          strokeOpacity={0.38}
        />
        <XAxis
          dataKey="name"
          tick={{
            fontSize: categoryPlan?.tickFontSizePx ?? 11,
            fill: AXIS_TICK,
          }}
          tickFormatter={formatCategoryTick}
          angle={insightVBarXAngle}
          textAnchor={insightVBarXAnchor}
          height={insightVBarXHeight}
          interval={insightVBarXInterval}
          minTickGap={compact ? 4 : detailLayout ? 28 : 14}
          axisLine={{ stroke: CHART_AXIS_LINE }}
          tickLine={{ stroke: CHART_AXIS_LINE }}
        >
          <Label
            value={rAxes.categoryAxis}
            position="insideBottom"
            offset={insightVBarLabelOffset}
            content={CartesianXAxisTitleLabelContent}
          />
        </XAxis>
        <YAxis
          tick={AXIS_Y_TICK_VAL}
          tickFormatter={valueTickFormatter}
          axisLine={{ stroke: CHART_AXIS_LINE }}
          tickLine={{ stroke: CHART_AXIS_LINE }}
          width={verticalValueLayout.yAxisWidth}
          {...(resolveVerticalBarValueAxisProps({
            plan: exportAxisPresentationPlan,
            chartKind: rKind,
            rows: rData,
            chartTitle: metricTooltipCtx.chartTitle,
            metricLabel: rAxes.valueAxis,
          }) ?? {})}
          label={
            verticalValueLayout.showValueAxisTitle
              ? {
                  content: createVerticalValueAxisLabel(
                    verticalValueLayout.valueAxisTitleFull,
                    verticalValueLayout.valueAxisTitleDisplay
                  ),
                }
              : undefined
          }
        />
          <Tooltip
            {...CHART_TOOLTIP_FRAME}
            formatter={cartesianTooltip.formatter}
            labelFormatter={cartesianTooltip.labelFormatter}
          />
        <Bar
          dataKey="value"
          fill="#6366f1"
          radius={isHistogram ? [3, 3, 0, 0] : [10, 10, 6, 6]}
          maxBarSize={isHistogram ? (compact ? 52 : 60) : compact ? 40 : 56}
          activeBar={{ opacity: 0.9 }}
          isAnimationActive={rechartsAnimActive}
            animationDuration={rechartsAnimDuration}
          cursor={canInsightDrill ? "pointer" : "default"}
          onClick={(entry: unknown) => {
            if (!canInsightDrill) return;
            const pl = entry as ChartRow & { name?: string };
            const nm = String(pl?.name ?? "").trim();
            if (!nm) return;
            onInsightDrill(nm);
          }}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

export const ChartRenderer = memo(ChartRendererInner);
ChartRenderer.displayName = "ChartRenderer";
