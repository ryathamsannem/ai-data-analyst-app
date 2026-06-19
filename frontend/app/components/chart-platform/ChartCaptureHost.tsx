"use client";

import { createPortal } from "react-dom";
import type { ReactNode, RefObject } from "react";
import { presentationCaptureRootStyle } from "@/lib/chart-png-export-layout";
import type { ChartPngCaptureRequest } from "@/lib/chart-platform/chart-artifact";

export const CHART_CAPTURE_HOST_ATTR = "data-chart-capture-host";

export type ChartCaptureHostProps = {
  request: ChartPngCaptureRequest;
  exportRef: RefObject<HTMLDivElement | null>;
  rootClassName: string;
  children: ReactNode;
};

/** Unified offscreen host for PNG capture requests. */
export function ChartCaptureHost({
  request,
  exportRef,
  rootClassName,
  children,
}: ChartCaptureHostProps) {
  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={exportRef}
      className={rootClassName}
      style={presentationCaptureRootStyle(request.layout)}
      aria-hidden="true"
      data-chart-png-offscreen="1"
      data-chart-capture-host="1"
      data-chart-capture-request-id={request.requestId}
      data-chart-capture-profile={request.profile}
      data-chart-id={request.contract.identity.chartId}
    >
      {children}
    </div>,
    document.body
  );
}
