/**
 * PNG export-only SVG polish — softer grids, readable ticks, cleaner h-bar titles.
 * Applied in chart-png-capture after Recharts SVG clone; never touches on-screen charts.
 */

export const PNG_EXPORT_TICK_FONT_PX = 14;
export const PNG_EXPORT_AXIS_TITLE_FONT_PX = 15;
export const PNG_EXPORT_CATEGORY_LABEL_FONT_PX = 15;
export const PNG_EXPORT_GRID_OPACITY_DARK = 0.3;
export const PNG_EXPORT_GRID_OPACITY_LIGHT = 0.42;
export const PNG_EXPORT_LINE_STROKE_PX = 4;
export const PNG_EXPORT_MARKER_R_PX = 6;
export const PNG_EXPORT_BAR_SCALE = 1.18;

function titleCaseWords(s: string): string {
  return s
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** Strip leading "By" or trailing "metric by dimension" phrasing for horizontal-bar axis titles. */
export function polishHorizontalBarExportAxisTitle(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;

  const byOnly = /^by\s+(.+)$/i.exec(t);
  if (byOnly) {
    const dim = byOnly[1]?.trim();
    return dim ? titleCaseWords(dim) : null;
  }

  const metricByDim = /^(.+?)\s+by\s+(.+)$/i.exec(t);
  if (metricByDim) {
    const dim = metricByDim[2]?.trim();
    return dim ? titleCaseWords(dim) : null;
  }

  return t;
}

/** True when the bottom axis title repeats category context already shown on the Y axis. */
export function shouldHideHorizontalBarExportAxisTitle(
  raw: string,
  categoryTickCount: number
): boolean {
  const t = raw.trim();
  if (!t) return true;
  if (categoryTickCount < 2) return false;

  if (/^by\s+/i.test(t)) return true;
  if (/\s+by\s+/i.test(t)) return true;

  const polished = polishHorizontalBarExportAxisTitle(t);
  if (!polished) return true;

  const generic = /^(category|categories|dimension|group|segment)s?$/i.test(
    polished
  );
  return generic;
}

function parseFontSizePx(value: string | null | undefined): number | null {
  if (!value) return null;
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : null;
}

function isAxisTitleText(el: Element): boolean {
  if (el.classList.contains("recharts-label")) return true;
  const parent = el.parentElement;
  if (parent?.classList.contains("recharts-label")) return true;
  if (!parent?.closest(".recharts-xAxis, .recharts-yAxis")) return false;
  const fw = el.getAttribute("font-weight");
  if (fw && Number.parseInt(fw, 10) >= 600) return true;
  return false;
}

function isGridLine(el: Element): boolean {
  return Boolean(el.closest(".recharts-cartesian-grid"));
}

function listNonNumericChartTexts(svg: SVGSVGElement): string[] {
  return [...svg.querySelectorAll("text")]
    .map((t) => (t.textContent ?? "").trim())
    .filter((t) => t && !/^-?[\d,.\s$%]+$/.test(t));
}

function countCategoryTicks(svg: SVGSVGElement): number {
  const yTicks = svg.querySelectorAll(
    ".recharts-yAxis .recharts-cartesian-axis-tick text"
  ).length;
  if (yTicks >= 2) return yTicks;

  const labels = listNonNumericChartTexts(svg).filter(
    (t) => !shouldHideHorizontalBarExportAxisTitle(t, 99)
  );
  return labels.length;
}

function softenGridLines(svg: SVGSVGElement, darkBackground: boolean): void {
  const opacity = darkBackground
    ? PNG_EXPORT_GRID_OPACITY_DARK
    : PNG_EXPORT_GRID_OPACITY_LIGHT;
  svg
    .querySelectorAll(
      ".recharts-cartesian-grid line, .recharts-cartesian-grid path"
    )
    .forEach((line) => {
      line.setAttribute("stroke-opacity", String(opacity));
      if (!line.getAttribute("stroke-dasharray")) {
        line.setAttribute("stroke-dasharray", "3 9");
      }
    });
}

function polishRedundantHorizontalBarAxisTitles(svg: SVGSVGElement): void {
  const catCount = countCategoryTicks(svg);
  if (catCount < 2) return;

  svg.querySelectorAll(".recharts-xAxis text").forEach((el) => {
    const raw = (el.textContent ?? "").trim();
    if (!raw || /^-?[\d,.\s$%]+$/.test(raw)) return;

    if (shouldHideHorizontalBarExportAxisTitle(raw, catCount)) {
      el.remove();
    }
  });
}

function isNumericTickText(raw: string): boolean {
  return /^-?[\d,.\s$%]+$/.test(raw);
}

function polishCategoryYAxisLabels(
  svg: SVGSVGElement,
  darkBackground: boolean
): void {
  const fill = darkBackground ? "#e2e8f0" : "#334155";
  const fs = PNG_EXPORT_CATEGORY_LABEL_FONT_PX;
  svg
    .querySelectorAll(".recharts-yAxis .recharts-cartesian-axis-tick text")
    .forEach((el) => {
      if (!(el instanceof SVGElement)) return;
      const raw = (el.textContent ?? "").trim();
      if (!raw || isNumericTickText(raw)) return;
      el.setAttribute("font-size", String(fs));
      el.setAttribute("font-weight", "500");
      el.setAttribute("fill", fill);
    });
}

function bumpAxisTypography(svg: SVGSVGElement): void {
  const tickFs = PNG_EXPORT_TICK_FONT_PX;
  const titleFs = PNG_EXPORT_AXIS_TITLE_FONT_PX;

  svg.querySelectorAll("text, tspan").forEach((el) => {
    if (el.tagName !== "text" && el.tagName !== "tspan") return;

    if (isGridLine(el)) return;

    const title = isAxisTitleText(el);
    const inAxis = Boolean(el.closest(".recharts-xAxis, .recharts-yAxis"));
    const inTick = Boolean(el.closest(".recharts-cartesian-axis-tick"));
    const raw = (el.textContent ?? "").trim();

    if (!inAxis && !inTick && !title) {
      if (raw && !/^-?[\d,.\s$%]+$/.test(raw)) {
        const current = parseFontSizePx(el.getAttribute("font-size"));
        if (current == null || current < tickFs) {
          el.setAttribute("font-size", String(tickFs));
        }
      }
      return;
    }

    if (inTick && /^-?[\d,.\s$%]+$/.test(raw)) {
      const current = parseFontSizePx(el.getAttribute("font-size"));
      if (current == null || current < tickFs) {
        el.setAttribute("font-size", String(tickFs));
      }
      return;
    }

    if (title) {
      const current = parseFontSizePx(el.getAttribute("font-size"));
      if (current == null || current < titleFs) {
        el.setAttribute("font-size", String(titleFs));
      }
      el.setAttribute("font-weight", "600");
      return;
    }

    if (inTick || inAxis) {
      const current = parseFontSizePx(el.getAttribute("font-size"));
      if (current == null || current < tickFs) {
        el.setAttribute("font-size", String(tickFs));
      }
    }
  });
}

function strengthenTrendSeries(svg: SVGSVGElement): void {
  svg
    .querySelectorAll(
      ".recharts-line-curve, .recharts-area-curve, .recharts-area-area"
    )
    .forEach((el) => {
      if (el instanceof SVGElement) {
        el.setAttribute("stroke-width", String(PNG_EXPORT_LINE_STROKE_PX));
      }
    });
  svg
    .querySelectorAll(
      ".recharts-dot circle, .recharts-line-dots circle, .recharts-area-dots circle"
    )
    .forEach((el) => {
      if (el instanceof SVGElement) {
        el.setAttribute("r", String(PNG_EXPORT_MARKER_R_PX));
      }
    });
}

function strengthenBarSeries(svg: SVGSVGElement): void {
  const mount = document.createElement("div");
  mount.style.cssText =
    "position:fixed;left:-9999px;top:0;visibility:hidden;pointer-events:none;";
  document.body.appendChild(mount);
  mount.appendChild(svg);
  try {
    svg
      .querySelectorAll(
        ".recharts-bar-rectangle path, .recharts-bar-rectangle rect, .recharts-bar rect"
      )
      .forEach((el) => {
        if (!(el instanceof SVGElement)) return;
        let box: DOMRect | SVGRect;
        try {
          box = el.getBBox();
        } catch {
          return;
        }
        if (box.width <= 0 || box.height <= 0) return;
        const cx = box.x + box.width / 2;
        const cy = box.y + box.height / 2;
        const scale = PNG_EXPORT_BAR_SCALE;
        const isHorizontal = box.width >= box.height;
        const sx = isHorizontal ? 1 : scale;
        const sy = isHorizontal ? scale : 1;
        el.setAttribute(
          "transform",
          `translate(${cx} ${cy}) scale(${sx} ${sy}) translate(${-cx} ${-cy})`
        );
      });
  } finally {
    mount.remove();
  }
}

/** Apply export-only visual polish to a cloned Recharts SVG before Canvg render. */
export function applyPngExportSvgPolish(
  svg: SVGSVGElement,
  options: { darkBackground?: boolean } = {}
): void {
  const dark = options.darkBackground ?? false;
  softenGridLines(svg, dark);
  polishRedundantHorizontalBarAxisTitles(svg);
  bumpAxisTypography(svg);
  polishCategoryYAxisLabels(svg, dark);
  strengthenTrendSeries(svg);
  strengthenBarSeries(svg);
}
