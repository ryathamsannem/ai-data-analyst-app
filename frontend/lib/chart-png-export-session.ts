import type { ChartKind } from "@/app/chart-types";
import {
  buildPresentationExportSpec,
  type PresentationExportSpec,
} from "@/lib/chart-png-export-layout";
import {
  type OverviewDashboardExportParityInput,
} from "@/lib/overview-dashboard-export";
import { waitForStableChartSvg } from "@/lib/chart-png-capture";
import { buildChartPresentationContract } from "@/lib/chart-platform/build-chart-contract";
import {
  captureChartPngArtifact,
  createChartPngCaptureRequest,
  downloadChartArtifact,
} from "@/lib/chart-platform/chart-capture-controller";
import type { ChartPngCaptureRequest } from "@/lib/chart-platform/chart-artifact";

export type RunChartPngExportArgs = {
  /** Lazy root lookup — portal may mount after setState. */
  getExportRoot: () => HTMLElement | null;
  kind: ChartKind;
  categoryCount: number;
  filename: string;
  scale?: number;
  /** Optional dataset label appended to export footer. */
  datasetName?: string | null;
  /** Optional dashboard parity expectation (Overview auto-dashboard exports). */
  parity?: Omit<
    OverviewDashboardExportParityInput,
    "exportKind" | "exportRoot"
  >;
  /** Unified capture request. When omitted, a compatibility request is created. */
  request?: ChartPngCaptureRequest;
};

export type RunChartPngExportResult = {
  spec: PresentationExportSpec;
  parity?: Awaited<ReturnType<typeof captureChartPngArtifact>>["parity"];
};

function isBarFamilyKind(kind: ChartKind | null | undefined): kind is "bar" | "bar_horizontal" {
  return kind === "bar" || kind === "bar_horizontal";
}

export function resolveChartsPngExportKind(args: {
  liveKind: ChartKind;
  snapshotSource?: "ai" | "auto_dashboard" | null;
  /** Pinned session kind for auto-dashboard charts (canonical resolver output). */
  snapshotChartKind?: ChartKind | null;
}): ChartKind {
  const { liveKind, snapshotSource, snapshotChartKind } = args;
  if (
    snapshotSource === "auto_dashboard" &&
    isBarFamilyKind(liveKind) &&
    snapshotChartKind &&
    isBarFamilyKind(snapshotChartKind)
  ) {
    return snapshotChartKind;
  }
  return liveKind;
}

/** Wait for offscreen portal chart to mount and settle before capture. */
export async function waitForOffscreenChartReady(
  getExportRoot: () => HTMLElement | null,
  maxMs = 2400
): Promise<HTMLElement> {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    const exportRoot = getExportRoot();
    if (exportRoot?.querySelector("svg")) {
      await waitForStableChartSvg(exportRoot);
      return exportRoot;
    }
    await new Promise<void>((resolve) => window.setTimeout(resolve, 48));
  }
  throw new Error("Chart is not available to export.");
}

/** Capture an offscreen export root into a downloadable PNG data URL. */
export async function runChartPngExport({
  getExportRoot,
  kind,
  categoryCount,
  filename,
  scale = 2,
  datasetName,
  parity,
  request: providedRequest,
}: RunChartPngExportArgs): Promise<RunChartPngExportResult> {
  const request =
    providedRequest ??
    createChartPngCaptureRequest({
      contract: buildChartPresentationContract({
        chartId: `legacy-${filename}`,
        source: "manual",
        apiChartType: kind,
        resolvedKind: kind,
        title: filename,
        rows: [],
      }),
      profile: "chartsPng",
      sourceSurface: "charts",
      kind,
      categoryCount,
      filename,
      datasetName,
      scale,
      spec: buildPresentationExportSpec(kind, {
        categoryCount,
        exportProfile: "chartsPng",
      }),
    });
  const artifact = await captureChartPngArtifact({
    request,
    getExportRoot,
    parity,
  });
  downloadChartArtifact(artifact, filename);
  return { spec: request.spec, parity: artifact.parity };
}
