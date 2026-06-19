import { describe, expect, it } from "vitest";
import type { ChartKind } from "@/app/chart-types";
import {
  ChartCaptureReadinessError,
  waitForBasicChartCaptureReady,
} from "@/lib/chart-platform/chart-capture-readiness";

type FakeBox = { width: number; height: number };

class FakeElement {
  tagName: string;
  parentElement: FakeElement | null = null;
  children: FakeElement[] = [];
  attrs: Record<string, string>;
  box: FakeBox | (() => FakeBox);
  clientWidth: number;
  clientHeight: number;
  scrollWidth: number;
  scrollHeight: number;

  constructor(
    tagName: string,
    attrs: Record<string, string> = {},
    box: FakeBox | (() => FakeBox) = { width: 0, height: 0 }
  ) {
    this.tagName = tagName;
    this.attrs = attrs;
    this.box = box;
    const initial = typeof box === "function" ? box() : box;
    this.clientWidth = initial.width;
    this.clientHeight = initial.height;
    this.scrollWidth = initial.width;
    this.scrollHeight = initial.height;
  }

  append(child: FakeElement): FakeElement {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  getAttribute(name: string): string | null {
    return this.attrs[name] ?? null;
  }

  getBoundingClientRect(): FakeBox {
    return typeof this.box === "function" ? this.box() : this.box;
  }

  getBBox(): FakeBox {
    return this.getBoundingClientRect();
  }

  querySelectorAll(selector: string): FakeElement[] {
    const selectors = selector.split(",").map((s) => s.trim());
    const out: FakeElement[] = [];
    const visit = (node: FakeElement) => {
      if (selectors.some((s) => matchesSelector(node, s))) out.push(node);
      for (const child of node.children) visit(child);
    };
    for (const child of this.children) visit(child);
    return out;
  }

  querySelector(selector: string): FakeElement | null {
    return this.querySelectorAll(selector)[0] ?? null;
  }
}

function classList(node: FakeElement): string[] {
  return (node.attrs.class ?? "").split(/\s+/).filter(Boolean);
}

function hasClassInSelfOrAncestor(node: FakeElement, className: string): boolean {
  let current: FakeElement | null = node;
  while (current) {
    if (classList(current).includes(className)) return true;
    current = current.parentElement;
  }
  return false;
}

function matchesSelector(node: FakeElement, selector: string): boolean {
  if (selector === "svg") return node.tagName === "svg";
  if (selector === ".recharts-responsive-container") {
    return classList(node).includes("recharts-responsive-container");
  }

  const tag = ["path", "rect", "circle"].find((t) => selector.endsWith(t));
  const classMatches = Array.from(selector.matchAll(/\.([a-zA-Z0-9_-]+)/g)).map(
    (m) => m[1]
  );
  if (tag && node.tagName !== tag) return false;
  if (!tag && classMatches.length > 0) {
    return classMatches.some((c) => classList(node).includes(c));
  }
  return classMatches.every((c) => hasClassInSelfOrAncestor(node, c));
}

function buildRoot(kind: ChartKind, mark?: FakeElement, opts?: {
  svgBox?: FakeBox | (() => FakeBox);
  svgAttrs?: Record<string, string>;
  responsiveBox?: FakeBox;
}): HTMLElement {
  const root = new FakeElement("div", {}, { width: 900, height: 620 });
  const container = root.append(
    new FakeElement(
      "div",
      { class: "recharts-responsive-container" },
      opts?.responsiveBox ?? { width: 860, height: 520 }
    )
  );
  const svg = container.append(
    new FakeElement(
      "svg",
      opts?.svgAttrs ?? { width: "860", height: "520" },
      opts?.svgBox ?? {
        width: 860,
        height: 520,
      }
    )
  );
  if (mark) {
    if (kind === "bar" || kind === "bar_horizontal" || kind === "histogram") {
      svg.append(new FakeElement("g", { class: "recharts-bar-rectangle" })).append(mark);
    } else if (kind === "line") {
      svg.append(new FakeElement("g", { class: "recharts-line" })).append(mark);
    } else if (kind === "area") {
      svg.append(new FakeElement("g", { class: "recharts-area" })).append(mark);
    } else if (kind === "pie" || kind === "donut") {
      svg.append(new FakeElement("g", { class: "recharts-pie-sector" })).append(mark);
    } else if (kind === "scatter") {
      svg.append(new FakeElement("g", { class: "recharts-scatter" })).append(mark);
    }
  }
  return root as unknown as HTMLElement;
}

async function expectReady(kind: ChartKind, mark: FakeElement) {
  const ready = await waitForBasicChartCaptureReady({
    getRoot: () => buildRoot(kind, mark),
    kind,
    requestId: "req-1",
    maxMs: 400,
  });
  expect(ready.diagnostics.failureReason).toBeUndefined();
  expect(ready.diagnostics.markCount).toBeGreaterThan(0);
  expect(ready.diagnostics.svgWidthPx).toBeGreaterThan(0);
  expect(ready.diagnostics.layoutSampleCount).toBeGreaterThanOrEqual(3);
}

async function expectReadinessFailure(
  root: HTMLElement | null,
  kind: ChartKind,
  reason: string
) {
  await expect(
    waitForBasicChartCaptureReady({
      getRoot: () => root,
      kind,
      requestId: "req-1",
      maxMs: 20,
    })
  ).rejects.toMatchObject({
    reason,
    diagnostics: expect.objectContaining({ failureReason: reason }),
  });
}

describe("chart capture readiness", () => {
  it.each([
    ["bar", new FakeElement("rect", { fill: "#38bdf8" }, { width: 32, height: 120 })],
    [
      "bar_horizontal",
      new FakeElement("path", { fill: "#38bdf8" }, { width: 180, height: 20 }),
    ],
    [
      "histogram",
      new FakeElement("rect", { fill: "#38bdf8" }, { width: 28, height: 90 }),
    ],
    [
      "line",
      new FakeElement("path", { stroke: "#38bdf8", fill: "none" }, { width: 220, height: 1 }),
    ],
    [
      "area",
      new FakeElement("path", { fill: "#38bdf8" }, { width: 220, height: 120 }),
    ],
    [
      "donut",
      new FakeElement("path", { fill: "#38bdf8" }, { width: 160, height: 160 }),
    ],
    [
      "pie",
      new FakeElement("path", { fill: "#38bdf8" }, { width: 160, height: 160 }),
    ],
    [
      "scatter",
      new FakeElement("circle", { fill: "#38bdf8", r: "4" }, { width: 8, height: 8 }),
    ],
  ] as const)("detects visible %s marks", async (kind, mark) => {
    await expectReady(kind, mark);
  });

  it("allows dot fallback for line charts", async () => {
    await expectReady(
      "line",
      new FakeElement("circle", { fill: "#38bdf8", r: "4" }, { width: 8, height: 8 })
    );
  });

  it("reports missing SVG", async () => {
    const root = new FakeElement("div", {}, { width: 900, height: 620 });
    await expectReadinessFailure(root as unknown as HTMLElement, "bar", "missing_svg");
  });

  it("reports zero-size responsive containers", async () => {
    const root = buildRoot(
      "bar",
      new FakeElement("rect", { fill: "#38bdf8" }, { width: 32, height: 120 }),
      { responsiveBox: { width: 0, height: 0 } }
    );
    await expectReadinessFailure(root, "bar", "zero_dimensions");
  });

  it("reports zero-size primary SVG", async () => {
    const root = buildRoot(
      "bar",
      new FakeElement("rect", { fill: "#38bdf8" }, { width: 32, height: 120 }),
      { svgAttrs: { width: "0", height: "0" }, svgBox: { width: 0, height: 0 } }
    );
    await expectReadinessFailure(root, "bar", "zero_svg_dimensions");
  });

  it("reports missing marks when only SVG chrome exists", async () => {
    await expectReadinessFailure(buildRoot("bar"), "bar", "missing_marks");
  });

  it("ignores hidden marks", async () => {
    await expectReadinessFailure(
      buildRoot(
        "scatter",
        new FakeElement(
          "circle",
          { fill: "#38bdf8", r: "4", style: "display: none" },
          { width: 8, height: 8 }
        )
      ),
      "scatter",
      "missing_marks"
    );
  });

  it("reports unstable layout after valid marks appear", async () => {
    let width = 800;
    const root = buildRoot(
      "bar",
      new FakeElement("rect", { fill: "#38bdf8" }, { width: 32, height: 120 }),
      {
        svgBox: () => {
          width += 5;
          return { width, height: 520 };
        },
      }
    );
    await expectReadinessFailure(root, "bar", "unstable_layout");
  });
});
