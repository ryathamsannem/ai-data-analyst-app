import type { ChartKind } from "@/app/chart-types";
import {
  buildPresentationExportSpec,
  type PresentationExportSpec,
} from "@/lib/chart-png-export-layout";
import {
  type OverviewDashboardExportParityInput,
  validateOverviewDashboardExportParity,
} from "@/lib/overview-dashboard-export";
import { validatePngExportPresentationConstants } from "@/lib/chart-png-export-qa";
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
  /** Optional dashboard parity expectation (Overview auto-dashboard exports). */
  parity?: Omit<
    OverviewDashboardExportParityInput,
    "exportKind" | "exportRoot"
  >;
};

export type RunChartPngExportResult = {
  spec: PresentationExportSpec;
  parity?: ReturnType<typeof validateOverviewDashboardExportParity>;
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
  parity,
}: RunChartPngExportArgs): Promise<RunChartPngExportResult> {
  const spec = buildPresentationExportSpec(kind, { categoryCount });

  if (process.env.NODE_ENV !== "production") {
    const qa = validatePngExportPresentationConstants();
    if (!qa.ok) {
      console.warn("[png-export-qa]", qa.checks.filter((c) => !c.ok));
    }
  }

  const exportRoot = await waitForOffscreenChartReady(getExportRoot);

  let parityResult: ReturnType<typeof validateOverviewDashboardExportParity> | undefined;
  if (parity) {
    parityResult = validateOverviewDashboardExportParity({
      ...parity,
      exportKind: kind,
      exportRoot,
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

  return { spec, parity: parityResult };
}
