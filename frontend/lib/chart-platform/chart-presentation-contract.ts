import type { ChartKind, ChartRow } from "@/app/chart-types";

export type ChartContractVersion = 1;

export type ChartContractSource =
  | "auto_dashboard"
  | "ai_insights"
  | "charts"
  | "manual";

export type ChartStoryType =
  | "kpi"
  | "trend"
  | "ranking"
  | "comparison"
  | "composition"
  | "relationship"
  | "distribution"
  | "geographic"
  | "unknown";

export type ChartRendererFamily =
  | "cartesian"
  | "horizontal_bar"
  | "radial"
  | "scatter"
  | "kpi";

export type ChartOrientation =
  | "vertical"
  | "horizontal"
  | "radial"
  | "cartesian2d"
  | "none";

export type ChartAxisRole =
  | "metric"
  | "category"
  | "time"
  | "bucket"
  | "scatter_x"
  | "scatter_y";

export type ChartPresentationAxis = {
  role: ChartAxisRole;
  label: string;
  sourceColumn?: string | null;
  displayColumn?: string | null;
  grain?: string | null;
};

export type ChartPresentationMetadataChip = {
  id: string;
  kind: "labeled" | "mono" | "lead";
  label?: string;
  value: string;
  title?: string;
};

export type ChartPresentationContract = {
  version: ChartContractVersion;
  identity: {
    chartId: string;
    source: ChartContractSource;
    datasetEpoch?: number | null;
    sourceQuestion?: string | null;
    dashboardChartKey?: string | null;
  };
  story: {
    type: ChartStoryType;
    reason?: string | null;
    coverageBucket?: string | null;
  };
  kind: {
    apiChartType: string;
    resolvedKind: ChartKind;
    rendererFamily: ChartRendererFamily;
    orientation: ChartOrientation;
  };
  data: {
    rows: ChartRow[];
    rowCount: number;
    groupCount: number;
    categoryCount: number;
    hasFiniteValues: boolean;
  };
  semantics: {
    title: string;
    subtitle?: string | null;
    metric: ChartPresentationAxis;
    category?: ChartPresentationAxis | null;
    xAxis?: ChartPresentationAxis | null;
    yAxis?: ChartPresentationAxis | null;
    aggregation?: string | null;
  };
  metadata: {
    chips: ChartPresentationMetadataChip[];
    warning?: string | null;
    leadInsight?: string | null;
  };
  legacy: {
    visualizationContractId?: string | null;
    rendererStillSurfaceOwned: true;
    exportStillSurfaceOwned: true;
  };
};

export function chartRendererFamilyForKind(kind: ChartKind): ChartRendererFamily {
  if (kind === "bar_horizontal") return "horizontal_bar";
  if (kind === "pie" || kind === "donut") return "radial";
  if (kind === "scatter") return "scatter";
  return "cartesian";
}

export function chartOrientationForKind(kind: ChartKind): ChartOrientation {
  if (kind === "bar_horizontal") return "horizontal";
  if (kind === "pie" || kind === "donut") return "radial";
  if (kind === "scatter") return "cartesian2d";
  if (!kind) return "none";
  return "vertical";
}
