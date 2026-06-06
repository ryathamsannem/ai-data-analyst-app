import { describe, expect, it } from "vitest";
import { shouldReservePdfExportQuota } from "@/lib/pdf-export-quota";

describe("pdf export quota preflight", () => {
  it("does not reserve when contract validation fails", () => {
    expect(
      shouldReservePdfExportQuota({ contractCheckOk: false, buildInputOk: true })
    ).toBe(false);
  });

  it("does not reserve when build input fails", () => {
    expect(
      shouldReservePdfExportQuota({ contractCheckOk: true, buildInputOk: false })
    ).toBe(false);
  });

  it("reserves only when all preflight checks pass", () => {
    expect(
      shouldReservePdfExportQuota({ contractCheckOk: true, buildInputOk: true })
    ).toBe(true);
  });
});
