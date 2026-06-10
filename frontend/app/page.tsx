"use client";

import {
  useCallback,
  useDeferredValue,
  useEffect,
  useLayoutEffect,
  useMemo,
  memo,
  useRef,
  useState,
  useTransition,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import type { ChartKind, ChartRow } from "./chart-types";
import { fallbackChartNumericDisplay } from "./chart-types";
import {
  buildAxisLabelFromAggColumn,
  buildChartSubtitle,
  buildCompactAxisValueLabel,
  buildMetricLabel,
  compactAxisLabelFromFullPhrase,
  humanizeColumnName,
  polishMetricDisplay,
  remapLegacyKpiTitle,
  type MetricLabelContext,
} from "@/lib/analytics-metadata";
import {
  alternateNumericMetricLabels,
  buildAiFollowUpQuestionChips,
  filterMeaningfulFollowUpChips,
  isInvalidMetricCompareChip,
  isLowQualityFollowUpChip,
  buildProfitMarginFollowUpChips,
} from "@/lib/ai-follow-up-suggestions";
import {
  appendThreadMetaFollowUpChips,
  buildParentAnalysisContext,
  shouldSendFollowUpContinuation,
} from "@/lib/ai-conversation-context";
import {
  buildRankedCategoryExecutiveCards,
  parseRankedExecutiveInsights,
  rankedInsightsToExecutiveCards,
  type ExecutiveInsightAxisContext,
} from "@/lib/executive-insight-ranking";
import {
  buildInsightCardTitle,
  buildInsightDimensionCardTitle,
  isQuestionLikeLabel,
  resolveExecutiveDimensionLabel,
  resolveExecutiveMeasureLabel,
  type ResolveExecutiveMeasureArgs,
} from "@/lib/insight-card-titles";
import {
  balanceHorizontalOuterMargins,
  balanceVerticalOuterMargins,
  collectSampleTickStrings,
  computeCategoryAxisBottomMargin,
  computeHorizontalBarAxisLayout,
  wrapCategoryLabelLines,
  computeVerticalCategoryAxisPlan,
  computeVerticalValueAxisLayout,
  estimateCartesianPlotInnerWidthPx,
  type ChartLayoutMode,
  type VerticalCategoryAxisPlan,
} from "@/lib/chart-axis-layout";
import {
  computeLineAreaChartBottomMargin,
  computeLineAreaXAxisInterval,
  formatCompactTrendXAxisTickLabel,
  formatTrendXAxisTickLabel,
  lineAreaXAxisHeightPx,
  sortChartRowsChronologically,
  TREND_X_AXIS_ANGLE_DEG,
} from "@/lib/chart-time-x-axis";
import { chartLayoutWidthKey } from "@/lib/chart-axis-theme";
import {
  buildPresentationExportSpec,
  presentationCapturePlotStyle,
} from "@/lib/chart-png-export-layout";
import { ChartPngOffscreenHost } from "@/lib/chart-png-offscreen-host";
import {
  formatExecutiveMetricValue,
  formatMetricSpreadGap,
  metricFormatUsesPercent,
  type MetricFormatContext,
} from "@/lib/metric-value-format";
import { buildChartCartesianTooltipHandlers } from "@/lib/chart-tooltip-format";
import {
  chartHasRateAbove100,
  percentGapChipAriaLabel,
  RATE_EXCEEDS_100_WARNING,
} from "@/lib/chart-quality-warnings";
import { useMeasuredElementWidth } from "@/lib/use-measured-element-width";
import { CartesianXAxisTitleLabelContent } from "@/app/components/chart-value-axis-title";
import {
  alignInsightProvenanceToPresentation,
  buildFinalChartPresentationMeta,
  chartKindToApiChartType,
  chartKindToProvenanceLabel,
  computeFinalChartPresentation,
  resolveInsightRenderedChartKind,
} from "@/lib/final-chart-presentation";
import {
  getInsightLayoutMetrics,
  resolveChartsTabPreviewPlotHeight,
  timelineTypeToChartKind,
} from "@/lib/chart-layout-config";
import {
  chartsTabDesc,
  chartsTabDescEmphasis,
  chartsTabDownloadBtn,
  chartsTabEmptyState,
  chartsTabEmptyTitle,
  chartsTabHeaderRow,
  chartsTabPage,
  chartsTabSmartReadWrap,
  chartsTabTitle,
  chartsTabTimelineColumn,
  chartsTabPreviewHeaderSticky,
  chartsTabPngExportRoot,
  chartsTabSessionPlotSurface,
  chartsTabVizPlotStage,
  chartsTabVizHeaderZone,
  chartsTabVizKicker,
} from "@/lib/charts-tab-ui";
import {
  logAnalysisIntentToConsole,
  parseAnalysisIntent,
  SHOW_INTENT_DEBUG,
  type AnalysisIntentPayload,
} from "@/lib/analysis-intent-debug";
import { IntentEngineDebugPanel } from "@/app/components/intent-engine-debug-panel";
import { ChartsTabChartReason } from "@/app/components/home/charts-tab-chart-reason";
import { ChartsTabPlotTransition } from "@/app/components/home/charts-tab-plot-transition";
import { generateChartReason } from "@/lib/generate-chart-reason";
import { ChartInsightViewportWrapper } from "@/app/components/home/chart-insight-viewport-wrapper";
import {
  formatAxisTickFromRows,
} from "@/lib/chart-axis-formatters";
import type {
  ChartSemanticHeaderModel,
  ChartSemanticVizLike,
} from "@/lib/chart-semantic-metadata";
import {
  buildChartSemanticHeader,
  resolveHistogramMeasureChipLabel,
  resolveSemanticCategoryAxisForCharts,
} from "@/lib/chart-semantic-metadata";
import {
  buildNormalizedVizMetadata,
  normalizeAlignedAnalysisChartTitle,
  sanitizeKpiLabelPhrase,
  sanitizeVisualizationSemanticLabels,
} from "@/lib/normalized-viz-metadata";
import { mergeInsightAxesWithAlignedAnalysis } from "@/lib/insight-aligned-axis-merge";
import {
  computeUnifiedInsightConfidence,
  confidenceBadgeLabel,
  type ConfidenceLevel as InsightConfidenceLevel,
} from "@/lib/insight-confidence";
import {
  isCautiousNarrativeTone,
  mappingConfidenceFromRoleMetadata,
  narrativeToneDisclaimer,
  resolveNarrativeTone,
  softenAssertiveProse,
  softenExecutiveTakeaway,
  type NarrativeTone,
} from "@/lib/insight-narrative-tone";
import {
  buildFollowupQuestion,
  fromAlignedAnalysis,
  fromAutoDashboardChart,
} from "@/lib/semantic-metric-engine";
import {
  AI_INSIGHT_SECTION_LABELS,
  aiAnswerLeadIn,
  buildKpiContextLine,
  schemaAwareFollowUpSeeds,
  semanticTopBucketCaption,
} from "@/lib/ux-narrative";
import {
  ChartSessionProvider,
  useChartSession,
  type ChartSnapshot,
} from "../contexts/chart-session-context";
import type {
  DashboardDimensionOptions,
  DashboardFilterEntry,
} from "./dashboard-filter-types";
import { AiExecutiveInsightsPanel } from "./components/ai-executive-insights-panel";
import {
  AiInsightAnswerBody,
  formatInsightSummary,
} from "./components/ai-insight-answer-body";
import {
  polishInsightNarrativeText,
  type DualMetricRoasLead,
} from "@/lib/narrative-number-format";
import {
  buildNumberedExecutiveBrief,
  buildNumberedExecutiveBriefFromRanked,
  buildRankingExecutiveBrief,
  isExecutiveSummaryLayoutMode,
  isExecutiveTakeawaysQuestion,
  isGeographicRankingQuestion,
} from "@/lib/executive-insights-brief";
import {
  followUpLensFromRouting,
  parseRoutingPlan,
  type RoutingPlanPayload,
} from "@/lib/routing-plan";
import { WrappedCategoryYAxisTick } from "./components/chart-category-axis-tick";
import {
  aiInsightsAnswerCard,
  aiInsightsAnswerDetail,
  aiInsightsAnswerDetailBody,
  aiInsightsAnswerDetailFindings,
  aiInsightsAnswerDetailSummaryBadge,
  aiInsightsAnswerDetailSummaryFindings,
  aiInsightsAnswerDetailSummaryHypotheses,
  aiInsightsAnswerDetailSummaryLabel,
  aiInsightsAnswerDetailSummaryMethodology,
  aiInsightsAnswerDetailSummaryMore,
  aiInsightsAnswerDetailSummaryRecommendations,
  aiInsightsAnswerDetailsGroup,
  aiInsightsAnswerDetailsLabel,
  aiInsightsAnswerHeader,
  aiInsightsAnswerKicker,
  aiInsightsAnswerLead,
  aiInsightsAnswerStack,
  aiInsightsAnswerSummary,
  aiInsightsAnswerSummaryPanel,
  aiInsightsAnswerTitle,
  aiInsightsBodyText,
  aiInsightsConfidenceCaution,
  aiInsightsConfidenceDisclaimer,
  aiInsightsConfidenceNormal,
  aiInsightsConfidenceShell,
  aiInsightsFollowupChip,
  aiInsightsFollowupList,
  aiInsightsFollowupSection,
  aiInsightsFollowupTitle,
  aiInsightsAskActionsRow,
  aiInsightsAskAssumptionNote,
  aiInsightsAskComposer,
  aiInsightsAskError,
  aiInsightsAskLoading,
  aiInsightsAskHeading,
  aiInsightsAskHeaderRow,
  aiInsightsAskInputBlock,
  aiInsightsAskMetaRow,
  aiInsightsAskQuestionLabel,
  aiInsightsAskResetBtn,
  aiInsightsAskSubmitBtn,
  aiInsightsAskTextarea,
  aiInsightsBtnExport,
  aiInsightsSuggestedDesc,
  aiInsightsSuggestedHeading,
  aiInsightsSuggestedList,
  aiInsightsSuggestedQ,
  aiInsightsSuggestedRecentDesc,
  aiInsightsSuggestedRecentItem,
  aiInsightsSuggestedRecentList,
  aiInsightsSuggestedRecentSection,
  aiInsightsSuggestedRecentTitle,
  aiInsightsMutedLabel,
  aiInsightsAskPanel,
  aiInsightsGrid,
  aiInsightsOuterShell,
  aiInsightsPage,
  aiInsightsPanelShell,
  aiInsightsSuggestedScrollBody,
  aiInsightsResultsStack,
  aiInsightsProvenanceBody,
  aiInsightsProvenanceDivider,
  aiInsightsProvenanceMetaLabel,
  aiInsightsProvenanceMetaValue,
  aiInsightsProvenanceSectionBodyEmphasis,
  aiInsightsProvenanceSectionLabel,
  aiInsightsProvenanceShell,
  aiInsightsProvenanceToggle,
  aiInsightsProvenanceToggleTitle,
  aiInsightsSmartPanelDivider,
  aiInsightsSubtleText,
  aiInsightsVizCard,
  aiInsightsVizChartStage,
  aiInsightsVizChipsWrap,
  chartsTabVizPreviewCard,
  chartsTabVizSessionFrame,
  aiInsightsVizMetaChipBase,
  aiInsightsVizMetaChipCompactSize,
  aiInsightsVizMetaChipLabel,
  aiInsightsVizMetaChipLabelCompact,
  aiInsightsVizMetaChipLead,
  aiInsightsVizMetaChipLeadCompactSize,
  aiInsightsVizMetaChipLeadSize,
  aiInsightsVizMetaChipMono,
  aiInsightsVizMetaChipMonoCompactSize,
  aiInsightsVizMetaChipMonoSize,
  aiInsightsVizMetaChipSize,
  aiInsightsVizMetaChipValue,
  aiInsightsVizHeaderZone,
  aiInsightsVizHeadingWrap,
  aiInsightsVizKicker,
  aiInsightsVizPlotSurface,
  aiInsightsVizSubtitle,
  aiInsightsVizTitle,
} from "@/lib/ai-insights-ui";
import {
  exportTabAdvancedDivider,
  exportTabAdvancedStack,
  exportTabCheckboxInput,
  exportTabCheckboxLabel,
  exportTabCheckboxRow,
  exportTabCheckboxRowWide,
  exportTabColorField,
  exportTabColorHex,
  exportTabColorInput,
  exportTabColorSwatchWrap,
  exportTabDesc,
  exportTabDownloadBtn,
  exportTabExecutivePreview,
  exportTabExecutivePreviewBody,
  exportTabExecutivePreviewList,
  exportTabExecutivePreviewScope,
  exportTabExecutivePreviewTitle,
  exportTabFieldLabel,
  exportTabFooter,
  exportTabFooterHint,
  exportTabFormGrid,
  exportTabFormRow,
  exportTabHeaderRow,
  exportTabOptionsGrid,
  exportTabPage,
  exportTabSectionCard,
  exportTabSectionDesc,
  exportTabSectionKicker,
  exportTabSectionTitle,
  exportTabStack,
  exportTabSummaryChip,
  exportTabSummaryChipLabel,
  exportTabSummaryChipSpan,
  exportTabSummaryChipValue,
  exportTabSummaryChipValueMuted,
  exportTabSummaryGrid,
  exportTabSummarySectionPill,
  exportTabSummarySectionsWrap,
  exportTabTextInput,
  exportTabTitle,
} from "@/lib/export-tab-ui";
import { AiInsightChartShell } from "./components/ai-insight-chart-shell";
import { ChartRenderer, type ChartRendererViz } from "./components/home/chart-renderer";
import { DataPreviewDatasetContext } from "./components/home/data-preview-dataset-context";
import { DataPreviewQualitySummary } from "./components/home/data-preview-quality-summary";
import { DataPreviewDatasetInsightsSummary } from "./components/home/data-preview-dataset-insights-summary";
import { DataPreviewSchemaPanel } from "./components/home/data-preview-schema-panel";
import { DataPreviewColumnDetails } from "./components/home/data-preview-column-details";
import { resolveDataPreviewSuggestedQuestions } from "@/lib/data-preview-suggested-questions";
import { buildDataPreviewQualityInsights } from "@/lib/data-preview-quality-insights";
import { DataPreviewColumnHeader } from "./components/home/data-preview-column-header";
import { DataPreviewCopyCell } from "./components/home/data-preview-copy-cell";
import {
  cycleDataPreviewSort,
  sortDataPreviewRows,
  type DataPreviewSortState,
} from "@/lib/data-preview-sort";
import {
  DATA_PREVIEW_MISSING_LABEL,
  isMissingValue,
  previewCellSearchToken,
} from "@/lib/data-preview-missing";
import { FilterPanel } from "./components/home/filter-panel";
import { type MainNavTabId } from "./components/home/main-nav-tabs";
import { AppShell } from "@/components/app-shell/app-shell";
import { UpgradePlanModal } from "./components/upgrade-plan-modal";
import {
  canAskAiQuestion,
  canExportPdf,
  fileSizeLimitMessage,
  getPlanLimits,
  isFileWithinPlanLimit,
  previewRowOptionsForTier,
  type LimitKind,
  type PlanTier,
} from "@/lib/plan-limits";
import {
  extractApiErrorMessage,
  parseLimitErrorDetail,
} from "@/lib/limit-error";
import {
  fetchPlanUsage,
  refundPdfExport,
  reservePdfExport,
  type PlanUsageResponse,
} from "@/lib/usage-api";
import { apiUrl } from "@/lib/api-base";
import { scheduleEffectUpdate } from "@/lib/effect-scheduler";
import { shouldReservePdfExportQuota } from "@/lib/pdf-export-quota";
import {
  getPlanTier,
  notifyUsageRefresh,
  PLAN_TIER_CHANGED_EVENT,
  saasRequestHeaders,
  setPlanTier,
} from "@/lib/saas-session";
import { OverviewInlineKpiChip } from "./components/home/overview-inline-kpi-chip";
import { OverviewLandingHero } from "./components/home/overview-landing-hero";
import { PilotInfoModal } from "./components/home/pilot-info-modal";
import { PilotInfoSections } from "./components/home/pilot-info-sections";
import { OverviewUploadSelectedState } from "./components/home/overview-upload-selected-state";
import {
  PILOT_HEADER_NAV,
  type PilotNavTarget,
} from "@/lib/pilot-landing";
import { resolvePilotNavActive } from "@/lib/pilot-nav-state";
import {
  shouldAutoUploadAfterPick,
  validateOverviewUploadPick,
} from "@/lib/upload-auto-flow";
import { OverviewAiSummaryPanel } from "./components/home/overview/overview-ai-summary";
import { OverviewKpiCard } from "./components/home/overview/overview-kpi-card";
import {
  formatOverviewFilenameMiddle,
  ovBtnSecondarySm,
  ovOverviewSecondaryBtn,
  OVERVIEW_UPLOAD_ACCEPT,
  OVERVIEW_UPLOAD_FORMAT_HINT,
  ovUploadDropzone,
  ovUploadDropzoneActive,
  ovUploadDropzoneIdle,
  ovChartCell,
  ovChartGrid,
  ovChartInner,
  ovChartsWrap,
  ovDashChartCard,
  ovDashChartActionAskAi,
  ovDashChartActionCharts,
  ovDashChartActionPng,
  ovDashChartActions,
  ovDashChartFooter,
  ovDashChartHead,
  ovDashChartPlot,
  ovDashChartPlotInner,
  ovDashChartTitle,
  ovDashInsightChip,
  ovDashInsightChips,
  chartRateQualityWarningClass,
  overviewPngExportHeader,
  overviewPngExportRoot,
  ovDataHint,
  ovDataLabel,
  ovDataValue,
  ovDataValueMono,
  ovCard,
  ovCardElevated,
  ovInset,
  ovLabel,
  ovModalInput,
  ovModalOverlay,
  ovModalPanel,
  ovMuted,
  ovSectionDesc,
  ovSectionTitle,
} from "@/lib/overview-ui";
import {
  dpBadgeClean,
  dpBadgeId,
  dpBadgeMissing,
  dpBadgeUnique,
  dpBtnGhost,
  dpCell,
  dpCellNull,
  dpCellSticky,
  dpControl,
  dpPreviewHeaderIntro,
  dpEmptySearch,
  dpEmptyState,
  dpInsightsPanel,
  dpInsightSeverityAttention,
  dpInsightSeverityInfo,
  dpInsightSeverityWarning,
  dpNullPill,
  dpSearchInput,
  dpSectionDesc,
  dpSectionTitle,
  dpSuggestionChip,
  dpSuggestionMore,
  dpSuggestionsPanel,
  dpTable,
  dpTableScroll,
  dpTableShell,
  dpPaginationBar,
  dpPaginationBtn,
  dpPaginationInner,
  dpPaginationMeta,
  dpPaginationNav,
  dpPaginationPill,
  dpSearchWrap,
  dpTableToolbarControls,
  dpTableToolbarRow,
  dpToolbarMatchMeta,
} from "@/lib/data-preview-ui";
import { SmartChartInsightPanel } from "./components/SmartChartInsightPanel";
import { ChartsTimelineAside } from "./components/home/charts-timeline-aside";
import {
  apiChartStringToKind,
  computeSmartChartIntel,
} from "@/lib/smart-chart-intelligence";
import { chartSnapshotMatchesQuestionIntent } from "@/lib/chart-question-intent";
import { getCanonicalChartTitle } from "@/lib/canonical-chart-title";
import {
  apiChartTypeFromContract,
  buildTrendDisplayTitle,
  contractDisplayTitle,
  isTrendMode,
  narrativeCopyForContract,
  resolvePresentationKindFromContract,
  sanitizeNarrativeForTrendContract,
  semanticContextFromContract,
  validateExportMatchesContract,
  type VisualizationContract,
} from "@/lib/selected-visualization";
import { resolveTrendBucketLabel } from "@/lib/chart-semantic-metadata";
import {
  buildUnsupportedGrowthExecutiveCards,
  buildUnsupportedGrowthFollowUpChips,
  parseUnsupportedGrowthAnalysis,
  prependUnsupportedGrowthLead,
  resolveUnsupportedGrowthMode,
  type UnsupportedGrowthAnalysis,
} from "@/lib/unsupported-growth-analysis";
import {
  buildUnsupportedDeclineExecutiveCards,
  buildUnsupportedDeclineFollowUpChips,
  parseUnsupportedDeclineAnalysis,
  prependUnsupportedDeclineLead,
  resolveUnsupportedDeclineMode,
  type UnsupportedDeclineAnalysis,
} from "@/lib/unsupported-decline-analysis";
import {
  buildUnsupportedTrendExecutiveCards,
  buildUnsupportedTrendFollowUpChips,
  parseUnsupportedTrendAnalysis,
  prependUnsupportedTrendLead,
  resolveUnsupportedTrendMode,
  type UnsupportedTrendAnalysis,
} from "@/lib/unsupported-trend-analysis";
import {
  buildRelationshipCorrelationSnapshot,
  chartRowsToScatterPairs,
  type RelationshipCorrelationSnapshot,
} from "@/lib/relationship-correlation";
import {
  buildRelationshipExecutiveCards,
  formatPearsonCoefficient,
  parseRelationshipInsights,
  resolveNearPerfectCorrelationCaution,
  type RelationshipInsightsPayload,
} from "@/lib/relationship-visualization";
import {
  buildRelationshipScatterDisplayTitle,
  isSyntheticScatterPointLabel,
  sanitizeRelationshipUserFacingText,
  stripContradictoryCorrelationNarrative,
  titleCaseRelationshipPhrase,
} from "@/lib/relationship-scatter-labels";
import {
  buildUnsupportedMultiMetricExecutiveCards,
  buildUnsupportedMultiMetricFollowUpChips,
  buildUnsupportedMultiMetricParsedSections,
  parseUnsupportedMultiMetricAnalysis,
  resolveUnsupportedMultiMetricMode,
  type UnsupportedMultiMetricAnalysis,
} from "@/lib/unsupported-multi-metric-analysis";
import {
  buildProfitMarginAnswerLead,
  buildProfitMarginExecutiveInsights,
  prependProfitMarginLead,
  resolveProfitMarginMode,
  type ProfitMarginMode,
} from "@/lib/derived-profit-margin";
import { dashboardChartKeyFromTitle } from "@/contexts/chart-session-context";
import {
  buildTrendAxisPresentation,
  buildTrendExecutiveVizInsights,
  trendInsightBadgeFromRows,
} from "@/lib/trend-visualization";
import {
  getChartInsightAnswer,
  hasStoredValidAnswer,
  resolveAnswerTextForChart,
  type ChartInsightAnswerBundle,
  type ChartInsightAnswerStore,
} from "@/lib/chart-insight-answers";
import { useDevRenderCount } from "@/lib/dev-render-count";
import {
  datasetKindLabel,
  loadReportBranding,
  saveReportBranding,
  type ReportBranding,
} from "./pdf-report";
import {
  buildExecutivePdfExportInput,
  computePdfRankedSignalsFromChartRows,
  parseAnswerIntoSections,
  sortRowsForPresentation,
  type PdfChartPrepContext,
} from "@/lib/build-executive-pdf-input";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Label,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

/** Disable Recharts enter/exit animation above this point count (main + overview charts). */
const RECHARTS_ANIMATION_MAX_POINTS = 72;

/** Shared Recharts tooltip frame (session + overview mini charts). */
const CHART_TOOLTIP_FRAME = {
  cursor: false,
  contentStyle: {
    borderRadius: 14,
    border: "1px solid rgba(226, 232, 240, 0.95)",
    background: "rgba(255, 255, 255, 0.97)",
    boxShadow:
      "0 12px 32px -8px rgba(15, 23, 42, 0.11), 0 0 0 1px rgba(255, 255, 255, 0.75) inset",
    padding: "10px 14px",
    fontSize: 12,
  },
  labelStyle: {
    fontWeight: 600,
    marginBottom: 6,
    color: "#0f172a",
    fontSize: 12,
    letterSpacing: "-0.01em",
  },
  itemStyle: {
    color: "#475569",
    fontSize: 12,
    paddingTop: 2,
  },
  wrapperStyle: { outline: "none" as const },
} as const;

type ChartAxes = {
  categoryAxis: string;
  valueAxis: string;
  /** Short phrase for Recharts axis text only (see `buildCompactAxisValueLabel`). */
  valueAxisCompact: string;
};

function shortenLabel(s: string, maxLen: number): string {
  const t = s.trim();
  if (!t) return "";
  return t.length > maxLen ? `${t.slice(0, maxLen - 1)}…` : t;
}

function inferChartAxesFromContext(
  title: string,
  _subtitle: string,
  _question: string,
  _datasetKind: string
): ChartAxes {
  const titleClean = title.replace(/\s+/g, " ").trim();

  const geoOutlier = titleClean.match(
    /^(?:geographic\s+)?outliers?\s*[—\-–]\s*(.+?)\s+by\s+(.+)$/i
  );
  if (geoOutlier) {
    const valuePolished = polishMetricDisplay(geoOutlier[1].trim());
    return {
      valueAxis: valuePolished,
      categoryAxis: geoOutlier[2].trim(),
      valueAxisCompact: compactAxisLabelFromFullPhrase(valuePolished),
    };
  }

  const byMatch = titleClean.match(/^(.+?)\s+by\s+(.+)$/i);
  if (byMatch) {
    const valuePolished = polishMetricDisplay(byMatch[1].trim());
    return {
      valueAxis: valuePolished,
      categoryAxis: byMatch[2].trim(),
      valueAxisCompact: compactAxisLabelFromFullPhrase(valuePolished),
    };
  }

  const dist = titleClean.match(/^Distribution\s*[—\-–]\s*(.+)$/i);
  if (dist) {
    return {
      categoryAxis: dist[1].trim(),
      valueAxis: "Share (%)",
      valueAxisCompact: "Share (%)",
    };
  }

  const hist = titleClean.match(/^Histogram\s*[—\-–]\s*(.+)$/i);
  if (hist) {
    return {
      categoryAxis: "Value range",
      valueAxis: "Frequency (rows)",
      valueAxisCompact: "Rows",
    };
  }

  const overTime = titleClean.match(/^(.+?)\s+over\s+time$/i);
  if (overTime) {
    const va = overTime[1].trim();
    return {
      valueAxis: va,
      categoryAxis: "Period",
      valueAxisCompact: compactAxisLabelFromFullPhrase(va),
    };
  }

  const trendParen = titleClean.match(/^(.+?)\s+trend\s*\(([^)]+)\)\s*$/i);
  if (trendParen) {
    const va = polishMetricDisplay(trendParen[1].trim());
    const bucket = trendParen[2].trim();
    const cat = /\bweekly\b/i.test(bucket)
      ? "Weekly periods"
      : /\bmonth/i.test(bucket)
        ? "Monthly periods"
        : "Time";
    return {
      valueAxis: va,
      categoryAxis: cat,
      valueAxisCompact: compactAxisLabelFromFullPhrase(va),
    };
  }

  const topN = titleClean.match(/^Top\s+\d+\s*[—\-–]\s*(.+)$/i);
  if (topN) {
    const va = topN[1].trim();
    return {
      valueAxis: va,
      categoryAxis: "Category",
      valueAxisCompact: compactAxisLabelFromFullPhrase(va),
    };
  }

  if (isQuestionLikeLabel(titleClean)) {
    return {
      categoryAxis: "Category",
      valueAxis: "Value",
      valueAxisCompact: "Value",
    };
  }

  const va = titleClean ? polishMetricDisplay(titleClean) : "Value";
  return {
    categoryAxis: "Category",
    valueAxis: va,
    valueAxisCompact: compactAxisLabelFromFullPhrase(va),
  };
}

function resolveChartDisplayHeight(
  pointCount: number,
  kind: ChartKind,
  compact: boolean
): number {
  const baseMin = compact ? 200 : 300;
  const baseMax = compact ? 360 : 500;
  if (kind === "bar_horizontal") {
    const slot = compact ? 22 : 32;
    const extra = Math.max(0, pointCount - 3) * slot;
    return Math.min(baseMax, Math.max(baseMin, baseMin + extra));
  }
  if (kind === "pie" || kind === "donut") return compact ? 260 : 340;
  if (kind === "scatter") return compact ? 260 : 340;
  const bump = pointCount > 14 ? (compact ? 28 : 40) : 0;
  const h = Math.min(baseMax, baseMin + bump);
  if (compact) return h;
  if (
    (kind === "bar" || kind === "histogram" || kind === "line" || kind === "area") &&
    pointCount > 0 &&
    pointCount <= 10
  ) {
    return Math.min(h, kind === "bar" || kind === "histogram" ? 268 : 276);
  }
  return h;
}

function clampChartHeightToViewport(h: number, viewportInnerH: number): number {
  const cap = Math.round(Math.min(viewportInnerH * 0.5, 520));
  return Math.min(cap, Math.max(196, h));
}

function pearsonCorrelation(xs: number[], ys: number[]): number | null {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return null;
  let sx = 0;
  let sy = 0;
  for (let i = 0; i < n; i++) {
    sx += xs[i];
    sy += ys[i];
  }
  const mx = sx / n;
  const my = sy / n;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    const vx = xs[i] - mx;
    const vy = ys[i] - my;
    num += vx * vy;
    dx += vx * vx;
    dy += vy * vy;
  }
  const den = Math.sqrt(dx * dy);
  if (den < 1e-12) return null;
  return num / den;
}

function computeChartInsightBadge(
  rows: ChartRow[],
  kind: ChartKind,
  categoryAxis: string,
  /** From bar sort intent: true = lowest/min highlight, false = highest/max, null = average/compare → highest */
  sortAscending: boolean | null
): string | null {
  if (!rows.length) return null;
  const catShort = shortenLabel(categoryAxis, 18);

  const pickMax = () => rows.reduce((a, b) => (a.value >= b.value ? a : b));
  const pickMin = () => rows.reduce((a, b) => (a.value <= b.value ? a : b));

  if (kind === "pie" || kind === "donut") {
    const sel = sortAscending === true ? pickMin() : pickMax();
    if (sortAscending === true) {
      return `Smallest share: ${sel.name}`;
    }
    return `Largest share: ${sel.name}`;
  }

  if (kind === "scatter" && rows.length >= 2) {
    const paired = rows.filter(
      (r) => typeof r.x === "number" && Number.isFinite(r.x)
    );
    const xs = paired.map((r) => r.x as number);
    const ys = paired.map((r) => r.value);
    if (xs.length >= 2 && ys.length === xs.length) {
      const r = pearsonCorrelation(xs, ys);
      if (r != null && Number.isFinite(r)) {
        return `Correlation ${formatPearsonCoefficient(r)}`;
      }
    }
    return null;
  }

  if ((kind === "line" || kind === "area") && rows.length >= 2) {
    if (sortAscending === true) {
      const bottom = pickMin();
      return `Lowest: ${bottom.name}`;
    }
    let bestIdx = 1;
    let bestDelta = rows[1].value - rows[0].value;
    for (let i = 1; i < rows.length; i++) {
      const d = rows[i].value - rows[i - 1].value;
      if (d > bestDelta) {
        bestDelta = d;
        bestIdx = i;
      }
    }
    if (bestDelta > 0 && Math.abs(bestDelta) > 1e-9) {
      return `Fastest growth: ${rows[bestIdx].name}`;
    }
    const peak = pickMax();
    return `Peak: ${peak.name}`;
  }

  if (sortAscending === true) {
    const bottom = pickMin();
    if (/\bregion\b/i.test(catShort)) return `Lowest region: ${bottom.name}`;
    return `Lowest: ${bottom.name}`;
  }

  const top = pickMax();
  if (/\bregion\b/i.test(catShort)) return `Top region: ${top.name}`;
  return `Highest: ${top.name}`;
}

function presentationKindUiLabel(kind: ChartKind): string {
  if (kind === "line") return "Line";
  if (kind === "area") return "Area";
  if (kind === "pie") return "Pie";
  if (kind === "donut") return "Donut";
  if (kind === "scatter") return "Scatter";
  if (kind === "histogram") return "Histogram";
  if (kind === "bar_horizontal") return "Horizontal";
  return "Bar";
}

const ChartContextSummary = memo(function ChartContextSummary(props: {
  renderedKind: ChartKind;
  metricLabel: string;
  /** Axis / dimension line — replaces the old fixed “Dimension · …” chip. */
  semanticHeader: ChartSemanticHeaderModel;
  badgeCompact: string;
  /** Highest / lead insight chip — uses detected chart data (no dataset-specific copy). */
  leadInsight?: string | null;
  qualityWarning?: string | null;
  /** Tighter pills for AI Insights chart header. */
  compactChips?: boolean;
}) {
  const typeLbl = presentationKindUiLabel(props.renderedKind);
  const c = props.compactChips;
  const chip = `${aiInsightsVizMetaChipBase} ${c ? aiInsightsVizMetaChipCompactSize : aiInsightsVizMetaChipSize}`;
  const chipMuted = c ? aiInsightsVizMetaChipLabelCompact : aiInsightsVizMetaChipLabel;
  const chipValue = aiInsightsVizMetaChipValue;
  const monoChip = `${aiInsightsVizMetaChipMono} ${c ? aiInsightsVizMetaChipMonoCompactSize : aiInsightsVizMetaChipMonoSize}`;
  const leadChip = `${aiInsightsVizMetaChipLead} ${c ? aiInsightsVizMetaChipLeadCompactSize : aiInsightsVizMetaChipLeadSize}`;
  return (
    <div
      className={`flex flex-wrap items-center justify-center ${c ? "gap-x-2 gap-y-1.5 sm:gap-x-2.5 sm:gap-y-2" : "mt-3 gap-2 px-1 sm:gap-2.5"} ${c ? "" : ""}`}
    >
      <span className={`${chip} items-center`}>
        <span className={chipMuted}>View</span>
        <span className={chipValue}>{typeLbl}</span>
      </span>
      <span className={`${chip} items-center`}>
        <span className={chipMuted}>Measure</span>
        <span
          className={`max-w-[14rem] truncate ${chipValue}`}
          title={props.metricLabel}
        >
          {props.metricLabel}
        </span>
      </span>
      {props.semanticHeader.mode === "scatter" ? (
        <>
          <span className={`${chip} items-center`}>
            <span className={chipMuted}>X</span>
            <span className={`max-w-[10rem] truncate ${chipValue}`}>
              {props.semanticHeader.xLabel}
            </span>
          </span>
          <span className={`${chip} items-center`}>
            <span className={chipMuted}>Y</span>
            <span className={`max-w-[10rem] truncate ${chipValue}`}>
              {props.semanticHeader.yLabel}
            </span>
          </span>
        </>
      ) : (
        <span className={`${chip} max-w-full items-center`}>
          <span className={`shrink-0 ${chipMuted}`}>{props.semanticHeader.roleLabel}</span>
          <span
            className={`min-w-0 truncate ${chipValue}`}
            title={props.semanticHeader.detailLabel}
          >
            {props.semanticHeader.detailLabel}
          </span>
        </span>
      )}
      <span className={`${monoChip}`} title={props.badgeCompact}>
        {props.badgeCompact}
      </span>
      {props.leadInsight ? (
        <span className={`${leadChip} items-center`}>{props.leadInsight}</span>
      ) : null}
      {props.qualityWarning ? (
        <p
          className={`${chartRateQualityWarningClass} w-full basis-full text-center`}
        >
          {props.qualityWarning}
        </p>
      ) : null}
    </div>
  );
});

function chartTypeShortLabel(kind: ChartKind): string {
  if (kind === "line") return "Line";
  if (kind === "area") return "Area";
  if (kind === "pie") return "Pie";
  if (kind === "donut") return "Donut";
  if (kind === "scatter") return "Scatter";
  if (kind === "bar_horizontal") return "H-Bar";
  if (kind === "histogram") return "Histogram";
  if (!kind) return "Chart";
  return "Bar";
}

function normalizeIntentToken(s: string | null | undefined): string {
  return (s ?? "").trim().toLowerCase().replace(/\s+/g, "_");
}

function chartKindFamilyToken(kind: ChartKind): string {
  const k = String(kind || "").toLowerCase();
  if (k === "bar_horizontal") return "bar_h";
  if (k === "scatter") return "scatter";
  if (k === "line") return "line";
  if (k === "area") return "area";
  if (k === "histogram") return "histogram";
  if (k === "pie" || k === "donut") return "share";
  return "bar_v";
}

function normalizeAggregationForIntent(
  key: string | null,
  fallbackAgg: string | null
): string {
  const raw = String(key || fallbackAgg || "avg")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
  if (!raw || raw === "nan") return "avg";
  if (raw === "mean" || raw === "average" || raw === "avg") return "avg";
  if (raw === "sum" || raw === "total") return "sum";
  if (raw === "count" || raw === "cnt" || raw === "n") return "count";
  return raw.slice(0, 24);
}

function buildSemanticIntentKey(args: {
  metricColumn: string | null;
  categoryColumn: string | null;
  aggregation: string | null;
  aggregationKey: string | null;
  chartKind: ChartKind;
  analysisContextKey: string;
}): string {
  const agg = normalizeAggregationForIntent(
    args.aggregationKey,
    args.aggregation
  );
  const metric = normalizeIntentToken(args.metricColumn) || "_m";
  const cat = normalizeIntentToken(args.categoryColumn) || "_c";
  const fam = chartKindFamilyToken(args.chartKind);
  return `${fam}|${agg}|${metric}|${cat}|${args.analysisContextKey}`;
}

function buildSemanticIntentKeyFromAsk(args: {
  parsed: AlignedAnalysisContext | null;
  snap: ConversationSnapshot | null;
  chartKind: ChartKind;
  analysisContextKey: string;
}): string | null {
  const metric =
    args.parsed?.metricColumn ?? args.snap?.metricColumn ?? null;
  const cat =
    args.parsed?.categoryColumn ?? args.snap?.categoryColumn ?? null;
  if (!metric && !cat) return null;
  return buildSemanticIntentKey({
    metricColumn: metric,
    categoryColumn: cat,
    aggregation:
      args.parsed?.aggregation ?? args.snap?.aggregation ?? null,
    aggregationKey: args.parsed?.aggregationKey ?? null,
    chartKind: args.chartKind,
    analysisContextKey: args.analysisContextKey,
  });
}

function _formatAggForBadge(raw: string): string {
  const t = raw.trim().toUpperCase().replace(/\s+/g, "");
  if (!t) return "AGG";
  return t.slice(0, 14);
}

function inferBreakdownLabelFromChartTitle(title: string): string | null {
  const t = title.replace(/\s+/g, " ").trim();
  const idx = t.search(/\s+by\s+/i);
  if (idx <= 0) return null;
  let rest = t.slice(idx).replace(/^\s+by\s+/i, "").trim();
  const paren = rest.indexOf("(");
  if (paren > 0) rest = rest.slice(0, paren).trim();
  return rest || null;
}

function inferAutoDashboardMetricFromTitle(title: string): string {
  const t = title.trim();
  const trendIdx = t.search(/\s+trend\s*\(/i);
  if (trendIdx > 0) return t.slice(0, trendIdx).trim();
  const idx = t.search(/\s+by\s+/i);
  if (idx > 0) return t.slice(0, idx).trim();
  return t || "Metric";
}

/** Parse "Average salary by department" → MEAN + salary phrase for badges when provenance is thin. */
function inferAggAndMetricFromChartTitle(title: string): {
  aggLabel: string | null;
  metricPhrase: string | null;
} {
  const t = title.trim();
  const patterns: Array<{ re: RegExp; agg: string }> = [
    { re: /^(average|mean|median)\s+(.+?)\s+by\s+/i, agg: "MEAN" },
    {
      re: /^(lowest|minimum|least|bottom|smallest)\s+(.+?)\s+by\s+/i,
      agg: "MIN",
    },
    {
      re: /^(highest|maximum|top|largest|greatest)\s+(.+?)\s+by\s+/i,
      agg: "MAX",
    },
    { re: /^(total|sum)\s+(.+?)\s+by\s+/i, agg: "SUM" },
    { re: /^(count|number)\s+of\s+(.+?)\s+by\s+/i, agg: "COUNT" },
  ];
  for (const { re, agg } of patterns) {
    const m = t.match(re);
    if (m?.[2]) {
      return { aggLabel: agg, metricPhrase: m[2].trim() };
    }
  }
  return { aggLabel: null, metricPhrase: null };
}

function resolveAnalyzedRowsForChartMetadata(args: {
  preferAlignedAnalysis: boolean;
  analysis: AlignedAnalysisContext | null;
  prov?: InsightProvenance | null;
  vizAnalyzedRows?: number | null | undefined;
  filteredDatasetRows?: number | null | undefined;
  fullDatasetRows?: number | null | undefined;
}): number | null {
  const pos = (n: unknown): n is number =>
    typeof n === "number" && Number.isFinite(n) && n > 0;

  const fromAligned =
    args.preferAlignedAnalysis && pos(args.analysis?.analysisRowCount)
      ? (args.analysis!.analysisRowCount as number)
      : null;
  const fromViz = pos(args.vizAnalyzedRows) ? (args.vizAnalyzedRows as number) : null;
  const fromProv = pos(args.prov?.rowsAnalyzed) ? args.prov!.rowsAnalyzed : null;
  const fromFiltered = pos(args.filteredDatasetRows)
    ? args.filteredDatasetRows!
    : null;
  const fromFull = pos(args.fullDatasetRows) ? args.fullDatasetRows! : null;

  return (
    fromAligned ?? fromViz ?? fromProv ?? fromFiltered ?? fromFull ?? null
  );
}

function extractDashboardChartTitleFromPrefillQuestion(
  question: string
): string | null {
  const m = /^Summarize what the chart "([^"]+)" shows/i.exec(question.trim());
  return m?.[1]?.trim() || null;
}

function normalizeQuestionForMatch(q: string): string {
  return q.trim().toLowerCase().replace(/\s+/g, " ");
}

function snapshotMetricCategoryTokens(snap: ChartSnapshot): {
  metric: string;
  category: string;
} {
  const prov = snap.visualization as { provenance?: InsightProvenance } | null;
  const fp = snap.finalPresentation;
  return {
    metric: normalizeIntentToken(
      prov?.provenance?.numericColumn ?? fp?.metric ?? ""
    ),
    category: normalizeIntentToken(
      prov?.provenance?.categoryColumn ?? fp?.dimension ?? ""
    ),
  };
}

function analysisMetricCategoryTokens(
  parsed: AlignedAnalysisContext | null
): { metric: string; category: string } {
  return {
    metric: normalizeIntentToken(parsed?.metricColumn ?? ""),
    category: normalizeIntentToken(parsed?.categoryColumn ?? ""),
  };
}

function metricCategoryTokensAlign(
  a: { metric: string; category: string },
  b: { metric: string; category: string }
): boolean {
  if (a.metric && b.metric && a.metric !== b.metric) return false;
  if (a.category && b.category && a.category !== b.category) return false;
  return true;
}

function chartSnapshotMatchesAnalysis(
  snap: ChartSnapshot,
  parsed: AlignedAnalysisContext | null
): boolean {
  if (!parsed) return false;
  return metricCategoryTokensAlign(
    snapshotMetricCategoryTokens(snap),
    analysisMetricCategoryTokens(parsed)
  );
}

/** Keep a pinned insight chart only for same-question re-asks or aligned follow-ups. */
function shouldPreservePinnedInsightChart(args: {
  pinned: ChartSnapshot;
  question: string;
  parsed: AlignedAnalysisContext | null;
  followUpDetected: boolean;
}): boolean {
  const pinnedQ = normalizeQuestionForMatch(args.pinned.question ?? "");
  const newQ = normalizeQuestionForMatch(args.question);
  if (pinnedQ && newQ && pinnedQ === newQ) return true;

  if (extractDashboardChartTitleFromPrefillQuestion(args.question)) {
    return true;
  }

  if (isTrendMode(args.pinned.contract)) {
    return args.followUpDetected;
  }

  if (!args.followUpDetected) return false;

  return chartSnapshotMatchesAnalysis(args.pinned, args.parsed);
}

function resolveOriginChartRefSnapshot(args: {
  question: string;
  insightChartId: string | null;
  chartHistory: ChartSnapshot[];
  activeSnapshot: ChartSnapshot | null;
}): ChartSnapshot | null {
  if (args.insightChartId) {
    const hit = args.chartHistory.find((h) => h.id === args.insightChartId);
    if (hit) return hit;
  }
  const dashTitle = extractDashboardChartTitleFromPrefillQuestion(args.question);
  if (dashTitle) {
    const byTitle = args.chartHistory.find(
      (h) =>
        h.source === "auto_dashboard" && h.title.trim() === dashTitle
    );
    if (byTitle) return byTitle;
  }
  if (args.activeSnapshot?.source === "auto_dashboard") {
    return args.activeSnapshot;
  }
  return null;
}

/** Prefer `timelineChartType` when present (post-change snapshots). */
function resolveOriginPresentationKind(origin: ChartSnapshot | null): ChartKind | null {
  if (!origin) return null;
  const t = origin.timelineChartType;
  if (t === "horizontalBar") return "bar_horizontal";
  if (t === "line") return "line";
  if (t === "bar") return "bar";
  const k = origin.chartKind;
  return k !== "" ? k : null;
}

/**
 * When the user is extending a chart from Overview / Charts / a prior insight,
 * do not re-infer orientation or line vs bar from the new `/ask` payload alone.
 */
function applyOriginChartPresentationLock(args: {
  inferred: ChartKind;
  hydratedKind: ChartKind;
  origin: ChartSnapshot | null;
}): ChartKind {
  const { inferred, hydratedKind, origin } = args;
  const o = resolveOriginPresentationKind(origin);
  if (!o) return inferred;

  if (
    hydratedKind === "scatter" &&
    inferred === "scatter"
  ) {
    return "scatter";
  }

  if (o === "scatter") {
    return inferred === "scatter" && hydratedKind === "scatter"
      ? "scatter"
      : inferred;
  }

  if (o === "line") return "line";
  if (o === "area") return "area";

  const barLike =
    hydratedKind === "bar" ||
    hydratedKind === "bar_horizontal" ||
    inferred === "bar" ||
    inferred === "bar_horizontal";

  if (o === "bar_horizontal") {
    return barLike ? "bar_horizontal" : inferred;
  }
  if (o === "bar") {
    return barLike ? "bar" : inferred;
  }

  if (o === "histogram") {
    if (hydratedKind === "histogram" || inferred === "histogram") return "histogram";
    return barLike ? "histogram" : inferred;
  }

  if (o === "pie" || o === "donut") {
    const radial =
      inferred === "pie" ||
      inferred === "donut" ||
      hydratedKind === "pie" ||
      hydratedKind === "donut";
    return radial ? inferred : o;
  }

  return inferred;
}

function buildChartMetadataLine(
  kind: ChartKind,
  groupCount: number,
  viz: StoredVisualization | null,
  analysis: AlignedAnalysisContext | null,
  preferAlignedAnalysis: boolean,
  opts?: {
    chartTitle?: string;
    filteredDatasetRows?: number | null;
    fullDatasetRows?: number | null;
  }
): string {
  const prov = viz?.provenance ?? null;
  const title = opts?.chartTitle?.trim() ?? "";
  const rec = viz?.chartRecommendation ?? null;
  const titleInfer = inferAggAndMetricFromChartTitle(title);

  let aggRaw = "";
  let metricRaw = "";

  if (preferAlignedAnalysis && analysis) {
    aggRaw =
      String(analysis.aggregationKey || analysis.aggregation || "").trim();
    metricRaw = String(
      analysis.metricColumnDisplay || analysis.metricColumn || ""
    ).trim();
  }

  if (!aggRaw) {
    aggRaw = String(prov?.aggregationKey ?? prov?.aggregation ?? "").trim();
  }
  if (!aggRaw && titleInfer.aggLabel) {
    aggRaw = titleInfer.aggLabel;
  }
  if (!aggRaw && rec?.metricType) {
    const mt = String(rec.metricType).trim().toLowerCase();
    if (mt && mt !== "numeric" && mt !== "number") {
      aggRaw = String(rec.metricType);
    }
  }

  if (!metricRaw) {
    metricRaw = String(
      prov?.numericColumnDisplay ?? prov?.numericColumn ?? ""
    ).trim();
  }
  if (!metricRaw && titleInfer.metricPhrase) {
    metricRaw = titleInfer.metricPhrase;
  }
  if (!metricRaw && title && viz?.subtitle === "Auto dashboard") {
    metricRaw = inferAutoDashboardMetricFromTitle(title);
  }
  if (!metricRaw && rec?.detectedIntent) {
    metricRaw = String(rec.detectedIntent).replace(/_/g, " ");
  }
  if (!metricRaw && prov?.numericColumn) {
    metricRaw = String(prov.numericColumn).trim();
  }
  if (!metricRaw) {
    metricRaw = "metric";
  }

  const metric =
    kind === "histogram"
      ? resolveHistogramMeasureChipLabel(
          viz as ChartSemanticVizLike,
          analysis,
          preferAlignedAnalysis
        )
      : buildMetricLabel({
          aggregationKey: aggRaw || null,
          aggregationLabel: aggRaw || null,
          metricColumn:
            (preferAlignedAnalysis && analysis?.metricColumn?.trim()) ||
            prov?.numericColumn?.trim() ||
            null,
          metricColumnDisplay: metricRaw || null,
        });

  const rowsNum = resolveAnalyzedRowsForChartMetadata({
    preferAlignedAnalysis,
    analysis,
    prov: viz?.provenance ?? null,
    vizAnalyzedRows: viz?.analyzedRows,
    filteredDatasetRows: opts?.filteredDatasetRows,
    fullDatasetRows: opts?.fullDatasetRows,
  });

  const typeLabel =
    kind === "bar_horizontal" ? "H-Bar" : chartTypeShortLabel(kind);

  const parts: string[] = [typeLabel, metric];
  if (rowsNum != null && rowsNum > 0) {
    parts.push(`${rowsNum.toLocaleString()} rows`);
  }
  if (typeof groupCount === "number" && groupCount >= 0) {
    parts.push(`${groupCount.toLocaleString()} groups`);
  }
  return parts.join(" · ");
}

/** Compact badge for chart cards (full detail in `title=` tooltip). */
function buildChartMetadataBadgeCompact(
  kind: ChartKind,
  groupCount: number,
  viz: StoredVisualization | null,
  analysis: AlignedAnalysisContext | null,
  preferAlignedAnalysis: boolean,
  opts?: {
    filteredDatasetRows?: number | null;
    fullDatasetRows?: number | null;
  }
): string {
  const prov = viz?.provenance ?? null;

  const rowsNum = resolveAnalyzedRowsForChartMetadata({
    preferAlignedAnalysis,
    analysis,
    prov,
    vizAnalyzedRows: viz?.analyzedRows,
    filteredDatasetRows: opts?.filteredDatasetRows,
    fullDatasetRows: opts?.fullDatasetRows,
  });

  const typeShort =
    kind === "bar_horizontal"
      ? "H-Bar"
      : kind === "line"
        ? "Line"
        : kind === "area"
          ? "Area"
          : kind === "pie"
            ? "Pie"
            : kind === "donut"
              ? "Donut"
              : kind === "scatter"
                ? "Scatter"
                : "Bar";

  const parts: string[] = [typeShort];
  if (rowsNum != null && rowsNum > 0) {
    parts.push(`${rowsNum.toLocaleString()} rows`);
  }
  if (typeof groupCount === "number" && groupCount >= 0) {
    parts.push(`${groupCount.toLocaleString()} groups`);
  }
  return parts.join(" · ");
}

function computeCartesianCategoryPlanForRender(args: {
  rows: ChartRow[];
  kind: ChartKind;
  stackedBar: boolean;
  chartHeight: number;
  compact: boolean;
  insightMode: boolean;
  viewportWidthPx: number;
  axes: ChartAxes;
  /** Narrow overview mini-cards (half main grid width). */
  layoutVariant?: "default" | "overview_half";
  /** Overview dashboard: allow horizontal bar when X ticks cannot fit. */
  allowHorizontalBarFallback?: boolean;
}): VerticalCategoryAxisPlan | null {
  const {
    rows,
    kind,
    stackedBar,
    chartHeight,
    compact,
    insightMode,
    viewportWidthPx,
    axes,
    layoutVariant = "default",
    allowHorizontalBarFallback = false,
  } = args;
  if (!rows.length) return null;
  if (kind !== "bar" && kind !== "line" && kind !== "area" && kind !== "histogram")
    return null;

  const chartLayoutMode: ChartLayoutMode = compact ? "compact" : "full";
  const tickSamples = collectSampleTickStrings(rows);
  const plotInnerHeightPx =
    chartLayoutMode === "full"
      ? Math.max(120, Math.floor(chartHeight * 0.86))
      : Math.max(72, Math.floor(chartHeight * 0.52));

  const verticalValueLayout = computeVerticalValueAxisLayout({
    valueAxisLabel: axes.valueAxisCompact,
    valueAxisMeasureLabel: axes.valueAxis,
    tickSampleStrings: tickSamples,
    chartLayoutMode,
    plotInnerHeightPx,
    tickFontSizePx: compact ? 10 : 11,
    titleFontSizePx: compact ? 10 : 11,
  });

  const vmBalanced = balanceVerticalOuterMargins({
    marginLeft: verticalValueLayout.marginLeft,
    chartLayoutMode,
  });

  let variant: "main" | "overview_half" | "insight_compact" | "insight_full" =
    "main";
  if (layoutVariant === "overview_half") {
    variant = "overview_half";
  } else if (insightMode && compact) {
    variant = "insight_compact";
  } else if (insightMode && !compact) {
    variant = "insight_full";
  }

  const innerW = estimateCartesianPlotInnerWidthPx({
    viewportWidthPx,
    marginLeftPx: vmBalanced.marginLeft,
    marginRightPx: vmBalanced.marginRight,
    variant,
  });

  const labels = rows.map((r) => String(r.name ?? ""));
  const preferAngledInsight =
    insightMode &&
    !compact &&
    !stackedBar &&
    (kind === "bar" || kind === "histogram") &&
    labels.length >= 5 &&
    labels.length <= 14;
  const categoryAngleDegInsight =
    insightMode && !compact
      ? kind === "line" || kind === "area"
        ? 32
        : kind === "bar" || kind === "histogram"
          ? 30
          : 25
      : undefined;
  return computeVerticalCategoryAxisPlan({
    categoryLabels: labels,
    estimatedPlotInnerWidthPx: innerW,
    chartLayoutMode,
    disableHorizontalFallback:
      stackedBar ||
      kind === "histogram" ||
      (kind === "bar" && !allowHorizontalBarFallback),
    preferAngledCategoryTicks: preferAngledInsight,
    categoryAngleDeg: categoryAngleDegInsight,
  });
}

/** Ascending bar order for lowest/min/MIN; descending for highest/max; null = keep API order. */
function isAscendingValueIntent(
  analysis: AlignedAnalysisContext | null,
  viz: StoredVisualization | null
): boolean | null {
  const prov = viz?.provenance ?? null;

  const intentBucket = [
    ...(analysis?.detectedIntent ?? []),
    String(viz?.chartRecommendation?.detectedIntent ?? ""),
    viz?.title ?? "",
    viz?.subtitle ?? "",
  ]
    .join(" ")
    .toLowerCase();

  if (/\b(lowest|minimum|least|bottom|smallest)\b/.test(intentBucket))
    return true;
  if (/\b(highest|maximum|top|largest|greatest)\b/.test(intentBucket))
    return false;

  const agg = String(
    analysis?.aggregationKey ??
      analysis?.aggregation ??
      prov?.aggregationKey ??
      prov?.aggregation ??
      ""
  )
    .trim()
    .toLowerCase();
  if (agg === "min" || agg === "minimum") return true;
  if (agg === "max" || agg === "maximum") return false;

  return null;
}

function _applyBarChartSort(
  rows: ChartRow[],
  kind: ChartKind,
  ascending: boolean | null
): ChartRow[] {
  if (ascending === null) return rows;
  if (kind === "scatter") return rows;
  if (kind === "histogram") return rows;
  if (!rows.length || rows.length <= 1) return rows;
  const copy = [...rows];
  copy.sort((a, b) => {
    const va = Number(a.value);
    const vb = Number(b.value);
    if (!Number.isFinite(va) || !Number.isFinite(vb)) return 0;
    return ascending ? va - vb : vb - va;
  });
  return copy;
}

function valueAxisCompactFromProvenance(
  fullValueAxis: string,
  viz: StoredVisualization | null,
  analysis: AlignedAnalysisContext | null
): string {
  const prov = viz?.provenance ?? null;
  const ctx: MetricLabelContext = {
    metricColumn:
      analysis?.metricColumn?.trim() || prov?.numericColumn?.trim() || null,
    metricColumnDisplay:
      analysis?.metricColumnDisplay?.trim() ||
      prov?.numericColumnDisplay?.trim() ||
      null,
    aggregationKey: analysis?.aggregationKey ?? prov?.aggregationKey ?? null,
    aggregationLabel: analysis?.aggregation ?? prov?.aggregation ?? null,
  };
  if (
    ctx.metricColumn ||
    ctx.metricColumnDisplay ||
    (ctx.aggregationKey != null && String(ctx.aggregationKey).trim().length > 0) ||
    (ctx.aggregationLabel != null && String(ctx.aggregationLabel).trim().length > 0)
  ) {
    return buildCompactAxisValueLabel(ctx);
  }
  return compactAxisLabelFromFullPhrase(fullValueAxis);
}

function refineChartAxesWithAnalysis(
  base: ChartAxes,
  viz: StoredVisualization | null,
  analysis: AlignedAnalysisContext | null
): ChartAxes {
  const prov = viz?.provenance ?? null;

  const isHistogramViz =
    String(viz?.chartType ?? "").toLowerCase() === "histogram" ||
    String(prov?.visualizationType ?? "").toLowerCase() === "histogram";

  if (isHistogramViz) {
    const valueAxis = resolveHistogramMeasureChipLabel(
      viz as ChartSemanticVizLike,
      analysis,
      Boolean(analysis)
    );
    return {
      categoryAxis: base.categoryAxis,
      valueAxis,
      valueAxisCompact: valueAxis,
    };
  }

  const metricDisplay = (
    analysis?.metricColumnDisplay?.trim() ||
    prov?.numericColumnDisplay?.trim() ||
    ""
  ).trim();

  if (metricDisplay) {
    const polished = polishMetricDisplay(metricDisplay);
    const vc = buildCompactAxisValueLabel({
      metricColumnDisplay: metricDisplay,
      metricColumn:
        analysis?.metricColumn?.trim() || prov?.numericColumn?.trim() || null,
      aggregationKey: analysis?.aggregationKey ?? prov?.aggregationKey ?? null,
      aggregationLabel: analysis?.aggregation ?? prov?.aggregation ?? null,
    });
    return {
      categoryAxis: base.categoryAxis,
      valueAxis: polished,
      valueAxisCompact: vc,
    };
  }

  if (!analysis && !prov) {
    return {
      categoryAxis: base.categoryAxis,
      valueAxis: base.valueAxis,
      valueAxisCompact:
        base.valueAxisCompact ||
        compactAxisLabelFromFullPhrase(base.valueAxis),
    };
  }

  const agg = String(
    analysis?.aggregationKey ??
      analysis?.aggregation ??
      prov?.aggregationKey ??
      prov?.aggregation ??
      ""
  )
    .trim()
    .toLowerCase();

  const metricColumn =
    analysis?.metricColumn ||
    prov?.numericColumn ||
    "";

  if (!metricColumn.trim()) {
    return {
      categoryAxis: base.categoryAxis,
      valueAxis: base.valueAxis,
      valueAxisCompact:
        base.valueAxisCompact ||
        compactAxisLabelFromFullPhrase(base.valueAxis),
    };
  }

  const valueAxis = buildAxisLabelFromAggColumn(agg, metricColumn);

  return {
    categoryAxis: base.categoryAxis,
    valueAxis,
    valueAxisCompact: valueAxisCompactFromProvenance(valueAxis, viz, analysis),
  };
}

type ChartAxisPresentationBundle = {
  axes: ChartAxes;
  header: ChartSemanticHeaderModel;
};

function buildChartAxisPresentationBundle(args: {
  chartTitle: string;
  chartSubtitle: string;
  lastAskedQuestion: string;
  datasetKind: string;
  visualization: StoredVisualization | null;
  analysis: AlignedAnalysisContext | null;
  preferAnalysisForCategory: boolean;
  presentationKind: ChartKind;
  contract?: VisualizationContract | null;
}): ChartAxisPresentationBundle {
  if (args.contract?.mode === "relationship" && args.presentationKind === "scatter") {
    const ctx = args.contract.semanticContext;
    const xLabel =
      polishMetricDisplay(ctx?.dimensionLabel?.trim() || "") ||
      polishMetricDisplay(args.visualization?.scatterXLabel?.trim() || "") ||
      "X";
    const yLabel =
      polishMetricDisplay(ctx?.metricLabel?.trim() || "") ||
      polishMetricDisplay(args.visualization?.scatterYLabel?.trim() || "") ||
      "Y";
    const axes: ChartAxes = {
      categoryAxis: xLabel,
      valueAxis: yLabel,
      valueAxisCompact: compactAxisLabelFromFullPhrase(yLabel),
    };
    return {
      axes,
      header: { mode: "scatter", xLabel, yLabel },
    };
  }

  if (isTrendMode(args.contract)) {
    return buildTrendAxisPresentation(args.contract!);
  }

  const viz = args.visualization;
  const vizClean = sanitizeVisualizationSemanticLabels(
    viz,
    args.analysis,
    args.preferAnalysisForCategory
  );
  const norm = buildNormalizedVizMetadata({
    rawPersistedTitle: args.chartTitle,
    chartSubtitle: args.chartSubtitle,
    presentationKind: args.presentationKind,
    viz: vizClean,
    analysis: args.analysis,
    preferAnalysisForCategory: args.preferAnalysisForCategory,
  });
  const base = inferChartAxesFromContext(
    norm.titleForInference,
    args.chartSubtitle,
    args.lastAskedQuestion,
    args.datasetKind
  );
  const isScatter = String(vizClean?.chartType ?? "").toLowerCase() === "scatter";
  if (
    isScatter &&
    vizClean?.scatterXLabel?.trim() &&
    vizClean?.scatterYLabel?.trim()
  ) {
    const xLabel = polishMetricDisplay(vizClean.scatterXLabel.trim());
    const yLabel = polishMetricDisplay(vizClean.scatterYLabel.trim());
    const axes: ChartAxes = {
      categoryAxis: xLabel,
      valueAxis: yLabel,
      valueAxisCompact: compactAxisLabelFromFullPhrase(yLabel),
    };
    return {
      axes,
      header: buildChartSemanticHeader({
        presentationKind: args.presentationKind,
        chartTitle: args.chartTitle,
        grainTitleHint: norm.grainHintTitle,
        viz: { ...vizClean, scatterXLabel: xLabel, scatterYLabel: yLabel },
        analysis: args.analysis,
        preferAnalysisForCategory: args.preferAnalysisForCategory,
        refinedCategoryFallback: base.categoryAxis,
        refinedMetricLabel: axes.valueAxis,
      }),
    };
  }
  const ms = vizClean?.multiSeries;
  if (ms?.layout === "grouped_bar" && ms.seriesKeys?.length) {
    const full = groupedBarMeasureChipLabel(
      ms as NonNullable<StoredVisualization["multiSeries"]>
    );
    const refined: ChartAxes = {
      categoryAxis: ms.categoryAxisTitle?.trim() || base.categoryAxis,
      valueAxis: full,
      valueAxisCompact: compactAxisLabelFromFullPhrase(full),
    };
    const categoryAxis = resolveSemanticCategoryAxisForCharts({
      presentationKind: args.presentationKind,
      chartTitle: args.chartTitle,
      grainTitleHint: norm.grainHintTitle,
      viz: vizClean,
      analysis: args.analysis,
      preferAnalysisForCategory: args.preferAnalysisForCategory,
      refinedCategoryFallback: refined.categoryAxis,
    });
    const axes = { ...refined, categoryAxis };
    const mergedAxes = mergeInsightAxesWithAlignedAnalysis({
      axes,
      presentationKind: args.presentationKind,
      viz: vizClean,
      analysis: args.analysis,
      preferAligned: args.preferAnalysisForCategory,
      grainHintTitle: norm.grainHintTitle,
      rawChartTitle: args.chartTitle,
      mode: "category_only",
    });
    const outAxes = {
      ...mergedAxes,
      valueAxis: refined.valueAxis,
      valueAxisCompact: refined.valueAxisCompact,
    };
    return {
      axes: outAxes,
      header: buildChartSemanticHeader({
        presentationKind: args.presentationKind,
        chartTitle: args.chartTitle,
        grainTitleHint: norm.grainHintTitle,
        viz: vizClean,
        analysis: args.analysis,
        preferAnalysisForCategory: args.preferAnalysisForCategory,
        refinedCategoryFallback: outAxes.categoryAxis,
        refinedMetricLabel: outAxes.valueAxis,
      }),
    };
  }
  if (ms?.layout === "stacked_bar" && ms.seriesKeys?.length) {
    const full = ms.stackAxisTitle
      ? `Total (${ms.stackAxisTitle} stacked)`
      : base.valueAxis;
    const refined: ChartAxes = {
      categoryAxis: ms.categoryAxisTitle?.trim() || base.categoryAxis,
      valueAxis: full,
      valueAxisCompact: ms.stackAxisTitle
        ? compactAxisLabelFromFullPhrase(`Total ${ms.stackAxisTitle}`)
        : base.valueAxisCompact,
    };
    const categoryAxis = resolveSemanticCategoryAxisForCharts({
      presentationKind: args.presentationKind,
      chartTitle: args.chartTitle,
      grainTitleHint: norm.grainHintTitle,
      viz: vizClean,
      analysis: args.analysis,
      preferAnalysisForCategory: args.preferAnalysisForCategory,
      refinedCategoryFallback: refined.categoryAxis,
    });
    const axes = { ...refined, categoryAxis };
    const mergedAxes = mergeInsightAxesWithAlignedAnalysis({
      axes,
      presentationKind: args.presentationKind,
      viz: vizClean,
      analysis: args.analysis,
      preferAligned: args.preferAnalysisForCategory,
      grainHintTitle: norm.grainHintTitle,
      rawChartTitle: args.chartTitle,
      mode: "category_only",
    });
    const outAxes = {
      ...mergedAxes,
      valueAxis: refined.valueAxis,
      valueAxisCompact: refined.valueAxisCompact,
    };
    return {
      axes: outAxes,
      header: buildChartSemanticHeader({
        presentationKind: args.presentationKind,
        chartTitle: args.chartTitle,
        grainTitleHint: norm.grainHintTitle,
        viz: vizClean,
        analysis: args.analysis,
        preferAnalysisForCategory: args.preferAnalysisForCategory,
        refinedCategoryFallback: outAxes.categoryAxis,
        refinedMetricLabel: outAxes.valueAxis,
      }),
    };
  }
  const refined = refineChartAxesWithAnalysis(base, viz, args.analysis);
  const categoryAxis = resolveSemanticCategoryAxisForCharts({
    presentationKind: args.presentationKind,
    chartTitle: args.chartTitle,
    grainTitleHint: norm.grainHintTitle,
    viz: vizClean,
    analysis: args.analysis,
    preferAnalysisForCategory: args.preferAnalysisForCategory,
    refinedCategoryFallback: refined.categoryAxis,
  });
  const axes0 = { ...refined, categoryAxis };
  const mergedAxes = mergeInsightAxesWithAlignedAnalysis({
    axes: axes0,
    presentationKind: args.presentationKind,
    viz: vizClean,
    analysis: args.analysis,
    preferAligned: args.preferAnalysisForCategory,
    grainHintTitle: norm.grainHintTitle,
    rawChartTitle: args.chartTitle,
    mode: "full",
  });
  return {
    axes: mergedAxes,
    header: buildChartSemanticHeader({
      presentationKind: args.presentationKind,
      chartTitle: args.chartTitle,
      grainTitleHint: norm.grainHintTitle,
      viz: vizClean,
      analysis: args.analysis,
      preferAnalysisForCategory: args.preferAnalysisForCategory,
      refinedCategoryFallback: mergedAxes.categoryAxis,
      refinedMetricLabel: mergedAxes.valueAxis,
    }),
  };
}

function humanizeRecommendedChartApi(chart: string): string {
  const c = String(chart || "bar").trim();
  if (c === "horizontalBar") return "Horizontal bar chart";
  if (c === "kpiCards") return "KPI cards (no chart)";
  if (c === "line") return "Line chart";
  if (c === "area") return "Area chart";
  if (c === "pie") return "Pie chart";
  if (c === "donut") return "Donut chart";
  if (c === "scatter") return "Scatter plot";
  if (c === "bar") return "Vertical bar chart";
  return c;
}

type ChartRecommendation = {
  detectedIntent: string;
  categoryCount: number;
  metricType: string;
  recommendedChart: string;
  selectionExplanation: string;
};

/** Server round-trip snapshot for follow-up questions (`/ask` request + response). */
type ConversationSnapshot = {
  lastQuestion: string;
  rootQuestion?: string;
  lastChartTitle: string;
  metricColumn: string | null;
  categoryColumn: string | null;
  aggregation: string | null;
  chartType: string;
  intentBucket: string;
  filtersApplied: string[];
  turnId?: string | null;
  followUpChain?: string[];
  lastInsightChartId?: string | null;
  activeDrillPath?: string[];
  /** Prior narrative (client fills after each turn for the next request). */
  lastAiAnswer?: string;
  lastChartSubtitle?: string;
  lastChartLabelSample?: string[];
  columnMapping?: Record<string, string>;
  datasetDomain?: string;
  activeDashboardFilters?: string[];
};

type ConversationMeta = {
  followUpDetected: boolean;
  usingContextSummary: string;
  inheritedAssumptionNote: string;
  turnId: string;
  parentTurnId: string | null;
};

/** Client-side BI copilot thread memory (synced from `/ask`). */
type AiConversationState = {
  lastQuestion: string;
  lastMetric: string | null;
  lastDimension: string | null;
  lastChartType: string;
  activeFilters: string[];
  activeDrillPath: string[];
  lastResultFrame: string | null;
  lastInsightChartId: string | null;
  turnId: string | null;
  parentTurnId: string | null;
  followUpChain: string[];
};

function emptyAiConversationState(): AiConversationState {
  return {
    lastQuestion: "",
    lastMetric: null,
    lastDimension: null,
    lastChartType: "",
    activeFilters: [],
    activeDrillPath: [],
    lastResultFrame: null,
    lastInsightChartId: null,
    turnId: null,
    parentTurnId: null,
    followUpChain: [],
  };
}

function parseConversationSnapshot(raw: unknown): ConversationSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const fq = typeof o.lastQuestion === "string" ? o.lastQuestion.trim() : "";
  if (!fq) return null;
  const fa = Array.isArray(o.filtersApplied)
    ? (o.filtersApplied as unknown[]).map((x) => String(x)).filter(Boolean)
    : [];
  const chain = Array.isArray(o.followUpChain)
    ? (o.followUpChain as unknown[]).map((x) => String(x).trim()).filter(Boolean)
    : [];
  const drill = Array.isArray(o.activeDrillPath)
    ? (o.activeDrillPath as unknown[]).map((x) => String(x).trim()).filter(Boolean)
    : [];
  const labelSample = Array.isArray(o.lastChartLabelSample)
    ? (o.lastChartLabelSample as unknown[])
        .map((x) => String(x).trim())
        .filter(Boolean)
        .slice(0, 16)
    : [];
  let columnMapping: Record<string, string> | undefined;
  if (o.columnMapping && typeof o.columnMapping === "object") {
    const cm: Record<string, string> = {};
    for (const [k, v] of Object.entries(o.columnMapping as Record<string, unknown>)) {
      const ks = k.trim();
      const vs = typeof v === "string" ? v.trim() : String(v ?? "").trim();
      if (ks && vs) cm[ks] = vs;
    }
    if (Object.keys(cm).length) columnMapping = cm;
  }
  const dashF = Array.isArray(o.activeDashboardFilters)
    ? (o.activeDashboardFilters as unknown[]).map((x) => String(x).trim()).filter(Boolean)
    : [];
  return {
    lastQuestion: fq,
    rootQuestion:
      typeof o.rootQuestion === "string" && o.rootQuestion.trim()
        ? o.rootQuestion.trim()
        : chain[0] || fq,
    lastChartTitle:
      typeof o.lastChartTitle === "string" ? o.lastChartTitle.trim() : "",
    metricColumn:
      typeof o.metricColumn === "string" ? o.metricColumn.trim() || null : null,
    categoryColumn:
      typeof o.categoryColumn === "string"
        ? o.categoryColumn.trim() || null
        : null,
    aggregation:
      typeof o.aggregation === "string" ? o.aggregation.trim() || null : null,
    chartType: typeof o.chartType === "string" ? o.chartType.trim() : "bar",
    intentBucket:
      typeof o.intentBucket === "string" ? o.intentBucket.trim() : "",
    filtersApplied: fa,
    turnId: typeof o.turnId === "string" ? o.turnId.trim() || null : null,
    followUpChain: chain.length ? chain : undefined,
    lastInsightChartId:
      typeof o.lastInsightChartId === "string"
        ? o.lastInsightChartId.trim() || null
        : null,
    activeDrillPath: drill.length ? drill : undefined,
    lastAiAnswer:
      typeof o.lastAiAnswer === "string" && o.lastAiAnswer.trim()
        ? o.lastAiAnswer.trim()
        : undefined,
    lastChartSubtitle:
      typeof o.lastChartSubtitle === "string" && o.lastChartSubtitle.trim()
        ? o.lastChartSubtitle.trim()
        : undefined,
    lastChartLabelSample: labelSample.length ? labelSample : undefined,
    columnMapping,
    datasetDomain:
      typeof o.datasetDomain === "string" && o.datasetDomain.trim()
        ? o.datasetDomain.trim()
        : undefined,
    activeDashboardFilters: dashF.length ? dashF : undefined,
  };
}

function enrichConversationSnapshotForNextTurn(
  snap: ConversationSnapshot,
  args: {
    cleanedAnswer: string;
    hydrated: {
      chartData: ChartRow[];
      persisted: StoredVisualization;
    } | null;
    datasetKind: string;
    productColumn: string;
    salesColumn: string;
    regionColumn: string;
    customerColumn: string;
    profitColumn: string;
    dateColumn: string;
    dashboardFilters: { column: string; label: string; value: string }[];
  }
): ConversationSnapshot {
  const labelSample = args.hydrated
    ? args.hydrated.chartData
        .slice(0, 12)
        .map((r) => String(r.name ?? "").trim())
        .filter(Boolean)
    : [];
  const mapping: Record<string, string> = {};
  const put = (role: string, col: string) => {
    const c = col.trim();
    if (c) mapping[role] = c;
  };
  put("product", args.productColumn);
  put("sales", args.salesColumn);
  put("region", args.regionColumn);
  put("customer", args.customerColumn);
  put("profit", args.profitColumn);
  put("date", args.dateColumn);

  const activeDashboardFilters = args.dashboardFilters
    .map((f) => {
      const lab = f.label.trim() || f.column.trim();
      const val = f.value.trim();
      return lab && val ? `${lab}: ${val}` : "";
    })
    .filter(Boolean);

  const sub = String(args.hydrated?.persisted.subtitle ?? "").trim();

  return {
    ...snap,
    lastAiAnswer: args.cleanedAnswer.replace(/\s+/g, " ").trim().slice(0, 2800),
    lastChartSubtitle: sub || undefined,
    lastChartLabelSample: labelSample.length ? labelSample : undefined,
    columnMapping: Object.keys(mapping).length ? mapping : undefined,
    datasetDomain: args.datasetKind.trim() || undefined,
    activeDashboardFilters:
      activeDashboardFilters.length > 0 ? activeDashboardFilters : undefined,
  };
}

function parseConversationMeta(raw: unknown): ConversationMeta | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  return {
    followUpDetected: Boolean(o.followUpDetected),
    usingContextSummary: String(o.usingContextSummary ?? "").trim(),
    inheritedAssumptionNote: String(o.inheritedAssumptionNote ?? "").trim(),
    turnId: typeof o.turnId === "string" ? o.turnId.trim() : "",
    parentTurnId:
      typeof o.parentTurnId === "string" && o.parentTurnId.trim()
        ? String(o.parentTurnId).trim()
        : null,
  };
}

type ConversationFollowUpMeta = {
  wasFollowUp: boolean;
  previousAnalysisSummary: string;
  followUpApplied: string;
  contextUsedLine: string;
  originalFollowUp?: string;
};

function parseConversationFollowUp(raw: unknown): ConversationFollowUpMeta | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (!o.wasFollowUp) return null;
  return {
    wasFollowUp: true,
    previousAnalysisSummary: String(o.previousAnalysisSummary ?? "").trim(),
    followUpApplied: String(o.followUpApplied ?? "").trim(),
    contextUsedLine: String(o.contextUsedLine ?? "").trim(),
    originalFollowUp:
      typeof o.originalFollowUp === "string" ? o.originalFollowUp.trim() : undefined,
  };
}

function parseChartRecommendation(raw: unknown): ChartRecommendation | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const exp =
    typeof o.selectionExplanation === "string"
      ? o.selectionExplanation.trim()
      : "";
  return {
    detectedIntent:
      typeof o.detectedIntent === "string"
        ? o.detectedIntent.trim()
        : String(o.detectedIntent ?? "").trim() || "—",
    categoryCount: Number.isFinite(Number(o.categoryCount))
      ? Number(o.categoryCount)
      : 0,
    metricType:
      typeof o.metricType === "string" && o.metricType.trim()
        ? o.metricType.trim()
        : "numeric",
    recommendedChart:
      typeof o.recommendedChart === "string" && o.recommendedChart.trim()
        ? o.recommendedChart.trim()
        : "bar",
    selectionExplanation: exp,
  };
}

/** Pandas-side explainability from `/ask` `visualization.provenance` (never from AI prose). */
type InsightProvenance = {
  categoryColumn: string | null;
  numericColumn: string | null;
  numericColumnDisplay?: string | null;
  categoryColumnDisplay?: string | null;
  aggregation: string;
  aggregationKey?: string;
  rowsAnalyzed: number;
  chartPoints: number;
  visualizationType: string;
  chartTypeApi?: string;
  confidence: "High" | "Medium" | "Low";
  flags?: {
    fallbackAggregateUsed?: boolean;
    smartChartRoutingUsed?: boolean;
    intentStructured?: boolean;
  };
  notes?: string | null;
  chartSelectionReason?: string | null;
  analysisValidation?: {
    checks: { label: string; ok: boolean }[];
    partialVisualizationWarning: string | null;
  } | null;
  /** Backend merge of dashboard + follow-up row filters for this visualization. */
  dashboardFiltersApplied?: string[];
  /** Adaptive time bucketing metadata when present (`visualization.provenance`). */
  timeSeriesAnalysis?: Record<string, unknown> | null;
};

function parseInsightProvenance(raw: unknown): InsightProvenance | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  const c = p.confidence;
  if (c !== "High" && c !== "Medium" && c !== "Low") return null;
  const ra = Number(p.rowsAnalyzed);
  const cp = Number(p.chartPoints);
  if (!Number.isFinite(ra) || !Number.isFinite(cp)) return null;
  const cat = p.categoryColumn;
  const num = p.numericColumn;
  const agg = typeof p.aggregation === "string" ? p.aggregation.trim() : "";
  if (!agg) return null;
  const vizt =
    typeof p.visualizationType === "string" && p.visualizationType.trim()
      ? p.visualizationType.trim()
      : "Chart";
  const flagsRaw = p.flags;
  let flags: InsightProvenance["flags"];
  if (flagsRaw && typeof flagsRaw === "object") {
    const f = flagsRaw as Record<string, unknown>;
    flags = {
      fallbackAggregateUsed: Boolean(f.fallbackAggregateUsed),
      smartChartRoutingUsed: Boolean(f.smartChartRoutingUsed),
      intentStructured: Boolean(f.intentStructured),
    };
  }
  const csr = p.chartSelectionReason;
  const chartSelectionReason =
    typeof csr === "string" && csr.trim()
      ? csr.trim()
      : csr === null
        ? null
        : undefined;

  let analysisValidation: InsightProvenance["analysisValidation"];
  const avRaw = p.analysisValidation;
  if (avRaw && typeof avRaw === "object") {
    const avo = avRaw as Record<string, unknown>;
    const chkRaw = avo.checks;
    if (Array.isArray(chkRaw)) {
      const checks: { label: string; ok: boolean }[] = [];
      for (const row of chkRaw) {
        if (!row || typeof row !== "object") continue;
        const r = row as Record<string, unknown>;
        const lab =
          typeof r.label === "string" && r.label.trim() ? r.label.trim() : "";
        if (!lab) continue;
        checks.push({ label: lab, ok: Boolean(r.ok) });
      }
      const pvw = avo.partialVisualizationWarning;
      analysisValidation = {
        checks,
        partialVisualizationWarning:
          typeof pvw === "string" && pvw.trim()
            ? pvw.trim()
            : pvw === null
              ? null
              : null,
      };
    }
  }

  return {
    categoryColumn:
      cat === null || cat === undefined
        ? null
        : typeof cat === "string"
          ? cat.trim() || null
          : null,
    numericColumn:
      num === null || num === undefined
        ? null
        : typeof num === "string"
          ? num.trim() || null
          : null,
    numericColumnDisplay:
      typeof p.numericColumnDisplay === "string" && p.numericColumnDisplay.trim()
        ? p.numericColumnDisplay.trim()
        : p.numericColumnDisplay === null
          ? null
          : undefined,
    categoryColumnDisplay:
      typeof p.categoryColumnDisplay === "string" && p.categoryColumnDisplay.trim()
        ? p.categoryColumnDisplay.trim()
        : p.categoryColumnDisplay === null
          ? null
          : undefined,
    aggregation: agg,
    aggregationKey:
      typeof p.aggregationKey === "string" ? p.aggregationKey : undefined,
    rowsAnalyzed: ra,
    chartPoints: cp,
    visualizationType: vizt,
    chartTypeApi:
      typeof p.chartTypeApi === "string" ? p.chartTypeApi : undefined,
    confidence: c,
    flags,
    notes:
      typeof p.notes === "string" && p.notes.trim()
        ? p.notes.trim()
        : p.notes === null
          ? null
          : undefined,
    chartSelectionReason,
    analysisValidation,
    dashboardFiltersApplied: Array.isArray(p.dashboardFiltersApplied)
      ? (p.dashboardFiltersApplied as unknown[]).map((x) => String(x)).filter(Boolean)
      : undefined,
    timeSeriesAnalysis:
      p.timeSeriesAnalysis && typeof p.timeSeriesAnalysis === "object"
        ? (p.timeSeriesAnalysis as Record<string, unknown>)
        : undefined,
  };
}

type DrillDimension = {
  column: string;
  role: string;
  label: string;
};

type VizInteractionPayload = {
  drillDimensions: DrillDimension[];
};

function parseChartInteraction(raw: unknown): VizInteractionPayload | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  const d = o.drillDimensions;
  if (!Array.isArray(d)) return undefined;
  const dims: DrillDimension[] = [];
  for (const x of d) {
    if (!x || typeof x !== "object") continue;
    const r = x as Record<string, unknown>;
    const col = typeof r.column === "string" ? r.column.trim() : "";
    if (!col) continue;
    dims.push({
      column: col,
      role: typeof r.role === "string" ? r.role : "primary",
      label:
        typeof r.label === "string" && r.label.trim() ? r.label.trim() : col,
    });
  }
  if (!dims.length) return undefined;
  return { drillDimensions: dims };
}

function formatProvenanceColumn(v: string | null | undefined): string {
  if (v == null || !String(v).trim()) return "—";
  return String(v).trim();
}

function provenanceConfidenceBadgeClass(
  level: InsightProvenance["confidence"]
): string {
  if (level === "High")
    return "rounded-full px-2.5 py-1 text-[9px] font-semibold uppercase tracking-wide shadow-[var(--shadow-sm)] [color:var(--badge-high-fg)] [background-color:var(--badge-high-bg)] ring-1 ring-inset [ring-color:var(--badge-high-ring)]";
  if (level === "Medium")
    return "rounded-full px-2.5 py-1 text-[9px] font-semibold uppercase tracking-wide shadow-[var(--shadow-sm)] [color:var(--badge-medium-fg)] [background-color:var(--badge-medium-bg)] ring-1 ring-inset [ring-color:var(--badge-medium-ring)]";
  return "rounded-full px-2.5 py-1 text-[9px] font-semibold uppercase tracking-wide shadow-[var(--shadow-sm)] [color:var(--badge-low-fg)] [background-color:var(--badge-low-bg)] ring-1 ring-inset [ring-color:var(--badge-low-ring)]";
}

/** Backend `/ask` `analysis.insightConfidenceLevel` (low | medium | high). */
function insightEngineConfidenceBadgeClass(level: string): string {
  const l = String(level || "").toLowerCase();
  if (l === "high")
    return "rounded-full px-2.5 py-1 text-[9px] font-semibold uppercase tracking-wide shadow-[var(--shadow-sm)] [color:var(--badge-high-fg)] [background-color:var(--badge-high-bg)] ring-1 ring-inset [ring-color:var(--badge-high-ring)]";
  if (l === "medium")
    return "rounded-full px-2.5 py-1 text-[9px] font-semibold uppercase tracking-wide shadow-[var(--shadow-sm)] [color:var(--badge-medium-fg)] [background-color:var(--badge-medium-bg)] ring-1 ring-inset [ring-color:var(--badge-medium-ring)]";
  return "rounded-full px-2.5 py-1 text-[9px] font-semibold uppercase tracking-wide shadow-[var(--shadow-sm)] [color:var(--badge-low-fg)] [background-color:var(--badge-low-bg)] ring-1 ring-inset [ring-color:var(--badge-low-ring)]";
}

/** Canonical visualization from /ask — single source for charts & export. */
type StoredVisualization = {
  chartType: string;
  title: string;
  subtitle: string;
  labels: string[];
  values: number[];
  /** Same length as labels/values when provided by API (`valueDisplay`). */
  formattedValues?: string[];
  /** Optional API hint (`pct_1` | `money_0` | …); read-only for future use. */
  roundingHint?: string;
  /** Structured pandas provenance when present (API `visualization.provenance`). */
  provenance?: InsightProvenance | null;
  /** Client- or API-resolved analyzed row count for badges when provenance is thin. */
  analyzedRows?: number | null;
  chartRecommendation?: ChartRecommendation | null;
  scatterXLabel?: string;
  scatterYLabel?: string;
  /** Parallel to labels when API sends `scatterX` / `scatterXDisplay`. */
  scatterXValues?: number[];
  scatterXFormatted?: string[];
  /** Follow-up / chart routing note from API (`visualization.contextUsed`). */
  contextUsed?: string;
  /** Stacked / multi-series metadata when API sends `multiSeries` + `stackedBarRows`. */
  multiSeries?: {
    layout?: string;
    seriesKeys: string[];
    seriesLabels: Record<string, string>;
    categoryAxisTitle?: string;
    stackAxisTitle?: string;
  } | null;
  partialVisualizationWarning?: string | null;
  /** Click-to-filter metadata from `/ask` (category / stacked dimensions). */
  interaction?: VizInteractionPayload;
  /** Pandas-computed scatter notes (API `visualization.relationshipInsights`). */
  relationshipMeasureLabel?: string | null;
  rankedExecutiveInsights?: unknown;
  relationshipInsights?: {
    pearson?: number | null;
    direction?: string | null;
    correlationLabel?: string | null;
    summaryLine?: string | null;
    measureLabel?: string | null;
    strongestOutliers?: {
      point?: string;
      note?: string;
      x?: number | null;
      y?: number | null;
      xLabel?: string;
      yLabel?: string;
    }[];
  } | null;
};

function hydrateVisualizationFromApi(raw: unknown): {
  persisted: StoredVisualization;
  chartData: ChartRow[];
  chartKind: ChartKind;
} | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const analyzedRowsFromApi =
    typeof o.analyzedRows === "number" &&
    Number.isFinite(o.analyzedRows) &&
    (o.analyzedRows as number) > 0
      ? (o.analyzedRows as number)
      : undefined;
  const partialVizWarn =
    typeof o.partialVisualizationWarning === "string" &&
    o.partialVisualizationWarning.trim()
      ? o.partialVisualizationWarning.trim()
      : undefined;

  const stackedRowsRaw = Array.isArray(o.stackedBarRows) ? o.stackedBarRows : [];
  const multiObj =
    o.multiSeries && typeof o.multiSeries === "object"
      ? (o.multiSeries as Record<string, unknown>)
      : null;
  const multiLayout = multiObj ? String(multiObj.layout ?? "").trim() : "";
  const isMultiMetricBar =
    multiLayout === "stacked_bar" || multiLayout === "grouped_bar";
  const stackedSeriesKeys =
    multiObj && isMultiMetricBar
      ? Array.isArray(multiObj.seriesKeys)
        ? (multiObj.seriesKeys as unknown[]).map((k) => String(k))
        : []
      : [];

  if (stackedRowsRaw.length && stackedSeriesKeys.length) {
    const seriesLabels: Record<string, string> = {};
    if (multiObj && multiObj.seriesLabels && typeof multiObj.seriesLabels === "object") {
      for (const [k, v] of Object.entries(
        multiObj.seriesLabels as Record<string, unknown>
      )) {
        seriesLabels[k] = String(v ?? k);
      }
    }
    const multiSeriesPersisted: NonNullable<StoredVisualization["multiSeries"]> = {
      layout: multiLayout === "grouped_bar" ? "grouped_bar" : "stacked_bar",
      seriesKeys: stackedSeriesKeys,
      seriesLabels,
      categoryAxisTitle:
        typeof multiObj!.categoryAxisTitle === "string"
          ? multiObj!.categoryAxisTitle.trim()
          : undefined,
      stackAxisTitle:
        typeof multiObj!.stackAxisTitle === "string"
          ? multiObj!.stackAxisTitle.trim()
          : undefined,
    };
    const stackedData: ChartRow[] = [];
    for (const raw of stackedRowsRaw) {
      if (!raw || typeof raw !== "object") continue;
      const rec = raw as Record<string, unknown>;
      const name = String(rec.name ?? "");
      const value = typeof rec.value === "number" ? rec.value : Number(rec.value);
      if (!Number.isFinite(value)) continue;
      const dv =
        typeof rec.valueDisplay === "string" && rec.valueDisplay.trim()
          ? rec.valueDisplay.trim()
          : undefined;
      const row: ChartRow = { name, value, displayValue: dv };
      for (const sk of stackedSeriesKeys) {
        const nv = Number(rec[sk]);
        if (Number.isFinite(nv)) row[sk] = nv;
      }
      stackedData.push(row);
    }
    if (stackedData.length === 0) return null;
    for (let i = 0; i < stackedData.length; i++) {
      const r = stackedData[i];
      if (!r.displayValue?.trim()) {
        stackedData[i] = {
          ...r,
          displayValue: fallbackChartNumericDisplay("bar", r.value),
        };
      }
    }
    const persistedStacked: StoredVisualization = {
      chartType: String(o.chartType ?? "bar"),
      title:
        typeof o.title === "string" && o.title.trim() ? o.title.trim() : "Chart",
      subtitle:
        typeof o.subtitle === "string" && o.subtitle.trim()
          ? o.subtitle.trim()
          : "Generated from AI analysis",
      labels: stackedData.map((r) => r.name),
      values: stackedData.map((r) => r.value),
      formattedValues: stackedData.map((r) => r.displayValue ?? ""),
      roundingHint:
        typeof o.roundingHint === "string" && o.roundingHint.trim()
          ? o.roundingHint.trim()
          : undefined,
      provenance: parseInsightProvenance(o.provenance),
      analyzedRows: analyzedRowsFromApi,
      chartRecommendation: parseChartRecommendation(o.chartRecommendation),
      contextUsed:
        typeof o.contextUsed === "string" && o.contextUsed.trim()
          ? o.contextUsed.trim()
          : undefined,
      multiSeries: multiSeriesPersisted,
      partialVisualizationWarning: partialVizWarn,
      interaction: parseChartInteraction(o.interaction),
    };
    return { persisted: persistedStacked, chartData: stackedData, chartKind: "bar" };
  }

  const labelsRaw = Array.isArray(o.labels) ? o.labels : [];
  const valuesRaw = Array.isArray(o.values) ? o.values : [];
  const displayRaw = Array.isArray(o.valueDisplay) ? o.valueDisplay : [];
  const labels = labelsRaw.map((x) => String(x ?? ""));
  const ctNorm = String(o.chartType ?? "bar")
    .toLowerCase()
    .replace(/\s+/g, "");
  const sxRaw = Array.isArray(o.scatterX) ? o.scatterX : [];
  const sxDisp = Array.isArray(o.scatterXDisplay) ? o.scatterXDisplay : [];
  const chartData: ChartRow[] = [];
  const cap = Math.min(labels.length, valuesRaw.length);
  for (let i = 0; i < cap; i++) {
    const vx = valuesRaw[i];
    const v = typeof vx === "number" ? vx : Number(vx);
    if (!Number.isFinite(v)) continue;
    const dv =
      i < displayRaw.length && displayRaw[i] != null && String(displayRaw[i]).trim()
        ? String(displayRaw[i]).trim()
        : undefined;
    const row: ChartRow = { name: labels[i], value: v, displayValue: dv };
    if (ctNorm === "scatter" && i < sxRaw.length) {
      const xv = sxRaw[i];
      const xn = typeof xv === "number" ? xv : Number(xv);
      if (Number.isFinite(xn)) {
        row.x = xn;
        row.displayX =
          i < sxDisp.length && sxDisp[i] != null && String(sxDisp[i]).trim()
            ? String(sxDisp[i]).trim()
            : undefined;
      }
    }
    chartData.push(row);
  }
  if (chartData.length === 0) return null;

  if (ctNorm === "scatter") {
    const ok = chartData.filter(
      (r) => typeof r.x === "number" && Number.isFinite(r.x)
    );
    if (ok.length === 0) return null;
    chartData.length = 0;
    chartData.push(...ok);
  }

  let chartKind: ChartKind = "bar";
  if (
    ctNorm === "horizontalbar" ||
    ctNorm === "bar_horizontal" ||
    ctNorm === "horizontal_bar"
  ) {
    chartKind = "bar_horizontal";
  } else if (ctNorm === "line") chartKind = "line";
  else if (ctNorm === "area") chartKind = "area";
  else if (ctNorm === "pie") chartKind = "pie";
  else if (ctNorm === "donut") chartKind = "donut";
  else if (ctNorm === "scatter") chartKind = "scatter";
  else if (ctNorm === "histogram") chartKind = "histogram";

  for (let i = 0; i < chartData.length; i++) {
    const r = chartData[i];
    if (!r.displayValue?.trim()) {
      const dispKind: ChartKind =
        chartKind === "donut"
          ? "pie"
          : chartKind === "area"
            ? "line"
            : chartKind === "scatter"
              ? "bar"
              : chartKind === "histogram"
                ? "histogram"
                : chartKind;
      chartData[i] = {
        ...r,
        displayValue: fallbackChartNumericDisplay(dispKind || "bar", r.value),
      };
    }
  }

  const sxLabel =
    typeof o.scatterXLabel === "string" && o.scatterXLabel.trim()
      ? o.scatterXLabel.trim()
      : undefined;
  const syLabel =
    typeof o.scatterYLabel === "string" && o.scatterYLabel.trim()
      ? o.scatterYLabel.trim()
      : undefined;

  let mergedSubtitle =
    typeof o.subtitle === "string" && o.subtitle.trim()
      ? o.subtitle.trim()
      : "Generated from AI analysis";
  const riFromApi = o.relationshipInsights;
  if (
    ctNorm === "scatter" &&
    riFromApi &&
    typeof riFromApi === "object" &&
    riFromApi !== null
  ) {
    const sl = String(
      (riFromApi as { summaryLine?: string }).summaryLine ?? ""
    ).trim();
    const outlierHint = "";
    if (sl) {
      mergedSubtitle = `${mergedSubtitle}\n${sl}`;
    }
    if (outlierHint) {
      mergedSubtitle = `${mergedSubtitle}\n${outlierHint}`;
    }
  }

  const persisted: StoredVisualization = {
    chartType: String(o.chartType ?? "bar"),
    title:
      typeof o.title === "string" && o.title.trim() ? o.title.trim() : "Chart",
    subtitle: mergedSubtitle,
    labels: chartData.map((r) => r.name),
    values: chartData.map((r) => r.value),
    formattedValues: chartData.map((r) => r.displayValue ?? ""),
    roundingHint:
      typeof o.roundingHint === "string" && o.roundingHint.trim()
        ? o.roundingHint.trim()
        : undefined,
    provenance: parseInsightProvenance(o.provenance),
    analyzedRows: analyzedRowsFromApi,
    chartRecommendation: parseChartRecommendation(o.chartRecommendation),
    scatterXLabel: sxLabel,
    scatterYLabel: syLabel,
    scatterXValues:
      chartKind === "scatter"
        ? chartData.map((r) =>
            typeof r.x === "number" && Number.isFinite(r.x) ? r.x : Number.NaN
          )
        : undefined,
    scatterXFormatted:
      chartKind === "scatter"
        ? chartData.map((r) => r.displayX?.trim() ?? "")
        : undefined,
    contextUsed:
      typeof o.contextUsed === "string" && o.contextUsed.trim()
        ? o.contextUsed.trim()
        : undefined,
    multiSeries: null,
    partialVisualizationWarning: partialVizWarn,
    interaction: parseChartInteraction(o.interaction),
    relationshipMeasureLabel:
      typeof o.relationshipMeasureLabel === "string" &&
      o.relationshipMeasureLabel.trim()
        ? o.relationshipMeasureLabel.trim()
        : typeof (riFromApi as { measureLabel?: string } | null)?.measureLabel ===
              "string"
          ? String((riFromApi as { measureLabel?: string }).measureLabel).trim()
          : undefined,
    relationshipInsights:
      ctNorm === "scatter" &&
      riFromApi &&
      typeof riFromApi === "object"
        ? (riFromApi as StoredVisualization["relationshipInsights"])
        : null,
    rankedExecutiveInsights: o.rankedExecutiveInsights,
  };

  return { persisted, chartData, chartKind };
}

type VizInsightDatum = {
  label: string;
  value: number;
  formatted: string;
  x?: number;
  formattedX?: string;
};

function isMultiMetricBarLayout(
  layout: string | undefined | null
): layout is "stacked_bar" | "grouped_bar" {
  return layout === "stacked_bar" || layout === "grouped_bar";
}

/** MEASURE chip + axis label for grouped dual-metric charts (not generic stack axis). */
function groupedBarMeasureChipLabel(
  ms: Pick<
    NonNullable<StoredVisualization["multiSeries"]>,
    "seriesKeys" | "seriesLabels" | "stackAxisTitle"
  >
): string {
  const parts = (ms.seriesKeys ?? [])
    .map((k) => ms.seriesLabels?.[k]?.trim())
    .filter(Boolean);
  if (parts.length >= 2) return parts.join(" & ");
  if (parts.length === 1) return parts[0]!;
  const stack = ms.stackAxisTitle?.trim();
  if (stack && stack.toLowerCase() !== "amount") return stack;
  const fromKeys = (ms.seriesKeys ?? [])
    .map((k) => humanizeColumnName(k))
    .filter(Boolean);
  if (fromKeys.length >= 2) return fromKeys.join(" & ");
  return "Multiple measures";
}

/** Executive signal cards for grouped revenue vs spend (etc.) by category. */
function buildGroupedMetricExecutiveInsights(
  chartData: ChartRow[],
  ms: NonNullable<StoredVisualization["multiSeries"]>,
  dimLabel: string,
  roundingHint?: string
): ExecutiveVizInsightCard[] {
  const keys = ms.seriesKeys.filter((k) => k.trim()).slice(0, 2);
  if (!keys.length || !chartData.length) return [];

  const stripes = [
    "bg-emerald-500",
    "bg-sky-500",
    "bg-rose-500",
    "bg-amber-500",
  ] as const;
  const out: ExecutiveVizInsightCard[] = [];

  keys.forEach((k, ki) => {
    const seriesLabel = ms.seriesLabels[k]?.trim() || k;
    let iMax = 0;
    chartData.forEach((r, i) => {
      const v = Number(r[k]);
      const cur = Number(chartData[iMax]![k]);
      if (Number.isFinite(v) && (!Number.isFinite(cur) || v > cur)) iMax = i;
    });
    const top = chartData[iMax]!;
    const topVal = Number(top[k]);
    out.push({
      key: `dual-top-${k}`,
      title: `Highest ${seriesLabel}`,
      value: shortenLabel(String(top.name ?? ""), 44),
      hint: Number.isFinite(topVal)
        ? formatDerivedInsightNumber(topVal, roundingHint, false)
        : undefined,
      dotClass: stripes[ki % stripes.length]!,
    });
  });

  if (keys.length >= 2) {
    const spendKey = keys.find((k) =>
      /spend|cost|budget|expense|ad[_\s-]?spend|cogs|opex/i.test(k)
    );
    const revKey = keys.find((k) => /revenue|sales|income/i.test(k));
    if (
      spendKey &&
      revKey &&
      spendKey !== revKey &&
      /spend|cost|budget|expense|ad/i.test(spendKey)
    ) {
      let iBest = 0;
      let bestRoas = -1;
      chartData.forEach((r, i) => {
        const spend = Number(r[spendKey]);
        const rev = Number(r[revKey]);
        if (Number.isFinite(spend) && spend > 1e-9 && Number.isFinite(rev)) {
          const roas = rev / spend;
          if (roas > bestRoas) {
            bestRoas = roas;
            iBest = i;
          }
        }
      });
      if (bestRoas >= 0) {
        const best = chartData[iBest]!;
        out.push({
          key: "dual-roas",
          title: "Best ROAS",
          value: shortenLabel(String(best.name ?? ""), 44),
          hint: formatDerivedInsightNumber(bestRoas, "ratio_1", false),
          dotClass: "bg-violet-500",
        });
      }
    }
  }

  return out.slice(0, 4);
}

/** Pairs visualization.labels with values + display strings — no prose parsing. */
function zipStoredVisualizationPairs(
  viz: StoredVisualization
): VizInsightDatum[] {
  const n = Math.min(viz.labels.length, viz.values.length);
  const out: VizInsightDatum[] = [];
  for (let i = 0; i < n; i++) {
    const v = Number(viz.values[i]);
    if (!Number.isFinite(v)) continue;
    const metricCtx: MetricFormatContext = {
      metricLabel: viz.title,
      chartTitle: viz.title,
      roundingHint: viz.roundingHint,
      presentationKind: viz.roundingHint === "pct_1" ? "pie" : "bar",
    };
    const preformatted = viz.formattedValues?.[i]?.trim();
    const rowForFmt: ChartRow = { name: String(viz.labels[i] ?? ""), value: v };
    let fmt: string;
    if (preformatted && !metricFormatUsesPercent(metricCtx)) {
      fmt = preformatted;
    } else {
      fmt = formatExecutiveMetricValue(rowForFmt, metricCtx);
    }
    const xv = viz.scatterXValues?.[i];
    const xNum = typeof xv === "number" && Number.isFinite(xv) ? xv : undefined;
    const xfmt = viz.scatterXFormatted?.[i]?.trim();
    out.push({
      label: String(viz.labels[i] ?? "").trim() || "—",
      value: v,
      formatted: fmt,
      x: xNum,
      formattedX: xfmt || undefined,
    });
  }
  return out;
}

/** Semantic layer for pinned auto-dashboard charts — driven by snapshot title/API chart type, not `/ask` alignedAnalysis. */
function semanticContextForPinnedDashboard(
  snap: ChartSnapshot | null,
  viz: StoredVisualization | null,
  presentationKind: ChartKind,
  datasetDomain: string,
  metricColumn: string | null,
  categoryColumn: string | null
): ReturnType<typeof fromAutoDashboardChart> {
  if (!snap || snap.source !== "auto_dashboard") return null;
  const apiChart =
    viz?.chartType?.trim() ||
    (presentationKind ? chartKindToApiChartType(presentationKind) : "bar");
  return fromAutoDashboardChart(
    {
      title: snap.title,
      chartType: apiChart,
      metricColumn,
      categoryColumn,
      aggregationKey: "sum",
    },
    datasetDomain
  );
}

function formatDerivedInsightNumber(
  v: number,
  roundingHint: string | undefined,
  treatAsPieShare: boolean
): string {
  if (treatAsPieShare || roundingHint === "pct_1") {
    return `${Number(Math.abs(v).toFixed(1))}%`;
  }
  const h = roundingHint ?? "";
  if (h === "money_0" || h === "int_0")
    return Math.round(v).toLocaleString();
  if (h === "ratio_1") {
    const ir = Math.round(v);
    if (Math.abs(v - ir) < 1e-9) return ir.toLocaleString();
    const t = Number(v.toFixed(1));
    const s = t.toLocaleString(undefined, {
      minimumFractionDigits:
        Number.isInteger(t) || Math.abs(t - Math.round(t)) < 0.06 ? 0 : 1,
      maximumFractionDigits: 1,
    });
    return s;
  }
  if (Number.isInteger(v) && Math.abs(v - Math.round(v)) < 1e-9)
    return Math.round(v).toLocaleString();
  const r = Number(v.toFixed(2));
  return r.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

type ExecutiveVizInsightCard = {
  key: string;
  title: string;
  value: string;
  hint?: string;
  ariaLabel?: string;
  dotClass: string;
};

function executiveMeasureContextFromAligned(
  axes: ChartAxes,
  analysis: AlignedAnalysisContext | null | undefined,
  chartTitle: string,
  columns: string[]
): ResolveExecutiveMeasureArgs {
  return {
    metricColumnDisplay: analysis?.metricColumnDisplay ?? null,
    metricColumn: analysis?.metricColumn ?? null,
    valueAxis: axes.valueAxis,
    valueAxisCompact: axes.valueAxisCompact,
    chartTitle,
    datasetColumns: columns,
  };
}

/** Compact insight tiles derived only from persisted visualization primitives. */
function buildExecutiveVizInsights(
  rows: VizInsightDatum[],
  kind: ChartKind,
  axes: ChartAxes,
  roundingHint?: string,
  measureCtx?: ResolveExecutiveMeasureArgs,
  dimensionCtx?: {
    categoryColumnDisplay?: string | null;
    categoryColumn?: string | null;
  }
): ExecutiveVizInsightCard[] {
  if (!rows.length) return [];

  const measure = resolveExecutiveMeasureLabel(measureCtx ?? { valueAxis: axes.valueAxis });
  const dim = resolveExecutiveDimensionLabel({
    categoryColumnDisplay: dimensionCtx?.categoryColumnDisplay,
    categoryColumn: dimensionCtx?.categoryColumn,
    categoryAxis: axes.categoryAxis,
  });

  const stripes = [
    "bg-emerald-500",
    "bg-sky-500",
    "bg-rose-500",
    "bg-amber-500",
    "bg-violet-500",
    "bg-slate-400",
  ] as const;
  let stripeIdx = 0;
  const nextDot = () => stripes[stripeIdx++ % stripes.length];

  if (kind === "scatter") {
    const xs = rows
      .map((r) => (typeof r.x === "number" && Number.isFinite(r.x) ? r.x : NaN))
      .filter((x) => Number.isFinite(x));
    const ys = rows.map((r) => r.value);
    const corr =
      xs.length >= 2 && ys.length >= xs.length
        ? pearsonCorrelation(xs, ys.slice(0, xs.length))
        : null;
    let iMaxY = 0;
    rows.forEach((r, i) => {
      if (r.value > rows[iMaxY].value) iMaxY = i;
    });
    const maxY = rows[iMaxY];
    const xMet = resolveExecutiveMeasureLabel({
      ...measureCtx,
      valueAxis: axes.categoryAxis,
    });
    const yMet = measure;
    const outScatter: ExecutiveVizInsightCard[] = [
      {
        key: "sc-n",
        title: buildInsightCardTitle(measure, "points"),
        value: String(rows.length),
        dotClass: nextDot(),
      },
      {
        key: "sc-peak-y",
        title: buildInsightCardTitle(yMet, "peak"),
        value: maxY.formatted,
        hint: shortenLabel(maxY.label, 40),
        dotClass: nextDot(),
      },
    ];
    if (corr != null && Number.isFinite(corr)) {
      outScatter.push({
        key: "sc-corr",
        title: buildInsightCardTitle(measure, "correlation"),
        value: (corr > 0 ? "+" : "") + corr.toFixed(2),
        hint: `${xMet} vs ${yMet}`,
        dotClass: nextDot(),
      });
    }
    return outScatter;
  }

  if (kind === "pie" || kind === "donut") {
    let iMax = 0;
    let iMin = 0;
    rows.forEach((r, i) => {
      if (r.value > rows[iMax].value) iMax = i;
      if (r.value < rows[iMin].value) iMin = i;
    });
    const maxR = rows[iMax];
    const minR = rows[iMin];
    const gap = maxR.value - minR.value;
    const sliceCount = rows.length;
    const out: ExecutiveVizInsightCard[] = [
      {
        key: "pie-max-label",
        title: buildInsightCardTitle(measure, "largest"),
        value: shortenLabel(maxR.label, 40),
        hint: maxR.formatted.trim() ? maxR.formatted : undefined,
        dotClass: nextDot(),
      },
      {
        key: "pie-min-label",
        title: buildInsightCardTitle(measure, "smallest"),
        value: shortenLabel(minR.label, 40),
        hint: minR.formatted.trim() ? minR.formatted : undefined,
        dotClass: nextDot(),
      },
      {
        key: "pie-gap",
        title: buildInsightCardTitle(measure, "gap"),
        value: `${formatDerivedInsightNumber(gap, roundingHint ?? "pct_1", true)} (spread)`,
        dotClass: nextDot(),
      },
      {
        key: "pie-n",
        title: buildInsightCardTitle(measure, "segments"),
        value: String(sliceCount),
        dotClass: nextDot(),
      },
    ];
    return out;
  }

  if (rows.length === 1) {
    const r = rows[0];
    stripeIdx = 0;
    return [
      {
        key: "single-dim",
        title: buildInsightDimensionCardTitle(dim, "leader"),
        value: shortenLabel(r.label, 44),
        hint: r.formatted,
        dotClass: nextDot(),
      },
      {
        key: "single-met",
        title: buildInsightCardTitle(measure, "peak"),
        value: r.formatted,
        dotClass: nextDot(),
      },
      {
        key: "single-points",
        title:
          kind === "line" || kind === "area"
            ? buildInsightCardTitle(measure, "trend")
            : buildInsightCardTitle(measure, "points"),
        value: "1",
        dotClass: nextDot(),
      },
    ];
  }

  let iMax = 0;
  let iMin = 0;
  rows.forEach((r, i) => {
    if (r.value > rows[iMax].value) iMax = i;
    if (r.value < rows[iMin].value) iMin = i;
  });
  const maxR = rows[iMax];
  const minR = rows[iMin];
  const spread = maxR.value - minR.value;
  const sum = rows.reduce((a, r) => a + r.value, 0);
  const avg = sum / rows.length;

  const out: ExecutiveVizInsightCard[] = [
    {
      key: "cmp-max-cat",
      title: buildInsightDimensionCardTitle(dim, "highest"),
      value: shortenLabel(maxR.label, 44),
      hint:
        kind === "line" || kind === "area"
          ? `Peak value: ${maxR.formatted}`
          : `Highest: ${maxR.formatted}`,
      dotClass: nextDot(),
    },
    {
      key: "cmp-peak-met",
      title: buildInsightCardTitle(
        measure,
        kind === "line" || kind === "area" ? "peak" : "highest"
      ),
      value: maxR.formatted,
      dotClass: nextDot(),
    },
    {
      key: "cmp-min-cat",
      title: buildInsightDimensionCardTitle(dim, "lowest"),
      value: shortenLabel(minR.label, 44),
      hint: `Low: ${minR.formatted}`,
      dotClass: nextDot(),
    },
  ];

  if (rows.length > 1) {
    const gapMetricCtx: MetricFormatContext = {
      metricLabel: measure,
      chartTitle: measureCtx?.chartTitle,
      presentationKind: kind,
      roundingHint,
    };
    const spreadDisp = formatMetricSpreadGap(spread, gapMetricCtx);
    const pctSuffix =
      metricFormatUsesPercent(gapMetricCtx) || maxR.value <= 1e-9
        ? ""
        : (() => {
            const pct = (spread / maxR.value) * 100;
            if (!Number.isFinite(pct)) return "";
            const pctStr = pct >= 10 ? String(Math.round(pct)) : pct.toFixed(1);
            return ` (${pctStr}%)`;
          })();
    const gapCard: ExecutiveVizInsightCard = {
      key: "cmp-gap",
      title: buildInsightCardTitle(measure, "gap"),
      value: `${spreadDisp}${pctSuffix}`,
      hint: `${shortenLabel(maxR.label, 24)} ↔ ${shortenLabel(minR.label, 24)}`,
      dotClass: nextDot(),
    };
    if (metricFormatUsesPercent(gapMetricCtx)) {
      gapCard.ariaLabel = percentGapChipAriaLabel(measure);
    }
    out.push(gapCard);
  }

  out.push({
    key: "cmp-avg",
    title: buildInsightCardTitle(measure, "average"),
    value: formatDerivedInsightNumber(avg, roundingHint, false),
    dotClass: nextDot(),
  });

  out.push({
    key: "cmp-points",
    title:
      kind === "line" || kind === "area"
        ? buildInsightCardTitle(measure, "trend")
        : buildInsightCardTitle(measure, "points"),
    value: String(rows.length),
    dotClass: nextDot(),
  });

  if (rows.length > 1 && kind !== "line" && kind !== "area") {
    const axisCtx: ExecutiveInsightAxisContext = {
      categoryAxis: axes.categoryAxis,
      valueAxis: axes.valueAxis,
      measure: measureCtx,
      dimension: dimensionCtx,
    };
    const rankedCards = buildRankedCategoryExecutiveCards(rows, axisCtx, kind);
    if (rankedCards.length >= 2) return rankedCards;
  }

  return out;
}

type PreviewRow = {
  [key: string]: string | number | null;
};

function previewRowMatchesSearch(
  row: PreviewRow,
  cols: string[],
  qLower: string
): boolean {
  if (!qLower) return true;
  for (const c of cols) {
    if (previewCellSearchToken(row[c]).includes(qLower)) return true;
  }
  return false;
}

function dataPreviewCellMatchesQuery(
  value: string | number | null | undefined,
  qLower: string
): boolean {
  if (!qLower) return false;
  return previewCellSearchToken(value).includes(qLower);
}

/** Case-insensitive highlight of every occurrence of `query` in `text`. */
function highlightSearchInText(text: string, query: string): ReactNode {
  const q = query.trim();
  if (!q) return text;
  const lower = text.toLowerCase();
  const qi = q.toLowerCase();
  const nodes: ReactNode[] = [];
  let pos = 0;
  while (pos < text.length) {
    const found = lower.indexOf(qi, pos);
    if (found < 0) {
      nodes.push(text.slice(pos));
      break;
    }
    if (found > pos) {
      nodes.push(text.slice(pos, found));
    }
    const slice = text.slice(found, found + q.length);
    nodes.push(
      <mark
        key={`h-${found}-${slice.slice(0, 12)}`}
        className="data-preview-search-highlight rounded bg-amber-100/95 px-0.5 text-inherit ring-1 ring-amber-200/80"
      >
        {slice}
      </mark>
    );
    pos = found + q.length;
  }
  if (nodes.length === 0) return text;
  if (nodes.length === 1 && typeof nodes[0] === "string") return nodes[0];
  return <>{nodes}</>;
}

type KPIs = {
  total_rows: number;
  total_columns: number;
  total_sales: number | null;
  unique_products: number | null;
  top_product: {
    name: string;
    value: number;
  } | null;
};

type KpiCard = {
  title: string;
  value: string;
  subtitle?: string | null;
};

/** Compact numeric display for PDF page-1 executive bullets (avoids raw float dumps). */
function formatNumberForExecutiveSummary(n: number): string {
  if (!Number.isFinite(n)) return String(n);
  const abs = Math.abs(n);
  const asInt = Math.round(n);
  if (abs >= 1000 && Math.abs(n - asInt) < 1e-5) {
    return asInt.toLocaleString();
  }
  if (abs >= 1_000_000) {
    return n.toLocaleString(undefined, {
      maximumFractionDigits: 0,
      minimumFractionDigits: 0,
    });
  }
  if (abs >= 1000) {
    return n.toLocaleString(undefined, {
      maximumFractionDigits: 1,
      minimumFractionDigits: 0,
    });
  }
  if (abs >= 100) {
    return n.toLocaleString(undefined, {
      maximumFractionDigits: 1,
      minimumFractionDigits: 0,
    });
  }
  if (abs >= 10) {
    return n.toLocaleString(undefined, {
      maximumFractionDigits: 2,
      minimumFractionDigits: 0,
    });
  }
  if (abs >= 1) {
    return n.toLocaleString(undefined, {
      maximumFractionDigits: 3,
      minimumFractionDigits: 0,
    });
  }
  return n.toLocaleString(undefined, {
    maximumFractionDigits: 4,
    minimumFractionDigits: 0,
  });
}

/** Single `/ask` `analysis` payload — same metric as chart, KPI focus, and AI appendix. */
type AlignedAnalysisContext = {
  metricColumn: string | null;
  categoryColumn: string | null;
  aggregation: string | null;
  aggregationKey: string | null;
  chartType: string;
  chartTypeInternal: string;
  chartTitle: string;
  insightSummary: string;
  detectedIntent: string[];
  alignmentRepaired: boolean;
  chartPointCount: number;
  focusKpis: KpiCard[];
  chartRecommendation: ChartRecommendation | null;
  conversationFollowUp: ConversationFollowUpMeta | null;
  metricColumnDisplay: string | null;
  categoryColumnDisplay: string | null;
  secondaryGroupColumn: string | null;
  analysisValidation: InsightProvenance["analysisValidation"];
  partialVisualizationWarning: string | null;
  /** Filtered-row count for this answer (pandas cohort). */
  analysisRowCount: number;
  chartSeriesPointCount: number;
  insightConfidenceScore: number;
  insightConfidenceLevel: string;
  smallSampleCohort: boolean;
  cautiousNarrativeRequired?: boolean;
  mappingConfidenceLevel?: string | null;
  insightConfidenceRationale: string;
  insightConfidenceReasons?: string[];
  insightConfidenceBreakdown?: InsightConfidenceBreakdown | null;
  executiveLens?: string | null;
  routingPlan?: RoutingPlanPayload | null;
  routingConsistencyWarnings?: string[];
  evidenceSummaryLine: string;
  dualMetricCompare?: boolean;
  unsupportedGrowthAnalysis?: UnsupportedGrowthAnalysis | null;
  growthRequestUnsatisfied?: boolean;
  unsupportedTrendAnalysis?: UnsupportedTrendAnalysis | null;
  trendRequestUnsatisfied?: boolean;
  unsupportedDeclineAnalysis?: UnsupportedDeclineAnalysis | null;
  declineRequestUnsatisfied?: boolean;
  unsupportedMultiMetricAnalysis?: UnsupportedMultiMetricAnalysis | null;
  multiMetricRequestUnsatisfied?: boolean;
  derivedProfitMargin?: boolean;
  profitMarginUnavailable?: boolean;
  /** Phase 2 debug — parsed from `analysis.intent`; does not drive UI behavior. */
  analysisIntent?: AnalysisIntentPayload | null;
  dimensionRedirectHandled?: boolean;
  requestedDimensionMissing?: boolean;
  forecastGuardrails?: {
    canForecast?: boolean;
    outputLabel?: string;
    directionalProjectionLabel?: string | null;
    forecastConfidenceLevel?: string;
    reliabilityMessage?: string | null;
    disclaimer?: string | null;
    lacksTimeSeries?: boolean;
  } | null;
};

type InsightConfidenceBreakdownComponent = {
  score: number;
  label: string;
  reasons?: string[];
};

type InsightConfidenceBreakdown = {
  sampleSize: InsightConfidenceBreakdownComponent;
  metricMatch: InsightConfidenceBreakdownComponent;
  dimensionMatch: InsightConfidenceBreakdownComponent;
  intentMatch: InsightConfidenceBreakdownComponent;
  chartSuitability: InsightConfidenceBreakdownComponent;
  dataCompleteness: InsightConfidenceBreakdownComponent;
};

function parseInsightConfidenceBreakdown(
  raw: unknown
): InsightConfidenceBreakdown | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const keys = [
    "sampleSize",
    "metricMatch",
    "dimensionMatch",
    "intentMatch",
    "chartSuitability",
    "dataCompleteness",
  ] as const;
  const out = {} as InsightConfidenceBreakdown;
  for (const key of keys) {
    const row = o[key];
    if (!row || typeof row !== "object") return null;
    const r = row as Record<string, unknown>;
    const score = Number(r.score);
    const label = typeof r.label === "string" ? r.label.trim() : "";
    if (!label || !Number.isFinite(score)) return null;
    out[key] = {
      score: Math.min(100, Math.max(0, Math.round(score))),
      label,
      reasons: Array.isArray(r.reasons)
        ? (r.reasons as unknown[])
            .map((x) => String(x).trim())
            .filter(Boolean)
        : undefined,
    };
  }
  return out;
}

function parseForecastGuardrails(
  raw: unknown
): AlignedAnalysisContext["forecastGuardrails"] {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (!o.active) return null;
  return {
    canForecast: typeof o.canForecast === "boolean" ? o.canForecast : undefined,
    outputLabel:
      typeof o.outputLabel === "string" ? o.outputLabel.trim() : undefined,
    directionalProjectionLabel:
      typeof o.directionalProjectionLabel === "string"
        ? o.directionalProjectionLabel.trim()
        : null,
    forecastConfidenceLevel:
      typeof o.forecastConfidenceLevel === "string"
        ? o.forecastConfidenceLevel.trim()
        : undefined,
    reliabilityMessage:
      typeof o.reliabilityMessage === "string" ? o.reliabilityMessage.trim() : null,
    disclaimer:
      typeof o.disclaimer === "string" ? o.disclaimer.trim() : null,
    lacksTimeSeries: Boolean(o.lacksTimeSeries),
  };
}

function parseAlignedAnalysis(raw: unknown): AlignedAnalysisContext | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const fk = Array.isArray(o.focusKpis) ? o.focusKpis : [];
  const focusKpis: KpiCard[] = [];
  for (const row of fk) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const t = typeof r.title === "string" ? r.title.trim() : "";
    const v = typeof r.value === "string" ? r.value.trim() : String(r.value ?? "");
    if (!t || !v) continue;
    const subRaw =
      typeof r.subtitle === "string" && r.subtitle.trim()
        ? r.subtitle.trim()
        : r.subtitle === null
          ? null
          : undefined;
    focusKpis.push({
      title: sanitizeKpiLabelPhrase(t),
      value: v,
      subtitle:
        subRaw === null
          ? null
          : subRaw != null
            ? sanitizeKpiLabelPhrase(subRaw)
            : undefined,
    });
  }
  const chartPointCount = Number.isFinite(Number(o.chartPointCount))
    ? Number(o.chartPointCount)
    : 0;
  return {
    metricColumn:
      typeof o.metricColumn === "string" ? o.metricColumn.trim() || null : null,
    categoryColumn:
      typeof o.categoryColumn === "string"
        ? o.categoryColumn.trim() || null
        : null,
    aggregation:
      typeof o.aggregation === "string" ? o.aggregation.trim() || null : null,
    aggregationKey:
      typeof o.aggregationKey === "string" ? o.aggregationKey : null,
    chartType: typeof o.chartType === "string" ? o.chartType : "bar",
    chartTypeInternal:
      typeof o.chartTypeInternal === "string" ? o.chartTypeInternal : "bar",
    chartTitle: normalizeAlignedAnalysisChartTitle({
      rawTitle: typeof o.chartTitle === "string" ? o.chartTitle.trim() : "",
      chartTypeStr: typeof o.chartType === "string" ? o.chartType : "bar",
      metricColumn:
        typeof o.metricColumn === "string" ? o.metricColumn.trim() || null : null,
      metricColumnDisplay:
        typeof o.metricColumnDisplay === "string"
          ? o.metricColumnDisplay.trim() || null
          : null,
      categoryColumn:
        typeof o.categoryColumn === "string"
          ? o.categoryColumn.trim() || null
          : null,
      categoryColumnDisplay:
        typeof o.categoryColumnDisplay === "string"
          ? o.categoryColumnDisplay.trim() || null
          : null,
    }),
    insightSummary:
      typeof o.insightSummary === "string" ? o.insightSummary : "",
    detectedIntent: Array.isArray(o.detectedIntent)
      ? (o.detectedIntent as unknown[]).map((x) => String(x)).filter(Boolean)
      : [],
    alignmentRepaired: Boolean(o.alignmentRepaired),
    chartPointCount,
    focusKpis,
    chartRecommendation: parseChartRecommendation(o.chartRecommendation),
    conversationFollowUp: parseConversationFollowUp(o.conversationFollowUp),
    metricColumnDisplay:
      typeof o.metricColumnDisplay === "string"
        ? o.metricColumnDisplay.trim() || null
        : null,
    categoryColumnDisplay:
      typeof o.categoryColumnDisplay === "string"
        ? o.categoryColumnDisplay.trim() || null
        : null,
    secondaryGroupColumn:
      typeof o.secondaryGroupColumn === "string"
        ? o.secondaryGroupColumn.trim() || null
        : null,
    analysisValidation: (() => {
      const av = o.analysisValidation;
      if (!av || typeof av !== "object") return null;
      const avo = av as Record<string, unknown>;
      const chkRaw = avo.checks;
      if (!Array.isArray(chkRaw)) return null;
      const checks: { label: string; ok: boolean }[] = [];
      for (const row of chkRaw) {
        if (!row || typeof row !== "object") continue;
        const r = row as Record<string, unknown>;
        const lab =
          typeof r.label === "string" && r.label.trim() ? r.label.trim() : "";
        if (!lab) continue;
        checks.push({ label: lab, ok: Boolean(r.ok) });
      }
      const pvw = avo.partialVisualizationWarning;
      return {
        checks,
        partialVisualizationWarning:
          typeof pvw === "string" && pvw.trim()
            ? pvw.trim()
            : pvw === null
              ? null
              : null,
      };
    })(),
    partialVisualizationWarning:
      typeof o.partialVisualizationWarning === "string" &&
      o.partialVisualizationWarning.trim()
        ? o.partialVisualizationWarning.trim()
        : null,
    analysisRowCount: Number.isFinite(Number(o.analysisRowCount))
      ? Math.max(0, Number(o.analysisRowCount))
      : 0,
    chartSeriesPointCount: Number.isFinite(Number(o.chartSeriesPointCount))
      ? Math.max(0, Number(o.chartSeriesPointCount))
      : chartPointCount,
    insightConfidenceScore: Number.isFinite(Number(o.insightConfidenceScore))
      ? Math.min(100, Math.max(0, Math.round(Number(o.insightConfidenceScore))))
      : 0,
    insightConfidenceLevel:
      typeof o.insightConfidenceLevel === "string" &&
      o.insightConfidenceLevel.trim()
        ? o.insightConfidenceLevel.trim().toLowerCase()
        : "low",
    smallSampleCohort: Boolean(o.smallSampleCohort),
    cautiousNarrativeRequired: Boolean(o.cautiousNarrativeRequired),
    mappingConfidenceLevel:
      typeof o.mappingConfidenceLevel === "string" &&
      o.mappingConfidenceLevel.trim()
        ? o.mappingConfidenceLevel.trim().toLowerCase()
        : null,
    insightConfidenceRationale:
      typeof o.insightConfidenceRationale === "string"
        ? o.insightConfidenceRationale.trim()
        : "",
    insightConfidenceReasons: Array.isArray(o.insightConfidenceReasons)
      ? (o.insightConfidenceReasons as unknown[])
          .map((x) => String(x).trim())
          .filter(Boolean)
      : undefined,
    insightConfidenceBreakdown: parseInsightConfidenceBreakdown(
      o.insightConfidenceBreakdown
    ),
    executiveLens:
      typeof o.executiveLens === "string" && o.executiveLens.trim()
        ? o.executiveLens.trim().toLowerCase()
        : null,
    routingPlan: parseRoutingPlan(o.routingPlan),
    routingConsistencyWarnings: Array.isArray(o.routingConsistencyWarnings)
      ? (o.routingConsistencyWarnings as unknown[])
          .map((x) => String(x).trim())
          .filter(Boolean)
      : undefined,
    evidenceSummaryLine:
      typeof o.evidenceSummaryLine === "string"
        ? o.evidenceSummaryLine.trim()
        : "",
    dualMetricCompare: Boolean(o.dualMetricCompare),
    unsupportedGrowthAnalysis: parseUnsupportedGrowthAnalysis(
      o.unsupportedGrowthAnalysis
    ),
    growthRequestUnsatisfied: Boolean(
      o.growthRequestUnsatisfied ||
        (o.unsupportedGrowthAnalysis &&
          typeof o.unsupportedGrowthAnalysis === "object" &&
          (o.unsupportedGrowthAnalysis as Record<string, unknown>).active)
    ),
    unsupportedTrendAnalysis: parseUnsupportedTrendAnalysis(
      o.unsupportedTrendAnalysis
    ),
    trendRequestUnsatisfied: Boolean(
      o.trendRequestUnsatisfied ||
        (o.unsupportedTrendAnalysis &&
          typeof o.unsupportedTrendAnalysis === "object" &&
          (o.unsupportedTrendAnalysis as Record<string, unknown>).active)
    ),
    unsupportedDeclineAnalysis: parseUnsupportedDeclineAnalysis(
      o.unsupportedDeclineAnalysis
    ),
    declineRequestUnsatisfied: Boolean(
      o.declineRequestUnsatisfied ||
        (o.unsupportedDeclineAnalysis &&
          typeof o.unsupportedDeclineAnalysis === "object" &&
          (o.unsupportedDeclineAnalysis as Record<string, unknown>).active)
    ),
    unsupportedMultiMetricAnalysis: parseUnsupportedMultiMetricAnalysis(
      o.unsupportedMultiMetricAnalysis
    ),
    multiMetricRequestUnsatisfied: Boolean(
      o.multiMetricRequestUnsatisfied ||
        (o.unsupportedMultiMetricAnalysis &&
          typeof o.unsupportedMultiMetricAnalysis === "object" &&
          (o.unsupportedMultiMetricAnalysis as Record<string, unknown>).active)
    ),
    derivedProfitMargin: Boolean(o.derivedProfitMargin),
    profitMarginUnavailable: Boolean(o.profitMarginUnavailable),
    analysisIntent: parseAnalysisIntent(o.intent),
    dimensionRedirectHandled: Boolean(o.dimensionRedirectHandled),
    requestedDimensionMissing: Boolean(o.requestedDimensionMissing),
    forecastGuardrails: parseForecastGuardrails(o.forecastGuardrails),
  };
}

type AutoDashboardMiniChart = {
  title: string;
  chartType: string;
  labels: string[];
  values: number[];
  interaction?: VizInteractionPayload;
};

type AutoDashboardPayload = {
  kind: string;
  type_label: string;
  cards: KpiCard[];
  charts: AutoDashboardMiniChart[];
};

function parseAutoDashboardMiniCharts(raw: unknown): AutoDashboardMiniChart[] {
  if (!Array.isArray(raw)) return [];
  const out: AutoDashboardMiniChart[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    const title =
      typeof o.title === "string" && o.title.trim() ? o.title.trim() : "";
    const chartType =
      typeof o.chartType === "string" && o.chartType.trim()
        ? o.chartType.trim()
        : "bar";
    const labelsRaw = Array.isArray(o.labels) ? o.labels : [];
    const valsRaw = Array.isArray(o.values) ? o.values : [];
    const pairs: { name: string; value: number }[] = [];
    const n = Math.min(labelsRaw.length, valsRaw.length);
    for (let i = 0; i < n; i++) {
      const name = String(labelsRaw[i] ?? "");
      const vx = valsRaw[i];
      const num = typeof vx === "number" ? vx : Number(vx);
      if (!Number.isFinite(num)) continue;
      pairs.push({ name: name || "—", value: num });
    }
    if (!title || pairs.length === 0) continue;
    out.push({
      title,
      chartType,
      labels: pairs.map((p) => p.name),
      values: pairs.map((p) => p.value),
      interaction: parseChartInteraction(o.interaction),
    });
  }
  return out.slice(0, 6);
}

function parseAutoDashboardPayload(raw: unknown): AutoDashboardPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const fk = Array.isArray(o.cards) ? o.cards : [];
  const cards: KpiCard[] = [];
  for (const row of fk) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const t = typeof r.title === "string" ? r.title.trim() : "";
    const v = typeof r.value === "string" ? r.value.trim() : String(r.value ?? "");
    if (!t || !v) continue;
    cards.push({
      title: sanitizeKpiLabelPhrase(t),
      value: v,
      subtitle:
        typeof r.subtitle === "string" && r.subtitle.trim()
          ? r.subtitle.trim()
          : r.subtitle === null
            ? null
            : undefined,
    });
  }
  const chartsRaw = o.charts;
  const chartsParsed = parseAutoDashboardMiniCharts(
    Array.isArray(chartsRaw) ? chartsRaw : []
  );

  return {
    kind: typeof o.kind === "string" ? o.kind : "",
    type_label:
      typeof o.type_label === "string" && o.type_label.trim()
        ? o.type_label.trim()
        : "Dashboard",
    cards: cards.slice(0, 5),
    charts: chartsParsed,
  };
}

type OverviewMiniInsightChip = {
  key: "top" | "lowest" | "gap";
  text: string;
  title?: string;
};

/** Structured insight pills for overview mini charts (avoids merged single-line text). */
function formatOverviewMiniInsightChips(
  rows: ChartRow[],
  opts?: { chartTitle?: string; presentationKind?: ChartKind }
): OverviewMiniInsightChip[] {
  if (rows.length < 2) return [];
  let hi = rows[0];
  let lo = rows[0];
  for (const r of rows) {
    if (!Number.isFinite(r.value)) continue;
    if (r.value > hi.value) hi = r;
    if (r.value < lo.value) lo = r;
  }
  if (String(hi.name) === String(lo.name)) return [];
  const metricCtx: MetricFormatContext = {
    metricLabel: opts?.chartTitle,
    chartTitle: opts?.chartTitle,
    presentationKind: opts?.presentationKind,
  };
  const hiDisp = formatExecutiveMetricValue(hi, metricCtx);
  const loDisp = formatExecutiveMetricValue(lo, metricCtx);
  const gap =
    typeof hi.value === "number" && typeof lo.value === "number"
      ? hi.value - lo.value
      : NaN;
  const gapDisp = Number.isFinite(gap)
    ? formatMetricSpreadGap(gap, {
        metricLabel: opts?.chartTitle,
        chartTitle: opts?.chartTitle,
        presentationKind: opts?.presentationKind,
      })
    : "—";
  const gapChip: OverviewMiniInsightChip = {
    key: "gap",
    text: `Gap: ${gapDisp}`,
  };
  if (metricFormatUsesPercent(metricCtx)) {
    gapChip.title = percentGapChipAriaLabel(opts?.chartTitle);
  }
  return [
    { key: "top", text: `Top: ${String(hi.name)} (${hiDisp})` },
    { key: "lowest", text: `Lowest: ${String(lo.name)} (${loDisp})` },
    gapChip,
  ];
}

function truncateOverviewPhrase(s: string, maxLen: number): string {
  const t = s.replace(/\s+/g, " ").trim();
  if (!t) return "";
  return t.length > maxLen ? `${t.slice(0, maxLen - 1)}…` : t;
}

function splitChartTitleMetricAndBreakdown(title: string): {
  metric: string;
  breakdown: string | null;
} {
  const t = title.replace(/\s+/g, " ").trim();
  if (!t) return { metric: "this measure", breakdown: null };
  const m = t.match(/^(.+?)\s+by\s+(.+)$/i);
  if (m) {
    return {
      metric: m[1].trim() || "this measure",
      breakdown: m[2].trim() || null,
    };
  }
  return { metric: t, breakdown: null };
}

function autoDashboardChartPairs(chart: AutoDashboardMiniChart): {
  name: string;
  value: number;
}[] {
  const n = Math.min(chart.labels.length, chart.values.length);
  const pairs: { name: string; value: number }[] = [];
  for (let i = 0; i < n; i++) {
    const v = chart.values[i];
    if (!Number.isFinite(v)) continue;
    const name = String(chart.labels[i] ?? "").trim() || "—";
    pairs.push({ name, value: v });
  }
  return pairs;
}

function isLikelyTrendAutoChart(chart: AutoDashboardMiniChart): boolean {
  const ct = (chart.chartType || "").toLowerCase();
  if (ct === "line" || ct === "area") return true;
  return /\b(trend|over time|time series|weekly|daily|monthly|quarter)\b/i.test(
    chart.title
  );
}

function meanFinite(nums: number[]): number | null {
  const xs = nums.filter((n) => Number.isFinite(n));
  if (!xs.length) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function readProfileDescribeStat(
  col: string,
  stat: string,
  profile: DatasetProfile | null
): number | null {
  if (!profile?.summary_stats || typeof profile.summary_stats !== "object")
    return null;
  const block = (profile.summary_stats as Record<string, unknown>)[stat];
  if (!block || typeof block !== "object") return null;
  const v = (block as Record<string, unknown>)[col];
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function columnProfileMissingPercent(
  col: string,
  profile: DatasetProfile | null,
  totalRows: number
): number | null {
  if (!profile?.null_counts || totalRows <= 0) return null;
  const nc = profile.null_counts[col];
  if (typeof nc !== "number" || !Number.isFinite(nc)) return null;
  return (nc / totalRows) * 100;
}

function formatColumnProfileNumber(n: number): string {
  const abs = Math.abs(n);
  if (!Number.isFinite(n)) return "—";
  if (abs >= 1e12 || (abs > 0 && abs < 1e-6)) return n.toExponential(2);
  if (abs >= 1000) {
    return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }
  if (abs >= 10) {
    return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }
  if (abs >= 1) {
    return n.toLocaleString(undefined, { maximumFractionDigits: 3 });
  }
  return n.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

function _buildNumericDistributionBlurb(
  col: string,
  profile: DatasetProfile | null
): string {
  const q1 = readProfileDescribeStat(col, "25%", profile);
  const q3 = readProfileDescribeStat(col, "75%", profile);
  const mean = readProfileDescribeStat(col, "mean", profile);
  const med = readProfileDescribeStat(col, "50%", profile);
  const parts: string[] = [];
  if (q1 != null && q3 != null && q3 >= q1) {
    parts.push(
      `Most values sit between ${formatColumnProfileNumber(q1)} and ${formatColumnProfileNumber(q3)}.`
    );
  }
  if (mean != null && med != null) {
    const denom = Math.abs(med) + 1e-9;
    const skew = Math.abs(mean - med) / denom;
    if (skew > 0.12) {
      if (mean > med) {
        parts.push("A few higher entries lift the average above the middle.");
      } else {
        parts.push("A few lower entries pull the average under the middle.");
      }
    } else {
      parts.push("Average and middle line up closely.");
    }
  }
  return parts.join(" ").trim() || "Spread looks steady for this column.";
}

function computeOverviewAiSummaryBullets(args: {
  rows: number;
  columns: string[];
  autoDashboard: AutoDashboardPayload | null;
  profile: DatasetProfile | null;
  primaryMetricColumn: string | null;
  groupingColumn: string | null;
  dateColumn: string | null;
}): string[] {
  const {
    rows,
    columns,
    autoDashboard,
    profile,
    primaryMetricColumn,
    groupingColumn,
    dateColumn,
  } = args;

  const candidates: string[] = [];
  const seen = new Set<string>();

  const pushUnique = (raw: string) => {
    const s = raw.replace(/\s+/g, " ").trim();
    if (!s) return;
    const key = s.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push(s);
  };

  const charts = autoDashboard?.charts ?? [];
  const cards = autoDashboard?.cards ?? [];

  let trendBulletsAdded = 0;
  let barBulletsAdded = 0;

  for (const chart of charts) {
    if (isLikelyTrendAutoChart(chart)) {
      if (trendBulletsAdded >= 1) {
        continue;
      }
      const vals = chart.values.filter((x) => Number.isFinite(x));
      if (vals.length >= 4) {
        const mid = Math.floor(vals.length / 2);
        const early = meanFinite(vals.slice(0, mid));
        const late = meanFinite(vals.slice(mid));
        if (early != null && late != null && early !== 0) {
          const rel = (late - early) / (Math.abs(early) + 1e-9);
          const titleHint = truncateOverviewPhrase(
            getCanonicalChartTitle({
              rawTitle: chart.title,
              chartType: chart.chartType,
              labels: chart.labels,
              values: chart.values,
            }),
            42
          );
          if (Math.abs(rel) < 0.04) {
            pushUnique(
              `The time-based view "${titleHint}" is fairly level across the window shown.`
            );
          } else if (rel < 0) {
            pushUnique(
              `Recent buckets in "${titleHint}" run lower than earlier ones on average.`
            );
          } else {
            pushUnique(
              `Recent buckets in "${titleHint}" run higher than earlier ones on average.`
            );
          }
          trendBulletsAdded += 1;
        }
      }
      continue;
    }

    if (barBulletsAdded >= 2) {
      continue;
    }

    const pairs = autoDashboardChartPairs(chart);
    if (pairs.length >= 2) {
      let hi = pairs[0];
      let lo = pairs[0];
      for (const p of pairs) {
        if (p.value > hi.value) hi = p;
        if (p.value < lo.value) lo = p;
      }
      if (hi.name !== lo.name) {
        const { metric, breakdown } = splitChartTitleMetricAndBreakdown(chart.title);
        const mShort = truncateOverviewPhrase(metric, 36);
        const hiName = truncateOverviewPhrase(hi.name, 32);
        if (breakdown) {
          const br = truncateOverviewPhrase(breakdown, 28);
          pushUnique(
            `${hiName} leads on ${mShort.toLowerCase()} when split by ${br.toLowerCase()}.`
          );
        } else {
          pushUnique(`${hiName} is the high point on ${mShort}.`);
        }
        barBulletsAdded += 1;
      }
    }
  }

  for (const card of cards.slice(0, 3)) {
    const t = truncateOverviewPhrase(card.title, 40);
    const v = truncateOverviewPhrase(String(card.value ?? ""), 36);
    if (!t || !v) continue;
    if (card.subtitle?.trim()) {
      const st = truncateOverviewPhrase(card.subtitle, 44);
      pushUnique(`${t}: ${v} (${st}).`);
    } else {
      pushUnique(`${t} is ${v}.`);
    }
  }

  if (primaryMetricColumn) {
    const mean = readProfileDescribeStat(primaryMetricColumn, "mean", profile);
    const std = readProfileDescribeStat(primaryMetricColumn, "std", profile);
    const max = readProfileDescribeStat(primaryMetricColumn, "max", profile);
    const min = readProfileDescribeStat(primaryMetricColumn, "min", profile);
    if (
      mean != null &&
      std != null &&
      max != null &&
      min != null &&
      std > 1e-12
    ) {
      const zHi = (max - mean) / std;
      const zLo = (mean - min) / std;
      if (zHi > 2.75 || zLo > 2.75) {
        pushUnique(
          `The main numeric measure shows long tails—spot-check extremes before trusting aggregates.`
        );
      } else if (max != null && min != null && mean != null) {
        const span = Math.abs(max - min);
        const noise = std * 4;
        if (Number.isFinite(span) && Number.isFinite(noise) && span > noise * 2.5) {
          pushUnique(
            `Values on the primary measure spread widely; use filters to focus on a cohort.`
          );
        }
      }
    }
  }

  const numericCols = columns.filter(
    (c) => profile?.column_types?.[c] === "number"
  );
  for (const c of numericCols) {
    if (!c || c === primaryMetricColumn) continue;
    const mean = readProfileDescribeStat(c, "mean", profile);
    const std = readProfileDescribeStat(c, "std", profile);
    if (mean == null || std == null || Math.abs(mean) < 1e-9) continue;
    const cv = std / Math.abs(mean);
    if (cv < 0.12) {
      const label = humanizeColumnName(c);
      pushUnique(`${label} stays relatively steady across rows.`);
      break;
    }
  }

  if (dateColumn) {
    pushUnique(
      `Time trends use ${humanizeColumnName(dateColumn)} when a calendar view applies.`
    );
  } else if (charts.some((c) => isLikelyTrendAutoChart(c))) {
    pushUnique(`A time-based chart is available—pair it with a date column for richer answers.`);
  }

  if (groupingColumn) {
    pushUnique(
      `Default groupings lean on ${humanizeColumnName(groupingColumn)} for comparisons.`
    );
  }

  pushUnique(
    `This dataset has ${rows.toLocaleString()} rows across ${columns.length} columns.`
  );

  if (columns.length > 0 && !primaryMetricColumn) {
    pushUnique(
      `Pick a primary numeric column in mapping so KPIs and summaries stay grounded.`
    );
  }

  const out = candidates.slice(0, 5);
  const minBullets = 3;
  const neutralFill = [
    `Ask a focused question in AI Insights to go deeper on any chart signal.`,
    `Use the chart footers on this tab to open the same view in the Charts workspace.`,
    `Column mapping drives how these bullets and KPIs are inferred—adjust if something looks off.`,
    `Working with ${columns.length} field${
      columns.length === 1 ? "" : "s"
    }—narrow with filters or questions as needed.`,
    `KPI cards reflect your current sheet and mapping settings.`,
  ];
  let i = 0;
  while (out.length < minBullets && i < neutralFill.length) {
    const s = neutralFill[i++];
    if (!seen.has(s.toLowerCase())) {
      seen.add(s.toLowerCase());
      out.push(s);
    }
  }
  return out.slice(0, 5);
}

/** Optional footnote for Auto Dashboard KPI tiles — uses charts + profile, no domain-specific copy. */
function buildAutoDashboardKpiContextLine(args: {
  card: KpiCard;
  cardIndex: number;
  totalCards: number;
  charts: AutoDashboardMiniChart[];
  profile: DatasetProfile | null;
  primaryMetricColumn: string | null;
  rows: number;
  columns: string[];
  datasetKind: string;
}): string | null {
  const {
    card,
    cardIndex,
    totalCards,
    charts,
    profile,
    primaryMetricColumn,
    rows,
    columns,
    datasetKind,
  } = args;
  const sub = card.subtitle?.trim() ?? "";

  const redundantWithSubtitle = (line: string) => {
    if (!sub || !line) return false;
    if (line.includes(sub)) return true;
    const digits = sub.replace(/[^\d]/g, "");
    if (digits.length >= 4 && line.replace(/[^\d]/g, "").includes(digits)) return true;
    return false;
  };

  const chartAt = charts[cardIndex];
  if (chartAt) {
    const semCtx = fromAutoDashboardChart(
      {
        title: chartAt.title,
        chartType: chartAt.chartType,
        metricColumn: primaryMetricColumn,
      },
      datasetKind
    );
    if (semCtx) {
      const pairsEarly = autoDashboardChartPairs(chartAt);
      let topName: string | undefined;
      let topValDisp: string | undefined;
      if (pairsEarly.length >= 1) {
        const hi = pairsEarly.reduce((a, b) => (b.value > a.value ? b : a));
        topName = hi.name;
        topValDisp = fallbackChartNumericDisplay("bar", hi.value);
      }
      const valsEarly = chartAt.values.filter((x) => Number.isFinite(x));
      let trendRel: number | undefined;
      let trendFirst: string | undefined;
      let trendLast: string | undefined;
      if (isLikelyTrendAutoChart(chartAt) && valsEarly.length >= 2) {
        const first = valsEarly[0]!;
        const last = valsEarly[valsEarly.length - 1]!;
        trendRel = (last - first) / (Math.abs(first) + 1e-9);
        trendFirst = String(chartAt.labels[0] ?? "").trim() || undefined;
        trendLast =
          String(chartAt.labels[chartAt.labels.length - 1] ?? "").trim() ||
          undefined;
      }
      const semanticLine = buildKpiContextLine(datasetKind, semCtx, {
        cardTitle: card.title,
        cardIndex,
        totalCards,
        isTrendChart: isLikelyTrendAutoChart(chartAt),
        trendFirstLabel: trendFirst,
        trendLastLabel: trendLast,
        trendRelChange: trendRel,
        topCategoryName: topName,
        topCategoryValueDisplay: topValDisp,
        primaryMetricColumn,
        rows,
        nullCountOnPrimary:
          cardIndex === 0 && primaryMetricColumn && profile?.null_counts
            ? profile.null_counts[primaryMetricColumn]
            : undefined,
        profileMeanOnPrimary:
          cardIndex === totalCards - 1 && primaryMetricColumn && profile
            ? readProfileDescribeStat(primaryMetricColumn, "mean", profile)
            : null,
      });
      if (semanticLine && !redundantWithSubtitle(semanticLine)) {
        return semanticLine;
      }
    }

    if (isLikelyTrendAutoChart(chartAt)) {
      const vals = chartAt.values.filter((x) => Number.isFinite(x));
      if (vals.length >= 2) {
        const first = vals[0];
        const last = vals[vals.length - 1];
        const rel = (last - first) / (Math.abs(first) + 1e-9);
        const lab0 = String(chartAt.labels[0] ?? "").trim();
        const lab1 = String(chartAt.labels[chartAt.labels.length - 1] ?? "").trim();
        const span =
          lab0 && lab1 && lab0 !== lab1
            ? ` (${truncateOverviewPhrase(lab0, 20)} → ${truncateOverviewPhrase(lab1, 20)})`
            : "";
        let line: string;
        if (Math.abs(rel) < 0.03) {
          line = `This metric tracks steady across the window${span}.`;
        } else if (rel < 0) {
          line = `Latest period finishes below where this series began${span}.`;
        } else {
          line = `Latest period finishes above where this series began${span}.`;
        }
        if (!redundantWithSubtitle(line)) return line;
      }
    } else {
      const pairs = autoDashboardChartPairs(chartAt);
      if (pairs.length >= 2) {
        let hi = pairs[0];
        for (const p of pairs) {
          if (p.value > hi.value) hi = p;
        }
        const disp = fallbackChartNumericDisplay("bar", hi.value);
        const dimLb =
          inferBreakdownLabelFromChartTitle(chartAt.title) ?? "Category";
        const metPhr = inferAutoDashboardMetricFromTitle(chartAt.title);
        const line = semanticTopBucketCaption(
          humanizeColumnName(dimLb),
          metPhr,
          truncateOverviewPhrase(hi.name, 30),
          disp
        );
        if (!redundantWithSubtitle(line)) return line;
      }
    }
  }

  if (cardIndex === 0 && primaryMetricColumn && profile?.null_counts && rows > 0) {
    const n = profile.null_counts[primaryMetricColumn];
    if (typeof n === "number" && n > 0) {
      const line = `${n.toLocaleString()} row${n === 1 ? "" : "s"} have missing values for ${humanizeColumnName(primaryMetricColumn)} — totals may skew until cleaned.`;
      if (!redundantWithSubtitle(line)) return line;
    }
  }

  if (cardIndex === 1 && profile?.null_counts && profile.column_types && rows > 0) {
    let worst = 0;
    let worstCol = "";
    for (const c of columns) {
      if (profile.column_types[c] !== "number") continue;
      const n = profile.null_counts[c];
      if (typeof n === "number" && n > worst) {
        worst = n;
        worstCol = c;
      }
    }
    if (worstCol && worst / rows >= 0.03) {
      const pct = Math.round((worst / rows) * 100);
      const line = `Blanks on ${humanizeColumnName(worstCol)} affect about ${pct}% of rows (${worst.toLocaleString()}).`;
      if (!redundantWithSubtitle(line)) return line;
    }
  }

  if (
    cardIndex === totalCards - 1 &&
    primaryMetricColumn &&
    profile
  ) {
    const mean = readProfileDescribeStat(primaryMetricColumn, "mean", profile);
    if (mean != null && Number.isFinite(mean)) {
      const metricPhrase = humanizeColumnName(primaryMetricColumn);
      const line = `Average ${metricPhrase.toLowerCase()} per time bucket is approximately ${formatNumberForExecutiveSummary(mean)} in this extract.`;
      if (!redundantWithSubtitle(line)) return line;
    }
  }

  return null;
}

function sanitizeChartExportFilename(title: string): string {
  const t = title.replace(/\s+/g, " ").trim().slice(0, 72);
  const slug = t
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
  return slug || "auto_dashboard_chart";
}

/** Plot band heights — keep in sync with `--overview-chart-plot-min-h` in globals.css */
const OVERVIEW_DASH_PLOT_HEIGHT_MOBILE = 300;
const OVERVIEW_DASH_PLOT_HEIGHT_DESKTOP = 340;
const OVERVIEW_DASH_PLOT_BREAKPOINT_PX = 768;

function useOverviewDashPlotHeight(): number {
  const [height, setHeight] = useState(OVERVIEW_DASH_PLOT_HEIGHT_MOBILE);
  useEffect(() => {
    const mq = window.matchMedia(
      `(min-width: ${OVERVIEW_DASH_PLOT_BREAKPOINT_PX}px)`
    );
    const apply = () => {
      setHeight(
        mq.matches
          ? OVERVIEW_DASH_PLOT_HEIGHT_DESKTOP
          : OVERVIEW_DASH_PLOT_HEIGHT_MOBILE
      );
    };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
  return height;
}

/** Overview mini-chart grid only — reads theme tokens from globals.css. */
function useOverviewDashGridStyle(
  enabled = true
): { stroke: string; opacity: number } {
  const read = (): { stroke: string; opacity: number } => {
    if (typeof document === "undefined") {
      return { stroke: "#e2e8f0", opacity: 0.28 };
    }
    const cs = getComputedStyle(document.documentElement);
    const stroke =
      cs.getPropertyValue("--overview-dash-grid-stroke").trim() || "#e2e8f0";
    const opacityRaw = cs
      .getPropertyValue("--overview-dash-grid-opacity")
      .trim();
    const opacity = opacityRaw ? parseFloat(opacityRaw) : 0.28;
    return {
      stroke,
      opacity: Number.isFinite(opacity) ? opacity : 0.28,
    };
  };
  const [grid, setGrid] = useState(() => read());
  useEffect(() => {
    if (!enabled) return;
    const sync = () => setGrid(read());
    sync();
    const obs = new MutationObserver(sync);
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => obs.disconnect();
  }, [enabled]);
  return grid;
}

async function waitForHiddenChartCapture(
  getEl: () => HTMLDivElement | null,
  maxMs = 3200
): Promise<HTMLDivElement | null> {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    const el = getEl();
    if (el?.querySelector("svg")) return el;
    await new Promise<void>((resolve) => {
      window.requestAnimationFrame(() => resolve());
    });
  }
  return getEl();
}

const OV_DASH_CHART_MARGIN = {
  top: 16,
  right: 24,
  bottom: 36,
  left: 24,
} as const;

const OV_DASH_GRID_DASHARRAY = "3 10";

const OV_AXIS_TICK = "var(--chart-axis-tick)";
const OV_AXIS_LINE = "var(--chart-axis-line)";
const OV_DASH_AXIS_LABEL_STYLE = {
  fill: "var(--chart-axis-label)",
  fontSize: 9,
  fontWeight: 600,
} as const;

function overviewDashLabelLooksTemporal(name: string): boolean {
  const s = String(name ?? "").trim();
  if (!s) return false;
  if (/^(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/i.test(s))
    return true;
  if (/\bq[1-4]\b(?:\s*[''\u2019]?|\/|\s|,)\s*\d{2,4}$/i.test(s)) return true;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return true;
  return !Number.isNaN(Date.parse(s));
}

function overviewRowsLookReadableTimeSeries(rows: ChartRow[]): boolean {
  if (rows.length < 2 || rows.length > 28) return false;
  const hits = rows.filter((r) =>
    overviewDashLabelLooksTemporal(String(r.name ?? ""))
  ).length;
  return hits >= Math.max(2, Math.ceil(rows.length * 0.75));
}

/**
 * Overview-only chart kind: stricter bar orientation and readable line trends.
 * Does not alter Charts tab / AI / PDF presentation (`computeFinalChartPresentation`).
 */
function computeOverviewDashboardChartPresentation(args: {
  apiChartType: string;
  title: string;
  rows: ChartRow[];
}): ChartKind {
  const api = apiChartStringToKind(args.apiChartType);
  const { rows } = args;

  if (
    api === "pie" ||
    api === "donut" ||
    api === "histogram" ||
    api === "scatter"
  ) {
    return computeFinalChartPresentation(args);
  }

  if (api === "line" || api === "area") {
    return overviewRowsLookReadableTimeSeries(rows) ? api : "bar_horizontal";
  }

  if (api === "bar_horizontal") return "bar_horizontal";

  const fromRows = computeFinalChartPresentation(args);
  if (fromRows === "line" || fromRows === "area") {
    return overviewRowsLookReadableTimeSeries(rows)
      ? fromRows
      : "bar_horizontal";
  }
  if (fromRows !== "bar" && fromRows !== "bar_horizontal") return fromRows;

  const labels = rows.map((r) => String(r.name ?? ""));
  const n = labels.length;
  const maxLen = Math.max(0, ...labels.map((s) => s.length));
  const shortLabels = maxLen <= 14;

  if (n <= 4 && shortLabels) return "bar";
  return "bar_horizontal";
}

function overviewDashShortValueAxisLabel(title: string): string {
  const stripped = title
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .replace(
      /\b(trend|over time|time series|weekly|daily|monthly|quarterly)\b/gi,
      " "
    )
    .replace(/\s+/g, " ")
    .trim();
  const compact = compactAxisLabelFromFullPhrase(stripped || title);
  return truncateOverviewPhrase(compact, 32);
}

function overviewDashTrendCategoryLabel(
  title: string,
  drillLabel?: string | null
): string {
  const fromDrill = drillLabel?.trim();
  if (fromDrill) return shortenLabel(fromDrill, 16);
  const blob = title.toLowerCase();
  if (/\bweekly\b|\bweek\b/.test(blob)) return "Week";
  if (/\bdaily\b|\bday\b/.test(blob)) return "Day";
  if (/\bmonthly\b|\bmonth\b/.test(blob)) return "Month";
  if (/\bquarter/.test(blob)) return "Quarter";
  return "Period";
}

function overviewDashCategoryAxisLabel(
  displayKind: string,
  drillLabel?: string | null,
  chartTitle?: string
): string {
  const fromDrill = drillLabel?.trim();
  if (fromDrill) return shortenLabel(fromDrill, 18);
  if (displayKind === "line" || displayKind === "area") {
    return overviewDashTrendCategoryLabel(chartTitle ?? "", drillLabel);
  }
  if (displayKind === "histogram") return "Value range";
  return "Category";
}

function formatOverviewTrendTickLabel(raw: string): string {
  const base = formatTrendXAxisTickLabel(String(raw ?? ""));
  const m = /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2})$/i.exec(
    base.trim()
  );
  if (m) {
    const mon =
      m[1]!.charAt(0).toUpperCase() + m[1]!.slice(1, 3).toLowerCase();
    return `${mon} ${m[2]!.padStart(2, "0")}`;
  }
  return base.length > 14 ? `${base.slice(0, 13)}…` : base;
}

function overviewDashPlotMarginLeft(yAxisWidth: number): number {
  return Math.max(OV_DASH_CHART_MARGIN.left, Math.ceil(yAxisWidth) + 10);
}

const OverviewAutoDashboardChartCard = memo(function OverviewAutoDashboardChartCard({
  chart,
  canonicalTitle,
  snapshotId,
  viewportWidthPx,
  plotHeightPx,
  dashGridStyle,
  loadingPulse,
  onDashboardDrill,
  onViewInChartsTab,
  onAskAiAboutChart,
  onChartExportError,
  exportFooterHint,
}: {
  chart: AutoDashboardMiniChart;
  canonicalTitle: string;
  snapshotId: string | null;
  /** Optional dataset label for PNG export footer only. */
  exportFooterHint?: string | null;
  /** Used to estimate category tick overlap for vertical bars / lines. */
  viewportWidthPx: number;
  /** Matches CSS `--overview-chart-plot-min-h` for Recharts explicit height. */
  plotHeightPx: number;
  dashGridStyle: { stroke: string; opacity: number };
  /** Subtle busy state when dataset refresh is in flight. */
  loadingPulse?: boolean;
  /** Click a chart category (or slice) to tighten global dashboard filters. */
  onDashboardDrill?: (ev: {
    column: string;
    label: string;
    value: string;
  }) => void;
  /** Opens the same chart in the Charts tab (session store). */
  onViewInChartsTab?: (snapshotId: string) => void;
  /** Prefills AI Insights and switches tab (pinned snapshot id). */
  onAskAiAboutChart?: (snapshotId: string) => void;
  /** Surface export failures (e.g. missing SVG). */
  onChartExportError?: (message: string) => void;
}) {
  const offscreenExportRef = useRef<HTMLDivElement | null>(null);
  const [exportingPng, setExportingPng] = useState(false);
  const [offscreenExportLayout, setOffscreenExportLayout] = useState<ReturnType<
    typeof buildPresentationExportSpec
  > | null>(null);
  const dashGrid = dashGridStyle;
  const drillPrimary = chart.interaction?.drillDimensions.find(
    (d) => d.role === "primary"
  )
    ?? chart.interaction?.drillDimensions?.[0];
  const drillable = Boolean(drillPrimary && onDashboardDrill);

  const baseChartRows = useMemo((): ChartRow[] => {
    const cap = Math.min(chart.labels.length, chart.values.length);
    const rows: ChartRow[] = [];
    for (let i = 0; i < cap; i++) {
      const v = chart.values[i];
      if (!Number.isFinite(v)) continue;
      rows.push({
        name: chart.labels[i] || "—",
        value: v,
        displayValue: fallbackChartNumericDisplay("bar", v),
      });
    }
    return rows;
  }, [chart.labels, chart.values]);

  const displayKind = useMemo(
    () =>
      computeOverviewDashboardChartPresentation({
        apiChartType: chart.chartType,
        title: chart.title,
        rows: baseChartRows,
      }),
    [chart.chartType, chart.title, baseChartRows]
  );

  const exportPlotWidth = offscreenExportLayout?.width ?? viewportWidthPx;
  const exportPlotHeight = offscreenExportLayout?.height ?? plotHeightPx;

  const overviewMetricCtx = useMemo(
    (): MetricFormatContext => ({
      metricLabel: chart.title,
      chartTitle: chart.title,
      presentationKind: displayKind,
    }),
    [chart.title, displayKind]
  );

  const chartRows = useMemo((): ChartRow[] => {
    const mapped = baseChartRows.map((r) => ({
      ...r,
      displayValue: formatExecutiveMetricValue(r, overviewMetricCtx),
    }));
    if (displayKind === "line" || displayKind === "area") {
      return sortChartRowsChronologically(mapped);
    }
    return mapped;
  }, [baseChartRows, displayKind, overviewMetricCtx]);

  const valueAxisTitle = useMemo(
    () => overviewDashShortValueAxisLabel((chart.title || "Value").trim() || "Value"),
    [chart.title]
  );

  const categoryAxisLabel = useMemo(
    () =>
      overviewDashCategoryAxisLabel(
        displayKind,
        drillPrimary?.label,
        chart.title
      ),
    [displayKind, drillPrimary?.label, chart.title]
  );

  const dashTickSamples = useMemo(
    () => collectSampleTickStrings(chartRows),
    [chartRows]
  );

  const miniAxes = useMemo(
    (): ChartAxes => ({
      categoryAxis: categoryAxisLabel,
      valueAxis: valueAxisTitle,
      valueAxisCompact: compactAxisLabelFromFullPhrase(valueAxisTitle),
    }),
    [categoryAxisLabel, valueAxisTitle]
  );

  const miniCategoryPlan = useMemo(() => {
    if (displayKind === "pie" || displayKind === "donut") return null;
    if (displayKind === "bar_horizontal") return null;
    const rowKind: ChartKind =
      displayKind === "line" || displayKind === "area"
        ? displayKind
        : displayKind === "histogram"
          ? "histogram"
          : "bar";
    if (rowKind !== "bar" && rowKind !== "line" && rowKind !== "area")
      return null;
    return computeCartesianCategoryPlanForRender({
      rows: chartRows,
      kind: rowKind,
      stackedBar: false,
      chartHeight: plotHeightPx,
      compact: true,
      insightMode: false,
      viewportWidthPx: Math.max(viewportWidthPx, 200),
      axes: miniAxes,
      layoutVariant: "overview_half",
      allowHorizontalBarFallback: rowKind === "bar",
    });
  }, [displayKind, chartRows, miniAxes, viewportWidthPx, plotHeightPx]);

  const renderBarAsHorizontal =
    displayKind === "bar_horizontal" ||
    (displayKind === "bar" && Boolean(miniCategoryPlan?.renderAsHorizontalBar));

  const verticalDashLayout = useMemo(() => {
    if (
      displayKind === "pie" ||
      displayKind === "donut" ||
      displayKind === "bar_horizontal"
    )
      return null;
    return computeVerticalValueAxisLayout({
      valueAxisLabel: valueAxisTitle,
      valueAxisMeasureLabel: valueAxisTitle,
      tickSampleStrings: dashTickSamples,
      chartLayoutMode: "compact",
      tickFontSizePx: OV_DASH_AXIS_LABEL_STYLE.fontSize,
      titleFontSizePx: OV_DASH_AXIS_LABEL_STYLE.fontSize,
      plotInnerHeightPx: Math.max(180, Math.floor(plotHeightPx * 0.72)),
    });
  }, [displayKind, valueAxisTitle, dashTickSamples, plotHeightPx]);

  const horizontalDashLayout = useMemo(() => {
    if (!renderBarAsHorizontal) return null;
    const base = computeHorizontalBarAxisLayout({
      categoryTickStrings: chartRows.map((r) => String(r.name ?? "")),
      valueAxisLabel: valueAxisTitle,
      valueAxisFull: valueAxisTitle,
      categoryAxisLabel,
      chartLayoutMode: "full",
      tickFontSizePx: 9,
      titleFontSizePx: 10,
      maxValueAxisTitleWidthPx: Math.max(120, viewportWidthPx - 72),
    });
    const catCap = Math.max(72, Math.floor(viewportWidthPx * 0.38));
    const catW = Math.min(catCap, Math.max(base.categoryAxisWidth, 72));
    return {
      ...base,
      categoryAxisWidth: catW,
    };
  }, [renderBarAsHorizontal, chartRows, valueAxisTitle, categoryAxisLabel, viewportWidthPx]);

  const exportMiniCategoryPlan = useMemo(() => {
    if (!offscreenExportLayout) return null;
    if (displayKind === "pie" || displayKind === "donut") return null;
    if (displayKind === "bar_horizontal") return null;
    const rowKind: ChartKind =
      displayKind === "line" || displayKind === "area"
        ? displayKind
        : displayKind === "histogram"
          ? "histogram"
          : "bar";
    if (rowKind !== "bar" && rowKind !== "line" && rowKind !== "area")
      return null;
    return computeCartesianCategoryPlanForRender({
      rows: chartRows,
      kind: rowKind,
      stackedBar: false,
      chartHeight: exportPlotHeight,
      compact: true,
      insightMode: false,
      viewportWidthPx: Math.max(exportPlotWidth, 200),
      axes: miniAxes,
      layoutVariant: "overview_half",
      allowHorizontalBarFallback: rowKind === "bar",
    });
  }, [
    offscreenExportLayout,
    displayKind,
    chartRows,
    miniAxes,
    exportPlotWidth,
    exportPlotHeight,
  ]);

  const dashboardBarCatBottom = useMemo(
    () =>
      miniCategoryPlan && (displayKind === "bar" || displayKind === "histogram")
        ? computeCategoryAxisBottomMargin({
            categoryTickStrings: chartRows.map((r) => String(r.name ?? "")),
            angled: miniCategoryPlan.angled,
            tickFontSizePx: miniCategoryPlan.tickFontSizePx,
            chartLayoutMode: miniCategoryPlan.angled ? "full" : "compact",
          })
        : computeCategoryAxisBottomMargin({
            categoryTickStrings: chartRows.map((r) => String(r.name ?? "")),
            angled: chartRows.length > 3,
            tickFontSizePx: 10,
            chartLayoutMode: chartRows.length > 3 ? "full" : "compact",
          }),
    [displayKind, chartRows, miniCategoryPlan]
  );

  const valueTickFormatter = useCallback(
    (tick: number) => formatAxisTickFromRows(chartRows, tick),
    [chartRows]
  );

  const overviewInsightChips = useMemo(
    () =>
      formatOverviewMiniInsightChips(chartRows, {
        chartTitle: chart.title,
        presentationKind: displayKind,
      }),
    [chartRows, chart.title, displayKind]
  );

  const overviewRateWarning = useMemo(
    () =>
      chartHasRateAbove100(chartRows, chart.title)
        ? RATE_EXCEEDS_100_WARNING
        : null,
    [chartRows, chart.title]
  );

  const overviewTooltipHandlers = useMemo(
    () =>
      buildChartCartesianTooltipHandlers(
        categoryAxisLabel,
        chart.title,
        overviewMetricCtx,
        displayKind === "line" || displayKind === "area"
          ? {
              categoryFormatter: (v) => {
                const trendVeryCompact = viewportWidthPx < 420;
                if (trendVeryCompact) return formatCompactTrendXAxisTickLabel(v);
                return formatOverviewTrendTickLabel(v);
              },
            }
          : undefined
      ),
    [
      categoryAxisLabel,
      chart.title,
      overviewMetricCtx,
      displayKind,
      viewportWidthPx,
    ]
  );

  if (chartRows.length === 0) return null;

  const overviewChartAnimOn =
    chartRows.length <= RECHARTS_ANIMATION_MAX_POINTS;
  const overviewAnimDuration = undefined;

  const tickTruncateLocal = (v: string | number) => {
    const s = String(v);
    return s.length > 28 ? `${s.slice(0, 26)}…` : s;
  };

  let chartBody: ReactNode;

  if (displayKind === "pie" || displayKind === "donut") {
    chartBody = (
      <ChartRenderer
        chartHeight={plotHeightPx}
        compact
        insightMode={false}
        pngCaptureMode={false}
        chartRows={chartRows}
        visualization={{
          interaction: chart.interaction
            ? { drillDimensions: chart.interaction.drillDimensions }
            : null,
        }}
        presentationKind={displayKind}
        axes={miniAxes}
        viewportW={viewportWidthPx}
        sessionCartesianPlanMain={null}
        insightCartesianPlanMain={null}
        tickTruncate={tickTruncateLocal}
        onInsightDrill={(primaryValue) => {
          if (!drillPrimary || !onDashboardDrill) return;
          const nm = String(primaryValue ?? "").trim();
          if (!nm) return;
          onDashboardDrill({
            column: drillPrimary.column,
            label: drillPrimary.label,
            value: nm,
          });
        }}
      />
    );
  } else if (renderBarAsHorizontal) {
    const hb = horizontalDashLayout;
    if (!hb) return null;
    const hbBalanced = balanceHorizontalOuterMargins({
      marginLeft: hb.marginLeft,
      chartLayoutMode: "compact",
      minRight: 8,
    });
    chartBody = (
      <ResponsiveContainer
        key={`ov-hbar-${chartLayoutWidthKey(viewportWidthPx)}`}
        width="100%"
        height={plotHeightPx}
        minWidth={0}
        minHeight={plotHeightPx}
      >
        <BarChart
          layout="vertical"
          data={chartRows}
          margin={{
            left: hbBalanced.marginLeft,
            right: hbBalanced.marginRight,
            top: OV_DASH_CHART_MARGIN.top,
            bottom: 32,
          }}
        >
          <CartesianGrid
            horizontal={false}
            vertical
            stroke={dashGrid.stroke}
            strokeDasharray={OV_DASH_GRID_DASHARRAY}
            strokeOpacity={dashGrid.opacity}
          />
          <XAxis
            type="number"
            tick={{ fontSize: OV_DASH_AXIS_LABEL_STYLE.fontSize, fill: OV_AXIS_TICK }}
            tickFormatter={valueTickFormatter}
            axisLine={{ stroke: OV_AXIS_LINE }}
            tickLine={{ stroke: OV_AXIS_LINE }}
          />
          <YAxis
            type="category"
            dataKey="name"
            width={hb.categoryAxisWidth}
            tick={<WrappedCategoryYAxisTick chartLayoutMode="compact" compact />}
            axisLine={{ stroke: OV_AXIS_LINE }}
            tickLine={{ stroke: OV_AXIS_LINE }}
          />
          <Tooltip
            {...CHART_TOOLTIP_FRAME}
            formatter={overviewTooltipHandlers.formatter}
            labelFormatter={overviewTooltipHandlers.labelFormatter}
          />
          <Bar
            dataKey="value"
            fill="#6366f1"
            radius={[0, 6, 6, 0]}
            maxBarSize={32}
            isAnimationActive={overviewChartAnimOn}
            animationDuration={overviewAnimDuration}
            cursor={drillable ? "pointer" : "default"}
            onClick={(entry: unknown, _index: number, e: { stopPropagation?: () => void }) => {
              e?.stopPropagation?.();
              if (!drillPrimary || !onDashboardDrill) return;
              const pl = entry as ChartRow & { name?: string };
              const nm = String(pl?.name ?? "").trim();
              if (!nm) return;
              onDashboardDrill({
                column: drillPrimary.column,
                label: drillPrimary.label,
                value: nm,
              });
            }}
          />
        </BarChart>
      </ResponsiveContainer>
    );
  } else if (displayKind === "line" || displayKind === "area") {
    const vLay = verticalDashLayout;
    if (!vLay) return null;
    const ChartWrap = displayKind === "area" ? AreaChart : LineChart;
    const trendTickFs = OV_DASH_AXIS_LABEL_STYLE.fontSize;
    const trendCompact = viewportWidthPx < 640;
    const trendVeryCompact = viewportWidthPx < 420;
    const trendTickMini = (v: string | number) => {
      const raw = String(v ?? "");
      if (trendVeryCompact) return formatCompactTrendXAxisTickLabel(raw);
      return formatOverviewTrendTickLabel(raw);
    };
    const temporalTickStrings = chartRows.map((r) =>
      trendTickMini(String(r.name ?? ""))
    );
    const trendInterval = computeLineAreaXAxisInterval(chartRows.length, {
      compact: trendCompact,
      viewportWidthPx: viewportWidthPx,
    });
    const trendLabelLens = temporalTickStrings.map((s) => s.length);
    const maxTrendLabelLen = Math.max(6, ...trendLabelLens, 0);
    const needsTrendAngle =
      trendVeryCompact ||
      chartRows.length > 6 ||
      maxTrendLabelLen > 9;
    const trendAngle = needsTrendAngle ? TREND_X_AXIS_ANGLE_DEG : 0;
    const trendXHeight = lineAreaXAxisHeightPx(true);
    const trendBottomRaw = computeLineAreaChartBottomMargin({
      temporalTickStrings,
      tickFontSizePx: trendTickFs,
      chartLayoutMode: "compact",
    });
    const trendBottom = Math.min(
      trendBottomRaw,
      needsTrendAngle ? 54 : 44
    );
    const trendMargins = balanceVerticalOuterMargins({
      marginLeft: overviewDashPlotMarginLeft(vLay.yAxisWidth),
      chartLayoutMode: "compact",
    });
    const plotMargin = {
      top: OV_DASH_CHART_MARGIN.top,
      right: trendMargins.marginRight,
      bottom: trendBottom,
      left: trendMargins.marginLeft,
    };
    chartBody = (
      <ResponsiveContainer
        key={`ov-trend-${chartLayoutWidthKey(viewportWidthPx)}-${displayKind}`}
        width="100%"
        height={plotHeightPx}
        minWidth={0}
        minHeight={plotHeightPx}
      >
        <ChartWrap data={chartRows} margin={plotMargin}>
          <CartesianGrid
            stroke={dashGrid.stroke}
            strokeDasharray={OV_DASH_GRID_DASHARRAY}
            strokeOpacity={dashGrid.opacity}
            vertical={false}
          />
          <XAxis
            dataKey="name"
            tick={{
              fontSize: trendTickFs,
              fill: OV_AXIS_TICK,
            }}
            tickFormatter={trendTickMini}
            angle={trendAngle}
            textAnchor={trendAngle ? "end" : "middle"}
            height={trendXHeight}
            interval={trendInterval}
            tickMargin={6}
            minTickGap={trendCompact ? 6 : 12}
            axisLine={{ stroke: OV_AXIS_LINE }}
            tickLine={{ stroke: OV_AXIS_LINE }}
          >
            <Label
              value={categoryAxisLabel}
              position="insideBottom"
              offset={-6}
              content={CartesianXAxisTitleLabelContent}
            />
          </XAxis>
          <YAxis
            tick={{ fontSize: trendTickFs, fill: OV_AXIS_TICK, dx: 2 }}
            tickFormatter={valueTickFormatter}
            width={vLay.yAxisWidth}
            axisLine={{ stroke: OV_AXIS_LINE }}
            tickLine={{ stroke: OV_AXIS_LINE }}
          />
          <Tooltip
            {...CHART_TOOLTIP_FRAME}
            formatter={overviewTooltipHandlers.formatter}
            labelFormatter={overviewTooltipHandlers.labelFormatter}
          />
          {displayKind === "area" ? (
            <Area
              type="monotone"
              dataKey="value"
              stroke="#4f46e5"
              strokeWidth={2.5}
              fill="#6366f1"
              fillOpacity={0.18}
              isAnimationActive={overviewChartAnimOn}
              animationDuration={overviewAnimDuration}
              dot={
                chartRows.length > 28
                  ? false
                  : { r: 4, strokeWidth: 1, stroke: "#fff", fill: "#4f46e5" }
              }
            />
          ) : (
            <Line
              type="monotone"
              dataKey="value"
              stroke="#4f46e5"
              strokeWidth={2.5}
              isAnimationActive={overviewChartAnimOn}
              animationDuration={overviewAnimDuration}
              dot={
                chartRows.length > 28
                  ? false
                  : { r: 4, strokeWidth: 1, stroke: "#fff", fill: "#4f46e5" }
              }
            />
          )}
        </ChartWrap>
      </ResponsiveContainer>
    );
  } else if (displayKind === "bar" || displayKind === "histogram") {
    const vLay = verticalDashLayout;
    if (!vLay) return null;
    const isHist = displayKind === "histogram";
    const barMargins = balanceVerticalOuterMargins({
      marginLeft: overviewDashPlotMarginLeft(vLay.yAxisWidth),
      chartLayoutMode: "compact",
    });
    const plotMargin = {
      top: OV_DASH_CHART_MARGIN.top,
      right: barMargins.marginRight,
      bottom:
        OV_DASH_CHART_MARGIN.bottom +
        (miniCategoryPlan?.angled ? Math.min(12, dashboardBarCatBottom * 0.28) : 0),
      left: barMargins.marginLeft,
    };
    chartBody = (
      <ResponsiveContainer
        key={`ov-bar-${chartLayoutWidthKey(viewportWidthPx)}`}
        width="100%"
        height={plotHeightPx}
        minWidth={0}
        minHeight={plotHeightPx}
      >
        <BarChart
          data={chartRows}
          barCategoryGap={isHist ? 2 : undefined}
          margin={plotMargin}
        >
          <CartesianGrid
            vertical={false}
            horizontal
            stroke={dashGrid.stroke}
            strokeDasharray={OV_DASH_GRID_DASHARRAY}
            strokeOpacity={dashGrid.opacity}
          />
          <XAxis
            dataKey="name"
            tick={{
              fontSize: miniCategoryPlan?.tickFontSizePx ?? OV_DASH_AXIS_LABEL_STYLE.fontSize,
              fill: OV_AXIS_TICK,
            }}
            tickFormatter={(v) => tickTruncateLocal(String(v))}
            angle={
              miniCategoryPlan?.angled ? miniCategoryPlan.angleDeg : 0
            }
            textAnchor={miniCategoryPlan?.angled ? "end" : "middle"}
            height={miniCategoryPlan?.xAxisHeightPx ?? 32}
            interval={miniCategoryPlan?.interval ?? 0}
            axisLine={{ stroke: OV_AXIS_LINE }}
            tickLine={{ stroke: OV_AXIS_LINE }}
          >
            <Label
              value={categoryAxisLabel}
              position="insideBottom"
              offset={-4}
              style={OV_DASH_AXIS_LABEL_STYLE}
            />
          </XAxis>
          <YAxis
            tick={{ fontSize: OV_DASH_AXIS_LABEL_STYLE.fontSize, fill: OV_AXIS_TICK, dx: 2 }}
            tickFormatter={valueTickFormatter}
            width={vLay.yAxisWidth}
            axisLine={{ stroke: OV_AXIS_LINE }}
            tickLine={{ stroke: OV_AXIS_LINE }}
          />
          <Tooltip
            {...CHART_TOOLTIP_FRAME}
            formatter={overviewTooltipHandlers.formatter}
            labelFormatter={overviewTooltipHandlers.labelFormatter}
          />
          <Bar
            dataKey="value"
            fill="#6366f1"
            radius={isHist ? [3, 3, 0, 0] : [8, 8, 4, 4]}
            maxBarSize={isHist ? 44 : 42}
            isAnimationActive={overviewChartAnimOn}
            animationDuration={overviewAnimDuration}
            cursor={drillable ? "pointer" : "default"}
            onClick={(entry: unknown, _index: number, e: { stopPropagation?: () => void }) => {
              e?.stopPropagation?.();
              if (!drillPrimary || !onDashboardDrill) return;
              const pl = entry as ChartRow & { name?: string };
              const nm = String(pl?.name ?? "").trim();
              if (!nm) return;
              onDashboardDrill({
                column: drillPrimary.column,
                label: drillPrimary.label,
                value: nm,
              });
            }}
          />
        </BarChart>
      </ResponsiveContainer>
    );
  } else {
    chartBody = null;
  }

  if (chartBody == null) return null;

  const exportFooter =
    overviewRateWarning || overviewInsightChips.length > 0 ? (
      <footer className={ovDashChartFooter}>
        {overviewRateWarning ? (
          <p className={chartRateQualityWarningClass}>{overviewRateWarning}</p>
        ) : null}
        {overviewInsightChips.length > 0 ? (
          <div className={ovDashInsightChips}>
            {overviewInsightChips.map((chip) => (
              <span
                key={chip.key}
                className={`${ovDashInsightChip} overview-dash-insight-chip--${chip.key}`}
                title={chip.title}
                aria-label={chip.title ? `${chip.text}. ${chip.title}` : chip.text}
              >
                {chip.text}
              </span>
            ))}
          </div>
        ) : null}
      </footer>
    ) : null;

  return (
    <div
      role="region"
      aria-label={canonicalTitle}
      className={`${ovDashChartCard} group ${loadingPulse ? "animate-pulse opacity-[0.92]" : ""}`}
    >
      <header className={`${ovDashChartHead} ${overviewPngExportHeader}`}>
        <h3 className={ovDashChartTitle}>{canonicalTitle}</h3>
        <div className={ovDashChartActions} onClick={(e) => e.stopPropagation()}>
          {onViewInChartsTab && snapshotId ? (
            <button
              type="button"
              onClick={() => onViewInChartsTab(snapshotId)}
              className={ovDashChartActionCharts}
              title="Open this chart in the Charts tab"
              aria-label="Open this chart in the Charts tab"
            >
              Charts
            </button>
          ) : null}
          {onAskAiAboutChart && snapshotId ? (
            <button
              type="button"
              onClick={() => onAskAiAboutChart(snapshotId)}
              className={ovDashChartActionAskAi}
              title="Switch to AI Insights with a starter question about this chart"
              aria-label="Ask AI about this chart in AI Insights"
            >
              Ask AI
            </button>
          ) : null}
          <button
            type="button"
            disabled={exportingPng}
            onClick={async () => {
              setExportingPng(true);
              const spec = buildPresentationExportSpec(displayKind, {
                categoryCount: chartRows.length,
              });
              try {
                setOffscreenExportLayout(spec);
                const { runChartPngExport } = await import(
                  "@/lib/chart-png-export-session"
                );
                await runChartPngExport({
                  getExportRoot: () => offscreenExportRef.current,
                  kind: displayKind,
                  categoryCount: chartRows.length,
                  filename: sanitizeChartExportFilename(canonicalTitle),
                  datasetName: exportFooterHint,
                });
              } catch (err) {
                onChartExportError?.(
                  err instanceof Error
                    ? err.message
                    : "Unable to export chart image."
                );
              } finally {
                setOffscreenExportLayout(null);
                setExportingPng(false);
              }
            }}
            className={`${ovDashChartActionPng} disabled:cursor-not-allowed disabled:opacity-50`}
            title="Download this chart as PNG"
            aria-label="Export this chart as a PNG image"
          >
            {exportingPng ? "Exporting…" : "PNG"}
          </button>
        </div>
      </header>
      <div
        role={onViewInChartsTab && snapshotId ? "button" : undefined}
        tabIndex={onViewInChartsTab && snapshotId ? 0 : undefined}
        onClick={() => {
          if (snapshotId && onViewInChartsTab) onViewInChartsTab(snapshotId);
        }}
        onKeyDown={(e) => {
          if (!snapshotId || !onViewInChartsTab) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onViewInChartsTab(snapshotId);
          }
        }}
        className={`${ovDashChartPlot} ${
          onViewInChartsTab && snapshotId
            ? "cursor-pointer rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)]/45"
            : ""
        }`}
        title={
          onViewInChartsTab && snapshotId
            ? "Open this chart in the Charts tab"
            : undefined
        }
      >
        <div className={`${ovDashChartPlotInner} ${chartsTabVizPlotStage}`}>
          {chartBody}
        </div>
      </div>
      {exportFooter}

      {offscreenExportLayout ? (
        <ChartPngOffscreenHost
          layout={offscreenExportLayout}
          exportRef={offscreenExportRef}
          rootClassName={overviewPngExportRoot}
        >
          <header className={`${ovDashChartHead} ${overviewPngExportHeader}`}>
            <h3 className={ovDashChartTitle}>{canonicalTitle}</h3>
          </header>
          <div
            className={`${ovDashChartPlot} ${ovDashChartPlotInner} ${chartsTabVizPlotStage}`}
            style={presentationCapturePlotStyle(offscreenExportLayout)}
          >
            <ChartRenderer
              chartHeight={offscreenExportLayout.height}
              compact={false}
              insightMode={false}
              pngCaptureMode
              chartRows={chartRows}
              visualization={{
                interaction: chart.interaction
                  ? { drillDimensions: chart.interaction.drillDimensions }
                  : null,
              }}
              presentationKind={displayKind}
              axes={miniAxes}
              viewportW={offscreenExportLayout.width}
              sessionCartesianPlanMain={exportMiniCategoryPlan}
              insightCartesianPlanMain={null}
              tickTruncate={tickTruncateLocal}
              onInsightDrill={() => {}}
            />
          </div>
          {exportFooter}
        </ChartPngOffscreenHost>
      ) : null}
    </div>
  );
});

/** Memo slot so parent re-renders (e.g. Ask AI typing) do not rebuild overview chart props. */
export const OverviewDashboardChartSlot = memo(function OverviewDashboardChartSlot({
  chart,
  canonicalTitle,
  snapshotId,
  dashGridStyle,
  loadingPulse,
  onDashboardDrill,
  onOpenDashboardChartInChartsTab,
  onAskAiAboutDashboardChart,
  onChartExportError,
  exportFooterHint,
}: {
  chart: AutoDashboardMiniChart;
  canonicalTitle: string;
  snapshotId: string | null;
  dashGridStyle: { stroke: string; opacity: number };
  exportFooterHint?: string | null;
  loadingPulse?: boolean;
  onDashboardDrill?: (ev: { column: string; label: string; value: string }) => void;
  onOpenDashboardChartInChartsTab: (snapshotId: string) => void;
  onAskAiAboutDashboardChart: (snapshotId: string) => void;
  onChartExportError: (message: string) => void;
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [plotWidth, setPlotWidth] = useState(380);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const apply = (w: number) => {
      if (w > 0) setPlotWidth(Math.floor(w));
    };
    apply(el.getBoundingClientRect().width);
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w != null) apply(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const layoutWidthPx = useMemo(
    () => Math.max(plotWidth, 200),
    [plotWidth],
  );

  const plotHeightPx = useOverviewDashPlotHeight();

  const handleViewInChartsTab = useCallback(() => {
    if (snapshotId) onOpenDashboardChartInChartsTab(snapshotId);
  }, [snapshotId, onOpenDashboardChartInChartsTab]);

  const handleAskAiAboutChart = useCallback(
    (id: string) => {
      onAskAiAboutDashboardChart(id);
    },
    [onAskAiAboutDashboardChart],
  );

  return (
    <div ref={wrapRef} className="w-full min-w-0 max-w-full">
      <OverviewAutoDashboardChartCard
        chart={chart}
        canonicalTitle={canonicalTitle}
        snapshotId={snapshotId}
        viewportWidthPx={layoutWidthPx}
        plotHeightPx={plotHeightPx}
        dashGridStyle={dashGridStyle}
        loadingPulse={loadingPulse}
        onDashboardDrill={onDashboardDrill}
        onViewInChartsTab={snapshotId ? handleViewInChartsTab : undefined}
        onAskAiAboutChart={snapshotId ? handleAskAiAboutChart : undefined}
        onChartExportError={onChartExportError}
        exportFooterHint={exportFooterHint}
      />
    </div>
  );
});

function normalizeKpiCardsFromApi(
  cards: unknown,
  datasetKindRaw: unknown,
  mapping?: { salesColumn?: string; productColumn?: string }
): KpiCard[] {
  if (!Array.isArray(cards) || !cards.length) return [];
  const dk = coerceDatasetKind(datasetKindRaw);
  const remapOpts = {
    metricColumn: mapping?.salesColumn?.trim() || null,
    breakdownColumn: mapping?.productColumn?.trim() || null,
  };
  return cards.map((raw) => {
    const c = raw as KpiCard;
    const title = remapLegacyKpiTitle(
      sanitizeKpiLabelPhrase(String(c.title ?? "")),
      dk,
      remapOpts
    );
    const sub =
      c.subtitle != null && String(c.subtitle).trim()
        ? remapLegacyKpiTitle(
            sanitizeKpiLabelPhrase(String(c.subtitle)),
            dk,
            remapOpts
          )
        : c.subtitle;
    return { ...c, title, subtitle: sub };
  });
}

type UploadMeta = {
  name: string;
  size_bytes: number;
};

type DatasetProfile = {
  column_types: Record<string, "number" | "date" | "text" | "category">;
  null_counts: Record<string, number>;
  summary_stats: Record<string, unknown>;
  unique_counts?: Record<string, number>;
};


type DatasetKindSlug =
  | "hr"
  | "sales"
  | "ecommerce"
  | "manufacturing"
  | "finance"
  | "operations"
  | "marketing"
  | "generic"
  | "";

function coerceDatasetKind(raw: unknown): DatasetKindSlug {
  if (typeof raw !== "string") return "";
  const k = raw.trim().toLowerCase();
  switch (k) {
    case "hr":
    case "sales":
    case "ecommerce":
    case "manufacturing":
    case "finance":
    case "operations":
    case "marketing":
    case "generic":
      return k;
    default:
      return k ? "generic" : "";
  }
}

type ExportOptions = {
  includeKPIs: boolean;
  includeAIInsight: boolean;
  includeChart: boolean;
  includeDataPreview: boolean;
  includeDataQuality: boolean;
  /** Prior questions, follow-up chain, inherited BI cohort filters in PDF appendix */
  includeConversationContext?: boolean;
  /** Raw series, chart spec, sparklines, engine metadata — PDF technical appendix */
  includeTechnicalAppendix?: boolean;
  /** Which chart drives the PDF capture: AI insight vs Charts-tab selection. */
  chartScope?: "insight" | "session";
  /** Default executive — analyst mode enables technical appendix + metadata sections. */
  pdfMode?: "executive" | "analyst";
};

function inferSalesColumn(
  cols: string[],
  profile: DatasetProfile | null,
  explicit: string,
  datasetKind?: string
): string | null {
  if (explicit) return explicit;
  const nums = cols.filter((c) => profile?.column_types?.[c] === "number");
  const dk = (datasetKind || "").trim().toLowerCase();
  if (dk === "operations" || dk === "manufacturing") {
    const opsMetric = nums.find((c) =>
      /production_loss|downtime|repair|maintenance|defect|scrap|oee|yield|outage|loss_units/i.test(
        c
      )
    );
    if (opsMetric) return opsMetric;
  }
  const byName = nums.find((c) =>
    /sales|revenue|amount|total|value|qty|quantity/i.test(c)
  );
  if (byName) return byName;
  if (nums.length === 1) return nums[0];
  return null;
}

function inferDateColumn(
  cols: string[],
  profile: DatasetProfile | null,
  explicit: string
): string | null {
  if (explicit) return explicit;
  const dates = cols.filter((c) => profile?.column_types?.[c] === "date");
  if (dates.length === 1) return dates[0];
  const byName = cols.find((c) =>
    /date|month|year|time|period|day/i.test(c)
  );
  return byName ?? dates[0] ?? null;
}

/** Names that read as business measures, not technical keys. */
function isLikelyBusinessMetricColumnName(col: string): boolean {
  const n = col.trim().toLowerCase().replace(/\s+/g, "_");
  if (!n) return false;
  const metricParts = new Set([
    "salary",
    "revenue",
    "attendance",
    "score",
    "amount",
    "percentage",
    "bonus",
    "price",
    "downtime",
    "cost",
    "profit",
    "margin",
    "discount",
    "tax",
    "fee",
    "quantity",
    "qty",
    "volume",
    "hours",
    "rate",
    "headcount",
    "turnover",
    "weight",
    "height",
    "width",
    "depth",
    "age",
    "total",
    "avg",
    "mean",
    "median",
    "cnt",
    "count",
    "pct",
    "percent",
    "ratio",
    "share",
    "payment",
    "payments",
    "balance",
    "accrual",
    "utilization",
    "efficiency",
    "yield",
    "spend",
    "budget",
    "forecast",
    "actual",
    "target",
    "quota",
    "comp",
    "compensation",
    "wage",
    "pay",
    "earnings",
    "income",
    "expense",
    "reimbursement",
    "overtime",
    "hoursworked",
    "fte",
  ]);
  const parts = n.split("_").filter(Boolean);
  if (parts.some((p) => metricParts.has(p))) return true;
  if (
    /(^|_)(salary|revenue|attendance|bonus|price|downtime|amount)(_|$)/.test(n)
  )
    return true;
  if (/_percent$|_pct$|_percentage$|_ratio$|_rate$|_score$|percentage$/.test(n))
    return true;
  return false;
}

function isIdLikeColumnNameForProduct(c: string): boolean {
  if (isLikelyBusinessMetricColumnName(c)) return false;
  const n = c.trim().toLowerCase().replace(/\s+/g, "_");
  if (/\b(uuid|guid|row_?id|rowid|index|seq|sequence)\b/.test(n)) return true;
  if (
    /(^|_)(transaction|txn|order|customer|client|user|emp|employee|account|invoice|payment|shipment|cart|session|visit|incident|case|ticket|claim|policy|member|patient|student|vendor|supplier|partner)_?id$|^id$|^ids$/i.test(
      n
    )
  )
    return true;
  if (n.endsWith("_id") || n.endsWith("_ids")) return true;
  return false;
}

const UUID_VALUE_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function previewValuesSuggestIdentifierPattern(
  preview: PreviewRow[],
  col: string,
  minSamples = 5,
  maxSamples = 36
): boolean {
  const samples: string[] = [];
  for (const row of preview) {
    const v = row[col];
    if (isMissingValue(v)) continue;
    samples.push(String(v).trim());
    if (samples.length >= maxSamples) break;
  }
  if (samples.length < minSamples) return false;
  if (samples.every((s) => /^\d+(\.\d+)?$/.test(s))) return false;

  let hits = 0;
  for (const s of samples) {
    if (!s) continue;
    if (UUID_VALUE_RE.test(s)) {
      hits += 1;
      continue;
    }
    if (/^[0-9a-f]{32}$/i.test(s)) {
      hits += 1;
      continue;
    }
    if (/^[A-Z]{2,8}\d{3,14}$/i.test(s)) {
      hits += 1;
      continue;
    }
    if (/^[A-Z]{2,6}-[0-9]{4,12}(?:-[A-Z0-9]+)?$/i.test(s)) {
      hits += 1;
      continue;
    }
  }
  return hits >= Math.ceil(samples.length * 0.72);
}

/**
 * Identifier hint: very high uniqueness plus id-like column name OR id-like cell values.
 * Never uses numeric cardinality alone for business metric columns.
 */
function columnLooksLikePossibleIdentifier(args: {
  col: string;
  preview: PreviewRow[];
  nonNull: number;
  distinct: number;
}): boolean {
  const { col, preview, nonNull, distinct } = args;
  if (nonNull < 6) return false;
  if (isLikelyBusinessMetricColumnName(col)) return false;
  const uniqRatio = distinct / nonNull;
  if (uniqRatio < 0.995) return false;
  if (isIdLikeColumnNameForProduct(col)) return true;
  if (previewValuesSuggestIdentifierPattern(preview, col)) return true;
  return false;
}

type ColumnQualityBadge = {
  key: string;
  label: string;
  title: string;
  className: string;
};

function previewColumnUniqueStats(
  preview: PreviewRow[],
  col: string
): { distinct: number; nonNull: number } {
  const set = new Set<string>();
  let nonNull = 0;
  for (const row of preview) {
    const v = row[col];
    if (isMissingValue(v)) continue;
    nonNull += 1;
    set.add(String(v));
  }
  return { distinct: set.size, nonNull };
}

function parsePreviewCellToTimestamp(
  v: string | number | null | undefined
): number | null {
  if (isMissingValue(v)) return null;
  if (typeof v === "number") {
    if (!Number.isFinite(v)) return null;
    if (v > 1e12 && v < 1e15) return v;
    if (v > 1e9 && v <= 1e12) return v * 1000;
    const d = new Date(v);
    const t = d.getTime();
    return Number.isNaN(t) ? null : t;
  }
  const s = String(v).trim();
  if (!s) return null;
  const parsed = Date.parse(s);
  if (!Number.isNaN(parsed)) return parsed;
  const d2 = new Date(s);
  const t2 = d2.getTime();
  return Number.isNaN(t2) ? null : t2;
}

function computeCategoricalTopFromPreview(
  preview: PreviewRow[],
  col: string,
  limit: number
): { value: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const row of preview) {
    const cell = row[col];
    if (isMissingValue(cell)) continue;
    const key = String(cell);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

function formatProfileDateLabel(ms: number): string {
  try {
    return new Date(ms).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return "—";
  }
}

function formatDateCoverageSpan(minMs: number, maxMs: number): string {
  if (!Number.isFinite(minMs) || !Number.isFinite(maxMs) || maxMs < minMs) {
    return "—";
  }
  const days = Math.round((maxMs - minMs) / 86400000);
  if (days <= 1) return "About a day or less between first and last.";
  if (days < 60) return `About ${days} days from first to last.`;
  const months = Math.round(days / 30);
  if (months < 18) return `Roughly ${months} months of coverage.`;
  return `Roughly ${(days / 365.25).toFixed(1)} years from first to last.`;
}

/** Human-readable type for the compact header pill. */
function dataPreviewHeaderTypeLabel(
  dt: "number" | "date" | "text" | "category" | undefined
): string {
  if (dt === "number") return "Number";
  if (dt === "date") return "Date";
  if (dt === "category") return "Category";
  if (dt === "text") return "Text";
  return "—";
}

/**
 * Single secondary quality line for Data Preview headers (priority: missing →
 * identifier → high uniqueness → clean). Tooltip carries full detail.
 */
function pickDataPreviewHeaderSecondaryBadge(args: {
  col: string;
  profile: DatasetProfile | null;
  totalRows: number;
  preview: PreviewRow[];
}): ColumnQualityBadge | null {
  const { col, profile, totalRows, preview } = args;
  const type = profile?.column_types?.[col];
  const nullRaw = profile?.null_counts?.[col];
  const nullCount = typeof nullRaw === "number" && Number.isFinite(nullRaw) ? nullRaw : 0;
  const nRows = Math.max(1, totalRows);
  const nullRatio = nullCount / nRows;

  const { distinct, nonNull } = previewColumnUniqueStats(preview, col);
  const uniqRatio = nonNull > 0 ? distinct / nonNull : 0;
  const possibleKey = columnLooksLikePossibleIdentifier({
    col,
    preview,
    nonNull,
    distinct,
  });

  const highCard =
    !possibleKey &&
    type !== "date" &&
    nonNull >= 8 &&
    uniqRatio >= 0.92 &&
    (type === "category" || type === "text");

  if (nullRatio >= 0.15) {
    return {
      key: "empty-heavy",
      label: "Missing",
      title: `About ${Math.round(nullRatio * 100)}% of rows are blank (${nullCount.toLocaleString()} of ${nRows.toLocaleString()}). Heavy blanks can skew joins and aggregates.`,
      className: dpBadgeMissing,
    };
  }
  if (nullCount > 0) {
    return {
      key: "missing",
      label: "Missing",
      title: `${nullCount.toLocaleString()} blank cells (${Math.round(nullRatio * 100)}% of rows).`,
      className: dpBadgeMissing,
    };
  }
  if (possibleKey) {
    return {
      key: "id",
      label: "Identifier",
      title:
        "Looks like a primary or surrogate key—use for grain or joins, not as a default chart breakdown.",
      className: dpBadgeId,
    };
  }
  if (highCard) {
    return {
      key: "uniq",
      label: "Unique",
      title:
        "Values repeat rarely in the loaded preview—expect high cardinality when filtering or charting.",
      className: dpBadgeUnique,
    };
  }
  if (nullCount === 0) {
    return {
      key: "clean",
      label: "Clean",
      title:
        "No nulls in this column in the profile snapshot. Watch for hidden placeholders in raw cells.",
      className: dpBadgeClean,
    };
  }
  return null;
}

function inferProductColumn(
  cols: string[],
  profile: DatasetProfile | null,
  explicit: string
): string | null {
  if (explicit) return explicit;
  const preferredTypes = cols.filter((c) => {
    const t = profile?.column_types?.[c];
    return t === "category" || t === "text";
  });
  const pool = preferredTypes.length ? preferredTypes : cols;
  const scored: { col: string; score: number }[] = [];
  for (const c of pool) {
    if (isIdLikeColumnNameForProduct(c)) continue;
    const low = c.toLowerCase();
    if (/(customer_id|cust_id|order_id|invoice_id|user_id|line_id)\b/i.test(low))
      continue;
    let s = 0;
    if (
      /product|sku|item|category|subcategory|brand|segment|variant|collection|style|article|merchandise/.test(
        low
      )
    )
      s += 24;
    if (/(name|title|description)\b/i.test(low)) s += 6;
    if (/(customer|client|order|invoice|payment|shipment)\b/i.test(low) && /_?id$/i.test(low))
      s -= 80;
    if (s > 0) scored.push({ col: c, score: s });
  }
  scored.sort((a, b) => b.score - a.score);
  if (scored.length) return scored[0].col;
  const cats = cols.filter((c) => profile?.column_types?.[c] === "category");
  const catPick = cats.find((c) => !isIdLikeColumnNameForProduct(c));
  return catPick ?? null;
}

type MappingCandidate = { column: string; score: number; reasons: string[] };

type MappingRoleMeta = {
  selected: string | null;
  confidence: string;
  top_candidates: MappingCandidate[];
  auto_selected?: string | null;
  override_note?: string;
  score_breakdown_hint?: string;
};

type MappingMetadata = {
  domain: string;
  roles: Partial<Record<string, MappingRoleMeta>>;
  notes?: string[];
  rules_applied?: string[];
};

/** Token multiset for fuzzy dedupe (order-independent). */
function suggestionTokenMultisetKey(q: string): string {
  return q
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .sort()
    .join(" ");
}

function dedupeSuggestedQuestions(items: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of items) {
    const q = raw.trim();
    if (!q) continue;
    const k = suggestionTokenMultisetKey(q);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(q);
  }
  return out;
}

function suggestionsLookNearDuplicate(a: string, b: string): boolean {
  const ka = suggestionTokenMultisetKey(a);
  const kb = suggestionTokenMultisetKey(b);
  if (ka === kb) return true;
  if (!ka || !kb) return false;
  const shorter = ka.length <= kb.length ? ka : kb;
  const longer = ka.length > kb.length ? ka : kb;
  if (shorter.length >= 14 && longer.includes(shorter)) return true;
  const wa = new Set(ka.split(" "));
  const wb = new Set(kb.split(" "));
  let inter = 0;
  wa.forEach((w) => {
    if (wb.has(w)) inter += 1;
  });
  const uni = wa.size + wb.size - inter;
  return uni > 0 && inter / uni >= 0.72;
}

/** Dedupe near-duplicates while preserving first occurrence order. */
function dedupeSuggestedQuestionsNear(items: string[]): string[] {
  const out: string[] = [];
  for (const raw of items) {
    const q = raw.trim();
    if (!q) continue;
    if (out.some((o) => suggestionsLookNearDuplicate(o, q))) continue;
    out.push(q);
  }
  return out;
}

/** Drop suggestions that duplicate a recent question (normalized). */
function filterSuggestedAgainstRecent(
  suggestions: string[],
  recent: string[]
): string[] {
  const recentKeys = new Set(
    recent.map((r) => suggestionTokenMultisetKey(r)).filter(Boolean)
  );
  return dedupeSuggestedQuestionsNear(
    dedupeSuggestedQuestions(
      suggestions.filter((s) => !recentKeys.has(suggestionTokenMultisetKey(s)))
    )
  );
}

function applySuggestionListHygiene(
  suggestions: string[],
  recent: string[]
): string[] {
  return filterSuggestedAgainstRecent(
    dedupeSuggestedQuestionsNear(dedupeSuggestedQuestions(suggestions)),
    recent
  );
}

/** If upload/mapping API omits suggestions, use dataset-aware neutral prompts. */
function mappingSemanticRoleLabel(role: string): string {
  const r = role.toLowerCase();
  if (r === "sales") return "Primary metric";
  if (r === "product") return "Grouping dimension";
  if (r === "date") return "Time";
  if (r === "customer") return "Customer / member";
  if (r === "region") return "Location / region";
  return role;
}

/** Neutral prompts when the API does not return suggested questions (no vertical wording). */
function clientFallbackSuggestedQuestions(_datasetKind: string): string[] {
  return dedupeSuggestedQuestionsNear(
    dedupeSuggestedQuestions([
      "What are the strongest patterns in this dataset?",
      "Which categories differ most on the main numeric metrics?",
      "Summarize averages and extremes by the primary breakdown dimension.",
      "How do values trend over time when a date column applies?",
      "Compare groups side-by-side on the primary measure.",
    ])
  );
}

type DataPreviewProfileAnchor = {
  top: number;
  left: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

function DataPreviewColumnProfilePopover({
  col,
  profile,
  preview,
  rows,
  anchor,
  onClose,
}: {
  col: string;
  profile: DatasetProfile | null;
  preview: PreviewRow[];
  rows: number;
  anchor: DataPreviewProfileAnchor;
  onClose: () => void;
}) {
  const dt = profile?.column_types?.[col];
  const typeLabel = dt
    ? dt === "number"
      ? "Number"
      : dt === "date"
        ? "Date"
        : dt === "category"
          ? "Category"
          : "Text"
    : "—";
  const missPct = columnProfileMissingPercent(col, profile, rows);
  const missLabel = missPct != null ? `${missPct.toFixed(1)}%` : "—";

  const panelStyle = useMemo((): CSSProperties => {
    const margin = 8;
    const estW = 300;
    const estH = 300;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = anchor.left;
    if (left + estW > vw - margin) left = vw - margin - estW;
    if (left < margin) left = margin;
    let top = anchor.bottom + 6;
    if (top + estH > vh - margin) {
      top = Math.max(margin, anchor.top - Math.min(estH, anchor.top - margin) - 6);
    }
    return { top, left, width: estW };
  }, [anchor]);

  const statRow = (label: string, value: ReactNode) => (
    <div className="flex items-start justify-between gap-2 border-b border-slate-100 py-1.5 last:border-b-0">
      <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-slate-500">
        {label}
      </span>
      <span className="max-w-[11rem] text-right text-[11px] font-semibold leading-snug text-slate-900 tabular-nums">
        {value}
      </span>
    </div>
  );

  let minD: number | null = null;
  let maxD: number | null = null;
  for (const row of preview) {
    const t = parsePreviewCellToTimestamp(row[col]);
    if (t == null) continue;
    if (minD == null || t < minD) minD = t;
    if (maxD == null || t > maxD) maxD = t;
  }

  const topCats = computeCategoricalTopFromPreview(preview, col, 5);
  const { distinct: uniqPreview } = previewColumnUniqueStats(preview, col);

  const minN = readProfileDescribeStat(col, "min", profile);
  const maxN = readProfileDescribeStat(col, "max", profile);
  const meanN = readProfileDescribeStat(col, "mean", profile);

  const uniqNote =
    preview.length > 0 && preview.length < rows
      ? `Based on ${preview.length.toLocaleString()} loaded rows.`
      : null;

  const node = (
    <>
      <button
        type="button"
        className="fixed inset-0 z-[140] cursor-default bg-slate-900/10"
        aria-label="Dismiss column profile"
        onClick={onClose}
      />
      <div
        className="fixed z-[141] flex max-h-[min(22rem,calc(100vh-1rem))] flex-col overflow-hidden rounded-2xl border border-slate-200/95 bg-white shadow-xl shadow-slate-900/12"
        style={panelStyle}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dpc-pop-heading"
      >
        <div className="flex shrink-0 items-start justify-between gap-2 border-b border-slate-100 px-3 py-2">
          <div className="min-w-0">
            <h2
              id="dpc-pop-heading"
              className="text-sm font-semibold leading-snug text-slate-900"
            >
              {humanizeColumnName(col)}
            </h2>
            <p className="truncate text-[10px] text-slate-500" title={col}>
              {col}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg px-2 py-0.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-100"
          >
            Close
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-2">
          <div className="rounded-xl border border-slate-100 bg-slate-50/80 px-2.5 py-0.5">
            {statRow("Type", typeLabel)}
            {statRow("Missing", missLabel)}
            {dt === "number" ? (
              <>
                {minN != null ? statRow("Min", formatColumnProfileNumber(minN)) : null}
                {maxN != null ? statRow("Max", formatColumnProfileNumber(maxN)) : null}
                {meanN != null
                  ? statRow("Average", formatColumnProfileNumber(meanN))
                  : null}
                {statRow("Unique count", uniqPreview.toLocaleString())}
              </>
            ) : null}
            {dt === "category" || dt === "text" ? (
              <>
                {statRow("Unique count", uniqPreview.toLocaleString())}
                <div className="border-t border-slate-100 pt-1.5">
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                    Top values
                  </p>
                  {topCats.length === 0 ? (
                    <p className="pb-1 text-[10px] text-slate-500">
                      No values in loaded rows.
                    </p>
                  ) : (
                    <ul className="space-y-1 pb-1">
                      {topCats.map((row, i) => (
                        <li
                          key={`${i}-${row.value.slice(0, 32)}`}
                          className="flex items-start justify-between gap-2 text-[10px]"
                        >
                          <span
                            className="min-w-0 flex-1 break-words text-slate-800"
                            title={row.value}
                          >
                            {row.value.length > 40
                              ? `${row.value.slice(0, 38)}…`
                              : row.value}
                          </span>
                          <span className="shrink-0 font-semibold tabular-nums text-slate-700">
                            {row.count.toLocaleString()}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </>
            ) : null}
            {dt === "date" ? (
              <>
                {minD != null
                  ? statRow("Min date", formatProfileDateLabel(minD))
                  : statRow("Min date", "—")}
                {maxD != null
                  ? statRow("Max date", formatProfileDateLabel(maxD))
                  : statRow("Max date", "—")}
                {minD != null && maxD != null ? (
                  statRow("Date range", formatDateCoverageSpan(minD, maxD))
                ) : (
                  statRow("Date range", "—")
                )}
              </>
            ) : null}
          </div>
          {uniqNote ? (
            <p className="mt-2 text-[9px] leading-relaxed text-slate-500">{uniqNote}</p>
          ) : null}
        </div>
      </div>
    </>
  );

  if (typeof document === "undefined") return null;
  return createPortal(node, document.body);
}

function HomeInner() {
  useDevRenderCount("HomeInner");
  /** Off-screen charts for PDF/PNG capture (session vs AI insight bundles). */
  const chartCaptureSessionRef = useRef<HTMLDivElement | null>(null);
  const chartCaptureInsightRef = useRef<HTMLDivElement | null>(null);
  const [pdfCaptureMounted, setPdfCaptureMounted] = useState(false);
  const skipFilteredDashboardOnceRef = useRef(false);
  const chartsTabOffscreenExportRef = useRef<HTMLDivElement | null>(null);
  const [chartsTabOffscreenLayout, setChartsTabOffscreenLayout] = useState<
    ReturnType<typeof buildPresentationExportSpec> | null
  >(null);
  const [exportingChartsTabPng, setExportingChartsTabPng] = useState(false);
  const sessionChartKindRef = useRef<ChartKind>("bar");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [aiAnswerByChartId, setAiAnswerByChartId] =
    useState<ChartInsightAnswerStore>({});
  const [activeTab, setActiveTab] = useState<MainNavTabId>("overview");
  const overviewDashGridStyle = useOverviewDashGridStyle(activeTab === "overview");
  const [pilotInfoModal, setPilotInfoModal] = useState<
    Exclude<PilotNavTarget, "home"> | null
  >(null);
  const [pilotNavHighlight, setPilotNavHighlight] =
    useState<PilotNavTarget>("home");
  const [, startTabTransition] = useTransition();
  const handleMainTabClick = useCallback(
    (id: MainNavTabId) => {
      if (id !== "overview") {
        setPilotInfoModal(null);
      }
      if (id === "overview") {
        setPilotNavHighlight("home");
      }
      startTabTransition(() => setActiveTab(id));
    },
    [startTabTransition]
  );
  const [viewportH, setViewportH] = useState(960);
  const [viewportW, setViewportW] = useState(1024);
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | undefined;
    const apply = () => {
      setViewportH(window.innerHeight);
      setViewportW(window.innerWidth);
    };
    apply();
    const onResize = () => {
      if (t) return;
      t = setTimeout(() => {
        t = undefined;
        apply();
      }, 140);
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      if (t) clearTimeout(t);
    };
  }, []);

  /** Match PDF/off-screen capture width so axis fallback matches exported PNG. */
  const MAIN_CHART_LAYOUT_CAP_PX = 860;
  const [file, setFile] = useState<File | null>(null);
  const [uploadMeta, setUploadMeta] = useState<UploadMeta | null>(null);
  const [profile, setProfile] = useState<DatasetProfile | null>(null);

  const [productColumn, setProductColumn] = useState<string>("");
  const [salesColumn, setSalesColumn] = useState<string>("");
  const [regionColumn, setRegionColumn] = useState<string>("");
  const [customerColumn, setCustomerColumn] = useState<string>("");
  const [profitColumn, setProfitColumn] = useState<string>("");
  const [dateColumn, setDateColumn] = useState<string>("");

  const [columns, setColumns] = useState<string[]>([]);
  const [rows, setRows] = useState<number>(0);
  const [preview, setPreview] = useState<PreviewRow[]>([]);

  const [kpis, setKpis] = useState<KPIs | null>(null);
  const [kpiCards, setKpiCards] = useState<KpiCard[]>([]);
  const [alignedAnalysis, setAlignedAnalysis] =
    useState<AlignedAnalysisContext | null>(null);
  const [datasetKind, setDatasetKind] = useState<DatasetKindSlug>("");
  const [autoDashboard, setAutoDashboard] =
    useState<AutoDashboardPayload | null>(null);
  const [autoDashboardUpdatedAt, setAutoDashboardUpdatedAt] = useState<
    number | null
  >(null);
  const [selectedSheet, setSelectedSheet] = useState("");
  const [, setSheets] = useState<string[]>([]);

  useEffect(() => {
    if (autoDashboard) {
      scheduleEffectUpdate(() => setAutoDashboardUpdatedAt(Date.now()));
    } else {
      scheduleEffectUpdate(() => setAutoDashboardUpdatedAt(null));
    }
  }, [autoDashboard]);

  useEffect(() => {
    if (columns.length === 0) {
      scheduleEffectUpdate(() => setOverviewUploadExpanded(true));
    }
  }, [columns.length]);

  const {
    activeSnapshot,
    history: chartHistory,
    activeId: activeChartId,
    insightSnapshot,
    insightChartId,
    selectChart,
    pushAIChart,
    replaceAutoDashboardCharts,
    invalidateForDatasetChange,
    clearInsightThread,
    clearAiInsightSession,
    datasetEpoch: chartDatasetEpoch,
  } = useChartSession();

  const chartData = activeSnapshot?.chartData ?? [];
  const chartType: ChartKind = activeSnapshot?.chartKind ?? "";
  const chartTitle = activeSnapshot?.title ?? "";
  const chartSubtitle = activeSnapshot?.subtitle ?? "";
  const visualization =
    (activeSnapshot?.visualization ?? null) as StoredVisualization | null;

  const insightChartData = insightSnapshot?.chartData ?? [];
  const insightChartType: ChartKind = insightSnapshot?.chartKind ?? "";
  const insightChartTitle = insightSnapshot?.title ?? "";
  const insightChartSubtitle = insightSnapshot?.subtitle ?? "";
  const insightVisualization =
    (insightSnapshot?.visualization ?? null) as StoredVisualization | null;

  const [previewRowLimit, setPreviewRowLimit] = useState<number | "all">(10);
  const [dataPreviewSearchQuery, setDataPreviewSearchQuery] = useState("");
  const [dataPreviewSchemaSearch, setDataPreviewSchemaSearch] = useState("");
  const [dataPreviewSelectedSchemaCol, setDataPreviewSelectedSchemaCol] =
    useState<string | null>(null);
  const [dataPreviewProfileOpen, setDataPreviewProfileOpen] = useState<{
    column: string;
    anchor: DataPreviewProfileAnchor;
  } | null>(null);
  const [dataPreviewSuggestionsExpanded, setDataPreviewSuggestionsExpanded] =
    useState(false);
  const [dataPreviewTableHeaderElevated, setDataPreviewTableHeaderElevated] =
    useState(false);
  const [dataPreviewPageIndex, setDataPreviewPageIndex] = useState(0);
  const [dataPreviewSort, setDataPreviewSort] = useState<DataPreviewSortState>(null);
  const dataPreviewTableScrollRef = useRef<HTMLDivElement | null>(null);
  const dataPreviewTableSurfaceRef = useRef<HTMLDivElement | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [lastAskedQuestion, setLastAskedQuestion] = useState("");
  const [hasValidAIAnswer, setHasValidAIAnswer] = useState(false);
  const [howCalculatedOpen, setHowCalculatedOpen] = useState(false);

  const [loading, setLoading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState("");
  const [error, setError] = useState("");
  const uploadSuccessHideRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Full upload UI (file picker + drag/drop); compact status strip after a dataset is loaded. */
  const [overviewUploadExpanded, setOverviewUploadExpanded] = useState(true);
  const overviewFileInputRef = useRef<HTMLInputElement | null>(null);
  const [overviewDropActive, setOverviewDropActive] = useState(false);

  /** Success toasts (upload / sheet change): brief confirmation, not persistent across tabs. */
  useEffect(() => {
    if (!uploadMessage.trim()) {
      if (uploadSuccessHideRef.current) {
        clearTimeout(uploadSuccessHideRef.current);
        uploadSuccessHideRef.current = null;
      }
      return;
    }
    if (uploadSuccessHideRef.current) {
      clearTimeout(uploadSuccessHideRef.current);
    }
    uploadSuccessHideRef.current = setTimeout(() => {
      setUploadMessage("");
      uploadSuccessHideRef.current = null;
    }, 4000);
    return () => {
      if (uploadSuccessHideRef.current) {
        clearTimeout(uploadSuccessHideRef.current);
        uploadSuccessHideRef.current = null;
      }
    };
  }, [uploadMessage]);
  const [mappingMessage, setMappingMessage] = useState("");
  const mappingSuccessHideRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismissMappingMessage = useCallback(() => {
    if (mappingSuccessHideRef.current) {
      clearTimeout(mappingSuccessHideRef.current);
      mappingSuccessHideRef.current = null;
    }
    setMappingMessage("");
  }, []);

  /** Mapping save toast: auto-hide after 4s (same cadence as upload success). */
  useEffect(() => {
    if (!mappingMessage.trim()) {
      if (mappingSuccessHideRef.current) {
        clearTimeout(mappingSuccessHideRef.current);
        mappingSuccessHideRef.current = null;
      }
      return;
    }
    if (mappingSuccessHideRef.current) {
      clearTimeout(mappingSuccessHideRef.current);
    }
    mappingSuccessHideRef.current = setTimeout(() => {
      setMappingMessage("");
      mappingSuccessHideRef.current = null;
    }, 4000);
    return () => {
      if (mappingSuccessHideRef.current) {
        clearTimeout(mappingSuccessHideRef.current);
        mappingSuccessHideRef.current = null;
      }
    };
  }, [mappingMessage]);

  const [mappingModalOpen, setMappingModalOpen] = useState(false);
  const [planTier, setPlanTierState] = useState<PlanTier>("free");
  const [planUsage, setPlanUsage] = useState<PlanUsageResponse | null>(null);
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false);
  const [upgradeLimit, setUpgradeLimit] = useState<LimitKind | null>(null);
  const [upgradeMessage, setUpgradeMessage] = useState("");

  const pilotNavActive = useMemo(
    () =>
      resolvePilotNavActive({
        activeTab,
        pilotInfoModal,
        pilotNavHighlight,
      }),
    [activeTab, pilotInfoModal, pilotNavHighlight]
  );

  const closePilotInfoModal = useCallback(() => {
    setPilotInfoModal(null);
    setPilotNavHighlight("home");
  }, []);

  const openUpgradeModal = useCallback((limit: LimitKind, message: string) => {
    setUpgradeLimit(limit);
    setUpgradeMessage(message);
    setUpgradeModalOpen(true);
  }, []);

  const handlePilotNav = useCallback(
    (target: PilotNavTarget) => {
      setPilotNavHighlight(target);
      startTabTransition(() => setActiveTab("overview"));
      if (target === "home") {
        setPilotInfoModal(null);
        requestAnimationFrame(() => {
          const landing = document.getElementById("pilot-landing");
          if (landing) {
            landing.scrollIntoView({ behavior: "smooth", block: "start" });
          } else {
            window.scrollTo({ top: 0, behavior: "smooth" });
          }
        });
        return;
      }
      const sectionId = PILOT_HEADER_NAV.find((link) => link.id === target)?.sectionId;
      requestAnimationFrame(() => {
        const section = sectionId ? document.getElementById(sectionId) : null;
        if (section) {
          setPilotInfoModal(null);
          section.scrollIntoView({ behavior: "smooth", block: "start" });
        } else {
          setPilotInfoModal(target);
        }
      });
    },
    [startTabTransition]
  );

  const handleApiLimitDetail = useCallback(
    (detail: unknown): boolean => {
      const parsed = parseLimitErrorDetail(detail);
      if (parsed?.upgrade_required) {
        openUpgradeModal(parsed.limit, parsed.message);
        return true;
      }
      return false;
    },
    [openUpgradeModal]
  );

  const applyPlanEnvelope = useCallback((plan: PlanUsageResponse | undefined) => {
    if (!plan) return;
    setPlanTierState(plan.tier);
    setPlanUsage(plan);
  }, []);

  useEffect(() => {
    const refreshUsage = () => {
      fetchPlanUsage()
        .then((payload) => setPlanUsage(payload))
        .catch(() => {});
    };
    scheduleEffectUpdate(() => {
      setPlanTierState(getPlanTier());
      refreshUsage();
    });
    const onPlanChange = () => {
      setPlanTierState(getPlanTier());
      refreshUsage();
    };
    window.addEventListener(PLAN_TIER_CHANGED_EVENT, onPlanChange);
    return () => window.removeEventListener(PLAN_TIER_CHANGED_EVENT, onPlanChange);
  }, []);

  const previewRowSelectOptions = useMemo(
    () => previewRowOptionsForTier(planTier),
    [planTier]
  );

  const mappingModalOpenRef = useRef(mappingModalOpen);
  const mappingMessageRef = useRef(mappingMessage);
  mappingModalOpenRef.current = mappingModalOpen;
  mappingMessageRef.current = mappingMessage;

  /** Clear mapping toast when user changes tab. */
  useEffect(() => {
    scheduleEffectUpdate(() => dismissMappingMessage());
  }, [activeTab, dismissMappingMessage]);

  /** Clear mapping toast when user edits mapping fields in the open modal. */
  useEffect(() => {
    if (!mappingModalOpenRef.current || !mappingMessageRef.current.trim()) return;
    scheduleEffectUpdate(() => dismissMappingMessage());
  }, [
    productColumn,
    salesColumn,
    regionColumn,
    customerColumn,
    profitColumn,
    dateColumn,
    dismissMappingMessage,
  ]);

  const [mappingConfirmedByUser, setMappingConfirmedByUser] = useState(false);
  const [mappingMetadata, setMappingMetadata] = useState<MappingMetadata | null>(
    null
  );
  const [exportOptions, setExportOptions] = useState<ExportOptions>({
    pdfMode: "executive",
    includeKPIs: true,
    includeAIInsight: true,
    includeChart: true,
    includeDataPreview: false,
    includeDataQuality: true,
    includeConversationContext: false,
    includeTechnicalAppendix: false,
  });
  const [reportBranding, setReportBranding] = useState<ReportBranding>(() =>
    loadReportBranding()
  );
  const [suggestedQuestions, setSuggestedQuestions] = useState<string[]>([]);
  const [conversationSnapshot, setConversationSnapshot] =
    useState<ConversationSnapshot | null>(null);
  const [lastConversationMeta, setLastConversationMeta] =
    useState<ConversationMeta | null>(null);
  const [aiConversationState, setAiConversationState] =
    useState<AiConversationState>(() => emptyAiConversationState());
  const [questionHistory, setQuestionHistory] = useState<string[]>([]);
  /** True when the last /ask returned a chart payload (hydrated visualization). */
  const [lastAskVisualizationHydrated, setLastAskVisualizationHydrated] =
    useState(false);

  const [dashboardFilters, setDashboardFilters] = useState<
    DashboardFilterEntry[]
  >([]);
  const [dashDateStart, setDashDateStart] = useState("");
  const [dashDateEnd, setDashDateEnd] = useState("");
  const [dimensionOptions, setDimensionOptions] =
    useState<DashboardDimensionOptions>({});
  const [filterBreadcrumb, setFilterBreadcrumb] = useState("");
  const [dashboardEmpty, setDashboardEmpty] = useState(false);

  const dateColumnForDashboard = dimensionOptions.date?.column ?? "";

  const upsertExplorerFilter = useCallback(
    (column: string, label: string, value: string | null) => {
      const c = column.trim();
      if (!c) return;
      const v = value?.trim() ?? "";
      setDashboardFilters((prev) => {
        const rest = prev.filter((f) => f.column !== c);
        if (!v) return rest;
        return [...rest, { column: c, label: label.trim() || c, value: v }];
      });
    },
    []
  );

  const removeExplorerFilter = useCallback((column: string) => {
    const c = column.trim();
    if (!c) return;
    setDashboardFilters((prev) => prev.filter((f) => f.column !== c));
  }, []);

  const clearExplorerFilters = useCallback(() => {
    setDashboardFilters([]);
    setDashDateStart("");
    setDashDateEnd("");
  }, []);

  useEffect(() => {
    if (!insightChartId) return;
    scheduleEffectUpdate(() => {
      setAiConversationState((prev) =>
        prev.lastInsightChartId === insightChartId
          ? prev
          : { ...prev, lastInsightChartId: insightChartId }
      );
    });
  }, [insightChartId]);

  const onAutoDashboardDrill = useCallback(
    (ev: { column: string; label: string; value: string }) => {
      upsertExplorerFilter(ev.column, ev.label, ev.value);
    },
    [upsertExplorerFilter]
  );

  const insightChartDrill = useCallback(
    (primaryValue: string, secondaryRaw?: string) => {
      const iv = visualization?.interaction?.drillDimensions;
      if (!iv?.length || !primaryValue.trim()) return;
      const pri = iv.find((d) => d.role === "primary") ?? iv[0];
      upsertExplorerFilter(pri.column, pri.label, primaryValue);
      const sec = iv.find((d) => d.role === "secondary");
      const secVal = secondaryRaw?.trim();
      if (sec && secVal)
        upsertExplorerFilter(sec.column, sec.label, secVal);
    },
    [upsertExplorerFilter, visualization?.interaction]
  );

  useEffect(() => {
    if (columns.length === 0) return;
    if (skipFilteredDashboardOnceRef.current) {
      skipFilteredDashboardOnceRef.current = false;
      return;
    }
    const controller = new AbortController();
    const t = window.setTimeout(() => {
      const datePayload =
        dateColumnForDashboard &&
        (dashDateStart.trim() || dashDateEnd.trim())
          ? {
              column: dateColumnForDashboard,
              ...(dashDateStart.trim()
                ? { start: dashDateStart.trim() }
                : {}),
              ...(dashDateEnd.trim() ? { end: dashDateEnd.trim() } : {}),
            }
          : null;
      void (async () => {
        try {
          const res = await fetch(apiUrl("/filtered-dashboard"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal: controller.signal,
            body: JSON.stringify({
              dashboard_filters: dashboardFilters,
              date_range: datePayload,
            }),
          });
          if (!res.ok) return;
          const data = (await res.json()) as Record<string, unknown>;
          setDashboardEmpty(Boolean(data.empty));
          setFilterBreadcrumb(
            typeof data.filter_breadcrumb === "string"
              ? data.filter_breadcrumb
              : ""
          );
          if (data.dimension_options && typeof data.dimension_options === "object") {
            setDimensionOptions(
              data.dimension_options as DashboardDimensionOptions
            );
          }
          setRows(
            typeof data.rows === "number" && Number.isFinite(data.rows)
              ? data.rows
              : 0
          );
          setKpis((data.kpis as KPIs | null) ?? null);
          const dkUpload = coerceDatasetKind(data.dataset_kind);
          setDatasetKind(dkUpload);
          const mapUp = (data.column_mapping || {}) as Record<
            string,
            string | undefined
          >;
          setKpiCards(
            normalizeKpiCardsFromApi(data.kpi_cards, dkUpload, {
              salesColumn: mapUp.sales_column ?? mapUp.salesColumn,
              productColumn: mapUp.product_column ?? mapUp.productColumn,
            })
          );
          setAutoDashboard(parseAutoDashboardPayload(data.auto_dashboard));
          if (data.profile && typeof data.profile === "object") {
            setProfile(data.profile as DatasetProfile);
          }
          if (Array.isArray(data.suggested_questions)) {
            const sq = data.suggested_questions as unknown[];
            const dk =
              typeof data.dataset_kind === "string" ? data.dataset_kind : "";
            setSuggestedQuestions(
              dedupeSuggestedQuestionsNear(
                dedupeSuggestedQuestions(
                  sq.length
                    ? sq.map((x) => String(x))
                    : clientFallbackSuggestedQuestions(dk)
                )
              )
            );
          }
        } catch (e) {
          if ((e as Error).name === "AbortError") return;
        }
      })();
    }, 280);
    return () => {
      window.clearTimeout(t);
      controller.abort();
    };
  }, [
    columns.length,
    dashboardFilters,
    dashDateStart,
    dashDateEnd,
    dateColumnForDashboard,
  ]);

  /** Keep overview / filtered-dashboard mini charts in the shared chart session (Charts tab, export). */
  useEffect(() => {
    if (columns.length === 0) {
      replaceAutoDashboardCharts([]);
      return;
    }
    replaceAutoDashboardCharts(autoDashboard?.charts ?? []);
  }, [
    autoDashboard,
    columns.length,
    chartDatasetEpoch,
    replaceAutoDashboardCharts,
  ]);

  const pinnedInsightChartIdRef = useRef<string | null>(null);
  const chartsPreviewRef = useRef<HTMLDivElement | null>(null);
  const chartsPlotWidth = useMeasuredElementWidth(
    chartsPreviewRef,
    activeTab === "charts"
  );
  const sessionChartViewportW = useMemo(() => {
    const measured = chartsPlotWidth > 0 ? chartsPlotWidth : viewportW;
    return Math.min(Math.max(measured, 320), MAIN_CHART_LAYOUT_CAP_PX);
  }, [chartsPlotWidth, viewportW]);
  const chartsSessionHeadingRef = useRef<HTMLDivElement | null>(null);
  const pendingChartsPreviewScrollRef = useRef(false);
  const pendingInsightAutoAskRef = useRef<string | null>(null);
  const askAIImplRef = useRef<(overrideQuestion?: string) => Promise<void>>(
    async () => {}
  );

  const applyInsightBundleToLiveState = useCallback(
    (
      bundle: ChartInsightAnswerBundle | null,
      opts?: { clearWhenMissing?: boolean }
    ) => {
      if (bundle) {
        setAnswer(bundle.answer);
        setHasValidAIAnswer(bundle.hasValidAIAnswer);
        setLastAskedQuestion(bundle.lastAskedQuestion);
        setAlignedAnalysis(
          (bundle.alignedAnalysis as AlignedAnalysisContext | null) ?? null
        );
        return;
      }
      if (opts?.clearWhenMissing) {
        setAnswer("");
        setHasValidAIAnswer(false);
        setLastAskedQuestion("");
        setAlignedAnalysis(null);
      }
    },
    []
  );

  const saveInsightBundleForChart = useCallback(
    (
      chartId: string,
      bundle: Omit<ChartInsightAnswerBundle, "savedAt">
    ) => {
      setAiAnswerByChartId((prev) => ({
        ...prev,
        [chartId]: { ...bundle, savedAt: Date.now() },
      }));
    },
    []
  );

  const selectChartWithInsightState = useCallback(
    (
      id: string | null,
      opts?: { restoreFromStore?: boolean; clearAnswerWhenMissing?: boolean }
    ) => {
      selectChart(id);
      pinnedInsightChartIdRef.current = id;
      const restore = opts?.restoreFromStore !== false;
      if (!id || !restore) return;
      const bundle = getChartInsightAnswer(aiAnswerByChartId, id);
      if (bundle) {
        applyInsightBundleToLiveState(bundle);
        if (bundle.lastAskedQuestion.trim()) {
          setQuestion(bundle.lastAskedQuestion);
        }
        return;
      }
      if (opts?.clearAnswerWhenMissing) {
        applyInsightBundleToLiveState(null, { clearWhenMissing: true });
      }
    },
    [selectChart, aiAnswerByChartId, applyInsightBundleToLiveState]
  );

  useLayoutEffect(() => {
    if (activeTab !== "charts" || !pendingChartsPreviewScrollRef.current) {
      return;
    }
    pendingChartsPreviewScrollRef.current = false;
    const scrollToChart = () => {
      const target = chartsSessionHeadingRef.current ?? chartsPreviewRef.current;
      target?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    };
    requestAnimationFrame(() => {
      requestAnimationFrame(scrollToChart);
    });
  }, [activeTab, activeChartId]);

  useEffect(() => {
    const q = pendingInsightAutoAskRef.current;
    if (activeTab !== "insights" || !q?.trim() || loading) return;
    const chartId = pinnedInsightChartIdRef.current ?? insightChartId;
    const stored = getChartInsightAnswer(aiAnswerByChartId, chartId);
    if (stored?.hasValidAIAnswer && stored.answer.trim()) {
      pendingInsightAutoAskRef.current = null;
      return;
    }
    pendingInsightAutoAskRef.current = null;
    void askAIImplRef.current(q);
  }, [activeTab, loading, insightChartId, aiAnswerByChartId]);

  const openDashboardChartInChartsTab = useCallback(
    (snapshotId: string) => {
      const hit = chartHistory.find((h) => h.id === snapshotId);
      if (hit) {
        pinnedInsightChartIdRef.current = hit.id;
        selectChartWithInsightState(hit.id, {
          restoreFromStore: true,
          clearAnswerWhenMissing: true,
        });
        pendingChartsPreviewScrollRef.current = true;
        setActiveTab("charts");
      }
    },
    [chartHistory, selectChartWithInsightState]
  );

  const dashboardSnapshotByKey = useMemo(() => {
    const m = new Map<string, ChartSnapshot>();
    for (const h of chartHistory) {
      if (h.source === "auto_dashboard" && h.dashboardChartKey) {
        m.set(h.dashboardChartKey, h);
      }
    }
    return m;
  }, [chartHistory]);

  const formatBytes = (bytes: number) => {
    if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
    const units = ["B", "KB", "MB", "GB"];
    const idx = Math.min(
      units.length - 1,
      Math.floor(Math.log(bytes) / Math.log(1024))
    );
    const value = bytes / Math.pow(1024, idx);
    return `${value.toFixed(value >= 10 || idx === 0 ? 0 : 1)} ${units[idx]}`;
  };

  const downloadChartPng = useCallback(async () => {
    if (chartData.length === 0) {
      setError("Chart is not available to download.");
      return;
    }

    const spec = buildPresentationExportSpec(sessionChartKindRef.current, {
      categoryCount: chartData.length,
    });
    try {
      setError("");
      setExportingChartsTabPng(true);
      setChartsTabOffscreenLayout(spec);
      const { runChartPngExport } = await import("@/lib/chart-png-export-session");
      await runChartPngExport({
        getExportRoot: () => chartsTabOffscreenExportRef.current,
        kind: sessionChartKindRef.current,
        categoryCount: chartData.length,
        filename: sanitizeChartExportFilename(chartTitle || "chart"),
        datasetName: uploadMeta?.name,
      });
    } catch (err) {
      console.error("Chart PNG download failed:", err);
      setError("Unable to download chart image.");
    } finally {
      setChartsTabOffscreenLayout(null);
      setExportingChartsTabPng(false);
    }
  }, [chartTitle, chartData.length, uploadMeta?.name]);

  const setQuestionAndResetInsightState = useCallback(
    (value: string) => {
      setQuestion(value);
      const stored = getChartInsightAnswer(aiAnswerByChartId, insightChartId);
      if (
        stored &&
        value.trim() === stored.lastAskedQuestion.trim()
      ) {
        applyInsightBundleToLiveState(stored);
        return;
      }
      const nextQ = value.trim();
      const snapQ = (insightSnapshot?.question ?? lastAskedQuestion).trim();
      if (nextQ !== lastAskedQuestion.trim() || (snapQ && nextQ !== snapQ)) {
        setHasValidAIAnswer(false);
        setAlignedAnalysis(null);
        setLastAskVisualizationHydrated(false);
        pinnedInsightChartIdRef.current = null;
        clearInsightThread();
      }
    },
    [
      lastAskedQuestion,
      insightChartId,
      insightSnapshot?.question,
      aiAnswerByChartId,
      applyInsightBundleToLiveState,
      clearInsightThread,
    ]
  );

  const buildOverviewChartAskQuestion = useCallback((hit: ChartSnapshot) => {
    const exportTitle = getCanonicalChartTitle({
      rawTitle: hit.title,
      chartType: hit.chartKind,
      contract: hit.contract ?? null,
      labels: hit.chartData.map((r) => String(r.name ?? "")),
      values: hit.chartData.map((r) => r.value),
      aggregationKey: hit.contract?.aggregation ?? "sum",
    });
    return `Summarize what the chart "${exportTitle}" shows and the sharpest takeaway for this dataset.`;
  }, []);

  const askAiAboutDashboardChart = useCallback(
    (snapshotId: string) => {
      const hit = chartHistory.find((h) => h.id === snapshotId);
      if (!hit) return;
      pinnedInsightChartIdRef.current = hit.id;
      const q = buildOverviewChartAskQuestion(hit);
      selectChartWithInsightState(hit.id, {
        restoreFromStore: true,
        clearAnswerWhenMissing: true,
      });
      setQuestion(q);

      const stored = getChartInsightAnswer(aiAnswerByChartId, hit.id);
      if (stored?.hasValidAIAnswer && stored.answer.trim()) {
        pendingInsightAutoAskRef.current = null;
        setActiveTab("insights");
        return;
      }

      pendingInsightAutoAskRef.current = q;
      setActiveTab("insights");
    },
    [
      chartHistory,
      selectChartWithInsightState,
      aiAnswerByChartId,
      buildOverviewChartAskQuestion,
    ]
  );

  const fetchPreviewRows = async (limit: number | "all") => {
    if (columns.length === 0) return;
    setPreviewLoading(true);
    try {
      const response = await fetch(apiUrl("/preview"), {
        method: "POST",
        headers: saasRequestHeaders({
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({
          row_limit: limit === "all" ? null : limit,
        }),
      });
      if (!response.ok) {
        const maybeJson = await response.json().catch(() => null);
        const detail = maybeJson?.detail;
        if (handleApiLimitDetail(detail)) {
          throw new Error(extractApiErrorMessage(detail));
        }
        throw new Error(extractApiErrorMessage(detail) || "Unable to fetch preview rows.");
      }
      const data = await response.json();
      setPreview(data.preview || []);
      setRows(data.rows || rows);
      applyPlanEnvelope(data.plan);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to fetch preview rows.");
    } finally {
      setPreviewLoading(false);
    }
  };

  const uploadFile = async (pickedFile?: File) => {
    const targetFile = pickedFile ?? file;
    if (!targetFile) {
      setError("Please choose a supported dataset file first.");
      return;
    }

    setError("");
    dismissMappingMessage();
    setUploadMessage("");
    setAnswer("");
    setHasValidAIAnswer(false);
    setLastAskedQuestion("");
    setLastAskVisualizationHydrated(false);
    setAiAnswerByChartId({});
    invalidateForDatasetChange();
    setConversationSnapshot(null);
    setLastConversationMeta(null);
    setAiConversationState(emptyAiConversationState());
    clearInsightThread();
    setQuestionHistory([]);
    setKpis(null);
    setKpiCards([]);
    setAlignedAnalysis(null);
    setDatasetKind("");
    setAutoDashboard(null);
    setDashboardFilters([]);
    setDashDateStart("");
    setDashDateEnd("");
    setDimensionOptions({});
    setFilterBreadcrumb("");
    setDashboardEmpty(false);
    setUploadMeta(null);
    setProfile(null);
    setMappingConfirmedByUser(false);
    setMappingModalOpen(false);
    setMappingMetadata(null);
    setLoading(true);

    try {
      const tier = getPlanTier();
      if (!isFileWithinPlanLimit(tier, targetFile.size)) {
        const msg = fileSizeLimitMessage(tier, targetFile.size);
        openUpgradeModal("file_size", msg);
        throw new Error(msg);
      }

      const formData = new FormData();
      formData.append("file", targetFile);

      const response = await fetch(apiUrl("/upload"), {
        method: "POST",
        headers: saasRequestHeaders(),
        body: formData,
      });

      if (!response.ok) {
        const maybeJson = await response.json().catch(() => null);
        const detail =
          maybeJson &&
          typeof maybeJson === "object" &&
          "detail" in maybeJson
            ? (maybeJson as { detail: unknown }).detail
            : null;
        if (handleApiLimitDetail(detail)) {
          throw new Error(extractApiErrorMessage(detail));
        }
        const message = extractApiErrorMessage(detail) || "Upload failed";
        throw new Error(message);
      }

      const data = await response.json();
      applyPlanEnvelope(data.plan);

      setUploadMeta(data.file || null);
      setProfile(data.profile || null);
      setColumns(data.columns || []);
      setRows(data.rows || 0);
      setPreview((data.preview || []).slice(0, 10));
      setPreviewRowLimit(10);
      setKpis(data.kpis || null);
      const dkUploadMain = coerceDatasetKind(data.dataset_kind);
      setDatasetKind(dkUploadMain);
      const mapping = data.column_mapping || {};
      setKpiCards(
        normalizeKpiCardsFromApi(data.kpi_cards, dkUploadMain, {
          salesColumn: mapping.sales_column || mapping.salesColumn,
          productColumn: mapping.product_column || mapping.productColumn,
        })
      );
      skipFilteredDashboardOnceRef.current = true;
      setAutoDashboard(parseAutoDashboardPayload(data.auto_dashboard));
      setSelectedSheet(data.selected_sheet || "");
      setSheets(data.sheets || []);
      setSuggestedQuestions(
        dedupeSuggestedQuestionsNear(
          dedupeSuggestedQuestions(
            data.suggested_questions?.length
              ? (data.suggested_questions as string[])
              : clientFallbackSuggestedQuestions(data.dataset_kind || "")
          )
        )
      );
      setProductColumn(mapping.product_column || "");
      setSalesColumn(mapping.sales_column || "");
      setRegionColumn(mapping.region_column || "");
      setCustomerColumn(mapping.customer_column || "");
      setProfitColumn(mapping.profit_column || "");
      setDateColumn(mapping.date_column || "");
      setDimensionOptions(
        (data.dimension_options as DashboardDimensionOptions) || {}
      );
      setFilterBreadcrumb(
        typeof data.filter_breadcrumb === "string"
          ? data.filter_breadcrumb
          : ""
      );
      setDashboardEmpty(Boolean(data.empty));
      if (data.mapping_metadata && typeof data.mapping_metadata === "object") {
        setMappingMetadata(data.mapping_metadata as MappingMetadata);
      } else {
        setMappingMetadata(null);
      }

      setUploadMessage(
        `File uploaded successfully • ${data.rows} rows • ${data.columns.length} columns`
      );
      setOverviewUploadExpanded(false);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unable to upload file.";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const _selectSheet = async (sheetName: string) => {
    setError("");
    dismissMappingMessage();
    setAnswer("");
    setHasValidAIAnswer(false);
    setLastAskedQuestion("");
    setLastAskVisualizationHydrated(false);
    setAiAnswerByChartId({});
    invalidateForDatasetChange();
    setConversationSnapshot(null);
    setLastConversationMeta(null);
    setAiConversationState(emptyAiConversationState());
    clearInsightThread();
    setQuestionHistory([]);
    setDashboardFilters([]);
    setDashDateStart("");
    setDashDateEnd("");
    setDimensionOptions({});
    setFilterBreadcrumb("");
    setDashboardEmpty(false);
    setMappingMetadata(null);
    setLoading(true);

    try {
      const response = await fetch(apiUrl("/select-sheet"), {
        method: "POST",
        headers: saasRequestHeaders({
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({
          sheet_name: sheetName,
        }),
      });

      if (!response.ok) {
        const maybeJson = await response.json().catch(() => null);
        const detail = maybeJson?.detail;
        if (handleApiLimitDetail(detail)) {
          throw new Error(extractApiErrorMessage(detail));
        }
        throw new Error(extractApiErrorMessage(detail) || "Sheet selection failed");
      }

      const data = await response.json();
      applyPlanEnvelope(data.plan);

      setUploadMeta(data.file || uploadMeta || null);
      setProfile(data.profile || null);
      setColumns(data.columns || []);
      setRows(data.rows || 0);
      setPreview((data.preview || []).slice(0, 10));
      setPreviewRowLimit(10);
      setKpis(data.kpis || null);
      const dkUploadMain = coerceDatasetKind(data.dataset_kind);
      setDatasetKind(dkUploadMain);
      const mapping = data.column_mapping || {};
      setKpiCards(
        normalizeKpiCardsFromApi(data.kpi_cards, dkUploadMain, {
          salesColumn: mapping.sales_column || mapping.salesColumn,
          productColumn: mapping.product_column || mapping.productColumn,
        })
      );
      skipFilteredDashboardOnceRef.current = true;
      setAutoDashboard(parseAutoDashboardPayload(data.auto_dashboard));
      setSelectedSheet(data.selected_sheet || "");
      setSheets(data.sheets || []);
      setSuggestedQuestions(
        dedupeSuggestedQuestionsNear(
          dedupeSuggestedQuestions(
            data.suggested_questions?.length
              ? (data.suggested_questions as string[])
              : clientFallbackSuggestedQuestions(data.dataset_kind || "")
          )
        )
      );
      setProductColumn(mapping.product_column || "");
      setSalesColumn(mapping.sales_column || "");
      setRegionColumn(mapping.region_column || "");
      setCustomerColumn(mapping.customer_column || "");
      setProfitColumn(mapping.profit_column || "");
      setDateColumn(mapping.date_column || "");
      setMappingConfirmedByUser(false);
      setDimensionOptions(
        (data.dimension_options as DashboardDimensionOptions) || {}
      );
      setFilterBreadcrumb(
        typeof data.filter_breadcrumb === "string"
          ? data.filter_breadcrumb
          : ""
      );
      setDashboardEmpty(Boolean(data.empty));
      if (data.mapping_metadata && typeof data.mapping_metadata === "object") {
        setMappingMetadata(data.mapping_metadata as MappingMetadata);
      } else {
        setMappingMetadata(null);
      }

      setUploadMessage(
        `Sheet changed successfully • ${data.rows} rows • ${data.columns.length} columns`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to select sheet.");
    } finally {
      setLoading(false);
    }
  };

  const assignOverviewPickedFile = useCallback(
    (next: File) => {
      if (loading) return;
      const tier = getPlanTier();
      const validation = validateOverviewUploadPick(next, tier);
      if (!validation.ok) {
        if (validation.reason === "file_too_large") {
          openUpgradeModal("file_size", validation.message);
        }
        setError(validation.message);
        return;
      }
      setError("");
      dismissMappingMessage();
      setFile(validation.file);
      if (shouldAutoUploadAfterPick(validation, loading)) {
        void uploadFile(validation.file);
      }
    },
    [dismissMappingMessage, loading, openUpgradeModal]
  );

  const openOverviewReplaceUpload = useCallback(() => {
    dismissMappingMessage();
    startTabTransition(() => setActiveTab("overview"));
    setOverviewUploadExpanded(true);
    setFile(null);
    setOverviewDropActive(false);
    if (overviewFileInputRef.current) {
      overviewFileInputRef.current.value = "";
    }
  }, [dismissMappingMessage, startTabTransition]);

  const cancelOverviewReplaceUpload = useCallback(() => {
    setOverviewUploadExpanded(false);
    setFile(null);
    setOverviewDropActive(false);
    if (overviewFileInputRef.current) {
      overviewFileInputRef.current.value = "";
    }
  }, []);

  const resetAiConversation = useCallback(() => {
    setQuestion("");
    setConversationSnapshot(null);
    setLastConversationMeta(null);
    setAiConversationState(emptyAiConversationState());
    setAnswer("");
    setHasValidAIAnswer(false);
    setLastAskedQuestion("");
    setQuestionHistory([]);
    setAlignedAnalysis(null);
    setLastAskVisualizationHydrated(false);
    setHowCalculatedOpen(false);
    setAiAnswerByChartId({});
    clearAiInsightSession();
  }, [clearAiInsightSession]);

  const canAskAi = useMemo(
    () => Boolean(question.trim()) && !loading && columns.length > 0,
    [question, loading, columns.length]
  );

  const hasActiveAiConversation = useMemo(() => {
    if (
      hasValidAIAnswer ||
      answer.trim() ||
      lastAskedQuestion.trim() ||
      question.trim()
    ) {
      return true;
    }
    if (questionHistory.length > 0) return true;
    if (conversationSnapshot?.lastQuestion?.trim()) return true;
    if (aiConversationState.followUpChain.length > 0) return true;
    if (aiConversationState.lastQuestion.trim()) return true;
    return Object.values(aiAnswerByChartId).some(
      (stored) => stored?.hasValidAIAnswer && stored.answer.trim()
    );
  }, [
    hasValidAIAnswer,
    answer,
    lastAskedQuestion,
    question,
    questionHistory,
    conversationSnapshot,
    aiConversationState.followUpChain,
    aiConversationState.lastQuestion,
    aiAnswerByChartId,
  ]);

  const askAI = async (
    overrideQuestion?: string,
    opts?: { fromFollowUpChip?: boolean }
  ) => {
    const qRaw = (overrideQuestion ?? question).trim();
    if (!qRaw) {
      setError("Please enter a question.");
      return;
    }
    if (overrideQuestion != null && overrideQuestion.trim()) {
      setQuestion(overrideQuestion.trim());
    }

    const aiRemaining = planUsage?.usage.ai_questions_remaining;
    if (!canAskAiQuestion(planTier, aiRemaining)) {
      const limits = getPlanLimits(planTier);
      const msg =
        planTier === "free"
          ? `You've reached today's limit of ${limits.ai_questions_limit} AI questions. Upgrade to Paid for 300 questions per month.`
          : `You've reached this month's limit of ${limits.ai_questions_limit} AI questions.`;
      openUpgradeModal("ai_questions", msg);
      setError(msg);
      return;
    }

    const parentAnalysisContext = buildParentAnalysisContext({
      conversationSnapshot,
      alignedAnalysis,
      lastAskedQuestion,
      answer,
      aiConversationState,
    });
    const continuationIntent = shouldSendFollowUpContinuation(
      parentAnalysisContext,
      {
        fromFollowUpChip: opts?.fromFollowUpChip,
        manualSubmit: Boolean(
          parentAnalysisContext?.priorQuestion?.trim() &&
            (conversationSnapshot?.lastQuestion?.trim() ||
              aiConversationState.lastQuestion.trim() ||
              hasValidAIAnswer)
        ),
      }
    );

    setError("");
    setAnswer("");
    setHasValidAIAnswer(false);
    setLastAskVisualizationHydrated(false);
    setLastAskedQuestion(qRaw);
    setHowCalculatedOpen(false);
    setAlignedAnalysis(null);
    setLoading(true);

    let lineageParentChartId = insightChartId;
    if (insightSnapshot?.source === "ai" && !continuationIntent) {
      const snapQ = normalizeQuestionForMatch(
        insightSnapshot.question ?? lastAskedQuestion
      );
      const newQ = normalizeQuestionForMatch(qRaw);
      if (snapQ && newQ && snapQ !== newQ) {
        pinnedInsightChartIdRef.current = null;
        clearInsightThread();
        lineageParentChartId = null;
      }
    }

    try {
      const chartHistorySnapshot = chartHistory;
      const activeSnapshotSnapshot = activeSnapshot;
      const askPinnedSnapshot = lineageParentChartId
        ? chartHistorySnapshot.find((h) => h.id === lineageParentChartId)
        : null;

      const dcAsk = dimensionOptions.date?.column ?? "";
      const dateAskPayload =
        dcAsk && (dashDateStart.trim() || dashDateEnd.trim())
          ? {
              column: dcAsk,
              ...(dashDateStart.trim()
                ? { start: dashDateStart.trim() }
                : {}),
              ...(dashDateEnd.trim() ? { end: dashDateEnd.trim() } : {}),
            }
          : null;

      const drillLines =
        filterBreadcrumb.trim().length > 0
          ? filterBreadcrumb
              .split(/\s*(?:›|\u203a|->)\s*/)
              .map((s) => s.trim())
              .filter(Boolean)
          : [];

      const dashboardFilterLines = dashboardFilters
        .map((f) => {
          const lab = f.label.trim() || f.column.trim();
          const val = f.value.trim();
          return lab && val ? `${lab}: ${val}` : "";
        })
        .filter(Boolean);

      const conversationPayload =
        conversationSnapshot &&
        ({
          ...conversationSnapshot,
          rootQuestion:
            conversationSnapshot.rootQuestion ??
            parentAnalysisContext?.rootQuestion ??
            conversationSnapshot.lastQuestion,
          metricColumn:
            conversationSnapshot.metricColumn ??
            parentAnalysisContext?.metricColumn ??
            undefined,
          categoryColumn:
            conversationSnapshot.categoryColumn ??
            parentAnalysisContext?.categoryColumn ??
            undefined,
          lastInsightChartId:
            insightChartId ?? conversationSnapshot.lastInsightChartId ?? undefined,
          activeDrillPath:
            drillLines.length > 0
              ? drillLines
              : conversationSnapshot.activeDrillPath ?? [],
          activeDashboardFilters: dashboardFilterLines,
        } as ConversationSnapshot);

      const response = await fetch(apiUrl("/ask"), {
        method: "POST",
        headers: saasRequestHeaders({
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({
          question: qRaw,
          conversation_context: conversationPayload,
          parent_analysis_context: parentAnalysisContext
            ? {
                rootQuestion: parentAnalysisContext.rootQuestion,
                priorQuestion: parentAnalysisContext.priorQuestion,
                metricColumn: parentAnalysisContext.metricColumn,
                categoryColumn: parentAnalysisContext.categoryColumn,
                metricColumnDisplay: parentAnalysisContext.metricColumnDisplay,
                categoryColumnDisplay:
                  parentAnalysisContext.categoryColumnDisplay,
                aggregation: parentAnalysisContext.aggregation,
                chartType: parentAnalysisContext.chartType,
                chartTitle: parentAnalysisContext.chartTitle,
                intentBucket: parentAnalysisContext.intentBucket,
                routingIntent: parentAnalysisContext.routingIntent,
                followUpChain: parentAnalysisContext.followUpChain,
                lastAiAnswer: parentAnalysisContext.lastAiAnswer,
                turnId: parentAnalysisContext.turnId,
              }
            : null,
          continuation_intent: continuationIntent,
          dashboard_filters: dashboardFilters,
          date_range: dateAskPayload,
        }),
      });

      if (!response.ok) {
        let detail: unknown = `AI request failed (${response.status})`;
        try {
          const errBody = (await response.json()) as { detail?: unknown };
          detail = errBody.detail ?? detail;
        } catch {
          /* ignore parse errors */
        }
        if (handleApiLimitDetail(detail)) {
          throw new Error(extractApiErrorMessage(detail));
        }
        throw new Error(extractApiErrorMessage(detail));
      }

      const data = await response.json();
      if (data.plan && typeof data.plan === "object") {
        applyPlanEnvelope(data.plan as PlanUsageResponse);
      } else {
        fetchPlanUsage()
          .then((payload) => setPlanUsage(payload))
          .catch(() => {});
      }

      if (typeof data.filter_breadcrumb === "string") {
        setFilterBreadcrumb(data.filter_breadcrumb);
      }

      const cleanedAnswer = String(data.answer || "")
        .replace(/#/g, "")
        .replace(/\*\*/g, "");

      const nextSnap = parseConversationSnapshot(data.conversation_context);
      const meta = parseConversationMeta(data.conversation_meta);
      setLastConversationMeta(meta);

      const qTrim = qRaw;
      if (qTrim) {
        setQuestionHistory((prev) => {
          const merged = [qTrim, ...prev.filter((x) => x !== qTrim)];
          return merged.slice(0, 3);
        });
      }

      const hydrated = hydrateVisualizationFromApi(data.visualization);
      const parsedAnalysis = parseAlignedAnalysis(data.analysis);
      logAnalysisIntentToConsole(qRaw, parsedAnalysis?.analysisIntent);
      const followUpDetected = Boolean(meta?.followUpDetected);
      const preservePinnedChart = Boolean(
        askPinnedSnapshot &&
          askPinnedSnapshot.chartData.length > 0 &&
          lineageParentChartId &&
          askPinnedSnapshot.id === lineageParentChartId &&
          shouldPreservePinnedInsightChart({
            pinned: askPinnedSnapshot,
            question: qRaw,
            parsed: parsedAnalysis,
            followUpDetected,
          })
      );
      const pinnedContract = askPinnedSnapshot?.contract ?? null;
      const narrativeForPinned =
        preservePinnedChart && pinnedContract
          ? narrativeCopyForContract(pinnedContract)
          : null;

      let answerForBundle = cleanedAnswer;
      let validForBundle = Boolean(cleanedAnswer.trim());
      let analysisForBundle: AlignedAnalysisContext | null = parsedAnalysis;

      if (preservePinnedChart && pinnedContract) {
        const sanitizedAnswer = sanitizeNarrativeForTrendContract(
          cleanedAnswer,
          pinnedContract
        );
        answerForBundle = sanitizedAnswer;
        validForBundle = Boolean(sanitizedAnswer.trim());
        analysisForBundle = parsedAnalysis
          ? {
              ...parsedAnalysis,
              chartTitle: pinnedContract.displayTitle,
              categoryColumn: null,
              categoryColumnDisplay: pinnedContract.timeBucketLabel,
              chartTypeInternal: pinnedContract.chartType,
              insightSummary: sanitizeNarrativeForTrendContract(
                parsedAnalysis.insightSummary?.trim() ||
                  narrativeForPinned ||
                  cleanedAnswer,
                pinnedContract
              ),
            }
          : parsedAnalysis;
      }

      setAnswer(answerForBundle);
      setHasValidAIAnswer(validForBundle);
      setAlignedAnalysis(analysisForBundle);
      setLastAskVisualizationHydrated(
        preservePinnedChart ? true : Boolean(hydrated)
      );

      if (nextSnap) {
        setConversationSnapshot(
          enrichConversationSnapshotForNextTurn(nextSnap, {
            cleanedAnswer,
            hydrated,
            datasetKind,
            productColumn,
            salesColumn,
            regionColumn,
            customerColumn,
            profitColumn,
            dateColumn,
            dashboardFilters,
          })
        );
        const frame =
          parsedAnalysis?.insightSummary?.trim() ||
          cleanedAnswer.replace(/\s+/g, " ").slice(0, 360).trim() ||
          null;
        setAiConversationState({
          lastQuestion: nextSnap.lastQuestion,
          lastMetric: nextSnap.metricColumn,
          lastDimension: nextSnap.categoryColumn,
          lastChartType: nextSnap.chartType,
          activeFilters: [...(nextSnap.filtersApplied ?? [])],
          activeDrillPath:
            nextSnap.activeDrillPath && nextSnap.activeDrillPath.length > 0
              ? nextSnap.activeDrillPath
              : drillLines,
          lastResultFrame: frame,
          lastInsightChartId: null,
          turnId: nextSnap.turnId ?? null,
          parentTurnId: meta?.parentTurnId ?? null,
          followUpChain: nextSnap.followUpChain ?? [],
        });
      }

      const turnForChart = nextSnap?.turnId ?? meta?.turnId;
      const parentTurnForChart = meta?.parentTurnId ?? undefined;

      const originChartRefSnapshot = resolveOriginChartRefSnapshot({
        question: qRaw,
        insightChartId: lineageParentChartId,
        chartHistory: chartHistorySnapshot,
        activeSnapshot: activeSnapshotSnapshot,
      });

      let chartKindForIntent = (parsedAnalysis?.chartTypeInternal ??
        "bar") as ChartKind;

      if (hydrated) {
        const titleFromApi =
          parsedAnalysis?.chartTitle?.trim() || hydrated.persisted.title;
        const apiKindFromViz = apiChartStringToKind(
          hydrated.persisted.chartType
        );
        if (apiKindFromViz === "scatter") {
          chartKindForIntent = "scatter";
        }
        const inferred = computeFinalChartPresentation({
          apiChartType: hydrated.persisted.chartType,
          title: titleFromApi,
          question: qRaw,
          rows: hydrated.chartData,
        });
        const lockOrigin =
          preservePinnedChart ||
          (originChartRefSnapshot &&
            chartSnapshotMatchesAnalysis(
              originChartRefSnapshot,
              parsedAnalysis
            ))
            ? originChartRefSnapshot
            : null;
        chartKindForIntent =
          apiKindFromViz === "scatter"
            ? "scatter"
            : applyOriginChartPresentationLock({
                inferred,
                hydratedKind: hydrated.chartKind,
                origin: lockOrigin,
              });
      }

      const semanticIntentKey =
        buildSemanticIntentKeyFromAsk({
          parsed: parsedAnalysis,
          snap: nextSnap,
          chartKind: chartKindForIntent,
          analysisContextKey: chartAnalysisContextKey,
        }) ?? undefined;

      let pushedInsightChartId: string | null = null;

      if (hydrated && !preservePinnedChart) {
        const titleFromApi =
          parsedAnalysis?.chartTitle?.trim() || hydrated.persisted.title;
        const prov = hydrated.persisted.provenance;
        const resolvedMetaRows = resolveAnalyzedRowsForChartMetadata({
          preferAlignedAnalysis: true,
          analysis: parsedAnalysis,
          prov: prov ?? null,
          vizAnalyzedRows: hydrated.persisted.analyzedRows,
          filteredDatasetRows: rows,
          fullDatasetRows: kpis?.total_rows ?? null,
        });
        const mergedProv =
          prov && typeof prov === "object"
            ? alignInsightProvenanceToPresentation(
                {
                  ...(prov as InsightProvenance),
                  ...(resolvedMetaRows != null
                    ? { rowsAnalyzed: resolvedMetaRows }
                    : {}),
                },
                chartKindForIntent,
                qRaw
              )
            : prov;
        const patchedPersisted = {
          ...hydrated.persisted,
          chartType: chartKindToApiChartType(chartKindForIntent),
          provenance: mergedProv,
          analyzedRows:
            resolvedMetaRows ?? hydrated.persisted.analyzedRows ?? undefined,
        };
        const finalPresentation = buildFinalChartPresentationMeta(
          chartKindForIntent,
          hydrated.chartData,
          prov && typeof prov === "object"
            ? {
                numericColumn: (prov as InsightProvenance).numericColumn,
                categoryColumn: (prov as InsightProvenance).categoryColumn,
                categoryColumnDisplay: (prov as InsightProvenance)
                  .categoryColumnDisplay,
                timeSeriesAnalysis: (prov as InsightProvenance).timeSeriesAnalysis,
                aggregation: (prov as InsightProvenance).aggregation,
              }
            : null
        );
        pushedInsightChartId = pushAIChart({
          title: titleFromApi,
          subtitle: hydrated.persisted.subtitle,
          chartKind: chartKindForIntent,
          chartData: hydrated.chartData,
          visualization: patchedPersisted,
          finalPresentation,
          question: qRaw,
          questionTurnId: turnForChart,
          parentTurnId: parentTurnForChart,
          derivedFromChartId: lineageParentChartId ?? undefined,
          analysisContextKey: chartAnalysisContextKey,
          semanticIntentKey,
        });
      } else if (
        !preservePinnedChart &&
        !hydrated &&
        !parsedAnalysis?.unsupportedTrendAnalysis?.active &&
        !parsedAnalysis?.unsupportedDeclineAnalysis?.active &&
        !parsedAnalysis?.unsupportedMultiMetricAnalysis?.active
      ) {
        pushedInsightChartId = pushAIChart({
          title: "No dedicated visualization for this answer",
          subtitle:
            "No chart specification was returned for this question. The narrative and KPI context still reflect the latest AI response.",
          chartKind: "",
          chartData: [],
          visualization: null,
          question: qRaw,
          questionTurnId: turnForChart,
          parentTurnId: parentTurnForChart,
          derivedFromChartId: lineageParentChartId ?? undefined,
          analysisContextKey: chartAnalysisContextKey,
          semanticIntentKey,
        });
      }

      if (preservePinnedChart && askPinnedSnapshot) {
        selectChart(askPinnedSnapshot.id);
        pinnedInsightChartIdRef.current = askPinnedSnapshot.id;
        pushedInsightChartId = askPinnedSnapshot.id;
      }

      const bundleChartId =
        pushedInsightChartId ?? lineageParentChartId ?? insightChartId;
      if (bundleChartId) {
        saveInsightBundleForChart(bundleChartId, {
          answer: answerForBundle,
          lastAskedQuestion: qRaw,
          hasValidAIAnswer: validForBundle,
          alignedAnalysis: analysisForBundle,
        });
      }
    } catch {
      setAlignedAnalysis(null);
      setHasValidAIAnswer(false);
      setError("Unable to get AI response. Please check backend/API key.");
    } finally {
      setLoading(false);
    }
  };
  askAIImplRef.current = askAI;

  const saveColumnMapping = async () => {
    if (columns.length === 0) {
      setError("Please upload a file before saving column mapping.");
      return;
    }

    setError("");
    dismissMappingMessage();

    try {
      const response = await fetch(apiUrl("/update-column-mapping"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          product_column: productColumn || null,
          sales_column: salesColumn || null,
          region_column: regionColumn || null,
          customer_column: customerColumn || null,
          profit_column: profitColumn || null,
          date_column: dateColumn || null,
        }),
      });

      if (!response.ok) {
        throw new Error("Column mapping save failed");
      }

      const data = await response.json();
      invalidateForDatasetChange();
      setAiAnswerByChartId({});
      setLastAskVisualizationHydrated(false);
      setKpis(data.kpis || null);
      const dkMap = coerceDatasetKind(data.dataset_kind);
      setDatasetKind(dkMap);
      setKpiCards(
        normalizeKpiCardsFromApi(data.kpi_cards, dkMap, {
          salesColumn: salesColumn || undefined,
          productColumn: productColumn || undefined,
        })
      );
      skipFilteredDashboardOnceRef.current = true;
      setAutoDashboard(parseAutoDashboardPayload(data.auto_dashboard));
      if (data.profile && typeof data.profile === "object") {
        setProfile(data.profile as DatasetProfile);
      }
      setDimensionOptions(
        (data.dimension_options as DashboardDimensionOptions) || {}
      );
      setFilterBreadcrumb(
        typeof data.filter_breadcrumb === "string"
          ? data.filter_breadcrumb
          : ""
      );
      if (data.mapping_metadata && typeof data.mapping_metadata === "object") {
        setMappingMetadata(data.mapping_metadata as MappingMetadata);
      }
      setSuggestedQuestions(
        dedupeSuggestedQuestionsNear(
          dedupeSuggestedQuestions(
            data.suggested_questions?.length
              ? (data.suggested_questions as string[])
              : clientFallbackSuggestedQuestions(data.dataset_kind || "")
          )
        )
      );

      const mapping = data.column_mapping || {};
      setProductColumn(mapping.product_column || "");
      setSalesColumn(mapping.sales_column || "");
      setRegionColumn(mapping.region_column || "");
      setCustomerColumn(mapping.customer_column || "");
      setProfitColumn(mapping.profit_column || "");
      setDateColumn(mapping.date_column || "");

      setMappingMessage("Column mapping saved successfully.");
      setMappingConfirmedByUser(true);
      setMappingModalOpen(false);
    } catch {
      setError("Unable to save column mapping.");
    }
  };

  const effectiveSales = inferSalesColumn(
    columns,
    profile,
    salesColumn,
    datasetKind
  );
  const effectiveDate = inferDateColumn(columns, profile, dateColumn);
  const effectiveProduct = inferProductColumn(columns, profile, productColumn);

  const displayKpiCards = useMemo(
    () =>
      normalizeKpiCardsFromApi(kpiCards, datasetKind, {
        salesColumn: effectiveSales ?? salesColumn,
        productColumn: effectiveProduct ?? productColumn,
      }),
    [
      kpiCards,
      datasetKind,
      effectiveSales,
      effectiveProduct,
      salesColumn,
      productColumn,
    ]
  );

  let mappingConfidence: "High" | "Medium" | "Low" = "Low";
  if (mappingConfirmedByUser) {
    mappingConfidence = "High";
  } else if (mappingMetadata?.roles) {
    const fromRoles = mappingConfidenceFromRoleMetadata(mappingMetadata.roles);
    mappingConfidence =
      fromRoles === "high" ? "High" : fromRoles === "medium" ? "Medium" : "Low";
  } else {
    const resolvedCount = [effectiveSales, effectiveDate, effectiveProduct].filter(
      Boolean
    ).length;
    mappingConfidence = resolvedCount >= 2 ? "Medium" : "Low";
  }

  const insightRelationshipBundle = useMemo((): {
    correlation: RelationshipCorrelationSnapshot;
    enriched: RelationshipInsightsPayload;
    scatterRows: { x?: number; value: number }[];
  } | null => {
    if (!insightVisualization || insightChartData.length < 2) return null;
    const isScatter =
      String(insightVisualization.chartType ?? "")
        .toLowerCase()
        .replace(/\s+/g, "") === "scatter" ||
      insightChartData.some(
        (r) => typeof r.x === "number" && Number.isFinite(r.x)
      );
    if (!isScatter) return null;

    const scatterRows = chartRowsToScatterPairs(insightChartData);
    const correlation = buildRelationshipCorrelationSnapshot({
      chartRows: scatterRows,
      apiPearson: (
        insightVisualization.relationshipInsights as
          | { pearson?: unknown }
          | null
          | undefined
      )?.pearson,
      logContext: lastAskedQuestion.trim() || undefined,
    });
    const meta =
      parseRelationshipInsights(
        insightVisualization.relationshipInsights
      ) ?? {
        strongestOutliers: [],
        qualitativeOnly: true,
      };
    const enriched: RelationshipInsightsPayload = {
      ...meta,
      pearson:
        meta.pearson != null
          ? meta.pearson
          : correlation.computed
            ? correlation.pearsonRounded
            : null,
      spearman: meta.spearman ?? null,
      qualitativeOnly:
        meta.qualitativeOnly ??
        (!correlation.computed && meta.pearson == null),
      sampleSize: meta.sampleSize ?? correlation.rowCount,
    };
    return { correlation, enriched, scatterRows };
  }, [
    insightVisualization,
    insightChartData,
    lastAskedQuestion,
  ]);

  const insightRelationshipEnriched = insightRelationshipBundle?.enriched ?? null;

  const insightCorrelationCaution = useMemo(
    () => resolveNearPerfectCorrelationCaution(insightRelationshipEnriched),
    [insightRelationshipEnriched]
  );

  const insightExecutiveSummaryMode = useMemo(
    () => isExecutiveSummaryLayoutMode(lastAskedQuestion),
    [lastAskedQuestion]
  );

  const insightUnifiedConfidence = useMemo(() => {
    if (!alignedAnalysis) return null;
    const prov = insightVisualization?.provenance;
    const ri = insightRelationshipEnriched;
    return computeUnifiedInsightConfidence({
      mappingConfidence,
      mappingConfirmedByUser,
      provenanceConfidence: prov?.confidence ?? null,
      insightConfidenceLevel: alignedAnalysis.insightConfidenceLevel,
      insightConfidenceScore: alignedAnalysis.insightConfidenceScore,
      insightConfidenceRationale: alignedAnalysis.insightConfidenceRationale,
      insightConfidenceReasons: alignedAnalysis.insightConfidenceReasons,
      analysisRowCount: alignedAnalysis.analysisRowCount,
      chartSeriesPointCount: alignedAnalysis.chartSeriesPointCount,
      alignmentRepaired: alignedAnalysis.alignmentRepaired,
      partialVisualizationWarning: alignedAnalysis.partialVisualizationWarning,
      intentStructured: prov?.flags?.intentStructured,
      hasMetricColumn: Boolean(alignedAnalysis.metricColumn),
      hasCategoryColumn: Boolean(alignedAnalysis.categoryColumn),
      aggregationKey:
        alignedAnalysis.aggregationKey ?? alignedAnalysis.aggregation,
      isTrendChart: isTrendMode(insightSnapshot?.contract),
      growthRequestUnsatisfied: Boolean(
        alignedAnalysis?.growthRequestUnsatisfied ||
          alignedAnalysis?.unsupportedGrowthAnalysis?.active
      ),
      trendRequestUnsatisfied: Boolean(
        alignedAnalysis?.trendRequestUnsatisfied ||
          alignedAnalysis?.unsupportedTrendAnalysis?.active
      ),
      declineRequestUnsatisfied: Boolean(
        alignedAnalysis?.declineRequestUnsatisfied ||
          alignedAnalysis?.unsupportedDeclineAnalysis?.active
      ),
      multiMetricRequestUnsatisfied: Boolean(
        alignedAnalysis?.multiMetricRequestUnsatisfied ||
          alignedAnalysis?.unsupportedMultiMetricAnalysis?.active
      ),
      relationshipScatter: alignedAnalysis.chartTypeInternal === "scatter",
      relationshipSampleSize: (() => {
        const n = Number(ri?.sampleSize);
        if (Number.isFinite(n) && n > 0) return n;
        const cp = alignedAnalysis.chartSeriesPointCount;
        return Number.isFinite(cp) && cp > 0 ? cp : null;
      })(),
      relationshipPearson:
        insightRelationshipBundle?.correlation.pearsonRounded ?? ri?.pearson ?? null,
      correlationQualitativeOnly: Boolean(
        ri?.qualitativeOnly &&
          !(
            ri?.pearson != null &&
            Number.isFinite(Number(ri.pearson))
          )
      ),
      forecastProjectionLow:
        alignedAnalysis.forecastGuardrails?.canForecast === false ||
        Boolean(alignedAnalysis.forecastGuardrails?.lacksTimeSeries),
      forecastCanForecast:
        alignedAnalysis.forecastGuardrails?.canForecast === true
          ? true
          : alignedAnalysis.forecastGuardrails?.canForecast === false
            ? false
            : null,
      chartTypeInternal: alignedAnalysis.chartTypeInternal,
      dimensionRedirectHandled: Boolean(
        alignedAnalysis?.dimensionRedirectHandled
      ),
      requestedDimensionMissing: Boolean(
        alignedAnalysis?.requestedDimensionMissing
      ),
      analysisKind:
        alignedAnalysis.chartTypeInternal === "scatter" ||
        insightVisualization?.chartType === "scatter"
          ? "relationship_scatter"
          : alignedAnalysis.dualMetricCompare
            ? "compare"
            : isTrendMode(insightSnapshot?.contract)
              ? "trend"
              : "aggregation",
    });
  }, [
    alignedAnalysis,
    insightSnapshot?.contract,
    insightVisualization?.provenance,
    insightRelationshipEnriched,
    insightRelationshipBundle,
    insightVisualization?.chartType,
    mappingConfidence,
    mappingConfirmedByUser,
  ]);

  const insightNarrativeTone = useMemo((): NarrativeTone => {
    if (!alignedAnalysis) return "balanced";
    const backendMap =
      alignedAnalysis.mappingConfidenceLevel?.trim().toLowerCase() || null;
    const mapForTone: InsightConfidenceLevel =
      backendMap === "high" || backendMap === "medium" || backendMap === "low"
        ? backendMap
        : mappingMetadata?.roles
          ? mappingConfidenceFromRoleMetadata(mappingMetadata.roles)
          : mappingConfidence === "High"
            ? "high"
            : mappingConfidence === "Medium"
              ? "medium"
              : "low";
    return resolveNarrativeTone({
      analysisRowCount: alignedAnalysis.analysisRowCount,
      chartSeriesPointCount: alignedAnalysis.chartSeriesPointCount,
      mappingConfidence: mapForTone,
      mappingConfirmedByUser,
      unifiedConfidenceLevel: insightUnifiedConfidence?.level,
    });
  }, [
    alignedAnalysis,
    insightUnifiedConfidence?.level,
    mappingConfirmedByUser,
    mappingMetadata?.roles,
    mappingConfidence,
  ]);

  const insightNarrativeDisclaimer = useMemo(() => {
    if (!alignedAnalysis) return null;
    return narrativeToneDisclaimer(insightNarrativeTone, {
      analysisRowCount: alignedAnalysis.analysisRowCount,
      chartSeriesPointCount: alignedAnalysis.chartSeriesPointCount,
      mappingConfidence:
        alignedAnalysis.mappingConfidenceLevel ??
        (mappingMetadata?.roles
          ? mappingConfidenceFromRoleMetadata(mappingMetadata.roles)
          : mappingConfidence),
      mappingConfirmedByUser,
      isTrendChart: isTrendMode(insightSnapshot?.contract),
      isUnsupportedGrowth: Boolean(
        alignedAnalysis?.growthRequestUnsatisfied ||
          alignedAnalysis?.unsupportedGrowthAnalysis?.active
      ),
      forecastGuardrails: alignedAnalysis.forecastGuardrails ?? null,
    });
  }, [
    alignedAnalysis,
    insightSnapshot?.contract,
    insightNarrativeTone,
    mappingConfirmedByUser,
    mappingMetadata?.roles,
    mappingConfidence,
  ]);

  const overviewAiSummaryBullets = useMemo(
    () =>
      columns.length > 0
        ? computeOverviewAiSummaryBullets({
            rows,
            columns,
            autoDashboard,
            profile,
            primaryMetricColumn: effectiveSales,
            groupingColumn: effectiveProduct,
            dateColumn: effectiveDate,
          })
        : [],
    [
      columns,
      rows,
      autoDashboard,
      profile,
      effectiveSales,
      effectiveProduct,
      effectiveDate,
    ]
  );

  const autoDashboardKpiRows = useMemo(() => {
    if (!autoDashboard?.cards?.length) return [];
    const cards = autoDashboard.cards.slice(0, 5);
    const charts = autoDashboard.charts ?? [];
    return cards.map((card, idx) => ({
      card,
      contextLine: buildAutoDashboardKpiContextLine({
        card,
        cardIndex: idx,
        totalCards: cards.length,
        charts,
        profile,
        primaryMetricColumn: effectiveSales,
        rows,
        columns,
        datasetKind: datasetKind || "",
      }),
    }));
  }, [autoDashboard, profile, effectiveSales, rows, columns, datasetKind]);

  const dataPreviewDerivationsActive =
    activeTab === "preview" || activeTab === "export";

  const dataPreviewColumnMapping = useMemo(
    () => ({
      product: productColumn || undefined,
      sales: salesColumn || undefined,
      region: regionColumn || undefined,
      customer: customerColumn || undefined,
      profit: profitColumn || undefined,
      date: dateColumn || undefined,
    }),
    [
      productColumn,
      salesColumn,
      regionColumn,
      customerColumn,
      profitColumn,
      dateColumn,
    ]
  );

  const previewColumnHeaderSecondaryMap = useMemo(() => {
    if (activeTab !== "preview" || columns.length === 0) {
      return new Map<string, ColumnQualityBadge | null>();
    }
    const m = new Map<string, ColumnQualityBadge | null>();
    for (const col of columns) {
      m.set(
        col,
        pickDataPreviewHeaderSecondaryBadge({
          col,
          profile,
          totalRows: rows,
          preview,
        })
      );
    }
    return m;
  }, [activeTab, columns, profile, rows, preview]);

  const dataPreviewQualityInsights = useMemo(
    () =>
      activeTab === "preview" && columns.length > 0
        ? buildDataPreviewQualityInsights({
            columns,
            profile,
            preview,
            totalRows: rows,
          })
        : [],
    [activeTab, columns, profile, preview, rows]
  );

  const dataPreviewSuggestedQuestions = useMemo(
    () =>
      activeTab === "preview" && columns.length > 0
        ? resolveDataPreviewSuggestedQuestions({
            apiSuggestions: suggestedQuestions,
            buildArgs: {
              columns,
              profile,
              datasetKind: datasetKind || "",
              primaryMetric: effectiveSales,
              primaryDate: effectiveDate,
              primaryBreakdown: effectiveProduct,
            },
          })
        : [],
    [
      activeTab,
      columns,
      profile,
      datasetKind,
      effectiveSales,
      effectiveDate,
      effectiveProduct,
      suggestedQuestions,
    ]
  );

  const deferredDataPreviewSearch = useDeferredValue(
    dataPreviewDerivationsActive
      ? dataPreviewSearchQuery.replace(/\s+/g, " ").trim()
      : ""
  );

  const dataPreviewFilteredRows = useMemo(() => {
    if (!dataPreviewDerivationsActive) return preview;
    const q = deferredDataPreviewSearch.toLowerCase();
    if (!q) return preview;
    return preview.filter((row) => previewRowMatchesSearch(row, columns, q));
  }, [
    dataPreviewDerivationsActive,
    preview,
    columns,
    deferredDataPreviewSearch,
  ]);

  const dataPreviewSortedRows = useMemo(
    () =>
      sortDataPreviewRows(
        dataPreviewFilteredRows,
        dataPreviewSort,
        profile?.column_types
      ),
    [dataPreviewFilteredRows, dataPreviewSort, profile?.column_types]
  );

  const dataPreviewPaginationActive = previewRowLimit !== "all";

  const dataPreviewFilteredCount = dataPreviewFilteredRows.length;

  const dataPreviewPageSize = useMemo(() => {
    if (!dataPreviewPaginationActive) {
      return Math.max(1, dataPreviewSortedRows.length);
    }
    return previewRowLimit;
  }, [
    dataPreviewPaginationActive,
    previewRowLimit,
    dataPreviewSortedRows.length,
  ]);

  const dataPreviewPageCount = useMemo(() => {
    if (!dataPreviewPaginationActive) return 1;
    return Math.max(1, Math.ceil(dataPreviewFilteredCount / dataPreviewPageSize));
  }, [
    dataPreviewPaginationActive,
    dataPreviewFilteredCount,
    dataPreviewPageSize,
  ]);

  const dataPreviewSortKey = dataPreviewSort
    ? `${dataPreviewSort.column}\u0000${dataPreviewSort.direction}`
    : "";

  const dataPreviewSafePageIndex = Math.min(
    dataPreviewPageIndex,
    Math.max(0, dataPreviewPageCount - 1)
  );

  const dataPreviewPageRows = useMemo(() => {
    if (activeTab !== "preview") return [];
    const start = dataPreviewSafePageIndex * dataPreviewPageSize;
    return dataPreviewSortedRows.slice(start, start + dataPreviewPageSize);
  }, [
    activeTab,
    dataPreviewSortedRows,
    dataPreviewSafePageIndex,
    dataPreviewPageSize,
  ]);

  const dataPreviewRangeStart =
    dataPreviewFilteredCount === 0
      ? 0
      : dataPreviewSafePageIndex * dataPreviewPageSize + 1;

  const dataPreviewRangeEnd =
    dataPreviewFilteredCount === 0
      ? 0
      : Math.min(
          (dataPreviewSafePageIndex + 1) * dataPreviewPageSize,
          dataPreviewFilteredCount
        );

  /** Reset to page 1 when sort, search, or rows-per-page changes. */
  useEffect(() => {
    scheduleEffectUpdate(() => setDataPreviewPageIndex(0));
  }, [deferredDataPreviewSearch, previewRowLimit, dataPreviewSortKey]);

  useEffect(() => {
    scheduleEffectUpdate(() => {
      setDataPreviewSearchQuery("");
      setDataPreviewSuggestionsExpanded(false);
      setDataPreviewPageIndex(0);
      setDataPreviewSort(null);
    });
  }, [selectedSheet, uploadMeta?.name]);

  useEffect(() => {
    scheduleEffectUpdate(() => setDataPreviewProfileOpen(null));
  }, [selectedSheet, uploadMeta?.name]);

  useEffect(() => {
    if (
      dataPreviewProfileOpen &&
      !columns.includes(dataPreviewProfileOpen.column)
    ) {
      scheduleEffectUpdate(() => setDataPreviewProfileOpen(null));
    }
    if (
      dataPreviewSelectedSchemaCol &&
      !columns.includes(dataPreviewSelectedSchemaCol)
    ) {
      scheduleEffectUpdate(() => setDataPreviewSelectedSchemaCol(null));
    }
  }, [columns, dataPreviewProfileOpen, dataPreviewSelectedSchemaCol]);

  useEffect(() => {
    if (!dataPreviewProfileOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDataPreviewProfileOpen(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dataPreviewProfileOpen]);

  useEffect(() => {
    if (activeTab !== "preview" || columns.length === 0) {
      scheduleEffectUpdate(() => setDataPreviewTableHeaderElevated(false));
      return;
    }
    const surface = dataPreviewTableSurfaceRef.current;
    if (!surface) return;

    const updateElevated = () => {
      const th = surface.querySelector("thead th");
      if (!(th instanceof HTMLElement)) {
        setDataPreviewTableHeaderElevated(false);
        return;
      }
      const thRect = th.getBoundingClientRect();
      setDataPreviewTableHeaderElevated(
        thRect.top <= 1 && thRect.bottom > 24
      );
    };

    scheduleEffectUpdate(updateElevated);
    window.addEventListener("scroll", updateElevated, { passive: true });
    window.addEventListener("resize", updateElevated, { passive: true });
    return () => {
      window.removeEventListener("scroll", updateElevated);
      window.removeEventListener("resize", updateElevated);
    };
  }, [
    activeTab,
    columns.length,
    preview.length,
    previewRowLimit,
    deferredDataPreviewSearch,
  ]);

  useEffect(() => {
    if (!dataPreviewProfileOpen) return;
    const close = () => setDataPreviewProfileOpen(null);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    const el = dataPreviewTableScrollRef.current;
    el?.addEventListener("scroll", close, { passive: true });
    return () => {
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
      el?.removeEventListener("scroll", close);
    };
  }, [dataPreviewProfileOpen]);

  const chartAnalysisContextKey = useMemo(() => {
    const filterSig = [
      ...dashboardFilters.map(
        (f) => `${f.column}\u0004${f.label}\u0004${f.value}`
      ),
      `__daterange__\u0004${dashDateStart}\u0004${dashDateEnd}`,
    ]
      .sort()
      .join("\u0003");
    const mapSig = [
      salesColumn,
      productColumn,
      dateColumn,
      regionColumn,
      customerColumn,
      profitColumn,
      mappingConfirmedByUser ? "confirmed" : "auto",
    ].join("|");
    return `${chartDatasetEpoch}\u0002${filterSig}\u0002${mapSig}`;
  }, [
    chartDatasetEpoch,
    dashboardFilters,
    dashDateStart,
    dashDateEnd,
    salesColumn,
    productColumn,
    dateColumn,
    regionColumn,
    customerColumn,
    profitColumn,
    mappingConfirmedByUser,
  ]);

  const insightAnswerForExport = useMemo(
    () =>
      resolveAnswerTextForChart(aiAnswerByChartId, insightChartId, answer),
    [aiAnswerByChartId, insightChartId, answer]
  );

  const insightAnalysisForExport = useMemo(() => {
    if (alignedAnalysis) return alignedAnalysis;
    const stored = getChartInsightAnswer(aiAnswerByChartId, insightChartId);
    return (stored?.alignedAnalysis as AlignedAnalysisContext | null) ?? null;
  }, [alignedAnalysis, aiAnswerByChartId, insightChartId]);

  const questionAlignedForExport = useMemo(() => {
    const q = question.trim();
    if (lastAskedQuestion.trim() === q) return true;
    const stored = getChartInsightAnswer(aiAnswerByChartId, insightChartId);
    return Boolean(
      stored?.hasValidAIAnswer && stored.lastAskedQuestion.trim() === q
    );
  }, [
    question,
    lastAskedQuestion,
    aiAnswerByChartId,
    insightChartId,
  ]);

  const insightHasExportableAnswer = useMemo(
    () =>
      hasStoredValidAnswer(
        aiAnswerByChartId,
        insightChartId,
        answer,
        hasValidAIAnswer
      ),
    [aiAnswerByChartId, insightChartId, answer, hasValidAIAnswer]
  );

  const insightChartMatchesQuestionIntent = useMemo(() => {
    if (!insightSnapshot || !lastAskedQuestion.trim()) return false;
    const prov = insightVisualization?.provenance ?? null;
    return chartSnapshotMatchesQuestionIntent({
      question: lastAskedQuestion,
      chartTitle: insightSnapshot.title,
      aggregationKey: prov?.aggregationKey ?? prov?.aggregation ?? null,
      aggregationLabel: prov?.aggregation ?? null,
      categoryColumn: prov?.categoryColumn ?? null,
      chartKind: insightSnapshot.chartKind,
      rowCount: insightSnapshot.chartData.length,
    });
  }, [
    insightSnapshot,
    lastAskedQuestion,
    insightVisualization?.provenance,
    insightSnapshot?.chartKind,
    insightSnapshot?.chartData.length,
    insightSnapshot?.title,
  ]);

  const insightChartMatchesCurrentQuestion = useMemo(() => {
    if (!insightSnapshot || !lastAskedQuestion.trim()) return false;
    if (!insightChartMatchesQuestionIntent) return false;

    if (insightSnapshot.source === "auto_dashboard") {
      const dashTitle = extractDashboardChartTitleFromPrefillQuestion(
        lastAskedQuestion
      );
      return dashTitle
        ? insightSnapshot.title.trim() === dashTitle
        : false;
    }

    const asked = normalizeQuestionForMatch(lastAskedQuestion);
    const snapQ = normalizeQuestionForMatch(insightSnapshot.question ?? "");
    if (snapQ && snapQ === asked) return true;

    const turnId = lastConversationMeta?.turnId ?? aiConversationState.turnId;
    if (
      turnId &&
      insightSnapshot.questionTurnId &&
      insightSnapshot.questionTurnId === turnId
    ) {
      return true;
    }

    if (lastConversationMeta?.followUpDetected && alignedAnalysis) {
      return chartSnapshotMatchesAnalysis(insightSnapshot, alignedAnalysis);
    }

    if (alignedAnalysis) {
      return chartSnapshotMatchesAnalysis(insightSnapshot, alignedAnalysis);
    }

    return false;
  }, [
    insightSnapshot,
    lastAskedQuestion,
    insightChartMatchesQuestionIntent,
    lastConversationMeta?.turnId,
    lastConversationMeta?.followUpDetected,
    aiConversationState.turnId,
    alignedAnalysis,
  ]);

  const insightUnsupportedDecline = useMemo(
    () =>
      resolveUnsupportedDeclineMode({
        question: lastAskedQuestion,
        unsupportedDeclineAnalysis: alignedAnalysis?.unsupportedDeclineAnalysis,
        analysisIntent: alignedAnalysis?.analysisIntent,
      }),
    [
      lastAskedQuestion,
      alignedAnalysis?.unsupportedDeclineAnalysis,
      alignedAnalysis?.declineRequestUnsatisfied,
      alignedAnalysis?.analysisIntent,
    ]
  );

  const insightUnsupportedMultiMetric = useMemo(
    () =>
      resolveUnsupportedMultiMetricMode({
        question: lastAskedQuestion,
        unsupportedMultiMetricAnalysis:
          alignedAnalysis?.unsupportedMultiMetricAnalysis,
        analysisIntent: alignedAnalysis?.analysisIntent,
      }),
    [
      lastAskedQuestion,
      alignedAnalysis?.unsupportedMultiMetricAnalysis,
      alignedAnalysis?.multiMetricRequestUnsatisfied,
      alignedAnalysis?.analysisIntent,
    ]
  );

  const insightUnsupportedTrend = useMemo(
    () =>
      resolveUnsupportedTrendMode({
        question: lastAskedQuestion,
        unsupportedTrendAnalysis: alignedAnalysis?.unsupportedTrendAnalysis,
        trendRequestUnsatisfied: alignedAnalysis?.trendRequestUnsatisfied,
      }),
    [
      lastAskedQuestion,
      alignedAnalysis?.unsupportedTrendAnalysis,
      alignedAnalysis?.trendRequestUnsatisfied,
    ]
  );

  const insightUnsupportedGrowth = useMemo(
    () =>
      resolveUnsupportedGrowthMode({
        question: lastAskedQuestion,
        unsupportedGrowthAnalysis: alignedAnalysis?.unsupportedGrowthAnalysis,
        isTrendChart: isTrendMode(insightSnapshot?.contract),
        chartTypeInternal:
          alignedAnalysis?.chartTypeInternal ?? insightSnapshot?.chartKind ?? "",
        timeSeriesAnalysis:
          insightVisualization?.provenance?.timeSeriesAnalysis ?? null,
        partialVisualizationWarning: alignedAnalysis?.partialVisualizationWarning,
        answerText: answer,
        metricColumn: alignedAnalysis?.metricColumn ?? null,
        chartSeriesPointCount:
          alignedAnalysis?.chartSeriesPointCount ??
          alignedAnalysis?.chartPointCount ??
          insightSnapshot?.chartData.length ??
          0,
      }),
    [
      lastAskedQuestion,
      alignedAnalysis?.unsupportedGrowthAnalysis,
      alignedAnalysis?.partialVisualizationWarning,
      alignedAnalysis?.chartTypeInternal,
      alignedAnalysis?.growthRequestUnsatisfied,
      alignedAnalysis?.metricColumn,
      alignedAnalysis?.chartSeriesPointCount,
      alignedAnalysis?.chartPointCount,
      insightSnapshot?.contract,
      insightSnapshot?.chartKind,
      insightSnapshot?.chartData.length,
      insightVisualization?.provenance?.timeSeriesAnalysis,
      answer,
    ]
  );

  const insightHasRenderableVisualization = useMemo(() => {
    if (insightUnsupportedTrend) return false;
    if (
      insightUnsupportedGrowth &&
      !(insightSnapshot && insightSnapshot.chartData.length >= 2)
    ) {
      return false;
    }
    if (insightUnsupportedDecline) return false;
    if (insightUnsupportedMultiMetric) return false;
    if (!insightSnapshot) return false;
    if (!insightChartMatchesCurrentQuestion) return false;
    if (
      insightSnapshot.source !== "ai" &&
      insightSnapshot.source !== "auto_dashboard"
    ) {
      return false;
    }
    const kind =
      resolvePresentationKindFromContract(insightSnapshot) ||
      insightSnapshot.chartKind;
    if (!kind) return false;
    if (insightSnapshot.chartData.length === 0) return false;
    const title = insightSnapshot.title.trim();
    if (title.startsWith("No dedicated visualization")) return false;
    return true;
  }, [
    insightSnapshot,
    insightChartMatchesCurrentQuestion,
    insightUnsupportedTrend,
    insightUnsupportedGrowth,
    insightUnsupportedDecline,
    insightUnsupportedMultiMetric,
  ]);

  const insightExportNeedsAiNarrative =
    insightSnapshot?.source === "ai";

  const canExportInsight =
    Boolean(insightSnapshot) &&
    insightHasRenderableVisualization &&
    (!insightExportNeedsAiNarrative ||
      (insightHasExportableAnswer && questionAlignedForExport));

  const showInsightExportButton = useMemo(
    () =>
      hasValidAIAnswer &&
      Boolean(answer.trim()) &&
      Boolean(lastAskedQuestion.trim()) &&
      canExportInsight,
    [hasValidAIAnswer, answer, lastAskedQuestion, canExportInsight]
  );

  const exportEnabledReason = useMemo(() => {
    if (!insightSnapshot) return "no_insight_chart_ask_ai_first";
    if (
      insightSnapshot.source !== "ai" &&
      insightSnapshot.source !== "auto_dashboard"
    ) {
      return "insight_not_ai_scoped";
    }
    if (!insightHasRenderableVisualization) return "missing_ai_visualization";
    if (insightSnapshot.source === "auto_dashboard") return "ready";
    if (!insightHasExportableAnswer) return "missing_ai_narrative";
    if (!questionAlignedForExport) return "question_changed_since_last_ask";
    return "ready";
  }, [
    insightSnapshot,
    insightHasRenderableVisualization,
    insightHasExportableAnswer,
    questionAlignedForExport,
  ]);

  const exportInsightDebug = useMemo(
    () => ({
      activeChartSource: insightSnapshot?.source ?? null,
      activeChartReason:
        insightSnapshot?.source === "ai"
          ? insightSnapshot.chartData.length > 0
            ? "ai_series_from_last_ask"
            : "ai_placeholder_no_series"
          : "non_ai_insight_snapshot",
      insightChartId,
      aiChartMatched: lastAskVisualizationHydrated,
      fallbackChartUsed: false,
      exportEnabledReason,
      aiThreadIds:
        insightSnapshot?.source === "ai"
          ? {
              questionTurnId: insightSnapshot.questionTurnId ?? null,
              parentTurnId: insightSnapshot.parentTurnId ?? null,
              derivedFromChartId: insightSnapshot.derivedFromChartId ?? null,
              analysisContextKey: insightSnapshot.analysisContextKey ?? null,
            }
          : null,
    }),
    [
      insightSnapshot,
      insightChartId,
      exportEnabledReason,
      lastAskVisualizationHydrated,
    ]
  );

  const visibleSuggestedQuestions = useMemo(
    () =>
      applySuggestionListHygiene(suggestedQuestions, [
        ...questionHistory,
        question.trim(),
      ].filter(Boolean)).slice(0, 5),
    [suggestedQuestions, questionHistory, question]
  );

  const tickTruncate = useCallback((v: string | number) => {
    const s = String(v).trim();
    if (!s) return "—";
    if (s.length <= 40) return s;
    const [first] = wrapCategoryLabelLines(s, { maxCharsPerLine: 38, maxLines: 1 });
    return first && first.length <= 40 ? first : `${s.slice(0, 38)}…`;
  }, []);

  const presentationChartKind = useMemo((): ChartKind => {
    if (!chartData.length) return "";
    const fromContract = resolvePresentationKindFromContract(activeSnapshot);
    if (fromContract) return fromContract;
    const computed = computeFinalChartPresentation({
      apiChartType: visualization?.chartType ?? "bar",
      title: chartTitle,
      question: lastAskedQuestion,
      rows: chartData,
    });
    const pinnedKind = activeSnapshot?.chartKind;
    if (pinnedKind === "pie" || pinnedKind === "donut") {
      if (computed !== "pie" && computed !== "donut") return computed;
      return pinnedKind;
    }
    if (pinnedKind) return pinnedKind;
    if (chartType) return chartType;
    const t = activeSnapshot?.timelineChartType;
    if (t) return timelineTypeToChartKind(t);
    return computed;
  }, [
    chartData,
    chartData.length,
    activeSnapshot?.chartKind,
    activeSnapshot?.contract,
    chartType,
    activeSnapshot?.timelineChartType,
    visualization?.chartType,
    chartTitle,
    lastAskedQuestion,
  ]);

  const chartSortAscending = useMemo(
    () =>
      isTrendMode(activeSnapshot?.contract)
        ? null
        : isAscendingValueIntent(
            activeSnapshot?.id === insightChartId &&
              insightSnapshot?.source !== "auto_dashboard"
              ? alignedAnalysis
              : null,
            visualization
          ),
    [
      activeSnapshot?.id,
      insightChartId,
      insightSnapshot?.source,
      alignedAnalysis,
      visualization,
    ]
  );

  const sortedChartData = useMemo(
    () =>
      sortRowsForPresentation(
        chartData,
        presentationChartKind,
        chartSortAscending,
        isTrendMode(activeSnapshot?.contract)
      ),
    [
      chartData,
      presentationChartKind,
      chartSortAscending,
      activeSnapshot?.contract,
    ]
  );

  const sessionChartAxisPresentation = useMemo(
    () =>
      buildChartAxisPresentationBundle({
        chartTitle: contractDisplayTitle(activeSnapshot?.contract, chartTitle),
        chartSubtitle,
        lastAskedQuestion,
        datasetKind,
        visualization,
        analysis: null,
        preferAnalysisForCategory: false,
        presentationKind: presentationChartKind,
        contract: activeSnapshot?.contract,
      }),
    [
      activeSnapshot?.contract,
      chartTitle,
      chartSubtitle,
      lastAskedQuestion,
      datasetKind,
      visualization,
      visualization?.chartType,
      visualization?.scatterXLabel,
      visualization?.scatterYLabel,
      visualization?.multiSeries,
      presentationChartKind,
    ]
  );
  const chartAxisLabels = sessionChartAxisPresentation.axes;
  const sessionChartSemanticHeader = sessionChartAxisPresentation.header;

  const sessionDisplayChartTitle = useMemo(() => {
    const fromContract = getCanonicalChartTitle({
      rawTitle: chartTitle,
      chartType: activeSnapshot?.chartKind ?? chartType,
      contract: activeSnapshot?.contract ?? null,
      labels: chartData.map((r) => String(r.name ?? "")),
      values: chartData.map((r) => r.value),
      aggregationKey: activeSnapshot?.contract?.aggregation ?? "sum",
    });
    if (fromContract) return fromContract;
    if (activeSnapshot?.source === "auto_dashboard") {
      const raw = chartTitle.trim();
      if (raw) return raw;
    }
    return buildNormalizedVizMetadata({
      rawPersistedTitle: chartTitle,
      chartSubtitle,
      presentationKind: presentationChartKind,
      viz: visualization,
      analysis: null,
      preferAnalysisForCategory: false,
    }).chartTitle;
  }, [
    activeSnapshot?.source,
    activeSnapshot?.contract?.title,
    chartTitle,
    chartSubtitle,
    presentationChartKind,
    visualization,
    visualization?.provenance,
    visualization?.chartType,
  ]);

  const chartHeightMain = useMemo(
    () =>
      resolveChartsTabPreviewPlotHeight(
        chartData.length,
        presentationChartKind,
        viewportH
      ),
    [chartData.length, presentationChartKind, viewportH]
  );

  sessionChartKindRef.current = presentationChartKind;

  const activeSessionViewportW = sessionChartViewportW;
  const activeChartHeightMain = chartHeightMain;

  const chartsTabExportCartesianPlan = useMemo(
    () =>
      chartsTabOffscreenLayout
        ? computeCartesianCategoryPlanForRender({
            rows: sortedChartData,
            kind: presentationChartKind,
            stackedBar: Boolean(
              isMultiMetricBarLayout(visualization?.multiSeries?.layout) &&
                (visualization?.multiSeries?.seriesKeys?.length ?? 0) > 0
            ),
            chartHeight: chartsTabOffscreenLayout.height,
            compact: false,
            insightMode: false,
            viewportWidthPx: chartsTabOffscreenLayout.width,
            axes: chartAxisLabels,
          })
        : null,
    [
      chartsTabOffscreenLayout,
      sortedChartData,
      presentationChartKind,
      visualization?.multiSeries?.layout,
      visualization?.multiSeries?.seriesKeys?.length,
      chartAxisLabels,
    ]
  );

  const sessionCartesianPlan = useMemo(
    () =>
      computeCartesianCategoryPlanForRender({
        rows: sortedChartData,
        kind: presentationChartKind,
        stackedBar: Boolean(
          isMultiMetricBarLayout(visualization?.multiSeries?.layout) &&
            (visualization?.multiSeries?.seriesKeys?.length ?? 0) > 0
        ),
        chartHeight: activeChartHeightMain,
        compact: false,
        insightMode: false,
        viewportWidthPx: activeSessionViewportW,
        axes: chartAxisLabels,
      }),
    [
      sortedChartData,
      presentationChartKind,
      visualization?.multiSeries?.layout,
      visualization?.multiSeries?.seriesKeys?.length,
      activeChartHeightMain,
      activeSessionViewportW,
      chartAxisLabels.valueAxis,
      chartAxisLabels.valueAxisCompact,
    ]
  );

  const sessionRenderedChartKind = presentationChartKind;

  const sessionTrendBucketLabel = useMemo(() => {
    const c = activeSnapshot?.contract;
    if (!isTrendMode(c)) return "";
    const viz = visualization as StoredVisualization | null;
    return resolveTrendBucketLabel({
      title: chartTitle,
      timeSeriesAnalysis: viz?.provenance?.timeSeriesAnalysis ?? null,
      timeBucketLabelOverride:
        activeSnapshot?.finalPresentation?.grain ?? c!.timeBucketLabel,
      question: activeSnapshot?.question,
      labels: chartData.map((r) => String(r.name ?? "")),
    });
  }, [
    activeSnapshot?.contract,
    activeSnapshot?.finalPresentation?.grain,
    activeSnapshot?.question,
    chartTitle,
    visualization,
    chartData,
  ]);

  const chartInsightBadge = useMemo(
    () =>
      isTrendMode(activeSnapshot?.contract)
        ? trendInsightBadgeFromRows(
            sortedChartData,
            sessionRenderedChartKind,
            sessionTrendBucketLabel || activeSnapshot?.contract?.timeBucketLabel
          )
        : computeChartInsightBadge(
            sortedChartData,
            sessionRenderedChartKind,
            chartAxisLabels.categoryAxis,
            chartSortAscending
          ),
    [
      activeSnapshot?.contract,
      sessionTrendBucketLabel,
      sortedChartData,
      sessionRenderedChartKind,
      chartAxisLabels.categoryAxis,
      chartSortAscending,
    ]
  );

  const sessionChartRateWarning = useMemo(() => {
    const metricLabel = visualization?.title ?? chartAxisLabels.valueAxis;
    return chartHasRateAbove100(sortedChartData, metricLabel)
      ? RATE_EXCEEDS_100_WARNING
      : null;
  }, [sortedChartData, visualization?.title, chartAxisLabels.valueAxis]);

  const executiveVizInsights = useMemo((): ExecutiveVizInsightCard[] => {
    if (isTrendMode(activeSnapshot?.contract) && sortedChartData.length) {
      const c = activeSnapshot!.contract!;
      return buildTrendExecutiveVizInsights(
        sortedChartData,
        c.metricLabel,
        sessionTrendBucketLabel || c.timeBucketLabel,
        sessionRenderedChartKind,
        visualization?.roundingHint
      );
    }
    if (!visualization?.labels?.length) return [];
    const pairs = zipStoredVisualizationPairs(visualization);
    const measureCtx = executiveMeasureContextFromAligned(
      chartAxisLabels,
      alignedAnalysis,
      visualization.title ?? "",
      columns
    );
    return buildExecutiveVizInsights(
      pairs,
      sessionRenderedChartKind,
      chartAxisLabels,
      visualization.roundingHint,
      measureCtx,
      {
        categoryColumnDisplay: alignedAnalysis?.categoryColumnDisplay,
        categoryColumn: alignedAnalysis?.categoryColumn,
      }
    );
  }, [
    activeSnapshot,
    sortedChartData,
    visualization,
    sessionRenderedChartKind,
    chartAxisLabels,
    alignedAnalysis,
    columns,
  ]);

  const chartRoutingRecommendation = useMemo(
    () =>
      activeSnapshot?.source === "auto_dashboard" ||
      isTrendMode(activeSnapshot?.contract)
        ? null
        : visualization?.chartRecommendation ??
          alignedAnalysis?.chartRecommendation ??
          null,
    [
      activeSnapshot?.source,
      activeSnapshot?.contract,
      visualization?.chartRecommendation,
      alignedAnalysis?.chartRecommendation,
    ]
  );

  const sessionSemanticContext = useMemo(() => {
    const frozen = semanticContextFromContract(activeSnapshot?.contract);
    if (frozen) return frozen;
    const dashCtx = semanticContextForPinnedDashboard(
      activeSnapshot,
      visualization,
      sessionRenderedChartKind,
      datasetKind || "",
      effectiveSales ?? null,
      effectiveProduct ?? null
    );
    if (dashCtx) return dashCtx;
    return fromAlignedAnalysis(
      alignedAnalysis,
      visualization,
      sessionRenderedChartKind,
      datasetKind || ""
    );
  }, [
    activeSnapshot,
    activeSnapshot?.contract,
    visualization,
    sessionRenderedChartKind,
    datasetKind,
    effectiveSales,
    effectiveProduct,
    alignedAnalysis,
  ]);

  const sessionSmartChartIntel = useMemo(
    () =>
      computeSmartChartIntel({
        question: lastAskedQuestion,
        columns,
        rows: sortedChartData,
        apiChartType: apiChartTypeFromContract(
          activeSnapshot?.contract,
          visualization?.chartType ?? "bar"
        ),
        presentationKind: sessionRenderedChartKind,
        stackedOrMultiSeries: isMultiMetricBarLayout(
          visualization?.multiSeries?.layout
        ),
        multiSeriesLayout: visualization?.multiSeries?.layout ?? null,
        groupedBarMeta:
          visualization?.multiSeries?.layout === "grouped_bar"
            ? visualization.multiSeries
            : null,
        categoryAxis: chartAxisLabels.categoryAxis,
        valueAxis: chartAxisLabels.valueAxis,
        routing: chartRoutingRecommendation,
        answerSummary: answer.trim().slice(0, 400) || undefined,
        semanticContext: sessionSemanticContext,
      }),
    [
      lastAskedQuestion,
      columns,
      sortedChartData,
      visualization?.chartType,
      visualization?.multiSeries,
      visualization?.multiSeries?.layout,
      sessionRenderedChartKind,
      chartAxisLabels.categoryAxis,
      chartAxisLabels.valueAxis,
      chartRoutingRecommendation,
      answer,
      sessionSemanticContext,
    ]
  );

  const insightPresentationChartKind = useMemo((): ChartKind => {
    if (!insightChartData.length) return "";
    const fromContract = resolvePresentationKindFromContract(insightSnapshot);
    if (fromContract) return fromContract;
    const computed = computeFinalChartPresentation({
      apiChartType: insightVisualization?.chartType ?? "bar",
      title: insightChartTitle,
      question: lastAskedQuestion,
      rows: insightChartData,
    });
    const pinnedKind = insightSnapshot?.chartKind;
    if (pinnedKind === "pie" || pinnedKind === "donut") {
      if (computed !== "pie" && computed !== "donut") return computed;
      return pinnedKind;
    }
    if (pinnedKind) return pinnedKind;
    if (insightChartType) return insightChartType;
    const t = insightSnapshot?.timelineChartType;
    if (t) return timelineTypeToChartKind(t);
    return computed;
  }, [
    insightChartData,
    insightChartData.length,
    insightSnapshot?.chartKind,
    insightSnapshot?.contract,
    insightChartType,
    insightSnapshot?.timelineChartType,
    insightVisualization?.chartType,
    insightChartTitle,
    lastAskedQuestion,
  ]);

  const insightTrendBucketLabel = useMemo(() => {
    const c = insightSnapshot?.contract;
    if (!isTrendMode(c)) return "";
    return resolveTrendBucketLabel({
      title: insightChartTitle,
      timeSeriesAnalysis:
        insightVisualization?.provenance?.timeSeriesAnalysis ?? null,
      timeBucketLabelOverride:
        insightSnapshot?.finalPresentation?.grain ?? c!.timeBucketLabel,
      question: insightSnapshot?.question ?? lastAskedQuestion,
      labels: insightChartData.map((r) => String(r.name ?? "")),
    });
  }, [
    insightSnapshot?.contract,
    insightSnapshot?.finalPresentation?.grain,
    insightSnapshot?.question,
    insightChartTitle,
    insightVisualization?.provenance?.timeSeriesAnalysis,
    insightChartData,
    lastAskedQuestion,
  ]);

  const insightDisplayChartTitle = useMemo(() => {
    if (
      insightPresentationChartKind === "scatter" &&
      insightVisualization?.scatterXLabel?.trim() &&
      insightVisualization?.scatterYLabel?.trim()
    ) {
      return buildRelationshipScatterDisplayTitle({
        question: lastAskedQuestion,
        xLabel: insightVisualization.scatterXLabel.trim(),
        yLabel: insightVisualization.scatterYLabel.trim(),
        persistedTitle: insightChartTitle,
        relationshipMeasureLabel:
          insightVisualization.relationshipMeasureLabel ??
          parseRelationshipInsights(insightVisualization.relationshipInsights)
            ?.measureLabel ??
          null,
      });
    }
    if (
      insightVisualization?.multiSeries?.layout === "grouped_bar" &&
      insightVisualization.title?.trim()
    ) {
      return insightVisualization.title.trim();
    }
    if (isTrendMode(insightSnapshot?.contract)) {
      const metric = insightSnapshot!.contract!.metricLabel?.trim();
      if (metric && insightTrendBucketLabel) {
        return buildTrendDisplayTitle(metric, insightTrendBucketLabel);
      }
    }
    const fromContract = getCanonicalChartTitle({
      rawTitle: insightChartTitle,
      chartType: insightSnapshot?.chartKind ?? insightChartType,
      contract: insightSnapshot?.contract ?? null,
      labels: insightChartData.map((r) => String(r.name ?? "")),
      values: insightChartData.map((r) => r.value),
      aggregationKey: insightSnapshot?.contract?.aggregation ?? "sum",
    });
    if (fromContract) return fromContract;
    if (insightSnapshot?.source === "auto_dashboard") {
      const raw = insightChartTitle.trim();
      if (raw) return raw;
    }
    return buildNormalizedVizMetadata({
      rawPersistedTitle: insightChartTitle,
      chartSubtitle: insightChartSubtitle,
      presentationKind: insightPresentationChartKind,
      viz: insightVisualization,
      analysis:
        insightSnapshot?.source === "auto_dashboard" ? null : alignedAnalysis,
      preferAnalysisForCategory: insightSnapshot?.source !== "auto_dashboard",
    }).chartTitle;
  }, [
    lastAskedQuestion,
    insightSnapshot?.source,
    insightSnapshot?.contract?.title,
    insightSnapshot?.contract,
    insightTrendBucketLabel,
    insightChartTitle,
    insightChartSubtitle,
    insightPresentationChartKind,
    insightVisualization,
    alignedAnalysis,
    insightChartData,
  ]);

  const insightSemanticContext = useMemo(() => {
    const frozen = semanticContextFromContract(insightSnapshot?.contract);
    if (frozen) return frozen;
    const dashCtx = semanticContextForPinnedDashboard(
      insightSnapshot,
      insightVisualization,
      insightPresentationChartKind,
      datasetKind || "",
      effectiveSales ?? null,
      effectiveProduct ?? null
    );
    if (dashCtx) return dashCtx;
    if (isTrendMode(insightSnapshot?.contract)) {
      return frozen ?? dashCtx;
    }
    return fromAlignedAnalysis(
      alignedAnalysis,
      insightVisualization,
      insightPresentationChartKind,
      datasetKind || ""
    );
  }, [
    insightSnapshot,
    insightSnapshot?.contract,
    insightVisualization,
    insightPresentationChartKind,
    datasetKind,
    effectiveSales,
    effectiveProduct,
    alignedAnalysis,
  ]);

  const insightChartSortAscending = useMemo(
    () =>
      isTrendMode(insightSnapshot?.contract)
        ? null
        : isAscendingValueIntent(
            insightSnapshot?.source === "auto_dashboard" ? null : alignedAnalysis,
            insightVisualization
          ),
    [insightSnapshot?.source, insightSnapshot?.contract, alignedAnalysis, insightVisualization]
  );

  const sortedInsightChartData = useMemo(
    () =>
      sortRowsForPresentation(
        insightChartData,
        insightPresentationChartKind,
        insightChartSortAscending,
        isTrendMode(insightSnapshot?.contract)
      ),
    [
      insightChartData,
      insightPresentationChartKind,
      insightChartSortAscending,
      insightSnapshot?.contract,
    ]
  );

  const insightChartAxisPresentation = useMemo(
    () =>
      buildChartAxisPresentationBundle({
        chartTitle: contractDisplayTitle(
          insightSnapshot?.contract,
          insightChartTitle
        ),
        chartSubtitle: insightChartSubtitle,
        lastAskedQuestion,
        datasetKind,
        visualization: insightVisualization,
        analysis:
          insightSnapshot?.source === "auto_dashboard" ||
          isTrendMode(insightSnapshot?.contract)
            ? null
            : alignedAnalysis,
        preferAnalysisForCategory:
          insightSnapshot?.source !== "auto_dashboard" &&
          !isTrendMode(insightSnapshot?.contract),
        presentationKind: insightPresentationChartKind,
        contract: insightSnapshot?.contract,
      }),
    [
      insightChartTitle,
      insightChartSubtitle,
      lastAskedQuestion,
      datasetKind,
      insightVisualization,
      insightVisualization?.chartType,
      insightVisualization?.scatterXLabel,
      insightVisualization?.scatterYLabel,
      insightVisualization?.multiSeries,
      alignedAnalysis,
      insightSnapshot?.source,
      insightSnapshot?.contract,
      insightPresentationChartKind,
    ]
  );
  const insightChartAxisLabels = insightChartAxisPresentation.axes;
  const insightChartSemanticHeader = insightChartAxisPresentation.header;

  const insightChartMeasureLabel = useMemo(() => {
    if (insightPresentationChartKind !== "scatter") {
      return insightChartAxisLabels.valueAxis;
    }
    const rel =
      insightVisualization?.relationshipMeasureLabel?.trim() ||
      parseRelationshipInsights(insightVisualization?.relationshipInsights)
        ?.measureLabel?.trim();
    if (rel) return rel;
    if (insightChartSemanticHeader.mode === "scatter") {
      return `${insightChartSemanticHeader.xLabel} vs ${insightChartSemanticHeader.yLabel}`;
    }
    return `${insightChartAxisLabels.categoryAxis} vs ${insightChartAxisLabels.valueAxis}`;
  }, [
    insightPresentationChartKind,
    insightChartAxisLabels.valueAxis,
    insightChartAxisLabels.categoryAxis,
    insightVisualization?.relationshipMeasureLabel,
    insightVisualization?.relationshipInsights,
    insightChartSemanticHeader,
  ]);

  const insightProfitMargin = useMemo((): ProfitMarginMode | null => {
    return resolveProfitMarginMode({
      question: lastAskedQuestion,
      derivedProfitMargin: alignedAnalysis?.derivedProfitMargin,
      profitMarginUnavailable: alignedAnalysis?.profitMarginUnavailable,
      metricColumnDisplay: alignedAnalysis?.metricColumnDisplay,
      valueAxisLabel: insightChartAxisLabels.valueAxis,
    });
  }, [
    lastAskedQuestion,
    alignedAnalysis?.derivedProfitMargin,
    alignedAnalysis?.profitMarginUnavailable,
    alignedAnalysis?.metricColumnDisplay,
    insightChartAxisLabels.valueAxis,
  ]);

  const insightFollowUpChips = useMemo(() => {
    if (!hasValidAIAnswer || !answer.trim() || !lastAskedQuestion.trim()) {
      return [];
    }
    const followUpDimOpts = {
      categoryColumn: alignedAnalysis?.categoryColumn ?? null,
      categoryColumnDisplay: alignedAnalysis?.categoryColumnDisplay ?? null,
    };
    if (insightUnsupportedGrowth) {
      return buildUnsupportedGrowthFollowUpChips(
        insightChartAxisLabels.categoryAxis,
        followUpDimOpts
      );
    }
    if (insightUnsupportedTrend) {
      return buildUnsupportedTrendFollowUpChips(
        insightChartAxisLabels.categoryAxis,
        followUpDimOpts
      );
    }
    if (insightUnsupportedDecline) {
      return buildUnsupportedDeclineFollowUpChips(
        insightChartAxisLabels.categoryAxis,
        followUpDimOpts
      );
    }
    if (insightUnsupportedMultiMetric) {
      return buildUnsupportedMultiMetricFollowUpChips(
        insightUnsupportedMultiMetric,
        {
          categoryAxisLabel: insightChartAxisLabels.categoryAxis,
          ...followUpDimOpts,
        }
      );
    }
    if (insightProfitMargin?.active) {
      const top = [...sortedInsightChartData]
        .filter((r) => Number.isFinite(Number(r.value)))
        .sort((a, b) => Number(b.value) - Number(a.value))[0];
      return buildProfitMarginFollowUpChips(
        insightChartAxisLabels.categoryAxis,
        top?.name ?? null,
        {
          categoryColumn: alignedAnalysis?.categoryColumn ?? null,
          categoryColumnDisplay: alignedAnalysis?.categoryColumnDisplay ?? null,
        }
      );
    }
    const metricCol = alignedAnalysis?.metricColumn ?? null;
    const alts = alternateNumericMetricLabels(
      columns,
      profile?.column_types,
      metricCol,
      8
    );
    const axisMet =
      insightSemanticContext?.metricLabel.trim() ||
      insightChartAxisLabels.valueAxis;
    const axisCat =
      insightSemanticContext?.dimensionLabel.trim() ||
      insightChartAxisLabels.categoryAxis;

    const dualMetricCompare = Boolean(
      insightVisualization?.multiSeries?.layout === "grouped_bar" ||
        alignedAnalysis?.dualMetricCompare
    );

    const followUpQuality = {
      chartTitle: insightDisplayChartTitle,
      valueAxisLabel: axisMet,
    };

    const base = buildAiFollowUpQuestionChips({
      lastQuestion: lastAskedQuestion,
      chartTitle: insightDisplayChartTitle,
      chartKind: insightPresentationChartKind,
      valueAxisLabel: axisMet,
      categoryAxisLabel: axisCat,
      datasetDomain: datasetKind || "",
      seriesRows: sortedInsightChartData.map((r) => ({
        name: r.name,
        value: r.value,
      })),
      alternateMetricLabels: alts,
      dualMetricCompare,
      dualMetricSeriesKeys: insightVisualization?.multiSeries?.seriesKeys,
      columns,
      metricColumn: alignedAnalysis?.metricColumn ?? null,
      metricColumnDisplay: alignedAnalysis?.metricColumnDisplay ?? null,
      categoryColumn: alignedAnalysis?.categoryColumn ?? null,
      categoryColumnDisplay: alignedAnalysis?.categoryColumnDisplay ?? null,
      breakdownDimensionLabel:
        insightPresentationChartKind === "scatter"
          ? alignedAnalysis?.categoryColumnDisplay ??
            insightSemanticContext?.dimensionLabel ??
            null
          : null,
      executiveLens: followUpLensFromRouting(
        alignedAnalysis?.routingPlan,
        alignedAnalysis?.executiveLens ?? null
      ),
      routingIntent: alignedAnalysis?.routingPlan?.intent ?? null,
    });

    const seeds = dualMetricCompare
      ? []
      : schemaAwareFollowUpSeeds(
          datasetKind || "",
          columns,
          insightSemanticContext
        );

    if (
      !dualMetricCompare &&
      insightSemanticContext &&
      !isTrendMode(insightSnapshot?.contract) &&
      insightPresentationChartKind !== "scatter" &&
      sortedInsightChartData.length >= 1
    ) {
      const ranked = [...sortedInsightChartData].sort((a, b) => b.value - a.value);
      const top = ranked[0];
      if (top?.name && !isSyntheticScatterPointLabel(top.name)) {
        seeds.unshift(
          buildFollowupQuestion("rank_high", insightSemanticContext, {
            categoryName: top.name,
          })
        );
      }
    }

    const seen = new Set<string>();
    const merged: string[] = [];
    for (const c of [...seeds, ...base]) {
      const t = c.replace(/\s+/g, " ").trim();
      const k = t.toLowerCase();
      if (t.length < 6 || seen.has(k)) continue;
      if (isInvalidMetricCompareChip(t, axisMet)) continue;
      if (isLowQualityFollowUpChip(t, followUpQuality)) continue;
      seen.add(k);
      merged.push(t);
      if (merged.length >= 5) break;
    }
    return filterMeaningfulFollowUpChips(
      appendThreadMetaFollowUpChips(merged, 5),
      axisMet,
      followUpQuality
    ).slice(0, 5);
  }, [
    hasValidAIAnswer,
    answer,
    lastAskedQuestion,
    insightUnsupportedGrowth,
    insightUnsupportedTrend,
    insightUnsupportedDecline,
    insightUnsupportedMultiMetric,
    insightProfitMargin,
    insightChartAxisLabels.categoryAxis,
    alignedAnalysis?.metricColumn,
    columns,
    profile?.column_types,
    insightDisplayChartTitle,
    insightPresentationChartKind,
    insightChartAxisLabels.valueAxis,
    insightChartAxisLabels.categoryAxis,
    insightSemanticContext,
    datasetKind,
    sortedInsightChartData,
    insightVisualization?.multiSeries?.layout,
    alignedAnalysis?.dualMetricCompare,
  ]);

  /** Plot height inside the AI Insight shell — from chart-type layout config. */
  const insightLayoutMetrics = useMemo(
    () => getInsightLayoutMetrics(insightPresentationChartKind),
    [insightPresentationChartKind]
  );

  const insightShellPlotHeight = useMemo(() => {
    const k = insightPresentationChartKind;
    const n = Math.max(1, insightChartData.length);
    const { plotHeightMin, plotHeightMax } = insightLayoutMetrics;
    if (k === "bar_horizontal") {
      return clampChartHeightToViewport(
        Math.min(
          plotHeightMax,
          Math.max(plotHeightMin, resolveChartDisplayHeight(n, k, false))
        ),
        viewportH
      );
    }
    if (k === "line" || k === "area") {
      return Math.min(
        plotHeightMax,
        Math.max(plotHeightMin, 336)
      );
    }
    if (k === "bar" || k === "histogram") {
      const cat = n;
      const extra = Math.min(36, Math.max(0, cat - 5) * 6);
      return Math.min(plotHeightMax, Math.max(plotHeightMin, 300 + extra));
    }
    return Math.min(
      plotHeightMax,
      Math.max(plotHeightMin, Math.round(viewportH * 0.36))
    );
  }, [
    insightPresentationChartKind,
    insightChartData.length,
    viewportH,
    insightLayoutMetrics,
  ]);

  const insightCategoryPlanViewportPx = useMemo(
    () => insightLayoutMetrics.planViewportPx,
    [insightLayoutMetrics]
  );

  const insightCartesianPlanMain = useMemo(
    () =>
      computeCartesianCategoryPlanForRender({
        rows: sortedInsightChartData,
        kind: insightPresentationChartKind,
        stackedBar: Boolean(
          isMultiMetricBarLayout(insightVisualization?.multiSeries?.layout) &&
            (insightVisualization?.multiSeries?.seriesKeys?.length ?? 0) > 0
        ),
        chartHeight: insightShellPlotHeight,
        compact: false,
        insightMode: true,
        viewportWidthPx: insightCategoryPlanViewportPx,
        axes: insightChartAxisLabels,
      }),
    [
      sortedInsightChartData,
      insightPresentationChartKind,
      insightVisualization?.multiSeries?.layout,
      insightVisualization?.multiSeries?.seriesKeys?.length,
      insightShellPlotHeight,
      insightCategoryPlanViewportPx,
      insightChartAxisLabels.valueAxis,
      insightChartAxisLabels.valueAxisCompact,
    ]
  );

  const insightRenderedChartKind = useMemo(
    () =>
      resolveInsightRenderedChartKind({
        presentationKind: insightPresentationChartKind,
        categoryPlan: insightCartesianPlanMain,
      }),
    [insightPresentationChartKind, insightCartesianPlanMain]
  );

  const insightProvenanceVisualizationLabel = useMemo(() => {
    if (!insightVisualization?.provenance) return null;
    if (insightRenderedChartKind === "scatter") return "Scatter Plot";
    return chartKindToProvenanceLabel(insightRenderedChartKind);
  }, [insightVisualization?.provenance, insightRenderedChartKind]);

  const insightChartInsightBadge = useMemo(
    () => {
      if (isTrendMode(insightSnapshot?.contract)) {
        return trendInsightBadgeFromRows(
          sortedInsightChartData,
          insightRenderedChartKind,
          insightTrendBucketLabel || insightSnapshot?.contract?.timeBucketLabel
        );
      }
      if (insightRelationshipBundle?.correlation.badgeLabel) {
        return insightRelationshipBundle.correlation.badgeLabel;
      }
      return computeChartInsightBadge(
        sortedInsightChartData,
        insightRenderedChartKind,
        insightChartAxisLabels.categoryAxis,
        insightChartSortAscending
      );
    },
    [
      insightSnapshot?.contract,
      insightTrendBucketLabel,
      sortedInsightChartData,
      insightRenderedChartKind,
      insightChartAxisLabels.categoryAxis,
      insightChartSortAscending,
      insightRelationshipBundle,
    ]
  );

  const insightChartRateWarning = useMemo(() => {
    const metricLabel =
      insightVisualization?.title ??
      insightChartMeasureLabel ??
      insightChartAxisLabels.valueAxis;
    return chartHasRateAbove100(sortedInsightChartData, metricLabel)
      ? RATE_EXCEEDS_100_WARNING
      : null;
  }, [
    sortedInsightChartData,
    insightVisualization?.title,
    insightChartMeasureLabel,
    insightChartAxisLabels.valueAxis,
  ]);

  const insightExecutiveVizInsights = useMemo((): ExecutiveVizInsightCard[] => {
    if (insightUnsupportedGrowth) {
      return buildUnsupportedGrowthExecutiveCards(insightUnsupportedGrowth);
    }
    if (insightUnsupportedTrend) {
      return buildUnsupportedTrendExecutiveCards(insightUnsupportedTrend);
    }
    if (insightUnsupportedDecline) {
      return buildUnsupportedDeclineExecutiveCards(insightUnsupportedDecline);
    }
    if (insightUnsupportedMultiMetric) {
      return buildUnsupportedMultiMetricExecutiveCards(insightUnsupportedMultiMetric);
    }
    if (insightRelationshipBundle) {
      const { enriched, scatterRows } = insightRelationshipBundle;
      return buildRelationshipExecutiveCards(
        enriched,
        insightChartAxisLabels.categoryAxis,
        insightChartAxisLabels.valueAxis,
        scatterRows.length,
        scatterRows
      );
    }
    if (insightProfitMargin?.active && insightVisualization?.labels?.length) {
      const pairs = zipStoredVisualizationPairs(insightVisualization);
      if (pairs.length >= 1) {
        return buildProfitMarginExecutiveInsights(
          pairs.map((r) => ({
            label: r.label,
            value: r.value,
            formatted: r.formatted,
          }))
        );
      }
    }
    if (isTrendMode(insightSnapshot?.contract) && sortedInsightChartData.length) {
      const c = insightSnapshot!.contract!;
      return buildTrendExecutiveVizInsights(
        sortedInsightChartData,
        c.metricLabel,
        insightTrendBucketLabel || c.timeBucketLabel,
        insightRenderedChartKind,
        insightVisualization?.roundingHint
      );
    }
    const ms = insightVisualization?.multiSeries;
    if (
      ms?.layout === "grouped_bar" &&
      ms.seriesKeys.length >= 2 &&
      insightChartData.length
    ) {
      return buildGroupedMetricExecutiveInsights(
        insightChartData,
        ms,
        insightChartAxisLabels.categoryAxis,
        insightVisualization?.roundingHint
      );
    }
    if (!insightVisualization?.labels?.length) return [];
    const measureCtx = executiveMeasureContextFromAligned(
      insightChartAxisLabels,
      alignedAnalysis,
      insightDisplayChartTitle,
      columns
    );
    const dimCtx = {
      categoryColumnDisplay: alignedAnalysis?.categoryColumnDisplay,
      categoryColumn: alignedAnalysis?.categoryColumn,
    };
    const rankedApi = parseRankedExecutiveInsights(
      insightVisualization.rankedExecutiveInsights
    );
    if (rankedApi.length) {
      return rankedInsightsToExecutiveCards(
        rankedApi,
        measureCtx,
        resolveExecutiveDimensionLabel(dimCtx)
      );
    }
    const pairs = zipStoredVisualizationPairs(insightVisualization);
    return buildExecutiveVizInsights(
      pairs,
      insightRenderedChartKind,
      insightChartAxisLabels,
      insightVisualization.roundingHint,
      measureCtx,
      dimCtx
    );
  }, [
    insightUnsupportedGrowth,
    insightUnsupportedTrend,
    insightUnsupportedDecline,
    insightUnsupportedMultiMetric,
    insightProfitMargin,
    insightSnapshot,
    sortedInsightChartData,
    insightVisualization,
    insightRelationshipBundle,
    insightRenderedChartKind,
    insightChartAxisLabels,
    insightDisplayChartTitle,
    alignedAnalysis,
    columns,
    insightChartData,
  ]);

  const insightProfitMarginLead = useMemo(() => {
    if (!insightProfitMargin?.active) return null;
    const rows = sortedInsightChartData
      .filter((r) => Number.isFinite(Number(r.value)))
      .map((r) => ({
        label: String(r.name ?? "").trim() || "—",
        value: Number(r.value),
      }));
    return buildProfitMarginAnswerLead(rows);
  }, [insightProfitMargin, sortedInsightChartData]);

  const insightChartRoutingRecommendation = useMemo(
    () =>
      insightSnapshot?.source === "auto_dashboard" ||
      isTrendMode(insightSnapshot?.contract)
        ? null
        : insightVisualization?.chartRecommendation ??
          alignedAnalysis?.chartRecommendation ??
          null,
    [
      insightSnapshot?.source,
      insightSnapshot?.contract,
      insightVisualization?.chartRecommendation,
      alignedAnalysis?.chartRecommendation,
    ]
  );

  const insightSmartChartIntel = useMemo(
    () =>
      computeSmartChartIntel({
        question: lastAskedQuestion,
        columns,
        rows: sortedInsightChartData,
        apiChartType: apiChartTypeFromContract(
          insightSnapshot?.contract,
          insightVisualization?.chartType ?? "bar"
        ),
        presentationKind: insightRenderedChartKind,
        stackedOrMultiSeries: isMultiMetricBarLayout(
          insightVisualization?.multiSeries?.layout
        ),
        multiSeriesLayout: insightVisualization?.multiSeries?.layout ?? null,
        groupedBarMeta:
          insightVisualization?.multiSeries?.layout === "grouped_bar"
            ? insightVisualization.multiSeries
            : null,
        categoryAxis: insightChartAxisLabels.categoryAxis,
        valueAxis: insightChartAxisLabels.valueAxis,
        routing: insightChartRoutingRecommendation,
        answerSummary: answer.trim().slice(0, 400) || undefined,
        semanticContext: insightSemanticContext,
        relationshipInsights: insightVisualization?.relationshipInsights ?? null,
        scatterXValues: insightVisualization?.scatterXValues,
        nearPerfectCorrelationCaution: insightCorrelationCaution,
      }),
    [
      lastAskedQuestion,
      columns,
      sortedInsightChartData,
      insightCorrelationCaution,
      insightVisualization?.chartType,
      insightVisualization?.relationshipInsights,
      insightVisualization?.scatterXValues,
      insightVisualization?.multiSeries,
      insightVisualization?.multiSeries?.layout,
      insightRenderedChartKind,
      insightChartAxisLabels.categoryAxis,
      insightChartAxisLabels.valueAxis,
      insightChartRoutingRecommendation,
      answer,
      insightSemanticContext,
    ]
  );

  const sessionChartMetadataLine = useMemo(
    () =>
      buildChartMetadataLine(
        sessionRenderedChartKind,
        chartData.length,
        visualization,
        null,
        false,
        {
          chartTitle: sessionDisplayChartTitle,
          filteredDatasetRows: rows,
          fullDatasetRows: kpis?.total_rows ?? null,
        }
      ),
    [
      sessionRenderedChartKind,
      chartData.length,
      visualization,
      sessionDisplayChartTitle,
      rows,
      kpis?.total_rows,
    ]
  );

  const insightChartMetadataLine = useMemo(
    () =>
      buildChartMetadataLine(
        insightRenderedChartKind,
        insightChartData.length,
        insightVisualization,
        alignedAnalysis,
        true,
        {
          chartTitle: insightDisplayChartTitle,
          filteredDatasetRows: rows,
          fullDatasetRows: kpis?.total_rows ?? null,
        }
      ),
    [
      insightRenderedChartKind,
      insightChartData.length,
      insightVisualization,
      alignedAnalysis,
      insightDisplayChartTitle,
      rows,
      kpis?.total_rows,
    ]
  );

  const sessionChartMetadataBadgeCompact = useMemo(
    () =>
      buildChartMetadataBadgeCompact(
        sessionRenderedChartKind,
        chartData.length,
        visualization,
        null,
        false,
        {
          filteredDatasetRows: rows,
          fullDatasetRows: kpis?.total_rows ?? null,
        }
      ),
    [
      sessionRenderedChartKind,
      chartData.length,
      visualization,
      rows,
      kpis?.total_rows,
    ]
  );

  const insightChartMetadataBadgeCompact = useMemo(
    () =>
      buildChartMetadataBadgeCompact(
        insightRenderedChartKind,
        insightChartData.length,
        insightVisualization,
        alignedAnalysis,
        true,
        {
          filteredDatasetRows: rows,
          fullDatasetRows: kpis?.total_rows ?? null,
        }
      ),
    [
      insightRenderedChartKind,
      insightChartData.length,
      insightVisualization,
      alignedAnalysis,
      rows,
      kpis?.total_rows,
    ]
  );

  const insightRowsAnalyzedDisplay = useMemo(
    () =>
      resolveAnalyzedRowsForChartMetadata({
        preferAlignedAnalysis: true,
        analysis: alignedAnalysis,
        prov: insightVisualization?.provenance ?? null,
        vizAnalyzedRows: insightVisualization?.analyzedRows,
        filteredDatasetRows: rows,
        fullDatasetRows: kpis?.total_rows ?? null,
      }),
    [
      alignedAnalysis,
      insightVisualization?.provenance,
      insightVisualization?.analyzedRows,
      rows,
      kpis?.total_rows,
    ]
  );

  const dualMetricRoasLead = useMemo((): DualMetricRoasLead | null => {
    if (insightVisualization?.multiSeries?.layout !== "grouped_bar") return null;
    const card = insightExecutiveVizInsights.find((c) => c.key === "dual-roas");
    if (!card?.value?.trim() || !card.hint?.trim()) return null;
    return { campaign: card.value.trim(), roas: card.hint.trim() };
  }, [
    insightVisualization?.multiSeries?.layout,
    insightExecutiveVizInsights,
  ]);

  const insightNumberedExecutiveBrief = useMemo((): string | null => {
    if (insightUnsupportedMultiMetric) return null;
    if (
      insightPresentationChartKind === "scatter" &&
      insightVisualization?.relationshipInsights
    ) {
      return null;
    }
    if (isTrendMode(insightSnapshot?.contract)) {
      return null;
    }
    const useRankingBrief =
      isGeographicRankingQuestion(lastAskedQuestion) ||
      isExecutiveTakeawaysQuestion(lastAskedQuestion);
    if (!useRankingBrief) {
      return null;
    }
    const briefRows = insightVisualization?.labels?.length
      ? zipStoredVisualizationPairs(insightVisualization).map((r) => ({
          label: r.label,
          value: r.value,
          formatted: r.formatted,
        }))
      : sortedInsightChartData
          .filter((r) => Number.isFinite(Number(r.value)))
          .map((r) => ({
            label: String(r.name ?? "").trim() || "—",
            value: Number(r.value),
            formatted:
              r.displayValue?.trim() ||
              fallbackChartNumericDisplay(
                insightPresentationChartKind || "bar",
                Number(r.value)
              ),
          }));
    if (briefRows.length < 2) return null;
    if (isGeographicRankingQuestion(lastAskedQuestion)) {
      return buildRankingExecutiveBrief({
        categoryAxis: insightChartAxisLabels.categoryAxis,
        valueAxis: insightChartAxisLabels.valueAxis,
        rows: briefRows,
      });
    }
    if (isExecutiveSummaryLayoutMode(lastAskedQuestion)) {
      const rankedApi = parseRankedExecutiveInsights(
        insightVisualization?.rankedExecutiveInsights
      );
      const rankedLines = rankedApi
        .map((r) => r.narrativeLine?.trim() || r.hint?.trim() || "")
        .filter(Boolean);
      if (rankedLines.length >= 2) {
        const fromRanked = buildNumberedExecutiveBriefFromRanked({
          question: lastAskedQuestion,
          lines: rankedLines,
        });
        if (fromRanked) return fromRanked;
      }
    }
    return buildNumberedExecutiveBrief({
      question: lastAskedQuestion,
      categoryAxis: insightChartAxisLabels.categoryAxis,
      valueAxis: insightChartAxisLabels.valueAxis,
      rows: briefRows,
    });
  }, [
    insightSnapshot?.contract,
    lastAskedQuestion,
    insightVisualization,
    sortedInsightChartData,
    insightChartAxisLabels.categoryAxis,
    insightChartAxisLabels.valueAxis,
    insightPresentationChartKind,
    insightUnsupportedMultiMetric,
    insightVisualization?.relationshipInsights,
    insightRelationshipEnriched,
  ]);

  const parsedInsightAnswer = useMemo(() => {
    if (insightUnsupportedMultiMetric) {
      return buildUnsupportedMultiMetricParsedSections(insightUnsupportedMultiMetric);
    }
    const parsed = parseAnswerIntoSections(
      answer,
      alignedAnalysis?.insightSummary ?? undefined
    );
    const c = insightSnapshot?.contract;
    const tone = insightNarrativeTone;
    const isRelScatter =
      insightPresentationChartKind === "scatter" &&
      Boolean(insightVisualization?.relationshipInsights);
    const softenDetail = (t?: string) => {
      const raw = t?.trim() ? t.trim() : "";
      if (!raw) return t;
      let sanitized = isTrendMode(c)
        ? sanitizeNarrativeForTrendContract(raw, c)
        : raw;
      if (isRelScatter) {
        sanitized = stripContradictoryCorrelationNarrative(
          sanitizeRelationshipUserFacingText(sanitized),
          insightRelationshipEnriched?.pearson ?? null
        );
      }
      return polishInsightNarrativeText(softenAssertiveProse(sanitized, tone));
    };
    const softenSummary = (t?: string) => {
      const raw = t?.trim() ? t.trim() : "";
      if (!raw) return t;
      let sanitized = isTrendMode(c)
        ? sanitizeNarrativeForTrendContract(raw, c)
        : raw;
      if (isRelScatter) {
        sanitized = stripContradictoryCorrelationNarrative(
          sanitizeRelationshipUserFacingText(sanitized),
          insightRelationshipEnriched?.pearson ?? null
        );
      }
      return polishInsightNarrativeText(softenAssertiveProse(sanitized, tone), {
        dualMetricRoasLead,
      });
    };
    const summaryTextRaw =
      insightNumberedExecutiveBrief ??
      softenSummary(parsed.summary) ??
      "";
    let summaryText = summaryTextRaw;
    if (insightUnsupportedGrowth) {
      summaryText = prependUnsupportedGrowthLead(
        summaryTextRaw,
        insightUnsupportedGrowth.leadSentence
      );
    } else if (insightUnsupportedTrend) {
      summaryText = prependUnsupportedTrendLead(
        summaryTextRaw,
        insightUnsupportedTrend.leadSentence
      );
    } else if (insightUnsupportedDecline) {
      summaryText = prependUnsupportedDeclineLead(
        summaryTextRaw,
        insightUnsupportedDecline.leadSentence
      );
    } else if (insightProfitMarginLead) {
      summaryText = prependProfitMarginLead(summaryTextRaw, insightProfitMarginLead);
    } else if (insightProfitMargin?.unavailable && insightProfitMargin.leadSentence) {
      summaryText = prependProfitMarginLead(
        summaryTextRaw,
        insightProfitMargin.leadSentence
      );
    }
    if (insightCorrelationCaution) {
      const lead = insightCorrelationCaution.trim();
      if (lead && !summaryText.toLowerCase().includes(lead.slice(0, 32).toLowerCase())) {
        summaryText = `${lead} ${summaryText}`.trim();
      }
    }
    return {
      ...parsed,
      summary: summaryText,
      statistical: softenDetail(parsed.statistical),
      hypotheses: softenDetail(parsed.hypotheses),
      recommendations: softenDetail(parsed.recommendations),
      methodology: softenDetail(parsed.methodology),
      moreDetail: softenDetail(parsed.moreDetail),
    };
  }, [
    answer,
    alignedAnalysis?.insightSummary,
    insightSnapshot?.contract,
    insightNarrativeTone,
    dualMetricRoasLead,
    insightNumberedExecutiveBrief,
    insightUnsupportedGrowth,
    insightUnsupportedTrend,
    insightUnsupportedDecline,
    insightUnsupportedMultiMetric,
    insightProfitMarginLead,
    insightProfitMargin,
    insightPresentationChartKind,
    insightVisualization?.relationshipInsights,
    insightRelationshipEnriched,
    insightCorrelationCaution,
  ]);

  const insightExecutiveBrief = useMemo(() => {
    if (insightUnsupportedMultiMetric) {
      return insightUnsupportedMultiMetric.leadSentence;
    }
    if (insightNumberedExecutiveBrief) {
      return polishInsightNarrativeText(insightNumberedExecutiveBrief);
    }
    const pinnedNarrative = narrativeCopyForContract(insightSnapshot?.contract);
    if (pinnedNarrative) {
      const brief = softenExecutiveTakeaway(pinnedNarrative, insightNarrativeTone);
      return polishInsightNarrativeText(brief, { dualMetricRoasLead });
    }
    const s = sanitizeNarrativeForTrendContract(
      parsedInsightAnswer.summary?.trim() ?? "",
      insightSnapshot?.contract
    );
    if (!s) return "";
    const brief = polishInsightNarrativeText(
      softenExecutiveTakeaway(s, insightNarrativeTone),
      { dualMetricRoasLead }
    );
    if (insightUnsupportedGrowth) {
      return prependUnsupportedGrowthLead(
        brief,
        insightUnsupportedGrowth.leadSentence
      );
    }
    if (insightUnsupportedTrend) {
      return prependUnsupportedTrendLead(
        brief,
        insightUnsupportedTrend.leadSentence
      );
    }
    if (insightUnsupportedDecline) {
      return prependUnsupportedDeclineLead(
        brief,
        insightUnsupportedDecline.leadSentence
      );
    }
    if (insightProfitMarginLead) {
      return prependProfitMarginLead(brief, insightProfitMarginLead);
    }
    return brief;
  }, [
    insightNumberedExecutiveBrief,
    parsedInsightAnswer.summary,
    insightSnapshot?.contract,
    insightNarrativeTone,
    dualMetricRoasLead,
    insightUnsupportedGrowth,
    insightUnsupportedTrend,
    insightUnsupportedDecline,
    insightUnsupportedMultiMetric,
    insightProfitMarginLead,
  ]);

  const exportExecutiveInsightsPreview = useMemo(() => {
    if (!exportOptions.includeChart || !exportOptions.includeAIInsight) return null;
    const scope =
      exportOptions.chartScope ??
      (insightChartMatchesCurrentQuestion && insightChartData.length > 0
        ? "insight"
        : "session");
    const facts =
      scope === "insight" ? insightExecutiveVizInsights : executiveVizInsights;
    const brief = insightExecutiveBrief.trim();
    if (!facts.length && !brief) return null;
    return {
      scopeLabel:
        scope === "insight"
          ? "Uses the AI Insight chart in the PDF."
          : "Uses the chart selected on the Charts tab.",
      brief: brief || null,
      facts: facts.slice(0, 4),
    };
  }, [
    exportOptions.includeChart,
    exportOptions.includeAIInsight,
    exportOptions.chartScope,
    insightExecutiveVizInsights,
    executiveVizInsights,
    insightExecutiveBrief,
  ]);

  const exportSelectedSectionLabels = useMemo(() => {
    const labels: string[] = [];
    if (exportOptions.includeKPIs) labels.push("KPIs");
    if (exportOptions.includeAIInsight) labels.push("AI Insight");
    if (exportOptions.includeChart) labels.push("Chart");
    if (exportOptions.includeDataPreview) labels.push("Data Preview");
    if (exportOptions.includeDataQuality) labels.push("Data Quality");
    if (exportOptions.includeConversationContext) labels.push("Conversation");
    if (exportOptions.includeTechnicalAppendix) labels.push("Technical appendix");
    return labels;
  }, [exportOptions]);

  const exportVizSummaryLabel = useMemo(() => {
    if (!visualization || visualization.labels.length === 0) {
      return "Not in session yet";
    }
    const kind = visualization.chartType?.trim() || "chart";
    const title = visualization.title?.trim();
    return title
      ? `${visualization.labels.length} points · ${kind} — ${title}`
      : `${visualization.labels.length} points · ${kind}`;
  }, [visualization]);

  const chartHistoryAsideRef = useRef<HTMLDivElement | null>(null);
  const chartHistoryScrollRestore = useRef<number | null>(null);

  const chartHistorySections = useMemo(() => {
    const ai = chartHistory.filter((h) => h.source === "ai");
    const auto = chartHistory.filter((h) => h.source === "auto_dashboard");
    const aiSorted = [...ai].sort((a, b) => {
      if (insightChartId && a.id === insightChartId) return -1;
      if (insightChartId && b.id === insightChartId) return 1;
      return b.createdAt - a.createdAt;
    });
    const autoSorted = [...auto].sort((a, b) => b.createdAt - a.createdAt);
    return { aiSorted, autoSorted };
  }, [chartHistory, insightChartId]);

  useLayoutEffect(() => {
    if (chartHistoryScrollRestore.current == null) return;
    const y = chartHistoryScrollRestore.current;
    chartHistoryScrollRestore.current = null;
    const el = chartHistoryAsideRef.current;
    if (el) el.scrollTop = y;
  });

  const selectChartPreserveScroll = useCallback(
    (id: string | null) => {
      chartHistoryScrollRestore.current =
        chartHistoryAsideRef.current?.scrollTop ?? null;
      startTabTransition(() =>
        selectChartWithInsightState(id, {
          restoreFromStore: true,
          clearAnswerWhenMissing: true,
        })
      );
    },
    [selectChartWithInsightState, startTabTransition]
  );

  const downloadReportImplRef = useRef<
    (options?: Partial<ExportOptions>) => Promise<void>
  >(async () => {});

  downloadReportImplRef.current = async (options?: Partial<ExportOptions>) => {
      let pdfCaptureActive = false;
      try {
        setError("");
        const pdfRemaining = planUsage?.usage.pdf_exports_remaining;
        if (!canExportPdf(planTier, pdfRemaining)) {
          const msg =
            "You've reached today's limit of 1 PDF export. Upgrade to Paid for unlimited PDF exports.";
          openUpgradeModal("pdf_exports", msg);
          setError(msg);
          return;
        }
        const resolved: ExportOptions = {
        ...exportOptions,
        ...options,
      };
      const chartScope: "insight" | "session" =
        resolved.chartScope ??
        (insightChartMatchesCurrentQuestion && insightChartData.length > 0
          ? "insight"
          : "session");
      const pdfAlignedAnalysis =
        chartScope === "insight" ? insightAnalysisForExport : alignedAnalysis;
      const pdfInsightAnswer =
        chartScope === "insight" ? insightAnswerForExport : answer;
      const pdfSnap =
        chartScope === "insight" ? insightSnapshot : activeSnapshot;
      const pdfChartDataRaw = pdfSnap?.chartData ?? [];
      const pdfChartTitle = pdfSnap?.title ?? "";
      const pdfChartSubtitle = pdfSnap?.subtitle ?? "";
      const pdfVizEarly =
        (pdfSnap?.visualization ?? null) as StoredVisualization | null;
      const pdfPresentationKindBase =
        chartScope === "insight"
          ? insightRenderedChartKind
          : sessionRenderedChartKind;
      const pdfPresentationKind = (() => {
        if (!pdfChartDataRaw.length || !pdfPresentationKindBase) {
          return pdfPresentationKindBase;
        }
        const q =
          chartScope === "insight"
            ? lastAskedQuestion.trim() || question.trim()
            : question.trim() || lastAskedQuestion.trim();
        const recomputed = computeFinalChartPresentation({
          apiChartType:
            pdfVizEarly?.chartType ?? pdfPresentationKindBase ?? "bar",
          title: pdfChartTitle,
          question: q,
          rows: pdfChartDataRaw,
        });
        if (
          (pdfPresentationKindBase === "pie" ||
            pdfPresentationKindBase === "donut") &&
          recomputed !== "pie" &&
          recomputed !== "donut"
        ) {
          return recomputed;
        }
        return pdfPresentationKindBase;
      })();
      const pdfContract = pdfSnap?.contract;
      const exportContractCheck = validateExportMatchesContract({
        exportChartId: pdfSnap?.id ?? null,
        exportChartType: pdfPresentationKind,
        exportDimension:
          pdfContract?.dimension ??
          (chartScope === "insight"
            ? insightChartAxisLabels.categoryAxis
            : chartAxisLabels.categoryAxis),
        contract: pdfContract,
      });
      if (!exportContractCheck.ok) {
        console.warn(
          "[PDF export] visualization contract mismatch",
          exportContractCheck.warnings
        );
        setError(
          "Export blocked: chart no longer matches the selected visualization. Re-select the chart from Overview or Charts."
        );
        return;
      }
      const pdfViz =
        (pdfSnap?.visualization ?? null) as StoredVisualization | null;
      const pdfTrendMode = isTrendMode(pdfContract);
      const pdfAnalysisForSort =
        pdfSnap?.source === "auto_dashboard" || pdfTrendMode
          ? null
          : chartScope === "insight"
            ? pdfAlignedAnalysis
            : activeSnapshot?.id === insightChartId &&
                insightSnapshot?.source !== "auto_dashboard"
              ? pdfAlignedAnalysis
              : null;
      const pdfSortAscending = pdfTrendMode
        ? null
        : isAscendingValueIntent(pdfAnalysisForSort, pdfViz);
      const pdfChartData = sortRowsForPresentation(
        pdfChartDataRaw,
        pdfPresentationKind,
        pdfSortAscending,
        pdfTrendMode
      );
      const pdfProv = pdfViz?.provenance;
      const pdfRankedSignals =
        resolved.includeChart &&
        pdfChartData.length > 0 &&
        pdfPresentationKind !== "scatter"
          ? computePdfRankedSignalsFromChartRows(
              pdfChartData,
              pdfPresentationKind,
              3,
              pdfChartDataRaw,
              pdfTrendMode,
              pdfSortAscending,
              pdfTrendMode
                ? resolveTrendBucketLabel({
                    title: pdfChartTitle,
                    timeSeriesAnalysis: pdfProv?.timeSeriesAnalysis ?? null,
                    timeBucketLabelOverride:
                      pdfSnap?.finalPresentation?.grain ??
                      pdfContract?.timeBucketLabel ??
                      null,
                    labels: pdfChartData.map((r) => String(r.name ?? "")),
                  })
                : "Weekly"
            )
          : null;
      const pdfMetricColumn =
        pdfProv?.numericColumn?.trim() ||
        alignedAnalysis?.metricColumn?.trim() ||
        null;
      const pdfMetricDisplayRaw =
        pdfProv?.numericColumnDisplay?.trim() ||
        alignedAnalysis?.metricColumnDisplay?.trim() ||
        "";
      const pdfAggKey =
        pdfProv?.aggregationKey ?? alignedAnalysis?.aggregationKey ?? null;
      const pdfAggregation =
        pdfProv?.aggregation ?? alignedAnalysis?.aggregation ?? null;

      const pdfAlignedMetricDisplay =
        (pdfMetricDisplayRaw ? polishMetricDisplay(pdfMetricDisplayRaw) : "") ||
        (pdfMetricColumn
          ? buildMetricLabel({
              metricColumnDisplay: null,
              aggregationKey: pdfAggKey ?? pdfAggregation,
              aggregationLabel: pdfAggregation,
              metricColumn: pdfMetricColumn,
            })
          : "") ||
        (alignedAnalysis?.metricColumn
          ? buildMetricLabel({
              metricColumnDisplay: alignedAnalysis.metricColumnDisplay,
              aggregationKey:
                alignedAnalysis.aggregationKey ?? alignedAnalysis.aggregation,
              aggregationLabel: alignedAnalysis.aggregation,
              metricColumn: alignedAnalysis.metricColumn,
            })
          : "") ||
        null;

      const pdfChartSubtitleMerged = (() => {
        const base = pdfChartSubtitle.trim();
        const stats = buildChartSubtitle({
          rowsAnalyzed: resolveAnalyzedRowsForChartMetadata({
            preferAlignedAnalysis: true,
            analysis: alignedAnalysis,
            prov: pdfProv ?? null,
            vizAnalyzedRows: (pdfViz as StoredVisualization | null)?.analyzedRows,
            filteredDatasetRows: rows,
            fullDatasetRows: kpis?.total_rows ?? null,
          }),
          chartPoints: pdfProv?.chartPoints ?? null,
        });
        if (!stats) return base;
        if (
          base &&
          (/\d[\d,]*\s+rows\s+analyzed/i.test(base) ||
            /\d[\d,]*\s+chart\s+points/i.test(base))
        ) {
          return base;
        }
        return base ? `${base} · ${stats}` : stats;
      })();

      const pdfSemanticsAnalysis =
        pdfSnap?.source === "auto_dashboard" || pdfTrendMode
          ? null
          : chartScope === "insight"
            ? alignedAnalysis
            : pdfAnalysisForSort;

      const pdfVizForSemantics = sanitizeVisualizationSemanticLabels(
        pdfViz,
        pdfSemanticsAnalysis,
        chartScope === "insight" && pdfSnap?.source !== "auto_dashboard"
      );
      const pdfNormMeta = buildNormalizedVizMetadata({
        rawPersistedTitle: pdfChartTitle,
        chartSubtitle: pdfChartSubtitleMerged,
        presentationKind: pdfPresentationKind,
        viz: pdfVizForSemantics,
        analysis: pdfSemanticsAnalysis,
        preferAnalysisForCategory:
          chartScope === "insight" &&
          pdfSnap?.source !== "auto_dashboard" &&
          !pdfTrendMode,
      });
      const pdfExportDisplayTitle =
        contractDisplayTitle(pdfContract, "") ||
        (chartScope === "insight" && pdfSnap?.source !== "auto_dashboard"
          ? insightDisplayChartTitle.trim() || pdfNormMeta.chartTitle
          : pdfSnap?.source === "auto_dashboard"
            ? pdfChartTitle.trim() || pdfNormMeta.chartTitle
            : pdfNormMeta.chartTitle);

      const pdfChartInsightBadge =
        chartScope === "insight"
          ? insightChartInsightBadge
          : chartInsightBadge;

      const includeConvPdf = resolved.includeConversationContext === true;
      const followUpAssumption = lastConversationMeta?.inheritedAssumptionNote?.trim() ?? "";
      const pdfRowsResolved = pdfProv
        ? resolveAnalyzedRowsForChartMetadata({
            preferAlignedAnalysis: true,
            analysis: alignedAnalysis,
            prov: pdfProv,
            vizAnalyzedRows: pdfViz?.analyzedRows,
            filteredDatasetRows: rows,
            fullDatasetRows: kpis?.total_rows ?? null,
          })
        : null;
      const provenanceSlice = pdfProv
        ? {
            confidence: pdfProv.confidence,
            rowsAnalyzed: pdfRowsResolved ?? pdfProv.rowsAnalyzed,
            chartPoints: pdfProv.chartPoints,
            aggregation: pdfProv.aggregation,
            notes: pdfProv.notes != null ? String(pdfProv.notes) : null,
          }
        : null;

      const conversationAppendix = includeConvPdf
        ? (() => {
            const chainBase =
              aiConversationState.followUpChain.length > 0
                ? [...aiConversationState.followUpChain]
                : [...(conversationSnapshot?.followUpChain ?? [])];
            const qNow = question.trim();
            let thread: string[];
            if (chainBase.length) {
              thread =
                qNow && chainBase[chainBase.length - 1] !== qNow
                  ? [...chainBase, qNow]
                  : [...chainBase];
            } else {
              thread = qNow ? [qNow] : [];
            }
            return {
              questionThread: thread,
              inheritedFilters: [...aiConversationState.activeFilters],
              activeDrillPath: [...aiConversationState.activeDrillPath],
              inheritedAssumptionNote: followUpAssumption || null,
            };
          })()
        : null;

      const chartExportAttribution =
        pdfSnap?.source === "auto_dashboard"
          ? "Auto dashboard visualization — chart from the overview dashboard (filtered cohort), not from an AI-specific chart rule for the question above."
          : pdfSnap?.source === "ai" && pdfChartData.length === 0
            ? "No dedicated visualization for this answer — the PDF includes narrative and other sections; the chart area is intentionally blank."
            : null;

      const pdfChartAxisLabels = resolved.includeChart
        ? (() => {
            const pdfMergeAnalysis =
              pdfSnap?.source === "auto_dashboard"
                ? null
                : chartScope === "insight"
                  ? alignedAnalysis
                  : pdfAnalysisForSort;
            const pdfMergePrefer = Boolean(pdfMergeAnalysis);
            const base = inferChartAxesFromContext(
              pdfNormMeta.titleForInference,
              pdfChartSubtitleMerged,
              lastAskedQuestion,
              datasetKind || "generic"
            );
            const viz = pdfViz;
            const isScatter =
              String(pdfVizForSemantics?.chartType ?? "").toLowerCase() ===
              "scatter";
            if (
              isScatter &&
              pdfVizForSemantics?.scatterXLabel?.trim() &&
              pdfVizForSemantics?.scatterYLabel?.trim()
            ) {
              let xLabel = pdfVizForSemantics.scatterXLabel.trim();
              let yLabel = pdfVizForSemantics.scatterYLabel.trim();
              if (pdfMergePrefer && pdfMergeAnalysis) {
                const cDisp = pdfMergeAnalysis.categoryColumnDisplay?.trim();
                const cCol = pdfMergeAnalysis.categoryColumn?.trim();
                const mDisp = pdfMergeAnalysis.metricColumnDisplay?.trim();
                const mCol = pdfMergeAnalysis.metricColumn?.trim();
                if (cDisp || cCol)
                  xLabel = cDisp || humanizeColumnName(cCol!);
                if (mDisp || mCol) {
                  yLabel = mDisp
                    ? polishMetricDisplay(mDisp)
                    : buildAxisLabelFromAggColumn(
                        String(
                          pdfMergeAnalysis.aggregationKey ??
                            pdfMergeAnalysis.aggregation ??
                            ""
                        )
                          .trim()
                          .toLowerCase() || "sum",
                        mCol!
                      );
                }
              }
              return {
                category: xLabel,
                value: yLabel,
              };
            }
            const ms = pdfVizForSemantics?.multiSeries;
            if (ms?.layout === "grouped_bar" && ms.seriesKeys?.length) {
              const full = groupedBarMeasureChipLabel(
                ms as NonNullable<StoredVisualization["multiSeries"]>
              );
              const refinedGrouped: ChartAxes = {
                categoryAxis: ms.categoryAxisTitle?.trim() || base.categoryAxis,
                valueAxis: full,
                valueAxisCompact: compactAxisLabelFromFullPhrase(full),
              };
              const categoryGrouped = resolveSemanticCategoryAxisForCharts({
                presentationKind: pdfPresentationKind,
                chartTitle: pdfChartTitle,
                grainTitleHint: pdfNormMeta.grainHintTitle,
                viz: pdfVizForSemantics,
                analysis: pdfSemanticsAnalysis,
                preferAnalysisForCategory:
                  chartScope === "insight" &&
                  pdfSnap?.source !== "auto_dashboard",
                refinedCategoryFallback: refinedGrouped.categoryAxis,
              });
              const axesGrouped: ChartAxes = {
                categoryAxis: categoryGrouped,
                valueAxis: refinedGrouped.valueAxis,
                valueAxisCompact: refinedGrouped.valueAxisCompact,
              };
              const mergedGrouped = mergeInsightAxesWithAlignedAnalysis({
                axes: axesGrouped,
                presentationKind: pdfPresentationKind,
                viz: pdfVizForSemantics,
                analysis: pdfMergeAnalysis,
                preferAligned: pdfMergePrefer,
                grainHintTitle: pdfNormMeta.grainHintTitle,
                rawChartTitle: pdfChartTitle,
                mode: "category_only",
              });
              const outGrouped = {
                ...mergedGrouped,
                valueAxis: refinedGrouped.valueAxis,
                valueAxisCompact: refinedGrouped.valueAxisCompact,
              };
              return {
                category: outGrouped.categoryAxis,
                value: outGrouped.valueAxis,
              };
            }
            if (ms?.layout === "stacked_bar" && ms.seriesKeys?.length) {
              const full = ms.stackAxisTitle
                ? `Total (${ms.stackAxisTitle} stacked)`
                : base.valueAxis;
              const refinedStack: ChartAxes = {
                categoryAxis: ms.categoryAxisTitle?.trim() || base.categoryAxis,
                valueAxis: full,
                valueAxisCompact: ms.stackAxisTitle
                  ? compactAxisLabelFromFullPhrase(`Total ${ms.stackAxisTitle}`)
                  : base.valueAxisCompact,
              };
              const category = resolveSemanticCategoryAxisForCharts({
                presentationKind: pdfPresentationKind,
                chartTitle: pdfChartTitle,
                grainTitleHint: pdfNormMeta.grainHintTitle,
                viz: pdfVizForSemantics,
                analysis: pdfSemanticsAnalysis,
                preferAnalysisForCategory:
                  chartScope === "insight" &&
                  pdfSnap?.source !== "auto_dashboard",
                refinedCategoryFallback: refinedStack.categoryAxis,
              });
              const axesPdf: ChartAxes = {
                categoryAxis: category,
                valueAxis: refinedStack.valueAxis,
                valueAxisCompact: refinedStack.valueAxisCompact,
              };
              const merged = mergeInsightAxesWithAlignedAnalysis({
                axes: axesPdf,
                presentationKind: pdfPresentationKind,
                viz: pdfVizForSemantics,
                analysis: pdfMergeAnalysis,
                preferAligned: pdfMergePrefer,
                grainHintTitle: pdfNormMeta.grainHintTitle,
                rawChartTitle: pdfChartTitle,
                mode: "category_only",
              });
              const out = {
                ...merged,
                valueAxis: refinedStack.valueAxis,
                valueAxisCompact: refinedStack.valueAxisCompact,
              };
              return {
                category: out.categoryAxis,
                value: out.valueAxis,
              };
            }
            const refined = refineChartAxesWithAnalysis(
              base,
              viz,
              pdfSemanticsAnalysis
            );
            const category = resolveSemanticCategoryAxisForCharts({
              presentationKind: pdfPresentationKind,
              chartTitle: pdfChartTitle,
              grainTitleHint: pdfNormMeta.grainHintTitle,
              viz: pdfVizForSemantics,
              analysis: pdfSemanticsAnalysis,
              preferAnalysisForCategory:
                chartScope === "insight" &&
                pdfSnap?.source !== "auto_dashboard",
              refinedCategoryFallback: refined.categoryAxis,
            });
            const axesPdf: ChartAxes = {
              categoryAxis: category,
              valueAxis: refined.valueAxis,
              valueAxisCompact: refined.valueAxisCompact,
            };
            const merged = mergeInsightAxesWithAlignedAnalysis({
              axes: axesPdf,
              presentationKind: pdfPresentationKind,
              viz: pdfVizForSemantics,
              analysis: pdfMergeAnalysis,
              preferAligned: pdfMergePrefer,
              grainHintTitle: pdfNormMeta.grainHintTitle,
              rawChartTitle: pdfChartTitle,
              mode: "full",
            });
            return {
              category: merged.categoryAxis,
              value: merged.valueAxis,
            };
          })()
        : null;

      let captureEl: HTMLDivElement | null = null;
      if (resolved.includeChart) {
        setPdfCaptureMounted(true);
        pdfCaptureActive = true;
        captureEl = await waitForHiddenChartCapture(() =>
          chartScope === "insight"
            ? chartCaptureInsightRef.current
            : chartCaptureSessionRef.current
        );
      }

      const chartPrep: PdfChartPrepContext | null = resolved.includeChart
        ? {
            presentationKind:
              pdfChartData.length > 0
                ? pdfPresentationKind
                : ("" as ChartKind),
            chartData: pdfChartData,
            chartTitle: pdfChartTitle,
            chartSubtitleMerged: pdfChartSubtitleMerged,
            exportDisplayTitle: pdfExportDisplayTitle,
            trendMode: pdfTrendMode,
            contract: pdfContract,
            rankedSignals: pdfRankedSignals,
            metricColumn: pdfMetricColumn,
            alignedMetricDisplay: pdfAlignedMetricDisplay,
            aggregation: pdfAggregation,
            chartInsightBadge: pdfChartInsightBadge,
            chartAxisLabels: pdfChartAxisLabels,
            captureEl,
            chartAttribution: chartExportAttribution,
            provenanceSlice,
            metricType: pdfViz?.chartRecommendation?.metricType ?? null,
            roundingHint: pdfViz?.roundingHint ?? null,
            vizMetricType: pdfViz?.chartRecommendation?.metricType ?? null,
          }
        : null;

      const built = buildExecutivePdfExportInput({
        options: resolved,
        chartScope,
        chartPrep,
        reportBranding,
        mappingConfidence,
        rows,
        columns,
        selectedSheet: selectedSheet || undefined,
        uploadFileName: uploadMeta?.name,
        datasetKind: datasetKind || "generic",
        profile,
        preview: dataPreviewSortedRows.slice(
          0,
          15
        ) as Record<string, unknown>[],
        kpis,
        alignedAnalysis,
        pdfAlignedAnalysis,
        question,
        lastAskedQuestion,
        pdfInsightAnswer,
        parsedInsightAnswer,
        insightExecutiveBrief,
        insightExecutiveVizInsights,
        executiveVizInsights,
        insightSmartChartIntel,
        sessionSmartChartIntel,
        displayKpiCards,
        primaryMetricColumn: effectiveSales,
        primaryBreakdownColumn: effectiveProduct,
        insightNarrativeTone,
        insightNarrativeDisclaimer,
        pdfSnapSource: pdfSnap?.source,
        chartHistory,
        conversationAppendix,
      });

      if (!built.ok) {
        if (built.error) setError(built.error);
        return;
      }

      if (
        !shouldReservePdfExportQuota({
          contractCheckOk: exportContractCheck.ok,
          buildInputOk: built.ok,
        })
      ) {
        setError("Export blocked: preflight checks did not pass.");
        return;
      }

      let quotaReserved = false;
      try {
        const nextUsage = await reservePdfExport();
        quotaReserved = true;
        setPlanUsage(nextUsage);
        setPlanTierState(nextUsage.tier);
        notifyUsageRefresh();
      } catch (err) {
        const detail = (err as { detail?: unknown }).detail;
        if (handleApiLimitDetail(detail)) {
          setError(extractApiErrorMessage(detail));
          return;
        }
        setError("Unable to reserve PDF export.");
        return;
      }

      try {
        const { runExecutivePdfExport } = await import("./pdf-report");
        await runExecutivePdfExport(built.input);
      } catch (exportErr) {
        if (quotaReserved) {
          try {
            const refunded = await refundPdfExport();
            setPlanUsage(refunded);
            notifyUsageRefresh();
          } catch (refundErr) {
            console.warn("[PDF export] quota refund failed", refundErr);
          }
        }
        throw exportErr;
      }
    } catch (err) {
      console.error("PDF generation failed:", err);
      setError("Unable to generate PDF report.");
    } finally {
      if (pdfCaptureActive) setPdfCaptureMounted(false);
    }
  };

  const downloadReport = useCallback(
    (options?: Partial<ExportOptions>) => downloadReportImplRef.current(options),
    []
  );

  const renderDatasetChart = (
    chartHeight: number,
    compact = false,
    insightMode = false
  ) => (
    <ChartRenderer
      chartHeight={chartHeight}
      compact={compact}
      insightMode={insightMode}
      pngCaptureMode={false}
      chartRows={insightMode ? sortedInsightChartData : sortedChartData}
      visualization={
        (insightMode ? insightVisualization : visualization) as ChartRendererViz
      }
      presentationKind={
        insightMode ? insightPresentationChartKind : presentationChartKind
      }
      axes={insightMode ? insightChartAxisLabels : chartAxisLabels}
      viewportW={activeSessionViewportW}
      sessionCartesianPlanMain={sessionCartesianPlan}
      insightCartesianPlanMain={insightCartesianPlanMain}
      tickTruncate={tickTruncate}
      onInsightDrill={insightChartDrill}
    />
  );

  const sessionChartReason = useMemo(
    () =>
      generateChartReason(
        {
          chartType: sessionRenderedChartKind,
          measure: chartAxisLabels.valueAxis,
          category: chartAxisLabels.categoryAxis,
          question: lastAskedQuestion,
          metadata: {
            groupCount: sortedChartData.length,
            stackedOrMultiSeries: isMultiMetricBarLayout(
              visualization?.multiSeries?.layout
            ),
            groupedBar: visualization?.multiSeries?.layout === "grouped_bar",
            groupedBarMeta:
              visualization?.multiSeries?.layout === "grouped_bar"
                ? visualization.multiSeries
                : null,
            histogramStyle: sessionSmartChartIntel?.histogramStyle ?? false,
            routingExplanation:
              chartRoutingRecommendation?.selectionExplanation ?? null,
            detectedIntent: chartRoutingRecommendation?.detectedIntent ?? null,
            recommendationHint:
              sessionSmartChartIntel?.recommendationBlurb ?? null,
          },
        },
        sortedChartData
      ),
    [
      sessionRenderedChartKind,
      chartAxisLabels.valueAxis,
      chartAxisLabels.categoryAxis,
      lastAskedQuestion,
      sortedChartData,
      visualization?.multiSeries?.layout,
      sessionSmartChartIntel?.histogramStyle,
      sessionSmartChartIntel?.recommendationBlurb,
      chartRoutingRecommendation?.selectionExplanation,
      chartRoutingRecommendation?.detectedIntent,
    ]
  );

  const chartHeadingBlock =
    sessionDisplayChartTitle || chartSubtitle ? (
      <div className={chartsTabVizHeaderZone}>
        {sessionDisplayChartTitle ? (
          <h3 className={aiInsightsVizTitle}>{sessionDisplayChartTitle}</h3>
        ) : null}
        {chartSubtitle ? (
          <p className={aiInsightsVizSubtitle}>{chartSubtitle}</p>
        ) : null}
      </div>
    ) : null;

  const insightChartHeadingBlock =
    insightDisplayChartTitle || insightChartSubtitle ? (
      <div className={aiInsightsVizHeadingWrap}>
        {insightDisplayChartTitle ? (
          <h3 className={aiInsightsVizTitle}>{insightDisplayChartTitle}</h3>
        ) : null}
        {insightChartSubtitle ? (
          <p className={aiInsightsVizSubtitle}>{insightChartSubtitle}</p>
        ) : null}
      </div>
    ) : null;

  return (
    <AppShell
      activeTab={activeTab}
      onNavigate={handleMainTabClick}
      datasetLoaded={columns.length > 0}
      onPilotNav={handlePilotNav}
      pilotNavActive={pilotNavActive}
    >
        {error && activeTab !== "insights" ? (
          <div className="mb-4 mt-6 flex items-start justify-between gap-3 rounded-xl border border-red-200/70 bg-red-50/90 p-3.5 text-red-800 shadow-[0_1px_2px_rgba(185,28,28,0.06)] dark:border-rose-500/30 dark:bg-rose-950/35 dark:text-rose-100">
            <p className="min-w-0 flex-1 text-sm leading-relaxed">{error}</p>
            <button
              type="button"
              onClick={() => setError("")}
              className="shrink-0 text-xs font-semibold uppercase tracking-wide text-red-800/90 underline-offset-2 transition hover:text-red-950 hover:underline dark:text-rose-200/90 dark:hover:text-rose-50"
            >
              Dismiss
            </button>
          </div>
        ) : null}

        {uploadMessage && (
          <div className="mb-4 mt-6 rounded-xl border border-emerald-200/70 bg-emerald-50/90 p-3.5 text-sm text-emerald-900 shadow-[0_1px_2px_rgba(16,185,129,0.06)]">
            {uploadMessage}
          </div>
        )}
        {mappingMessage && (
          <div className="mb-4 mt-6 rounded-xl border border-emerald-200/70 bg-emerald-50/90 p-3.5 text-sm text-emerald-900 shadow-[0_1px_2px_rgba(16,185,129,0.06)]">
            {mappingMessage}
          </div>
        )}

        <div>
          {(activeTab === "overview" || activeTab === "insights") &&
          columns.length > 0 ? (
            <div className="mb-4">
              <FilterPanel
                dashboardFilters={dashboardFilters}
                dimensionOptions={dimensionOptions}
                filterBreadcrumb={filterBreadcrumb}
                dashboardEmpty={dashboardEmpty}
                dateStart={dashDateStart}
                dateEnd={dashDateEnd}
                onPickDimension={upsertExplorerFilter}
                onRemoveFilter={removeExplorerFilter}
                onClearAll={clearExplorerFilters}
                onDateStart={setDashDateStart}
                onDateEnd={setDashDateEnd}
                appearance="dashboard"
                overviewFilterCompact
              />
            </div>
          ) : null}
          {pdfCaptureMounted && chartData.length > 0 && (
            <div
              ref={chartCaptureSessionRef}
              className="pdf-chart-capture chart-viz-theme fixed left-[-10000px] top-0 z-0 w-[860px] min-h-[400px] overflow-hidden rounded-lg border border-slate-100/90 bg-white p-4 pb-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
              aria-hidden="true"
            >
              {chartHeadingBlock}
              <div
                className="w-full min-h-[280px]"
                style={{ height: chartHeightMain }}
              >
                {renderDatasetChart(chartHeightMain, false, false)}
              </div>
            </div>
          )}
          {pdfCaptureMounted && insightChartData.length > 0 && (
            <div
              ref={chartCaptureInsightRef}
              className="pdf-chart-capture chart-viz-theme fixed left-[-10000px] top-0 z-0 w-[860px] min-h-0 overflow-hidden rounded-xl border border-slate-200/70 bg-white p-4 pb-5 shadow-[0_8px_28px_-10px_rgb(15_23_42_/_0.1)]"
              aria-hidden="true"
            >
              {insightChartHeadingBlock}
              <AiInsightChartShell
                chartKind={insightPresentationChartKind}
                plotHeight={insightShellPlotHeight}
              >
                <div className={aiInsightsVizPlotSurface}>
                  {renderDatasetChart(insightShellPlotHeight, false, true)}
                </div>
              </AiInsightChartShell>
            </div>
          )}

          {activeTab === "overview" && (
            <>
            {columns.length === 0 ? <OverviewLandingHero /> : null}
            <div className="grid w-full min-w-0 grid-cols-1 gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:gap-6">
              {columns.length > 0 && !overviewUploadExpanded ? (
                <section className={`col-span-1 min-w-0 lg:col-span-2 p-4 sm:p-5 order-1 ${ovCard}`}>
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-8 sm:gap-y-2">
                      <div className="flex items-center gap-2 shrink-0">
                        <span
                          className="h-2.5 w-2.5 rounded-full bg-emerald-500"
                          aria-hidden
                        />
                        <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                          Dataset ready
                        </span>
                      </div>
                      <dl className="grid min-w-0 gap-x-6 gap-y-1 text-sm sm:grid-cols-2 lg:grid-cols-6">
                        <div className="min-w-0 sm:col-span-2 lg:col-span-2">
                          <dt className={ovMuted}>File</dt>
                          <dd
                            className="min-w-0 font-medium text-foreground"
                            title={uploadMeta?.name || undefined}
                          >
                            <span className="block min-w-0">
                              {uploadMeta?.name
                                ? formatOverviewFilenameMiddle(uploadMeta.name, 56)
                                : "—"}
                            </span>
                            {uploadMeta?.size_bytes != null ? (
                              <span className={`mt-0.5 block text-xs font-normal ${ovMuted}`}>
                                {formatBytes(uploadMeta.size_bytes)}
                              </span>
                            ) : null}
                          </dd>
                        </div>
                        <div>
                          <dt className={ovDataLabel}>Rows</dt>
                          <dd className={ovDataValue}>{rows}</dd>
                        </div>
                        <div>
                          <dt className={ovDataLabel}>Columns</dt>
                          <dd className={ovDataValue}>{columns.length}</dd>
                        </div>
                        <div className="min-w-0">
                          <dt className={ovDataLabel}>Sheet</dt>
                          <dd className={`truncate ${ovDataValue}`}>
                            {selectedSheet.trim() ||
                              (uploadMeta?.name ?? "").toLowerCase().endsWith(".csv")
                                ? "CSV"
                                : "—"}
                          </dd>
                        </div>
                      </dl>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={openOverviewReplaceUpload}
                        title="Upload a new CSV or Excel file (replaces the dataset in this session)"
                        className={ovOverviewSecondaryBtn}
                      >
                        Replace file
                      </button>
                    </div>
                  </div>
                </section>
              ) : (
                <>
                  <section
                    className={`overview-landing-upload-card min-w-0 p-5 sm:p-6 order-1 ${
                      columns.length === 0
                        ? "lg:col-span-2 mx-auto w-full max-w-4xl"
                        : ""
                    } ${ovCard}`}
                  >
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <h2 className={ovSectionTitle}>
                          {columns.length > 0 ? "Upload a new file" : "Upload your dataset"}
                        </h2>
                        <p className={`mt-1 ${ovSectionDesc}`}>
                          {columns.length > 0
                            ? "CSV, Excel, JSON, or Parquet — replaces the dataset in this session."
                            : "Drop a file or browse — upload starts automatically."}
                        </p>
                      </div>
                    </div>

                    <div className="mt-4">
                      <input
                        ref={overviewFileInputRef}
                        type="file"
                        accept={OVERVIEW_UPLOAD_ACCEPT}
                        className="sr-only"
                        aria-label="Choose dataset file (CSV, Excel, JSON, or Parquet)"
                        onChange={(e) => {
                          const next = e.target.files?.[0];
                          if (next) assignOverviewPickedFile(next);
                        }}
                      />
                      <div
                        role="button"
                        tabIndex={0}
                        aria-label={
                          file
                            ? `Selected file ${file.name}. Click to choose a different file.`
                            : "Choose a dataset file. Drag and drop or click to browse."
                        }
                        onClick={() => overviewFileInputRef.current?.click()}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            overviewFileInputRef.current?.click();
                          }
                        }}
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                        }}
                        onDragEnter={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setOverviewDropActive(true);
                        }}
                        onDragLeave={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          const el = e.currentTarget as HTMLElement;
                          const rect = el.getBoundingClientRect();
                          const x = e.clientX;
                          const y = e.clientY;
                          if (
                            x < rect.left ||
                            x >= rect.right ||
                            y < rect.top ||
                            y >= rect.bottom
                          ) {
                            setOverviewDropActive(false);
                          }
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setOverviewDropActive(false);
                          const next = e.dataTransfer.files?.[0];
                          if (next) assignOverviewPickedFile(next);
                        }}
                        className={`${ovUploadDropzone} rounded-xl border-2 border-dashed transition-colors ${
                          file
                            ? "p-3 sm:p-4"
                            : "overview-landing-dropzone-empty p-6 sm:p-10 text-center"
                        } ${
                          overviewDropActive
                            ? ovUploadDropzoneActive
                            : ovUploadDropzoneIdle
                        }`}
                      >
                        {file ? (
                          <OverviewUploadSelectedState
                            fileName={file.name}
                            fileSizeLabel={formatBytes(file.size)}
                            uploading={loading}
                          />
                        ) : (
                          <>
                            <div className="overview-upload-dropzone__icon" aria-hidden>
                              <svg
                                width="17"
                                height="17"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.75"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                <polyline points="17 8 12 3 7 8" />
                                <line x1="12" y1="3" x2="12" y2="15" />
                              </svg>
                            </div>
                            <p className="text-sm font-medium text-foreground">
                              Drag and drop a file here
                            </p>
                            <p className={`mt-1 text-xs ${ovMuted}`}>
                              {OVERVIEW_UPLOAD_FORMAT_HINT}
                            </p>
                          </>
                        )}
                      </div>

                      <div className="overview-upload-actions mt-3 flex flex-wrap items-center gap-3">
                        {file && !loading ? (
                          <button
                            type="button"
                            onClick={() => overviewFileInputRef.current?.click()}
                            className={ovBtnSecondarySm}
                          >
                            Choose another file
                          </button>
                        ) : null}
                        {columns.length > 0 ? (
                          <button
                            type="button"
                            onClick={cancelOverviewReplaceUpload}
                            disabled={loading}
                            className={`${ovBtnSecondarySm} disabled:opacity-50`}
                          >
                            Cancel
                          </button>
                        ) : null}
                        {loading ? (
                          <div className={`flex items-center gap-3 ${ovMuted}`}>
                            <div className="h-5 w-5 animate-spin rounded-full border-2 border-[color:var(--border-default)] border-t-[color:var(--foreground)]" />
                            <span>Uploading and processing file…</span>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </section>

                  {columns.length > 0 ? (
                  <section className={`min-w-0 p-5 order-1 ${ovCardElevated}`}>
                    <h2 className={ovSectionTitle}>Dataset</h2>
                      <div className="mt-3 space-y-2 text-sm text-foreground">
                        {uploadMeta?.name && (
                          <p>
                            <span className={ovDataLabel}>File</span>{" "}
                            <span className={ovDataValue}>{uploadMeta.name}</span>{" "}
                            <span className={ovMuted}>
                              ({formatBytes(uploadMeta.size_bytes)})
                            </span>
                          </p>
                        )}
                        <p>
                          <span className={ovDataLabel}>Rows</span>{" "}
                          <span className={ovDataValue}>{rows}</span>
                        </p>
                        <p>
                          <span className={ovDataLabel}>Columns</span>{" "}
                          <span className={ovDataValue}>{columns.length}</span>
                        </p>
                        {(selectedSheet.trim() ||
                          (uploadMeta?.name ?? "").toLowerCase().endsWith(".csv")) && (
                          <p>
                            <span className="text-slate-500">Sheet</span>{" "}
                            <span className="font-medium text-slate-900">
                              {selectedSheet.trim() ||
                                ((uploadMeta?.name ?? "").toLowerCase().endsWith(".csv")
                                  ? "CSV"
                                  : "—")}
                            </span>
                          </p>
                        )}
                      </div>
                  </section>
                  ) : null}
                </>
              )}

              {columns.length > 0 ? (
                <section className="col-span-1 min-w-0 lg:col-span-2 order-2">
                  <OverviewAiSummaryPanel bullets={overviewAiSummaryBullets} />
                </section>
              ) : null}

              {columns.length > 0 && (
                <section className={`col-span-1 min-w-0 lg:col-span-2 p-5 sm:p-6 order-5 ${ovCardElevated}`}>
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                    <div>
                      <h2 className={ovSectionTitle}>Data setup</h2>
                      <p className={`mt-1 ${ovSectionDesc}`}>
                        Column mapping drives KPIs, charts, AI answers, and PDF
                        export.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setMappingModalOpen(true)}
                      className={`shrink-0 ${ovOverviewSecondaryBtn}`}
                    >
                      Review mapping
                    </button>
                  </div>
                  {(() => {
                    const domainKind = (datasetKind || "").trim().toLowerCase();
                    const datasetTypeLabel =
                      domainKind && domainKind !== "generic"
                        ? datasetKindLabel(datasetKind)
                        : mappingMetadata?.domain
                          ? mappingMetadata.domain
                              .replace(/_/g, " ")
                              .replace(/\b\w/g, (ch) => ch.toUpperCase())
                          : datasetKindLabel("generic");
                    const engineRegion = mappingMetadata?.roles?.region?.selected?.trim();
                    const regionDisplay =
                      regionColumn.trim() || (engineRegion && engineRegion) || "";
                    const confidenceBadgeClass =
                      mappingConfidence === "High"
                        ? "bg-emerald-500/10 text-emerald-800 ring-emerald-500/25 dark:text-emerald-200"
                        : mappingConfidence === "Medium"
                          ? "bg-amber-500/10 text-amber-900 ring-amber-500/25 dark:text-amber-100"
                          : "bg-[color:var(--surface-subtle)] text-foreground ring-[color:var(--border-default)]";
                    const colHint = (explicit: string, inferred: string | null) => {
                      if (explicit.trim()) {
                        return (
                          <span className={`ml-1 ${ovDataHint}`}>
                            (manual)
                          </span>
                        );
                      }
                      if (inferred) {
                        return (
                          <span className={`ml-1 ${ovDataHint}`}>
                            (auto-detect)
                          </span>
                        );
                      }
                      return null;
                    };
                    const colValue = (explicit: string, inferred: string | null) => {
                      const v = explicit.trim() || inferred;
                      return v ? (
                        <span className={ovDataValueMono}>{v}</span>
                      ) : (
                        <span className={ovMuted}>Not detected</span>
                      );
                    };
                    return (
                      <>
                        <div className={`mt-4 p-4 ${ovInset}`}>
                          <p className={ovLabel}>AI detected</p>
                          <ul className="mt-3 space-y-2 text-sm text-foreground">
                            <li>
                              <span className={ovDataLabel}>Dataset type:</span>{" "}
                              <span className={ovDataValue}>
                                {datasetTypeLabel}
                              </span>
                            </li>
                            <li>
                              <span className={ovDataLabel}>Primary metric:</span>{" "}
                              {colValue(salesColumn, effectiveSales)}
                              {colHint(salesColumn, effectiveSales)}
                            </li>
                            <li>
                              <span className={ovDataLabel}>Date column:</span>{" "}
                              {colValue(dateColumn, effectiveDate)}
                              {colHint(dateColumn, effectiveDate)}
                            </li>
                            <li>
                              <span className={ovDataLabel}>Main dimension:</span>{" "}
                              {colValue(productColumn, effectiveProduct)}
                              {colHint(productColumn, effectiveProduct)}
                            </li>
                            {regionDisplay ? (
                              <li>
                                <span className={ovDataLabel}>
                                  Region / location:
                                </span>{" "}
                                <span className={ovDataValueMono}>
                                  {regionDisplay}
                                </span>
                                {regionColumn.trim() ? (
                                  <span className={`ml-1 ${ovDataHint}`}>
                                    (manual)
                                  </span>
                                ) : engineRegion ? (
                                  <span className={`ml-1 ${ovDataHint}`}>
                                    (auto-detect)
                                  </span>
                                ) : null}
                              </li>
                            ) : null}
                          </ul>
                          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[color:var(--border-default)] pt-4">
                            <span className={`text-xs font-medium ${ovDataLabel}`}>
                              Confidence
                            </span>
                            <span
                              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${confidenceBadgeClass}`}
                            >
                              {mappingConfidence}
                            </span>
                            {mappingConfirmedByUser ? (
                              <span className={`text-xs ${ovMuted}`}>(saved mapping)</span>
                            ) : null}
                          </div>
                        </div>
                        {mappingMetadata?.domain ? (
                          <details className={`mt-4 rounded-2xl border border-[color:var(--border-default)] bg-[color:var(--surface-inset)]`}>
                            <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-foreground">
                              Advanced technical mapping
                            </summary>
                            <div className="space-y-2.5 border-t border-[color:var(--border-default)] px-4 py-4 text-xs text-[color:var(--text-muted)]">
                              <p>
                                <span className="font-semibold text-slate-800">
                                  Semantic column map
                                </span>{" "}
                                · inferred domain{" "}
                                <span className="font-medium text-slate-900">
                                  {mappingMetadata.domain}
                                </span>
                              </p>
                              {(
                                mappingMetadata.roles
                                  ? (Object.keys(mappingMetadata.roles) as string[])
                                  : []
                              ).map((role) => {
                                const rm = mappingMetadata.roles?.[role];
                                if (!rm?.top_candidates?.length && !rm?.selected) return null;
                                return (
                                  <div
                                    key={role}
                                    className="border-t border-slate-200/70 pt-2 first:border-t-0 first:pt-0"
                                  >
                                    <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                                      {mappingSemanticRoleLabel(role)}
                                    </span>{" "}
                                    <span className="font-medium text-slate-900">
                                      {rm.selected ?? "—"}
                                    </span>{" "}
                                    <span className="text-slate-500">({rm.confidence})</span>
                                    {rm.override_note ? (
                                      <span className="block text-amber-800 mt-0.5">
                                        {rm.override_note}
                                      </span>
                                    ) : null}
                                    {rm.top_candidates?.length ? (
                                      <ul className="mt-1 ml-3 list-disc text-slate-600 space-y-0.5">
                                        {rm.top_candidates.slice(0, 3).map((c) => (
                                          <li key={c.column}>
                                            {c.column} — {c.score}
                                            {c.reasons?.length ? (
                                              <span className="text-slate-500">
                                                {" "}
                                                ({c.reasons.slice(0, 3).join("; ")})
                                              </span>
                                            ) : null}
                                          </li>
                                        ))}
                                      </ul>
                                    ) : null}
                                  </div>
                                );
                              })}
                            </div>
                          </details>
                        ) : null}
                      </>
                    );
                  })()}
                </section>
              )}

              {autoDashboardKpiRows.length > 0 && (
                <section className="col-span-1 min-w-0 lg:col-span-2 pt-1 order-3">
                  <h2 className={`${ovSectionTitle} mb-1`}>Auto Dashboard</h2>
                  <p className={`${ovSectionDesc} mb-5`}>
                    Detected dataset type:{" "}
                    <span className="font-medium text-foreground">
                      {autoDashboard?.type_label ?? "Dashboard"}
                    </span>
                  </p>
                  <div className="grid auto-rows-fr gap-4 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
                    {autoDashboardKpiRows.map(({ card, contextLine }, idx) => (
                      <OverviewKpiCard
                        key={`auto-${card.title}-${idx}`}
                        card={card}
                        contextLine={contextLine}
                        index={idx}
                      />
                    ))}
                  </div>
                </section>
              )}

              {columns.length > 0 && (
                <section className="col-span-1 min-w-0 max-w-full lg:col-span-2 pt-1 order-4 overflow-hidden">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between mb-2">
                    <div className="min-w-0">
                      <h2 className={`${ovSectionTitle} mb-1`}>Auto Dashboard Charts</h2>
                      <p className={ovSectionDesc}>
                        Quick views built from your current sheet. They refresh when you
                        upload a file, switch sheets, or save column mapping.
                      </p>
                    </div>
                    {autoDashboardUpdatedAt ? (
                      <span className="text-[11px] text-slate-500 whitespace-nowrap shrink-0 pt-0.5">
                        Last refreshed{" "}
                        {new Date(autoDashboardUpdatedAt).toLocaleString(undefined, {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                      </span>
                    ) : null}
                  </div>
                  {(autoDashboard?.cards?.length ?? 0) > 0 &&
                  (autoDashboard?.charts?.length ?? 0) > 0 ? (
                    <div className="flex flex-wrap gap-2 mb-2">
                      {autoDashboardKpiRows.map(({ card }, idx) => (
                        <OverviewInlineKpiChip
                          key={`dash-kpi-${idx}-${card.title}`}
                          title={card.title}
                          value={card.value}
                        />
                      ))}
                    </div>
                  ) : null}
                  {dashboardEmpty ? (
                    <p className={`text-sm rounded-xl border border-dashed border-[color:var(--border-default)] bg-[color:var(--surface-inset)] px-4 py-6 text-center leading-relaxed ${ovMuted}`}>
                      No records match current filters.
                    </p>
                  ) : (autoDashboard?.charts?.length ?? 0) > 0 ? (
                    <div
                      className={
                        loading
                          ? "animate-pulse opacity-[0.88] transition-opacity"
                          : ""
                      }
                    >
                      <div className={`${ovChartsWrap} min-w-0 max-w-full`}>
                      <div className={`${ovChartGrid} min-w-0 max-w-full`}>
                      {(autoDashboard?.charts ?? []).map((c, idx) => {
                        const dKey = dashboardChartKeyFromTitle(c.title);
                        const dashSnap = dashboardSnapshotByKey.get(dKey);
                        const canonicalTitle = getCanonicalChartTitle({
                          rawTitle: c.title,
                          chartType: c.chartType,
                          labels: c.labels,
                          values: c.values,
                          contract: dashSnap?.contract ?? null,
                          aggregationKey: dashSnap?.contract?.aggregation ?? "sum",
                        });
                        return (
                          <div
                            key={`overview-dash-${idx}-${c.title.slice(0, 40)}`}
                            className={ovChartCell}
                          >
                            <div className={ovChartInner}>
                              <OverviewDashboardChartSlot
                                chart={c}
                                canonicalTitle={canonicalTitle}
                                snapshotId={dashSnap?.id ?? null}
                                dashGridStyle={overviewDashGridStyle}
                                loadingPulse={loading}
                                onDashboardDrill={onAutoDashboardDrill}
                                onOpenDashboardChartInChartsTab={
                                  openDashboardChartInChartsTab
                                }
                                onAskAiAboutDashboardChart={askAiAboutDashboardChart}
                                onChartExportError={setError}
                                exportFooterHint={uploadMeta?.name}
                              />
                            </div>
                          </div>
                        );
                      })}
                      </div>
                      </div>
                    </div>
                  ) : (
                    <p className={`text-sm rounded-xl border border-dashed border-[color:var(--border-default)] bg-[color:var(--surface-inset)] px-4 py-6 text-center leading-relaxed ${ovMuted}`}>
                      No dashboard charts generated yet. Review column mapping or ask
                      an AI question.
                    </p>
                  )}
                </section>
              )}
            </div>
            {columns.length === 0 ? <PilotInfoSections /> : null}
            </>
          )}

        {activeTab === "preview" && columns.length > 0 && (
          <section className="mb-6 min-w-0 w-full">
            <div className="mb-5 flex min-w-0 flex-col gap-4">
              <div className={dpPreviewHeaderIntro}>
                <h2 className={dpSectionTitle}>Data Preview</h2>
                <p className={dpSectionDesc}>
                  Showing first {preview.length} of {rows} rows in this window. Missing
                  values are highlighted. AI highlights important column quality signals
                  automatically.
                </p>
              </div>
              <DataPreviewDatasetContext
                fileName={uploadMeta?.name}
                fileSizeBytes={uploadMeta?.size_bytes}
                sheetLabel={selectedSheet.trim() || null}
                rows={rows}
                columnCount={columns.length}
              />
              <DataPreviewQualitySummary
                rows={rows}
                columns={columns}
                profile={profile}
                preview={preview}
                mapping={dataPreviewColumnMapping}
              />
              <DataPreviewDatasetInsightsSummary
                rows={rows}
                columns={columns}
                profile={profile}
                preview={preview}
                mapping={dataPreviewColumnMapping}
              />
              <DataPreviewSchemaPanel
                columns={columns}
                profile={profile}
                preview={preview}
                totalRows={rows}
                mapping={dataPreviewColumnMapping}
                searchQuery={dataPreviewSchemaSearch}
                onSearchChange={setDataPreviewSchemaSearch}
                selectedColumn={dataPreviewSelectedSchemaCol}
                onSelectColumn={setDataPreviewSelectedSchemaCol}
              />
              <DataPreviewColumnDetails
                column={dataPreviewSelectedSchemaCol}
                profile={profile}
                preview={preview}
                totalRows={rows}
                mapping={dataPreviewColumnMapping}
                onClose={() => setDataPreviewSelectedSchemaCol(null)}
              />
            </div>

            {dataPreviewQualityInsights.length > 0 ? (
              <div className={dpInsightsPanel} role="note" aria-label="Data quality alerts">
                <span className="data-preview-insights__icon" aria-hidden>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 9v4M12 17h.01" strokeLinecap="round" />
                    <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" strokeLinejoin="round" />
                  </svg>
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-semibold text-foreground">
                    Data quality alerts
                  </h3>
                  <p className="mt-0.5 text-[11px] text-[color:var(--text-muted)]">
                    Quality issues and column warnings from upload profile.
                  </p>
                  <ul className="mt-2 space-y-2 text-xs leading-relaxed text-[color:var(--text-muted)]">
                    {dataPreviewQualityInsights.map((insight) => (
                      <li key={insight.message} className="flex items-center gap-2.5">
                        <span
                          className={
                            insight.severity === "info"
                              ? dpInsightSeverityInfo
                              : insight.severity === "warning"
                                ? dpInsightSeverityWarning
                                : dpInsightSeverityAttention
                          }
                        >
                          {insight.severity === "info"
                            ? "Info"
                            : insight.severity === "warning"
                              ? "Warning"
                              : "Attention"}
                        </span>
                        <span className="min-w-0">{insight.message}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : null}

            {dataPreviewSuggestedQuestions.length > 0 ? (
              <div className={dpSuggestionsPanel}>
                <h3 className="text-sm font-semibold tracking-tight text-foreground">
                  AI suggested questions
                </h3>
                <p className="mb-3 mt-1 text-xs leading-relaxed text-[color:var(--text-muted)]">
                  Tap to open AI Insights with the prompt ready to send.
                </p>
                <div className="flex flex-wrap items-stretch gap-2">
                  {(dataPreviewSuggestionsExpanded
                    ? dataPreviewSuggestedQuestions
                    : dataPreviewSuggestedQuestions.slice(0, 4)
                  ).map((q, i) => (
                    <button
                      key={`dpsq-${i}-${suggestionTokenMultisetKey(q)}`}
                      type="button"
                      onClick={() => {
                        setQuestionAndResetInsightState(q);
                        setActiveTab("insights");
                      }}
                      className={dpSuggestionChip}
                    >
                      {q}
                    </button>
                  ))}
                  {dataPreviewSuggestedQuestions.length > 4 ? (
                    <button
                      type="button"
                      onClick={() =>
                        setDataPreviewSuggestionsExpanded((v) => !v)
                      }
                      className={dpSuggestionMore}
                    >
                      {dataPreviewSuggestionsExpanded
                        ? "Fewer suggestions"
                        : "More suggestions"}
                    </button>
                  ) : null}
                </div>
              </div>
            ) : null}

            <div className={`${dpTableToolbarRow} min-w-0 w-full`}>
              <div className={dpSearchWrap}>
                <div className="relative min-w-0 flex-1">
                  <span
                    className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-[color:var(--text-subtle)]"
                    aria-hidden
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <circle cx="11" cy="11" r="7" />
                      <path d="m20 20-3.2-3.2" />
                    </svg>
                  </span>
                  <input
                    type="search"
                    value={dataPreviewSearchQuery}
                    onChange={(e) => setDataPreviewSearchQuery(e.target.value)}
                    placeholder="Search loaded rows (all columns)…"
                    className={dpSearchInput}
                    aria-label="Search data preview across all columns"
                    autoComplete="off"
                    spellCheck={false}
                  />
                </div>
                {dataPreviewSearchQuery.trim() ? (
                  <button
                    type="button"
                    onClick={() => setDataPreviewSearchQuery("")}
                    className={dpBtnGhost}
                  >
                    Clear
                  </button>
                ) : null}
              </div>
              <div className={dpTableToolbarControls}>
                {deferredDataPreviewSearch ? (
                  <p className={dpToolbarMatchMeta} aria-live="polite">
                    {dataPreviewFilteredRows.length} of {preview.length} loaded row
                    {preview.length === 1 ? "" : "s"} match
                  </p>
                ) : null}
                <label
                  className="text-sm font-medium text-[color:var(--text-muted)]"
                  htmlFor="preview-row-limit"
                >
                  Rows
                </label>
                <select
                  id="preview-row-limit"
                  value={String(previewRowLimit)}
                  onChange={async (e) => {
                    const val = e.target.value === "all" ? "all" : Number(e.target.value);
                    setPreviewRowLimit(val);
                    setDataPreviewPageIndex(0);
                    await fetchPreviewRows(val);
                  }}
                  className={dpControl}
                >
                  {previewRowSelectOptions.map((opt) => (
                    <option key={String(opt)} value={String(opt)}>
                      {opt === "all" ? "All rows" : `${opt} rows`}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div
              ref={dataPreviewTableSurfaceRef}
              className={`${dpTableShell}${previewLoading ? " opacity-80" : ""}`}
            >
              <div ref={dataPreviewTableScrollRef} className={dpTableScroll}>
                {previewLoading && preview.length === 0 ? (
                  <div className="data-preview-loading" aria-busy="true" aria-label="Loading preview rows">
                    {Array.from({ length: 10 }).map((_, i) => (
                      <div key={i} className="data-preview-shimmer-row" />
                    ))}
                  </div>
                ) : (
                <table className={dpTable}>
                  <thead>
                    <tr>
                      {columns.map((col, colIdx) => {
                        const secondary =
                          previewColumnHeaderSecondaryMap.get(col) ?? null;
                        const dt = profile?.column_types?.[col];
                        const elevated = dataPreviewTableHeaderElevated;
                        const sortActive = dataPreviewSort?.column === col;
                        const thExtra = [
                          elevated ? "data-preview-th--elevated" : "",
                          colIdx === 0 ? "data-preview-th--sticky-col" : "",
                          sortActive ? "data-preview-th--sorted" : "",
                        ]
                          .filter(Boolean)
                          .join(" ");
                        return (
                          <th key={col} className={thExtra || undefined}>
                            <DataPreviewColumnHeader
                              column={col}
                              typeLabel={dataPreviewHeaderTypeLabel(dt)}
                              secondary={
                                secondary
                                  ? {
                                      label: secondary.label,
                                      title: secondary.title,
                                      className: secondary.className,
                                    }
                                  : null
                              }
                              sort={dataPreviewSort}
                              profileOpen={dataPreviewProfileOpen?.column === col}
                              onSort={(column) => {
                                setDataPreviewSort((prev) =>
                                  cycleDataPreviewSort(prev, column)
                                );
                                setDataPreviewPageIndex(0);
                              }}
                              onOpenProfile={(column, e) => {
                                const r = e.currentTarget.getBoundingClientRect();
                                setDataPreviewProfileOpen((prev) =>
                                  prev?.column === column
                                    ? null
                                    : {
                                        column,
                                        anchor: {
                                          top: r.top,
                                          left: r.left,
                                          right: r.right,
                                          bottom: r.bottom,
                                          width: r.width,
                                          height: r.height,
                                        },
                                      }
                                );
                              }}
                            />
                          </th>
                        );
                      })}
                  </tr>
                </thead>

                <tbody>
                  {dataPreviewPageRows.map((row, index) => {
                    const qLower = deferredDataPreviewSearch.toLowerCase();
                    return (
                      <tr key={index} className="group">
                        {columns.map((col, colIdx) => {
                          const raw = row[col];
                          const emptyCell = isMissingValue(raw);
                          const displayText = emptyCell
                            ? DATA_PREVIEW_MISSING_LABEL
                            : String(raw);
                          const showHighlight =
                            qLower.length > 0 &&
                            dataPreviewCellMatchesQuery(raw, qLower);
                          const isFirstCol = colIdx === 0;
                          const cellClass = emptyCell
                            ? dpCellNull
                            : isFirstCol
                              ? dpCellSticky
                              : dpCell;
                          return emptyCell ? (
                            <td
                              key={col}
                              className={cellClass}
                            >
                              <span className={dpNullPill}>
                                {showHighlight
                                  ? highlightSearchInText(
                                      displayText,
                                      deferredDataPreviewSearch
                                    )
                                  : displayText}
                              </span>
                            </td>
                          ) : (
                            <DataPreviewCopyCell
                              key={col}
                              className={cellClass}
                              copyValue={displayText}
                              title={displayText}
                            >
                              {showHighlight
                                ? highlightSearchInText(
                                    displayText,
                                    deferredDataPreviewSearch
                                  )
                                : displayText}
                            </DataPreviewCopyCell>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
                )}
              </div>
            </div>
            {!previewLoading && dataPreviewFilteredCount > 0 ? (
              <div className={dpPaginationBar}>
                <div
                  className={`${dpPaginationInner}${
                    dataPreviewPaginationActive && dataPreviewPageCount > 1
                      ? ""
                      : " data-preview-pagination__inner--static"
                  }`}
                >
                  <p className={dpPaginationMeta}>
                    {dataPreviewPageCount === 1 ? (
                      <>
                        Showing all{" "}
                        {dataPreviewFilteredCount.toLocaleString()}{" "}
                        row{dataPreviewFilteredCount === 1 ? "" : "s"}
                      </>
                    ) : dataPreviewPaginationActive ? (
                      <>
                        Showing {dataPreviewRangeStart.toLocaleString()}–
                        {dataPreviewRangeEnd.toLocaleString()} of{" "}
                        {dataPreviewFilteredCount.toLocaleString()} row
                        {dataPreviewFilteredCount === 1 ? "" : "s"} · Page{" "}
                        {dataPreviewSafePageIndex + 1} of{" "}
                        {dataPreviewPageCount}
                      </>
                    ) : (
                      <>
                        Showing all {dataPreviewFilteredCount.toLocaleString()}{" "}
                        row{dataPreviewFilteredCount === 1 ? "" : "s"}
                      </>
                    )}
                  </p>
                  {dataPreviewPaginationActive && dataPreviewPageCount > 1 ? (
                    <div className={dpPaginationNav}>
                      <button
                        type="button"
                        className={dpPaginationBtn}
                        disabled={dataPreviewSafePageIndex <= 0}
                        onClick={() =>
                          setDataPreviewPageIndex((p) => Math.max(0, p - 1))
                        }
                        aria-label="Previous page"
                      >
                        Previous
                      </button>
                      <span
                        className={dpPaginationPill}
                        aria-label={`Page ${dataPreviewSafePageIndex + 1} of ${dataPreviewPageCount}`}
                      >
                        {dataPreviewSafePageIndex + 1} / {dataPreviewPageCount}
                      </span>
                      <button
                        type="button"
                        className={dpPaginationBtn}
                        disabled={
                          dataPreviewSafePageIndex >= dataPreviewPageCount - 1
                        }
                        onClick={() =>
                          setDataPreviewPageIndex((p) =>
                            Math.min(dataPreviewPageCount - 1, p + 1)
                          )
                        }
                        aria-label="Next page"
                      >
                        Next
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}
            {previewLoading && preview.length > 0 ? (
              <p className={`mt-2 ${dpEmptyState}`}>Refreshing preview rows…</p>
            ) : null}
            {!previewLoading && preview.length === 0 ? (
              <p className={`mt-2 ${dpEmptyState}`}>No preview rows available.</p>
            ) : null}
            {!previewLoading &&
              preview.length > 0 &&
              dataPreviewFilteredRows.length === 0 &&
              deferredDataPreviewSearch ? (
                <p className={`mt-2 ${dpEmptySearch}`}>
                  {`No rows match "${deferredDataPreviewSearch}". Try a shorter term or clear the search.`}
                </p>
              ) : null}
            {dataPreviewProfileOpen ? (
              <DataPreviewColumnProfilePopover
                col={dataPreviewProfileOpen.column}
                profile={profile}
                preview={preview}
                rows={rows}
                anchor={dataPreviewProfileOpen.anchor}
                onClose={() => setDataPreviewProfileOpen(null)}
              />
            ) : null}
          </section>
        )}

        {activeTab === "charts" && (
          <section className={chartsTabPage}>
            <div className={chartsTabHeaderRow}>
              <div className="min-w-0 max-w-2xl">
                <h2 className={chartsTabTitle}>Charts</h2>
                <p className={chartsTabDesc}>
                  Session visualizations from{" "}
                  <span className={chartsTabDescEmphasis}>Overview</span> and{" "}
                  <span className={chartsTabDescEmphasis}>AI Insights</span>. Select a
                  run in the timeline to preview, export PNG, or attach to the Export tab
                  PDF. History resets when the dataset or mapping changes.
                </p>
              </div>
              {chartData.length > 0 ? (
                <button
                  type="button"
                  onClick={downloadChartPng}
                  disabled={exportingChartsTabPng}
                  className={`${chartsTabDownloadBtn} disabled:cursor-not-allowed disabled:opacity-60`}
                >
                  {exportingChartsTabPng ? "Exporting…" : "Download Chart PNG"}
                </button>
              ) : null}
            </div>

            <div className="grid w-full min-h-0 min-w-0 grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(10.5rem,23%)_minmax(0,1fr)] lg:items-start lg:gap-6">
              <div className={chartsTabTimelineColumn}>
                <ChartsTimelineAside
                  ref={chartHistoryAsideRef}
                  sections={chartHistorySections}
                  activeChartId={activeChartId}
                  onSelectChart={selectChartPreserveScroll}
                  historyEmpty={chartHistory.length === 0}
                />
              </div>

              <div
                ref={chartsPreviewRef}
                className="flex min-h-0 min-w-0 w-full flex-1 flex-col scroll-mt-24"
              >
                {chartData.length > 0 ? (
                  <div className={chartsTabVizPreviewCard}>
                    <div>
                      <div className={chartsTabPreviewHeaderSticky}>
                        <div
                          ref={chartsSessionHeadingRef}
                          className="w-full min-w-0 scroll-mt-28"
                        >
                          <div className="mx-auto min-w-0 max-w-4xl">
                            {chartHeadingBlock ?? (
                              <div className={chartsTabVizHeaderZone}>
                                <p className={chartsTabVizKicker}>Chart preview</p>
                                <h3 className={aiInsightsVizTitle}>Visualization</h3>
                                {chartSubtitle ? (
                                  <p className={aiInsightsVizSubtitle}>
                                    {chartSubtitle}
                                  </p>
                                ) : null}
                              </div>
                            )}
                          </div>
                        </div>
                        <div
                          title={sessionChartMetadataLine}
                          className={`${aiInsightsVizChipsWrap} mt-1`}
                        >
                          <ChartContextSummary
                            renderedKind={sessionRenderedChartKind}
                            metricLabel={chartAxisLabels.valueAxis}
                            semanticHeader={sessionChartSemanticHeader}
                            badgeCompact={sessionChartMetadataBadgeCompact}
                            leadInsight={chartInsightBadge ?? undefined}
                            qualityWarning={sessionChartRateWarning ?? undefined}
                            compactChips
                          />
                        </div>
                        <ChartsTabChartReason
                          chartId={activeChartId}
                          reason={sessionChartReason}
                        />
                      </div>
                      <ChartsTabPlotTransition
                        chartId={activeChartId}
                        plotHeightPx={activeChartHeightMain}
                      >
                        <div
                          className={chartsTabVizSessionFrame}
                          style={
                            {
                              "--insights-viz-plot-h": `${activeChartHeightMain}px`,
                            } as CSSProperties
                          }
                        >
                          <ChartInsightViewportWrapper
                            chartKind={sessionRenderedChartKind}
                            sessionMode
                          >
                            <div className={chartsTabSessionPlotSurface}>
                              {renderDatasetChart(
                                activeChartHeightMain,
                                false,
                                false
                              )}
                            </div>
                          </ChartInsightViewportWrapper>
                        </div>
                      </ChartsTabPlotTransition>
                    </div>

                    {chartsTabOffscreenLayout ? (
                      <ChartPngOffscreenHost
                        layout={chartsTabOffscreenLayout}
                        exportRef={chartsTabOffscreenExportRef}
                        rootClassName={chartsTabPngExportRoot}
                      >
                        <div className={chartsTabPreviewHeaderSticky}>
                          <div className="w-full min-w-0">
                            <div className="mx-auto min-w-0 max-w-4xl">
                              {chartHeadingBlock ?? (
                                <div className={chartsTabVizHeaderZone}>
                                  <p className={chartsTabVizKicker}>Chart preview</p>
                                  <h3 className={aiInsightsVizTitle}>Visualization</h3>
                                  {chartSubtitle ? (
                                    <p className={aiInsightsVizSubtitle}>
                                      {chartSubtitle}
                                    </p>
                                  ) : null}
                                </div>
                              )}
                            </div>
                          </div>
                          <div
                            title={sessionChartMetadataLine}
                            className={`${aiInsightsVizChipsWrap} mt-1`}
                          >
                            <ChartContextSummary
                              renderedKind={sessionRenderedChartKind}
                              metricLabel={chartAxisLabels.valueAxis}
                              semanticHeader={sessionChartSemanticHeader}
                              badgeCompact={sessionChartMetadataBadgeCompact}
                              leadInsight={chartInsightBadge ?? undefined}
                              qualityWarning={sessionChartRateWarning ?? undefined}
                              compactChips
                            />
                          </div>
                          <ChartsTabChartReason
                            chartId={activeChartId}
                            reason={sessionChartReason}
                          />
                        </div>
                        <div
                          className={chartsTabVizSessionFrame}
                          style={
                            {
                              "--insights-viz-plot-h": `${chartsTabOffscreenLayout.height}px`,
                              ...presentationCapturePlotStyle(chartsTabOffscreenLayout),
                            } as CSSProperties
                          }
                        >
                          <ChartInsightViewportWrapper
                            chartKind={sessionRenderedChartKind}
                            sessionMode
                          >
                            <div className={chartsTabSessionPlotSurface}>
                              <ChartRenderer
                                chartHeight={chartsTabOffscreenLayout.height}
                                compact={false}
                                insightMode={false}
                                pngCaptureMode
                                chartRows={sortedChartData}
                                visualization={
                                  visualization as ChartRendererViz
                                }
                                presentationKind={presentationChartKind}
                                axes={chartAxisLabels}
                                viewportW={chartsTabOffscreenLayout.width}
                                sessionCartesianPlanMain={chartsTabExportCartesianPlan}
                                insightCartesianPlanMain={null}
                                tickTruncate={tickTruncate}
                                onInsightDrill={insightChartDrill}
                              />
                            </div>
                          </ChartInsightViewportWrapper>
                        </div>
                      </ChartPngOffscreenHost>
                    ) : null}

                    <div className={chartsTabSmartReadWrap}>
                      <SmartChartInsightPanel
                        intel={sessionSmartChartIntel}
                        cards={executiveVizInsights.slice(0, 3)}
                      />
                    </div>
                  </div>
                ) : (
                  <div className={chartsTabEmptyState}>
                    {chartHistory.length > 0 ? (
                      <>
                        <p className={chartsTabEmptyTitle}>Select a chart</p>
                        <p className="mx-auto max-w-lg text-sm leading-relaxed text-[color:var(--text-muted)]">
                          Pick an <span className={chartsTabDescEmphasis}>Auto</span> or{" "}
                          <span className={chartsTabDescEmphasis}>AI</span> card in the
                          timeline to load it here for PNG export or the session PDF.
                        </p>
                      </>
                    ) : (
                      <>
                        <p className={chartsTabEmptyTitle}>
                          Ask something analytical
                        </p>
                        <ul className="mx-auto inline-block max-w-lg space-y-2 text-left text-sm text-[color:var(--text-muted)]">
                          <li className="flex gap-2">
                            <span className="select-none text-slate-400">—</span>
                            <span>sales by region</span>
                          </li>
                          <li className="flex gap-2">
                            <span className="select-none text-slate-400">—</span>
                            <span>top products</span>
                          </li>
                          <li className="flex gap-2">
                            <span className="select-none text-slate-400">—</span>
                            <span>hiring trend over time</span>
                          </li>
                          <li className="flex gap-2">
                            <span className="select-none text-slate-400">—</span>
                            <span>metric A vs metric B</span>
                          </li>
                        </ul>
                      </>
                    )}
                    <p className="mx-auto max-w-lg pt-1 text-xs leading-relaxed text-slate-500">
                      Overview adds Auto charts to the timeline. AI Insights adds a chart
                      after each answered question.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {activeTab === "insights" && (
          <section className={`${aiInsightsPage} ${aiInsightsOuterShell}`}>
            <div className={aiInsightsGrid}>
              <div className={aiInsightsPanelShell}>
                <h2 className={aiInsightsSuggestedHeading}>Suggested Questions</h2>
                <p className={aiInsightsSuggestedDesc}>Click to prefill, then ask.</p>
                <div className={aiInsightsSuggestedScrollBody}>
                  <div className={aiInsightsSuggestedList}>
                    {visibleSuggestedQuestions.map((q, i) => (
                      <button
                        key={`sq-${i}-${suggestionTokenMultisetKey(q)}`}
                        type="button"
                        onClick={() => setQuestionAndResetInsightState(q)}
                        className={aiInsightsSuggestedQ}
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                  {questionHistory.length > 0 ? (
                    <div className={aiInsightsSuggestedRecentSection}>
                      <h3 className={aiInsightsSuggestedRecentTitle}>Recent questions</h3>
                      <p className={aiInsightsSuggestedRecentDesc}>
                        Tap to refill the input (last 3).
                      </p>
                      <div className={aiInsightsSuggestedRecentList}>
                        {questionHistory.map((hq) => (
                          <button
                            key={hq}
                            type="button"
                            onClick={() => setQuestion(hq)}
                            className={aiInsightsSuggestedRecentItem}
                          >
                            {hq.length > 72 ? `${hq.slice(0, 70)}…` : hq}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>

              <div className={aiInsightsAskPanel}>
                <div className={aiInsightsAskHeaderRow}>
                  <h2 className={aiInsightsAskHeading}>Ask AI</h2>
                  <button
                    type="button"
                    onClick={resetAiConversation}
                    disabled={!hasActiveAiConversation}
                    className={aiInsightsAskResetBtn}
                    title={
                      hasActiveAiConversation
                        ? "Clears the question, answer, insight cards, AI chart, follow-up chips, and thread memory. Your file, filters, auto-dashboard, and non-AI chart history stay."
                        : "Ask a question to start a conversation before resetting."
                    }
                  >
                    Reset conversation
                  </button>
                </div>
                {lastConversationMeta?.followUpDetected ? (
                  <div className={aiInsightsAskMetaRow}>
                    <span className="rounded-full border border-emerald-200/60 bg-emerald-50/90 px-2.5 py-1 text-[10px] font-semibold text-emerald-900 shadow-[var(--shadow-sm)] transition-shadow duration-200 hover:shadow-[var(--shadow-md)] dark:border-emerald-500/25 dark:bg-emerald-950/40 dark:text-emerald-100">
                      Using previous insight context
                    </span>
                    <span className="rounded-full border border-violet-200/60 bg-violet-50/90 px-2.5 py-1 text-[10px] font-semibold text-violet-900 shadow-[var(--shadow-sm)] transition-shadow duration-200 hover:shadow-[var(--shadow-md)] dark:border-violet-400/25 dark:bg-violet-950/40 dark:text-violet-100">
                      Follow-up question
                    </span>
                    {lastConversationMeta.usingContextSummary.trim() ? (
                      <span className="text-xs text-slate-600 dark:text-[color:var(--insights-text-muted)]">
                        Thread focus:{" "}
                        <span className="font-medium text-slate-800 dark:text-[color:var(--insights-text-secondary)]">
                          {lastConversationMeta.usingContextSummary}
                        </span>
                      </span>
                    ) : null}
                </div>
                ) : null}
                {(lastConversationMeta?.inheritedAssumptionNote ?? "").trim() ? (
                  <p className={aiInsightsAskAssumptionNote}>
                    {lastConversationMeta?.inheritedAssumptionNote ?? ""}
                  </p>
                ) : null}
                <div
                  className={aiInsightsAskInputBlock}
                  aria-busy={loading || undefined}
                >
                  <label className={aiInsightsAskQuestionLabel} htmlFor="ai-insights-question">
                    Your question
                  </label>
                  <div className={aiInsightsAskComposer}>
                    <textarea
                      id="ai-insights-question"
                      value={question}
                      onChange={(e) => setQuestionAndResetInsightState(e.target.value)}
                      className={aiInsightsAskTextarea}
                      placeholder="Ask about trends, rankings, or comparisons in your data…"
                      disabled={loading}
                      aria-describedby={
                        error && activeTab === "insights"
                          ? "ai-insights-ask-error"
                          : loading
                            ? "ai-insights-ask-loading"
                            : undefined
                      }
                    />
                    <div className={aiInsightsAskActionsRow}>
                      <button
                        type="button"
                        onClick={() => void askAI()}
                        disabled={!canAskAi}
                        className={aiInsightsAskSubmitBtn}
                        aria-label={loading ? "Generating AI insight" : "Ask AI"}
                      >
                        {loading ? "Thinking…" : "Ask AI"}
                      </button>
                      {loading ? (
                        <div
                          id="ai-insights-ask-loading"
                          className={aiInsightsAskLoading}
                          role="status"
                          aria-live="polite"
                        >
                          <span
                            className="inline-block h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-[color:var(--accent)]/25 border-t-[color:var(--accent)]"
                            aria-hidden
                          />
                          <span>Generating answer and chart…</span>
                        </div>
                      ) : null}
                    </div>
                    {error && activeTab === "insights" ? (
                      <div
                        id="ai-insights-ask-error"
                        className={aiInsightsAskError}
                        role="alert"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <p className="min-w-0 flex-1">{error}</p>
                          <button
                            type="button"
                            onClick={() => setError("")}
                            className="shrink-0 text-xs font-semibold underline-offset-2 hover:underline"
                          >
                            Dismiss
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>

                {alignedAnalysis?.alignmentRepaired ? (
                  <div className="mt-3 rounded-lg border border-amber-200/90 bg-amber-50/90 px-3 py-2 text-xs text-amber-950 dark:border-amber-500/22 dark:bg-amber-950/35 dark:text-amber-100/90">
                    Chart was rebuilt so the series matches the metric detected from
                    your question (pandas alignment check).
                  </div>
                ) : null}

                {insightVisualization?.partialVisualizationWarning &&
                !insightExecutiveSummaryMode ? (
                  <p className="mt-3 text-xs text-amber-950 bg-amber-50/70 border border-amber-200/80 rounded-lg px-3 py-2 leading-snug dark:border-amber-500/22 dark:bg-amber-950/30 dark:text-amber-100/90">
                    <span className="font-semibold">Visualization caution:</span> full
                    statistical note is under{" "}
                    <span className="font-medium">How this insight was generated</span>.
                  </p>
                ) : null}

                {insightSnapshot &&
                !hasValidAIAnswer &&
                !loading &&
                !answer.trim() ? (
                  <div className="mt-3 rounded-xl border border-indigo-100/70 bg-indigo-50/35 px-3.5 py-3 text-sm text-slate-700 leading-snug dark:border-indigo-400/18 dark:bg-[color:var(--insights-wash-followup)] dark:text-[color:var(--insights-text-secondary)]">
                    This chart is selected. Click{" "}
                    <span className="font-semibold text-slate-900 dark:text-[var(--foreground)]">Ask AI</span> to
                    generate an insight.
                  </div>
                ) : null}

                <div className={aiInsightsResultsStack}>
                {(hasValidAIAnswer || loading || answer.trim()) ? (
                <div className={aiInsightsAnswerCard}>
                  <div className={aiInsightsAnswerHeader}>
                    <p className={aiInsightsAnswerKicker}>Executive analysis</p>
                    <h3 className={aiInsightsAnswerTitle}>AI Answer</h3>
                  </div>
                  {answer.trim() || loading ? (
                    <div className={aiInsightsAnswerStack}>
                      {(() => {
                        const lead = aiAnswerLeadIn(
                          datasetKind || "",
                          insightPresentationChartKind
                        );
                        return lead ? (
                          <p className={aiInsightsAnswerLead}>{lead}</p>
                        ) : null;
                      })()}
                      <div className={aiInsightsAnswerSummaryPanel}>
                        <p className={aiInsightsAnswerSummary}>
                          {formatInsightSummary(
                            parsedInsightAnswer.summary ||
                              "Summary unavailable — see detail sections."
                          )}
                        </p>
                      </div>
                      <div className={aiInsightsAnswerDetailsGroup}>
                        <p className={aiInsightsAnswerDetailsLabel}>
                          Supporting detail
                        </p>
                      {parsedInsightAnswer.statistical ? (
                        <details className={aiInsightsAnswerDetailFindings} open>
                          <summary className={aiInsightsAnswerDetailSummaryFindings}>
                            <span className={aiInsightsAnswerDetailSummaryLabel}>
                              <span
                                className={`${aiInsightsAnswerDetailSummaryBadge} ai-insights-answer-detail-badge`}
                              >
                                Core
                              </span>
                              <span>{AI_INSIGHT_SECTION_LABELS.statistical}</span>
                            </span>
                          </summary>
                          <div className={aiInsightsAnswerDetailBody}>
                            <AiInsightAnswerBody
                              text={parsedInsightAnswer.statistical}
                              variant="findings"
                            />
                          </div>
                        </details>
                      ) : null}
                      {parsedInsightAnswer.hypotheses ? (
                        <details className={aiInsightsAnswerDetail}>
                          <summary className={aiInsightsAnswerDetailSummaryHypotheses}>
                            <span className={aiInsightsAnswerDetailSummaryLabel}>
                              <span
                                className={`${aiInsightsAnswerDetailSummaryBadge} ai-insights-answer-detail-badge`}
                              >
                                Context
                              </span>
                              <span>{AI_INSIGHT_SECTION_LABELS.hypotheses}</span>
                            </span>
                          </summary>
                          <div className={aiInsightsAnswerDetailBody}>
                            <AiInsightAnswerBody text={parsedInsightAnswer.hypotheses} />
                          </div>
                        </details>
                      ) : null}
                      {parsedInsightAnswer.recommendations ? (
                        <details className={aiInsightsAnswerDetail}>
                          <summary className={aiInsightsAnswerDetailSummaryRecommendations}>
                            <span className={aiInsightsAnswerDetailSummaryLabel}>
                              <span
                                className={`${aiInsightsAnswerDetailSummaryBadge} ai-insights-answer-detail-badge`}
                              >
                                Action
                              </span>
                              <span>{AI_INSIGHT_SECTION_LABELS.recommendations}</span>
                            </span>
                          </summary>
                          <div className={aiInsightsAnswerDetailBody}>
                            <AiInsightAnswerBody
                              text={parsedInsightAnswer.recommendations}
                            />
                          </div>
                        </details>
                      ) : null}
                      {parsedInsightAnswer.methodology ? (
                        <details className={aiInsightsAnswerDetail}>
                          <summary className={aiInsightsAnswerDetailSummaryMethodology}>
                            <span className={aiInsightsAnswerDetailSummaryLabel}>
                              <span
                                className={`${aiInsightsAnswerDetailSummaryBadge} ai-insights-answer-detail-badge`}
                              >
                                Method
                              </span>
                              <span>{AI_INSIGHT_SECTION_LABELS.methodology}</span>
                            </span>
                          </summary>
                          <div className={aiInsightsAnswerDetailBody}>
                            <AiInsightAnswerBody
                              text={parsedInsightAnswer.methodology}
                            />
                          </div>
                        </details>
                      ) : null}
                      {parsedInsightAnswer.moreDetail ? (
                        <details className={aiInsightsAnswerDetail}>
                          <summary className={aiInsightsAnswerDetailSummaryMore}>
                            <span className={aiInsightsAnswerDetailSummaryLabel}>
                              <span
                                className={`${aiInsightsAnswerDetailSummaryBadge} ai-insights-answer-detail-badge`}
                              >
                                More
                              </span>
                              <span>Additional detail</span>
                            </span>
                          </summary>
                          <div className={aiInsightsAnswerDetailBody}>
                            <AiInsightAnswerBody text={parsedInsightAnswer.moreDetail} />
                          </div>
                        </details>
                      ) : null}
                      </div>
                    </div>
                  ) : loading ? (
                    <p className={`${aiInsightsBodyText} mt-2`} role="status">
                      Generating insight…
                    </p>
                  ) : (
                    <p className={`${aiInsightsBodyText} mt-2 text-[var(--text-muted)] dark:text-[color:var(--insights-text-muted)]`}>
                      Your answer will appear here after you ask a question.
                    </p>
                  )}
                </div>
                ) : null}

                {loading && !insightHasRenderableVisualization && !hasValidAIAnswer ? (
                  <div
                    className="w-full min-w-0 overflow-hidden rounded-2xl border border-[color:var(--border-default)]/60 bg-[color:var(--surface-subtle)] p-4 dark:border-[color:var(--insights-border-soft)] dark:bg-[color:var(--insights-layer-card)]"
                    aria-hidden
                  >
                    <div className="mb-3 h-3 w-28 animate-pulse rounded bg-slate-200/80 dark:bg-white/10" />
                    <div
                      className="animate-pulse rounded-xl border border-[color:var(--border-default)]/40 bg-slate-100/80 dark:border-[color:var(--insights-border-soft)] dark:bg-[color:var(--insights-layer-inset)]"
                      style={{ minHeight: `${Math.max(insightShellPlotHeight, 220)}px` }}
                    />
                  </div>
                ) : null}

                {insightHasRenderableVisualization ? (
                  <div className={aiInsightsVizCard}>
                    <div className="mb-1 w-full min-w-0 text-center">
                      <p className={aiInsightsVizKicker}>Visualization</p>
                    </div>
                    <div className={aiInsightsVizHeaderZone}>
                      {insightChartHeadingBlock}
                      <div
                        title={insightChartMetadataLine}
                        className={aiInsightsVizChipsWrap}
                      >
                        <ChartContextSummary
                          renderedKind={insightRenderedChartKind}
                          metricLabel={insightChartMeasureLabel}
                          semanticHeader={insightChartSemanticHeader}
                          badgeCompact={insightChartMetadataBadgeCompact}
                          leadInsight={insightChartInsightBadge ?? undefined}
                          qualityWarning={insightChartRateWarning ?? undefined}
                          compactChips
                        />
                    </div>
                    </div>
                    <div className={aiInsightsVizChartStage}>
                      <AiInsightChartShell
                        chartKind={insightPresentationChartKind}
                        plotHeight={insightShellPlotHeight}
                      >
                        <div
                          key={`${insightChartId ?? "ic"}-${insightSnapshot?.createdAt ?? 0}-${insightChartData.length}`}
                          className={aiInsightsVizPlotSurface}
                        >
                          {renderDatasetChart(
                            insightShellPlotHeight,
                            false,
                            true
                          )}
                        </div>
                      </AiInsightChartShell>
                      {insightChartMatchesCurrentQuestion &&
                      insightSmartChartIntel?.active &&
                      !insightExecutiveSummaryMode ? (
                        <div className={aiInsightsSmartPanelDivider}>
                          <SmartChartInsightPanel
                            intel={insightSmartChartIntel}
                            cards={insightExecutiveVizInsights.slice(0, 3)}
                          />
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : hasValidAIAnswer && insightUnsupportedTrend ? (
                  <div className="rounded-xl border border-slate-200/90 bg-slate-50 px-4 py-4 text-sm text-slate-800 dark:border-[color:var(--insights-border-soft)] dark:bg-gradient-to-br dark:from-[color:var(--insights-layer-card)] dark:to-[color:var(--insights-layer-inset)] dark:text-[color:var(--insights-text-secondary)]">
                    <p className="font-semibold text-slate-900 dark:text-[var(--foreground)]">
                      {insightUnsupportedTrend.title}
                    </p>
                    <p className="mt-1.5 text-slate-600 leading-relaxed dark:text-[color:var(--insights-text-muted)]">
                      <span className="font-medium text-slate-700 dark:text-[color:var(--insights-text-secondary)]">
                        Reason:
                      </span>{" "}
                      {insightUnsupportedTrend.reason}
                    </p>
                    <p className="mt-1.5 text-slate-600 leading-relaxed dark:text-[color:var(--insights-text-muted)]">
                      <span className="font-medium text-slate-700 dark:text-[color:var(--insights-text-secondary)]">
                        Required:
                      </span>{" "}
                      {insightUnsupportedTrend.requiredAction}
                    </p>
                  </div>
                ) : hasValidAIAnswer && !insightHasRenderableVisualization ? (
                  <div className="rounded-xl border border-slate-200/90 bg-slate-50 px-4 py-4 text-sm text-slate-800 dark:border-[color:var(--insights-border-soft)] dark:bg-gradient-to-br dark:from-[color:var(--insights-layer-card)] dark:to-[color:var(--insights-layer-inset)] dark:text-[color:var(--insights-text-secondary)]">
                    <p className="font-semibold text-slate-900 dark:text-[var(--foreground)]">
                      No dedicated visualization for this answer
                    </p>
                    <p className="mt-1.5 text-slate-600 leading-relaxed dark:text-[color:var(--insights-text-muted)]">
                      {!insightChartMatchesCurrentQuestion &&
                      insightSnapshot &&
                      insightSnapshot.chartData.length > 0
                        ? "The chart from your previous question does not match this one. The narrative above reflects your latest ask."
                        : "The assistant did not return chart data for this question. The narrative above still reflects the latest response."}
                    </p>
                  </div>
                ) : null}

                {hasValidAIAnswer &&
                insightExecutiveVizInsights.length > 0 &&
                (insightVisualization ||
                  insightUnsupportedGrowth ||
                  insightUnsupportedTrend ||
                  insightUnsupportedDecline ||
                  insightUnsupportedMultiMetric) ? (
                  <AiExecutiveInsightsPanel
                    cards={insightExecutiveVizInsights}
                    narrativeBrief={insightExecutiveBrief}
                  />
                ) : null}

                {hasValidAIAnswer &&
                alignedAnalysis &&
                !insightExecutiveSummaryMode ? (
                  <div
                    className={`${aiInsightsConfidenceShell} ${
                      alignedAnalysis.smallSampleCohort ||
                      isCautiousNarrativeTone(insightNarrativeTone)
                        ? aiInsightsConfidenceCaution
                        : aiInsightsConfidenceNormal
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className={aiInsightsMutedLabel}>
                          Insight confidence (sample-aware)
                        </p>
                        <p className={`${aiInsightsBodyText} mt-1.5`}>
                          {insightUnifiedConfidence?.rationale ||
                            alignedAnalysis.evidenceSummaryLine ||
                            `Chart uses ${alignedAnalysis.chartSeriesPointCount.toLocaleString()} series point(s).`}
                        </p>
                        {insightNarrativeDisclaimer ? (
                          <p className={aiInsightsConfidenceDisclaimer}>
                            {insightNarrativeDisclaimer}
                          </p>
                        ) : null}
                        {(alignedAnalysis.insightConfidenceRationale ||
                          alignedAnalysis.smallSampleCohort ||
                          isCautiousNarrativeTone(insightNarrativeTone)) && (
                          <p className={`${aiInsightsSubtleText} mt-1.5`}>
                            Details on scoring and sample cautions are under{" "}
                            <span className="font-medium text-slate-700 dark:text-[color:var(--insights-text-secondary)]">
                              How this insight was generated
                            </span>
                            .
                          </p>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <span
                          className={insightEngineConfidenceBadgeClass(
                            insightUnifiedConfidence?.level ??
                              alignedAnalysis.insightConfidenceLevel
                          )}
                        >
                          {confidenceBadgeLabel(
                            insightUnifiedConfidence?.level ??
                              (alignedAnalysis.insightConfidenceLevel as InsightConfidenceLevel)
                          )}
                        </span>
                        <span className="text-[11px] tabular-nums text-slate-600 dark:text-[color:var(--insights-text-muted)]">
                          Score{" "}
                          {insightUnifiedConfidence?.score ??
                            alignedAnalysis.insightConfidenceScore}
                          /100
                        </span>
                      </div>
                    </div>
                  </div>
                ) : null}

                {hasValidAIAnswer && insightFollowUpChips.length > 0 ? (
                  <div className={aiInsightsFollowupSection}>
                    <p className={aiInsightsFollowupTitle}>Suggested follow-ups</p>
                    <div className={aiInsightsFollowupList}>
                      {insightFollowUpChips.map((chip) => (
                        <button
                          key={chip}
                          type="button"
                          disabled={loading}
                          onClick={() => {
                            void askAI(chip, { fromFollowUpChip: true });
                          }}
                          className={aiInsightsFollowupChip}
                          title={`Ask follow-up: ${chip}`}
                          aria-label={`Ask follow-up: ${chip}`}
                        >
                          {chip}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}

                {hasValidAIAnswer &&
                (insightVisualization?.provenance ||
                insightChartRoutingRecommendation ||
                insightVisualization?.contextUsed ||
                insightVisualization?.partialVisualizationWarning ||
                alignedAnalysis?.conversationFollowUp ||
                SHOW_INTENT_DEBUG) ? (
                  <div className={`${aiInsightsProvenanceShell} ai-insights-provenance`}>
                    <button
                      type="button"
                      onClick={() => setHowCalculatedOpen((o) => !o)}
                      className={aiInsightsProvenanceToggle}
                    >
                      <span className={aiInsightsProvenanceToggleTitle}>
                        How this insight was generated
                      </span>
                      <span className="flex items-center gap-2 shrink-0">
                        {insightUnifiedConfidence ? (
                          <span
                            className={insightEngineConfidenceBadgeClass(
                              insightUnifiedConfidence.level
                            )}
                          >
                            Insight{" "}
                            {confidenceBadgeLabel(insightUnifiedConfidence.level)}
                          </span>
                        ) : null}
                        {insightVisualization?.provenance ? (
                          <span
                            className={provenanceConfidenceBadgeClass(
                              insightVisualization.provenance.confidence
                            )}
                          >
                            Routing {insightVisualization.provenance.confidence}
                          </span>
                        ) : insightChartRoutingRecommendation ? (
                          <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-md border bg-sky-50 text-sky-900 border-sky-200/80">
                            Chart routing
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-md border bg-violet-50 text-violet-900 border-violet-200/80">
                            Context
                          </span>
                        )}
                        <span className="text-slate-400 text-xs dark:text-slate-500" aria-hidden>
                          {howCalculatedOpen ? "▾" : "▸"}
                        </span>
                      </span>
                    </button>
                    {howCalculatedOpen ? (
                      <div className={aiInsightsProvenanceBody}>
                        {insightCorrelationCaution ? (
                          <div className={aiInsightsProvenanceDivider}>
                            <p className={`${aiInsightsProvenanceSectionLabel} mb-2`}>
                              Correlation caution
                            </p>
                            <p className={`${aiInsightsProvenanceSectionBodyEmphasis} text-amber-950/95 dark:text-amber-200/90`}>
                              {insightCorrelationCaution}
                            </p>
                          </div>
                        ) : null}
                        {insightVisualization?.partialVisualizationWarning ? (
                          <div className={aiInsightsProvenanceDivider}>
                            <p className={`${aiInsightsProvenanceSectionLabel} mb-2`}>
                              Visualization caution (full)
                            </p>
                            <p className={`${aiInsightsProvenanceSectionBodyEmphasis} text-amber-950/95 dark:text-amber-200/90`}>
                              {insightVisualization.partialVisualizationWarning}
                            </p>
                          </div>
                        ) : null}
                        {alignedAnalysis?.insightConfidenceRationale ||
                        alignedAnalysis?.smallSampleCohort ||
                        isCautiousNarrativeTone(insightNarrativeTone) ? (
                          <div className={aiInsightsProvenanceDivider}>
                            <p className={`${aiInsightsProvenanceSectionLabel} mb-1.5`}>
                              Confidence &amp; sample methodology
                            </p>
                            <p className={aiInsightsProvenanceSectionBodyEmphasis}>
                              {insightUnifiedConfidence?.rationale ||
                                alignedAnalysis?.insightConfidenceRationale}
                            </p>
                            {insightNarrativeDisclaimer ? (
                              <p className="text-xs text-amber-950/90 mt-2 leading-relaxed">
                                {insightNarrativeDisclaimer}
                              </p>
                            ) : alignedAnalysis?.smallSampleCohort ? (
                              <p className="text-xs text-amber-950/90 mt-2 leading-relaxed">
                                Under 100 rows in this cohort: the assistant is instructed
                                to separate facts from hypotheses, use hedging language,
                                and avoid strong claims about quality or satisfaction unless
                                the numbers explicitly support them.
                              </p>
                            ) : null}
                            {alignedAnalysis?.insightConfidenceBreakdown ? (
                              <div className="mt-3 space-y-1.5">
                                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-600 dark:text-[color:var(--insights-text-muted)]">
                                  Score breakdown
                                </p>
                                <ul className="text-xs space-y-1 text-slate-700 dark:text-[color:var(--insights-text-secondary)]">
                                  {(
                                    [
                                      "sampleSize",
                                      "metricMatch",
                                      "dimensionMatch",
                                      "intentMatch",
                                      "chartSuitability",
                                      "dataCompleteness",
                                    ] as const
                                  ).map((key) => {
                                    const row =
                                      alignedAnalysis.insightConfidenceBreakdown![
                                        key
                                      ];
                                    return (
                                      <li
                                        key={key}
                                        className="flex items-baseline justify-between gap-3"
                                      >
                                        <span>{row.label}</span>
                                        <span className="tabular-nums font-medium shrink-0">
                                          {row.score}/100
                                        </span>
                                      </li>
                                    );
                                  })}
                                </ul>
                                <p className="text-[11px] text-slate-500 dark:text-[color:var(--insights-text-muted)] mt-1">
                                  Total{" "}
                                  {insightUnifiedConfidence?.score ??
                                    alignedAnalysis.insightConfidenceScore}
                                  /100 — components are weighted inputs to the
                                  final band, not a simple sum.
                                </p>
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                        {insightVisualization?.contextUsed ||
                        alignedAnalysis?.conversationFollowUp?.contextUsedLine ? (
                          <div
                            className={
                              insightChartRoutingRecommendation ||
                              insightVisualization?.provenance
                                ? aiInsightsProvenanceDivider
                                : ""
                            }
                          >
                            <p className={`${aiInsightsProvenanceSectionLabel} mb-1.5`}>
                              Context used
                            </p>
                            <p className={aiInsightsProvenanceSectionBodyEmphasis}>
                              {insightVisualization?.contextUsed ||
                                alignedAnalysis?.conversationFollowUp
                                  ?.contextUsedLine}
                            </p>
                          </div>
                        ) : null}
                        {insightChartRoutingRecommendation ? (
                          <div
                            className={
                              insightVisualization?.provenance
                                ? aiInsightsProvenanceDivider
                                : ""
                            }
                          >
                            <p className={`${aiInsightsProvenanceSectionLabel} mb-2`}>
                              Chart selection (engine)
                            </p>
                            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3 text-sm">
                              <div className="flex flex-col gap-0.5 min-w-0">
                                <dt className={aiInsightsProvenanceMetaLabel}>
                                  Detected chart type
                                </dt>
                                <dd className={aiInsightsProvenanceMetaValue}>
                                  {humanizeRecommendedChartApi(
                                    chartKindToApiChartType(
                                      insightRenderedChartKind || "bar"
                                    ) ||
                                      insightChartRoutingRecommendation.recommendedChart
                                  )}
                                </dd>
                              </div>
                              <div className="flex flex-col gap-0.5 min-w-0">
                                <dt className={aiInsightsProvenanceMetaLabel}>
                                  Question bucket
                                </dt>
                                <dd className={`${aiInsightsProvenanceMetaValue} capitalize`}>
                                  {insightChartRoutingRecommendation.detectedIntent ||
                                    "—"}
                                </dd>
                              </div>
                              <div className="flex flex-col gap-0.5 min-w-0">
                                <dt className={aiInsightsProvenanceMetaLabel}>
                                  Category count
                                </dt>
                                <dd className={`${aiInsightsProvenanceMetaValue} tabular-nums`}>
                                  {insightChartRoutingRecommendation.categoryCount.toLocaleString()}
                                </dd>
                              </div>
                              <div className="flex flex-col gap-0.5 min-w-0">
                                <dt className={aiInsightsProvenanceMetaLabel}>
                                  Metric type
                                </dt>
                                <dd className={`${aiInsightsProvenanceMetaValue} capitalize`}>
                                  {insightChartRoutingRecommendation.metricType}
                                </dd>
                              </div>
                              <div className="flex flex-col gap-0.5 sm:col-span-2 min-w-0">
                                <dt className={aiInsightsProvenanceMetaLabel}>
                                  Why this chart
                                </dt>
                                <dd className="text-slate-800 text-sm leading-relaxed">
                                  {insightChartRoutingRecommendation.selectionExplanation ||
                                    "—"}
                                </dd>
                              </div>
                            </dl>
                          </div>
                        ) : null}
                        {insightVisualization?.provenance ? (
                        <>
                        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2.5 text-sm">
                          <div className="flex flex-col gap-0.5 min-w-0">
                            <dt className={aiInsightsProvenanceMetaLabel}>
                              {isTrendMode(insightSnapshot?.contract)
                                ? "Time column"
                                : "Category column"}
                            </dt>
                            <dd className={`${aiInsightsProvenanceMetaValue} truncate`}>
                              {formatProvenanceColumn(
                                insightVisualization.provenance.categoryColumnDisplay ||
                                  insightVisualization.provenance.categoryColumn
                              )}
                            </dd>
                            {insightVisualization.provenance.categoryColumnDisplay &&
                            insightVisualization.provenance.categoryColumn &&
                            insightVisualization.provenance.categoryColumnDisplay.trim() !==
                              formatProvenanceColumn(
                                insightVisualization.provenance.categoryColumn
                              ).trim() ? (
                              <dd className="text-[11px] text-slate-500 truncate tabular-nums">
                                Source field:{" "}
                                {formatProvenanceColumn(
                                  insightVisualization.provenance.categoryColumn
                                )}
                              </dd>
                            ) : null}
                          </div>
                          <div className="flex flex-col gap-0.5 min-w-0">
                            <dt className={aiInsightsProvenanceMetaLabel}>
                              {insightPresentationChartKind === "scatter"
                                ? "Y metric"
                                : "Metric"}
                            </dt>
                            <dd className={`${aiInsightsProvenanceMetaValue} truncate`}>
                              {formatProvenanceColumn(
                                insightVisualization.provenance.numericColumnDisplay ||
                                  insightVisualization.provenance.numericColumn
                              )}
                            </dd>
                            {insightVisualization.provenance.numericColumnDisplay &&
                            insightVisualization.provenance.numericColumn &&
                            insightVisualization.provenance.numericColumnDisplay.trim() !==
                              formatProvenanceColumn(
                                insightVisualization.provenance.numericColumn
                              ).trim() ? (
                              <dd className="text-[11px] text-slate-500 truncate tabular-nums">
                                Source field:{" "}
                                {formatProvenanceColumn(
                                  insightVisualization.provenance.numericColumn
                                )}
                              </dd>
                            ) : null}
                          </div>
                          <div className="flex flex-col gap-0.5 min-w-0">
                            <dt className={aiInsightsProvenanceMetaLabel}>
                              Aggregation
                            </dt>
                            <dd className={`${aiInsightsProvenanceMetaValue} capitalize`}>
                              {insightPresentationChartKind === "scatter"
                                ? "Relationship"
                                : insightVisualization.provenance.aggregation}
                            </dd>
                          </div>
                          {insightPresentationChartKind === "scatter" &&
                          (insightVisualization.relationshipMeasureLabel ||
                            parseRelationshipInsights(
                              insightVisualization.relationshipInsights
                            )?.measureLabel) ? (
                            <div className="flex flex-col gap-0.5 sm:col-span-2 min-w-0">
                              <dt className={aiInsightsProvenanceMetaLabel}>
                                Relationship
                              </dt>
                              <dd className={`${aiInsightsProvenanceMetaValue} truncate`}>
                                {titleCaseRelationshipPhrase(
                                  insightVisualization.relationshipMeasureLabel?.trim() ||
                                    parseRelationshipInsights(
                                      insightVisualization.relationshipInsights
                                    )?.measureLabel ||
                                    insightChartMeasureLabel
                                )}
                              </dd>
                            </div>
                          ) : null}
                          <div className="flex flex-col gap-0.5 min-w-0">
                            <dt className={aiInsightsProvenanceMetaLabel}>
                              Rows analyzed
                            </dt>
                            <dd className={`${aiInsightsProvenanceMetaValue} tabular-nums`}>
                              {(
                                insightRowsAnalyzedDisplay ??
                                insightVisualization.provenance.rowsAnalyzed
                              ).toLocaleString()}
                            </dd>
                          </div>
                          {insightVisualization.provenance.dashboardFiltersApplied
                            ?.length ? (
                            <div className="flex flex-col gap-0.5 sm:col-span-2 min-w-0">
                              <dt className={aiInsightsProvenanceMetaLabel}>
                                Filters applied
                              </dt>
                              <dd>
                                <ul className="text-sm text-slate-800 space-y-1 list-disc pl-4">
                                  {insightVisualization.provenance.dashboardFiltersApplied.map(
                                    (ln, i) => (
                                      <li key={i}>{ln}</li>
                                    )
                                  )}
                                </ul>
                              </dd>
                            </div>
                          ) : null}
                          <div className="flex flex-col gap-0.5 min-w-0">
                            <dt className={aiInsightsProvenanceMetaLabel}>
                              Visualization
                            </dt>
                                <dd className={aiInsightsProvenanceMetaValue}>
                              {insightProvenanceVisualizationLabel ??
                                (insightPresentationChartKind === "scatter"
                                  ? "Scatter Plot"
                                  : insightVisualization.provenance.visualizationType)}
                            </dd>
                          </div>
                          {insightVisualization.provenance.chartSelectionReason ? (
                            <div className="flex flex-col gap-0.5 sm:col-span-2 min-w-0">
                              <dt className={aiInsightsProvenanceMetaLabel}>
                                Reason
                              </dt>
                              <dd className="text-slate-800 text-sm leading-relaxed">
                                {insightVisualization.provenance.chartSelectionReason}
                              </dd>
                            </div>
                          ) : null}
                          {insightVisualization.provenance.timeSeriesAnalysis ? (
                            <div className="flex flex-col gap-0.5 sm:col-span-2 min-w-0">
                              <dt className={aiInsightsProvenanceMetaLabel}>
                                Time coverage
                              </dt>
                              <dd className="text-slate-800 text-sm leading-relaxed space-y-1">
                                {typeof insightVisualization.provenance.timeSeriesAnalysis
                                  .selectionReason === "string" &&
                                insightVisualization.provenance.timeSeriesAnalysis.selectionReason
                                  .trim() ? (
                                  <p>
                                    {
                                      insightVisualization.provenance.timeSeriesAnalysis
                                        .selectionReason as string
                                    }
                                  </p>
                                ) : null}
                                <p className="text-xs text-slate-600 tabular-nums">
                                  {[
                                    insightVisualization.provenance.timeSeriesAnalysis
                                      .timeBucket != null
                                      ? `Bucket: ${String(insightVisualization.provenance.timeSeriesAnalysis.timeBucket)}`
                                      : null,
                                    insightVisualization.provenance.timeSeriesAnalysis
                                      .spanDays != null
                                      ? `Span ≈ ${String(insightVisualization.provenance.timeSeriesAnalysis.spanDays)} d`
                                      : null,
                                    insightVisualization.provenance.timeSeriesAnalysis
                                      .uniqueBuckets != null
                                      ? `Periods: ${String(insightVisualization.provenance.timeSeriesAnalysis.uniqueBuckets)}`
                                      : null,
                                    insightVisualization.provenance.timeSeriesAnalysis
                                      .timeCoverage &&
                                    typeof insightVisualization.provenance.timeSeriesAnalysis
                                      .timeCoverage === "object"
                                      ? `Date density score: ${String(
                                          (
                                            insightVisualization.provenance.timeSeriesAnalysis
                                              .timeCoverage as Record<string, unknown>
                                          ).dateDensityScore ?? "—"
                                        )}`
                                      : null,
                                  ]
                                    .filter(Boolean)
                                    .join(" · ")}
                                </p>
                              </dd>
                            </div>
                          ) : null}
                          {alignedAnalysis?.detectedIntent?.length ? (
                            <div className="flex flex-col gap-0.5 sm:col-span-2 min-w-0">
                              <dt className={aiInsightsProvenanceMetaLabel}>
                                Detected intent
                              </dt>
                              <dd className="text-slate-800 text-sm">
                                {alignedAnalysis.detectedIntent.join(", ")}
                              </dd>
                            </div>
                          ) : null}
                          <div className="flex flex-col gap-0.5 min-w-0">
                            <dt className={aiInsightsProvenanceMetaLabel}>
                              Series points
                            </dt>
                            <dd className={`${aiInsightsProvenanceMetaValue} tabular-nums`}>
                              {insightVisualization.provenance.chartPoints.toLocaleString()}
                            </dd>
                          </div>
                          <div className="flex flex-col gap-0.5 sm:col-span-2 min-w-0">
                            <dt className={aiInsightsProvenanceMetaLabel}>
                              Chart routing confidence
                            </dt>
                            <dd className="flex flex-wrap items-center gap-2 text-slate-800">
                              <span
                                className={provenanceConfidenceBadgeClass(
                                  insightVisualization.provenance.confidence
                                )}
                              >
                                {insightVisualization.provenance.confidence}
                              </span>
                              {insightUnifiedConfidence ? (
                                <span className="text-xs text-slate-500">
                                  Insight confidence (sample-aware):{" "}
                                  <span className="font-semibold text-slate-700 dark:text-slate-200">
                                    {confidenceBadgeLabel(insightUnifiedConfidence.level)}
                                  </span>
                                  {" · "}
                                  Score {insightUnifiedConfidence.score}/100
                                </span>
                              ) : null}
                              {insightVisualization.provenance.flags
                                ?.fallbackAggregateUsed ? (
                                <span className="text-xs text-slate-500">
                                  Used structured aggregate fallback.
                                </span>
                              ) : null}
                              {insightVisualization.provenance.flags?.smartChartRoutingUsed ? (
                                <span className="text-xs text-slate-500">
                                  Routed via schema-driven chart builder.
                                </span>
                              ) : null}
                            </dd>
                          </div>
                        </dl>
                        {insightVisualization.provenance.analysisValidation?.checks
                          ?.length ? (
                          <div className="mt-4 pt-4 border-t border-slate-200/80">
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-2">
                              Analysis validation
                            </p>
                            <ul className="space-y-1.5 text-sm text-slate-800">
                              {insightVisualization.provenance.analysisValidation.checks.map(
                                (c, idx) => (
                                  <li key={idx} className="flex gap-2 items-start">
                                    <span className="shrink-0 font-semibold">
                                      {c.ok ? "✓" : "⚠"}
                                    </span>
                                    <span
                                      className={
                                        c.ok ? "text-slate-800" : "text-amber-900"
                                      }
                                    >
                                      {c.label}
                                    </span>
                                  </li>
                                )
                              )}
                            </ul>
                          </div>
                        ) : null}
                        </>
                        ) : null}
                        {insightVisualization?.provenance?.notes ? (
                          <p className="mt-3 text-xs text-slate-500 leading-relaxed border-t border-slate-200/70 pt-3">
                            {insightVisualization.provenance.notes}
                          </p>
                        ) : null}
                        <IntentEngineDebugPanel
                          intent={alignedAnalysis?.analysisIntent}
                          routingConfidence={
                            insightVisualization?.provenance?.confidence ??
                            (insightUnifiedConfidence
                              ? `Insight ${insightUnifiedConfidence.level} (${insightUnifiedConfidence.score}/100)`
                              : null)
                          }
                        />
                      </div>
                    ) : null}
                  </div>
                ) : null}
                </div>

                {showInsightExportButton ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        downloadReport({
                          includeKPIs: true,
                          includeAIInsight: true,
                          includeChart: true,
                          includeDataPreview: true,
                          includeDataQuality: true,
                          includeConversationContext: true,
                          chartScope: "insight",
                        })
                      }
                      className={aiInsightsBtnExport}
                    >
                      Export this insight (PDF)
                    </button>
                  </div>
                ) : null}
                {process.env.NEXT_PUBLIC_AI_INSIGHTS_DEBUG === "true" ? (
                <details className="mt-1.5 text-xs text-slate-600 dark:text-[color:var(--insights-text-muted)]">
                  <summary className="cursor-pointer font-medium text-slate-500 select-none dark:text-[color:var(--insights-text-muted)]">
                    Export / chart debug
                  </summary>
                  <pre className="mt-2 p-3 bg-slate-100 rounded-lg overflow-x-auto text-[11px] leading-relaxed dark:bg-[color:var(--insights-layer-inset)] dark:text-[color:var(--insights-text-secondary)]">
                    {JSON.stringify(exportInsightDebug, null, 2)}
                  </pre>
                </details>
                ) : null}
              </div>
            </div>
          </section>
        )}

        {activeTab === "export" && (
          <section className={exportTabPage}>
            <div className={exportTabHeaderRow}>
              <h2 className={exportTabTitle}>Export</h2>
              <p className={exportTabDesc}>
                Choose what to include in the report, then download a business-ready PDF.
              </p>
            </div>

            <div className={exportTabStack}>
              <div className={exportTabSectionCard}>
                <p className={exportTabSectionKicker}>Preview</p>
                <h3 className={`${exportTabSectionTitle} mt-1`}>
                  Report Preview Summary
                </h3>
                <div className={exportTabSummaryGrid}>
                  <div className={exportTabSummaryChip}>
                    <span className={exportTabSummaryChipLabel}>Dataset</span>
                    <span className={exportTabSummaryChipValue}>
                      {rows.toLocaleString()} rows · {columns.length} columns
                    </span>
                  </div>
                  <div className={exportTabSummaryChip}>
                    <span className={exportTabSummaryChipLabel}>AI answer</span>
                    <span
                      className={
                        answer.trim()
                          ? exportTabSummaryChipValue
                          : exportTabSummaryChipValueMuted
                      }
                    >
                      {answer.trim() ? "Available" : "Not available yet"}
                    </span>
                  </div>
                  <div className={`${exportTabSummaryChip} ${exportTabSummaryChipSpan}`}>
                    <span className={exportTabSummaryChipLabel}>Visualization</span>
                    <span
                      className={
                        visualization && visualization.labels.length > 0
                          ? exportTabSummaryChipValue
                          : exportTabSummaryChipValueMuted
                      }
                      title={exportVizSummaryLabel}
                    >
                      {exportVizSummaryLabel}
                    </span>
                  </div>
                  <div className={`${exportTabSummaryChip} ${exportTabSummaryChipSpan}`}>
                    <span className={exportTabSummaryChipLabel}>Report sections</span>
                    <div className={exportTabSummarySectionsWrap}>
                      {exportSelectedSectionLabels.length > 0 ? (
                        exportSelectedSectionLabels.map((label) => (
                          <span key={label} className={exportTabSummarySectionPill}>
                            {label}
                          </span>
                        ))
                      ) : (
                        <span className={exportTabSummaryChipValueMuted}>
                          None selected
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                {exportExecutiveInsightsPreview ? (
                  <div className={exportTabExecutivePreview}>
                    <p className={exportTabExecutivePreviewTitle}>
                      Executive insights (PDF)
                    </p>
                    <p className={exportTabExecutivePreviewScope}>
                      {exportExecutiveInsightsPreview.scopeLabel}
                    </p>
                    {exportExecutiveInsightsPreview.brief ? (
                      <p className={exportTabExecutivePreviewBody}>
                        <span className="font-semibold text-[var(--foreground)]">
                          AI context ·{" "}
                        </span>
                        {exportExecutiveInsightsPreview.brief}
                      </p>
                    ) : null}
                    {exportExecutiveInsightsPreview.facts.length > 0 ? (
                      <ul className={exportTabExecutivePreviewList}>
                        {exportExecutiveInsightsPreview.facts.map((c) => (
                          <li key={c.key}>
                            <span className="font-semibold text-[var(--foreground)]">
                              {c.title}:
                            </span>{" "}
                            {c.value}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ) : null}
              </div>

              <div className={exportTabSectionCard}>
                <h3 className={exportTabSectionTitle}>Report branding</h3>
                <p className={exportTabSectionDesc}>
                  Shown on the cover page, running headers, and footers. Saved in this
                  browser only.
                </p>
                <div className={exportTabFormGrid}>
                  <div className={exportTabFormRow}>
                    <label className="flex min-w-0 flex-1 flex-col">
                      <span className={exportTabFieldLabel}>Company or team name</span>
                      <input
                        type="text"
                        value={reportBranding.companyName}
                        onChange={(e) =>
                          setReportBranding((b) => ({
                            ...b,
                            companyName: e.target.value,
                          }))
                        }
                        onBlur={(e) => {
                          setReportBranding((b) => {
                            const next = { ...b, companyName: e.target.value };
                            saveReportBranding(next);
                            return next;
                          });
                        }}
                        placeholder="e.g. Northwind Analytics"
                        className={exportTabTextInput}
                      />
                    </label>
                    <div className={exportTabColorField}>
                      <span className={exportTabFieldLabel}>Accent color</span>
                      <div className={exportTabColorSwatchWrap}>
                        <input
                          type="color"
                          value={reportBranding.accentHex}
                          onChange={(e) => {
                            const accentHex = e.target.value;
                            setReportBranding((b) => {
                              const next = { ...b, accentHex };
                              saveReportBranding(next);
                              return next;
                            });
                          }}
                          className={exportTabColorInput}
                          title="Accent color"
                        />
                        <span className={exportTabColorHex} aria-hidden>
                          {reportBranding.accentHex}
                        </span>
                      </div>
                    </div>
                  </div>
                  <label className="block min-w-0">
                    <span className={exportTabFieldLabel}>Tagline (optional)</span>
                    <input
                      type="text"
                      value={reportBranding.tagline}
                      onChange={(e) =>
                        setReportBranding((b) => ({
                          ...b,
                          tagline: e.target.value,
                        }))
                      }
                      onBlur={(e) => {
                        setReportBranding((b) => {
                          const next = { ...b, tagline: e.target.value };
                          saveReportBranding(next);
                          return next;
                        });
                      }}
                      placeholder="e.g. Q2 revenue & operations review"
                      className={`${exportTabTextInput} mt-1`}
                    />
                  </label>
                </div>
              </div>

              <div className={exportTabSectionCard}>
                <p className={exportTabSectionKicker}>Contents</p>
                <h3 className={`${exportTabSectionTitle} mt-1`}>Include in report</h3>
                <div className={exportTabOptionsGrid}>
                  <label className={exportTabCheckboxRow}>
                    <input
                      type="checkbox"
                      className={exportTabCheckboxInput}
                      checked={exportOptions.includeKPIs}
                      onChange={(e) =>
                        setExportOptions((prev) => ({
                          ...prev,
                          includeKPIs: e.target.checked,
                        }))
                      }
                    />
                    <span className={exportTabCheckboxLabel}>KPIs</span>
                  </label>
                  <label className={exportTabCheckboxRow}>
                    <input
                      type="checkbox"
                      className={exportTabCheckboxInput}
                      checked={exportOptions.includeAIInsight}
                      onChange={(e) =>
                        setExportOptions((prev) => ({
                          ...prev,
                          includeAIInsight: e.target.checked,
                        }))
                      }
                    />
                    <span className={exportTabCheckboxLabel}>AI Insight</span>
                  </label>
                  <label className={exportTabCheckboxRow}>
                    <input
                      type="checkbox"
                      className={exportTabCheckboxInput}
                      checked={exportOptions.includeChart}
                      onChange={(e) =>
                        setExportOptions((prev) => ({
                          ...prev,
                          includeChart: e.target.checked,
                        }))
                      }
                    />
                    <span className={exportTabCheckboxLabel}>Chart</span>
                  </label>
                  <label className={exportTabCheckboxRow}>
                    <input
                      type="checkbox"
                      className={exportTabCheckboxInput}
                      checked={exportOptions.includeDataPreview}
                      onChange={(e) =>
                        setExportOptions((prev) => ({
                          ...prev,
                          includeDataPreview: e.target.checked,
                        }))
                      }
                    />
                    <span className={exportTabCheckboxLabel}>Data Preview</span>
                  </label>
                  <label className={`${exportTabCheckboxRow} sm:col-span-2`}>
                    <input
                      type="checkbox"
                      className={exportTabCheckboxInput}
                      checked={exportOptions.includeDataQuality}
                      onChange={(e) =>
                        setExportOptions((prev) => ({
                          ...prev,
                          includeDataQuality: e.target.checked,
                        }))
                      }
                    />
                    <span className={exportTabCheckboxLabel}>Data Quality</span>
                  </label>
                </div>

                <div className={exportTabAdvancedDivider}>
                  <p className={exportTabSectionKicker}>Advanced</p>
                  <h3 className={`${exportTabSectionTitle} mt-1`}>Advanced options</h3>
                  <p className={exportTabSectionDesc}>
                    Optional add-ons for audit trails and technical readers.
                  </p>
                  <div className={exportTabAdvancedStack}>
                    <label className={exportTabCheckboxRowWide}>
                      <input
                        type="checkbox"
                        className={exportTabCheckboxInput}
                        checked={exportOptions.includeConversationContext ?? false}
                        onChange={(e) =>
                          setExportOptions((prev) => ({
                            ...prev,
                            includeConversationContext: e.target.checked,
                          }))
                        }
                      />
                      <span className={exportTabCheckboxLabel}>
                        AI conversation thread (prior questions, follow-up chain,
                        inherited filters)
                      </span>
                    </label>
                    <label className={exportTabCheckboxRowWide}>
                      <input
                        type="checkbox"
                        className={exportTabCheckboxInput}
                        checked={exportOptions.includeTechnicalAppendix === true}
                        onChange={(e) =>
                          setExportOptions((prev) => ({
                            ...prev,
                            includeTechnicalAppendix: e.target.checked,
                          }))
                        }
                      />
                      <span className={exportTabCheckboxLabel}>
                        Technical appendix (chart spec, raw series sample, sparklines,
                        engine metadata)
                      </span>
                    </label>
                  </div>
                </div>
              </div>

              <div className={exportTabFooter}>
                <p className={exportTabFooterHint}>
                  Generates a business-ready PDF with your selected sections and branding.
                </p>
                <button
                  type="button"
                  onClick={() => downloadReport()}
                  className={exportTabDownloadBtn}
                >
                  Download Report PDF
                </button>
              </div>
            </div>
          </section>
        )}

        {mappingModalOpen && columns.length > 0 && (
          <div
            className={ovModalOverlay}
            role="dialog"
            aria-modal="true"
            aria-labelledby="mapping-modal-title"
            onClick={() => setMappingModalOpen(false)}
          >
            <div
              className={ovModalPanel}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-4 border-b border-[color:var(--border-default)] p-6">
                <div>
                  <h2
                    id="mapping-modal-title"
                    className={ovSectionTitle}
                  >
                    Review column mapping
                  </h2>
                  <p className={`mt-1 ${ovSectionDesc}`}>
                    Select columns for each role, or leave{" "}
                    <span className="font-medium">Auto Detect</span> for automatic
                    matching.
                  </p>
                </div>
                <button
                  type="button"
                  className="text-slate-400 hover:text-slate-700 text-2xl leading-none px-1"
                  onClick={() => setMappingModalOpen(false)}
                  aria-label="Close"
                >
                  ×
                </button>
              </div>

              <div className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className={`mb-1 block text-sm font-medium ${ovMuted}`}>
                      Grouping dimension
                    </label>
                    <select
                      value={productColumn}
                      onChange={(e) => setProductColumn(e.target.value)}
                      className={ovModalInput}
                    >
                      <option value="">Auto Detect</option>
                      {columns.map((col) => (
                        <option key={col} value={col}>
                          {col}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={`mb-1 block text-sm font-medium ${ovMuted}`}>
                      Primary metric
                    </label>
                    <select
                      value={salesColumn}
                      onChange={(e) => setSalesColumn(e.target.value)}
                      className={ovModalInput}
                    >
                      <option value="">Auto Detect</option>
                      {columns.map((col) => (
                        <option key={col} value={col}>
                          {col}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={`mb-1 block text-sm font-medium ${ovMuted}`}>
                      Region / geography
                    </label>
                    <select
                      value={regionColumn}
                      onChange={(e) => setRegionColumn(e.target.value)}
                      className={ovModalInput}
                    >
                      <option value="">Auto Detect</option>
                      {columns.map((col) => (
                        <option key={col} value={col}>
                          {col}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={`mb-1 block text-sm font-medium ${ovMuted}`}>
                      Customer / entity
                    </label>
                    <select
                      value={customerColumn}
                      onChange={(e) => setCustomerColumn(e.target.value)}
                      className={ovModalInput}
                    >
                      <option value="">Auto Detect</option>
                      {columns.map((col) => (
                        <option key={col} value={col}>
                          {col}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={`mb-1 block text-sm font-medium ${ovMuted}`}>
                      Secondary metric (e.g. profit)
                    </label>
                    <select
                      value={profitColumn}
                      onChange={(e) => setProfitColumn(e.target.value)}
                      className={ovModalInput}
                    >
                      <option value="">Auto Detect</option>
                      {columns.map((col) => (
                        <option key={col} value={col}>
                          {col}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="md:col-span-2">
                    <label className={`mb-1 block text-sm font-medium ${ovMuted}`}>
                      Time / date column
                    </label>
                    <select
                      value={dateColumn}
                      onChange={(e) => setDateColumn(e.target.value)}
                      className={ovModalInput}
                    >
                      <option value="">Auto Detect</option>
                      {columns.map((col) => (
                        <option key={col} value={col}>
                          {col}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="mt-6 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={saveColumnMapping}
                    disabled={loading}
                    className={`${ovBtnSecondarySm} disabled:opacity-50`}
                  >
                    {loading ? "Saving…" : "Save mapping"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setMappingModalOpen(false)}
                    className={ovBtnSecondarySm}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        <PilotInfoModal
          section={pilotInfoModal}
          onClose={closePilotInfoModal}
        />

        <UpgradePlanModal
          open={upgradeModalOpen}
          limit={upgradeLimit}
          tier={planTier}
          message={upgradeMessage}
          planUsage={planUsage}
          onClose={() => setUpgradeModalOpen(false)}
          onSwitchToPaid={() => {
            setPlanTier("paid");
            setPlanTierState("paid");
            setUpgradeModalOpen(false);
          }}
        />

        </div>
    </AppShell>
  );
}

/** Alias for checklist / docs — same memo component as `OverviewDashboardChartSlot`. */
export const ChartCard = OverviewDashboardChartSlot;

export default function Home() {
  return (
    <ChartSessionProvider>
      <HomeInner />
    </ChartSessionProvider>
  );
}