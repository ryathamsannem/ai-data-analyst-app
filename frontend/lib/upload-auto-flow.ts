/** Client-side upload pick validation and auto-upload trigger rules. */

import {
  OVERVIEW_UPLOAD_EXT_PATTERN,
  OVERVIEW_UPLOAD_INVALID_MSG,
} from "@/lib/overview-ui";
import {
  fileSizeLimitMessage,
  isFileWithinPlanLimit,
  type PlanTier,
} from "@/lib/plan-limits";

export type UploadPickValidation =
  | { ok: true; file: File }
  | { ok: false; reason: "invalid_type" | "file_too_large"; message: string };

export function validateOverviewUploadPick(
  file: File,
  tier: PlanTier
): UploadPickValidation {
  if (!OVERVIEW_UPLOAD_EXT_PATTERN.test(file.name)) {
    return { ok: false, reason: "invalid_type", message: OVERVIEW_UPLOAD_INVALID_MSG };
  }
  if (!isFileWithinPlanLimit(tier, file.size)) {
    const message = fileSizeLimitMessage(tier, file.size);
    return { ok: false, reason: "file_too_large", message };
  }
  return { ok: true, file };
}

/** Auto-upload starts immediately after a valid pick unless an upload is already running. */
export function shouldAutoUploadAfterPick(
  validation: UploadPickValidation,
  isUploading: boolean
): boolean {
  return validation.ok && !isUploading;
}

/** Primary upload CTA is not required when auto-upload is enabled. */
export const UPLOAD_USES_AUTO_START = true;
