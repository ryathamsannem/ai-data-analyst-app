import type { ChartKind } from "@/app/chart-types";
import type { PresentationExportSpec } from "@/lib/chart-png-export-layout";
import {
  buildPresentationExportSpec,
  type PresentationCaptureLayoutOptions,
} from "@/lib/chart-png-export-layout";
import type { ChartPresentationContract } from "@/lib/chart-platform/chart-presentation-contract";
import {
  compareAxisPresentationPlans,
  formatAxisPresentationPlanSummary,
  resolveAxisPresentationPlan,
  type AxisPresentationPlan,
} from "@/lib/chart-platform/axis-presentation-plan";

export type ChartPresentationProfileId =
  | "overviewLive"
  | "overviewPng"
  | "chartsLive"
  | "chartsPng"
  | "aiInsightsLive"
  | "pdfChart";

export type ChartPresentationSurface =
  | "overview"
  | "charts"
  | "aiInsights"
  | "png"
  | "pdf";

export type ChartAspectPolicy =
  | "compact-card"
  | "presentation-canvas"
  | "detail-viewport"
  | "pdf-embed";

export type ChartMetadataMode =
  | "contract-chips"
  | "compact-contract-chips"
  | "pdf-native-context"
  | "none";

export type PdfChartEmbedPolicy = {
  maxHeightMm: number;
  minWidthRatio: number;
  minAspectRatio?: number;
  maxAspectRatio?: number;
};

export type ChartPresentationProfile = {
  id: ChartPresentationProfileId;
  surface: ChartPresentationSurface;
  chartId: string;
  chartKind: ChartKind;
  captureWidth: number | null;
  captureHeight: number | null;
  plotHeight: number | null;
  canvasWidth: number | null;
  canvasHeight: number | null;
  pdfMaxHeightMm: number | null;
  pdfEmbed?: PdfChartEmbedPolicy | null;
  aspectPolicy: ChartAspectPolicy;
  metadataMode: ChartMetadataMode;
  axisPolicyId: string;
  axisPresentationPlan: AxisPresentationPlan;
};

type BuildChartPresentationProfileArgs = {
  id: ChartPresentationProfileId;
  contract: ChartPresentationContract;
  kind: ChartKind;
  categoryCount?: number;
  spec?: PresentationExportSpec;
};

const LIVE_PROFILE_DEFAULTS: Record<
  Extract<ChartPresentationProfileId, "overviewLive" | "chartsLive" | "aiInsightsLive">,
  Pick<
    ChartPresentationProfile,
    | "surface"
    | "captureWidth"
    | "captureHeight"
    | "plotHeight"
    | "canvasWidth"
    | "canvasHeight"
    | "pdfMaxHeightMm"
    | "pdfEmbed"
    | "aspectPolicy"
    | "metadataMode"
  >
> = {
  overviewLive: {
    surface: "overview",
    captureWidth: null,
    captureHeight: null,
    plotHeight: null,
    canvasWidth: null,
    canvasHeight: null,
    pdfMaxHeightMm: null,
    pdfEmbed: null,
    aspectPolicy: "compact-card",
    metadataMode: "compact-contract-chips",
  },
  chartsLive: {
    surface: "charts",
    captureWidth: null,
    captureHeight: null,
    plotHeight: null,
    canvasWidth: null,
    canvasHeight: null,
    pdfMaxHeightMm: null,
    pdfEmbed: null,
    aspectPolicy: "detail-viewport",
    metadataMode: "contract-chips",
  },
  aiInsightsLive: {
    surface: "aiInsights",
    captureWidth: null,
    captureHeight: null,
    plotHeight: null,
    canvasWidth: null,
    canvasHeight: null,
    pdfMaxHeightMm: null,
    pdfEmbed: null,
    aspectPolicy: "detail-viewport",
    metadataMode: "contract-chips",
  },
};

