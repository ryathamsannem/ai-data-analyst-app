import {
  createChartCaptureTimeline,
  pushChartCaptureStatus,
  type ChartCaptureDiagnostics,
  type ChartCaptureFailureReason,
  type ChartCaptureTimelineEntry,
} from "@/lib/chart-platform/chart-artifact";
import { waitForStableChartSvg } from "@/lib/chart-png-capture";
import type { ChartKind } from "@/app/chart-types";

export type ChartCaptureReadyState = {
  root: HTMLElement;
  diagnostics: ChartCaptureDiagnostics;
};

export class ChartCaptureReadinessError extends Error {
  reason: ChartCaptureFailureReason;
  diagnostics: ChartCaptureDiagnostics;

  constructor(
    reason: ChartCaptureFailureReason,
    diagnostics: ChartCaptureDiagnostics,
    message = "Chart is not ready to capture."
  ) {
    super(message);
    this.name = "ChartCaptureReadinessError";
    this.reason = reason;
    this.diagnostics = diagnostics;
  }
}

function readRootDiagnostics(
  root: HTMLElement | null,
  kind: ChartKind,
  timeline: ChartCaptureTimelineEntry[],
  retries: number,
  failureReason?: ChartCaptureFailureReason
): ChartCaptureDiagnostics {
  const rect = root?.getBoundingClientRect();
  return {
    statusTimeline: [...timeline],
    resolvedKind: kind,
    svgCount: root?.querySelectorAll("svg").length ?? 0,
    measuredWidthPx: rect ? Math.round(rect.width) : 0,
    measuredHeightPx: rect ? Math.round(rect.height) : 0,
    retries,
    failureReason,
  };
}

export async function waitForBasicChartCaptureReady(args: {
  getRoot: () => HTMLElement | null;
  kind: ChartKind;
  requestId: string;
  isCurrent?: (requestId: string) => boolean;
  maxMs?: number;
}): Promise<ChartCaptureReadyState> {
  const timeline = createChartCaptureTimeline();
  const maxMs = args.maxMs ?? 2600;
  const deadline = Date.now() + maxMs;
  let retries = 0;

  pushChartCaptureStatus(timeline, "mounting");
  while (Date.now() < deadline) {
    const root = args.getRoot();
    if (!root) {
      retries += 1;
      await new Promise<void>((resolve) => window.setTimeout(resolve, 48));
      continue;
    }

    if (args.isCurrent && !args.isCurrent(args.requestId)) {
      const diagnostics = readRootDiagnostics(
        root,
        args.kind,
        timeline,
        retries,
        "cancelled"
      );
      pushChartCaptureStatus(timeline, "cancelled", "request superseded");
      throw new ChartCaptureReadinessError(
        "cancelled",
        diagnostics,
        "Chart capture was cancelled."
      );
    }

    pushChartCaptureStatus(timeline, "measuring");
    const rect = root.getBoundingClientRect();
    const hasSize =
      Math.max(rect.width, root.clientWidth, root.scrollWidth) > 2 &&
      Math.max(rect.height, root.clientHeight, root.scrollHeight) > 2;
    if (!hasSize) {
      retries += 1;
      await new Promise<void>((resolve) => window.setTimeout(resolve, 48));
      continue;
    }

    pushChartCaptureStatus(timeline, "rendering");
    if (!root.querySelector("svg")) {
      retries += 1;
      await new Promise<void>((resolve) => window.setTimeout(resolve, 48));
      continue;
    }

    pushChartCaptureStatus(timeline, "settling");
    await waitForStableChartSvg(root);
    pushChartCaptureStatus(timeline, "ready");
    return {
      root,
      diagnostics: readRootDiagnostics(root, args.kind, timeline, retries),
    };
  }

  const root = args.getRoot();
  const rect = root?.getBoundingClientRect();
  const reason: ChartCaptureFailureReason = !root
    ? "host_not_mounted"
    : Math.max(rect?.width ?? 0, root.clientWidth, root.scrollWidth) <= 2 ||
        Math.max(rect?.height ?? 0, root.clientHeight, root.scrollHeight) <= 2
      ? "zero_dimensions"
      : !root.querySelector("svg")
        ? "missing_svg"
        : "timeout";
  const diagnostics = readRootDiagnostics(root, args.kind, timeline, retries, reason);
  pushChartCaptureStatus(timeline, "failed", reason);
  throw new ChartCaptureReadinessError(reason, diagnostics);
}
