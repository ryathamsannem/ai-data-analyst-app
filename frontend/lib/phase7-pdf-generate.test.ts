/**
 * Phase 7 — generate validation PDFs to docs/pdf-validation-screenshots/
 * Run: cd frontend && npx vitest run --config vitest.phase7.config.ts
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ChartRow } from "@/app/chart-types";
import type { ExecutivePdfExportInput } from "@/app/pdf-report";
import { buildExportPdfFilename } from "@/lib/branding-config";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = join(ROOT, "docs/pdf-validation-screenshots");
const MANIFEST = join(OUT, "phase7-manifest.json");
const FRONTEND = join(ROOT, "frontend");
const EXPORT_PDF = join(FRONTEND, buildExportPdfFilename());

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

const SECTION_MARKERS = {
  kpi: /KPI dashboard/i,
  aiInsight: /AI insight/i,
  chart: /Visualization/i,
  preview: /Appendix: Sample data/i,
  dataQuality: /Data quality/i,
  conversation: /AI conversation thread/i,
  appendix: /Appendix: Technical details/i,
  executiveSummary: /Executive summary/i,
  pageFooter: /Page \d+ of \d+/i,
} as const;

type ManifestEntry = {
  dataset: DatasetKey;
  combo: ComboId;
  file: string;
  pageCount: number;
  textLength: number;
  markers: Record<string, boolean>;
  failures: string[];
};

const manifest: ManifestEntry[] = [];

/** Cold import of pdf-report can exceed Vitest's 5s default on first run. */
const PHASE7_TEST_TIMEOUT_MS = 30_000;
const PHASE7_WARMUP_TIMEOUT_MS = 60_000;

type RunExecutivePdfExport = (
  input: ExecutivePdfExportInput
) => Promise<void>;

let runExecutivePdfExport: RunExecutivePdfExport;

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
      ? Array.from(
          { length: 12 },
          (_, i) =>
            `Paragraph ${i + 1}: Mumbai revenue leadership reflects sustained demand in the North corridor with supporting evidence from grouped totals.`
        ).join(" ")
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
      label: "Sample duplicate-like rows (preview check)",
      note: "Preview duplicate check only.",
    }),
    chartAxisLabels: { category: "City", value: "Revenue" },
    conversationAppendix: thread,
  };
}

function expectedMarkers(combo: ComboId): Record<string, boolean> {
  const always = { executiveSummary: true, pageFooter: true };
  /** Phase 7 fixture has 2 KPI cards — all fit in snapshot; dashboard section is skipped. */
  const kpiDashboard = false;
  switch (combo) {
    case "kpi_only":
      return {
        ...always,
        kpi: kpiDashboard,
        aiInsight: false,
        chart: false,
        preview: false,
        dataQuality: false,
        conversation: false,
        appendix: false,
      };
    case "kpi_insight":
      return {
        ...always,
        kpi: kpiDashboard,
        aiInsight: true,
        chart: false,
        preview: false,
        dataQuality: false,
        conversation: false,
        appendix: false,
      };
    case "kpi_insight_chart":
      return {
        ...always,
        kpi: kpiDashboard,
        aiInsight: true,
        chart: true,
        preview: false,
        dataQuality: false,
        conversation: false,
        appendix: false,
      };
    case "all_sections":
      return {
        ...always,
        kpi: kpiDashboard,
        aiInsight: true,
        chart: true,
        preview: true,
        dataQuality: true,
        conversation: true,
        appendix: true,
      };
    case "conversation_only":
      return {
        ...always,
        kpi: false,
        aiInsight: false,
        chart: false,
        preview: false,
        dataQuality: false,
        conversation: true,
        appendix: false,
      };
    case "appendix_only":
      return {
        ...always,
        kpi: false,
        aiInsight: false,
        chart: false,
        preview: false,
        dataQuality: false,
        conversation: false,
        appendix: true,
      };
    default:
      return always;
  }
}

function extractPdfTextFromBuffer(buf: Buffer): string {
  return buf.toString("latin1");
}

