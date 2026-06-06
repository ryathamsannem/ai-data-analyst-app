/** V1 SaaS plan limits (mirrors backend/services/plan_limits.py). */

export type PlanTier = "free" | "paid";

export type LimitKind =
  | "file_size"
  | "ai_questions"
  | "pdf_exports"
  | "preview_rows"
  | "dataset_rows";

export type PlanLimits = {
  tier: PlanTier;
  max_file_bytes: number;
  max_preview_rows: number;
  max_dataset_rows: number | null;
  ai_questions_limit: number;
  ai_questions_period: "day" | "month";
  pdf_exports_limit: number | null;
  pdf_exports_period: "day" | null;
  full_dataset_analysis: boolean;
};

export const FREE_MAX_FILE_BYTES = 100 * 1024;
export const PAID_MAX_FILE_BYTES = 25 * 1024 * 1024;
export const FREE_MAX_PREVIEW_ROWS = 500;
export const PAID_MAX_DATASET_ROWS = 100_000;

export function normalizePlanTier(raw: string | null | undefined): PlanTier {
  return raw?.trim().toLowerCase() === "paid" ? "paid" : "free";
}

export function getPlanLimits(tier: PlanTier): PlanLimits {
  if (tier === "paid") {
    return {
      tier: "paid",
      max_file_bytes: PAID_MAX_FILE_BYTES,
      max_preview_rows: 100_000,
      max_dataset_rows: PAID_MAX_DATASET_ROWS,
      ai_questions_limit: 300,
      ai_questions_period: "month",
      pdf_exports_limit: null,
      pdf_exports_period: null,
      full_dataset_analysis: true,
    };
  }
  return {
    tier: "free",
    max_file_bytes: FREE_MAX_FILE_BYTES,
    max_preview_rows: FREE_MAX_PREVIEW_ROWS,
    max_dataset_rows: null,
    ai_questions_limit: 10,
    ai_questions_period: "day",
    pdf_exports_limit: 1,
    pdf_exports_period: "day",
    full_dataset_analysis: false,
  };
}

export function formatBytes(numBytes: number): string {
  if (numBytes >= 1024 * 1024) {
    const mb = numBytes / (1024 * 1024);
    return mb % 1 === 0 ? `${mb} MB` : `${mb.toFixed(1)} MB`;
  }
  const kb = numBytes / 1024;
  return kb % 1 === 0 ? `${kb} KB` : `${kb.toFixed(1)} KB`;
}

export function fileSizeLimitMessage(tier: PlanTier, actualBytes: number): string {
  const limits = getPlanLimits(tier);
  return (
    `File size (${formatBytes(actualBytes)}) exceeds the ${tier === "paid" ? "Paid" : "Free"} ` +
    `plan limit (${formatBytes(limits.max_file_bytes)}). ` +
    (tier === "free"
      ? "Upgrade to Paid for uploads up to 25 MB."
      : "Try a smaller file or split your dataset.")
  );
}

export function isFileWithinPlanLimit(tier: PlanTier, sizeBytes: number): boolean {
  return sizeBytes <= getPlanLimits(tier).max_file_bytes;
}

export function previewRowOptionsForTier(tier: PlanTier): Array<number | "all"> {
  const max = getPlanLimits(tier).max_preview_rows;
  const base = [10, 25, 50, 100].filter((n) => n <= max);
  const options: Array<number | "all"> = [...base];
  if (max > 100) {
    if (max >= 500 && !options.includes(500)) options.push(500);
    if (max > 500) options.push(max);
  }
  if (tier === "paid" && max >= 100) {
    options.push("all");
  } else if (tier === "free" && max > 100) {
    options.push(max);
  }
  return [...new Set(options)];
}

export function canAskAiQuestion(
  tier: PlanTier,
  remaining: number | null | undefined
): boolean {
  if (remaining == null) return true;
  return remaining > 0;
}

export function canExportPdf(
  tier: PlanTier,
  remaining: number | null | undefined
): boolean {
  if (tier === "paid") return true;
  if (remaining == null) return true;
  return remaining > 0;
}

export function upgradeHeadlineForLimit(limit: LimitKind): string {
  switch (limit) {
    case "file_size":
      return "Upload limit reached";
    case "ai_questions":
      return "AI question limit reached";
    case "pdf_exports":
      return "PDF export limit reached";
    case "preview_rows":
      return "Preview limit reached";
    case "dataset_rows":
      return "Dataset size limit reached";
    default:
      return "Upgrade required";
  }
}
