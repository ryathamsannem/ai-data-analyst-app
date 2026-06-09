import { isMissingValue } from "@/lib/data-preview-missing";

export type SchemaColumnType = "number" | "date" | "text" | "category";

export type DataPreviewProfile = {
  column_types: Record<string, SchemaColumnType>;
  null_counts: Record<string, number>;
  summary_stats: Record<string, unknown>;
  unique_counts?: Record<string, number>;
};

export type PreviewRow = Record<string, string | number | null>;

export type ColumnMappingPick = {
  product?: string;
  sales?: string;
  region?: string;
  customer?: string;
  profit?: string;
  date?: string;
};

export type TypeBadgeKind =
  | "text"
  | "number"
  | "date"
  | "category"
  | "boolean"
  | "currency"
  | "rate";

export type SchemaColumnRow = {
  name: string;
  type: SchemaColumnType | undefined;
  typeBadge: TypeBadgeKind;
  typeBadgeLabel: string;
  nullCount: number | null;
  nullPercent: number | null;
  uniqueCount: number | null;
  uniqueSource: "full" | "preview" | "unavailable";
  semanticRole: string | null;
};

export type DataQualityLabel = "Good" | "Needs Review" | "Poor";

export type DataPreviewQualitySummary = {
  rowCount: number;
  columnCount: number;
  missingPercent: number | null;
  duplicateRowCount: number | null;
  duplicateNote: string | null;
  qualityLabel: DataQualityLabel;
};

export type ColumnDetailStat = {
  label: string;
  value: string;
};

export type ColumnDetailIdentifierInsights = {
  fullDatasetUniqueCount: number | null;
  previewRowsLoaded: number;
  previewUniqueValues: number;
  previewNonNullRows: number;
  message: string;
};

export type ColumnDetailResult = {
  column: string;
  typeBadgeLabel: string;
  displayRole: string;
  profileStats: ColumnDetailStat[];
  previewStats: ColumnDetailStat[];
  previewTopValues: ColumnDetailStat[] | null;
  identifierInsights: ColumnDetailIdentifierInsights | null;
  footnote: string | null;
  unavailable: boolean;
};

export const IDENTIFIER_INSIGHT_MESSAGE =
  "Values are mostly unique in the loaded preview rows, so this column is useful for lookup or row-level tracing, but usually not useful for grouped charts.";

export const DP_LABEL_FULL_DATASET_UNIQUE = "Full dataset unique count";
export const DP_LABEL_LOADED_PREVIEW_ROWS = "Loaded preview rows";
export const DP_LABEL_PREVIEW_SAMPLE_UNIQUENESS = "Preview sample uniqueness";
export const DP_LABEL_NULL_FULL_DATASET = "Null % (full dataset)";

export function formatPreviewSampleUniqueness(
  uniqueValues: number,
  loadedRows: number
): string {
  return `${uniqueValues.toLocaleString()} unique values in ${loadedRows.toLocaleString()} loaded rows`;
}

const CURRENCY_NAME_RE =
  /(?:revenue|profit|amount|price|cost|spend|sales|fee|total|value|usd|eur|gbp|inr)/i;
const RATE_NAME_RE =
  /(?:rate|pct|percent|percentage|conversion|ratio|share|margin)/i;
const BOOLEAN_NAME_RE =
  /(?:^is_|^has_|^can_|^active$|^enabled$|^disabled$|^flag$|_flag$|_bool$)/i;
const IDENTIFIER_NAME_RE =
  /(?:^|_)(?:id|uuid|key|ref|reference|transaction|code|no|number)(?:$|_)|(?:^|_)(?:order|customer|transaction|invoice|account|user|member|record|sku|item)(?:_)?(?:id|no|num|number|code|key)(?:$|_)/i;
const IDENTIFIER_UNIQUE_RATIO_THRESHOLD = 0.95;

export type StandardRoleLabel =
  | "Identifier"
  | "Time"
  | "Dimension"
  | "Location"
  | "Metric";

const ROLE_LABELS: Record<string, StandardRoleLabel> = {
  sales: "Metric",
  product: "Dimension",
  date: "Time",
  customer: "Dimension",
  region: "Location",
  profit: "Metric",
};

