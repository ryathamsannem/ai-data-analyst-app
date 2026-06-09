import { describe, expect, it } from "vitest";
import {
  UPLOAD_USES_AUTO_START,
  shouldAutoUploadAfterPick,
  validateOverviewUploadPick,
} from "@/lib/upload-auto-flow";

function mockFile(name: string, sizeBytes: number): File {
  return { name, size: sizeBytes } as File;
}

describe("upload auto flow", () => {
  it("does not require a manual upload button when auto-start is enabled", () => {
    expect(UPLOAD_USES_AUTO_START).toBe(true);
  });

  it("validates supported file picks", () => {
    const result = validateOverviewUploadPick(mockFile("sales.csv", 1024), "free");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.file.name).toBe("sales.csv");
  });

  it("rejects unsupported extensions", () => {
    const result = validateOverviewUploadPick(mockFile("notes.txt", 100), "free");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("invalid_type");
  });

  it("rejects files above free tier limit", () => {
    const result = validateOverviewUploadPick(
      mockFile("large.csv", 200 * 1024),
      "free"
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("file_too_large");
  });

  it("triggers auto-upload after valid pick when idle", () => {
    const validation = validateOverviewUploadPick(mockFile("sales.csv", 512), "free");
    expect(shouldAutoUploadAfterPick(validation, false)).toBe(true);
  });

  it("does not auto-upload while an upload is in progress", () => {
    const validation = validateOverviewUploadPick(mockFile("sales.csv", 512), "free");
    expect(shouldAutoUploadAfterPick(validation, true)).toBe(false);
  });

  it("does not auto-upload invalid picks", () => {
    const validation = validateOverviewUploadPick(mockFile("bad.exe", 512), "free");
    expect(shouldAutoUploadAfterPick(validation, false)).toBe(false);
  });
});
