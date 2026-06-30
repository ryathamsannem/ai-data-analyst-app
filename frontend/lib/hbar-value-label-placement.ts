/** Estimated text width for H-Bar label fit checks (px). */
export function estimateHBarLabelTextWidthPx(
  labelText: string,
  fontSizePx: number
): number {
  return Math.max(0, labelText.length) * fontSizePx * 0.58;
}

export type HBarLabelPlacement = "insideRight" | "outsideRight" | "hidden";

export type ResolveHBarLabelPlacementArgs = {
  barWidthPx: number;
  barStartPx: number;
  /** Right edge of the value plot band in bar coordinates. */
  plotValueEndPx: number;
  labelText: string;
  fontSizePx: number;
};

const HBAR_LABEL_INSIDE_PAD_PX = 6;
const HBAR_LABEL_OUTSIDE_PAD_PX = 4;

export { HBAR_LABEL_INSIDE_PAD_PX, HBAR_LABEL_OUTSIDE_PAD_PX };

/**
 * Per-bar H-Bar label placement from rendered bar geometry.
 * Wide bars: insideRight; short bars with room: outsideRight; else hidden.
 */
export function resolveHBarLabelPlacementFromLayout(
  args: ResolveHBarLabelPlacementArgs
): HBarLabelPlacement {
  const { barWidthPx, barStartPx, plotValueEndPx, labelText, fontSizePx } = args;
  if (!Number.isFinite(barWidthPx) || barWidthPx <= 0 || !labelText.trim()) {
    return "hidden";
  }

  const labelWidthPx = estimateHBarLabelTextWidthPx(labelText, fontSizePx);

  if (barWidthPx >= labelWidthPx + HBAR_LABEL_INSIDE_PAD_PX) {
    return "insideRight";
  }

  const barEndPx = barStartPx + barWidthPx;
  const outsideSpacePx = plotValueEndPx - barEndPx;
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
