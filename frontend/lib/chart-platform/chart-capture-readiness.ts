import {
  createChartCaptureTimeline,
  pushChartCaptureStatus,
  type ChartCaptureDiagnostics,
  type ChartCaptureFailureReason,
  type ChartCaptureTimelineEntry,
} from "@/lib/chart-platform/chart-artifact";
import { waitForStableChartSvg } from "@/lib/chart-png-capture";
import type { ChartKind } from "@/app/chart-types";

type Box = {
  width: number;
  height: number;
};

type ReadinessSnapshot = {
  root: HTMLElement;
  svg: Element | null;
  rootBox: Box;
  svgBox: Box;
  responsiveBox: Box;
  svgCount: number;
  markCount: number;
  failureReason?: ChartCaptureFailureReason;
};

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
  failureReason?: ChartCaptureFailureReason,
  layoutSampleCount = 0,
  snapshot?: ReadinessSnapshot | null
): ChartCaptureDiagnostics {
  const rootBox = snapshot?.rootBox ?? measureElement(root);
  const svgBox = snapshot?.svgBox ?? { width: 0, height: 0 };
  const responsiveBox = snapshot?.responsiveBox ?? { width: 0, height: 0 };
  return {
    statusTimeline: [...timeline],
    resolvedKind: kind,
    svgCount: snapshot?.svgCount ?? root?.querySelectorAll("svg").length ?? 0,
    markCount: snapshot?.markCount ?? 0,
    measuredWidthPx: Math.round(rootBox.width),
    measuredHeightPx: Math.round(rootBox.height),
    rootWidthPx: Math.round(rootBox.width),
    rootHeightPx: Math.round(rootBox.height),
    svgWidthPx: Math.round(svgBox.width),
    svgHeightPx: Math.round(svgBox.height),
    responsiveContainerWidthPx: Math.round(responsiveBox.width),
    responsiveContainerHeightPx: Math.round(responsiveBox.height),
    layoutSampleCount,
    retries,
    failureReason,
  };
}

function toFiniteNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function readNumericAttr(el: Element | null, name: string): number {
  if (!el?.getAttribute) return 0;
  return toFiniteNumber(el.getAttribute(name));
}

function measureElement(el: Element | null): Box {
  if (!el) return { width: 0, height: 0 };
  const rect = "getBoundingClientRect" in el ? el.getBoundingClientRect() : null;
  const bbox =
    "getBBox" in el && typeof el.getBBox === "function"
      ? safelyReadBBox(el as SVGGraphicsElement)
      : null;
  const radius = readNumericAttr(el, "r");
  const attrWidth = readNumericAttr(el, "width");
  const attrHeight = readNumericAttr(el, "height");
  const viewBox = el.getAttribute?.("viewBox")?.trim().split(/\s+/).map(Number);
  const viewBoxWidth =
    viewBox && viewBox.length === 4 && Number.isFinite(viewBox[2])
      ? Number(viewBox[2])
      : 0;
  const viewBoxHeight =
    viewBox && viewBox.length === 4 && Number.isFinite(viewBox[3])
      ? Number(viewBox[3])
      : 0;
  const anyEl = el as Element & {
    clientWidth?: number;
    clientHeight?: number;
    scrollWidth?: number;
    scrollHeight?: number;
  };
  return {
    width: Math.max(
      toFiniteNumber(rect?.width),
      toFiniteNumber(bbox?.width),
      attrWidth,
      viewBoxWidth,
      radius * 2,
      toFiniteNumber(anyEl.clientWidth),
      toFiniteNumber(anyEl.scrollWidth)
    ),
    height: Math.max(
      toFiniteNumber(rect?.height),
      toFiniteNumber(bbox?.height),
      attrHeight,
      viewBoxHeight,
      radius * 2,
      toFiniteNumber(anyEl.clientHeight),
      toFiniteNumber(anyEl.scrollHeight)
    ),
  };
}

function safelyReadBBox(el: SVGGraphicsElement): Box | null {
  try {
    const bbox = el.getBBox();
    return bbox ? { width: bbox.width, height: bbox.height } : null;
  } catch {
    return null;
  }
}

function hasNonZeroBox(box: Box, threshold = 2): boolean {
  return box.width > threshold && box.height > threshold;
}

async function delay(ms: number): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function queryAll(root: Element, selector: string): Element[] {
  try {
    return Array.from(root.querySelectorAll(selector));
  } catch {
    return [];
  }
}

function classText(el: Element): string {
  const value = el.getAttribute?.("class");
  return typeof value === "string" ? value : "";
}

function isInsideHiddenSvgContainer(el: Element): boolean {
  let node: Element | null = el;
  while (node) {
    const tag = node.tagName.toLowerCase();
    if (tag === "defs" || tag === "clippath" || tag === "mask" || tag === "pattern") {
      return true;
    }
    node = node.parentElement;
  }
  return false;
}

