import { describe, expect, it } from "vitest";
import { ChartCaptureReadinessError } from "@/lib/chart-platform/chart-capture-readiness";
import {
  exportTabBlockedReason,
  friendlyChartCaptureErrorMessage,
} from "@/lib/user-facing-export-errors";

describe("friendlyChartCaptureErrorMessage", () => {
  it("maps readiness error reasons to user copy", () => {
    const err = new ChartCaptureReadinessError("missing_marks", {
      statusTimeline: [],
      resolvedKind: "bar",
      svgCount: 1,
      markCount: 0,
      measuredWidthPx: 400,
      measuredHeightPx: 300,
      rootWidthPx: 400,
      rootHeightPx: 300,
      svgWidthPx: 400,
      svgHeightPx: 300,
      responsiveContainerWidthPx: 400,
      responsiveContainerHeightPx: 300,
      layoutSampleCount: 0,
      retries: 3,
      failureReason: "missing_marks",
    });
    expect(friendlyChartCaptureErrorMessage(err)).toMatch(/no visible data/i);
  });

  it("falls back for unknown errors", () => {
    expect(friendlyChartCaptureErrorMessage(new Error("boom"))).toBe(
      "Unable to export chart image."
    );
  });
});

describe("exportTabBlockedReason", () => {
  it("requires dataset upload", () => {
    expect(
      exportTabBlockedReason({
        hasDataset: false,
        includeChart: true,
        chartAvailable: false,
        includeAIInsight: false,
        aiAnswerAvailable: false,
      })
    ).toMatch(/Upload a dataset/i);
  });

  it("blocks chart section when no chart in session", () => {
    expect(
      exportTabBlockedReason({
        hasDataset: true,
        includeChart: true,
        chartAvailable: false,
        includeAIInsight: false,
        aiAnswerAvailable: true,
      })
    ).toMatch(/Select a chart/i);
  });

  it("allows export when requirements met", () => {
    expect(
      exportTabBlockedReason({
        hasDataset: true,
        includeChart: true,
        chartAvailable: true,
        includeAIInsight: true,
        aiAnswerAvailable: true,
      })
    ).toBeNull();
  });
});
