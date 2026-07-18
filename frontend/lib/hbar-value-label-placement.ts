/** Estimated text width for H-Bar label fit checks (px). */
export function estimateHBarLabelTextWidthPx(
  labelText: string,
  fontSizePx: number
): number {
  return Math.max(0, labelText.length) * fontSizePx * 0.58;
}

export type HBarLabelPlacement =
  | "insideRight"
  | "outsideRight"
  | "insideLeft"
  | "outsideLeft"
  | "hidden";

export type HBarLabelPlacementMode = "overview-live" | "detail-live" | "export";

export type ResolveHBarLabelPlacementArgs = {
  barWidthPx: number;
  barStartPx: number;
  /** Right edge of the value plot band in bar coordinates. */
  plotValueEndPx: number;
  /** Left edge of the value plot band in bar coordinates. */
  plotValueStartPx?: number;
  barValue?: number;
  labelText: string;
  fontSizePx: number;
  mode?: HBarLabelPlacementMode;
  /** detail-live / export — pixels reserved in margin.right for outside labels. */
  outsideLabelReservePx?: number;
  /** detail-live / export — pixels reserved in margin.left for negative outside labels. */
  outsideLabelReserveLeftPx?: number;
};

const HBAR_LABEL_INSIDE_PAD_PX = 6;
const HBAR_LABEL_OUTSIDE_PAD_PX = 4;

export { HBAR_LABEL_INSIDE_PAD_PX, HBAR_LABEL_OUTSIDE_PAD_PX };

export type HBarSignedOutsideLabelReserves = {
  left: number;
  right: number;
};

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

function effectiveHBarPlotValueStartPx(args: {
  plotValueStartPx: number;
  mode: HBarLabelPlacementMode;
  outsideLabelReserveLeftPx: number;
}): number {
  if (
    (args.mode === "export" || args.mode === "detail-live") &&
    args.outsideLabelReserveLeftPx > 0
  ) {
    return args.plotValueStartPx - args.outsideLabelReserveLeftPx;
  }
  return args.plotValueStartPx;
}

function normalizeHBarLabelGeometry(args: {
  barStartPx: number;
  barWidthPx: number;
}): { startPx: number; widthPx: number } {
  const rawWidth = args.barWidthPx;
  if (!Number.isFinite(rawWidth) || rawWidth === 0) {
    return { startPx: args.barStartPx, widthPx: 0 };
  }
  if (rawWidth < 0) {
    return {
      startPx: args.barStartPx + rawWidth,
      widthPx: Math.abs(rawWidth),
    };
  }
  return { startPx: args.barStartPx, widthPx: rawWidth };
}

function resolvePositiveHBarLabelPlacement(args: {
  barStartPx: number;
  barWidthPx: number;
  plotValueEndPx: number;
  labelText: string;
  fontSizePx: number;
  mode: HBarLabelPlacementMode;
  outsideLabelReservePx: number;
}): HBarLabelPlacement {
  const labelWidthPx = estimateHBarLabelTextWidthPx(
    args.labelText,
    args.fontSizePx
  );

  if (args.barWidthPx >= labelWidthPx + HBAR_LABEL_INSIDE_PAD_PX) {
    return "insideRight";
  }

  const barEndPx = args.barStartPx + args.barWidthPx;
  const effectivePlotEndPx = effectiveHBarPlotValueEndPx({
    barStartPx: args.barStartPx,
    barWidthPx: args.barWidthPx,
    plotValueEndPx: args.plotValueEndPx,
    mode: args.mode,
    outsideLabelReservePx: args.outsideLabelReservePx,
  });
  const outsideSpacePx = effectivePlotEndPx - barEndPx;
  if (outsideSpacePx >= labelWidthPx + HBAR_LABEL_OUTSIDE_PAD_PX) {
    return "outsideRight";
  }

  return "hidden";
}

function resolveNegativeHBarLabelPlacement(args: {
  barStartPx: number;
  barWidthPx: number;
  plotValueStartPx: number;
  labelText: string;
  fontSizePx: number;
  mode: HBarLabelPlacementMode;
  outsideLabelReserveLeftPx: number;
}): HBarLabelPlacement {
  const labelWidthPx = estimateHBarLabelTextWidthPx(
    args.labelText,
    args.fontSizePx
  );

  if (args.barWidthPx >= labelWidthPx + HBAR_LABEL_INSIDE_PAD_PX) {
    return "insideLeft";
  }

  const effectivePlotStartPx = effectiveHBarPlotValueStartPx({
    plotValueStartPx: args.plotValueStartPx,
    mode: args.mode,
    outsideLabelReserveLeftPx: args.outsideLabelReserveLeftPx,
  });
  const outsideSpacePx = args.barStartPx - effectivePlotStartPx;
  if (outsideSpacePx >= labelWidthPx + HBAR_LABEL_OUTSIDE_PAD_PX) {
    return "outsideLeft";
  }

  return "hidden";
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

/** Left/right outside-label reserves for signed H-Bar charts. */
export function computeHBarSignedOutsideLabelReservesPx(
  values: readonly number[],
  formatValue: (value: number) => string,
  fontSizePx: number
): HBarSignedOutsideLabelReserves {
  const finite = values.filter((v) => Number.isFinite(v));
  if (finite.length === 0) return { left: 0, right: 0 };
  const reserve = computeHBarOutsideLabelReservePx(
    values,
    formatValue,
    fontSizePx
  );
  const hasNegative = finite.some((v) => v < 0);
  const hasPositive = finite.some((v) => v > 0);
  return {
    left: hasNegative ? reserve : 0,
    right: hasPositive ? reserve : 0,
  };
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
 * Positive bars: insideRight / outsideRight. Negative bars: insideLeft / outsideLeft.
 */
export function resolveHBarLabelPlacementFromLayout(
  args: ResolveHBarLabelPlacementArgs
): HBarLabelPlacement {
  const {
    barWidthPx: rawBarWidthPx,
    barStartPx: rawBarStartPx,
    plotValueEndPx,
    plotValueStartPx,
    barValue,
    labelText,
    fontSizePx,
    mode = "overview-live",
    outsideLabelReservePx = 0,
    outsideLabelReserveLeftPx = 0,
  } = args;
  if (!labelText.trim()) return "hidden";

  const { startPx, widthPx } = normalizeHBarLabelGeometry({
    barStartPx: rawBarStartPx,
    barWidthPx: rawBarWidthPx,
  });
  if (!Number.isFinite(widthPx) || widthPx <= 0) return "hidden";

  const isNegative =
    Number.isFinite(barValue) && (barValue as number) < 0;

  if (isNegative) {
    const plotStart =
      Number.isFinite(plotValueStartPx) && plotValueStartPx != null
        ? plotValueStartPx
        : startPx;
    return resolveNegativeHBarLabelPlacement({
      barStartPx: startPx,
      barWidthPx: widthPx,
      plotValueStartPx: plotStart,
      labelText,
      fontSizePx,
      mode,
      outsideLabelReserveLeftPx,
    });
  }

  return resolvePositiveHBarLabelPlacement({
    barStartPx: startPx,
    barWidthPx: widthPx,
    plotValueEndPx,
    labelText,
    fontSizePx,
    mode,
    outsideLabelReservePx,
  });
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

export function resolveHBarPlotValueStartPx(viewBox?: unknown): number | undefined {
  if (!viewBox || typeof viewBox !== "object") return undefined;
  const x = Number((viewBox as { x?: unknown }).x);
  if (Number.isFinite(x)) return x;
  return undefined;
}
