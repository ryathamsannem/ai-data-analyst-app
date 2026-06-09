/**
 * Shared dynamic chart layout for Recharts — margins and axis widths from text metrics.
 * Used by main charts, AI Insights, PDF/PNG capture (same DOM), and auto-dashboard mini charts.
 *
 * `chartLayoutMode`:
 * - **compact** (Overview cards, narrow insight column): hide value-axis titles; no ellipsis;
 *   tighter margins; prefer angled X ticks when categories crowd.
 * - **full** (Charts tab, exports): show value-axis title only when it fits along the axis
 *   (rotated span vs plot height); otherwise hide — never ellipsis on axis titles.
 */

export type ChartLayoutMode = "compact" | "full" | "export";

/**
 * Recharts uses margin-left for the Y-axis strip and margin-right separately.
 * Equal left/right outer margins keep the cartesian plot area horizontally centered
 * in the ResponsiveContainer (matches centered titles above the chart).
 */
export function balanceVerticalOuterMargins(args: {
  marginLeft: number;
  chartLayoutMode?: ChartLayoutMode;
  /** Floor for right margin when left is small (legend reserve is rare on our charts). */
  minRight?: number;
}): { marginLeft: number; marginRight: number } {
  const ml = Math.max(0, args.marginLeft);
  const mode = args.chartLayoutMode ?? "full";
  const floor =
    args.minRight ??
    (mode === "compact" ? 6 : mode === "export" ? 12 : 10);
  /**
   * Compact / overview cards: mirror left padding on the right so the plot stays visually
   * centered under short titles.
   *
   * Full / export: mirroring `marginLeft` onto `marginRight` doubled horizontal padding and
   * crushed cartesian width (AI Insights + PDF capture) while the Y-axis already reserves
   * space via `YAxis.width`. Keep a modest right gutter only.
   */
  if (mode === "compact") {
    return { marginLeft: ml, marginRight: Math.max(floor, ml) };
  }
  const capRight = mode === "export" ? 26 : 24;
  return {
    marginLeft: ml,
    marginRight: Math.max(floor, Math.min(capRight, Math.ceil(ml * 0.18 + 8))),
  };
}

/**
 * Horizontal bar: large margin-left for the category (Y) axis.
 *
 * Compact: mirror left onto the right so the bar band stays centered in narrow cards.
 * Full / export: mirroring crushed the numeric X-axis width (AI Insights + PDF); keep a
 * modest right gutter so value ticks and bars can use the card width.
 */
export function balanceHorizontalOuterMargins(args: {
  marginLeft: number;
  chartLayoutMode?: ChartLayoutMode;
  minRight?: number;
}): { marginLeft: number; marginRight: number } {
  const ml = Math.max(0, args.marginLeft);
  const mode = args.chartLayoutMode ?? "full";
  const floor =
    args.minRight ??
    (mode === "compact" ? 6 : mode === "export" ? 14 : 12);
  const capRight = mode === "export" ? 28 : mode === "compact" ? 20 : 24;
  return {
    marginLeft: ml,
    marginRight: Math.max(floor, Math.min(capRight, Math.ceil(ml * 0.12 + 8))),
  };
}

const AXIS_TICK_FONT_PX = 11;
const AXIS_TITLE_FONT_PX = 11;

/** Approximate rendered width for Latin UI text (conservative for layout). */
export function estimateTextWidthPx(
  text: string,
  fontSizePx: number,
  weight: "normal" | "semibold" = "normal"
): number {
  const s = String(text ?? "");
  if (!s) return 0;
  const w = weight === "semibold" ? 1.08 : 1;
  let acc = 0;
  for (const ch of s) {
    const code = ch.charCodeAt(0);
    if (ch === " " || ch === "\t") {
      acc += fontSizePx * 0.3 * w;
    } else if (".,:;|!".includes(ch)) {
      acc += fontSizePx * 0.24 * w;
    } else if ("il1".includes(ch) || code < 32) {
      acc += fontSizePx * 0.34 * w;
    } else if ("mwMW@%&".includes(ch) || (code >= 48 && code <= 57 && s.length > 6)) {
      acc += fontSizePx * 0.66 * w;
    } else {
      acc += fontSizePx * 0.58 * w;
    }
  }
  return Math.ceil(acc + 10);
}

