import type { PieLegendLayout } from "@/lib/chart-axis-layout";

/** Export donut/pie outer radius scale (~18% reduction vs on-screen). */
export const RADIAL_EXPORT_RADIUS_SCALE = 0.82;

/** Minimum padding around radial plot content in PNG SVG viewBox (px). */
export const RADIAL_EXPORT_MIN_SVG_PAD_PX = 20;

/** Inner card width minus horizontal card padding (matches PNG composite). */
export const RADIAL_EXPORT_INNER_WIDTH_PX = 1352;

export type RadialChartRadii = {
  innerRadius: number;
  outerRadius: number;
  /** Recharts `cy` — shift slightly up during export (legend rendered below composite). */
  cy: string;
};

export function estimateExportLegendRows(
  categoryCount: number,
  innerWidthPx: number = RADIAL_EXPORT_INNER_WIDTH_PX
): number {
  const n = Math.max(1, categoryCount);
  // Conservative — executive category labels often need multiple legend rows.
  const avgItemWidthPx = 168;
  const rowGapPx = 6;
  const itemsPerRow = Math.max(
    1,
    Math.floor((innerWidthPx + rowGapPx) / (avgItemWidthPx + rowGapPx))
  );
  return Math.ceil(n / itemsPerRow);
}

export function estimateExportLegendHeightPx(categoryCount: number): number {
  const rows = estimateExportLegendRows(categoryCount);
  const rowH = 18;
  const rowGap = 6;
  return rows * rowH + Math.max(0, rows - 1) * rowGap + 8;
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
  const footer = 34;
  const gaps = 20;
  return plotH + headerChrome + legendH + cardPad + footer + gaps;
}

export function resolveRadialChartRadii(args: {
  kind: "pie" | "donut";
  plotHeightPx: number;
  compact: boolean;
  pngCaptureMode: boolean;
}): RadialChartRadii {
  const baseInner = args.kind === "pie" ? 0 : args.compact ? 52 : 62;
  const baseOuter = args.compact ? 84 : 100;

  if (!args.pngCaptureMode) {
    return {
      innerRadius: baseInner,
      outerRadius: baseOuter,
      cy: "50%",
    };
  }

  const refPlotH = args.compact ? 300 : 340;
  const heightScale = Math.min(1, args.plotHeightPx / refPlotH);
  const scale = RADIAL_EXPORT_RADIUS_SCALE * heightScale;

  return {
    innerRadius: Math.round(baseInner * scale),
    outerRadius: Math.round(baseOuter * scale),
    cy: "46%",
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
    top: edge + 6,
    left: Math.max(edge, horizontal),
    right: Math.max(edge, horizontal),
    bottom: Math.max(
      edge,
      8 + Math.ceil(piePad.marginBottom * (kind === "donut" ? 0.35 : 0.3))
    ),
  };
}
