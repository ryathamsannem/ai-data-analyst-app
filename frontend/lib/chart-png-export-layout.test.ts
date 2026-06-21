import { describe, expect, it } from "vitest";
import {
  OVERVIEW_TWO_COLUMN_MIN_CONTAINER_PX,
  PRESENTATION_EXPORT_COMPACT_WIDTH_PX,
  PRESENTATION_EXPORT_HEIGHT_PX,
  PRESENTATION_EXPORT_HORIZONTAL_WIDTH_PX,
  PRESENTATION_EXPORT_HORIZONTAL_WIDE_WIDTH_PX,
  PRESENTATION_EXPORT_LINE_HEIGHT_PX,
  PRESENTATION_EXPORT_WIDTH_PX,
  buildPresentationCaptureLayout,
  buildPresentationExportSpec,
  presentationCaptureRootStyle,
  presentationExportAspectRatio,
  resolvePresentationExportCanvasHeight,
  resolvePresentationExportCanvasWidth,
  resolvePresentationExportPlotHeight,
} from "@/lib/chart-png-export-layout";

describe("chart PNG export layout", () => {
  it("uses compact 1200px width for line charts", () => {
    expect(resolvePresentationExportCanvasWidth("line")).toBe(
      PRESENTATION_EXPORT_COMPACT_WIDTH_PX
    );
    const layout = buildPresentationCaptureLayout("line");
    expect(layout.width).toBe(1200);
  });

  it("aligns scatter export canvas with line and area", () => {
    const spec = buildPresentationExportSpec("scatter");
    expect(spec.canvasWidth).toBe(PRESENTATION_EXPORT_COMPACT_WIDTH_PX);
    expect(spec.canvasHeight).toBe(PRESENTATION_EXPORT_LINE_HEIGHT_PX);
    expect(spec.width).toBe(1200);
    expect(spec.height).toBe(668);
  });

  it("uses tighter width for horizontal bars with few categories", () => {
    expect(
      resolvePresentationExportCanvasWidth("bar_horizontal", { categoryCount: 8 })
    ).toBe(PRESENTATION_EXPORT_HORIZONTAL_WIDTH_PX);
    expect(PRESENTATION_EXPORT_HORIZONTAL_WIDTH_PX).toBe(1100);
    expect(
      resolvePresentationExportCanvasWidth("bar_horizontal", { categoryCount: 12 })
    ).toBe(PRESENTATION_EXPORT_HORIZONTAL_WIDE_WIDTH_PX);
    expect(PRESENTATION_EXPORT_HORIZONTAL_WIDE_WIDTH_PX).toBe(1300);
    expect(PRESENTATION_EXPORT_WIDTH_PX).toBeGreaterThan(
      PRESENTATION_EXPORT_HORIZONTAL_WIDE_WIDTH_PX
    );
  });

  it("targets balanced canvas heights by chart type", () => {
    expect(resolvePresentationExportCanvasHeight("line")).toBe(
      PRESENTATION_EXPORT_LINE_HEIGHT_PX
    );
    expect(resolvePresentationExportCanvasHeight("bar_horizontal")).toBe(
      PRESENTATION_EXPORT_HEIGHT_PX
    );
    const plotH = resolvePresentationExportPlotHeight("line");
    expect(plotH).toBeGreaterThanOrEqual(560);
    expect(presentationExportAspectRatio("line")).toBeGreaterThanOrEqual(0.5);
    expect(presentationExportAspectRatio("line")).toBeLessThan(0.75);
  });

  it("assigns taller plot height to horizontal bars with many categories", () => {
    const few = resolvePresentationExportPlotHeight("bar_horizontal", {
      categoryCount: 4,
    });
    const many = resolvePresentationExportPlotHeight("bar_horizontal", {
      categoryCount: 10,
    });
    expect(many).toBeGreaterThan(few);
    expect(many).toBeGreaterThan(resolvePresentationExportPlotHeight("bar"));
  });

  it("off-screen capture style pins export root off viewport", () => {
    const layout = buildPresentationCaptureLayout("area");
    const style = presentationCaptureRootStyle(layout);
    expect(style.width).toBe(1200);
    expect(style.left).toBe("-12000px");
    expect(style.pointerEvents).toBe("none");
  });

  it("buildPresentationExportSpec includes fixed canvas dimensions", () => {
    const spec = buildPresentationExportSpec("bar_horizontal", {
      categoryCount: 8,
    });
    expect(spec.canvasWidth).toBe(PRESENTATION_EXPORT_HORIZONTAL_WIDTH_PX);
    expect(spec.canvasHeight).toBe(900);
    expect(spec.height).toBeGreaterThan(500);
  });

  it("grows donut export canvas for 4, 6, and 8 categories", () => {
    const d4 = buildPresentationExportSpec("donut", { categoryCount: 4 });
    const d6 = buildPresentationExportSpec("donut", { categoryCount: 6 });
    const d8 = buildPresentationExportSpec("donut", { categoryCount: 8 });
    expect(d6.canvasHeight).toBeGreaterThan(d4.canvasHeight);
    expect(d8.canvasHeight).toBeGreaterThan(d6.canvasHeight);
    expect(d4.height).toBeGreaterThanOrEqual(400);
    expect(d8.height).toBeGreaterThan(d4.height);
  });

  it("assigns histogram export plot height aligned with vertical bar", () => {
    const hist = resolvePresentationExportPlotHeight("histogram", {
      categoryCount: 8,
    });
    const bar = resolvePresentationExportPlotHeight("bar", {
      categoryCount: 8,
    });
    expect(hist).toBe(bar);
  });

  it("documents two-column overview threshold", () => {
    expect(OVERVIEW_TWO_COLUMN_MIN_CONTAINER_PX).toBeGreaterThanOrEqual(960);
  });
});
