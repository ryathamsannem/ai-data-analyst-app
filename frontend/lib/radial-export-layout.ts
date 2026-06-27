import type { PieLegendLayout } from "@/lib/chart-axis-layout";

/** Overview mini-card compact bases (unchanged — live polish applied in overview-mini-radial-polish). */
export const RADIAL_COMPACT_OUTER_PX = 84;
export const RADIAL_COMPACT_INNER_DONUT_PX = 52;

/** Session detail cy when legend renders inside the PieChart (Charts + AI live). */
export const SESSION_DETAIL_RADIAL_CY = "48%";

/** Export capture — overview compact uses proportional export radii (not live fixed bases). */
export const RADIAL_EXPORT_MIN_SVG_PAD_PX = 20;

/** Export PNG/PDF plot band — target ring diameter as fraction of plot height (~62–65%). */
export const RADIAL_EXPORT_PLOT_BAND_DIAMETER_RATIO = 0.63;

/** Export PNG/PDF — outer radius as fraction of min(usable width, usable height). */
export const RADIAL_EXPORT_OUTER_RADIUS_USABLE_RATIO = 0.36;

/** Composite plot width util — radial exports only (balances legend/footer vs ring). */
export const RADIAL_EXPORT_PLOT_WIDTH_UTIL = 0.86;

/** Recharts legend + slice styling for session vs export (overview mini uses overview-mini-radial-polish). */
export const RADIAL_SESSION_LEGEND_FONT_PX = 12;
export const RADIAL_SESSION_LEGEND_ICON_PX = 9;
export const RADIAL_SESSION_LEGEND_PAD_TOP_PX = 6;
export const RADIAL_SESSION_SLICE_STROKE_WIDTH = 1.25;

export const RADIAL_EXPORT_LEGEND_FONT_PX = 24;
export const RADIAL_EXPORT_LEGEND_ICON_PX = 17;
export const RADIAL_EXPORT_LEGEND_PAD_TOP_PX = 4;
/** Horizontal gap between legend items on one row (composite PNG). */
export const RADIAL_EXPORT_LEGEND_ITEM_GAP_PX = 10;
/** Gap between swatch dot and label text (composite PNG). */
export const RADIAL_EXPORT_LEGEND_SWATCH_GAP_PX = 10;
/** Vertical padding added to legend font for row height (composite PNG). */
export const RADIAL_EXPORT_LEGEND_ROW_EXTRA_PX = 14;
/** Gap between plot band and external legend row (composite PNG). */
export const RADIAL_EXPORT_LEGEND_PLOT_GAP_PX = 10;
/** Composite PNG footer — radial exports only (Charts/Overview PNG + PDF artifact). */
export const RADIAL_EXPORT_FOOTER_FONT_PX = 22;
export const RADIAL_EXPORT_FOOTER_RESERVE_PX = 46;
export const RADIAL_EXPORT_SLICE_STROKE_WIDTH = 1;

/** Inner card width minus horizontal card padding (matches PNG composite). */
export const RADIAL_EXPORT_INNER_WIDTH_PX = 1352;

/** Session detail: outer radius as fraction of min(usable width, usable height). */
export const SESSION_RADIAL_OUTER_RADIUS_USABLE_RATIO = 0.4;

/** Session detail: target ring diameter as fraction of full plot band height (~65–75%). */
export const SESSION_RADIAL_PLOT_BAND_DIAMETER_RATIO = 0.7;

/** Donut hole sizing — preserves prior 54/88 proportion at reference scale. */
export const DONUT_INNER_TO_OUTER_RADIUS_RATIO = 54 / 88;

export type RadialChartRadii = {
  innerRadius: number;
  outerRadius: number;
  /** Recharts `cy` — shift slightly up when legend is in-chart. */
  cy: string;
};

export function computeSessionRadialPlotBandOccupancy(args: {
  outerRadius: number;
  plotHeightPx: number;
}): number {
  const h = Math.max(1, args.plotHeightPx);
  return (args.outerRadius * 2) / h;
}

function estimateSessionRadialLayoutPads(args: {
  legendInChart: boolean;
  piePad: PieLegendLayout;
}): { top: number; side: number; bottom: number } {
  if (args.legendInChart) {
    const legendBlock =
      RADIAL_SESSION_LEGEND_FONT_PX +
      RADIAL_SESSION_LEGEND_PAD_TOP_PX +
      Math.max(28, Math.ceil(args.piePad.marginBottom * 0.55));
    return { top: 6, side: 12, bottom: legendBlock };
  }
  return { top: 20, side: 20, bottom: 24 };
}

/** Proportional session-detail radii — same occupancy model for live, PNG, and PDF capture. */
export function resolveProportionalSessionRadialRadii(args: {
  kind: "pie" | "donut";
  plotWidthPx: number;
  plotHeightPx: number;
  legendInChart: boolean;
  piePad: PieLegendLayout;
}): RadialChartRadii {
  const plotW = Math.max(200, args.plotWidthPx);
  const plotH = Math.max(200, args.plotHeightPx);
  const pads = estimateSessionRadialLayoutPads(args);

  const usableW = Math.max(160, plotW - pads.side * 2);
  const usableH = Math.max(160, plotH - pads.top - pads.bottom);
  const usable = Math.min(usableW, usableH);

  const fromUsable = Math.round(usable * SESSION_RADIAL_OUTER_RADIUS_USABLE_RATIO);
  const fromPlotBand = Math.round(
    (plotH * SESSION_RADIAL_PLOT_BAND_DIAMETER_RATIO) / 2
  );
  const outerRadius = Math.max(
    64,
    Math.min(fromUsable, fromPlotBand, Math.round(usableH * 0.46))
  );

  const innerRadius =
    args.kind === "pie"
      ? 0
      : Math.round(outerRadius * DONUT_INNER_TO_OUTER_RADIUS_RATIO);

  return {
    innerRadius,
    outerRadius,
    cy: args.legendInChart ? SESSION_DETAIL_RADIAL_CY : "50%",
  };
}

