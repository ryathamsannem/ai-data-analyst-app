import type { ChartKind } from "@/app/chart-types";
import {
  buildPresentationExportSpec,
  type PresentationExportSpec,
} from "@/lib/chart-png-export-layout";
import { validatePngExportPresentationConstants } from "@/lib/chart-png-export-qa";
import {
  buildPngExportFooterText,
  captureElementToPng,
} from "@/lib/chart-png-capture";
import {
  type OverviewDashboardExportParityInput,
  validateOverviewDashboardExportParity,
} from "@/lib/overview-dashboard-export";
import {
  createChartCaptureRequestId,
  pushChartCaptureStatus,
  type ChartArtifact,
  type ChartArtifactProfile,
  type ChartCaptureSourceSurface,
  type ChartPngCaptureRequest,
} from "@/lib/chart-platform/chart-artifact";
import type { ChartPresentationContract } from "@/lib/chart-platform/chart-presentation-contract";
import {
  ChartCaptureReadinessError,
  waitForBasicChartCaptureReady,
} from "@/lib/chart-platform/chart-capture-readiness";
import {
  buildChartPresentationProfile,
  logChartPresentationProfileDiagnostics,
} from "@/lib/chart-platform/chart-presentation-profile";

export type CreateChartPngCaptureRequestArgs = {
  contract: ChartPresentationContract;
  profile: ChartArtifactProfile;
  sourceSurface: ChartCaptureSourceSurface;
  kind: ChartKind;
  categoryCount: number;
  filename: string;
  datasetName?: string | null;
  scale?: number;
  spec?: PresentationExportSpec;
};

export function createChartPngCaptureRequest({
  contract,
  profile,
  sourceSurface,
  kind,
  categoryCount,
  filename,
  datasetName,
  scale = 2,
  spec,
}: CreateChartPngCaptureRequestArgs): ChartPngCaptureRequest {
  const exportSpec = spec ?? buildPresentationExportSpec(kind, { categoryCount });
  const presentationProfile = buildChartPresentationProfile({
    id: profile,
    contract,
    kind,
    categoryCount,
    spec: exportSpec,
  });
  return {
    requestId: createChartCaptureRequestId(profile),
    contract,
    profile,
    sourceSurface,
    kind,
    categoryCount,
    filename,
    datasetName,
    scale,
    spec: exportSpec,
    layout: {
      width: exportSpec.width,
      height: exportSpec.height,
    },
    presentationProfile,
  };
}

/** PDF scatter + vertical bar — omit fixed composite canvas so the card fills the artifact. */
export function pdfChartUsesContentTightComposite(
  profile: ChartArtifactProfile,
  kind: ChartKind
): boolean {
  return (
    profile === "pdfChart" &&
    (kind === "scatter" || kind === "bar" || kind === "histogram")
  );
}

/** @deprecated Use pdfChartUsesContentTightComposite */
export function pdfChartScatterUsesContentTightComposite(
  profile: ChartArtifactProfile,
  kind: ChartKind
): boolean {
  return pdfChartUsesContentTightComposite(profile, kind);
}

export type CaptureChartPngArtifactArgs = {
  request: ChartPngCaptureRequest;
  getExportRoot: () => HTMLElement | null;
  isCurrent?: (requestId: string) => boolean;
  parity?: Omit<OverviewDashboardExportParityInput, "exportKind" | "exportRoot">;
};

export async function captureChartPngArtifact({
  request,
  getExportRoot,
  isCurrent,
  parity,
}: CaptureChartPngArtifactArgs): Promise<ChartArtifact> {
  if (process.env.NODE_ENV !== "production") {
    const qa = validatePngExportPresentationConstants();
    if (!qa.ok) {
      console.warn("[png-export-qa]", qa.checks.filter((c) => !c.ok));
    }
  }

  const ready = await waitForBasicChartCaptureReady({
    getRoot: getExportRoot,
    kind: request.kind,
    requestId: request.requestId,
    isCurrent,
  });
  pushChartCaptureStatus(ready.diagnostics.statusTimeline, "capturing");

  let parityResult: ReturnType<typeof validateOverviewDashboardExportParity> | undefined;
  if (parity) {
    parityResult = validateOverviewDashboardExportParity({
      ...parity,
      exportKind: request.kind,
      exportRoot: ready.root,
      theme:
        typeof document !== "undefined" &&
        document.documentElement.classList.contains("dark")
          ? "dark"
          : "light",
    });
    if (!parityResult.ok && process.env.NODE_ENV !== "production") {
      console.warn(
        "[png-export-parity]",
        parityResult.checks.filter((c) => !c.ok)
      );
    }
  }

  try {
    const contentTight = pdfChartUsesContentTightComposite(
      request.profile,
      request.kind
    );
    const png = await captureElementToPng(ready.root, {
      scale: request.scale,
      layoutWidthPx: request.spec.width,
      ...(contentTight
        ? {}
        : {
            canvasWidthPx: request.spec.canvasWidth,
            canvasHeightPx: request.spec.canvasHeight,
          }),
      footerText: buildPngExportFooterText(request.datasetName),
    });
    pushChartCaptureStatus(ready.diagnostics.statusTimeline, "complete");
    const artifact: ChartArtifact = {
      requestId: request.requestId,
      chartId: request.contract.identity.chartId,
      profile: request.profile,
      format: "png",
      dataUrl: png.dataUrl,
      widthPx: png.width,
      heightPx: png.height,
      contractVersion: request.contract.version,
      presentationProfile: request.presentationProfile,
      capturedAt: Date.now(),
      diagnostics: ready.diagnostics,
      parity: parityResult,
    };
    logChartPresentationProfileDiagnostics({
      profile: request.presentationProfile,
      artifactWidthPx: artifact.widthPx,
      artifactHeightPx: artifact.heightPx,
    });
    return artifact;
  } catch (err) {
    pushChartCaptureStatus(
      ready.diagnostics.statusTimeline,
      "failed",
      err instanceof Error ? err.message : "capture failed"
    );
    if (err instanceof ChartCaptureReadinessError) throw err;
    throw err;
  }
}

export function downloadChartArtifact(
  artifact: ChartArtifact,
  filename: string
): void {
  const a = document.createElement("a");
  a.href = artifact.dataUrl;
  a.download = filename.endsWith(".png") ? filename : `${filename}.png`;
  a.click();
}
