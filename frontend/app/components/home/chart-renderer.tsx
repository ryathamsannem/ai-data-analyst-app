"use client";

import { memo, useMemo } from "react";
import type { ChartKind, ChartRow } from "@/app/chart-types";
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
  createHorizontalBottomAxisValueLabel,
  createVerticalValueAxisLabel,
} from "@/app/components/chart-value-axis-title";
import {
  getInsightLayoutMetrics,
  insightCartesianOuterMargins,
} from "@/lib/chart-layout-config";
import {
  formatAxisTickFromRows,
  formatAxisTickFromScatterX,
  formatChartAxisCategoryTick,
} from "@/lib/chart-axis-formatters";
import { PIE_COLORS } from "@/lib/chart-palette";
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

const GRID_STROKE = "#eef2f7";
const CHART_AXIS_LINE = "#e2e8f0";
const AXIS_TICK = "#64748b";
const CHART_TOOLTIP_FRAME = {
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
const AXIS_Y_TICK_VAL = { fontSize: 11, fill: AXIS_TICK, dx: 6 } as const;

export type ChartRendererViz = {
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
  chartRows: ChartRow[];
  visualization: ChartRendererViz;
  presentationKind: ChartKind;
  axes: { categoryAxis: string; valueAxis: string; valueAxisCompact: string };
  viewportW: number;
  sessionCartesianPlanMain: VerticalCategoryAxisPlan | null;
  insightCartesianPlanMain: VerticalCategoryAxisPlan | null;
  tickTruncate: (v: string | number) => string;
  onInsightDrill: (primaryValue: string, secondaryRaw?: string) => void;
};

function ChartRendererInner({
  chartHeight,
  compact = false,
  insightMode = false,
  chartRows,
  visualization,
  presentationKind,
  axes,
  viewportW,
  sessionCartesianPlanMain,
  insightCartesianPlanMain,
  tickTruncate,
  onInsightDrill,
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

  const chartLayoutMode = compact ? "compact" : "full";
  const insightUi = insightMode && !compact;
  const insightLayoutViewportW = insightUi
    ? getInsightLayoutMetrics(rKind).planViewportPx
    : viewportW;
  const rechartsAnimActive = rData.length <= RECHARTS_ANIMATION_MAX_POINTS;
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

  const pickCartesianMargin = (bottomForCartesian: number) => {
    if (!insightUi) {
      return {
        left: vmBalanced.marginLeft,
        right: vmBalanced.marginRight,
        top: 22,
        bottom: bottomForCartesian,
      };
    }
    return insightCartesianOuterMargins(rKind, vmBalanced, bottomForCartesian);
  };

  const horizontalBarLayout =
    rKind === "bar_horizontal"
      ? computeHorizontalBarAxisLayout({
          categoryTickStrings: rData.map((r) => String(r.name ?? "")),
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
            categoryTickStrings: rData.map((r) => String(r.name ?? "")),
            angled: categoryPlan.angled,
            tickFontSizePx: categoryPlan.tickFontSizePx,
            chartLayoutMode,
          })
        : computeCategoryAxisBottomMargin({
            categoryTickStrings: rData.map((r) => String(r.name ?? "")),
            angled:
              manyCategoryLegacy &&
              (rKind === "bar" || rKind === "histogram" || rKind === "line" || rKind === "area"),
            chartLayoutMode,
          });

  const insightVBarCatDense =
    insightUi &&
    (rKind === "bar" || rKind === "histogram") &&
    rData.length >= 6;
  const insightVBarBottomPad =
    categoryAxisBottomMargin +
    (insightVBarCatDense
      ? 22
      : insightUi && (rKind === "bar" || rKind === "histogram")
        ? 10
        : 0);

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
    insightVBarCatDense || categoryPlan?.angled || manyCategoryLegacy
      ? "end"
      : "middle";
  const insightVBarXHeight =
    (categoryPlan?.xAxisHeightPx ?? (manyCategoryLegacy ? 58 : 36)) +
    (insightVBarCatDense ? 16 : 0);

  const vizDrill = rViz?.interaction?.drillDimensions;
  const canInsightDrill = Boolean(vizDrill?.length);

  const metricTooltipName = rAxes.valueAxis;

  const stackedSpec = rViz?.multiSeries;
  if (
    rKind === "bar" &&
    stackedSpec?.layout === "stacked_bar" &&
    stackedSpec.seriesKeys.length > 0
  ) {
    const keys = stackedSpec.seriesKeys;
    return (
      <ResponsiveContainer width="100%" height={chartHeight}>
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
            minTickGap={compact ? 4 : insightUi ? 28 : 14}
            axisLine={{ stroke: CHART_AXIS_LINE }}
            tickLine={{ stroke: CHART_AXIS_LINE }}
          >
            <Label
              value={rAxes.categoryAxis}
              position="insideBottom"
              offset={
                insightVBarCatDense || categoryPlan?.angled || manyCategoryLegacy
                  ? -34
                  : -8
              }
              style={{ fill: "#64748b", fontSize: 11, fontWeight: 500 }}
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
    return (
      <ResponsiveContainer width="100%" height={chartHeight}>
        <ScatterChart
          margin={pickCartesianMargin(
            Math.max(
              manyCategoryLegacy ? 56 : 42,
              computeCategoryAxisBottomMargin({
                categoryTickStrings: [String(rAxes.categoryAxis || "—")],
                angled: false,
              }) + 8
            )
          )}
        >
          <CartesianGrid
            stroke={GRID_STROKE}
            strokeDasharray="4 12"
            strokeOpacity={0.38}
          />
          <XAxis
            type="number"
            dataKey="x"
            tick={{ fontSize: 11, fill: AXIS_TICK }}
            tickFormatter={scatterXTickFormatter}
            axisLine={{ stroke: CHART_AXIS_LINE }}
            tickLine={{ stroke: CHART_AXIS_LINE }}
          >
            <Label
              value={rAxes.categoryAxis}
              position="insideBottom"
              offset={-6}
              style={{ fill: "#64748b", fontSize: 11, fontWeight: 500 }}
            />
          </XAxis>
          <YAxis
            type="number"
            dataKey="value"
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
            fillOpacity={0.88}
            isAnimationActive={rechartsAnimActive}
          />
        </ScatterChart>
      </ResponsiveContainer>
    );
  }

  if (rKind === "pie" || rKind === "donut") {
    const innerR =
      rKind === "pie" ? 0 : compact ? 52 : 62;
    const piePad = computePieChartMargins(rAxes.valueAxisCompact);
    return (
      <ResponsiveContainer width="100%" height={chartHeight}>
        <PieChart
          margin={{
            top: 10,
            right: 10 + piePad.marginHorizontal,
            left: 8 + piePad.marginHorizontal,
            bottom: 10 + piePad.marginBottom,
          }}
        >
          <Pie
            data={rData}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            innerRadius={innerR}
            outerRadius={compact ? 84 : 100}
            paddingAngle={2}
            stroke="#fff"
            strokeWidth={2}
            isAnimationActive={rechartsAnimActive}
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
              const d = p?.displayValue?.trim();
              if (d) return [d, metricTooltipName];
              if (typeof v === "number") return [`${v.toFixed(1)}%`, metricTooltipName];
              if (v != null && String(v).length > 0)
                return [`${String(v)}%`, metricTooltipName];
              return ["—", metricTooltipName];
            }}
            labelFormatter={(l) => tickTruncate(String(l ?? ""))}
          />
          <Legend
            wrapperStyle={{ fontSize: 11, paddingTop: 10 }}
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
    return (
      <ResponsiveContainer width="100%" height={chartHeight}>
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
            formatter={(v, _n, item) => {
              const p = item?.payload as ChartRow;
              const d = p?.displayValue?.trim();
              const shown = d ?? (v == null ? "—" : v);
              return [shown, metricTooltipName];
            }}
            labelFormatter={(l) => String(l ?? "").trim() || "—"}
          />
          <Bar
            dataKey="value"
            fill="#6366f1"
            radius={[0, 8, 8, 0]}
            maxBarSize={compact ? 28 : insightUi ? 48 : 36}
            activeBar={{ opacity: 0.88 }}
            isAnimationActive={rechartsAnimActive}
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
    const trendViewport = insightUi ? insightLayoutViewportW : viewportW;
    const trendTickFs = lineAreaTickFontSizePx(compact, trendViewport);
    const lineAreaBottomMargin = Math.ceil(
      computeLineAreaChartBottomMargin({
        temporalTickStrings,
        tickFontSizePx: trendTickFs,
        chartLayoutMode,
      }) * (insightUi ? 1.2 : 1)
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
    const trendXAxisHeight = lineAreaXAxisHeightPx(compact);
    const hideMarkers = rData.length > 45;
    return (
      <ResponsiveContainer width="100%" height={chartHeight}>
        <ChartBody
          data={rData}
          margin={pickCartesianMargin(lineAreaBottomMargin)}
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
              fontSize: trendTickFs,
              fill: AXIS_TICK,
            }}
            tickFormatter={trendTickFormatter}
            angle={TREND_X_AXIS_ANGLE_DEG}
            textAnchor="end"
            height={trendXAxisHeight}
            interval={trendInterval}
            tickMargin={10}
            minTickGap={compact ? 6 : insightUi ? 26 : 16}
            axisLine={{ stroke: CHART_AXIS_LINE }}
            tickLine={{ stroke: CHART_AXIS_LINE }}
          >
            <Label
              value={rAxes.categoryAxis}
              position="insideBottom"
              offset={compact ? -22 : -26}
              style={{ fill: "#64748b", fontSize: 11, fontWeight: 500 }}
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
              strokeWidth={2.5}
              isAnimationActive={rechartsAnimActive}
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
          )}
        </ChartBody>
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={chartHeight}>
      <BarChart
        data={rData}
        barCategoryGap={
          isHistogram
            ? 2
            : insightUi && rData.length <= 5
              ? "5%"
              : insightUi && rData.length <= 10
                ? "10%"
                : undefined
        }
        barGap={insightUi && rData.length <= 6 ? 4 : undefined}
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
          minTickGap={compact ? 4 : insightUi ? 28 : 14}
          axisLine={{ stroke: CHART_AXIS_LINE }}
          tickLine={{ stroke: CHART_AXIS_LINE }}
        >
          <Label
            value={rAxes.categoryAxis}
            position="insideBottom"
            offset={
              insightVBarCatDense || categoryPlan?.angled || manyCategoryLegacy
                ? -36
                : -10
            }
            style={{ fill: "#64748b", fontSize: 11, fontWeight: 500 }}
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
          formatter={(v, _n, item) => {
            const p = item?.payload as ChartRow;
            const d = p?.displayValue?.trim();
            const shown = d ?? (v == null ? "—" : v);
            return [shown, metricTooltipName];
          }}
          labelFormatter={(l) => tickTruncate(String(l ?? ""))}
        />
        <Bar
          dataKey="value"
          fill="#6366f1"
          radius={isHistogram ? [3, 3, 0, 0] : [10, 10, 6, 6]}
          maxBarSize={isHistogram ? (compact ? 52 : 60) : compact ? 40 : 56}
          activeBar={{ opacity: 0.9 }}
          isAnimationActive={rechartsAnimActive}
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
