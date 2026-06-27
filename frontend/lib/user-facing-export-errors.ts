import { ChartCaptureReadinessError } from "@/lib/chart-platform/chart-capture-readiness";

const CAPTURE_REASON_MESSAGES: Record<string, string> = {
  host_not_mounted:
    "Chart export area is not ready. Wait for the chart to finish loading, then try again.",
  missing_svg:
    "Chart did not finish rendering. Refresh the page and try export again.",
  missing_marks:
    "Chart has no visible data to capture. Check filters or pick a different chart.",
  timeout:
    "Chart export timed out while waiting for the plot to render. Try again.",
  unstable_layout:
    "Chart layout is still settling. Wait a moment and try export again.",
};

export const FILTERED_DASHBOARD_ERROR =
  "Could not refresh the dashboard with current filters. Your previous view is still shown — try again or clear filters.";

export function friendlyChartCaptureErrorMessage(err: unknown): string {
  if (err instanceof ChartCaptureReadinessError) {
    return (
      CAPTURE_REASON_MESSAGES[err.reason] ??
      "Chart is not ready to export yet. Wait for it to finish loading, then try again."
    );
  }
  if (err instanceof Error) {
    const msg = err.message.trim();
    if (msg && CAPTURE_REASON_MESSAGES[msg]) return CAPTURE_REASON_MESSAGES[msg];
    if (/^missing_|^timeout$|^host_not_mounted$/i.test(msg)) {
      return "Chart is not ready to export yet. Wait for it to finish loading, then try again.";
    }
  }
  return "Unable to export chart image.";
}

export function exportTabBlockedReason(args: {
  hasDataset: boolean;
  includeChart: boolean;
  chartAvailable: boolean;
  includeAIInsight: boolean;
  aiAnswerAvailable: boolean;
}): string | null {
  if (!args.hasDataset) {
    return "Upload a dataset on the Overview tab before exporting a PDF.";
  }
  if (args.includeChart && !args.chartAvailable) {
    return "Select a chart on the Charts tab or ask an AI Insights question with a visualization before including Chart in the PDF.";
  }
  if (args.includeAIInsight && !args.aiAnswerAvailable) {
    return "Ask an AI Insights question before including AI Insight in the PDF.";
  }
  return null;
}
