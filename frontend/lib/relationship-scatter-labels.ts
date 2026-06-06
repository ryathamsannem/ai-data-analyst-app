/**
 * Labels and guards for relationship / correlation scatter charts.
 */

import { polishMetricDisplay } from "@/lib/analytics-metadata";

/** Row-index or placeholder point labels — not real category names. */
export function isSyntheticScatterPointLabel(name: string): boolean {
  const t = (name ?? "").trim();
  if (!t) return true;
  if (/^point\s*\d+$/i.test(t)) return true;
  if (/^row\s*\d+$/i.test(t)) return true;
  if (/^[•·:\-–—]?\s*\d+$/u.test(t)) return true;
  if (/^observation\s*\d+$/i.test(t)) return true;
  return false;
}

export function looksLikeDuplicatedRelationshipTitle(title: string): boolean {
  const t = title.replace(/\s+/g, " ").trim();
  if (!t) return false;
  const vsCount = (t.match(/\bvs\.?\b/gi) ?? []).length;
  if (vsCount >= 2) return true;
  if (/^total\s+.+\bvs\b/i.test(t)) return true;
  return false;
}

/** Title-case a short metric phrase; split on "vs" for two-metric labels. */
export function titleCaseRelationshipPhrase(phrase: string): string {
  const t = phrase.replace(/\s+/g, " ").trim();
  if (!t) return t;
  const vsSplit = t.split(/\s+vs\.?\s+/i);
  if (vsSplit.length === 2) {
    const a = polishMetricDisplay(vsSplit[0]!.trim()) || "X";
    const b = polishMetricDisplay(vsSplit[1]!.trim()) || "Y";
    return `${a} vs ${b}`;
  }
  return polishMetricDisplay(t);
}

export function buildRelationshipMeasureLabel(
  xLabel: string,
  yLabel: string
): string {
  const x = polishMetricDisplay(xLabel.trim()) || "X";
  const y = polishMetricDisplay(yLabel.trim()) || "Y";
  return `${x} vs ${y}`;
}

/**
 * Strip row-index / internal scatter labels from LLM narrative shown in the UI.
 */
export function sanitizeRelationshipUserFacingText(text: string): string {
  if (!text?.trim()) return text ?? "";
  let t = text.replace(/\u00a0/g, " ");

  t = t.replace(/\bscatter\s+(\w+)/gi, (_, m: string) =>
    polishMetricDisplay(String(m))
  );

  t = t.replace(
    /\bPoint\s+\d+\s*\(\s*revenue\s+([\d,.]+)\s*,\s*profit\s+([\d,.]+)\s*\)/gi,
    "an observation (revenue $1, profit $2)"
  );
  t = t.replace(
    /\bPoint\s+\d+\s*\([^)]+\)/gi,
    "one observation in the sample"
  );
  t = t.replace(/\bPoint\s+(\d+)\b/gi, "one observation");
  t = t.replace(/\brow\s+(\d+)\b/gi, "one observation");
  t = t.replace(/\bcategory\s*:\s*\d+\b/gi, "one category");

  t = t.replace(
    /correlation could not be computed numerically\.?/gi,
    ""
  );
  t = t.replace(
    /numeric correlation (?:could not|cannot) be calculated[^.]*\.?/gi,
    ""
  );
  t = t.replace(
    /insufficient joint pairs for numeric correlation\.?/gi,
    ""
  );
  t = t.replace(
    /qualitative discussion only\.?/gi,
    ""
  );

  t = t.replace(/\btotal\s+total\b/gi, "total");
  t = t.replace(
    /\b(Key findings|What this may indicate|Suggested next steps|Statistical observations|How this was calculated)\b(\s*:\s*)\1\b/gi,
    "$1$2"
  );
  t = t.replace(/(\b[\w\s,'"-]{20,120}[.!?])\s+\1/g, "$1");

  return t.replace(/\n{3,}/g, "\n\n").trim();
}

/** Remove confidence/narrative lines that contradict a computed Pearson r. */
export function stripContradictoryCorrelationNarrative(
  text: string,
  pearson: number | null | undefined
): string {
  if (pearson == null || !Number.isFinite(pearson)) return text;
  let t = text;
  const patterns = [
    /correlation could not be computed numerically/gi,
    /correlation not computed numerically/gi,
    /numeric correlation unavailable/gi,
    /qualitative discussion only/gi,
    /insufficient joint pairs for numeric correlation/gi,
  ];
  for (const pat of patterns) {
    t = t.replace(pat, "");
  }
  return t.replace(/\s{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

export function buildRelationshipScatterDisplayTitle(args: {
  question: string;
  xLabel: string;
  yLabel: string;
  persistedTitle?: string;
  relationshipMeasureLabel?: string | null;
}): string {
  const persisted = args.persistedTitle?.trim() ?? "";
  if (persisted && !looksLikeDuplicatedRelationshipTitle(persisted)) {
    return titleCaseRelationshipPhrase(persisted);
  }
  const chip = args.relationshipMeasureLabel?.trim();
  if (chip && !looksLikeDuplicatedRelationshipTitle(chip)) {
    return titleCaseRelationshipPhrase(chip);
  }

  const q = args.question.trim();
  if (q.length > 0 && q.length <= 88) {
    const ql = q.toLowerCase();
    if (ql.includes(" between ")) {
      return q.charAt(0).toUpperCase() + q.slice(1);
    }
    if (/\b(vs\.?|versus)\b/.test(ql)) {
      return buildRelationshipMeasureLabel(args.xLabel, args.yLabel);
    }
    if (
      /\b(relationship|correlation|correlat|associated|association|impact)\b/.test(
        ql
      )
    ) {
      return q.charAt(0).toUpperCase() + q.slice(1);
    }
  }
  return buildRelationshipMeasureLabel(args.xLabel, args.yLabel);
}

export type ScatterOutlierNote = {
  x?: number | null;
  y?: number | null;
  xLabel?: string;
  yLabel?: string;
  note?: string;
};

export function formatScatterOutlierAnomalyNote(
  outlier: ScatterOutlierNote,
  formatNum: (n: number) => string
): string | null {
  const xv = Number(outlier.x);
  const yv = Number(outlier.y);
  const xn = (outlier.xLabel ?? "X").trim();
  const yn = (outlier.yLabel ?? "Y").trim();
  if (Number.isFinite(xv) && Number.isFinite(yv)) {
    return (
      `Potential outlier detected near ${xn}=${formatNum(xv)}, ${yn}=${formatNum(yv)}.`
    );
  }
  return "One observation appears outside the normal cluster.";
}
