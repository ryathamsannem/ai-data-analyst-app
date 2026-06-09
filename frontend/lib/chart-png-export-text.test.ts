import { describe, expect, it } from "vitest";
import { ensureReadableExportTextFill } from "@/lib/chart-png-export-text";

describe("chart PNG export text contrast", () => {
  it("lightens unreadable axis labels on dark backgrounds", () => {
    const adjusted = ensureReadableExportTextFill("#1e293b", "#0f172a", {
      lightText: "#94a3b8",
    });
    expect(adjusted).toBe("#94a3b8");
  });

  it("keeps readable axis labels on dark backgrounds", () => {
    const adjusted = ensureReadableExportTextFill("#94a3b8", "#0f172a");
    expect(adjusted).toBe("#94a3b8");
  });

  it("darkens near-white labels on light backgrounds", () => {
    const adjusted = ensureReadableExportTextFill("#f8fafc", "#ffffff", {
      darkText: "#334155",
    });
    expect(adjusted).toBe("#334155");
  });
});
