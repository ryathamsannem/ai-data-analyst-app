"use client";

import {
  resolveHBarLabelPlacementFromLayout,
  resolveHBarPlotValueEndPx,
  resolveHBarPlotValueStartPx,
  HBAR_LABEL_INSIDE_PAD_PX,
  HBAR_LABEL_OUTSIDE_PAD_PX,
  type HBarLabelPlacementMode,
} from "@/lib/hbar-value-label-placement";

type HBarValueLabelListContentProps = {
  x?: number | string;
  y?: number | string;
  width?: number | string;
  height?: number | string;
  value?: unknown;
  viewBox?: unknown;
  formatter: (value: number) => string;
  fontSize: number;
  inlayFill: string;
  outsideFill: string;
  placementMode?: HBarLabelPlacementMode;
  outsideLabelReservePx?: number;
  outsideLabelReserveLeftPx?: number;
};

export function HBarValueLabelListContent({
  x: xRaw,
  y: yRaw,
  width: widthRaw,
  height: heightRaw,
  value: valueRaw,
  viewBox,
  formatter,
  fontSize,
  inlayFill,
  outsideFill,
  placementMode = "overview-live",
  outsideLabelReservePx = 0,
  outsideLabelReserveLeftPx = 0,
}: HBarValueLabelListContentProps) {
  const value = Number(valueRaw ?? NaN);
  if (!Number.isFinite(value)) return null;

  const x = Number(xRaw ?? 0);
  const y = Number(yRaw ?? 0);
  const width = Number(widthRaw ?? 0);
  const height = Number(heightRaw ?? 0);
  if (!Number.isFinite(width) || width === 0) return null;

  const text = formatter(value);
  const plotValueEndPx =
    resolveHBarPlotValueEndPx(viewBox) ?? x + Math.abs(width);
  const plotValueStartPx = resolveHBarPlotValueStartPx(viewBox);

  const placement = resolveHBarLabelPlacementFromLayout({
    barWidthPx: width,
    barStartPx: x,
    plotValueEndPx,
    plotValueStartPx,
    barValue: value,
    labelText: text,
    fontSizePx: fontSize,
    mode: placementMode,
    outsideLabelReservePx,
    outsideLabelReserveLeftPx,
  });
  if (placement === "hidden") return null;

  const cy = y + height / 2;
  const absWidth = Math.abs(width);
  const barStartPx = width < 0 ? x + width : x;

  if (placement === "insideRight") {
    return (
      <text
        x={barStartPx + absWidth - HBAR_LABEL_INSIDE_PAD_PX}
        y={cy}
        textAnchor="end"
        dominantBaseline="middle"
        fill={inlayFill}
        fontSize={fontSize}
        fontWeight={600}
        className="chart-bar-inlay-label"
      >
        {text}
      </text>
    );
  }

  if (placement === "insideLeft") {
    return (
      <text
        x={barStartPx + HBAR_LABEL_INSIDE_PAD_PX}
        y={cy}
        textAnchor="start"
        dominantBaseline="middle"
        fill={inlayFill}
        fontSize={fontSize}
        fontWeight={600}
        className="chart-bar-inlay-label"
      >
        {text}
      </text>
    );
  }

  if (placement === "outsideLeft") {
    return (
      <text
        x={barStartPx - HBAR_LABEL_OUTSIDE_PAD_PX}
        y={cy}
        textAnchor="end"
        dominantBaseline="middle"
        fill={outsideFill}
        fontSize={fontSize}
        fontWeight={600}
      >
        {text}
      </text>
    );
  }

  return (
    <text
      x={barStartPx + absWidth + HBAR_LABEL_OUTSIDE_PAD_PX}
      y={cy}
      textAnchor="start"
      dominantBaseline="middle"
      fill={outsideFill}
      fontSize={fontSize}
      fontWeight={600}
    >
      {text}
    </text>
  );
}
