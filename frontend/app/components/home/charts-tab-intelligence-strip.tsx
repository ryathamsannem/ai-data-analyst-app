"use client";

import { memo } from "react";
import {
  chartsTabIntelDivider,
  chartsTabIntelHighlight,
  chartsTabIntelItem,
  chartsTabIntelLabel,
  chartsTabIntelNote,
  chartsTabIntelRow,
  chartsTabIntelStrip,
  chartsTabIntelValue,
} from "@/lib/charts-tab-ui";

export type ChartsTabIntelligenceStripProps = {
  sourceLabel: string | null;
  chartTypeLabel: string | null;
  measureLabel: string | null;
  axisLabel: string | null;
  highlight: string | null;
  note: string | null;
};

function IntelSegment({
  label,
  value,
  showDivider,
}: {
  label: string;
  value: string;
  showDivider: boolean;
}) {
  return (
    <>
      {showDivider ? <span className={chartsTabIntelDivider} aria-hidden /> : null}
      <span className={chartsTabIntelItem} title={`${label}: ${value}`}>
        <span className={chartsTabIntelLabel}>{label}</span>
        <span className={chartsTabIntelValue}>{value}</span>
      </span>
    </>
  );
}

export const ChartsTabIntelligenceStrip = memo(function ChartsTabIntelligenceStrip(
  props: ChartsTabIntelligenceStripProps
) {
  const segments: { label: string; value: string }[] = [];
  if (props.sourceLabel?.trim()) {
    segments.push({ label: "Source", value: props.sourceLabel.trim() });
  }
  if (props.chartTypeLabel?.trim()) {
    segments.push({ label: "View", value: props.chartTypeLabel.trim() });
  }
  if (props.measureLabel?.trim()) {
    segments.push({ label: "Measure", value: props.measureLabel.trim() });
  }
  if (props.axisLabel?.trim()) {
    segments.push({ label: "Axis", value: props.axisLabel.trim() });
  }

  if (segments.length === 0 && !props.highlight?.trim() && !props.note?.trim()) {
    return null;
  }

  return (
    <div className={chartsTabIntelStrip}>
      {segments.length > 0 ? (
        <div className={chartsTabIntelRow}>
          {segments.map((seg, i) => (
            <IntelSegment
              key={seg.label}
              label={seg.label}
              value={seg.value}
              showDivider={i > 0}
            />
          ))}
          {props.highlight?.trim() ? (
            <>
              <span className={chartsTabIntelDivider} aria-hidden />
              <span className={chartsTabIntelHighlight} title={props.highlight}>
                {props.highlight.trim()}
              </span>
            </>
          ) : null}
        </div>
      ) : props.highlight?.trim() ? (
        <div className={chartsTabIntelRow}>
          <span className={chartsTabIntelHighlight}>{props.highlight.trim()}</span>
        </div>
      ) : null}
      {props.note?.trim() ? (
        <p className={chartsTabIntelNote}>{props.note.trim()}</p>
      ) : null}
    </div>
  );
});
