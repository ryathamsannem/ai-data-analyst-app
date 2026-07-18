import type { ChartKind } from "@/app/chart-types";
import type { ChartArtifactProfile } from "@/lib/chart-platform/chart-artifact";
import {
  resolveRadialExportCanvasHeight,
  resolveRadialExportPlotHeight,
} from "@/lib/radial-export-layout";

/** Default presentation PNG canvas width (histogram and other cartesian kinds). */
export const PRESENTATION_EXPORT_WIDTH_PX = 1400;

/** Balanced width for line / area / scatter exports. */
export const PRESENTATION_EXPORT_COMPACT_WIDTH_PX = 1200;

/** Tighter width for horizontal-bar exports (reduces empty right-side space). */
export const PRESENTATION_EXPORT_HORIZONTAL_WIDTH_PX = 1100;

/** Wider horizontal-bar canvas when many categories need vertical room. */
export const PRESENTATION_EXPORT_HORIZONTAL_WIDE_WIDTH_PX = 1300;

/** Standalone PNG (overview/charts) — vertical bar width tiers by category count. */
export const STANDALONE_PNG_VBAR_WIDTH_SPARSE_PX = 790;
export const STANDALONE_PNG_VBAR_WIDTH_MODERATE_PX = 870;
export const STANDALONE_PNG_VBAR_WIDTH_DENSE_PX = 1050;

/** Standalone PNG (overview/charts) — horizontal bar width tiers by category count. */
export const STANDALONE_PNG_HBAR_WIDTH_SPARSE_PX = 870;
export const STANDALONE_PNG_HBAR_WIDTH_MODERATE_PX = 960;

/** Standalone PNG (overview/charts) — line/area width tiers by point count. */
export const STANDALONE_PNG_TREND_WIDTH_SPARSE_PX = 860;
export const STANDALONE_PNG_TREND_WIDTH_MODERATE_PX = 1000;
export const STANDALONE_PNG_TREND_WIDTH_DENSE_PX = 1180;

/** Standalone PNG (overview/charts) — histogram width tiers by bucket count. */
export const STANDALONE_PNG_HISTOGRAM_WIDTH_SPARSE_PX = 860;
export const STANDALONE_PNG_HISTOGRAM_WIDTH_MODERATE_PX = 1000;
export const STANDALONE_PNG_HISTOGRAM_WIDTH_DENSE_PX = 1180;

/** Target total PNG height for line/area exports. */
export const PRESENTATION_EXPORT_HEIGHT_PX = 900;

/** Shorter canvas for line/area when a 4:3 card reads better. */
export const PRESENTATION_EXPORT_LINE_HEIGHT_PX = 800;

/** Vertical chrome reserved for title, chips, warning, card padding, and composite padding. */
export const PRESENTATION_EXPORT_CHROME_PX = 132;

/** Overview grid uses two columns only when container is at least this wide. */
export const OVERVIEW_TWO_COLUMN_MIN_CONTAINER_PX = 1000;

/** Minimum comfortable width per card in a two-column overview row. */
export const OVERVIEW_MIN_CHART_CARD_WIDTH_PX = 480;

export type PresentationCaptureLayout = {
  width: number;
  height: number;
};

export type PresentationExportSpec = PresentationCaptureLayout & {
  /** Fixed composite PNG canvas width (card frame). */
  canvasWidth: number;
  /** Fixed composite PNG canvas height (card frame). */
  canvasHeight: number;
};

export type PresentationCaptureLayoutOptions = {
  /** Category / time-step count — used to grow horizontal-bar export height. */
  categoryCount?: number;
  /**
   * When `overviewPng` or `chartsPng`, bar/trend/histogram exports use
   * point/category-count-aware widths. PDF and legacy callers omit this.
   */
  exportProfile?: ChartArtifactProfile;
};

function isStandalonePngExportProfile(
  profile: ChartArtifactProfile | undefined
): profile is Extract<ChartArtifactProfile, "overviewPng" | "chartsPng"> {
  return profile === "overviewPng" || profile === "chartsPng";
}

/** Category-count-aware canvas width for standalone PNG bar exports only. */
export function resolveStandalonePngBarCanvasWidth(
  kind: "bar" | "bar_horizontal",
  categoryCount: number
): number {
  const n = Math.max(1, categoryCount);
  if (kind === "bar") {
    if (n <= 3) return STANDALONE_PNG_VBAR_WIDTH_SPARSE_PX;
    if (n <= 6) return STANDALONE_PNG_VBAR_WIDTH_MODERATE_PX;
    if (n <= 10) return STANDALONE_PNG_VBAR_WIDTH_DENSE_PX;
    return PRESENTATION_EXPORT_WIDTH_PX;
  }
  if (n <= 3) return STANDALONE_PNG_HBAR_WIDTH_SPARSE_PX;
  if (n <= 6) return STANDALONE_PNG_HBAR_WIDTH_MODERATE_PX;
  if (n <= 10) return PRESENTATION_EXPORT_HORIZONTAL_WIDTH_PX;
  return PRESENTATION_EXPORT_HORIZONTAL_WIDE_WIDTH_PX;
}

/** Point-count-aware canvas width for standalone PNG line/area exports only. */
export function resolveStandalonePngTrendCanvasWidth(
  _kind: "line" | "area",
  pointCount: number
): number {
  const n = Math.max(1, pointCount);
  if (n <= 6) return STANDALONE_PNG_TREND_WIDTH_SPARSE_PX;
  if (n <= 12) return STANDALONE_PNG_TREND_WIDTH_MODERATE_PX;
  if (n <= 24) return STANDALONE_PNG_TREND_WIDTH_DENSE_PX;
  return PRESENTATION_EXPORT_COMPACT_WIDTH_PX;
}

