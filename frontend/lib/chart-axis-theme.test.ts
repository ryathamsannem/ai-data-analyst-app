import { describe, expect, it } from "vitest";
import { chartLayoutWidthKey } from "@/lib/chart-axis-theme";
import { ensureReadableExportTextFill } from "@/lib/chart-png-export-text";

describe("chart axis theme helpers", () => {
  it("buckets layout width for stable Recharts keys", () => {
    expect(chartLayoutWidthKey(383)).toBe(384);
    expect(chartLayoutWidthKey(379)).toBe(376);
  });

  it("lightens axis title color for dark PNG backgrounds", () => {
    const adjusted = ensureReadableExportTextFill("#1e293b", "#0f172a", {
      lightText: "#cbd5e1",
    });
    expect(adjusted).toBe("#cbd5e1");
  });

  it("keeps light axis label color on dark backgrounds", () => {
    const adjusted = ensureReadableExportTextFill("#cbd5e1", "#0f172a");
    expect(adjusted).toBe("#cbd5e1");
  });
});
