import type { LimitKind } from "@/lib/plan-limits";

export type LimitErrorDetail = {
  code: "limit_exceeded";
  limit: LimitKind;
  message: string;
  upgrade_required: boolean;
};

const LIMIT_KINDS: LimitKind[] = [
  "file_size",
  "ai_questions",
  "pdf_exports",
  "preview_rows",
  "dataset_rows",
];

function isLimitKind(value: unknown): value is LimitKind {
  return typeof value === "string" && LIMIT_KINDS.includes(value as LimitKind);
}

export function parseLimitErrorDetail(detail: unknown): LimitErrorDetail | null {
  if (!detail || typeof detail !== "object") return null;
  const obj = detail as Record<string, unknown>;
  if (obj.code !== "limit_exceeded") return null;
  if (!isLimitKind(obj.limit)) return null;
  if (typeof obj.message !== "string" || !obj.message.trim()) return null;
  return {
    code: "limit_exceeded",
    limit: obj.limit,
    message: obj.message.trim(),
    upgrade_required: Boolean(obj.upgrade_required),
  };
}

export function extractApiErrorMessage(detail: unknown): string {
  const limit = parseLimitErrorDetail(detail);
  if (limit) return limit.message;
  if (typeof detail === "string" && detail.trim()) return detail.trim();
  if (Array.isArray(detail)) {
    const parts = detail
      .map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object" && "msg" in item) {
          return String((item as { msg: unknown }).msg);
        }
        return "";
      })
      .filter(Boolean);
    if (parts.length) return parts.join(" ");
  }
  return "Request failed";
}

export function isUpgradeRequiredDetail(detail: unknown): boolean {
  const limit = parseLimitErrorDetail(detail);
  return Boolean(limit?.upgrade_required);
}
