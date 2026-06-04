/**
 * Relationship / correlation scatter — executive insight cards from API metadata.
 */

export type RelationshipExecutiveCard = {
  key: string;
  title: string;
  value: string;
  hint?: string;
  dotClass: string;
};

export type RelationshipInsightsPayload = {
  pearson?: number | null;
  spearman?: number | null;
  direction?: string | null;
  correlationClass?: string | null;
  correlationLabel?: string | null;
  correlationStrength?: string | null;
  qualitativeOnly?: boolean;
  summaryLine?: string | null;
  measureLabel?: string | null;
  sampleSize?: number | null;
  marginByCategory?: {
    dimensionColumn?: string;
    highest?: { label?: string; marginPct?: number };
    lowest?: { label?: string; marginPct?: number };
  } | null;
};

export function parseRelationshipInsights(
  raw: unknown
): RelationshipInsightsPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const marginRaw = o.marginByCategory;
  let marginByCategory: RelationshipInsightsPayload["marginByCategory"] = null;
  if (marginRaw && typeof marginRaw === "object") {
    const m = marginRaw as Record<string, unknown>;
    const hi = m.highest as Record<string, unknown> | undefined;
    const lo = m.lowest as Record<string, unknown> | undefined;
    marginByCategory = {
      dimensionColumn:
        typeof m.dimensionColumn === "string" ? m.dimensionColumn : undefined,
      highest: hi
        ? {
            label: typeof hi.label === "string" ? hi.label : undefined,
            marginPct: Number.isFinite(Number(hi.marginPct))
              ? Number(hi.marginPct)
              : undefined,
          }
        : undefined,
      lowest: lo
        ? {
            label: typeof lo.label === "string" ? lo.label : undefined,
            marginPct: Number.isFinite(Number(lo.marginPct))
              ? Number(lo.marginPct)
              : undefined,
          }
        : undefined,
    };
  }
  const pearson = Number(o.pearson);
  const spearman = Number(o.spearman);
  return {
    pearson: Number.isFinite(pearson) ? pearson : null,
    spearman: Number.isFinite(spearman) ? spearman : null,
    direction: typeof o.direction === "string" ? o.direction : null,
    correlationClass:
      typeof o.correlationClass === "string" ? o.correlationClass : null,
    correlationLabel:
      typeof o.correlationLabel === "string" ? o.correlationLabel : null,
    correlationStrength:
      typeof o.correlationStrength === "string" ? o.correlationStrength : null,
    qualitativeOnly: Boolean(o.qualitativeOnly),
    summaryLine: typeof o.summaryLine === "string" ? o.summaryLine : null,
    measureLabel:
      typeof o.measureLabel === "string" ? o.measureLabel.trim() : null,
    sampleSize: Number.isFinite(Number(o.sampleSize))
      ? Math.round(Number(o.sampleSize))
      : null,
    marginByCategory,
  };
}

export function buildRelationshipExecutiveCards(
  ri: RelationshipInsightsPayload,
  xAxisLabel: string,
  yAxisLabel: string,
  pointCount: number
): RelationshipExecutiveCard[] {
  const stripes = [
    "bg-violet-500",
    "bg-emerald-500",
    "bg-rose-500",
    "bg-sky-500",
  ] as const;
  const cards: RelationshipExecutiveCard[] = [];

  if (!ri.qualitativeOnly && ri.pearson != null && Number.isFinite(ri.pearson)) {
    const r = ri.pearson;
    cards.push({
      key: "rel-pearson",
      title: "Pearson correlation",
      value: (r > 0 ? "+" : "") + r.toFixed(2),
      hint: `${xAxisLabel} vs ${yAxisLabel}`,
      dotClass: stripes[0],
    });
  }

  if (
    !ri.qualitativeOnly &&
    ri.correlationStrength?.trim() &&
    ri.correlationStrength.trim() !== "Unknown"
  ) {
    cards.push({
      key: "rel-strength-band",
      title: "Relationship strength",
      value: ri.correlationStrength.trim(),
      hint: ri.correlationLabel?.trim() || undefined,
      dotClass: stripes[2],
    });
  }

  const dir = ri.direction?.trim().toLowerCase();
  if (!ri.qualitativeOnly && dir && dir !== "unknown") {
    cards.push({
      key: "rel-direction",
      title: "Direction",
      value: dir.charAt(0).toUpperCase() + dir.slice(1),
      hint: ri.correlationLabel?.trim() || undefined,
      dotClass: stripes[3],
    });
  }

  if (!ri.qualitativeOnly && ri.spearman != null && Number.isFinite(ri.spearman)) {
    const rho = ri.spearman;
    const interp = ri.correlationStrength?.trim();
    cards.push({
      key: "rel-spearman",
      title: "Spearman ρ",
      value: (rho > 0 ? "+" : "") + rho.toFixed(2),
      hint: interp
        ? `Interpretation: ${interp}`
        : `Spearman · ${xAxisLabel} vs ${yAxisLabel}`,
      dotClass: stripes[1],
    });
  }

  if (
    !ri.qualitativeOnly &&
    ri.correlationStrength?.trim() &&
    ri.pearson == null &&
    ri.spearman == null
  ) {
    cards.push({
      key: "rel-strength",
      title: "Interpretation",
      value: ri.correlationStrength.trim(),
      hint: ri.correlationLabel?.trim() || undefined,
      dotClass: stripes[0],
    });
  }

  const margin = ri.marginByCategory;
  if (margin?.highest?.label) {
    cards.push({
      key: "rel-margin-hi",
      title: "Highest profit margin",
      value: margin.highest.label,
      hint:
        margin.highest.marginPct != null
          ? `${margin.highest.marginPct}%`
          : undefined,
      dotClass: stripes[2],
    });
  }
  if (margin?.lowest?.label) {
    cards.push({
      key: "rel-margin-lo",
      title: "Lowest profit margin",
      value: margin.lowest.label,
      hint:
        margin.lowest.marginPct != null
          ? `${margin.lowest.marginPct}%`
          : undefined,
      dotClass: stripes[3],
    });
  }

  const n = ri.sampleSize ?? pointCount;
  cards.push({
    key: "rel-n",
    title: "Sample size",
    value: String(n),
    hint: ri.qualitativeOnly
      ? "Insufficient joint pairs for numeric correlation"
      : "Rows with both metrics populated",
    dotClass: stripes[0],
  });

  return cards.slice(0, 4);
}
