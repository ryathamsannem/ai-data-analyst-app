"use client";

import { Fragment, memo, useMemo } from "react";
import {
  aiInsightsAnswerBodyEmphasis,
  aiInsightsAnswerBodyListItem,
  aiInsightsAnswerBodyMetric,
  aiInsightsAnswerBodyPara,
  aiInsightsAnswerBodyWrap,
  aiInsightsAnswerFindingItem,
  aiInsightsAnswerFindingsList,
} from "@/lib/ai-insights-ui";

const METRIC_RE =
  /(\$?\d[\d,]*(?:\.\d+)?(?:%|[KMBkmb])?|\d+(?:\.\d+)?%)/g;

const BOLD_RE = /(\*\*[^*]+\*\*)/g;

function isMetricToken(part: string): boolean {
  return /^(\$?\d[\d,]*(?:\.\d+)?(?:%|[KMBkmb])?|\d+(?:\.\d+)?%)$/.test(part);
}

function highlightMetricsOnly(text: string) {
  const parts = text.split(METRIC_RE);
  if (parts.length <= 1) return text;
  return parts.map((part, i) =>
    part && isMetricToken(part) ? (
      <span key={`${i}-${part}`} className={aiInsightsAnswerBodyMetric}>
        {part}
      </span>
    ) : (
      <Fragment key={`${i}-t`}>{part}</Fragment>
    )
  );
}

/** Inline emphasis: markdown bold + metric highlighting (presentation only). */
export function formatInsightInline(text: string) {
  const boldParts = text.split(BOLD_RE);
  if (boldParts.length <= 1) return highlightMetricsOnly(text);

  return boldParts.map((part, i) => {
    const boldMatch = part.match(/^\*\*([^*]+)\*\*$/);
    if (boldMatch) {
      return (
        <strong key={`b-${i}`} className={aiInsightsAnswerBodyEmphasis}>
          {highlightMetricsOnly(boldMatch[1])}
        </strong>
      );
    }
    if (!part) return null;
    return <Fragment key={`t-${i}`}>{highlightMetricsOnly(part)}</Fragment>;
  });
}

const INSIGHT_LABEL_RE =
  /^(Key findings|What this may indicate|Suggested next steps|Statistical observations|How this was calculated)\b/i;

/** Multi-line summary with label lines emphasized (presentation only). */
export function formatInsightSummary(text: string) {
  const lines = text.split(/\r?\n/);
  return lines.map((line, i) => {
    const trimmed = line.trim();
    if (!trimmed) {
      return i < lines.length - 1 ? <br key={`br-${i}`} /> : null;
    }
    const isLabel = INSIGHT_LABEL_RE.test(trimmed);
    return (
      <Fragment key={`ln-${i}`}>
        {i > 0 ? <br /> : null}
        {isLabel ? (
          <span className={aiInsightsAnswerBodyEmphasis}>{formatInsightInline(trimmed)}</span>
        ) : (
          formatInsightInline(line)
        )}
      </Fragment>
    );
  });
}

/** @deprecated Use formatInsightInline */
export const highlightInsightMetrics = formatInsightInline;

function isBulletLine(line: string): boolean {
  return /^(\s*[-•*–—]\s+|\s*\d+[.)]\s+)/.test(line);
}

function stripBullet(line: string): string {
  return line.replace(/^(\s*[-•*–—]\s+|\s*\d+[.)]\s+)/, "").trim();
}

type BodyBlock =
  | { kind: "para"; text: string }
  | { kind: "list"; items: string[] };

function parseBodyBlocks(text: string): BodyBlock[] {
  const raw = text.trim();
  if (!raw) return [];

  const paragraphs = raw.split(/\n\s*\n/);
  const blocks: BodyBlock[] = [];

  for (const para of paragraphs) {
    const lines = para
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length === 0) continue;

    const bulletLines = lines.filter(isBulletLine);
    if (bulletLines.length >= 1 && bulletLines.length === lines.length) {
      blocks.push({
        kind: "list",
        items: lines.map(stripBullet).filter(Boolean),
      });
      continue;
    }

    if (lines.length > 1 && bulletLines.length >= Math.ceil(lines.length / 2)) {
      blocks.push({
        kind: "list",
        items: lines.map((l) => (isBulletLine(l) ? stripBullet(l) : l)).filter(Boolean),
      });
      continue;
    }

    blocks.push({ kind: "para", text: lines.join(" ") });
  }

  return blocks;
}

export const AiInsightAnswerBody = memo(function AiInsightAnswerBody({
  text,
  variant = "default",
}: {
  text: string;
  variant?: "default" | "findings";
}) {
  const blocks = useMemo(() => parseBodyBlocks(text), [text]);
  const asFindings = variant === "findings";

  if (blocks.length === 0) return null;

  return (
    <div className={aiInsightsAnswerBodyWrap}>
      {blocks.map((block, bi) => {
        if (block.kind === "list") {
          const itemCls = asFindings
            ? aiInsightsAnswerFindingItem
            : aiInsightsAnswerBodyListItem;
          return (
            <ul
              key={`list-${bi}`}
              className={
                asFindings
                  ? aiInsightsAnswerFindingsList
                  : "my-0 list-none space-y-2 pl-0"
              }
            >
              {block.items.map((item, ii) => (
                <li key={`${bi}-${ii}`} className={itemCls}>
                  {formatInsightInline(item)}
                </li>
              ))}
            </ul>
          );
        }
        return (
          <p key={`para-${bi}`} className={aiInsightsAnswerBodyPara}>
            {formatInsightInline(block.text)}
          </p>
        );
      })}
    </div>
  );
});

AiInsightAnswerBody.displayName = "AiInsightAnswerBody";
