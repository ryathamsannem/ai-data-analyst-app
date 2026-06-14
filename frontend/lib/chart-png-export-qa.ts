/**
 * Export presentation quality gates — constants + lightweight checks for PNG QA.
 */

import {
  PNG_EXPORT_AXIS_TITLE_FONT_PX,
  PNG_EXPORT_CATEGORY_LABEL_FONT_PX,
  PNG_EXPORT_GRID_OPACITY_DARK,
  PNG_EXPORT_TICK_FONT_PX,
} from "@/lib/chart-png-export-svg-polish";

export const PNG_EXPORT_FOOTER_FONT_PX = 15;
export const PNG_EXPORT_FOOTER_OPACITY = 1;
export const PNG_EXPORT_PLOT_WIDTH_UTIL_TARGET = 0.88;
export const PNG_EXPORT_PLOT_WIDTH_UTIL_MIN = 0.85;

export type PngExportQualityCheck = {
  id: string;
  ok: boolean;
  message?: string;
};

export type PngExportQualityResult = {
  ok: boolean;
  checks: PngExportQualityCheck[];
};

/** Typography and polish constants meet executive export targets. */
export function validatePngExportPresentationConstants(): PngExportQualityResult {
  const checks: PngExportQualityCheck[] = [
    {
      id: "axisTickTypography",
      ok: PNG_EXPORT_TICK_FONT_PX >= 13 && PNG_EXPORT_TICK_FONT_PX <= 16,
      message: `tick font ${PNG_EXPORT_TICK_FONT_PX}px outside 13–16px band`,
    },
    {
      id: "categoryLabelTypography",
      ok:
        PNG_EXPORT_CATEGORY_LABEL_FONT_PX >= 15 &&
        PNG_EXPORT_CATEGORY_LABEL_FONT_PX <= 16,
      message: `category label font ${PNG_EXPORT_CATEGORY_LABEL_FONT_PX}px should be 15–16px`,
    },
    {
      id: "axisTitleTypography",
      ok:
        PNG_EXPORT_AXIS_TITLE_FONT_PX >= 14 &&
        PNG_EXPORT_AXIS_TITLE_FONT_PX <= 16,
      message: `axis title font ${PNG_EXPORT_AXIS_TITLE_FONT_PX}px outside 14–16px band`,
    },
    {
      id: "gridVisibilityDark",
      ok: PNG_EXPORT_GRID_OPACITY_DARK >= 0.26,
      message: `dark grid opacity ${PNG_EXPORT_GRID_OPACITY_DARK} too faint`,
    },
    {
      id: "footerTypography",
      ok: PNG_EXPORT_FOOTER_FONT_PX >= 14,
      message: `footer font ${PNG_EXPORT_FOOTER_FONT_PX}px below 14px minimum`,
    },
    {
      id: "plotUtilizationTarget",
      ok: PNG_EXPORT_PLOT_WIDTH_UTIL_TARGET >= PNG_EXPORT_PLOT_WIDTH_UTIL_MIN,
      message: "plot width utilization target below 85% minimum",
    },
  ];
  return { ok: checks.every((c) => c.ok), checks };
}

/** Plot width vs card inner width after composite scaling. */
export function measurePlotWidthUtilization(args: {
  plotWidthPx: number;
  cardInnerWidthPx: number;
}): number {
  if (args.cardInnerWidthPx <= 0) return 0;
  return args.plotWidthPx / args.cardInnerWidthPx;
}

export function validatePlotWidthUtilization(
  utilization: number
): PngExportQualityResult {
  const checks: PngExportQualityCheck[] = [
    {
      id: "plotCanvasUtilization",
      ok: utilization >= PNG_EXPORT_PLOT_WIDTH_UTIL_MIN,
      message: `plot uses ${(utilization * 100).toFixed(1)}% of card inner width (min ${PNG_EXPORT_PLOT_WIDTH_UTIL_MIN * 100}%)`,
    },
  ];
  return { ok: checks.every((c) => c.ok), checks };
}
