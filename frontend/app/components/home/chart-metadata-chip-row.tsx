"use client";

import { memo } from "react";
import type { ChartMetadataChipSpec } from "@/lib/chart-metadata-chips";
import {
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
} from "@/lib/ai-insights-ui";

export const ChartMetadataChipRow = memo(function ChartMetadataChipRow({
  specs,
  compact = false,
}: {
  specs: readonly ChartMetadataChipSpec[];
  compact?: boolean;
}) {
  const chip = `${aiInsightsVizMetaChipBase} ${compact ? aiInsightsVizMetaChipCompactSize : aiInsightsVizMetaChipSize}`;
  const chipMuted = compact
    ? aiInsightsVizMetaChipLabelCompact
    : aiInsightsVizMetaChipLabel;
  const chipValue = aiInsightsVizMetaChipValue;
  const monoChip = `${aiInsightsVizMetaChipMono} ${compact ? aiInsightsVizMetaChipMonoCompactSize : aiInsightsVizMetaChipMonoSize}`;
  const leadChip = `${aiInsightsVizMetaChipLead} ${compact ? aiInsightsVizMetaChipLeadCompactSize : aiInsightsVizMetaChipLeadSize}`;

  return (
    <div
      data-chart-metadata-chips
      className={`flex flex-wrap items-center justify-center ${compact ? "gap-x-2 gap-y-1.5 sm:gap-x-2.5 sm:gap-y-2" : "mt-3 gap-2 px-1 sm:gap-2.5"}`}
    >
      {specs.map((spec) => {
        if (spec.kind === "lead") {
          return (
            <span
              key={spec.id}
              data-chart-metadata-chip
              data-chip-kind="lead"
              className={`${leadChip} min-w-0 items-center truncate`}
              title={spec.title ?? spec.value}
            >
              {spec.value}
            </span>
          );
        }
        if (spec.kind === "mono") {
          return (
            <span
              key={spec.id}
              data-chart-metadata-chip
              data-chip-kind="mono"
              className={`${monoChip} min-w-0 truncate`}
              title={spec.title ?? spec.value}
            >
              {spec.value}
            </span>
          );
        }
        return (
          <span
            key={spec.id}
            data-chart-metadata-chip
            data-chip-kind="labeled"
            className={`${chip} items-center`}
          >
            <span className={chipMuted}>{spec.label}</span>
            <span
              className={`max-w-[14rem] truncate ${chipValue}`}
              title={spec.title ?? spec.value}
            >
              {spec.value}
            </span>
          </span>
        );
      })}
    </div>
  );
});
