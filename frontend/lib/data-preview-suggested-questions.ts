import { humanizeColumnName } from "@/lib/analytics-metadata";
import {
  hasIdentifierNamePattern,
  type DataPreviewProfile,
} from "@/lib/data-preview-schema";

function suggestionTokenMultisetKey(q: string): string {
  return q
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(" ");
}

function dedupeSuggestedQuestions(items: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of items) {
    const q = raw.trim();
    if (!q) continue;
    const k = suggestionTokenMultisetKey(q);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(q);
  }
  return out;
}

function suggestionsLookNearDuplicate(a: string, b: string): boolean {
  const ka = suggestionTokenMultisetKey(a);
  const kb = suggestionTokenMultisetKey(b);
  if (ka === kb) return true;
  if (!ka || !kb) return false;
  const shorter = ka.length <= kb.length ? ka : kb;
  const longer = ka.length > kb.length ? ka : kb;
  if (shorter.length >= 14 && longer.includes(shorter)) return true;
  const wa = new Set(ka.split(" "));
  const wb = new Set(kb.split(" "));
  let inter = 0;
  wa.forEach((w) => {
    if (wb.has(w)) inter += 1;
  });
  const uni = wa.size + wb.size - inter;
  return uni > 0 && inter / uni >= 0.72;
}

function dedupeSuggestedQuestionsNear(items: string[]): string[] {
  const out: string[] = [];
  for (const raw of items) {
    const q = raw.trim();
    if (!q) continue;
    if (out.some((o) => suggestionsLookNearDuplicate(o, q))) continue;
    out.push(q);
  }
  return out;
}

function splitColumnsByTypedProfile(
  columns: string[],
  profile: DataPreviewProfile | null
): { numbers: string[]; dates: string[]; categories: string[] } {
  const numbers: string[] = [];
  const dates: string[] = [];
  const categories: string[] = [];
  for (const c of columns) {
    const t = profile?.column_types?.[c];
    if (t === "number") numbers.push(c);
    else if (t === "date") dates.push(c);
    else if (t === "category" || t === "text") categories.push(c);
  }
  return { numbers, dates, categories };
}

function shortColumnLabel(col: string, maxLen = 20): string {
  const t = humanizeColumnName(col).replace(/\s+/g, " ").trim();
  if (t.length <= maxLen) return t;
  return `${t.slice(0, Math.max(1, maxLen - 1))}…`;
}

function pluralizeLabel(label: string): string {
  const trimmed = label.trim();
  if (!trimmed) return trimmed;
  if (/\s+name$/i.test(trimmed)) {
    const base = trimmed.replace(/\s+name$/i, "").trim();
    if (base) return pluralizeLabel(base);
  }
  const lower = trimmed.toLowerCase();
  if (lower.endsWith("s") || lower.endsWith("ies")) return trimmed;
  if (/\bcategory\b/i.test(trimmed)) {
    return trimmed.replace(/\bcategory\b/gi, "categories");
  }
  if (/\btype\b/i.test(trimmed)) {
    return trimmed.replace(/\btype\b/gi, "types");
  }
  if (lower.endsWith("y") && !/[aeiou]y$/i.test(trimmed)) {
    return `${trimmed.slice(0, -1)}ies`;
  }
  return `${trimmed}s`;
}

function looksPlural(label: string): boolean {
  const words = label.trim().split(/\s+/);
  const last = words[words.length - 1]?.toLowerCase() ?? "";
  return last.endsWith("s") || last.endsWith("ies");
}

/** Light grammar cleanup for API- and template-generated questions. */
export function polishSuggestedQuestion(raw: string): string {
  let q = raw.trim();
  if (!q) return q;

  q = q.replace(/\bcampaign name\b/gi, "campaigns");
  q = q.replace(/\bproduct category\b/gi, "product categories");
  q = q.replace(/\bcustomer name\b/gi, "customers");
  q = q.replace(/\bregion name\b/gi, "regions");

  q = q.replace(
    /\bWhich\s+(.+?)\s+drive\s+the\b/gi,
    (_match, subject: string) => {
      const s = subject.trim();
      if (looksPlural(s)) return `Which ${s} drive the`;
      return `Which ${s} drives the`;
    }
  );

  q = q.replace(
    /\btop\s+(\d+)\s+(.+?)\s+ranked\b/gi,
    (_match, count: string, noun: string) => {
      const label = pluralizeLabel(noun.trim());
      return `top ${count} ${label} ranked`;
    }
  );

  q = q.replace(/\s+/g, " ").trim();
  if (q.length > 8 && !/[?!.]$/.test(q)) q += "?";
  return q;
}

