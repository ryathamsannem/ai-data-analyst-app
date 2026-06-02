/**
 * Charts tab PNG — html2canvas cannot parse Tailwind v4 `color-mix()` / `color()` in app stylesheets.
 * Strategy: Canvg for the plot (sharp) + canvas 2D for title/chips (no html2canvas).
 */

import { Canvg } from "canvg";

const EXPORT_MIN_WIDTH = 720;
const PLOT_WIDTH_UTIL = 0.84;
const COMPOSITE_PAD_X = 14;
const COMPOSITE_PAD_Y = 10;
const HEADER_PLOT_GAP = 8;

const HEADER_PAD_Y = 10;
const GAP_AFTER_KICKER = 3;
const GAP_AFTER_TITLE = 4;
const GAP_AFTER_SUBTITLE = 5;
const GAP_AFTER_CHIPS = 6;
const CHIP_ROW_GAP = 5;
const CHIP_H = 22;
const CHIP_PAD_X = 7;
const CHIP_INNER_GAP = 4;
const REASON_LABEL_LINE_H = 12;
const REASON_LABEL_BODY_GAP = 4;
const REASON_LINE_H = 17;
const REASON_BOTTOM_PAD = 10;

type ExportPalette = {
  background: string;
  title: string;
  subtitle: string;
  kicker: string;
  chipBorder: string;
  chipLabel: string;
  chipValue: string;
  chipBg: string;
  reason: string;
};

function resolveExportPalette(backgroundColor?: string): ExportPalette {
  const dark =
    backgroundColor === "#0f172a" ||
    backgroundColor === "#0b1220" ||
    (typeof document !== "undefined" &&
      !backgroundColor &&
      document.documentElement.classList.contains("dark"));

  if (dark) {
    return {
      background: backgroundColor ?? "#0f172a",
      title: "#f8fafc",
      subtitle: "#94a3b8",
      kicker: "#64748b",
      chipBorder: "#334155",
      chipLabel: "#94a3b8",
      chipValue: "#e2e8f0",
      chipBg: "#1e293b",
      reason: "#94a3b8",
    };
  }
  return {
    background: backgroundColor ?? "#ffffff",
    title: "#0f172a",
    subtitle: "#475569",
    kicker: "#64748b",
    chipBorder: "#cbd5e1",
    chipLabel: "#475569",
    chipValue: "#0f172a",
    chipBg: "#f1f5f9",
    reason: "#475569",
  };
}

function resolveExportBackground(optionsBg?: string): string {
  if (optionsBg) return optionsBg;
  if (typeof document === "undefined") return "#ffffff";
  return document.documentElement.classList.contains("dark") ? "#0f172a" : "#ffffff";
}

