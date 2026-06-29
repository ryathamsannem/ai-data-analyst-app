import { describe, expect, it } from "vitest";
import {
  PDF_PREVIEW_DUPLICATE_METRIC_LABEL,
  previewDuplicatesForPdf,
} from "@/lib/build-executive-pdf-input";

describe("previewDuplicatesForPdf", () => {
  it("labels duplicate metric as preview-only", () => {
    const result = previewDuplicatesForPdf(
      [
        { city: "A", revenue: 1 },
        { city: "A", revenue: 1 },
      ],
      ["city", "revenue"],
      1000
    );
    expect(result.label).toBe(PDF_PREVIEW_DUPLICATE_METRIC_LABEL);
    expect(result.duplicates).toBe(1);
    expect(result.note).toMatch(/preview duplicate check only/i);
    expect(result.note).toMatch(/1,000 file rows/i);
    expect(result.note).toMatch(/not a full-file duplicate audit/i);
  });

  it("distinguishes preview scan size from file-wide row count", () => {
    const result = previewDuplicatesForPdf(
      [{ id: "1" }],
      ["id"],
      500
    );
    expect(result.note).toMatch(/1 loaded preview row/i);
    expect(result.note).toMatch(/500 file rows/i);
  });
});
