import type { ChartKind } from "@/app/chart-types";
import type { ChartSemanticHeaderModel } from "@/lib/chart-semantic-metadata";
import {
  buildChartMetadataBadgeCompact,
  buildChartMetadataChipSpecs,
  type ChartMetadataChipSpec,
} from "@/lib/chart-metadata-chips";
import type {
  ChartPresentationAxis,
  ChartPresentationMetadataChip,
} from "@/lib/chart-platform/chart-presentation-contract";

export function metadataSpecsToContractChips(
  specs: readonly ChartMetadataChipSpec[]
): ChartPresentationMetadataChip[] {
  return specs.map((spec) => ({ ...spec }));
}

export function contractChipsToMetadataSpecs(
  chips: readonly ChartPresentationMetadataChip[]
): ChartMetadataChipSpec[] {
  return chips.map((chip) => ({ ...chip }));
}

export function buildFallbackSemanticHeader(args: {
  kind: ChartKind;
  categoryLabel?: string | null;
  metricLabel?: string | null;
  xLabel?: string | null;
  yLabel?: string | null;
}): ChartSemanticHeaderModel {
  if (args.kind === "scatter") {
    return {
      mode: "scatter",
      xLabel: args.xLabel?.trim() || "X",
      yLabel: args.yLabel?.trim() || args.metricLabel?.trim() || "Y",
    };
  }
  if (args.kind === "line" || args.kind === "area") {
    return {
      mode: "mono",
      roleLabel: "Time",
      detailLabel: args.categoryLabel?.trim() || "Period",
    };
  }
  if (args.kind === "histogram") {
    return {
      mode: "mono",
      roleLabel: "Bucket range",
      detailLabel: args.metricLabel?.trim() || "Value",
    };
  }
  return {
    mode: "mono",
    roleLabel: "Category",
    detailLabel: args.categoryLabel?.trim() || "Category",
  };
}

export function axisFromSemanticHeader(args: {
  header: ChartSemanticHeaderModel;
  metricLabel: string;
}): {
  metric: ChartPresentationAxis;
  category: ChartPresentationAxis | null;
  xAxis: ChartPresentationAxis | null;
  yAxis: ChartPresentationAxis | null;
} {
  const metric: ChartPresentationAxis = {
    role: "metric",
    label: args.metricLabel || "Value",
  };
  if (args.header.mode === "scatter") {
    return {
      metric,
      category: null,
      xAxis: { role: "scatter_x", label: args.header.xLabel || "X" },
      yAxis: { role: "scatter_y", label: args.header.yLabel || "Y" },
    };
  }
  const role =
    args.header.roleLabel.toLowerCase().includes("time")
      ? "time"
      : args.header.roleLabel.toLowerCase().includes("bucket")
        ? "bucket"
        : "category";
  return {
    metric,
    category: {
      role,
      label: args.header.detailLabel || args.header.roleLabel || "Category",
    },
    xAxis: null,
    yAxis: null,
  };
}

export function buildContractMetadataChips(args: {
  renderedKind: ChartKind;
  metricLabel: string;
  semanticHeader: ChartSemanticHeaderModel;
  badgeCompact?: string | null;
  groupCount: number;
  leadInsight?: string | null;
}): ChartPresentationMetadataChip[] {
  const badgeCompact =
    args.badgeCompact?.trim() ||
    buildChartMetadataBadgeCompact(
      args.renderedKind,
      args.groupCount,
      null,
      null,
      false
    );
  return metadataSpecsToContractChips(
    buildChartMetadataChipSpecs({
      renderedKind: args.renderedKind,
      metricLabel: args.metricLabel,
      semanticHeader: args.semanticHeader,
      badgeCompact,
      leadInsight: args.leadInsight,
    })
  );
}
