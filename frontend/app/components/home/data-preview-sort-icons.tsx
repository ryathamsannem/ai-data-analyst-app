"use client";

/** Lucide-compatible chevron strokes (12px). */

export type DataPreviewSortIconState = "none" | "asc" | "desc";

const svgProps = {
  xmlns: "http://www.w3.org/2000/svg",
  width: 12,
  height: 12,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2.25,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

type Props = { state: DataPreviewSortIconState };

export function DataPreviewSortIcon({ state }: Props) {
  if (state === "asc") {
    return (
      <svg {...svgProps}>
        <path d="m18 15-6-6-6 6" />
      </svg>
    );
  }
  if (state === "desc") {
    return (
      <svg {...svgProps}>
        <path d="m6 9 6 6 6-6" />
      </svg>
    );
  }
  return (
    <svg {...svgProps}>
      <path d="m7 15 5 5 5-5" />
      <path d="m7 9 5-5 5 5" />
    </svg>
  );
}