function attrOrInlineStyle(el: Element, attrName: string): string {
  const direct = el.getAttribute?.(attrName);
  if (direct) return direct;
  const style = el.getAttribute?.("style") ?? "";
  const hit = new RegExp(`${attrName}\\s*:\\s*([^;]+)`, "i").exec(style);
  return hit?.[1]?.trim() ?? "";
}

function isElementVisible(el: Element): boolean {
  if (isInsideHiddenSvgContainer(el)) return false;
  const display = attrOrInlineStyle(el, "display").toLowerCase();
  const visibility = attrOrInlineStyle(el, "visibility").toLowerCase();
  const opacity = attrOrInlineStyle(el, "opacity");
  if (display === "none" || visibility === "hidden" || opacity === "0") {
    return false;
  }
  return true;
}

function hasPaint(el: Element, allowStrokeOnly: boolean): boolean {
  const fill = attrOrInlineStyle(el, "fill").toLowerCase();
  const stroke = attrOrInlineStyle(el, "stroke").toLowerCase();
  if (allowStrokeOnly && stroke && stroke !== "none" && stroke !== "transparent") {
    return true;
  }
  if (fill && fill !== "none" && fill !== "transparent") return true;
  return !fill && (!stroke || allowStrokeOnly);
}

function hasVisibleGeometry(
  el: Element,
  opts: { allowStrokeOnly?: boolean; allowOneDimensional?: boolean } = {}
): boolean {
  if (!isElementVisible(el) || !hasPaint(el, opts.allowStrokeOnly ?? false)) {
    return false;
  }
  const box = measureElement(el);
  if (opts.allowOneDimensional) {
    return Math.max(box.width, box.height) > 1;
  }
  return box.width > 1 && box.height > 1;
}

function hasClassMatch(el: Element, needle: RegExp): boolean {
  if (needle.test(classText(el))) return true;
  let node = el.parentElement;
  while (node) {
    if (needle.test(classText(node))) return true;
    node = node.parentElement;
  }
  return false;
}

function candidateMarksForKind(svg: Element, kind: ChartKind): Element[] {
  if (kind === "bar" || kind === "bar_horizontal" || kind === "histogram") {
    return queryAll(
      svg,
      ".recharts-bar-rectangle, .recharts-bar-rectangle rect, .recharts-bar-rectangle path, .recharts-bar rect, .recharts-bar path, .recharts-rectangle"
    ).filter((el) => hasClassMatch(el, /recharts-(bar|rectangle)/));
  }
  if (kind === "line") {
    return queryAll(
      svg,
      ".recharts-line-curve, .recharts-line path, .recharts-line-dot, .recharts-dot, circle"
    ).filter((el) => hasClassMatch(el, /recharts-(line|dot)/) || el.tagName.toLowerCase() === "circle");
  }
  if (kind === "area") {
    return queryAll(
      svg,
      ".recharts-area-area, .recharts-area-curve, .recharts-area path, .recharts-area-dot, .recharts-dot, circle"
    ).filter((el) => hasClassMatch(el, /recharts-(area|dot)/) || el.tagName.toLowerCase() === "circle");
  }
  if (kind === "pie" || kind === "donut") {
    return queryAll(
      svg,
      ".recharts-pie-sector path, .recharts-sector, .recharts-pie path"
    ).filter((el) => hasClassMatch(el, /recharts-(pie|sector)/));
  }
  if (kind === "scatter") {
    return queryAll(
      svg,
      ".recharts-scatter-symbol, .recharts-scatter path, .recharts-scatter circle, circle"
    ).filter((el) => hasClassMatch(el, /recharts-scatter/) || el.tagName.toLowerCase() === "circle");
  }
  return queryAll(
    svg,
    ".recharts-bar-rectangle, .recharts-line-curve, .recharts-area-area, .recharts-area-curve, .recharts-pie-sector path, .recharts-scatter-symbol"
  );
}

function visibleMarkCount(svg: Element, kind: ChartKind): number {
  const oneDimensional = kind === "line" || kind === "area";
  const strokeOnly = kind === "line" || kind === "area";
  return candidateMarksForKind(svg, kind).filter((el) =>
    hasVisibleGeometry(el, {
      allowOneDimensional: oneDimensional,
      allowStrokeOnly: strokeOnly,
    })
  ).length;
}

function findPrimarySvg(root: HTMLElement): Element | null {
  const svgs = queryAll(root, "svg").filter((svg) => hasNonZeroBox(measureElement(svg)));
  if (svgs.length === 0) return null;
  return svgs.sort((a, b) => {
    const ab = measureElement(a);
    const bb = measureElement(b);
    return bb.width * bb.height - ab.width * ab.height;
  })[0] ?? null;
}

