"use client";

import {
  resolveAreaPointLabelPlacement,
  resolveLinePointLabelPlacement,
  resolveLinePointLabelY,
  type LineValueLabelViewBox,
  type TrendValueLabelChartKind,
} from "@/lib/line-value-labels";

type LineValueLabelListContentProps = {
  x?: number | string;
  y?: number | string;
  value?: unknown;
  index?: number;
  labelIndices: Set<number>;
  lineValues: readonly number[];
  viewBox?: LineValueLabelViewBox;
  chartKind?: TrendValueLabelChartKind;
  formatter: (value: number) => string;
  fontSize: number;
  fill: string;
  offsetPx?: number;
};

export function LineValueLabelListContent({
  x: xRaw,
  y: yRaw,
  value: valueRaw,
  index,
  labelIndices,
  lineValues,
  viewBox,
  chartKind = "line",
  formatter,
  fontSize,
  fill,
  offsetPx,
}: LineValueLabelListContentProps) {
  if (index == null || !labelIndices.has(index)) return null;

  const value = Number(valueRaw ?? NaN);
  if (!Number.isFinite(value)) return null;

  const x = Number(xRaw ?? NaN);
  const y = Number(yRaw ?? NaN);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

  const placement =
    chartKind === "area"
      ? resolveAreaPointLabelPlacement({
          index,
          y,
          value,
          values: lineValues,
          viewBox,
        })
      : resolveLinePointLabelPlacement({
          index,
          y,
          value,
          values: lineValues,
          viewBox,
        });
  const labelY = resolveLinePointLabelY(y, placement, offsetPx);

  return (
    <text
      x={x}
      y={labelY}
      textAnchor="middle"
      dominantBaseline={placement === "below" ? "hanging" : "auto"}
      fill={fill}
      fontSize={fontSize}
      fontWeight={600}
      className="chart-line-value-label"
    >
      {formatter(value)}
    </text>
  );
}
