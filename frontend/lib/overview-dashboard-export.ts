import type { ChartKind } from "@/app/chart-types";

/**
 * Chart kind actually rendered in an overview dashboard card (may differ from
 * `displayKind` when bar charts fall back to horizontal orientation).
 */
export function resolveOverviewEffectivePresentationKind(
  displayKind: ChartKind,
  renderBarAsHorizontal: boolean
): ChartKind {
  if (renderBarAsHorizontal) return "bar_horizontal";
  return displayKind;
}