export function collectSampleTickStrings(rows: { value: number; displayValue?: string }[]): string[] {
  const out: string[] = [];
  for (const r of rows) {
    const d = r.displayValue?.trim();
    out.push(d || String(r.value));
    if (out.length >= 32) break;
  }
  return out;
}

export function resolveLayoutMode(
  chartLayoutMode: ChartLayoutMode | undefined,
  compactLegacy: boolean | undefined
): ChartLayoutMode {
  if (chartLayoutMode) return chartLayoutMode;
  return compactLegacy ? "compact" : "full";
}

/** Word-wrap long category labels for horizontal-bar Y axes (multi-line ticks). */
export function wrapCategoryLabelLines(
  raw: string,
  options?: { maxCharsPerLine?: number; maxLines?: number }
): string[] {
  const maxChars = Math.max(8, options?.maxCharsPerLine ?? 20);
  const maxLines = Math.max(1, options?.maxLines ?? 3);
  const text = String(raw ?? "").replace(/\s+/g, " ").trim() || "—";
  if (text.length <= maxChars) return [text];

  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";

  const pushLine = (line: string) => {
    if (!line) return;
    if (lines.length < maxLines) lines.push(line);
  };

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxChars) {
      current = candidate;
      continue;
    }
    if (current) pushLine(current);
    if (word.length > maxChars) {
      let rest = word;
      while (rest.length > maxChars && lines.length < maxLines - 1) {
        pushLine(rest.slice(0, maxChars));
        rest = rest.slice(maxChars);
      }
      current = rest;
    } else {
      current = word;
    }
    if (lines.length >= maxLines) break;
  }
  if (lines.length < maxLines && current) pushLine(current);

  if (!lines.length) return [text.slice(0, maxChars)];
  if (lines.length > maxLines) {
    const trimmed = lines.slice(0, maxLines);
    const last = trimmed[maxLines - 1] ?? "";
    trimmed[maxLines - 1] =
      last.length > maxChars - 1 ? `${last.slice(0, maxChars - 2)}…` : `${last}…`;
    return trimmed;
  }
  const joined = lines.join("");
  if (joined.length < text.length && lines.length === maxLines) {
    const last = lines[maxLines - 1] ?? "";
    if (!last.endsWith("…") && last.length >= maxChars - 1) {
      lines[maxLines - 1] = `${last.slice(0, Math.max(1, maxChars - 2))}…`;
    }
  }
  return lines;
}

export type VerticalValueAxisLayout = {
  marginLeft: number;
  yAxisWidth: number;
  /** Empty in compact mode or when full mode cannot fit title without clipping. */
  valueAxisTitleDisplay: string;
  valueAxisTitleFull: string;
  /** When false, omit `YAxis` `label` entirely (compact / no room). */
  showValueAxisTitle: boolean;
};

/**
 * Vertical / line / area / stacked bar: value on Y.
 * Compact: no title, ticks only. Full: full title if it fits rotated along plot height; else hidden (no "…").
 */
export function computeVerticalValueAxisLayout(args: {
  valueAxisLabel: string;
  valueAxisMeasureLabel?: string;
  tickSampleStrings: string[];
  /** @deprecated prefer `chartLayoutMode` */
  compact?: boolean;
  chartLayoutMode?: ChartLayoutMode;
  tickFontSizePx?: number;
  titleFontSizePx?: number;
  plotInnerHeightPx?: number;
}): VerticalValueAxisLayout {
  const mode = resolveLayoutMode(args.chartLayoutMode, args.compact);
  const tickFs = args.tickFontSizePx ?? AXIS_TICK_FONT_PX;
  const titleFs = args.titleFontSizePx ?? AXIS_TITLE_FONT_PX;

  const tickWidths = args.tickSampleStrings.map((t) =>
    estimateTextWidthPx(t, tickFs, "normal")
  );
  const maxTickW = Math.max(
    tickFs * 4,
    ...tickWidths,
    estimateTextWidthPx("9,999,999.9", tickFs)
  );
  const tickCol = Math.ceil(maxTickW + (mode === "compact" ? 22 : 28));

  const compactStr = (args.valueAxisLabel || "").trim();
  const measureStr = (args.valueAxisMeasureLabel || "").trim();
  const baseFull =
    measureStr.length >= compactStr.length ? measureStr || compactStr : compactStr;
  const full = baseFull || "Value";

  const innerH =
    args.plotInnerHeightPx != null && args.plotInnerHeightPx > 40
      ? args.plotInnerHeightPx
      : mode === "full"
        ? 280
        : 160;

  const titleThickness = Math.ceil(titleFs * 1.55 + 12);
  let showValueAxisTitle = false;
  let display = "";

  if (mode === "compact") {
    showValueAxisTitle = false;
    display = "";
  } else {
    const maxAlongAxis = Math.max(80, Math.floor(innerH * 0.9));
    const titleW = estimateTextWidthPx(full, titleFs, "semibold");
    showValueAxisTitle = titleW <= maxAlongAxis;
    display = showValueAxisTitle ? full : "";
  }

  const titleBand = showValueAxisTitle ? titleThickness + 6 : 0;
  const yAxisWidth = Math.min(320, Math.max(52, tickCol + titleBand + 4));

  const outerPad = mode === "compact" ? 8 : 14;
  const marginLeft = Math.ceil(yAxisWidth + outerPad);

  return {
    marginLeft,
    yAxisWidth,
    valueAxisTitleDisplay: display,
    valueAxisTitleFull: full,
    showValueAxisTitle,
  };
}

