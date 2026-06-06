import { describe, expect, it } from "vitest";
import {
  FREE_MAX_FILE_BYTES,
  FREE_MAX_PREVIEW_ROWS,
  PAID_MAX_FILE_BYTES,
  canAskAiQuestion,
  canExportPdf,
  fileSizeLimitMessage,
  formatBytes,
  getPlanLimits,
  isFileWithinPlanLimit,
  normalizePlanTier,
  previewRowOptionsForTier,
} from "@/lib/plan-limits";
import {
  buildUsageQuotaRows,
  formatQuotaUsedRemaining,
  quotaProgress,
} from "@/lib/usage-display";
import {
  extractApiErrorMessage,
  parseLimitErrorDetail,
} from "@/lib/limit-error";

describe("plan limits", () => {
  it("normalizes plan tier", () => {
    expect(normalizePlanTier("paid")).toBe("paid");
    expect(normalizePlanTier("free")).toBe("free");
    expect(normalizePlanTier(undefined)).toBe("free");
  });

  it("defines free and paid file size caps", () => {
    expect(getPlanLimits("free").max_file_bytes).toBe(FREE_MAX_FILE_BYTES);
    expect(getPlanLimits("paid").max_file_bytes).toBe(PAID_MAX_FILE_BYTES);
  });

  it("checks file size against tier", () => {
    expect(isFileWithinPlanLimit("free", FREE_MAX_FILE_BYTES)).toBe(true);
    expect(isFileWithinPlanLimit("free", FREE_MAX_FILE_BYTES + 1)).toBe(false);
    expect(isFileWithinPlanLimit("paid", PAID_MAX_FILE_BYTES)).toBe(true);
  });

  it("builds file size upgrade message", () => {
    const msg = fileSizeLimitMessage("free", FREE_MAX_FILE_BYTES + 500);
    expect(msg).toContain("100 KB");
    expect(msg).toContain("Upgrade");
  });

  it("caps preview row options on free tier", () => {
    const options = previewRowOptionsForTier("free");
    expect(options).toContain(500);
    expect(options).not.toContain("all");
    expect(Math.max(...options.filter((v): v is number => typeof v === "number"))).toBe(
      FREE_MAX_PREVIEW_ROWS
    );
  });

  it("allows all rows preview on paid tier", () => {
    expect(previewRowOptionsForTier("paid")).toContain("all");
  });

  it("gates AI and PDF usage by remaining quota", () => {
    expect(canAskAiQuestion("free", 0)).toBe(false);
    expect(canAskAiQuestion("free", 1)).toBe(true);
    expect(canExportPdf("free", 0)).toBe(false);
    expect(canExportPdf("paid", 0)).toBe(true);
  });

  it("formats bytes for display", () => {
    expect(formatBytes(100 * 1024)).toBe("100 KB");
    expect(formatBytes(25 * 1024 * 1024)).toBe("25 MB");
  });
});

describe("usage display", () => {
  it("formats used and remaining quota", () => {
    expect(formatQuotaUsedRemaining(3, 7)).toBe("3 used · 7 remaining");
    expect(formatQuotaUsedRemaining(2, null)).toBe("2 used · Unlimited");
  });

  it("builds usage dashboard rows with remaining counts", () => {
    const limits = getPlanLimits("free");
    const rows = buildUsageQuotaRows("free", limits, {
      ai_questions_used: 2,
      ai_questions_remaining: 8,
      pdf_exports_used: 1,
      pdf_exports_remaining: 0,
      limits,
    });
    expect(rows.find((r) => r.label === "AI questions")?.value).toContain(
      "8 remaining"
    );
    expect(rows.find((r) => r.label === "PDF exports")?.value).toContain(
      "0 remaining"
    );
    expect(rows.find((r) => r.label === "Preview row limit")?.value).toContain(
      "500"
    );
  });

  it("computes quota progress percentage", () => {
    expect(quotaProgress(3, 10)).toBe(30);
    expect(quotaProgress(10, 10)).toBe(100);
    expect(quotaProgress(1, null)).toBeNull();
  });
});

describe("limit error parsing", () => {
  it("parses structured limit detail", () => {
    const parsed = parseLimitErrorDetail({
      code: "limit_exceeded",
      limit: "ai_questions",
      message: "Daily AI limit reached.",
      upgrade_required: true,
    });
    expect(parsed?.limit).toBe("ai_questions");
    expect(parsed?.message).toContain("Daily AI");
  });

  it("extracts message from limit detail object", () => {
    expect(
      extractApiErrorMessage({
        code: "limit_exceeded",
        limit: "pdf_exports",
        message: "PDF export limit reached.",
        upgrade_required: true,
      })
    ).toBe("PDF export limit reached.");
  });
});
