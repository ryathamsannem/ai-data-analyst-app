import {
  buildSchemaColumnRows,
  classifyColumnTypeBadge,
  isLikelyIdentifierColumn,
  previewColumnUniqueRatio,
  resolveColumnSemanticRole,
  normalizeSemanticRoleLabel,
  type ColumnMappingPick,
  type DataPreviewProfile,
  type PreviewRow,
  type SchemaColumnRow,
  type SchemaColumnType,
  type TypeBadgeKind,
} from "@/lib/data-preview-schema";

export type ColumnHealthLevel = "excellent" | "warning" | "review";

export type ColumnRecommendations = {
  goodFor: string[];
  avoid: string[];
};

export type DatasetSummaryKpi = {
  value: string;
  label: string;
};

export type DatasetInsightsSummaryResult = {
  kpis: DatasetSummaryKpi[];
  notes: string[];
};

const BUSINESS_FIELD_RE =
  /(?:^|_)(?:revenue|sales|amount|cost|profit|margin|quantity|units|customers?|campaign|region|country|city|order|product|channel|segment|sku|units)(?:$|_)|(?:revenue|sales|amount|cost|profit|margin|quantity|campaign|region|country|city)/i;

const LOCATION_NAME_RE =
  /(?:^|_)(?:region|country|city|state|province|geo|location|territory|market)(?:$|_)/i;

const DIMENSION_NAME_RE =
  /(?:campaign|product|channel|segment|category|department|team|brand|vendor|supplier)/i;

const ROLE_CHIP_ORDER = [
  "Identifier",
  "Time",
  "Currency",
  "Metric",
  "Percentage",
  "Boolean",
  "Category",
  "Dimension",
  "Location",
] as const;

export function isLikelyBusinessField(column: string): boolean {
  return BUSINESS_FIELD_RE.test(column.trim());
}

export function isHighCardinalityCategorical(args: {
  column: string;
  type: SchemaColumnType | undefined;
  isIdentifier: boolean;
  preview: PreviewRow[];
  uniqueCount: number | null;
  totalRows: number;
}): boolean {
  const { column, type, isIdentifier, preview, uniqueCount, totalRows } = args;
  if (isIdentifier) return false;
  if (type !== "category" && type !== "text") return false;

  const ratio = previewColumnUniqueRatio(preview, column);
  if (ratio != null && ratio >= 0.92 && preview.length >= 8) return true;

  if (
    uniqueCount != null &&
    totalRows > 0 &&
    uniqueCount > 10 &&
    uniqueCount / totalRows > 0.5
  ) {
    return true;
  }
  return false;
}

export function classifyColumnHealth(args: {
  nullPercent: number | null;
  highCardinality: boolean;
}): ColumnHealthLevel {
  const { nullPercent, highCardinality } = args;
  const nullPct = nullPercent ?? 0;
  if (nullPct > 20) return "review";
  if (nullPct > 0 || highCardinality) return "warning";
  return "excellent";
}

export function inferColumnRoleChips(args: {
  column: string;
  type: SchemaColumnType | undefined;
  badge: { kind: TypeBadgeKind; label: string };
  mapping: ColumnMappingPick;
  isIdentifier: boolean;
}): string[] {
  const { column, type, badge, mapping, isIdentifier } = args;
  const chips = new Set<string>();

  if (isIdentifier) chips.add("Identifier");

  const mapped = resolveColumnSemanticRole(column, mapping);
  if (mapped) {
    const norm = normalizeSemanticRoleLabel(mapped);
    if (norm) chips.add(norm);
  }

  if (type === "date") chips.add("Time");
  if (badge.kind === "boolean") chips.add("Boolean");
  if (badge.kind === "rate") chips.add("Percentage");
  if (badge.kind === "currency") {
    chips.add("Currency");
    chips.add("Metric");
  } else if (badge.kind === "number") {
    chips.add("Metric");
  }

  if (LOCATION_NAME_RE.test(column)) chips.add("Location");

  if ((type === "category" || type === "text") && !isIdentifier) {
    if (!chips.has("Location")) chips.add("Category");
    if (
      chips.has("Dimension") ||
      DIMENSION_NAME_RE.test(column) ||
      mapped === "Dimension"
    ) {
      chips.add("Dimension");
    }
  }

  if (chips.size === 0 && type === "number") chips.add("Metric");

  return ROLE_CHIP_ORDER.filter((c) => chips.has(c));
}

export function buildColumnRecommendations(args: {
  roleChips: string[];
  typeBadge: TypeBadgeKind;
}): ColumnRecommendations {
  const { roleChips, typeBadge } = args;
  const chips = new Set(roleChips);
  const goodFor: string[] = [];
  const avoid: string[] = [];

  if (chips.has("Identifier")) {
    goodFor.push("Filtering", "Record lookup", "Drill-through");
    avoid.push("Aggregation charts");
  } else if (chips.has("Time")) {
    goodFor.push("Trends", "Time analysis");
  } else if (
    chips.has("Category") ||
    chips.has("Dimension") ||
    typeBadge === "category"
  ) {
    goodFor.push("Grouping", "Ranking", "Comparisons");
  } else if (chips.has("Currency")) {
    goodFor.push("Revenue analysis", "Executive dashboards");
    if (!goodFor.includes("KPIs")) goodFor.push("KPIs", "Aggregations", "Charts");
  } else if (chips.has("Metric") || chips.has("Percentage") || typeBadge === "number" || typeBadge === "rate") {
    goodFor.push("KPIs", "Aggregations", "Charts");
  } else if (chips.has("Boolean")) {
    goodFor.push("Filtering", "Segmentation");
  } else if (chips.has("Location")) {
    goodFor.push("Geographic breakdowns", "Regional comparisons");
  }

  if (goodFor.length === 0) {
    goodFor.push("Exploration", "Filtering");
  }

  return { goodFor: [...new Set(goodFor)], avoid };
}