/**
 * Bottom margin for charts with category labels on X (vertical bars, line, area).
 * Avoids double-counting with Recharts `XAxis.height` — keep moderate.
 */
export function computeCategoryAxisBottomMargin(args: {
  categoryTickStrings: string[];
  angled: boolean;
  tickFontSizePx?: number;
  chartLayoutMode?: ChartLayoutMode;
  compact?: boolean;
}): number {
  const mode = resolveLayoutMode(args.chartLayoutMode, args.compact);
  const fs = args.tickFontSizePx ?? AXIS_TICK_FONT_PX;
  const widths = args.categoryTickStrings.map((s) =>
    estimateTextWidthPx(String(s || "—"), fs, "normal")
  );
  const longest = Math.max(fs * 4, ...widths, estimateTextWidthPx("WWWWWW", fs));

  if (mode === "compact") {
    if (!args.angled) {
      return Math.min(44, Math.max(26, Math.ceil(longest * 0.08 + 22)));
    }
    return Math.min(58, Math.max(36, Math.ceil(longest * 0.28 + 26 + fs)));
  }

  if (!args.angled) {
    return Math.min(72, Math.max(30, Math.ceil(longest * 0.1 + 24)));
  }
  return Math.min(84, Math.max(40, Math.ceil(longest * 0.3 + 30 + fs)));
}

export type HorizontalBarAxisLayout = {
  marginLeft: number;
  marginBottom: number;
  categoryAxisWidth: number;
  valueAxisTitleDisplay: string;
  valueAxisTitleFull: string;
  showValueAxisTitle: boolean;
};

/**
 * Horizontal bar: categories on Y, value scale on X.
 * Compact: hide value title, small bottom margin. Full: show full title when it fits width; else hide.
 */
