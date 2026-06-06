"use client";

import { memo, type MouseEvent } from "react";
import {
  dpBadgeType,
  dpThMeta,
  dpThName,
  dpThProfileBtn,
  dpThShell,
  dpThSortBtn,
  dpThSortIcon,
} from "@/lib/data-preview-ui";
import type { DataPreviewSortState } from "@/lib/data-preview-sort";
import {
  DataPreviewSortIcon,
  type DataPreviewSortIconState,
} from "./data-preview-sort-icons";

export type DataPreviewHeaderSecondary = {
  label: string;
  title: string;
  className: string;
} | null;

type DataPreviewColumnHeaderProps = {
  column: string;
  typeLabel: string;
  secondary: DataPreviewHeaderSecondary;
  sort: DataPreviewSortState;
  profileOpen: boolean;
  onSort: (column: string) => void;
  onOpenProfile: (column: string, event: MouseEvent<HTMLButtonElement>) => void;
};

function sortIconState(
  sort: DataPreviewSortState,
  column: string
): DataPreviewSortIconState {
  if (sort?.column !== column) return "none";
  return sort.direction;
}

export const DataPreviewColumnHeader = memo(function DataPreviewColumnHeader({
  column,
  typeLabel,
  secondary,
  sort,
  profileOpen,
  onSort,
  onOpenProfile,
}: DataPreviewColumnHeaderProps) {
  const active = sort?.column === column;
  const direction = active ? sort.direction : undefined;

  return (
    <div className={dpThShell}>
      <button
        type="button"
        className={`${dpThSortBtn}${active ? " data-preview-th-sort--active" : ""}`}
        onClick={() => onSort(column)}
        aria-label={`Sort ${column}${active ? (direction === "asc" ? ", ascending" : ", descending") : ""}`}
      >
        <span className={dpThName}>{column}</span>
        <span className={dpThSortIcon} aria-hidden>
          <DataPreviewSortIcon state={sortIconState(sort, column)} />
        </span>
      </button>
      <button
        type="button"
        className={dpThProfileBtn}
        onClick={(e) => onOpenProfile(column, e)}
        aria-expanded={profileOpen}
        aria-label={`Column profile for ${column}`}
        title="Column profile"
      >
        <div className={dpThMeta}>
          <span className={dpBadgeType}>{typeLabel}</span>
          {secondary ? (
            <span title={secondary.title} className={secondary.className}>
              {secondary.label}
            </span>
          ) : null}
        </div>
      </button>
    </div>
  );
});
