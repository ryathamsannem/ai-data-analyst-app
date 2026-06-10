"use client";

import { useMemo, useState, type KeyboardEvent } from "react";
import {
  buildEnrichedSchemaColumnRows,
  filterEnrichedSchemaRows,
  type ColumnHealthLevel,
  type EnrichedSchemaColumnRow,
} from "@/lib/data-preview-phase-b";
import {
  formatSchemaNullPercent,
  formatSchemaUniqueCount,
  schemaUniqueCountTitle,
  type ColumnMappingPick,
  type DataPreviewProfile,
  type PreviewRow,
  type TypeBadgeKind,
} from "@/lib/data-preview-schema";
import {
  dpSchemaAction,
  dpSchemaHealthExcellent,
  dpSchemaHealthReview,
  dpSchemaHealthWarning,
  dpSchemaPanel,
  dpSchemaRoleBadge,
  dpSchemaRoleBadgeCurrency,
  dpSchemaRoleBadgeIdentifier,
  dpSchemaRoleBadgeMetric,
  dpSchemaRoleChipsWrap,
  dpSchemaSearchInput,
  dpSchemaTable,
  dpSchemaTableWrap,
  dpSchemaTd,
  dpSchemaTdName,
  dpSchemaTh,
  dpSchemaThSortBtn,
  dpSchemaThSortIcon,
  dpSchemaThead,
  dpSchemaTr,
  dpTypeBadgeBoolean,
  dpTypeBadgeCategory,
  dpTypeBadgeCurrency,
  dpTypeBadgeDate,
  dpTypeBadgeNumber,
  dpTypeBadgeRate,
  dpTypeBadgeText,
} from "@/lib/data-preview-ui";

type Props = {
  columns: string[];
  profile: DataPreviewProfile | null;
  preview: PreviewRow[];
  totalRows: number;
  mapping: ColumnMappingPick;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  selectedColumn: string | null;
  onSelectColumn: (column: string) => void;
};

type SchemaSortKey = "name" | "nullPercent" | "unique" | "health";
type SchemaSortDir = "asc" | "desc";

const HEALTH_RANK: Record<ColumnHealthLevel, number> = {
  excellent: 0,
  warning: 1,
  review: 2,
};

function typeBadgeClass(kind: TypeBadgeKind): string {
  switch (kind) {
    case "number":
      return dpTypeBadgeNumber;
    case "date":
      return dpTypeBadgeDate;
    case "category":
      return dpTypeBadgeCategory;
    case "boolean":
      return dpTypeBadgeBoolean;
    case "currency":
      return dpTypeBadgeCurrency;
    case "rate":
      return dpTypeBadgeRate;
    default:
      return dpTypeBadgeText;
  }
}

function healthBadgeClass(health: ColumnHealthLevel): string {
  if (health === "review") return dpSchemaHealthReview;
  if (health === "warning") return dpSchemaHealthWarning;
  return dpSchemaHealthExcellent;
}

function roleChipClass(chip: string): string {
  if (chip === "Identifier") return dpSchemaRoleBadgeIdentifier;
  if (chip === "Currency") return dpSchemaRoleBadgeCurrency;
  if (chip === "Metric" || chip === "Percentage") return dpSchemaRoleBadgeMetric;
  return dpSchemaRoleBadge;
}

function sortSchemaRows(
  rows: EnrichedSchemaColumnRow[],
  key: SchemaSortKey,
  dir: SchemaSortDir
): EnrichedSchemaColumnRow[] {
  const factor = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    let cmp = 0;
    if (key === "name") {
      cmp = a.name.localeCompare(b.name);
    } else if (key === "nullPercent") {
      cmp = (a.nullPercent ?? -1) - (b.nullPercent ?? -1);
    } else if (key === "unique") {
      cmp = (a.uniqueCount ?? -1) - (b.uniqueCount ?? -1);
    } else if (key === "health") {
      cmp = HEALTH_RANK[a.health] - HEALTH_RANK[b.health];
    }
    return cmp * factor;
  });
}

function SchemaChevron() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
    >
      <path d="m9 18 6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SortIcon({ active, dir }: { active: boolean; dir: SchemaSortDir }) {
  if (!active) {
    return (
      <span className={dpSchemaThSortIcon} aria-hidden>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="m7 15 5 5 5-5M7 9l5-5 5 5" opacity="0.45" />
        </svg>
      </span>
    );
  }
  return (
    <span className={dpSchemaThSortIcon} aria-hidden>
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
        {dir === "asc" ? (
          <path d="m6 15 6-6 6 6" />
        ) : (
          <path d="m6 9 6 6 6-6" />
        )}
      </svg>
    </span>
  );
}

