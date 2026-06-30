import type { RadialChartRadii } from "@/lib/radial-export-layout";

/** Modest live boost — ~70% plot-band diameter on 300px cards (Charts/AI parity). */
export const OVERVIEW_MINI_RADIAL_SIZE_SCALE = 1.24;

export const OVERVIEW_MINI_RADIAL_SLICE_STROKE = "rgba(255, 255, 255, 0.72)";
export const OVERVIEW_MINI_RADIAL_SLICE_STROKE_WIDTH = 1.25;
export const OVERVIEW_MINI_RADIAL_LEGEND_PADDING_TOP_PX = 2;

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
    top: Math.max(4, margins.top - 2),
    bottom: Math.max(6, margins.bottom - 10),
  };
}
