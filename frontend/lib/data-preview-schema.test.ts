import { describe, expect, it } from "vitest";
import {
  buildColumnDetailStats,
  buildDataPreviewQualitySummary,
  buildSchemaColumnRows,
  classifyColumnTypeBadge,
  deriveDataQualityLabel,
  DP_LABEL_FULL_DATASET_UNIQUE,
  DP_LABEL_LOADED_PREVIEW_ROWS,
  DP_LABEL_NULL_FULL_DATASET,
  DP_LABEL_PREVIEW_SAMPLE_UNIQUENESS,
  filterSchemaColumnRows,
  formatPreviewSampleUniqueness,
  formatSchemaNullPercent,
  formatSchemaRoleLabel,
  formatSchemaUniqueCount,
  formatSchemaUniqueDisplay,
  normalizeSemanticRoleLabel,
  hasIdentifierNamePattern,
  isLikelyIdentifierColumn,
  readProfileDescribeStat,
  type DataPreviewProfile,
} from "@/lib/data-preview-schema";

const profile: DataPreviewProfile = {
  column_types: {
    revenue: "number",
    order_date: "date",
    campaign_name: "category",
    notes: "text",
    conversion_rate_pct: "number",
    is_active: "category",
    order_id: "text",
    region: "category",
    channel: "category",
  },
  null_counts: {
    revenue: 5,
    order_date: 0,
    campaign_name: 2,
    notes: 0,
    conversion_rate_pct: 0,
    is_active: 0,
    order_id: 0,
    region: 0,
    channel: 0,
  },
  summary_stats: {
    min: { revenue: 10, conversion_rate_pct: 0.5 },
    max: { revenue: 500, conversion_rate_pct: 99 },
    mean: { revenue: 120.5, conversion_rate_pct: 42 },
    "50%": { revenue: 100, conversion_rate_pct: 40 },
  },
  unique_counts: {
    campaign_name: 42,
    region: 5,
    order_id: 180,
  },
};

const preview50 = Array.from({ length: 50 }, (_, i) => ({
  order_id: `ORD${String(i + 1).padStart(4, "0")}`,
  campaign_name: i % 5 === 0 ? "Spring" : i % 5 === 1 ? "Summer" : "Fall",
  region: i % 4 === 0 ? "East" : "West",
  channel: i % 3 === 0 ? "Email" : "Paid",
  revenue: 100 + i,
  conversion_rate_pct: 10 + (i % 7),
  notes: `note-${i}`,
}));

