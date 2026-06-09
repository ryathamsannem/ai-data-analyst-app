/** Pure helpers for PNG/SVG export text contrast (unit-tested). */

export type Rgb = { r: number; g: number; b: number };

export function parseCssRgb(color: string): Rgb | null {
  const v = color.trim();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(v);
  if (hex) {
    const raw = hex[1]!;
    if (raw.length === 3) {
      return {
        r: parseInt(raw[0]! + raw[0]!, 16),
        g: parseInt(raw[1]! + raw[1]!, 16),
        b: parseInt(raw[2]! + raw[2]!, 16),
      };
    }
    return {
      r: parseInt(raw.slice(0, 2), 16),
      g: parseInt(raw.slice(2, 4), 16),
      b: parseInt(raw.slice(4, 6), 16),
    };
  }

  const rgb =
    /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i.exec(v);
  if (rgb) {
    return {
      r: Math.round(Number(rgb[1])),
      g: Math.round(Number(rgb[2])),
      b: Math.round(Number(rgb[3])),
    };
  }
  return null;
}

export function relativeLuminance({ r, g, b }: Rgb): number {
  const toLin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * toLin(r) + 0.7152 * toLin(g) + 0.0722 * toLin(b);
}

export function ensureReadableExportTextFill(
  fill: string,
  background: string,
  options?: { lightText?: string; darkText?: string }
): string {
  const textRgb = parseCssRgb(fill);
  const bgRgb = parseCssRgb(background);
  if (!textRgb || !bgRgb) return fill;

  const textLum = relativeLuminance(textRgb);
  const bgLum = relativeLuminance(bgRgb);
  const lightText = options?.lightText ?? "#94a3b8";
  const darkText = options?.darkText ?? "#334155";

  if (bgLum < 0.2 && textLum < 0.22) return lightText;
  if (bgLum > 0.85 && textLum > 0.82) return darkText;
  return fill;
}
