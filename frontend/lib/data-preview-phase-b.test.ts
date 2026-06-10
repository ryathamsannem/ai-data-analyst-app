import { describe, expect, it } from "vitest";
import {
  buildColumnRecommendations,
  buildDatasetInsightsSummary,
  buildEnrichedSchemaColumnRows,
  classifyColumnHealth,
  filterEnrichedSchemaRows,
  inferColumnRoleChips,
  isHighCardinalityCategorical,
  isLikelyBusinessField,
} from "@/lib/data-preview-phase-b";
import {
  classifyColumnTypeBadge,
  type DataPreviewProfile,
} from "@/lib/data-preview-schema";

const profile: DataPreviewProfile = {
  column_types: {
    order_id: "text",
    order_date: "date",
    campaign_name: "category",
    region: "category",
    revenue: "number",
    profit: "number",
    conversion_rate: "number",
    is_active: "category",
    channel: "category",
  },
  null_counts: {
    order_id: 0,
    order_date: 0,
    campaign_name: 0,
    region: 0,
    revenue: 0,
    profit: 0,
    conversion_rate: 0,
    is_active: 0,
    channel: 0,
  },
  unique_counts: {
    order_id: 180,
    campaign_name: 12,
    region: 4,
    channel: 3,
  },
};

const columns = [
  "order_id",
  "order_date",
  "campaign_name",
  "region",
  "revenue",
  "profit",
  "conversion_rate",
  "is_active",
  "channel",
];

const preview = Array.from({ length: 50 }, (_, i) => ({
  order_id: `ORD-${i + 1}`,
  order_date: `2026-01-${String((i % 28) + 1).padStart(2, "0")}`,
  campaign_name: i % 3 === 0 ? "Spring" : "Summer",
  region: i % 2 === 0 ? "East" : "West",
  revenue: 100 + i,
  profit: 20 + i,
  conversion_rate: 5 + (i % 10),
  is_active: i % 2 === 0 ? "true" : "false",
  channel: i % 2 === 0 ? "Email" : "Paid",
}));

const mapping = {
  sales: "revenue",
  product: "campaign_name",
  date: "order_date",
  region: "region",
};

