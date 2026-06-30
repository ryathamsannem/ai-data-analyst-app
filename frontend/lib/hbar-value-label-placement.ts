/** Estimated text width for H-Bar label fit checks (px). */
export function estimateHBarLabelTextWidthPx(
  labelText: string,
  fontSizePx: number
): number {
  return Math.max(0, labelText.length) * fontSizePx * 0.58;
}

export type HBarLabelPlacement = "insideRight" | "outsideRight" | "hidden";

export type HBarLabelPlacementMode = "overview-live" | "detail-live" | "export";

export type ResolveHBarLabelPlacementArgs = {
  barWidthPx: number;
  barStartPx: number;
  /** Right edge of the value plot band in bar coordinates. */
  plotValueEndPx: number;
  labelText: string;
  fontSizePx: number;
  mode?: HBarLabelPlacementMode;
  /** detail-live / export — pixels reserved in margin.right for outside labels. */
  outsideLabelReservePx?: number;
};

const HBAR_LABEL_INSIDE_PAD_PX = 6;
const HBAR_LABEL_OUTSIDE_PAD_PX = 4;

export { HBAR_LABEL_INSIDE_PAD_PX, HBAR_LABEL_OUTSIDE_PAD_PX };

function effectiveHBarPlotValueEndPx(args: {
  barStartPx: number;
  barWidthPx: number;
  plotValueEndPx: number;
  mode: HBarLabelPlacementMode;
  outsideLabelReservePx: number;
}): number {
  const barEndPx = args.barStartPx + args.barWidthPx;
  const hasViewBoxPlotEnd =
    Number.isFinite(args.plotValueEndPx) && args.plotValueEndPx > barEndPx;
  const plotEnd = hasViewBoxPlotEnd ? args.plotValueEndPx : barEndPx;
  if (
    (args.mode === "export" || args.mode === "detail-live") &&
    args.outsideLabelReservePx > 0
  ) {
    return plotEnd + args.outsideLabelReservePx;
  }
  return plotEnd;
}

/** Resolve H-Bar label placement surface from chart context. */
export function resolveHBarLabelPlacementMode(args: {
  pngCapture?: boolean;
  detailLayout?: boolean;
}): HBarLabelPlacementMode {
  if (args.pngCapture) return "export";
  if (args.detailLayout) return "detail-live";
  return "overview-live";
}

/** Overview auto-dashboard inline H-Bar — safe outside labels on live cards. */
export function resolveOverviewInlineHBarPlacementMode(
  pngCapture: boolean
): HBarLabelPlacementMode {
  return pngCapture ? "export" : "detail-live";
}

/**
 * Right margin reserve for outside H-Bar labels (detail-live + export capture).
 * Uses the widest compact formatted value; does not change axis domain.
 */
export function computeHBarOutsideLabelReservePx(
  values: readonly number[],
  formatValue: (value: number) => string,
  fontSizePx: number
): number {
  const widths = values
    .filter((v) => Number.isFinite(v))
    .map((v) => estimateHBarLabelTextWidthPx(formatValue(v), fontSizePx));
  if (widths.length === 0) return 0;
  return Math.ceil(Math.max(...widths) + HBAR_LABEL_OUTSIDE_PAD_PX);
}

/** @deprecated Use computeHBarOutsideLabelReservePx */
export function computeHBarExportOutsideLabelReservePx(
  values: readonly number[],
  formatValue: (value: number) => string,
  fontSizePx: number
): number {
  return computeHBarOutsideLabelReservePx(values, formatValue, fontSizePx);
}

/**
 * Per-bar H-Bar label placement from rendered bar geometry.
 * Wide bars: insideRight; short bars with room: outsideRight; else hidden.
 */
export function resolveHBarLabelPlacementFromLayout(
  args: ResolveHBarLabelPlacementArgs
): HBarLabelPlacement {
  const {
    barWidthPx,
    barStartPx,
    plotValueEndPx,
    labelText,
    fontSizePx,
    mode = "overview-live",
    outsideLabelReservePx = 0,
  } = args;
  if (!Number.isFinite(barWidthPx) || barWidthPx <= 0 || !labelText.trim()) {
    return "hidden";
  }

  const labelWidthPx = estimateHBarLabelTextWidthPx(labelText, fontSizePx);

  if (barWidthPx >= labelWidthPx + HBAR_LABEL_INSIDE_PAD_PX) {
    return "insideRight";
  }

  const barEndPx = barStartPx + barWidthPx;
  const effectivePlotEndPx = effectiveHBarPlotValueEndPx({
    barStartPx,
    barWidthPx,
    plotValueEndPx,
    mode,
    outsideLabelReservePx,
  });
  const outsideSpacePx = effectivePlotEndPx - barEndPx;
  if (outsideSpacePx >= labelWidthPx + HBAR_LABEL_OUTSIDE_PAD_PX) {
    return "outsideRight";
  }

  return "hidden";
}

export function resolveHBarPlotValueEndPx(viewBox?: unknown): number | undefined {
  if (!viewBox || typeof viewBox !== "object") return undefined;
  const vb = viewBox as { x?: unknown; width?: unknown };
  const x = Number(vb.x);
  const width = Number(vb.width);
  if (Number.isFinite(x) && Number.isFinite(width)) {
    return x + width;
  }
  return undefined;
}