export type DataPreviewSuggestedQuestionsArgs = {
  columns: string[];
  profile: DataPreviewProfile | null;
  datasetKind: string;
  primaryMetric: string | null;
  primaryDate: string | null;
  primaryBreakdown: string | null;
};

/** Dataset-aware chips built from detected columns and mapping roles. */
export function buildDataPreviewSuggestedQuestions(
  args: DataPreviewSuggestedQuestionsArgs
): string[] {
  const {
    columns,
    profile,
    datasetKind,
    primaryMetric,
    primaryDate,
    primaryBreakdown,
  } = args;
  const { numbers, dates, categories } = splitColumnsByTypedProfile(
    columns,
    profile
  );

  const metricCol =
    primaryMetric && numbers.includes(primaryMetric)
      ? primaryMetric
      : numbers[0] ?? null;
  const dateCol =
    primaryDate && dates.includes(primaryDate)
      ? primaryDate
      : dates[0] ?? null;
  let breakdownCol =
    primaryBreakdown && categories.includes(primaryBreakdown)
      ? primaryBreakdown
      : null;
  if (!breakdownCol) {
    breakdownCol =
      categories.find((c) => !hasIdentifierNamePattern(c)) ??
      categories[0] ??
      null;
  }

  const dk = (datasetKind || "").trim().toLowerCase();
  const raw: string[] = [];

  const domainChip = (): string | null => {
    switch (dk) {
      case "hr":
        return "People snapshot";
      case "sales":
        return "Sales snapshot";
      case "ecommerce":
        return "Retail snapshot";
      case "finance":
        return "Finance snapshot";
      case "manufacturing":
        return "Ops snapshot";
      case "marketing":
        return "Marketing snapshot";
      case "operations":
        return "Operations snapshot";
      default:
        return null;
    }
  };

  const dc = domainChip();
  if (dc) raw.push(dc);

  if (metricCol && breakdownCol) {
    const dim = shortColumnLabel(breakdownCol);
    const dimPlural = pluralizeLabel(dim);
    const metric = shortColumnLabel(metricCol);
    raw.push(
      `Which ${dimPlural.toLowerCase()} drive the most ${metric.toLowerCase()}?`
    );
    raw.push(
      `What are the top 10 ${dimPlural.toLowerCase()} ranked by ${metric.toLowerCase()}?`
    );
  }
  if (metricCol && dateCol) {
    raw.push(`How does ${shortColumnLabel(metricCol).toLowerCase()} trend over time?`);
  }
  if (breakdownCol && dateCol) {
    raw.push(`How does ${shortColumnLabel(breakdownCol).toLowerCase()} change over time?`);
  }
  if (numbers.length >= 2) {
    const a = numbers[0];
    const b = numbers[1];
    raw.push(`How do ${shortColumnLabel(a).toLowerCase()} and ${shortColumnLabel(b).toLowerCase()} compare?`);
  }
  if (metricCol) {
    raw.push(`Where are the largest ${shortColumnLabel(metricCol).toLowerCase()} outliers?`);
  }
  if (breakdownCol && !metricCol) {
    raw.push(`What is the mix of ${shortColumnLabel(breakdownCol).toLowerCase()}?`);
  }
  if (dateCol && !metricCol) {
    raw.push(`What is the ${shortColumnLabel(dateCol).toLowerCase()} range?`);
  }

  const out = dedupeSuggestedQuestionsNear(
    dedupeSuggestedQuestions(raw).map(polishSuggestedQuestion)
  );
  const filler = [
    "Top drivers",
    "Biggest gaps",
    "Quick wins",
    "Risks to watch",
  ];
  for (const f of filler) {
    if (out.length >= 4) break;
    if (!out.some((o) => suggestionsLookNearDuplicate(o, f))) out.push(f);
  }
  return out.slice(0, 6);
}

/**
 * Prefer upload/API suggested questions (same source as AI Insights).
 * Fall back to dataset-aware preview chips when API suggestions are absent.
 */
export function resolveDataPreviewSuggestedQuestions(args: {
  apiSuggestions?: string[] | null;
  buildArgs: DataPreviewSuggestedQuestionsArgs;
}): string[] {
  const cleaned = (args.apiSuggestions ?? [])
    .map((s) => (typeof s === "string" ? s.trim() : ""))
    .filter(Boolean);
  if (cleaned.length > 0) {
    return dedupeSuggestedQuestionsNear(
      dedupeSuggestedQuestions(cleaned.map(polishSuggestedQuestion))
    ).slice(0, 6);
  }
  return buildDataPreviewSuggestedQuestions(args.buildArgs);
}