export function computeHorizontalBarAxisLayout(args: {
  categoryTickStrings: string[];
  valueAxisLabel: string;
  valueAxisFull?: string;
  categoryAxisLabel: string;
  /** @deprecated prefer `chartLayoutMode` */
  compact?: boolean;
  chartLayoutMode?: ChartLayoutMode;
  tickFontSizePx?: number;
  titleFontSizePx?: number;
  maxValueAxisTitleWidthPx?: number;
}): HorizontalBarAxisLayout {
  const mode = resolveLayoutMode(args.chartLayoutMode, args.compact);
  const tickFs = args.tickFontSizePx ?? AXIS_TICK_FONT_PX;
  const titleFs = args.titleFontSizePx ?? AXIS_TITLE_FONT_PX;

  const maxLineChars = mode === "compact" ? 16 : 22;
  const maxLines = mode === "compact" ? 2 : 3;
  const catWidths = args.categoryTickStrings.map((t) => {
    const lines = wrapCategoryLabelLines(String(t ?? ""), {
      maxCharsPerLine: maxLineChars,
      maxLines,
    });
    return Math.max(
      tickFs * 4,
      ...lines.map((line) => estimateTextWidthPx(line, tickFs, "normal"))
    );
  });
  const maxCatW = Math.max(tickFs * 4, ...catWidths, estimateTextWidthPx("WWWWWWWW", tickFs));

  const full = (args.valueAxisFull ?? args.valueAxisLabel).trim() || "Value";
  const maxTitleW = args.maxValueAxisTitleWidthPx ?? (mode === "compact" ? 160 : 420);

  let showValueAxisTitle = false;
  let display = "";
  if (mode === "compact") {
    showValueAxisTitle = false;
    display = "";
  } else {
    const w = estimateTextWidthPx(full, titleFs, "semibold");
    showValueAxisTitle = w <= maxTitleW;
    display = showValueAxisTitle ? full : "";
  }

  const dispW = display
    ? estimateTextWidthPx(display, titleFs, "semibold")
    : 0;

  const categoryAxisWidth = Math.min(
    mode === "compact" ? 200 : 420,
    Math.max(mode === "compact" ? 52 : 64, Math.ceil(maxCatW + (mode === "compact" ? 16 : 24)))
  );
  /** Category labels use `YAxis.width`; margin-left is only outer padding. */
  const marginLeft = mode === "compact" ? 10 : 14;

  const marginBottom = showValueAxisTitle
    ? Math.min(52, Math.max(28, Math.ceil(titleFs * 2.2 + dispW * 0.08 + 18)))
    : Math.min(32, Math.max(18, Math.ceil(titleFs * 1.6 + 10)));

  return {
    marginLeft,
    marginBottom,
    categoryAxisWidth,
    valueAxisTitleDisplay: display,
    valueAxisTitleFull: full,
    showValueAxisTitle,
  };
}

export type PieLegendLayout = {
  marginHorizontal: number;
  marginBottom: number;
};

export function computePieChartMargins(metricLabelShort: string): PieLegendLayout {
  const w = estimateTextWidthPx(metricLabelShort, AXIS_TICK_FONT_PX, "semibold");
  return {
    marginHorizontal: Math.min(52, Math.max(8, Math.ceil(10 + w * 0.05))),
    marginBottom: Math.min(60, Math.max(12, Math.ceil(12 + w * 0.08))),
  };
}

/** Used when fitting category ticks on X (vertical bars, line, area). */
export type VerticalCategoryAxisPlan = {
  /** When true, render as horizontal bar (same series) to avoid unreadable X ticks. */
  renderAsHorizontalBar: boolean;
  tickFontSizePx: number;
  angled: boolean;
  angleDeg: number;
  interval: number | "preserveStartEnd";
  /** Hint for Recharts `XAxis.height`. */
  xAxisHeightPx: number;
};

const CATEGORY_ANGLE_DEG = 32;

/**
 * Approximate inner plotting width after outer margins (viewport minus padding/sidebar).
 * Conservative so PDF/off-screen capture (~860px) and narrow panes don’t overestimate space.
 */
export function estimateCartesianPlotInnerWidthPx(args: {
  viewportWidthPx: number;
  marginLeftPx: number;
  marginRightPx: number;
  variant: "main" | "overview_half" | "insight_compact" | "insight_full";
}): number {
  const vw = Math.max(320, args.viewportWidthPx);
  const shell = 56;
  const maxContent = Math.min(1152, vw - shell);

  let columnBudget = maxContent - 40;
  if (args.variant === "overview_half") {
    columnBudget = Math.max(140, (maxContent - 56) / 2 - 36);
  } else if (args.variant === "insight_compact") {
    columnBudget = Math.max(176, maxContent * 0.5 - 52);
  } else if (args.variant === "insight_full") {
    /** Full-width AI Insight card — match usable width, not mirrored outer margins. */
    columnBudget = Math.max(480, maxContent - 28);
  }

  const rightReserve =
    args.variant === "insight_full"
      ? Math.min(Math.max(0, args.marginRightPx), 28)
      : Math.max(0, args.marginRightPx);
  const inner =
    columnBudget - Math.max(0, args.marginLeftPx) - rightReserve - 14;
  return Math.max(96, inner);
}

/**
 * Decide rotation / font shrink / horizontal-bar fallback for categorical X axes.
 * Does not depend on label strings matching any dataset — uses measured widths only.
 */
function maxLenChars(labels: string[]): number {
  let m = 0;
  for (const s of labels) {
    const L = String(s ?? "").length;
    if (L > m) m = L;
  }
  return m;
}