describe("data preview schema helpers", () => {
  it("classifies type badges including currency and rate", () => {
    expect(classifyColumnTypeBadge("revenue", "number")).toEqual({
      kind: "currency",
      label: "Currency",
    });
    expect(classifyColumnTypeBadge("conversion_rate_pct", "number")).toEqual({
      kind: "rate",
      label: "Rate",
    });
    expect(classifyColumnTypeBadge("is_active", "category")).toEqual({
      kind: "boolean",
      label: "Boolean",
    });
    expect(classifyColumnTypeBadge("order_date", "date")).toEqual({
      kind: "date",
      label: "Date",
    });
  });

  it("formats schema table display values", () => {
    expect(formatSchemaNullPercent(0)).toBe("0.0%");
    expect(formatSchemaNullPercent(null)).toBe("—");
    expect(formatSchemaUniqueCount(12, "full")).toBe("12");
    expect(formatSchemaUniqueDisplay(12, "preview")).toBe("12 (preview)");
    expect(formatSchemaRoleLabel("Metric")).toBe("Metric");
    expect(formatSchemaRoleLabel(null)).toBe("—");
    expect(normalizeSemanticRoleLabel("Grouping dimension")).toBe("Dimension");
    expect(normalizeSemanticRoleLabel("Location / region")).toBe("Location");
  });

  it("filters schema rows by name, type, and role", () => {
    const rows = buildSchemaColumnRows({
      columns: ["revenue", "campaign_name", "order_date"],
      profile,
      preview: [
        { revenue: 10, campaign_name: "A", order_date: "2026-01-01" },
        { revenue: 20, campaign_name: "B", order_date: "2026-02-01" },
      ],
      totalRows: 100,
      mapping: { sales: "revenue", product: "campaign_name", date: "order_date" },
    });

    expect(filterSchemaColumnRows(rows, "revenue")).toHaveLength(1);
    expect(filterSchemaColumnRows(rows, "date")).toHaveLength(1);
    expect(filterSchemaColumnRows(rows, "metric")).toHaveLength(1);
    expect(filterSchemaColumnRows(rows, "dimension")).toHaveLength(1);
  });

  it("derives quality summary labels from null density", () => {
    expect(
      deriveDataQualityLabel({
        totalRows: 100,
        columns: ["a", "b"],
        nullCounts: { a: 1, b: 1 },
      })
    ).toBe("Good");

    expect(
      deriveDataQualityLabel({
        totalRows: 100,
        columns: ["a", "b"],
        nullCounts: { a: 20, b: 1 },
      })
    ).toBe("Needs Review");

    expect(
      deriveDataQualityLabel({
        totalRows: 100,
        columns: ["a", "b", "c"],
        nullCounts: { a: 20, b: 20, c: 5 },
      })
    ).toBe("Poor");
  });

  it("reads pandas-style describe stats stat-first", () => {
    expect(readProfileDescribeStat("revenue", "mean", profile)).toBe(120.5);
    expect(readProfileDescribeStat("revenue", "50%", profile)).toBe(100);
    expect(readProfileDescribeStat("missing_col", "mean", profile)).toBeNull();
  });

  it("builds numeric column detail stats from profile", () => {
    const detail = buildColumnDetailStats({
      column: "revenue",
      profile,
      preview: [{ revenue: 10 }, { revenue: 20 }],
      totalRows: 100,
      mapping: { sales: "revenue" },
    });
    expect(detail.unavailable).toBe(false);
    expect(detail.displayRole).toBe("Metric");
    expect(
      detail.profileStats.some((s) => s.label === "Average (full dataset)")
    ).toBe(true);
    expect(
      detail.profileStats.some((s) => s.label === "Median (full dataset)")
    ).toBe(true);
    expect(detail.previewStats.some((s) => s.label === DP_LABEL_LOADED_PREVIEW_ROWS)).toBe(
      true
    );
    expect(detail.identifierInsights).toBeNull();
  });

  it("falls back when column detail stats are unavailable", () => {
    const detail = buildColumnDetailStats({
      column: "unknown_metric",
      profile: null,
      preview: [],
      totalRows: 0,
      mapping: {},
    });
    expect(detail.unavailable).toBe(true);
    expect(detail.profileStats).toHaveLength(0);
    expect(detail.previewStats).toHaveLength(0);
  });

  it("builds quality summary with duplicate estimate from preview", () => {
    const summary = buildDataPreviewQualitySummary({
      rows: 50,
      columns: ["a", "b"],
      profile: {
        column_types: { a: "text", b: "text" },
        null_counts: { a: 0, b: 0 },
        summary_stats: {},
      },
      preview: [
        { a: "x", b: "1" },
        { a: "x", b: "1" },
        { a: "y", b: "2" },
      ],
    });
    expect(summary.duplicateRowCount).toBe(1);
    expect(summary.duplicateNote).toBe("Based on 3 loaded preview rows.");
    expect(summary.qualityLabel).toBe("Good");
  });

  it("detects id-like column names as identifiers", () => {
    expect(hasIdentifierNamePattern("order_id")).toBe(true);
    expect(hasIdentifierNamePattern("customer_id")).toBe(true);
    expect(hasIdentifierNamePattern("transaction_ref")).toBe(true);
    expect(hasIdentifierNamePattern("campaign_name")).toBe(false);
    expect(hasIdentifierNamePattern("region")).toBe(false);
  });

  it("detects 100% unique text columns as identifiers", () => {
    const badge = classifyColumnTypeBadge("notes", "text");
    expect(
      isLikelyIdentifierColumn({
        column: "notes",
        type: "text",
        preview: preview50,
        badge,
      })
    ).toBe(true);
  });

  it("does not classify low-cardinality categorical columns as identifiers", () => {
    const badge = classifyColumnTypeBadge("campaign_name", "category");
    expect(
      isLikelyIdentifierColumn({
        column: "campaign_name",
        type: "category",
        preview: preview50,
        badge,
      })
    ).toBe(false);
    expect(
      isLikelyIdentifierColumn({
        column: "region",
        type: "category",
        preview: preview50,
        badge,
      })
    ).toBe(false);
    expect(
      isLikelyIdentifierColumn({
        column: "channel",
        type: "category",
        preview: preview50,
        badge,
      })
    ).toBe(false);
  });

  it("does not classify metric, currency, or rate columns as identifiers even when unique", () => {
    const uniqueRevenuePreview = preview50.map((row, i) => ({
      revenue: 1000 + i,
      conversion_rate_pct: 5 + i * 0.1,
    }));
    expect(
      isLikelyIdentifierColumn({
        column: "revenue",
        type: "number",
        preview: uniqueRevenuePreview,
        badge: classifyColumnTypeBadge("revenue", "number"),
      })
    ).toBe(false);
    expect(
      isLikelyIdentifierColumn({
        column: "conversion_rate_pct",
        type: "number",
        preview: uniqueRevenuePreview,
        badge: classifyColumnTypeBadge("conversion_rate_pct", "number"),
      })
    ).toBe(false);
  });

  it("separates full-dataset and preview stats for identifier columns", () => {
    const detail = buildColumnDetailStats({
      column: "order_id",
      profile,
      preview: preview50,
      totalRows: 180,
      mapping: {},
    });
    expect(detail.displayRole).toBe("Identifier");
    expect(detail.identifierInsights).not.toBeNull();
    expect(detail.identifierInsights?.fullDatasetUniqueCount).toBe(180);
    expect(detail.identifierInsights?.previewRowsLoaded).toBe(50);
    expect(detail.identifierInsights?.previewUniqueValues).toBe(50);
    expect(detail.identifierInsights?.previewNonNullRows).toBe(50);
    expect(detail.profileStats.some((s) => s.label === DP_LABEL_NULL_FULL_DATASET)).toBe(
      true
    );
    expect(
      detail.profileStats.some((s) => s.label.includes("Unique count"))
    ).toBe(false);
    expect(detail.previewStats).toHaveLength(0);
    expect(detail.previewTopValues).toBeNull();
  });

  it("labels full-dataset unique counts when profile provides them", () => {
    const detail = buildColumnDetailStats({
      column: "campaign_name",
      profile,
      preview: preview50,
      totalRows: 180,
      mapping: { product: "campaign_name" },
    });
    expect(
      detail.profileStats.some((s) => s.label === DP_LABEL_FULL_DATASET_UNIQUE)
    ).toBe(true);
    expect(detail.profileStats.find((s) => s.label === DP_LABEL_FULL_DATASET_UNIQUE)?.value).toBe(
      "42"
    );
    expect(detail.previewStats.some((s) => s.label === DP_LABEL_LOADED_PREVIEW_ROWS)).toBe(
      true
    );
    expect(
      detail.previewStats.some((s) => s.label === DP_LABEL_PREVIEW_SAMPLE_UNIQUENESS)
    ).toBe(false);
  });

  it("labels preview unique values when full-dataset counts are unavailable", () => {
    const { unique_counts: _removed, ...profileWithoutUnique } = profile;
    const detail = buildColumnDetailStats({
      column: "campaign_name",
      profile: profileWithoutUnique,
      preview: preview50.slice(0, 10),
      totalRows: 180,
      mapping: {},
    });
    expect(
      detail.profileStats.some((s) => s.label === DP_LABEL_FULL_DATASET_UNIQUE)
    ).toBe(false);
    expect(
      detail.previewStats.some((s) => s.label === DP_LABEL_PREVIEW_SAMPLE_UNIQUENESS)
    ).toBe(true);
    expect(
      detail.previewStats.find((s) => s.label === DP_LABEL_PREVIEW_SAMPLE_UNIQUENESS)?.value
    ).toBe(formatPreviewSampleUniqueness(3, 10));
  });

  it("keeps preview-based top values for categorical columns", () => {
    const detail = buildColumnDetailStats({
      column: "campaign_name",
      profile,
      preview: preview50,
      totalRows: 180,
      mapping: { product: "campaign_name" },
    });
    expect(detail.displayRole).toBe("Dimension");
    expect(detail.identifierInsights).toBeNull();
    expect(detail.previewTopValues?.some((s) => s.label === "Top 1")).toBe(true);
    expect(detail.previewTopValues?.length).toBeGreaterThan(0);
  });

  it("uses full-dataset unique counts when profile provides them", () => {
    const rows = buildSchemaColumnRows({
      columns: ["campaign_name", "order_id"],
      profile,
      preview: preview50.slice(0, 10),
      totalRows: 180,
      mapping: { product: "campaign_name" },
    });
    const campaign = rows.find((r) => r.name === "campaign_name");
    const order = rows.find((r) => r.name === "order_id");
    expect(campaign?.uniqueSource).toBe("full");
    expect(campaign?.uniqueCount).toBe(42);
    expect(order?.uniqueSource).toBe("full");
    expect(
      formatSchemaUniqueDisplay(order?.uniqueCount ?? null, order?.uniqueSource ?? "unavailable")
    ).toBe("180");
  });

  it("falls back to preview-labeled unique counts without profile unique_counts", () => {
    const { unique_counts: _removed, ...profileWithoutUnique } = profile;
    const rows = buildSchemaColumnRows({
      columns: ["campaign_name"],
      profile: profileWithoutUnique,
      preview: preview50.slice(0, 10),
      totalRows: 180,
      mapping: {},
    });
    expect(rows[0]?.uniqueSource).toBe("preview");
    expect(formatSchemaUniqueDisplay(rows[0]?.uniqueCount ?? null, "preview")).toMatch(
      /\(preview\)$/
    );
  });
});
