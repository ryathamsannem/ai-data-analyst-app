import { describe, expect, it } from "vitest";
import {
  parsePdfIsoDateLabel,
  pdfColumnNameLooksLikeDate,
  pdfColumnNameLooksLikeIdentifier,
  pdfValueLooksLikeIdentifier,
  shouldFormatPdfCellAsDate,
} from "@/lib/pdf-date-format";
import { formatPdfTableCellDisplayValue } from "@/app/pdf-report";

describe("pdf date/identifier column guards", () => {
  it("treats account_id and property_id as identifier columns", () => {
    expect(pdfColumnNameLooksLikeIdentifier("account_id")).toBe(true);
    expect(pdfColumnNameLooksLikeIdentifier("property_id")).toBe(true);
    expect(pdfColumnNameLooksLikeDate("account_id")).toBe(false);
  });

  it("treats report_month and list_date as date columns", () => {
    expect(pdfColumnNameLooksLikeDate("report_month")).toBe(true);
    expect(pdfColumnNameLooksLikeDate("list_date")).toBe(true);
    expect(pdfColumnNameLooksLikeIdentifier("report_month")).toBe(false);
  });

  it("detects ACC-/PROP- style identifier values", () => {
    expect(pdfValueLooksLikeIdentifier("ACC-000001")).toBe(true);
    expect(pdfValueLooksLikeIdentifier("PROP-000001")).toBe(true);
    expect(pdfValueLooksLikeIdentifier("2024-01-01")).toBe(false);
  });

  it("does not parse identifier strings as dates", () => {
    expect(parsePdfIsoDateLabel("ACC-000001")).toBeNull();
    expect(parsePdfIsoDateLabel("PROP-000042")).toBeNull();
    expect(parsePdfIsoDateLabel("2024-01-01")).toBe("2024-01-01");
  });

  it("formats ID columns as stable text in PDF preview cells", () => {
    expect(
      formatPdfTableCellDisplayValue("ACC-000001", "account_id")
    ).toBe("ACC-000001");
    expect(
      formatPdfTableCellDisplayValue("PROP-000001", "property_id")
    ).toBe("PROP-000001");
  });

  it("still formats real date columns as ISO dates", () => {
    expect(
      formatPdfTableCellDisplayValue("2024-01-01", "report_month")
    ).toBe("2024-01-01");
    expect(
      formatPdfTableCellDisplayValue("2024-01-01", "list_date")
    ).toBe("2024-01-01");
    expect(shouldFormatPdfCellAsDate("list_date", "2024-01-01")).toBe(true);
  });
});