function readReadinessSnapshot(
  root: HTMLElement,
  kind: ChartKind
): ReadinessSnapshot {
  const rootBox = measureElement(root);
  const responsiveContainers = queryAll(root, ".recharts-responsive-container");
  const zeroResponsiveContainer = responsiveContainers.find(
    (el) => !hasNonZeroBox(measureElement(el))
  );
  const responsiveBox = responsiveContainers.length
    ? measureElement(zeroResponsiveContainer ?? responsiveContainers[0]!)
    : { width: 0, height: 0 };
  const svgCount = queryAll(root, "svg").length;
  const svg = findPrimarySvg(root);
  const svgBox = measureElement(svg);
  const markCount = svg ? visibleMarkCount(svg, kind) : 0;
  const failureReason: ChartCaptureFailureReason | undefined = !hasNonZeroBox(rootBox)
    ? "zero_dimensions"
    : zeroResponsiveContainer
      ? "zero_dimensions"
      : svgCount === 0
        ? "missing_svg"
        : !hasNonZeroBox(svgBox)
          ? "zero_svg_dimensions"
          : markCount <= 0
            ? "missing_marks"
            : undefined;

  return {
    root,
    svg,
    rootBox,
    svgBox,
    responsiveBox,
    svgCount,
    markCount,
    failureReason,
  };
}

function snapshotSignature(snapshot: ReadinessSnapshot): string {
  return [
    Math.round(snapshot.rootBox.width),
    Math.round(snapshot.rootBox.height),
    Math.round(snapshot.svgBox.width),
    Math.round(snapshot.svgBox.height),
    Math.round(snapshot.responsiveBox.width),
    Math.round(snapshot.responsiveBox.height),
    snapshot.svgCount,
    snapshot.markCount,
    snapshot.svg?.getAttribute?.("viewBox") ?? "",
  ].join("|");
}

async function nextLayoutFrame(): Promise<void> {
  await new Promise<void>((resolve) => {
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => resolve());
      return;
    }
    setTimeout(resolve, 0);
  });
}

async function waitForStableKindAwareLayout(args: {
  root: HTMLElement;
  kind: ChartKind;
  frames?: number;
}): Promise<{ stable: boolean; samples: ReadinessSnapshot[] }> {
  const neededFrames = args.frames ?? 3;
  const samples: ReadinessSnapshot[] = [];
  for (let i = 0; i < neededFrames; i += 1) {
    await nextLayoutFrame();
    samples.push(readReadinessSnapshot(args.root, args.kind));
  }
  const first = samples[0] ? snapshotSignature(samples[0]) : "";
  return {
    stable: samples.length === neededFrames && samples.every((s) => snapshotSignature(s) === first),
    samples,
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
  let layoutSampleCount = 0;
  let lastSnapshot: ReadinessSnapshot | null = null;
  let lastFailureReason: ChartCaptureFailureReason = "host_not_mounted";

  pushChartCaptureStatus(timeline, "mounting");
  while (Date.now() < deadline) {
    const root = args.getRoot();
    if (!root) {
      lastFailureReason = "host_not_mounted";
      retries += 1;
      await delay(48);
      continue;
    }

    if (args.isCurrent && !args.isCurrent(args.requestId)) {
      const diagnostics = readRootDiagnostics(
        root,
        args.kind,
        timeline,
        retries,
        "cancelled",
        layoutSampleCount,
        lastSnapshot
      );
      pushChartCaptureStatus(timeline, "cancelled", "request superseded");
      throw new ChartCaptureReadinessError(
        "cancelled",
        diagnostics,
        "Chart capture was cancelled."
      );
    }

    pushChartCaptureStatus(timeline, "measuring");
    const snapshot = readReadinessSnapshot(root, args.kind);
    lastSnapshot = snapshot;
    if (snapshot.failureReason) {
      lastFailureReason = snapshot.failureReason;
      retries += 1;
      await delay(48);
      continue;
    }

    pushChartCaptureStatus(timeline, "rendering");
    const stability = await waitForStableKindAwareLayout({
      root,
      kind: args.kind,
      frames: 3,
    });
    layoutSampleCount += stability.samples.length;
    lastSnapshot = stability.samples.at(-1) ?? snapshot;
    const unstableReason = stability.samples.find((sample) => sample.failureReason)
      ?.failureReason;
    if (unstableReason) {
      lastFailureReason = unstableReason;
      retries += 1;
      await delay(48);
      continue;
    }
    if (!stability.stable) {
      lastFailureReason = "unstable_layout";
      retries += 1;
      await delay(48);
      continue;
    }

    pushChartCaptureStatus(timeline, "settling");
    await waitForStableChartSvg(root);
    pushChartCaptureStatus(timeline, "ready");
    return {
      root,
      diagnostics: readRootDiagnostics(
        root,
        args.kind,
        timeline,
        retries,
        undefined,
        layoutSampleCount,
        lastSnapshot
      ),
    };
  }

  const root = args.getRoot();
  if (root) lastSnapshot = readReadinessSnapshot(root, args.kind);
  const reason: ChartCaptureFailureReason =
    lastSnapshot?.failureReason ?? lastFailureReason ?? "timeout";
  const finalReason = reason === "host_not_mounted" ? reason : reason || "timeout";
  pushChartCaptureStatus(timeline, "failed", finalReason);
  const diagnostics = readRootDiagnostics(
    root,
    args.kind,
    timeline,
    retries,
    finalReason,
    layoutSampleCount,
    lastSnapshot
  );
  throw new ChartCaptureReadinessError(finalReason, diagnostics);
}