describe("data preview phase B", () => {
  describe("classifyColumnHealth", () => {
    it("marks excellent when no nulls and low cardinality", () => {
      expect(
        classifyColumnHealth({ nullPercent: 0, highCardinality: false })
      ).toBe("excellent");
    });

    it("marks warning when null percent is positive", () => {
      expect(
        classifyColumnHealth({ nullPercent: 5, highCardinality: false })
      ).toBe("warning");
    });

    it("marks warning when high cardinality categorical", () => {
      expect(
        classifyColumnHealth({ nullPercent: 0, highCardinality: true })
      ).toBe("warning");
    });

    it("marks review when null percent exceeds 20%", () => {
      expect(
        classifyColumnHealth({ nullPercent: 25, highCardinality: false })
      ).toBe("review");
    });
  });

  describe("inferColumnRoleChips", () => {
    it("infers currency and metric for revenue", () => {
      const badge = classifyColumnTypeBadge("revenue", "number");
      expect(
        inferColumnRoleChips({
          column: "revenue",
          type: "number",
          badge,
          mapping,
          isIdentifier: false,
        })
      ).toEqual(expect.arrayContaining(["Currency", "Metric"]));
    });

    it("infers currency and metric for profit", () => {
      const badge = classifyColumnTypeBadge("profit", "number");
      expect(
        inferColumnRoleChips({
          column: "profit",
          type: "number",
          badge,
          mapping,
          isIdentifier: false,
        })
      ).toEqual(expect.arrayContaining(["Currency", "Metric"]));
    });

    it("infers percentage for conversion_rate", () => {
      const badge = classifyColumnTypeBadge("conversion_rate", "number");
      expect(
        inferColumnRoleChips({
          column: "conversion_rate",
          type: "number",
          badge,
          mapping,
          isIdentifier: false,
        })
      ).toEqual(expect.arrayContaining(["Percentage"]));
    });

    it("infers boolean for is_active", () => {
      const badge = classifyColumnTypeBadge("is_active", "category");
      expect(
        inferColumnRoleChips({
          column: "is_active",
          type: "category",
          badge,
          mapping,
          isIdentifier: false,
        })
      ).toEqual(expect.arrayContaining(["Boolean"]));
    });

    it("infers category for campaign_name", () => {
      const badge = classifyColumnTypeBadge("campaign_name", "category");
      expect(
        inferColumnRoleChips({
          column: "campaign_name",
          type: "category",
          badge,
          mapping,
          isIdentifier: false,
        })
      ).toEqual(expect.arrayContaining(["Category", "Dimension"]));
    });

    it("infers location for region", () => {
      const badge = classifyColumnTypeBadge("region", "category");
      expect(
        inferColumnRoleChips({
          column: "region",
          type: "category",
          badge,
          mapping,
          isIdentifier: false,
        })
      ).toEqual(expect.arrayContaining(["Location"]));
    });

    it("infers identifier for order_id", () => {
      const badge = classifyColumnTypeBadge("order_id", "text");
      expect(
        inferColumnRoleChips({
          column: "order_id",
          type: "text",
          badge,
          mapping,
          isIdentifier: true,
        })
      ).toEqual(expect.arrayContaining(["Identifier"]));
    });
  });

  describe("isLikelyBusinessField", () => {
    it("detects common business column names", () => {
      expect(isLikelyBusinessField("revenue")).toBe(true);
      expect(isLikelyBusinessField("total_sales_amount")).toBe(true);
      expect(isLikelyBusinessField("campaign_name")).toBe(true);
      expect(isLikelyBusinessField("region")).toBe(true);
      expect(isLikelyBusinessField("internal_code")).toBe(false);
    });
  });

  describe("isHighCardinalityCategorical", () => {
    it("flags high unique ratio in preview sample", () => {
      const highCardPreview = Array.from({ length: 20 }, (_, i) => ({
        sku: `SKU-${i}`,
      }));
      expect(
        isHighCardinalityCategorical({
          column: "sku",
          type: "category",
          isIdentifier: false,
          preview: highCardPreview,
          uniqueCount: 18,
          totalRows: 20,
        })
      ).toBe(true);
    });
  });

  describe("buildDatasetInsightsSummary", () => {
    it("generates compact KPI chips and detected-column notes", () => {
      const result = buildDatasetInsightsSummary({
        columns,
        profile,
        preview,
        totalRows: 180,
        mapping,
      });
      expect(result.kpis).toEqual(
        expect.arrayContaining([
          { value: "180", label: "Rows" },
          { value: "9", label: "Columns" },
          { value: "1", label: "Date column" },
        ])
      );
      expect(result.notes.some((n) => n.includes("Identifier: order_id"))).toBe(true);
      expect(result.notes.some((n) => n.includes("Date: order_date"))).toBe(true);
      expect(result.notes.some((n) => n.includes("Location: region"))).toBe(true);
      expect(result.notes.some((n) => n.includes("Detected"))).toBe(false);
    });

    it("includes empty-state notes when date, metric, or identifier missing", () => {
      const sparseProfile: DataPreviewProfile = {
        column_types: { status: "text" },
        null_counts: { status: 0 },
      };
      const result = buildDatasetInsightsSummary({
        columns: ["status"],
        profile: sparseProfile,
        preview: [{ status: "open" }, { status: "open" }, { status: "closed" }],
        totalRows: 3,
        mapping: {},
      });
      expect(result.notes.some((n) => n.includes("No date column detected"))).toBe(true);
      expect(result.notes.some((n) => n.includes("No numeric metrics detected"))).toBe(
        true
      );
      expect(result.notes.some((n) => n.includes("No obvious identifier detected"))).toBe(
        true
      );
    });
  });

  describe("buildColumnRecommendations", () => {
    it("recommends filtering for identifiers", () => {
      const rec = buildColumnRecommendations({
        roleChips: ["Identifier"],
        typeBadge: "text",
      });
      expect(rec.goodFor).toEqual(
        expect.arrayContaining(["Filtering", "Record lookup", "Drill-through"])
      );
      expect(rec.avoid).toContain("Aggregation charts");
    });

    it("recommends trends for time columns", () => {
      const rec = buildColumnRecommendations({
        roleChips: ["Time"],
        typeBadge: "date",
      });
      expect(rec.goodFor).toEqual(expect.arrayContaining(["Trends", "Time analysis"]));
    });

    it("recommends grouping for category columns", () => {
      const rec = buildColumnRecommendations({
        roleChips: ["Category", "Dimension"],
        typeBadge: "category",
      });
      expect(rec.goodFor).toEqual(
        expect.arrayContaining(["Grouping", "Ranking", "Comparisons"])
      );
    });

    it("recommends KPIs for metrics", () => {
      const rec = buildColumnRecommendations({
        roleChips: ["Metric"],
        typeBadge: "number",
      });
      expect(rec.goodFor).toEqual(
        expect.arrayContaining(["KPIs", "Aggregations", "Charts"])
      );
    });

    it("recommends revenue analysis for currency", () => {
      const rec = buildColumnRecommendations({
        roleChips: ["Currency", "Metric"],
        typeBadge: "currency",
      });
      expect(rec.goodFor).toEqual(
        expect.arrayContaining(["Revenue analysis", "Executive dashboards"])
      );
    });
  });

  describe("buildEnrichedSchemaColumnRows", () => {
    it("adds health and role chips to schema rows", () => {
      const rows = buildEnrichedSchemaColumnRows({
        columns,
        profile,
        preview,
        totalRows: 180,
        mapping,
      });
      const revenue = rows.find((r) => r.name === "revenue");
      expect(revenue?.health).toBe("excellent");
      expect(revenue?.roleChips).toEqual(
        expect.arrayContaining(["Currency", "Metric"])
      );
    });

    it("filters enriched rows by health and role chips", () => {
      const rows = buildEnrichedSchemaColumnRows({
        columns,
        profile,
        preview,
        totalRows: 180,
        mapping,
      });
      expect(filterEnrichedSchemaRows(rows, "currency")).toHaveLength(2);
      expect(filterEnrichedSchemaRows(rows, "excellent").length).toBeGreaterThan(0);
    });
  });
});