function pageCountFromText(text: string): number {
  const matches = [...text.matchAll(/Page \d+ of (\d+)/g)];
  if (matches.length > 0) {
    return Number(matches[matches.length - 1][1]);
  }
  return Math.max(1, (text.match(/\/Type\s*\/Page\b/g) ?? []).length);
}

function loadPdfFromFile(path: string): { buf: Buffer; pageCount: number; text: string } {
  const buf = readFileSync(path);
  const text = extractPdfTextFromBuffer(buf);
  return { buf, pageCount: pageCountFromText(text), text };
}

describe.sequential("Phase 7 PDF generate + validate", () => {
  beforeAll(async () => {
    mkdirSync(OUT, { recursive: true });
    globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    }) as typeof requestAnimationFrame;
    const mod = await import("@/app/pdf-report");
    runExecutivePdfExport = mod.runExecutivePdfExport;
  }, PHASE7_WARMUP_TIMEOUT_MS);

  afterAll(() => {
    writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2));
    if (existsSync(EXPORT_PDF)) unlinkSync(EXPORT_PDF);
  });

  for (const dataset of DATASETS) {
    for (const combo of COMBOS) {
      it(
        `${dataset} / ${combo}`,
        async () => {
        if (existsSync(EXPORT_PDF)) unlinkSync(EXPORT_PDF);
        const input = buildInput(dataset, combo);
        await runExecutivePdfExport(input);

        expect(existsSync(EXPORT_PDF), "PDF file not written by jsPDF.save").toBe(
          true
        );
        const fileName = `phase7-${dataset}-${combo}.pdf`;
        const dest = join(OUT, fileName);
        renameSync(EXPORT_PDF, dest);
        const { pageCount, text } = loadPdfFromFile(dest);

        const markers: Record<string, boolean> = {};
        for (const [key, re] of Object.entries(SECTION_MARKERS)) {
          markers[key] = re.test(text);
        }

        const failures: string[] = [];
        const expected = expectedMarkers(combo);
        for (const [key, want] of Object.entries(expected)) {
          if (markers[key] !== want) {
            failures.push(
              `${key}: expected ${want ? "present" : "absent"}, got ${markers[key] ? "present" : "absent"}`
            );
          }
        }

        if (combo === "all_sections") {
          if (pageCount < 3) {
            failures.push(`pageCount: expected >=3, got ${pageCount}`);
          }
          if (/\{"/.test(text) || /"column_types"/.test(text)) {
            failures.push("raw JSON leaked into PDF text");
          }
        }

        if (combo === "conversation_only" || combo === "all_sections") {
          const questions = [
            "Which city generates the highest revenue?",
            "Why is Mumbai highest?",
            "What evidence supports this conclusion?",
            "Which columns were used for this analysis?",
            "Show the calculations behind this answer.",
          ];
          for (const q of questions) {
            if (!text.includes(q)) failures.push(`conversation missing: ${q}`);
          }
          const baseMatches =
            text.match(/Which city generates the highest revenue/gi)?.length ?? 0;
          if (baseMatches > 2) {
            failures.push(`conversation duplicate base question (${baseMatches}x)`);
          }
        }

        if (combo === "appendix_only" || combo === "all_sections") {
          if (!/Analysis metadata|Primary Metric|Aggregation/i.test(text)) {
            failures.push("appendix metadata block missing");
          }
          if (!/High|Medium|Low/i.test(text)) {
            failures.push("appendix confidence missing");
          }
          if (!/Provenance notes/i.test(text)) {
            failures.push("appendix provenance notes heading missing");
          }
          if (!/Routing:|revenue by city|Primary Metric/i.test(text)) {
            failures.push(
              "routing/provenance not surfaced in appendix (no routing plan block)"
            );
          }
        }

        if (combo === "all_sections") {
          for (const col of buildInput(dataset, combo).preview.columns.slice(0, 4)) {
            if (!text.includes(col)) {
              failures.push(`data preview column header missing: ${col}`);
            }
          }
        }

        manifest.push({
          dataset,
          combo,
          file: fileName,
          pageCount,
          textLength: text.length,
          markers,
          failures,
        });

        expect(failures, failures.join("; ")).toEqual([]);
        },
        PHASE7_TEST_TIMEOUT_MS
      );
    }
  }
});