export function normalizeSemanticRoleLabel(
  role: string | null | undefined
): string | null {
  if (!role?.trim()) return null;
  const trimmed = role.trim();
  if (
    trimmed === "Identifier" ||
    trimmed === "Time" ||
    trimmed === "Dimension" ||
    trimmed === "Location" ||
    trimmed === "Metric"
  ) {
    return trimmed;
  }
  const lower = trimmed.toLowerCase();
  if (/identifier/.test(lower)) return "Identifier";
  if (/\btime\b|\bdate\b/.test(lower)) return "Time";
  if (/dimension|grouping|product|customer|member|breakdown|categor/.test(lower)) {
    return "Dimension";
  }
  if (/location|region|geo/.test(lower)) return "Location";
  if (/metric|revenue|sales|profit|margin|primary/.test(lower)) return "Metric";
  return trimmed;
}

export function mappingSemanticRoleLabel(role: string): StandardRoleLabel | string {
  return ROLE_LABELS[role.toLowerCase()] ?? role;
}

export function resolveColumnSemanticRole(
  column: string,
  mapping: ColumnMappingPick
): string | null {
  const col = column.trim();
  if (!col) return null;
  for (const [role, picked] of Object.entries(mapping)) {
    if (picked?.trim() === col) {
      return mappingSemanticRoleLabel(role);
    }
  }
  return null;
}

export function isClearMetricDateRateCurrencyColumn(
  column: string,
  type: SchemaColumnType | undefined,
  badge: { kind: TypeBadgeKind; label: string }
): boolean {
  if (type === "date") return true;
  if (type === "number") {
    if (badge.kind === "currency" || badge.kind === "rate") return true;
    if (CURRENCY_NAME_RE.test(column) || RATE_NAME_RE.test(column)) return true;
  }
  return false;
}

export function hasIdentifierNamePattern(column: string): boolean {
  return IDENTIFIER_NAME_RE.test(column.trim());
}

export function previewColumnUniqueRatio(
  preview: PreviewRow[],
  col: string
): number | null {
  if (preview.length === 0) return null;
  const nonNull = previewNonNullCount(preview, col);
  if (nonNull <= 0) return null;
  return previewColumnUniqueCount(preview, col) / nonNull;
}

export function isLikelyIdentifierColumn(args: {
  column: string;
  type: SchemaColumnType | undefined;
  preview: PreviewRow[];
  badge: { kind: TypeBadgeKind; label: string };
}): boolean {
  const { column, type, preview, badge } = args;
  if (isClearMetricDateRateCurrencyColumn(column, type, badge)) return false;

  if (hasIdentifierNamePattern(column)) return true;

  const ratio = previewColumnUniqueRatio(preview, column);
  return ratio != null && ratio >= IDENTIFIER_UNIQUE_RATIO_THRESHOLD;
}

export function resolveColumnDisplayRole(
  column: string,
  mapping: ColumnMappingPick,
  isIdentifier: boolean
): string {
  const mapped = resolveColumnSemanticRole(column, mapping);
  if (mapped) return normalizeSemanticRoleLabel(mapped) ?? mapped;
  if (isIdentifier) return "Identifier";
  return "No role detected";
}

export function classifyColumnTypeBadge(
  column: string,
  type: SchemaColumnType | undefined
): { kind: TypeBadgeKind; label: string } {
  const name = column.trim();
  if (BOOLEAN_NAME_RE.test(name)) return { kind: "boolean", label: "Boolean" };
  if (type === "date") return { kind: "date", label: "Date" };
  if (type === "category") return { kind: "category", label: "Category" };
  if (type === "number") {
    if (RATE_NAME_RE.test(name)) return { kind: "rate", label: "Rate" };
    if (CURRENCY_NAME_RE.test(name)) return { kind: "currency", label: "Currency" };
    return { kind: "number", label: "Number" };
  }
  if (type === "text") return { kind: "text", label: "Text" };
  return { kind: "text", label: "Unknown" };
}