function isUnsafeCssColor(value: string): boolean {
  return /color-mix\s*\(|color\s*\(/i.test(value);
}

function resolveCssColorForExport(value: string): string {
  const v = value.trim();
  if (!v || v === "none" || v === "transparent") return v;
  if (!isUnsafeCssColor(v)) return v;

  if (typeof document === "undefined") return "#334155";

  const probe = document.createElement("span");
  probe.style.cssText =
    "position:fixed;left:-9999px;top:0;visibility:hidden;pointer-events:none;";
  probe.style.color = v;
  document.body.appendChild(probe);
  const resolved = window.getComputedStyle(probe).color;
  probe.remove();
  if (resolved && !isUnsafeCssColor(resolved)) return resolved;
  return "#334155";
}

function resolvePlotRoot(container: HTMLElement): HTMLElement {
  const selectors = [
    ".charts-tab-viz-plot-stage .recharts-responsive-container",
    ".charts-tab-viz-plot-stage .recharts-wrapper",
    ".ai-insights-viz-plot .recharts-responsive-container",
    ".recharts-responsive-container",
    ".recharts-wrapper",
  ];
  for (const sel of selectors) {
    const el = container.querySelector(sel);
    if (el instanceof HTMLElement) return el;
  }
  const plotStage = container.querySelector(".charts-tab-viz-plot-stage");
  if (plotStage instanceof HTMLElement) return plotStage;
  return container;
}

function findPrimaryChartSvg(root: HTMLElement): SVGSVGElement | null {
  const svgs = [...root.querySelectorAll("svg")].filter(
    (s): s is SVGSVGElement => s instanceof SVGSVGElement
  );
  if (!svgs.length) return null;
  let best = svgs[0]!;
  let bestArea = 0;
  for (const svg of svgs) {
    const r = svg.getBoundingClientRect();
    const area = r.width * r.height;
    if (area > bestArea) {
      bestArea = area;
      best = svg;
    }
  }
  return bestArea > 4 ? best : svgs[0] ?? null;
}

function cloneSvgWithInlineStyles(source: SVGSVGElement): SVGSVGElement {
  const clone = source.cloneNode(true) as SVGSVGElement;
  const tagSel = "path,rect,circle,line,text,polygon,polyline,g";
  const srcEls = source.querySelectorAll(tagSel);
  const cloneEls = clone.querySelectorAll(tagSel);
  cloneEls.forEach((el, i) => {
    const src = srcEls[i];
    if (!src) return;
    const cs = window.getComputedStyle(src);
    const fill = cs.fill;
    const stroke = cs.stroke;
    if (fill && fill !== "none" && !fill.includes("rgba(0, 0, 0, 0)")) {
      el.setAttribute("fill", resolveCssColorForExport(fill));
    }
    if (stroke && stroke !== "none") {
      el.setAttribute("stroke", resolveCssColorForExport(stroke));
    }
    const sw = cs.strokeWidth;
    if (sw && sw !== "0px") el.setAttribute("stroke-width", sw);
    if (el.tagName === "text") {
      const col = cs.fill || cs.color;
      if (col) el.setAttribute("fill", resolveCssColorForExport(col));
      const fs = cs.fontSize;
      if (fs) el.setAttribute("font-size", fs);
      const ff = cs.fontFamily;
      if (ff) el.setAttribute("font-family", ff);
    }
  });
  return clone;
}

function tightenSvgViewBox(
  clone: SVGSVGElement,
  fallbackWidth: number,
  fallbackHeight: number
): { width: number; height: number } {
  const mount = document.createElement("div");
  mount.style.cssText =
    "position:fixed;left:-9999px;top:0;visibility:hidden;pointer-events:none;overflow:visible;";
  document.body.appendChild(mount);
  mount.appendChild(clone);
  let width = fallbackWidth;
  let height = fallbackHeight;
  try {
    const bbox = clone.getBBox();
    if (bbox.width > 12 && bbox.height > 12) {
      const pad = 6;
      const x = bbox.x - pad;
      const y = bbox.y - pad;
      const w = bbox.width + pad * 2;
      const h = bbox.height + pad * 2;
      clone.setAttribute("viewBox", `${x} ${y} ${w} ${h}`);
      width = Math.max(1, Math.round(w));
      height = Math.max(1, Math.round(h));
    }
  } catch {
    // keep fallback viewBox
  } finally {
    mount.remove();
  }
  return { width, height };
}

async function renderPlotSvgToPng(
  container: HTMLElement,
  scale: number,
  targetPlotWidth: number | undefined,
  plotBackground: string
): Promise<{ dataUrl: string; width: number; height: number } | null> {
  const plotRoot = resolvePlotRoot(container);
  const svg = findPrimaryChartSvg(plotRoot);
  if (!svg) return null;

  const rect = svg.getBoundingClientRect();
  let width = Math.max(1, Math.round(rect.width));
  let height = Math.max(1, Math.round(rect.height));
  if (width <= 2 || height <= 2) {
    const pr = plotRoot.getBoundingClientRect();
    width = Math.max(pr.width || plotRoot.clientWidth || 720, 1);
    height = Math.max(pr.height || plotRoot.clientHeight || 320, 1);
  }

  const plotBox = plotRoot.getBoundingClientRect();
  if (width < 320 && plotBox.width > width) {
    width = Math.max(width, Math.round(Math.min(plotBox.width, 960)));
    height = Math.max(height, Math.round(Math.min(plotBox.height, 540)));
  }

  const clone = cloneSvgWithInlineStyles(svg);
  const tightened = tightenSvgViewBox(clone, width, height);
  width = tightened.width;
  height = tightened.height;

  if (targetPlotWidth && targetPlotWidth > width) {
    const boost = Math.min(targetPlotWidth / width, 1.12);
    width = Math.round(width * boost);
    height = Math.round(height * boost);
  }

  clone.setAttribute("width", String(width));
  clone.setAttribute("height", String(height));
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  if (!clone.getAttribute("viewBox")) {
    clone.setAttribute("viewBox", `0 0 ${width} ${height}`);
  }
  clone.setAttribute("preserveAspectRatio", "xMidYMid meet");
  clone.setAttribute("overflow", "visible");

  const svgString = new XMLSerializer().serializeToString(clone);
  const canvas = document.createElement("canvas");
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = plotBackground;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(scale, 0, 0, scale, 0, 0);

  const v = await Canvg.fromString(ctx, svgString);
  await v.render();
  return {
    dataUrl: canvas.toDataURL("image/png"),
    width,
    height,
  };
}

type ExportChip = { label: string; value: string; mono?: boolean };

type ExportReasonBlock = {
  label: string;
  body: string;
};

function parseReasonFromNote(note: Element | null): ExportReasonBlock | null {
  if (!note) return null;

  const spans = [...note.querySelectorAll(":scope > span")];
  let label = spans[0]?.textContent?.trim() ?? "";
  let body = spans[1]?.textContent?.trim() ?? "";

  if (!body) {
    const raw = note.textContent?.trim().replace(/\s+/g, " ") ?? "";
    if (!raw) return null;
    const prefix = raw.match(/^why this chart\s*(?:[·•:—-]\s*)?/i);
    if (prefix) {
      label = label || "Why this chart";
      body = raw.slice(prefix[0].length).trim();
    } else {
      body = raw;
    }
  }

  if (!label && body) label = "Why this chart";
  if (!body) return null;

  return { label, body };
}

function extractHeaderContent(header: HTMLElement): {
  kicker: string;
  title: string;
  subtitle: string;
  chips: ExportChip[];
  reason: ExportReasonBlock | null;
} {
  const kicker =
    header.querySelector("[class*='viz-kicker']")?.textContent?.trim() ?? "";
  const title = header.querySelector("h3")?.textContent?.trim() ?? "";
  const subtitle =
    header.querySelector("[class*='viz-subtitle']")?.textContent?.trim() ?? "";

  const chips: ExportChip[] = [];
  const chipsRow = header.querySelector(
    "[class*='viz-chips'] > div, [class*='VizChips'] > div"
  );
  if (chipsRow) {
    chipsRow.querySelectorAll(":scope > span").forEach((span) => {
      const parts = [...span.querySelectorAll(":scope > span")];
      if (span.classList.contains("items-center") && parts.length >= 2) {
        chips.push({
          label: parts[0]?.textContent?.trim() ?? "",
          value: parts[1]?.textContent?.trim() ?? "",
        });
        return;
      }
      const text = span.textContent?.trim();
      if (text) chips.push({ label: "", value: text, mono: true });
    });
  }

  const reason = parseReasonFromNote(header.querySelector("[role='note']"));

  return { kicker, title, subtitle, chips, reason };
}

function measureTextWidth(
  ctx: CanvasRenderingContext2D,
  text: string,
  font: string
): number {
  ctx.font = font;
  return ctx.measureText(text).width;
}

function wrapTextLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  font: string
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const lines: string[] = [];
  let line = words[0]!;
  for (let i = 1; i < words.length; i++) {
    const next = `${line} ${words[i]}`;
    if (measureTextWidth(ctx, next, font) <= maxWidth) {
      line = next;
    } else {
      lines.push(line);
      line = words[i]!;
    }
  }
  lines.push(line);
  return lines;
}

function measureChipWidth(
  ctx: CanvasRenderingContext2D,
  chip: ExportChip,
  chipLabelFont: string,
  chipValueFont: string
): number {
  if (chip.mono) {
    return measureTextWidth(ctx, chip.value, chipValueFont) + CHIP_PAD_X * 2 + 4;
  }
  return (
    measureTextWidth(ctx, chip.label, chipLabelFont) +
    measureTextWidth(ctx, chip.value, chipValueFont) +
    CHIP_PAD_X * 2 +
    CHIP_INNER_GAP +
    4
  );
}

function layoutChipRows(
  ctx: CanvasRenderingContext2D,
  chips: ExportChip[],
  innerW: number,
  chipLabelFont: string,
  chipValueFont: string
): { rows: ExportChip[][]; rowHeights: number[] } {
  if (!chips.length) return { rows: [], rowHeights: [] };

  const widths = chips.map((c) =>
    measureChipWidth(ctx, c, chipLabelFont, chipValueFont)
  );
  const totalOneRow =
    widths.reduce((a, b) => a + b, 0) + CHIP_ROW_GAP * (chips.length - 1);

  if (totalOneRow <= innerW) {
    return { rows: [chips], rowHeights: [CHIP_H] };
  }

  const rows: ExportChip[][] = [[]];
  const rowHeights: number[] = [CHIP_H];
  let rowW = 0;
  for (let i = 0; i < chips.length; i++) {
    const chip = chips[i]!;
    const w = widths[i]!;
    const currentRow = rows[rows.length - 1]!;
    const gap = currentRow.length > 0 ? CHIP_ROW_GAP : 0;
    if (currentRow.length > 0 && rowW + gap + w > innerW) {
      rows.push([chip]);
      rowHeights.push(CHIP_H);
      rowW = w;
    } else {
      currentRow.push(chip);
      rowW += gap + w;
    }
  }
  return { rows, rowHeights };
}

type HeaderLayout = {
  exportWidth: number;
  contentH: number;
  innerW: number;
  reasonLabel: string;
  reasonBodyLines: string[];
  chipRows: ExportChip[][];
  chipRowHeights: number[];
};

function layoutHeaderExport(
  ctx: CanvasRenderingContext2D,
  content: ReturnType<typeof extractHeaderContent>,
  sourceWidth: number
): HeaderLayout {
  const exportWidth = Math.max(Math.round(sourceWidth), EXPORT_MIN_WIDTH);
  const innerW = exportWidth - COMPOSITE_PAD_X * 2;

  const fontFamily =
    'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  const kickerFont = `600 10px ${fontFamily}`;
  const titleFont = `600 18px ${fontFamily}`;
  const subtitleFont = `400 13px ${fontFamily}`;
  const chipLabelFont = `600 10px ${fontFamily}`;
  const chipValueFont = `500 11px ${fontFamily}`;
  const reasonFont = `400 12px ${fontFamily}`;

  const { rows: chipRows, rowHeights } = layoutChipRows(
    ctx,
    content.chips,
    innerW,
    chipLabelFont,
    chipValueFont
  );

  const reasonLabel = content.reason?.label ?? "";
  const reasonBodyLines = content.reason?.body
    ? wrapTextLines(ctx, content.reason.body, innerW - 4, reasonFont)
    : [];

  let contentH = HEADER_PAD_Y;
  if (content.kicker) contentH += 12 + GAP_AFTER_KICKER;
  if (content.title) contentH += 20 + GAP_AFTER_TITLE;
  if (content.subtitle) contentH += 16 + GAP_AFTER_SUBTITLE;

  if (chipRows.length) {
    contentH += rowHeights.reduce((a, h) => a + h, 0);
    contentH += CHIP_ROW_GAP * Math.max(0, chipRows.length - 1);
    contentH += GAP_AFTER_CHIPS;
  }

  if (reasonLabel || reasonBodyLines.length) {
    if (reasonLabel) {
      contentH += REASON_LABEL_LINE_H + REASON_LABEL_BODY_GAP;
    }
    contentH += reasonBodyLines.length * REASON_LINE_H;
    contentH += REASON_BOTTOM_PAD;
  }

  contentH += HEADER_PAD_Y;

  return {
    exportWidth,
    contentH,
    innerW,
    reasonLabel,
    reasonBodyLines,
    chipRows,
    chipRowHeights: rowHeights,
  };
}

function renderHeaderChromeToPng(
  sourceRoot: HTMLElement,
  scale: number,
  palette: ExportPalette
): { dataUrl: string; width: number; height: number } | null {
  const header = sourceRoot.querySelector(".charts-tab-preview-header-sticky");
  if (!(header instanceof HTMLElement)) return null;

  const content = extractHeaderContent(header);
  if (!content.title && !content.chips.length && !content.reason) return null;

  const fontFamily =
    'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  const kickerFont = `600 10px ${fontFamily}`;
  const titleFont = `600 18px ${fontFamily}`;
  const subtitleFont = `400 13px ${fontFamily}`;
  const chipLabelFont = `600 10px ${fontFamily}`;
  const chipValueFont = `500 11px ${fontFamily}`;
  const reasonLabelFont = `600 10px ${fontFamily}`;
  const reasonFont = `400 12px ${fontFamily}`;

  const probe = document.createElement("canvas");
  const pctx = probe.getContext("2d");
  if (!pctx) return null;

  const layout = layoutHeaderExport(
    pctx,
    content,
    sourceRoot.getBoundingClientRect().width
  );

  const canvas = document.createElement("canvas");
  canvas.width = layout.exportWidth * scale;
  canvas.height = Math.max(72, layout.contentH) * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.scale(scale, scale);
  ctx.fillStyle = palette.background;
  ctx.fillRect(0, 0, layout.exportWidth, layout.contentH);

  let y = HEADER_PAD_Y;
  const centerX = layout.exportWidth / 2;

  if (content.kicker) {
    ctx.font = kickerFont;
    ctx.fillStyle = palette.kicker;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(content.kicker.toUpperCase(), centerX, y);
    y += 12 + GAP_AFTER_KICKER;
  }

  if (content.title) {
    ctx.font = titleFont;
    ctx.fillStyle = palette.title;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(content.title, centerX, y);
    y += 20 + GAP_AFTER_TITLE;
  }

  if (content.subtitle) {
    ctx.font = subtitleFont;
    ctx.fillStyle = palette.subtitle;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(content.subtitle, centerX, y);
    y += 16 + GAP_AFTER_SUBTITLE;
  }

  for (let ri = 0; ri < layout.chipRows.length; ri++) {
    const row = layout.chipRows[ri]!;
    const chipWidths = row.map((chip) =>
      measureChipWidth(ctx, chip, chipLabelFont, chipValueFont)
    );
    const totalW =
      chipWidths.reduce((a, b) => a + b, 0) + CHIP_ROW_GAP * (row.length - 1);
    let x = centerX - totalW / 2;
    for (let i = 0; i < row.length; i++) {
      const chip = row[i]!;
      const w = chipWidths[i]!;
      ctx.fillStyle = palette.chipBg;
      ctx.strokeStyle = palette.chipBorder;
      ctx.lineWidth = 1;
      roundRect(ctx, x, y, w, CHIP_H, 6);
      ctx.fill();
      ctx.stroke();

      let tx = x + CHIP_PAD_X;
      const ty = y + (CHIP_H - 11) / 2;
      if (chip.label && !chip.mono) {
        ctx.font = chipLabelFont;
        ctx.fillStyle = palette.chipLabel;
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        ctx.fillText(chip.label, tx, ty);
        tx += measureTextWidth(ctx, chip.label, chipLabelFont) + CHIP_INNER_GAP;
      }
      ctx.font = chipValueFont;
      ctx.fillStyle = palette.chipValue;
      ctx.textBaseline = "top";
      ctx.fillText(chip.value, tx, ty);
      x += w + CHIP_ROW_GAP;
    }
    y += layout.chipRowHeights[ri] ?? CHIP_H;
    if (ri < layout.chipRows.length - 1) y += CHIP_ROW_GAP;
  }

  if (layout.chipRows.length) y += GAP_AFTER_CHIPS;

  if (layout.reasonLabel || layout.reasonBodyLines.length) {
    ctx.textAlign = "center";
    ctx.textBaseline = "top";

    if (layout.reasonLabel) {
      ctx.font = reasonLabelFont;
      ctx.fillStyle = palette.kicker;
      ctx.fillText(layout.reasonLabel.toUpperCase(), centerX, y);
      y += REASON_LABEL_LINE_H + REASON_LABEL_BODY_GAP;
    }

    ctx.font = reasonFont;
    ctx.fillStyle = palette.reason;
    for (const line of layout.reasonBodyLines) {
      ctx.fillText(line, centerX, y);
      y += REASON_LINE_H;
    }
    y += REASON_BOTTOM_PAD;
  }

  return {
    dataUrl: canvas.toDataURL("image/png"),
    width: layout.exportWidth,
    height: Math.max(1, Math.round(layout.contentH)),
  };
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load capture image."));
    img.src = dataUrl;
  });
}

