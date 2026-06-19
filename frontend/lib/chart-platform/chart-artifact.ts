import type { ChartKind } from "@/app/chart-types";
import type { PresentationExportSpec } from "@/lib/chart-png-export-layout";
import type { OverviewDashboardExportParityResult } from "@/lib/overview-dashboard-export";
import type { ChartPresentationContract } from "@/lib/chart-platform/chart-presentation-contract";
import type { ChartPresentationProfile } from "@/lib/chart-platform/chart-presentation-profile";

export type ChartArtifactFormat = "png";

export type ChartArtifactProfile = "overviewPng" | "chartsPng" | "pdfChart";

export type ChartCaptureSourceSurface = "overview" | "charts" | "pdf";

export type ChartCaptureStatus =
  | "idle"
  | "mounting"
  | "measuring"
  | "rendering"
  | "settling"
  | "ready"
  | "capturing"
  | "complete"
  | "failed"
  | "cancelled";

export type ChartCaptureFailureReason =
  | "missing_contract"
  | "not_renderable"
  | "host_not_mounted"
  | "zero_dimensions"
  | "missing_svg"
  | "zero_svg_dimensions"
  | "missing_marks"
  | "unstable_layout"
  | "timeout"
  | "capture_failed"
  | "cancelled";

export type ChartCaptureTimelineEntry = {
  status: ChartCaptureStatus;
  at: number;
  detail?: string;
};

export type ChartCaptureDiagnostics = {
  statusTimeline: ChartCaptureTimelineEntry[];
  resolvedKind: ChartKind;
  svgCount: number;
  markCount: number;
  measuredWidthPx: number;
  measuredHeightPx: number;
  rootWidthPx: number;
  rootHeightPx: number;
  svgWidthPx: number;
  svgHeightPx: number;
  responsiveContainerWidthPx: number;
  responsiveContainerHeightPx: number;
  layoutSampleCount: number;
  retries: number;
  failureReason?: ChartCaptureFailureReason;
};

export type ChartPngCaptureRequest = {
  requestId: string;
  contract: ChartPresentationContract;
  profile: ChartArtifactProfile;
  sourceSurface: ChartCaptureSourceSurface;
  kind: ChartKind;
  categoryCount: number;
  filename: string;
  datasetName?: string | null;
  scale: number;
  spec: PresentationExportSpec;
  layout: Pick<PresentationExportSpec, "width" | "height">;
  presentationProfile: ChartPresentationProfile;
};

export type ChartArtifact = {
  requestId: string;
  chartId: string;
  profile: ChartArtifactProfile;
  format: ChartArtifactFormat;
  dataUrl: string;
  widthPx: number;
  heightPx: number;
  contractVersion: number;
  presentationProfile?: ChartPresentationProfile;
  capturedAt: number;
  diagnostics: ChartCaptureDiagnostics;
  parity?: OverviewDashboardExportParityResult;
};

export function createChartCaptureTimeline(): ChartCaptureTimelineEntry[] {
  return [{ status: "idle", at: Date.now() }];
}

export function pushChartCaptureStatus(
  timeline: ChartCaptureTimelineEntry[],
  status: ChartCaptureStatus,
  detail?: string
): void {
  timeline.push({ status, at: Date.now(), detail });
}

export function createChartCaptureRequestId(prefix = "chart-capture"): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}