export function resolvePdfChartEmbedPolicy(kind: ChartKind): PdfChartEmbedPolicy {
  switch (kind) {
    case "bar_horizontal":
      return { maxHeightMm: 158, minWidthRatio: 0.74 };
    case "pie":
    case "donut":
      return {
        maxHeightMm: 108,
        minWidthRatio: 0.58,
        minAspectRatio: 0.42,
        maxAspectRatio: 1.6,
      };
    case "line":
    case "area":
      return {
        maxHeightMm: 158,
        minWidthRatio: 0.9,
        minAspectRatio: 0.36,
        maxAspectRatio: 2.1,
      };
    case "scatter":
      return {
        maxHeightMm: 150,
        minWidthRatio: 0.92,
        minAspectRatio: 0.62,
        maxAspectRatio: 1.55,
      };
    case "bar":
      return {
        maxHeightMm: 158,
        minWidthRatio: 0.88,
        minAspectRatio: 0.58,
      };
    default:
      return { maxHeightMm: 145, minWidthRatio: 0.78 };
  }
}

function captureProfileDefaults(
  id: Exclude<ChartPresentationProfileId, keyof typeof LIVE_PROFILE_DEFAULTS>,
  spec: PresentationExportSpec,
  kind: ChartKind
): Pick<
  ChartPresentationProfile,
  | "surface"
  | "captureWidth"
  | "captureHeight"
  | "plotHeight"
  | "canvasWidth"
  | "canvasHeight"
  | "pdfMaxHeightMm"
  | "pdfEmbed"
  | "aspectPolicy"
  | "metadataMode"
> {
  if (id === "pdfChart") {
    const pdfEmbed = resolvePdfChartEmbedPolicy(kind);
    return {
      surface: "pdf",
      captureWidth: spec.width,
      captureHeight: spec.height,
      plotHeight: spec.height,
      canvasWidth: spec.canvasWidth,
      canvasHeight: spec.canvasHeight,
      pdfMaxHeightMm: pdfEmbed.maxHeightMm,
      pdfEmbed,
      aspectPolicy: "pdf-embed",
      metadataMode: "pdf-native-context",
    };
  }
  return {
    surface: "png",
    captureWidth: spec.width,
    captureHeight: spec.height,
    plotHeight: spec.height,
    canvasWidth: spec.canvasWidth,
    canvasHeight: spec.canvasHeight,
    pdfMaxHeightMm: null,
    pdfEmbed: null,
    aspectPolicy: "presentation-canvas",
    metadataMode: "contract-chips",
  };
}

function axisPolicyIdForProfile(
  id: ChartPresentationProfileId,
  kind: ChartKind
): string {
  const family =
    kind === "bar_horizontal"
      ? "horizontal-bar"
      : kind === "pie" || kind === "donut"
        ? "radial"
        : kind === "scatter"
          ? "scatter"
          : kind === "line" || kind === "area"
            ? "trend"
            : "cartesian";
  if (id === "overviewLive" || id === "overviewPng") {
    return `overview-inline:${family}:v1`;
  }
  return `chart-renderer:${family}:v1`;
}

export function buildChartPresentationProfile({
  id,
  contract,
  kind,
  categoryCount,
  spec,
}: BuildChartPresentationProfileArgs): ChartPresentationProfile {
  const options: PresentationCaptureLayoutOptions = {
    categoryCount: categoryCount ?? contract.data.categoryCount,
  };
  const exportSpec = spec ?? buildPresentationExportSpec(kind, options);
  const defaults =
    id in LIVE_PROFILE_DEFAULTS
      ? LIVE_PROFILE_DEFAULTS[id as keyof typeof LIVE_PROFILE_DEFAULTS]
      : captureProfileDefaults(
          id as Exclude<ChartPresentationProfileId, keyof typeof LIVE_PROFILE_DEFAULTS>,
          exportSpec,
          kind
        );

  return {
    id,
    ...defaults,
    chartId: contract.identity.chartId,
    chartKind: kind,
    axisPolicyId: axisPolicyIdForProfile(id, kind),
    axisPresentationPlan: resolveAxisPresentationPlan({
      profileId: id,
      contract,
      kind,
      spec: id in LIVE_PROFILE_DEFAULTS ? null : exportSpec,
    }),
  };
}