async function compositeExportPng(
  header: { dataUrl: string; width: number; height: number } | null,
  plot: { dataUrl: string; width: number; height: number },
  scale: number,
  palette: ExportPalette
): Promise<{ dataUrl: string; width: number; height: number }> {
  const plotImg = await loadImage(plot.dataUrl);
  const headerImg = header ? await loadImage(header.dataUrl) : null;

  const headerW = headerImg ? headerImg.naturalWidth : 0;
  const headerH = headerImg ? headerImg.naturalHeight : 0;

  const outW = Math.max(
    plotImg.naturalWidth,
    headerW,
    Math.round((header?.width ?? plot.width) * scale)
  );

  const innerW = outW - COMPOSITE_PAD_X * 2;
  const targetPlotW = Math.round(innerW * PLOT_WIDTH_UTIL);
  const plotNaturalW = plotImg.naturalWidth;
  const plotNaturalH = plotImg.naturalHeight;
  const plotScale = targetPlotW / plotNaturalW;
  const plotW = Math.round(plotNaturalW * plotScale);
  const plotH = Math.round(plotNaturalH * plotScale);

  const outH =
    COMPOSITE_PAD_Y +
    headerH +
    (headerH > 0 ? HEADER_PLOT_GAP : 0) +
    plotH +
    COMPOSITE_PAD_Y;

  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Unable to create export canvas.");

  ctx.fillStyle = palette.background;
  ctx.fillRect(0, 0, outW, outH);

  let y = COMPOSITE_PAD_Y;
  if (headerImg && headerH > 0) {
    const hx = Math.round((outW - headerW) / 2);
    ctx.drawImage(headerImg, hx, y, headerW, headerH);
    y += headerH + HEADER_PLOT_GAP;
  }

  const px = Math.round((outW - plotW) / 2);
  ctx.drawImage(plotImg, px, y, plotW, plotH);

  return {
    dataUrl: canvas.toDataURL("image/png"),
    width: Math.max(1, Math.round(outW / scale)),
    height: Math.max(1, Math.round(outH / scale)),
  };
}

