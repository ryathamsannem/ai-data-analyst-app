/**
 * Generate Phase 7 validation PDFs (no app source changes).
 * Run: cd frontend && npx tsx ../docs/phase7-pdf-generate.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as jspdfModule from "jspdf";
import type { ChartRow } from "../frontend/app/chart-types";
import type { ExecutivePdfExportInput } from "../frontend/app/pdf-report";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "docs/pdf-validation-screenshots");
const MANIFEST = join(OUT, "phase7-manifest.json");

let captured: jspdfModule.jsPDF | null = null;

const RealJsPDF = jspdfModule.jsPDF;
class CapturingJsPDF extends RealJsPDF {
  save(_filename: string) {
    captured = this;
  }
}
(jspdfModule as { jsPDF: typeof RealJsPDF }).jsPDF = CapturingJsPDF as typeof RealJsPDF;

globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
  cb(0);
  return 0;
}) as typeof requestAnimationFrame;

type DatasetKey = "retail" | "generic" | "geographic";
type ComboId =
  | "kpi_only"
  | "kpi_insight"
  | "kpi_insight_chart"
  | "all_sections"
  | "conversation_only"
  | "appendix_only";

const DATASETS: DatasetKey[] = ["retail", "generic", "geographic"];
const COMBOS: ComboId[] = [
  "kpi_only",
  "kpi_insight",
  "kpi_insight_chart",
  "all_sections",
  "conversation_only",
  "appendix_only",
];

function chartRows(labels: string[], values: number[]): ChartRow[] {
  return labels.map((name, i) => ({
    name,
    value: values[i] ?? 0,
    displayValue: String(values[i] ?? 0),
  }));
}

function comboIncludes(combo: ComboId): ExecutivePdfExportInput["includes"] {
  const base = {
    includeKPIs: false,
    includeAIInsight: false,
    includeChart: false,
    includeDataPreview: false,
    includeDataQuality: false,
    includeConversationContext: false,
    includeTechnicalAppendix: false,
    pdfMode: "executive" as const,
  };
  const map: Record<ComboId, ExecutivePdfExportInput["includes"]> = {
    kpi_only: { ...base, includeKPIs: true },
    kpi_insight: { ...base, includeKPIs: true, includeAIInsight: true },
    kpi_insight_chart: {
      ...base,
      includeKPIs: true,
      includeAIInsight: true,
      includeChart: true,
    },
    all_sections: {
      ...base,
      includeKPIs: true,
      includeAIInsight: true,
      includeChart: true,
      includeDataPreview: true,
      includeDataQuality: true,
      includeConversationContext: true,
      includeTechnicalAppendix: true,
    },
    conversation_only: { ...base, includeConversationContext: true },
    appendix_only: { ...base, includeTechnicalAppendix: true },
  };
  return map[combo];
}

function buildInput(dataset: DatasetKey, combo: ComboId): ExecutivePdfExportInput {
  const includes = comboIncludes(combo);
  const cols: Record<DatasetKey, string[]> = {
    retail: [
      "order_date",
      "region",
      "city",
      "product",
      "revenue",
      "cost",
      "units",
      "customer_satisfaction",
    ],
    generic: [
      "report_date",
      "region",
      "department",
      "category",
      "revenue",
      "cost",
      "units",
      "satisfaction_score",
    ],
    geographic: ["state", "city", "revenue", "customers", "growth_rate"],
  };
  const fileNames: Record<DatasetKey, string> = {
    retail: "retail_analytics_regression.csv",
    generic: "domain_quality_generic.csv",
    geographic: "geographic_performance.csv",
  };
  const previewRow =
    dataset === "retail"
      ? {
          order_date: "2025-01-01",
          region: "North",
          city: "Mumbai",
          product: "Laptop",
          revenue: 120000,
          cost: 80000,
          units: 40,
          customer_satisfaction: 92,
        }
      : dataset === "generic"
        ? {
            report_date: "2025-01-01",
            region: "North",
            department: "Sales",
            category: "Product-A",
            revenue: 120000,
            cost: 85000,
            units: 400,
            satisfaction_score: 91,
          }
        : {
            state: "Maharashtra",
            city: "Mumbai",
            revenue: 520000,
            customers: 4200,
            growth_rate: 18,
          };

  const thread =
    combo === "all_sections" || combo === "conversation_only"
      ? {
          questionThread: [
            "Which city generates the highest revenue?",
            "Why is Mumbai highest?",
            "What evidence supports this conclusion?",
            "Which columns were used for this analysis?",
            "Show the calculations behind this answer.",
          ],
          inheritedFilters: [] as string[],
          activeDrillPath: [] as string[],
          inheritedAssumptionNote: null,
        }
      : null;

  const longAnswer =
    combo === "all_sections"
      ? `${"Detailed narrative paragraph. ".repeat(80)} End of long answer.`
      : "Mumbai generates the highest total revenue at 712,000 in this cohort.";

  return {
    includes,
    branding: {
      companyName: "Phase 7 QA",
      tagline: "PDF export validation",
      accentHex: "#2563eb",
    },
    dataset: {
      rows: dataset === "retail" ? 15 : dataset === "generic" ? 20 : 8,
      colCount: cols[dataset].length,
      fileName: fileNames[dataset],
      datasetKind: dataset,
    },
    generatedAt: new Date("2026-06-06T12:00:00Z"),
    mappingConfidence: "High",
    execSummaryLines: [
      "Scope: filtered cohort from uploaded dataset.",
      "Main takeaway: Mumbai leads total revenue in this sample.",
      "Highest: Mumbai — 712,000",
    ],
    kpiSectionTitle: "KPI dashboard",
    kpiCards: [
      { title: "Total revenue", value: "712K", subtitle: "Top city: Mumbai" },
      { title: "Rows analyzed", value: "15", subtitle: "Filtered cohort" },
    ],
    question: "Which city generates the highest revenue?",
    answer: longAnswer,
    insightSections: {
      summary: longAnswer,
      statistical: "Spread between Mumbai and Chennai is approximately 35%.",
      recommendations: "Review city-level drivers before expanding spend.",
    },
    insightSummary: "Mumbai is the revenue leader in this sample.",
    insightConfidenceLevel: "High",
    insightConfidenceRationale:
      "Metric and dimension columns resolve cleanly with full cohort coverage.",
    routingPlan: {
      intent: "ranking",
      metricColumn: "revenue",
      dimensionColumn: "city",
      chartType: "bar",
    },
    provenance: {
      confidence: "High",
      rowsAnalyzed: 15,
      chartPoints: 3,
      aggregation: "Total sum",
      notes: "Routing: revenue by city; aggregation sum.",
    },
    chart: includes.includeChart
      ? {
          presentationKind: "bar_horizontal",
          data: chartRows(["Mumbai", "Pune", "Chennai"], [712000, 483000, 464000]),
          title: "Total revenue by city",
          subtitle: "Grouped comparison",
          captureEl: null,
          alignedMetric: "revenue",
          alignedMetricDisplay: "Revenue",
          aggregation: "Total sum",
        }
      : null,
    chartThumbnails: [
      {
        title: "Total revenue by city",
        kind: "bar_horizontal",
        values: [712000, 483000, 464000],
      },
    ],
    preview: { rows: [previewRow, previewRow], columns: cols[dataset] },
    profile: {
      null_counts: Object.fromEntries(cols[dataset].map((c) => [c, 0])),
    },
    previewDuplicates: () => ({
      duplicates: 0,
      note: "Estimated from preview excerpt.",
    }),
    chartAxisLabels: { category: "City", value: "Revenue" },
    conversationAppendix: thread,
  };
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const { runExecutivePdfExport } = await import("../frontend/app/pdf-report.ts");
  const manifest: Array<{
    dataset: DatasetKey;
    combo: ComboId;
    file: string;
    pages: number;
  }> = [];

  for (const dataset of DATASETS) {
    for (const combo of COMBOS) {
      captured = null;
      const input = buildInput(dataset, combo);
      await runExecutivePdfExport(input);
      if (!captured) throw new Error(`No PDF captured for ${dataset}/${combo}`);
      const name = `phase7-${dataset}-${combo}.pdf`;
      writeFileSync(join(OUT, name), Buffer.from(captured.output("arraybuffer")));
      manifest.push({
        dataset,
        combo,
        file: name,
        pages: captured.getNumberOfPages(),
      });
      console.log(`Wrote ${name} (${captured.getNumberOfPages()} pages)`);
    }
  }
  writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
