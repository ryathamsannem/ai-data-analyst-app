import type { ChartKind } from "@/app/chart-types";

/** Default presentation PNG canvas width (line / area / scatter). */
export const PRESENTATION_EXPORT_WIDTH_PX = 1400;

/** Balanced width for line/area exports. */
export const PRESENTATION_EXPORT_COMPACT_WIDTH_PX = 1200;

/** Tighter width for horizontal-bar exports (reduces empty right-side space). */
export const PRESENTATION_EXPORT_HORIZONTAL_WIDTH_PX = 1100;

/** Wider horizontal-bar canvas when many categories need vertical room. */
export const PRESENTATION_EXPORT_HORIZONTAL_WIDE_WIDTH_PX = 1300;

/** Target total PNG height for line/area exports. */
export const PRESENTATION_EXPORT_HEIGHT_PX = 900;

/** Shorter canvas for line/area when a 4:3 card reads better. */
export const PRESENTATION_EXPORT_LINE_HEIGHT_PX = 800;

/** Vertical chrome reserved for title, chips, warning, card padding, and composite padding. */
export const PRESENTATION_EXPORT_CHROME_PX = 200;

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
};

/** Canvas width by chart kind — avoids overly wide empty bar charts. */
export function resolvePresentationExportCanvasWidth(
  kind: ChartKind,
  options: PresentationCaptureLayoutOptions = {}
): number {
  const categoryCount = Math.max(0, options.categoryCount ?? 0);
  switch (kind) {
    case "bar_horizontal":
      return categoryCount > 10
        ? PRESENTATION_EXPORT_HORIZONTAL_WIDE_WIDTH_PX
        : PRESENTATION_EXPORT_HORIZONTAL_WIDTH_PX;
    case "line":
    case "area":
      return PRESENTATION_EXPORT_COMPACT_WIDTH_PX;
    default:
      return PRESENTATION_EXPORT_WIDTH_PX;
  }
}

/** Total PNG canvas height by chart kind. */
export function resolvePresentationExportCanvasHeight(kind: ChartKind): number {
  switch (kind) {
    case "line":
    case "area":
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
  const canvasH = resolvePresentationExportCanvasHeight(kind);
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
      return Math.max(400, balancedBase - 80);
    case "histogram":
      return Math.max(420, balancedBase - 60);
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
    canvasHeight: resolvePresentationExportCanvasHeight(kind),
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