/** Bucket-count-aware canvas width for standalone PNG histogram exports only. */
export function resolveStandalonePngHistogramCanvasWidth(
  bucketCount: number
): number {
  const n = Math.max(1, bucketCount);
  if (n <= 6) return STANDALONE_PNG_HISTOGRAM_WIDTH_SPARSE_PX;
  if (n <= 10) return STANDALONE_PNG_HISTOGRAM_WIDTH_MODERATE_PX;
  if (n <= 16) return STANDALONE_PNG_HISTOGRAM_WIDTH_DENSE_PX;
  return PRESENTATION_EXPORT_WIDTH_PX;
}

/** Canvas width by chart kind — avoids overly wide empty bar charts. */
export function resolvePresentationExportCanvasWidth(
  kind: ChartKind,
  options: PresentationCaptureLayoutOptions = {}
): number {
  const categoryCount = Math.max(0, options.categoryCount ?? 0);
  if (isStandalonePngExportProfile(options.exportProfile)) {
    if (kind === "bar" || kind === "bar_horizontal") {
      return resolveStandalonePngBarCanvasWidth(kind, categoryCount);
    }
    if (kind === "line" || kind === "area") {
      return resolveStandalonePngTrendCanvasWidth(kind, categoryCount);
    }
    if (kind === "histogram") {
      return resolveStandalonePngHistogramCanvasWidth(categoryCount);
    }
  }
  switch (kind) {
    case "bar_horizontal":
      return categoryCount > 10
        ? PRESENTATION_EXPORT_HORIZONTAL_WIDE_WIDTH_PX
        : PRESENTATION_EXPORT_HORIZONTAL_WIDTH_PX;
    case "line":
    case "area":
    case "scatter":
      return PRESENTATION_EXPORT_COMPACT_WIDTH_PX;
    default:
      return PRESENTATION_EXPORT_WIDTH_PX;
  }
}

/** Total PNG canvas height by chart kind. */
export function resolvePresentationExportCanvasHeight(
  kind: ChartKind,
  options: PresentationCaptureLayoutOptions = {}
): number {
  const categoryCount = Math.max(1, options.categoryCount ?? 4);
  switch (kind) {
    case "pie":
    case "donut":
      return resolveRadialExportCanvasHeight(
        categoryCount,
        resolveRadialExportPlotHeight(categoryCount)
      );
    case "line":
    case "area":
    case "scatter":
      return PRESENTATION_EXPORT_LINE_HEIGHT_PX;
    case "bar_horizontal":
      return PRESENTATION_EXPORT_HEIGHT_PX;
    default:
      return PRESENTATION_EXPORT_HEIGHT_PX;
  }
}

/** Plot band height for off-screen presentation capture (by chart kind). */
export function resolvePresentationExportPlotHeight(
  kind: ChartKind,
  options: PresentationCaptureLayoutOptions = {}
): number {
  const categoryCount = Math.max(0, options.categoryCount ?? 0);
  const canvasH = resolvePresentationExportCanvasHeight(kind, options);
  const balancedBase = Math.max(440, canvasH - PRESENTATION_EXPORT_CHROME_PX);

  switch (kind) {
    case "line":
    case "area":
      return balancedBase;
    case "bar_horizontal": {
      const extraRows = Math.max(0, categoryCount - 6);
      return Math.min(1040, balancedBase + extraRows * 36);
    }
    case "pie":
    case "donut":
      return resolveRadialExportPlotHeight(Math.max(1, categoryCount || 4));
    case "scatter":
      return balancedBase;
    default:
      return Math.max(420, balancedBase - 40);
  }
}

export function buildPresentationCaptureLayout(
  kind: ChartKind,
  options: PresentationCaptureLayoutOptions = {}
): PresentationCaptureLayout {
  const width = resolvePresentationExportCanvasWidth(kind, options);
  return {
    width,
    height: resolvePresentationExportPlotHeight(kind, options),
  };
}

/** Full export spec including fixed composite canvas dimensions. */
export function buildPresentationExportSpec(
  kind: ChartKind,
  options: PresentationCaptureLayoutOptions = {}
): PresentationExportSpec {
  const layout = buildPresentationCaptureLayout(kind, options);
  return {
    ...layout,
    canvasWidth: layout.width,
    canvasHeight: resolvePresentationExportCanvasHeight(kind, options),
  };
}

/** Plot height vs width — sanity check for presentation-ready aspect ratio. */
export function presentationExportAspectRatio(
  kind: ChartKind,
  options: PresentationCaptureLayoutOptions = {}
): number {
  const plotH = resolvePresentationExportPlotHeight(kind, options);
  const plotW = resolvePresentationExportCanvasWidth(kind, options);
  return plotH / plotW;
}

/** Inline styles for off-screen presentation capture (avoids on-screen reflow flash). */
export function presentationCaptureRootStyle(
  layout: PresentationCaptureLayout
): Record<string, string | number> {
  return {
    position: "fixed",
    left: "-12000px",
    top: 0,
    width: layout.width,
    minWidth: layout.width,
    maxWidth: layout.width,
    zIndex: -1,
    visibility: "visible",
    pointerEvents: "none",
  };
}

export function presentationCapturePlotStyle(
  layout: PresentationCaptureLayout
): Record<string, string | number> {
  return {
    height: layout.height,
    minHeight: layout.height,
    maxHeight: layout.height,
  };
}