export type CaptureElementPngOptions = {
  scale?: number;
  backgroundColor?: string;
  ignoreElement?: (el: Element) => boolean;
};

/**
 * Charts tab export: title + chips (canvas) + chart (Canvg), presentation scale.
 */
export async function captureElementToPng(
  sourceRoot: HTMLElement,
  options: CaptureElementPngOptions = {}
): Promise<{ dataUrl: string; width: number; height: number }> {
  const scale = options.scale ?? 3;
  const backgroundColor = resolveExportBackground(options.backgroundColor);
  const palette = resolveExportPalette(backgroundColor);

  const exportWidth = Math.max(
    Math.round(sourceRoot.getBoundingClientRect().width),
    EXPORT_MIN_WIDTH
  );
  const targetPlotWidth = Math.round(
    (exportWidth - COMPOSITE_PAD_X * 2) * PLOT_WIDTH_UTIL
  );

  const plot = await renderPlotSvgToPng(
    sourceRoot,
    scale,
    targetPlotWidth,
    palette.background
  );
  if (!plot?.dataUrl) {
    throw new Error("Chart is not available to download.");
  }

  let header: { dataUrl: string; width: number; height: number } | null = null;
  try {
    header = renderHeaderChromeToPng(sourceRoot, scale, palette);
  } catch (err) {
    console.warn("Charts tab header PNG capture skipped:", err);
  }

  return compositeExportPng(header, plot, scale, palette);
}
