import type { ChartKind } from "@/app/chart-types";
import type { PresentationExportSpec } from "@/lib/chart-png-export-layout";
import type { OverviewDashboardExportParityResult } from "@/lib/overview-dashboard-export";
import type { ChartPresentationContract } from "@/lib/chart-platform/chart-presentation-contract";

export type ChartArtifactFormat = "png";

export type ChartArtifactProfile = "overviewPng" | "chartsPng";

export type ChartCaptureSourceSurface = "overview" | "charts";

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
  measuredWidthPx: number;
  measuredHeightPx: number;
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
