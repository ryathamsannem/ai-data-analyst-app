/**
 * PNG export-only SVG polish — softer grids, readable ticks, cleaner h-bar titles.
 * Applied in chart-png-capture after Recharts SVG clone; never touches on-screen charts.
 */

export const PNG_EXPORT_TICK_FONT_PX = 13;
export const PNG_EXPORT_AXIS_TITLE_FONT_PX = 13;
export const PNG_EXPORT_GRID_OPACITY_DARK = 0.16;
export const PNG_EXPORT_GRID_OPACITY_LIGHT = 0.34;

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

/** Apply export-only visual polish to a cloned Recharts SVG before Canvg render. */
export function applyPngExportSvgPolish(
  svg: SVGSVGElement,
  options: { darkBackground?: boolean } = {}
): void {
  const dark = options.darkBackground ?? false;
  softenGridLines(svg, dark);
  polishRedundantHorizontalBarAxisTitles(svg);
  bumpAxisTypography(svg);
}