export function formatChartPresentationProfileSummary(
  profile: ChartPresentationProfile
): Record<string, string | number | null> {
  return {
    id: profile.id,
    kind: profile.chartKind,
    surface: profile.surface,
    captureWidth: profile.captureWidth,
    captureHeight: profile.captureHeight,
    plotHeight: profile.plotHeight,
    canvasWidth: profile.canvasWidth,
    canvasHeight: profile.canvasHeight,
    pdfMaxHeightMm: profile.pdfMaxHeightMm,
    pdfEmbedMaxHeightMm: profile.pdfEmbed?.maxHeightMm ?? null,
    pdfEmbedMinWidthRatio: profile.pdfEmbed?.minWidthRatio ?? null,
    axisPolicyId: profile.axisPolicyId,
    axisPlanId: profile.axisPresentationPlan.planId,
    axisPlanStatus: profile.axisPresentationPlan.status,
    metadataMode: profile.metadataMode,
    aspectPolicy: profile.aspectPolicy,
  };
}

type ProfileDiagnosticRecord = {
  profile: ChartPresentationProfile;
  artifactWidthPx?: number | null;
  artifactHeightPx?: number | null;
};

const profileDiagnosticsByChart = new Map<
  string,
  Partial<Record<ChartPresentationProfileId, ProfileDiagnosticRecord>>
>();

function profileComparisonKey(profile: ChartPresentationProfile): string {
  return `${profile.chartId}::${profile.chartKind}`;
}

function compareProfiles(
  label: string,
  a: ChartPresentationProfile,
  b: ChartPresentationProfile
): void {
  const axisPlanMismatches = compareAxisPresentationPlans(
    a.axisPresentationPlan,
    b.axisPresentationPlan
  );
  const mismatches = [
    a.axisPolicyId !== b.axisPolicyId
      ? `axisPolicyId ${a.id}=${a.axisPolicyId} ${b.id}=${b.axisPolicyId}`
      : "",
    ...axisPlanMismatches.map((mismatch) => `axisPresentationPlan ${mismatch}`),
    a.metadataMode !== b.metadataMode
      ? `metadataMode ${a.id}=${a.metadataMode} ${b.id}=${b.metadataMode}`
      : "",
  ].filter(Boolean);
  if (mismatches.length > 0) {
    console.warn(`[chart-profile] ${label}`, mismatches, {
      [a.id]: formatChartPresentationProfileSummary(a),
      [b.id]: formatChartPresentationProfileSummary(b),
      axisPresentationPlans: {
        [a.id]: formatAxisPresentationPlanSummary(a.axisPresentationPlan),
        [b.id]: formatAxisPresentationPlanSummary(b.axisPresentationPlan),
      },
    });
  }
}

export function logChartPresentationProfileDiagnostics(args: {
  profile: ChartPresentationProfile;
  artifactWidthPx?: number | null;
  artifactHeightPx?: number | null;
}): void {
  if (process.env.NODE_ENV === "production") return;

  const key = profileComparisonKey(args.profile);
  const record = profileDiagnosticsByChart.get(key) ?? {};
  record[args.profile.id] = {
    profile: args.profile,
    artifactWidthPx: args.artifactWidthPx ?? null,
    artifactHeightPx: args.artifactHeightPx ?? null,
  };
  profileDiagnosticsByChart.set(key, record);

  console.info("[chart-profile] artifact dimensions", {
    kind: args.profile.chartKind,
    profile: args.profile.id,
    artifactWidthPx: args.artifactWidthPx ?? null,
    artifactHeightPx: args.artifactHeightPx ?? null,
    profileSummary: formatChartPresentationProfileSummary(args.profile),
  });

  const overview = record.overviewPng?.profile;
  const charts = record.chartsPng?.profile;
  const pdf = record.pdfChart?.profile;
  if (overview && charts) {
    compareProfiles("Overview PNG vs Charts PNG", overview, charts);
  }
  if (charts && pdf) {
    compareProfiles("Charts PNG vs PDF", charts, pdf);
  }
}
