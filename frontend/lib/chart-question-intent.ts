import type { ChartKind } from "@/app/chart-types";

/** User is asking about individual outliers / extremes, not grouped averages. */
export function isOutlierAnalysisQuestion(question: string): boolean {
  const s = question.trim().toLowerCase();
  if (!s) return false;
  if (
    /\b(outliers?|anomal(?:y|ies)|unusually\s+(?:high|low)|extreme\s+values?)\b/i.test(
      s
    )
  ) {
    return true;
  }
  if (
    /\b(?:above|below)\s+(?:the\s+)?\d+(?:st|nd|rd|th)?\s+percentile\b/i.test(
      s
    )
  ) {
    return true;
  }
  if (/\bwhere\s+are\b.*\boutliers?\b/i.test(s)) {
    return true;
  }
  if (
    /\b(?:largest|smallest|highest|lowest|max|min)\b/i.test(s) &&
    /\b(?:outliers?|distribution|spread|range)\b/i.test(s)
  ) {
    return true;
  }
  return false;
}

/** Explicit breakdown intent — "by department", "across regions", etc. */
export function questionExplicitlyGroupsByDimension(question: string): boolean {
  return /\bby\s+[a-z0-9]/i.test(question.trim());
}

function normToken(s: string): string {
  return s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function titleImpliesDepartmentAggregate(title: string): boolean {
  const t = title.toLowerCase();
  return /\bby\s+department\b/.test(t) || /\bdepartment\b.*\b(?:average|avg|mean|total)\b/.test(t);
}

function aggregationIsGroupedAverage(aggKey: string, aggLabel: string): boolean {
  const blob = `${aggKey} ${aggLabel}`.toLowerCase();
  return /\b(avg|average|mean)\b/.test(blob);
}

function categoryLooksLikeDepartment(category: string): boolean {
  const c = normToken(category);
  return c.includes("department") || c === "dept";
}

/**
 * Department-average charts do not answer individual outlier questions.
 */
export function isMisleadingOutlierDepartmentChart(args: {
  question: string;
  chartTitle: string;
  aggregationKey?: string | null;
  aggregationLabel?: string | null;
  categoryColumn?: string | null;
  chartKind?: ChartKind | "";
  rowCount?: number;
}): boolean {
  if (!isOutlierAnalysisQuestion(args.question)) return false;
  if (questionExplicitlyGroupsByDimension(args.question)) return false;

  const aggKey = String(args.aggregationKey ?? "");
  const aggLabel = String(args.aggregationLabel ?? "");
  const category = String(args.categoryColumn ?? "");
  const title = args.chartTitle.trim();

  if (titleImpliesDepartmentAggregate(title)) return true;

  if (
    categoryLooksLikeDepartment(category) &&
    aggregationIsGroupedAverage(aggKey, aggLabel)
  ) {
    return true;
  }

  const kind = args.chartKind ?? "";
  if (
    (kind === "bar" || kind === "bar_horizontal") &&
    (args.rowCount ?? 0) >= 2 &&
    (args.rowCount ?? 0) <= 24 &&
    categoryLooksLikeDepartment(category) &&
    !/\boutlier|distribution|histogram|ranked|record\b/i.test(title)
  ) {
    return true;
  }

  return false;
}

export function chartSnapshotMatchesQuestionIntent(args: {
  question: string;
  chartTitle: string;
  aggregationKey?: string | null;
  aggregationLabel?: string | null;
  categoryColumn?: string | null;
  chartKind?: ChartKind | "";
  rowCount?: number;
}): boolean {
  if (
    isMisleadingOutlierDepartmentChart({
      question: args.question,
      chartTitle: args.chartTitle,
      aggregationKey: args.aggregationKey,
      aggregationLabel: args.aggregationLabel,
      categoryColumn: args.categoryColumn,
      chartKind: args.chartKind,
      rowCount: args.rowCount,
    })
  ) {
    return false;
  }
  return true;
}