export function readProfileDescribeStat(
  col: string,
  stat: string,
  profile: DataPreviewProfile | null
): number | null {
  if (!profile?.summary_stats || typeof profile.summary_stats !== "object") {
    return null;
  }
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

export function columnNullPercent(
  col: string,
  profile: DataPreviewProfile | null,
  totalRows: number
): { count: number | null; percent: number | null } {
  if (!profile?.null_counts || totalRows <= 0) {
    return { count: null, percent: null };
  }
  const nc = profile.null_counts[col];
  if (typeof nc !== "number" || !Number.isFinite(nc)) {
    return { count: null, percent: null };
  }
  return { count: nc, percent: (nc / totalRows) * 100 };
}

export function previewColumnUniqueCount(
  preview: PreviewRow[],
  col: string
): number {
  const set = new Set<string>();
  for (const row of preview) {
    const v = row[col];
    if (isMissingValue(v)) continue;
    set.add(String(v));
  }
  return set.size;
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
  const t2 = new Date(s).getTime();
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

function previewNonNullCount(preview: PreviewRow[], col: string): number {
  let n = 0;
  for (const row of preview) {
    if (!isMissingValue(row[col])) n += 1;
  }
  return n;
}

export function formatSchemaNumber(n: number): string {
  const abs = Math.abs(n);
  if (!Number.isFinite(n)) return "—";
  if (abs >= 1e12 || (abs > 0 && abs < 1e-6)) return n.toExponential(2);
  if (abs >= 1000) {
    return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }
  if (abs >= 1) {
    return n.toLocaleString(undefined, { maximumFractionDigits: 3 });
  }
  return n.toLocaleString(undefined, { maximumFractionDigits: 4 });
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

export function estimatePreviewDuplicateRows(
  preview: PreviewRow[],
  columns: string[]
): { count: number | null; note: string | null } {
  if (!preview.length || !columns.length) {
    return { count: null, note: "Not calculated" };
  }
  const sigs = preview.map((row) =>
    columns.map((c) => String(row[c] ?? "")).join("\u001f")
  );
  const tally = new Map<string, number>();
  sigs.forEach((s) => tally.set(s, (tally.get(s) || 0) + 1));
  let dupExtra = 0;
  tally.forEach((n) => {
    if (n > 1) dupExtra += n - 1;
  });
  return {
    count: dupExtra,
    note: `Based on ${preview.length.toLocaleString()} loaded preview rows.`,
  };
}

export function deriveDataQualityLabel(args: {
  totalRows: number;
  columns: string[];
  nullCounts: Record<string, number>;
}): DataQualityLabel {
  const { totalRows, columns, nullCounts } = args;
  if (totalRows <= 0 || columns.length === 0) return "Needs Review";

  const totalCells = totalRows * columns.length;
  let missingCells = 0;
  let heavyCols = 0;
  for (const col of columns) {
    const nc = nullCounts[col] ?? 0;
    missingCells += nc;
    if (nc / totalRows >= 0.15) heavyCols += 1;
  }
  const missPct = (missingCells / totalCells) * 100;
  if (heavyCols >= 2 || missPct > 20) return "Poor";
  if (heavyCols >= 1 || missPct > 5) return "Needs Review";
  return "Good";
}

export function buildDataPreviewQualitySummary(args: {
  rows: number;
  columns: string[];
  profile: DataPreviewProfile | null;
  preview: PreviewRow[];
}): DataPreviewQualitySummary {
  const { rows, columns, profile, preview } = args;
  const columnCount = columns.length;
  let missingPercent: number | null = null;
  if (profile?.null_counts && rows > 0 && columnCount > 0) {
    let missingCells = 0;
    for (const col of columns) {
      const nc = profile.null_counts[col];
      if (typeof nc === "number" && Number.isFinite(nc)) missingCells += nc;
    }
    missingPercent = (missingCells / (rows * columnCount)) * 100;
  }

  const dup = estimatePreviewDuplicateRows(preview, columns);

  return {
    rowCount: rows,
    columnCount,
    missingPercent,
    duplicateRowCount: dup.count,
    duplicateNote: dup.note,
    qualityLabel: deriveDataQualityLabel({
      totalRows: rows,
      columns,
      nullCounts: profile?.null_counts ?? {},
    }),
  };
}

export function buildSchemaColumnRows(args: {
  columns: string[];
  profile: DataPreviewProfile | null;
  preview: PreviewRow[];
  totalRows: number;
  mapping: ColumnMappingPick;
}): SchemaColumnRow[] {
  const { columns, profile, preview, totalRows, mapping } = args;
  return columns.map((name) => {
    const type = profile?.column_types?.[name];
    const badge = classifyColumnTypeBadge(name, type);
    const { count, percent } = columnNullPercent(name, profile, totalRows);
    const unique = resolveSchemaUniqueCount({ column: name, profile, preview });
    const mappedRole = resolveColumnSemanticRole(name, mapping);
    const identifier =
      !mappedRole &&
      isLikelyIdentifierColumn({ column: name, type, preview, badge });
    const semanticRole =
      mappedRole != null
        ? normalizeSemanticRoleLabel(mappedRole)
        : identifier
          ? "Identifier"
          : null;
    return {
      name,
      type,
      typeBadge: badge.kind,
      typeBadgeLabel: badge.label,
      nullCount: count,
      nullPercent: percent,
      uniqueCount: unique.count,
      uniqueSource: unique.source,
      semanticRole,
    };
  });
}

export function filterSchemaColumnRows(
  rows: SchemaColumnRow[],
  query: string
): SchemaColumnRow[] {
  const q = query.replace(/\s+/g, " ").trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((row) => {
    const hay = [
      row.name,
      row.type ?? "",
      row.typeBadgeLabel,
      row.semanticRole ?? "",
    ]
      .join(" ")
      .toLowerCase();
    return hay.includes(q);
  });
}

export function formatSchemaNullPercent(nullPercent: number | null): string {
  if (nullPercent == null || !Number.isFinite(nullPercent)) return "—";
  return `${nullPercent.toFixed(1)}%`;
}

export function resolveSchemaUniqueCount(args: {
  column: string;
  profile: DataPreviewProfile | null;
  preview: PreviewRow[];
}): { count: number | null; source: SchemaColumnRow["uniqueSource"] } {
  const full = args.profile?.unique_counts?.[args.column];
  if (typeof full === "number" && Number.isFinite(full)) {
    return { count: full, source: "full" };
  }
  if (args.preview.length > 0) {
    return {
      count: previewColumnUniqueCount(args.preview, args.column),
      source: "preview",
    };
  }
  return { count: null, source: "unavailable" };
}

export function schemaUniqueCountTitle(
  source: SchemaColumnRow["uniqueSource"]
): string | undefined {
  if (source === "full") return "Full dataset unique count";
  if (source === "preview") return "Based on loaded preview rows only";
  return undefined;
}

export function formatSchemaUniqueDisplay(
  uniqueCount: number | null,
  source: SchemaColumnRow["uniqueSource"] = "unavailable"
): string {
  if (uniqueCount == null || !Number.isFinite(uniqueCount)) return "—";
  const n = uniqueCount.toLocaleString();
  if (source === "preview") return `${n} (preview)`;
  return n;
}

export function formatSchemaUniqueCount(
  uniqueCount: number | null,
  source: SchemaColumnRow["uniqueSource"] = "unavailable"
): string {
  return formatSchemaUniqueDisplay(uniqueCount, source);
}

export function formatSchemaRoleLabel(semanticRole: string | null): string {
  const normalized = normalizeSemanticRoleLabel(semanticRole);
  return normalized ?? "—";
}

function columnDetailUniqueLabel(source: SchemaColumnRow["uniqueSource"]): string {
  if (source === "full") return DP_LABEL_FULL_DATASET_UNIQUE;
  return DP_LABEL_PREVIEW_SAMPLE_UNIQUENESS;
}

function buildColumnDetailPreviewStats(
  preview: PreviewRow[],
  column: string
): ColumnDetailStat[] {
  if (preview.length === 0) return [];
  const previewUnique = previewColumnUniqueCount(preview, column);
  return [
    { label: DP_LABEL_LOADED_PREVIEW_ROWS, value: preview.length.toLocaleString() },
    {
      label: DP_LABEL_PREVIEW_SAMPLE_UNIQUENESS,
      value: formatPreviewSampleUniqueness(previewUnique, preview.length),
    },
  ];
}

export function buildColumnDetailStats(args: {
  column: string;
  profile: DataPreviewProfile | null;
  preview: PreviewRow[];
  totalRows: number;
  mapping: ColumnMappingPick;
}): ColumnDetailResult {
  const { column, profile, preview, totalRows, mapping } = args;
  const type = profile?.column_types?.[column];
  const badge = classifyColumnTypeBadge(column, type);
  const likelyIdentifier = isLikelyIdentifierColumn({
    column,
    type,
    preview,
    badge,
  });
  const displayRole = resolveColumnDisplayRole(column, mapping, likelyIdentifier);
  const { percent: nullPct } = columnNullPercent(column, profile, totalRows);
  const nonNullPreview = previewNonNullCount(preview, column);
  const uniqueResolved = resolveSchemaUniqueCount({ column, profile, preview });
  const previewUnique = previewColumnUniqueCount(preview, column);
  const uniqueDisplay = formatSchemaUniqueDisplay(
    uniqueResolved.count,
    uniqueResolved.source
  );

  const footnote =
    preview.length > 0 && preview.length < totalRows
      ? `Based on ${preview.length.toLocaleString()} preview rows.`
      : null;

  if (!profile && preview.length === 0) {
    return {
      column,
      typeBadgeLabel: badge.label,
      displayRole,
      profileStats: [],
      previewStats: [],
      previewTopValues: null,
      identifierInsights: null,
      footnote: null,
      unavailable: true,
    };
  }

  const profileStats: ColumnDetailStat[] = [];
  const pushProfile = (label: string, value: string) =>
    profileStats.push({ label, value });

  pushProfile("Type", badge.label);
  if (nullPct != null) {
    pushProfile(DP_LABEL_NULL_FULL_DATASET, `${nullPct.toFixed(1)}%`);
  }

  let previewStats = buildColumnDetailPreviewStats(preview, column);
  let previewTopValues: ColumnDetailStat[] | null = null;

  if (type === "number") {
    const minN = readProfileDescribeStat(column, "min", profile);
    const maxN = readProfileDescribeStat(column, "max", profile);
    const meanN = readProfileDescribeStat(column, "mean", profile);
    const medN = readProfileDescribeStat(column, "50%", profile);
    if (minN != null) pushProfile("Min (full dataset)", formatSchemaNumber(minN));
    if (maxN != null) pushProfile("Max (full dataset)", formatSchemaNumber(maxN));
    if (meanN != null) {
      pushProfile("Average (full dataset)", formatSchemaNumber(meanN));
    }
    if (medN != null) pushProfile("Median (full dataset)", formatSchemaNumber(medN));
    if (uniqueResolved.count != null && uniqueResolved.count > 0) {
      pushProfile(columnDetailUniqueLabel(uniqueResolved.source), uniqueDisplay);
      if (uniqueResolved.source === "full") {
        previewStats = previewStats.filter(
          (s) => s.label !== DP_LABEL_PREVIEW_SAMPLE_UNIQUENESS
        );
      }
    }
    if (
      minN == null &&
      maxN == null &&
      meanN == null &&
      medN == null &&
      uniqueResolved.count === 0 &&
      nullPct == null
    ) {
      return {
        column,
        typeBadgeLabel: badge.label,
        displayRole,
        profileStats: [],
        previewStats: [],
        previewTopValues: null,
        identifierInsights: null,
        footnote,
        unavailable: true,
      };
    }
  } else if (type === "date") {
    let minD: number | null = null;
    let maxD: number | null = null;
    for (const row of preview) {
      const t = parsePreviewCellToTimestamp(row[column]);
      if (t == null) continue;
      if (minD == null || t < minD) minD = t;
      if (maxD == null || t > maxD) maxD = t;
    }
    if (preview.length > 0) {
      pushProfile(
        "Min date (preview)",
        minD != null ? formatProfileDateLabel(minD) : "—"
      );
      pushProfile(
        "Max date (preview)",
        maxD != null ? formatProfileDateLabel(maxD) : "—"
      );
    }
    if (minD == null && maxD == null && nullPct == null) {
      return {
        column,
        typeBadgeLabel: badge.label,
        displayRole,
        profileStats: [],
        previewStats: [],
        previewTopValues: null,
        identifierInsights: null,
        footnote,
        unavailable: true,
      };
    }
  } else if (likelyIdentifier) {
    return {
      column,
      typeBadgeLabel: badge.label,
      displayRole,
      profileStats,
      previewStats: [],
      previewTopValues: null,
      identifierInsights: {
        fullDatasetUniqueCount:
          uniqueResolved.source === "full" ? uniqueResolved.count : null,
        previewRowsLoaded: preview.length,
        previewUniqueValues: previewUnique,
        previewNonNullRows: nonNullPreview,
        message: IDENTIFIER_INSIGHT_MESSAGE,
      },
      footnote,
      unavailable: false,
    };
  } else {
    if (uniqueResolved.count != null) {
      pushProfile(columnDetailUniqueLabel(uniqueResolved.source), uniqueDisplay);
      if (uniqueResolved.source === "full") {
        previewStats = previewStats.filter(
          (s) => s.label !== DP_LABEL_PREVIEW_SAMPLE_UNIQUENESS
        );
      }
    }
    const top = computeCategoricalTopFromPreview(preview, column, 5);
    if (top.length > 0) {
      previewTopValues = top.map((row, i) => {
        const val =
          row.value.length > 36 ? `${row.value.slice(0, 34)}…` : row.value;
        return { label: `Top ${i + 1}`, value: `${val} (${row.count})` };
      });
    } else if (uniqueResolved.count === 0 && nullPct == null) {
      return {
        column,
        typeBadgeLabel: badge.label,
        displayRole,
        profileStats: [],
        previewStats: [],
        previewTopValues: null,
        identifierInsights: null,
        footnote,
        unavailable: true,
      };
    }
  }

  return {
    column,
    typeBadgeLabel: badge.label,
    displayRole,
    profileStats,
    previewStats,
    previewTopValues,
    identifierInsights: null,
    footnote,
    unavailable: false,
  };
}