export function buildDatasetInsightsSummary(args: {
  columns: string[];
  profile: DataPreviewProfile | null;
  preview: PreviewRow[];
  totalRows: number;
  mapping: ColumnMappingPick;
}): DatasetInsightsSummaryResult {
  const { columns, profile, preview, totalRows, mapping } = args;

  const schemaRows = buildEnrichedSchemaColumnRows({
    columns,
    profile,
    preview,
    totalRows,
    mapping,
  });

  let dimensions = 0;
  let metrics = 0;
  let dates = 0;
  let identifierCol: string | null = null;
  let timeCol: string | null = null;
  let geoCol: string | null = null;

  for (const row of schemaRows) {
    const chips = row.roleChips;
    if (chips.includes("Dimension") || chips.includes("Category")) dimensions += 1;
    if (chips.includes("Metric") || chips.includes("Currency") || chips.includes("Percentage")) {
      metrics += 1;
    }
    if (chips.includes("Time")) dates += 1;
    if (chips.includes("Identifier") && !identifierCol) identifierCol = row.name;
    if (chips.includes("Time") && !timeCol) timeCol = row.name;
    if (chips.includes("Location") && !geoCol) geoCol = row.name;
  }

  const kpis: DatasetSummaryKpi[] = [
    { value: totalRows.toLocaleString(), label: "Rows" },
    { value: String(columns.length), label: "Columns" },
    { value: String(metrics), label: "Metrics" },
    { value: String(dimensions), label: "Dimensions" },
    {
      value: String(dates),
      label: dates === 1 ? "Date column" : "Date columns",
    },
  ];

  const notes: string[] = [];
  const detected: string[] = [];
  if (identifierCol) detected.push(`Identifier: ${identifierCol}`);
  if (timeCol) detected.push(`Date: ${timeCol}`);
  if (geoCol) detected.push(`Location: ${geoCol}`);
  if (detected.length > 0) {
    notes.push(detected.join(" · "));
  }

  if (dates === 0) {
    notes.push("No date column detected. Trend analysis may be limited.");
  }
  if (metrics === 0) {
    notes.push("No numeric metrics detected.");
  }
  if (!identifierCol) {
    notes.push("No obvious identifier detected.");
  }

  return { kpis, notes: notes.slice(0, 3) };
}

export type EnrichedSchemaColumnRow = SchemaColumnRow & {
  roleChips: string[];
  health: ColumnHealthLevel;
};

export function buildEnrichedSchemaColumnRows(args: {
  columns: string[];
  profile: DataPreviewProfile | null;
  preview: PreviewRow[];
  totalRows: number;
  mapping: ColumnMappingPick;
}): EnrichedSchemaColumnRow[] {
  const base = buildSchemaColumnRows(args);
  return base.map((row) => {
    const enriched = enrichSchemaRowPhaseB({
      row,
      preview: args.preview,
      totalRows: args.totalRows,
      mapping: args.mapping,
    });
    return {
      ...row,
      roleChips: enriched.roleChips,
      health: enriched.health,
      semanticRole: enriched.primaryRole,
    };
  });
}

export function filterEnrichedSchemaRows(
  rows: EnrichedSchemaColumnRow[],
  query: string
): EnrichedSchemaColumnRow[] {
  const q = query.replace(/\s+/g, " ").trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((row) => {
    const hay = [
      row.name,
      row.type ?? "",
      row.typeBadgeLabel,
      row.semanticRole ?? "",
      row.health,
      ...row.roleChips,
    ]
      .join(" ")
      .toLowerCase();
    return hay.includes(q);
  });
}

export function enrichSchemaRowPhaseB(args: {
  row: SchemaColumnRow;
  preview: PreviewRow[];
  totalRows: number;
  mapping: ColumnMappingPick;
}): {
  roleChips: string[];
  health: ColumnHealthLevel;
  primaryRole: string | null;
} {
  const { row, preview, totalRows, mapping } = args;
  const badge = classifyColumnTypeBadge(row.name, row.type);
  const isIdentifier = isLikelyIdentifierColumn({
    column: row.name,
    type: row.type,
    preview,
    badge,
  });
  const roleChips = inferColumnRoleChips({
    column: row.name,
    type: row.type,
    badge,
    mapping,
    isIdentifier,
  });
  const highCardinality = isHighCardinalityCategorical({
    column: row.name,
    type: row.type,
    isIdentifier,
    preview,
    uniqueCount: row.uniqueCount,
    totalRows,
  });
  const health = classifyColumnHealth({
    nullPercent: row.nullPercent,
    highCardinality,
  });
  const primaryRole = roleChips[0] ?? null;
  return { roleChips, health, primaryRole };
}
