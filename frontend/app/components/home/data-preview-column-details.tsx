"use client";

import { useMemo } from "react";
import {
  buildColumnRecommendations,
  inferColumnRoleChips,
  isLikelyBusinessField,
} from "@/lib/data-preview-phase-b";
import {
  buildColumnDetailStats,
  classifyColumnTypeBadge,
  formatPreviewSampleUniqueness,
  isLikelyIdentifierColumn,
  type ColumnDetailStat,
  type ColumnMappingPick,
  type DataPreviewProfile,
  type PreviewRow,
} from "@/lib/data-preview-schema";
import {
  dpColumnDetails,
  dpColumnDetailsBusinessBadge,
  dpColumnDetailsIdentifierPanel,
  dpColumnDetailsRecommendations,
  dpColumnDetailsRecChipAvoid,
  dpColumnDetailsRecChipGood,
  dpColumnDetailsRecChipsWrap,
  dpColumnDetailsRoleBadge,
  dpColumnDetailsRoleChipsWrap,
  dpColumnDetailsStatGroup,
  dpColumnDetailsStatGroupTitle,
  dpColumnDetailsStatLabel,
  dpSchemaRoleBadge,
  dpSchemaRoleBadgeCurrency,
  dpSchemaRoleBadgeIdentifier,
  dpSchemaRoleBadgeMetric,
} from "@/lib/data-preview-ui";

type Props = {
  column: string | null;
  profile: DataPreviewProfile | null;
  preview: PreviewRow[];
  totalRows: number;
  mapping: ColumnMappingPick;
  onClose: () => void;
};

function roleChipClass(chip: string): string {
  if (chip === "Identifier") return dpSchemaRoleBadgeIdentifier;
  if (chip === "Currency") return dpSchemaRoleBadgeCurrency;
  if (chip === "Metric" || chip === "Percentage") return dpSchemaRoleBadgeMetric;
  return dpSchemaRoleBadge;
}

function compactRecommendationLabel(item: string): string {
  if (item === "Record lookup") return "Lookup";
  return item;
}

