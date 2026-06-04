/**
 * Derived profit margin % — SUM(profit) / SUM(revenue) × 100 by dimension.
 */

export type ProfitMarginMode = {
  active: boolean;
  /** Margin could not be computed (no revenue column). */
  unavailable?: boolean;
  leadSentence?: string;
};

const MARGIN_QUESTION_RE =
  /\b(profit\s+margin|profitability\s+rate|best\s+margin|highest\s+margin|lowest\s+margin|worst\s+margin|margin\s+by|margin\s+across|margin\s+per)\b/i;

export function questionRequestsProfitMargin(question: string): boolean {
  const q = question.trim();
  if (!q) return false;
  if (MARGIN_QUESTION_RE.test(q)) return true;
  const ql = q.toLowerCase();
  if (/\bmargin\b/.test(ql) && /\b(region|product|department|channel|which|what)\b/.test(ql)) {
    return true;
  }
  if (/\b(best|highest|lowest)\s+profitability\b/.test(ql)) return true;
  return false;
}

export function parseDerivedProfitMarginFlag(raw: unknown): boolean {
  if (raw === true) return true;
  if (raw && typeof raw === "object") {
    return Boolean((raw as Record<string, unknown>).active);
  }
  return false;
}

export function resolveProfitMarginMode(args: {
  question: string;
  derivedProfitMargin?: unknown;
  profitMarginUnavailable?: unknown;
  metricColumnDisplay?: string | null;
  valueAxisLabel?: string | null;
}): ProfitMarginMode | null {
  if (parseDerivedProfitMarginFlag(args.derivedProfitMargin)) {
    return { active: true };
  }
  if (args.profitMarginUnavailable === true) {
    return {
      active: false,
      unavailable: true,
      leadSentence:
        "Profit margin cannot be calculated without a revenue column. Totals below are total profit for context only — not margin.",
    };
  }
  if (!questionRequestsProfitMargin(args.question)) return null;
  const label = `${args.metricColumnDisplay ?? ""} ${args.valueAxisLabel ?? ""}`.toLowerCase();
  if (/\bprofit\s+margin\b|\bmargin\s*%/.test(label)) {
    return { active: true };
  }
  return null;
}

export type ProfitMarginExecutiveCard = {
  key: string;
  title: string;
  value: string;
  hint?: string;
  dotClass: string;
};

export function buildProfitMarginExecutiveInsights(
  rows: { label: string; value: number; formatted: string }[]
): ProfitMarginExecutiveCard[] {
  if (rows.length < 1) return [];
  const stripes = [
    "bg-emerald-500",
    "bg-rose-500",
    "bg-amber-500",
    "bg-sky-500",
  ] as const;
  let stripeIdx = 0;
  const nextDot = () => stripes[stripeIdx++ % stripes.length];

  const sorted = [...rows].sort((a, b) => b.value - a.value);
  const best = sorted[0]!;
  const worst = sorted[sorted.length - 1]!;
  const gap = best.value - worst.value;
  const avg = rows.reduce((a, r) => a + r.value, 0) / rows.length;

  const fmt = (v: number) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return "—";
    return `${n.toFixed(2)}%`;
  };

  return [
    {
      key: "pm-best",
      title: "Best Margin",
      value: best.label,
      hint: fmt(best.value),
      dotClass: nextDot(),
    },
    {
      key: "pm-worst",
      title: "Worst Margin",
      value: worst.label,
      hint: fmt(worst.value),
      dotClass: nextDot(),
    },
    {
      key: "pm-gap",
      title: "Margin Gap",
      value: fmt(gap),
      hint:
        gap < 1.5
          ? "All regions are close — small difference"
          : `Spread: ${fmt(best.value)} vs ${fmt(worst.value)}`,
      dotClass: nextDot(),
    },
    {
      key: "pm-avg",
      title: "Average Margin",
      value: fmt(avg),
      dotClass: nextDot(),
    },
  ];
}

export function buildProfitMarginAnswerLead(
  rows: { label: string; value: number }[]
): string | null {
  if (rows.length < 1) return null;
  const sorted = [...rows].sort((a, b) => b.value - a.value);
  const best = sorted[0]!;
  const spread = best.value - sorted[sorted.length - 1]!.value;
  const close =
    spread < 1.5
      ? " All regions are close, so this is a small difference."
      : "";
  const name = best.label.trim() || "The top group";
  return `${name} has the best profit margin at approximately ${best.value.toFixed(2)}%.${close}`;
}

export function prependProfitMarginLead(summary: string, lead: string): string {
  const s = summary.trim();
  const l = lead.trim();
  if (!l) return s;
  if (!s) return l;
  if (s.toLowerCase().includes(l.toLowerCase().slice(0, 28))) return s;
  return `${l} ${s}`;
}