export function computeVerticalCategoryAxisPlan(args: {
  categoryLabels: string[];
  estimatedPlotInnerWidthPx: number;
  chartLayoutMode: ChartLayoutMode;
  /** Stacked vertical bars: rotate/shrink only — never flip orientation here. */
  disableHorizontalFallback?: boolean;
  /**
   * Absolute angle (deg) for crowded category ticks when angled. Default 32°; AI Insights
   * uses a gentler tilt so labels stay readable without excessive bottom margin.
   */
  categoryAngleDeg?: number;
  /**
   * When true, try rotated ticks before horizontal-only (reduces overlap on 5–8 category
   * AI Insight / full-width charts without inferring horizontal-bar chart type).
   */
  preferAngledCategoryTicks?: boolean;
}): VerticalCategoryAxisPlan {
  const labels = args.categoryLabels.map((s) => String(s ?? "—"));
  const n = Math.max(1, labels.length);
  const inner = Math.max(96, args.estimatedPlotInnerWidthPx);
  const slot = inner / n;

  const angleDegAbs = Math.min(
    40,
    Math.max(18, args.categoryAngleDeg ?? CATEGORY_ANGLE_DEG)
  );
  const rad = (angleDegAbs * Math.PI) / 180;
  const cosA = Math.cos(rad);
  const sinA = Math.sin(rad);

  const longestWidth = (fs: number) =>
    Math.max(
      fs * 3,
      ...labels.map((t) => estimateTextWidthPx(t, fs, "normal"))
    );

  const fitsHorizontal = (fs: number) => longestWidth(fs) <= slot * 0.88;

  const fitsAngled = (fs: number) => {
    const w = longestWidth(fs);
    const projected = w * cosA + fs * sinA * 1.65;
    return projected <= slot * 0.96;
  };

  type TryCfg = { fs: number; angled: boolean };
  const tries: TryCfg[] = args.preferAngledCategoryTicks
    ? [
        { fs: 11, angled: true },
        { fs: 10, angled: true },
        { fs: 9, angled: true },
        { fs: 11, angled: false },
        { fs: 10, angled: false },
        { fs: 9, angled: false },
      ]
    : [
        { fs: 11, angled: false },
        { fs: 10, angled: false },
        { fs: 9, angled: false },
        { fs: 11, angled: true },
        { fs: 10, angled: true },
        { fs: 9, angled: true },
      ];

  let tickFontSizePx = 9;
  let angled = true;
  let angleDeg = -angleDegAbs;
  let renderAsHorizontalBar = false;

  let found = false;
  for (const t of tries) {
    const ok = t.angled ? fitsAngled(t.fs) : fitsHorizontal(t.fs);
    if (ok) {
      tickFontSizePx = t.fs;
      angled = t.angled;
      angleDeg = t.angled ? -angleDegAbs : 0;
      found = true;
      break;
    }
  }

  if (!found && !args.disableHorizontalFallback) {
    /** Prefer vertical + angled ticks when categories are few and not overly long. */
    const crowded =
      n >= 9 || longestWidth(9) > slot * 0.95 || maxLenChars(labels) > 18;
    if (crowded) {
      renderAsHorizontalBar = true;
      angled = false;
      angleDeg = 0;
      tickFontSizePx = 10;
    } else {
      tickFontSizePx = 9;
      angled = true;
      angleDeg = -angleDegAbs;
      renderAsHorizontalBar = false;
    }
  } else if (!found) {
    tickFontSizePx = 9;
    angled = true;
    angleDeg = -angleDegAbs;
  }

  const lw = longestWidth(tickFontSizePx);
  const xAxisHeightPx = renderAsHorizontalBar
    ? 36
    : angled
      ? Math.min(
          88,
          Math.max(40, Math.ceil(lw * 0.38 + tickFontSizePx * 2.8))
        )
      : Math.min(46, Math.max(26, Math.ceil(tickFontSizePx + 20)));

  const interval: number | "preserveStartEnd" =
    n > 22 ? "preserveStartEnd" : n > 16 ? "preserveStartEnd" : 0;

  return {
    renderAsHorizontalBar,
    tickFontSizePx,
    angled: angled && !renderAsHorizontalBar,
    angleDeg: renderAsHorizontalBar ? 0 : angleDeg,
    interval,
    xAxisHeightPx,
  };
}
