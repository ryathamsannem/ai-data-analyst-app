import { describe, expect, it } from "vitest";
import {
  DATASET_CONTEXT_VISIBLE_FIELDS,
  dpQualityDuplicateRowsLabel,
  dpQualityDuplicateRowsLabelFull,
  resolveDuplicateRowsLabel,
} from "@/lib/data-preview-ui";

describe("data preview dataset context", () => {
  it("shows compact banner fields including rows and columns", () => {
    expect(DATASET_CONTEXT_VISIBLE_FIELDS).toEqual([
      "status",
      "file",
      "size",
      "sheet",
      "rows",
      "columns",
    ]);
  });

  it("labels duplicate rows dynamically by preview coverage", () => {
    expect(dpQualityDuplicateRowsLabel).toBe(
      "Duplicate rows (preview sample)"
    );
    expect(dpQualityDuplicateRowsLabelFull).toBe("Duplicate rows");
    expect(resolveDuplicateRowsLabel(50, 180)).toBe(dpQualityDuplicateRowsLabel);
    expect(resolveDuplicateRowsLabel(180, 180)).toBe(
      dpQualityDuplicateRowsLabelFull
    );
  });
});
