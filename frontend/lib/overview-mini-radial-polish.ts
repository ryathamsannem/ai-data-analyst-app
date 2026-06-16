import type { RadialChartRadii } from "@/lib/radial-export-layout";

/** ~12% larger ring — keeps cx/cy and card shell unchanged. */
export const OVERVIEW_MINI_RADIAL_SIZE_SCALE = 1.12;

export const OVERVIEW_MINI_RADIAL_SLICE_STROKE = "rgba(255, 255, 255, 0.48)";
export const OVERVIEW_MINI_RADIAL_SLICE_STROKE_WIDTH = 1;
export const OVERVIEW_MINI_RADIAL_LEGEND_PADDING_TOP_PX = 4;

export function scaleOverviewMiniRadialRadii(
  radii: RadialChartRadii
): RadialChartRadii {
  const scale = OVERVIEW_MINI_RADIAL_SIZE_SCALE;
  return {
    cy: radii.cy,
    innerRadius:
      radii.innerRadius > 0 ? Math.round(radii.innerRadius * scale) : 0,
    outerRadius: Math.round(radii.outerRadius * scale),
  };
}

/** Pull legend slightly closer without changing footer or export composition. */
export function tightenOverviewMiniRadialMargins(margins: {
  top: number;
  left: number;
  right: number;
  bottom: number;
}): { top: number; left: number; right: number; bottom: number } {
  return {
    ...margins,
    bottom: Math.max(8, margins.bottom - 5),
  };
}