function StatGrid({ stats }: { stats: ColumnDetailStat[] }) {
  if (stats.length === 0) return null;
  return (
    <dl className="grid gap-2 sm:grid-cols-2">
      {stats.map((stat) => (
        <div
          key={`${stat.label}-${stat.value}`}
          className="rounded-xl border border-[color:var(--border-default)] bg-[color:var(--surface-inset)] px-3 py-2"
        >
          <dt className={dpColumnDetailsStatLabel}>{stat.label}</dt>
          <dd className="mt-0.5 text-sm font-semibold tabular-nums text-foreground">
            {stat.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function StatSection({
  title,
  stats,
}: {
  title: string;
  stats: ColumnDetailStat[];
}) {
  if (stats.length === 0) return null;
  return (
    <div className={dpColumnDetailsStatGroup}>
      <p className={dpColumnDetailsStatGroupTitle}>{title}</p>
      <StatGrid stats={stats} />
    </div>
  );
}

export function DataPreviewColumnDetails({
  column,
  profile,
  preview,
  totalRows,
  mapping,
  onClose,
}: Props) {
  const detail = useMemo(() => {
    if (!column) return null;
    return buildColumnDetailStats({
      column,
      profile,
      preview,
      totalRows,
      mapping,
    });
  }, [column, profile, preview, totalRows, mapping]);

  const phaseB = useMemo(() => {
    if (!column || !detail || detail.unavailable) return null;
    const type = profile?.column_types?.[column];
    const badge = classifyColumnTypeBadge(column, type);
    const isIdentifier = isLikelyIdentifierColumn({
      column,
      type,
      preview,
      badge,
    });
    const roleChips = inferColumnRoleChips({
      column,
      type,
      badge,
      mapping,
      isIdentifier,
    });
    return {
      roleChips,
      recommendations: buildColumnRecommendations({
        roleChips,
        typeBadge: badge.kind,
      }),
      isBusinessField: isLikelyBusinessField(column),
    };
  }, [column, detail, profile, preview, mapping]);

  if (!column || !detail) return null;

  return (
    <section
      className={dpColumnDetails}
      aria-label={`Column details for ${column}`}
      role="region"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-foreground">{column}</h3>
            {phaseB?.roleChips.length ? (
              <span className={dpColumnDetailsRoleChipsWrap}>
                {phaseB.roleChips.map((chip) => (
                  <span key={chip} className={roleChipClass(chip)}>
                    {chip}
                  </span>
                ))}
              </span>
            ) : (
              <span className={dpColumnDetailsRoleBadge}>
                {detail.displayRole}
              </span>
            )}
            {phaseB?.isBusinessField ? (
              <span className={dpColumnDetailsBusinessBadge}>Business field</span>
            ) : null}
          </div>
          <p className="mt-0.5 text-xs text-[color:var(--text-muted)]">
            Column statistics
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded-lg border border-[color:var(--border-default)] px-2.5 py-1 text-xs font-semibold text-[color:var(--text-muted)] hover:bg-[color:var(--surface-subtle)]"
        >
          Close
        </button>
      </div>

      {detail.unavailable ? (
        <p className="mt-4 text-sm text-[color:var(--text-muted)]">
          Detailed stats not available for this column.
        </p>
      ) : (
        <div className="mt-3 space-y-3">
          <StatSection title="Full dataset profile" stats={detail.profileStats} />
          <StatSection title="Preview sample" stats={detail.previewStats} />

          {detail.identifierInsights ? (
            <div
              className={dpColumnDetailsIdentifierPanel}
              aria-label="Identifier insights"
            >
              <p className="text-xs font-semibold text-foreground">
                Identifier insights
              </p>
              <dl className="mt-2 grid gap-2 sm:grid-cols-2">
                {detail.identifierInsights.fullDatasetUniqueCount != null ? (
                  <div>
                    <dt className={dpColumnDetailsStatLabel}>
                      Full dataset unique count
                    </dt>
                    <dd className="mt-0.5 text-sm font-semibold tabular-nums text-foreground">
                      {detail.identifierInsights.fullDatasetUniqueCount.toLocaleString()}
                    </dd>
                  </div>
                ) : null}
                <div>
                  <dt className={dpColumnDetailsStatLabel}>Loaded preview rows</dt>
                  <dd className="mt-0.5 text-sm font-semibold tabular-nums text-foreground">
                    {detail.identifierInsights.previewRowsLoaded.toLocaleString()}
                  </dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className={dpColumnDetailsStatLabel}>
                    Preview sample uniqueness
                  </dt>
                  <dd className="mt-0.5 text-sm font-semibold text-foreground">
                    {formatPreviewSampleUniqueness(
                      detail.identifierInsights.previewUniqueValues,
                      detail.identifierInsights.previewRowsLoaded
                    )}
                  </dd>
                </div>
                <div>
                  <dt className={dpColumnDetailsStatLabel}>Record key / lookup</dt>
                  <dd className="mt-0.5 text-sm font-medium text-foreground">
                    Suitable as record key / lookup field
                  </dd>
                </div>
                <div>
                  <dt className={dpColumnDetailsStatLabel}>Aggregation charts</dt>
                  <dd className="mt-0.5 text-sm font-medium text-foreground">
                    Usually not useful for aggregation charts
                  </dd>
                </div>
              </dl>
              <p className="mt-2 text-xs leading-relaxed text-[color:var(--text-muted)]">
                {detail.identifierInsights.message}
              </p>
            </div>
          ) : null}

          {detail.previewTopValues && detail.previewTopValues.length > 0 ? (
            <StatSection
              title="Top values from preview rows"
              stats={detail.previewTopValues}
            />
          ) : null}

          {phaseB?.recommendations ? (
            <div className={dpColumnDetailsRecommendations} aria-label="Column recommendations">
              <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
                {phaseB.recommendations.goodFor.length > 0 ? (
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-semibold text-[color:var(--text-muted)]">
                      Recommended uses
                    </p>
                    <div className={dpColumnDetailsRecChipsWrap}>
                      {phaseB.recommendations.goodFor.map((item) => (
                        <span key={item} className={dpColumnDetailsRecChipGood}>
                          <span aria-hidden>✓</span>
                          {compactRecommendationLabel(item)}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}
                {phaseB.recommendations.avoid.length > 0 ? (
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold text-[color:var(--text-muted)]">
                      Avoid
                    </p>
                    <div className={dpColumnDetailsRecChipsWrap}>
                      {phaseB.recommendations.avoid.map((item) => (
                        <span key={item} className={dpColumnDetailsRecChipAvoid}>
                          <span aria-hidden>✕</span>
                          {item}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      )}

      {detail.footnote ? (
        <p className="mt-3 text-[10px] leading-relaxed text-[color:var(--text-subtle)]">
          {detail.footnote}
        </p>
      ) : null}
    </section>
  );
}