function estimateExportRadialLayoutPads(): {
  top: number;
  side: number;
  bottom: number;
} {
  const edge = RADIAL_EXPORT_MIN_SVG_PAD_PX;
  return { top: edge + 4, side: edge, bottom: edge + 4 };
}

/** Proportional export radii — legend is composite chrome (Overview/Charts PNG + PDF). */
export function resolveProportionalExportRadialRadii(args: {
  kind: "pie" | "donut";
  plotWidthPx: number;
  plotHeightPx: number;
}): RadialChartRadii {
  const plotW = Math.max(200, args.plotWidthPx);
  const plotH = Math.max(200, args.plotHeightPx);
  const pads = estimateExportRadialLayoutPads();

  const usableW = Math.max(160, plotW - pads.side * 2);
  const usableH = Math.max(160, plotH - pads.top - pads.bottom);
  const usable = Math.min(usableW, usableH);

  const fromUsable = Math.round(
    usable * RADIAL_EXPORT_OUTER_RADIUS_USABLE_RATIO
  );
  const fromPlotBand = Math.round(
    (plotH * RADIAL_EXPORT_PLOT_BAND_DIAMETER_RATIO) / 2
  );
  const outerRadius = Math.max(
    64,
    Math.min(fromUsable, fromPlotBand, Math.round(usableH * 0.42))
  );

  const innerRadius =
    args.kind === "pie"
      ? 0
      : Math.round(outerRadius * DONUT_INNER_TO_OUTER_RADIUS_RATIO);

  return {
    innerRadius,
    outerRadius,
    cy: "50%",
  };
}

export function estimateExportLegendRows(
  categoryCount: number,
  innerWidthPx: number = RADIAL_EXPORT_INNER_WIDTH_PX
): number {
  const n = Math.max(1, categoryCount);
  // Conservative — executive category labels often need multiple legend rows.
  const avgItemWidthPx = 196;
  const rowGapPx = 6;
  const itemsPerRow = Math.max(
    1,
    Math.floor((innerWidthPx + rowGapPx) / (avgItemWidthPx + rowGapPx))
  );
  return Math.ceil(n / itemsPerRow);
}

export function estimateExportLegendHeightPx(categoryCount: number): number {
  const rows = estimateExportLegendRows(categoryCount);
  const rowH = RADIAL_EXPORT_LEGEND_FONT_PX + RADIAL_EXPORT_LEGEND_ROW_EXTRA_PX;
  const rowGap = RADIAL_EXPORT_LEGEND_ITEM_GAP_PX;
  return rows * rowH + Math.max(0, rows - 1) * rowGap + 14;
}

/** Plot band height for off-screen radial capture (donut only — legend is composite chrome). */
export function resolveRadialExportPlotHeight(categoryCount: number): number {
  const n = Math.max(1, categoryCount);
  const base = 400;
  const extra = n > 6 ? 24 : n > 4 ? 12 : 0;
  return base + extra;
}

/**
 * Total PNG canvas height for pie/donut — room for title, KPI chips, plot, legend, footer.
 */
export function resolveRadialExportCanvasHeight(
  categoryCount: number,
  plotHeightPx?: number
): number {
  const plotH = plotHeightPx ?? resolveRadialExportPlotHeight(categoryCount);
  const legendH = estimateExportLegendHeightPx(categoryCount);
  const headerChrome = 132;
  const cardPad = 104;
  const footer = RADIAL_EXPORT_FOOTER_RESERVE_PX;
  const gaps = 28;
  return plotH + headerChrome + legendH + cardPad + footer + gaps;
}

export function resolveRadialChartRadii(args: {
  kind: "pie" | "donut";
  plotHeightPx: number;
  plotWidthPx?: number;
  compact: boolean;
  pngCaptureMode: boolean;
  piePad?: PieLegendLayout;
}): RadialChartRadii {
  if (args.pngCaptureMode) {
    const plotWidthPx = args.plotWidthPx ?? RADIAL_EXPORT_INNER_WIDTH_PX;
    return resolveProportionalExportRadialRadii({
      kind: args.kind,
      plotWidthPx,
      plotHeightPx: args.plotHeightPx,
    });
  }

  if (!args.compact) {
    const plotWidthPx = args.plotWidthPx ?? 760;
    return resolveProportionalSessionRadialRadii({
      kind: args.kind,
      plotWidthPx,
      plotHeightPx: args.plotHeightPx,
      legendInChart: true,
      piePad: args.piePad ?? { marginHorizontal: 12, marginBottom: 24 },
    });
  }

  const baseInner = args.kind === "pie" ? 0 : RADIAL_COMPACT_INNER_DONUT_PX;
  const baseOuter = RADIAL_COMPACT_OUTER_PX;

  return {
    innerRadius: baseInner,
    outerRadius: baseOuter,
    cy: "50%",
  };
}

/** Export margins — extra padding so the ring never touches the SVG clip edge. */
export function radialChartExportOuterMargins(
  kind: "pie" | "donut",
  piePad: PieLegendLayout
): { top: number; left: number; right: number; bottom: number } {
  const edge = RADIAL_EXPORT_MIN_SVG_PAD_PX;
  const horizontal = edge + Math.min(24, piePad.marginHorizontal * 0.35);
  return {
    top: edge + 4,
    left: Math.max(edge, horizontal),
    right: Math.max(edge, horizontal),
    bottom: Math.max(
      edge,
      4 + Math.ceil(piePad.marginBottom * (kind === "donut" ? 0.24 : 0.2))
    ),
  };
}