export function DataPreviewSchemaPanel({
  columns,
  profile,
  preview,
  totalRows,
  mapping,
  searchQuery,
  onSearchChange,
  selectedColumn,
  onSelectColumn,
}: Props) {
  const [sortKey, setSortKey] = useState<SchemaSortKey | null>(null);
  const [sortDir, setSortDir] = useState<SchemaSortDir>("asc");

  const rows = useMemo(
    () =>
      buildEnrichedSchemaColumnRows({
        columns,
        profile,
        preview,
        totalRows,
        mapping,
      }),
    [columns, profile, preview, totalRows, mapping]
  );

  const filtered = useMemo(
    () => filterEnrichedSchemaRows(rows, searchQuery),
    [rows, searchQuery]
  );

  const displayed = useMemo(() => {
    if (!sortKey) return filtered;
    return sortSchemaRows(filtered, sortKey, sortDir);
  }, [filtered, sortKey, sortDir]);

  const toggleSort = (key: SchemaSortKey) => {
    if (sortKey === key) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDir("asc");
  };

  const handleRowKeyDown = (
    event: KeyboardEvent<HTMLTableRowElement>,
    column: string
  ) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelectColumn(column);
    }
  };

  const sortableTh = (
    label: string,
    key: SchemaSortKey
  ) => {
    const active = sortKey === key;
    return (
      <button
        type="button"
        className={dpSchemaThSortBtn}
        onClick={() => toggleSort(key)}
        aria-label={`Sort by ${label}`}
        aria-pressed={active}
      >
        <span>{label}</span>
        <SortIcon active={active} dir={sortDir} />
      </button>
    );
  };

  return (
    <section className={dpSchemaPanel} aria-label="Dataset schema">
      <div className="border-b border-[color:var(--border-default)] px-4 py-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-foreground">Dataset schema</h3>
            <p className="mt-0.5 text-xs text-[color:var(--text-muted)]">
              Column types, health, nulls, and semantic roles from upload profile.
            </p>
          </div>
          <div className="relative min-w-0 w-full sm:max-w-xs">
            <span
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--text-subtle)]"
              aria-hidden
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.2-3.2" />
              </svg>
            </span>
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search columns, types, roles…"
              className={dpSchemaSearchInput}
              aria-label="Search schema columns"
              autoComplete="off"
              spellCheck={false}
            />
          </div>
        </div>
      </div>
      <div className={dpSchemaTableWrap}>
        {displayed.length === 0 ? (
          <p className="px-4 py-6 text-sm text-[color:var(--text-muted)]">
            No columns match your schema search.
          </p>
        ) : (
          <table className={dpSchemaTable} role="grid" aria-label="Schema columns">
            <thead className={dpSchemaThead}>
              <tr>
                <th scope="col" className={dpSchemaTh} aria-sort={sortKey === "name" ? (sortDir === "asc" ? "ascending" : "descending") : "none"}>
                  {sortableTh("Column", "name")}
                </th>
                <th scope="col" className={dpSchemaTh}>
                  Type
                </th>
                <th scope="col" className={dpSchemaTh} aria-sort={sortKey === "health" ? (sortDir === "asc" ? "ascending" : "descending") : "none"}>
                  {sortableTh("Health", "health")}
                </th>
                <th scope="col" className={dpSchemaTh} aria-sort={sortKey === "nullPercent" ? (sortDir === "asc" ? "ascending" : "descending") : "none"}>
                  {sortableTh("Null %", "nullPercent")}
                </th>
                <th scope="col" className={dpSchemaTh} aria-sort={sortKey === "unique" ? (sortDir === "asc" ? "ascending" : "descending") : "none"}>
                  {sortableTh("Unique", "unique")}
                </th>
                <th scope="col" className={dpSchemaTh}>
                  Role
                </th>
                <th scope="col" className={`${dpSchemaTh} text-right`}>
                  Action
                </th>
              </tr>
            </thead>
            <tbody>
              {displayed.map((row) => {
                const selected = selectedColumn === row.name;
                return (
                  <tr
                    key={row.name}
                    className={dpSchemaTr}
                    data-selected={selected ? "true" : "false"}
                    tabIndex={0}
                    role="row"
                    aria-selected={selected}
                    onClick={() => onSelectColumn(row.name)}
                    onKeyDown={(event) => handleRowKeyDown(event, row.name)}
                  >
                    <td className={dpSchemaTdName} title={row.name}>
                      {row.name}
                    </td>
                    <td className={dpSchemaTd}>
                      <span className={typeBadgeClass(row.typeBadge)}>
                        {row.typeBadgeLabel}
                      </span>
                    </td>
                    <td className={dpSchemaTd}>
                      <span className={healthBadgeClass(row.health)} title={row.health}>
                        {row.health}
                      </span>
                    </td>
                    <td className={dpSchemaTd}>
                      {formatSchemaNullPercent(row.nullPercent)}
                    </td>
                    <td
                      className={dpSchemaTd}
                      title={schemaUniqueCountTitle(row.uniqueSource)}
                    >
                      {formatSchemaUniqueCount(row.uniqueCount, row.uniqueSource)}
                    </td>
                    <td className={dpSchemaTd}>
                      {row.roleChips.length > 0 ? (
                        <span className={dpSchemaRoleChipsWrap}>
                          {row.roleChips.map((chip) => (
                            <span
                              key={`${row.name}-${chip}`}
                              className={roleChipClass(chip)}
                              title={chip}
                            >
                              {chip}
                            </span>
                          ))}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className={`${dpSchemaTd} text-right`}>
                      <span className={dpSchemaAction}>
                        View
                        <SchemaChevron />
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      <p className="border-t border-[color:var(--border-default)] px-4 py-2 text-[10px] text-[color:var(--text-subtle)]">
        Unique counts use the full dataset when available; otherwise values are
        labeled (preview). Null counts use the full dataset profile.
      </p>
    </section>
  );
}
