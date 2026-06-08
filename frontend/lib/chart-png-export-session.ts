import type { ChartKind } from "@/app/chart-types";
import {
  buildPresentationExportSpec,
  type PresentationExportSpec,
} from "@/lib/chart-png-export-layout";
import {
  buildPngExportFooterText,
  captureElementToPng,
  prepareChartForPngCapture,
  waitForStableChartSvg,
} from "@/lib/chart-png-capture";

export type RunChartPngExportArgs = {
  /** Lazy root lookup — portal may mount after setState. */
  getExportRoot: () => HTMLElement | null;
  kind: ChartKind;
  categoryCount: number;
  filename: string;
  scale?: number;
  /** Optional dataset label appended to export footer. */
  datasetName?: string | null;
};

export type RunChartPngExportResult = {
  spec: PresentationExportSpec;
};

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
}: RunChartPngExportArgs): Promise<RunChartPngExportResult> {
  const spec = buildPresentationExportSpec(kind, { categoryCount });

  const exportRoot = await waitForOffscreenChartReady(getExportRoot);
  await prepareChartForPngCapture(exportRoot);
  const { dataUrl } = await captureElementToPng(exportRoot, {
    scale,
    layoutWidthPx: spec.width,
    canvasWidthPx: spec.canvasWidth,
    canvasHeightPx: spec.canvasHeight,
    footerText: buildPngExportFooterText(datasetName),
  });

  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename.endsWith(".png") ? filename : `${filename}.png`;
  a.click();

  return { spec };
}
