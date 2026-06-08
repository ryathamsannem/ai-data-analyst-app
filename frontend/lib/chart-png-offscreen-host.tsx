"use client";

import { createPortal } from "react-dom";
import type { PresentationCaptureLayout } from "@/lib/chart-png-export-layout";
import { presentationCaptureRootStyle } from "@/lib/chart-png-export-layout";

/** Marks offscreen export roots — never attached to visible chart cards. */
export const CHART_PNG_OFFSCREEN_ATTR = "data-chart-png-offscreen";

export type ChartPngOffscreenHostProps = {
  layout: PresentationCaptureLayout;
  exportRef: React.RefObject<HTMLDivElement | null>;
  rootClassName: string;
  children: React.ReactNode;
};

/**
 * Renders export-only chart chrome in a body portal so PNG capture never
 * mutates the on-screen chart layout (no flicker / disappearance).
 */
export function ChartPngOffscreenHost({
  layout,
  exportRef,
  rootClassName,
  children,
}: ChartPngOffscreenHostProps) {
  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={exportRef}
      className={rootClassName}
      style={presentationCaptureRootStyle(layout)}
      aria-hidden="true"
      data-chart-png-offscreen="1"
    >
      {children}
    </div>,
    document.body
  );
}
