"use client";

import {
  resolveHBarLabelPlacementFromLayout,
  resolveHBarPlotValueEndPx,
  HBAR_LABEL_INSIDE_PAD_PX,
  HBAR_LABEL_OUTSIDE_PAD_PX,
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
}: HBarValueLabelListContentProps) {
  const value = Number(valueRaw ?? NaN);
  if (!Number.isFinite(value)) return null;

  const x = Number(xRaw ?? 0);
  const y = Number(yRaw ?? 0);
  const width = Number(widthRaw ?? 0);
  const height = Number(heightRaw ?? 0);
  if (!Number.isFinite(width) || width <= 0) return null;

  const text = formatter(value);
  const plotValueEndPx =
    resolveHBarPlotValueEndPx(viewBox) ?? x + width;

  const placement = resolveHBarLabelPlacementFromLayout({
    barWidthPx: width,
    barStartPx: x,
    plotValueEndPx,
    labelText: text,
    fontSizePx: fontSize,
  });
  if (placement === "hidden") return null;

  const cy = y + height / 2;
  if (placement === "insideRight") {
    return (
      <text
        x={x + width - HBAR_LABEL_INSIDE_PAD_PX}
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

  return (
    <text
      x={x + width + HBAR_LABEL_OUTSIDE_PAD_PX}
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
