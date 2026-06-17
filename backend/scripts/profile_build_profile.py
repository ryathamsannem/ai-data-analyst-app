#!/usr/bin/env python3
"""
Instrument build_profile() sub-steps (analysis only — no production changes).

Usage:
  cd backend && python scripts/profile_build_profile.py
  cd backend && python scripts/profile_build_profile.py --repeats 5
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional

import pandas as pd

BACKEND = Path(__file__).resolve().parents[1]
REPO = BACKEND.parent
FIXTURE_DIR = REPO / "test-fixtures" / "large-dataset"

os.chdir(BACKEND)
sys.path.insert(0, str(BACKEND))

from main import (  # noqa: E402
    _DATE_COL_NAME_HINT,
    _datetime_parse_ratio,
    build_profile,
    clean_dataframe,
    detect_column_types,
    load_dataframe_from_upload,
)


@dataclass
class StepTimes:
    ms: Dict[str, float] = field(default_factory=dict)

    def add(self, name: str, elapsed_s: float) -> None:
        self.ms[name] = self.ms.get(name, 0.0) + elapsed_s * 1000.0


def _timed_datetime_parse_ratio(series: pd.Series, steps: StepTimes) -> float:
    """Mirror main._datetime_parse_ratio with per-pass timing."""
    t0 = time.perf_counter()
    non_null = series.dropna()
    steps.add("datetime.dropna", time.perf_counter() - t0)
    if non_null.empty:
        return 0.0

    t1 = time.perf_counter()
    try:
        dt = pd.to_datetime(non_null, errors="coerce", format="mixed")
    except TypeError:
        dt = pd.to_datetime(non_null, errors="coerce")
    r1 = float(dt.notna().mean())
    if r1 >= 0.9:
        steps.add("datetime.pass1_direct", time.perf_counter() - t1)
        return r1
    steps.add("datetime.pass1_direct", time.perf_counter() - t1)

    t2 = time.perf_counter()
    try:
        dt2 = pd.to_datetime(
            non_null.astype(str).str.strip(), errors="coerce", format="mixed"
        )
    except TypeError:
        dt2 = pd.to_datetime(non_null.astype(str).str.strip(), errors="coerce")
    r2 = float(dt2.notna().mean())
    steps.add("datetime.pass2_str_strip", time.perf_counter() - t2)

    return max(r1, r2)


def instrumented_detect_column_types(input_df: pd.DataFrame, steps: StepTimes) -> Dict[str, str]:
    """Mirror detect_column_types() with accumulated sub-step timers."""
    result: Dict[str, str] = {}
    n_rows = len(input_df)

    for col in input_df.columns:
        t_col = time.perf_counter()
        s = input_df[col]

        t0 = time.perf_counter()
        non_null = s.dropna()
        steps.add("detect.dropna", time.perf_counter() - t0)

        if non_null.empty:
            result[col] = "text"
            steps.add("detect.col_loop_overhead", time.perf_counter() - t_col)
            continue

        t1 = time.perf_counter()
        numeric = pd.to_numeric(
            non_null.astype(str)
            .str.replace(",", "", regex=False)
            .str.replace("₹", "", regex=False)
            .str.replace("$", "", regex=False),
            errors="coerce",
        )
        numeric_ratio = float(numeric.notna().mean()) if len(non_null) else 0.0
        steps.add("detect.numeric_inference", time.perf_counter() - t1)

        if numeric_ratio >= 0.9:
            result[col] = "number"
            steps.add("detect.col_loop_overhead", time.perf_counter() - t_col)
            continue

        t2 = time.perf_counter()
        date_ratio = _timed_datetime_parse_ratio(s, steps)
        steps.add("detect.datetime_total_per_col", time.perf_counter() - t2)

        t3 = time.perf_counter()
        date_named = bool(_DATE_COL_NAME_HINT.search(str(col)))
        steps.add("detect.date_name_hint", time.perf_counter() - t3)

        if date_ratio >= 0.9:
            result[col] = "date"
            steps.add("detect.col_loop_overhead", time.perf_counter() - t_col)
            continue
        if date_named and date_ratio >= 0.72:
            result[col] = "date"
            steps.add("detect.col_loop_overhead", time.perf_counter() - t_col)
            continue

        t4 = time.perf_counter()
        nunique = int(non_null.nunique())
        steps.add("detect.category_nunique", time.perf_counter() - t4)

        if n_rows > 0 and (nunique <= 50 or nunique / max(n_rows, 1) <= 0.2):
            result[col] = "category"
        else:
            result[col] = "text"
        steps.add("detect.col_loop_overhead", time.perf_counter() - t_col)

    return result


def instrumented_build_profile(input_df: pd.DataFrame) -> tuple[Dict[str, Any], StepTimes]:
    """Mirror build_profile() with sub-step timing (same logic, no sampling)."""
    steps = StepTimes()

    t0 = time.perf_counter()
    column_types = instrumented_detect_column_types(input_df, steps)
    steps.add("detect_column_types_total", time.perf_counter() - t0)

    t1 = time.perf_counter()
    null_counts = {c: int(input_df[c].isna().sum()) for c in input_df.columns}
    steps.add("null_counts", time.perf_counter() - t1)

    numeric_cols = [c for c, t in column_types.items() if t == "number"]
    summary_stats: Dict[str, Any] = {}
    if numeric_cols:
        t2 = time.perf_counter()
        desc = input_df[numeric_cols].apply(pd.to_numeric, errors="coerce").describe()
        steps.add("describe_compute", time.perf_counter() - t2)

        t3 = time.perf_counter()
        summary_stats = desc.round(6).to_dict()
        steps.add("describe_round_to_dict", time.perf_counter() - t3)

    t4 = time.perf_counter()
    unique_counts = {
        c: int(input_df[c].nunique(dropna=True)) for c in input_df.columns
    }
    steps.add("unique_counts_nunique", time.perf_counter() - t4)

    profile = {
        "column_types": column_types,
        "null_counts": null_counts,
        "summary_stats": summary_stats,
        "unique_counts": unique_counts,
    }
    return profile, steps


def load_fixture(name: str) -> pd.DataFrame:
    path = FIXTURE_DIR / name
    if not path.exists():
        raise FileNotFoundError(path)
    raw, _ = load_dataframe_from_upload(path.read_bytes(), path.name)
    return clean_dataframe(raw)


def bench_fixture(df: pd.DataFrame, repeats: int) -> Dict[str, Any]:
    import gc

    rows = int(len(df))
    cols = int(len(df.columns))

    actual_totals: List[float] = []
    for _ in range(repeats):
        gc.collect()
        t0 = time.perf_counter()
        _ = build_profile(df)
        actual_totals.append((time.perf_counter() - t0) * 1000.0)

    step_runs: List[Dict[str, float]] = []
    instrumented_totals: List[float] = []
    for _ in range(repeats):
        gc.collect()
        t1 = time.perf_counter()
        _, steps = instrumented_build_profile(df)
        instrumented_totals.append((time.perf_counter() - t1) * 1000.0)
        step_runs.append(dict(steps.ms))

    detect_ref: List[float] = []
    for _ in range(repeats):
        gc.collect()
        t0 = time.perf_counter()
        _ = detect_column_types(df)
        detect_ref.append((time.perf_counter() - t0) * 1000.0)

    # Aggregate step means across repeats
    step_names = sorted({k for run in step_runs for k in run})
    step_avg = {
        name: round(sum(run.get(name, 0.0) for run in step_runs) / len(step_runs), 2)
        for name in step_names
    }

    def stats(vals: List[float]) -> Dict[str, float]:
        return {
            "avg": round(sum(vals) / len(vals), 2),
            "min": round(min(vals), 2),
            "max": round(max(vals), 2),
        }

    return {
        "rows": rows,
        "columns": cols,
        "repeats": repeats,
        "build_profile_actual_ms": stats(actual_totals),
        "build_profile_instrumented_ms": stats(instrumented_totals),
        "detect_column_types_ref_ms": stats(detect_ref),
        "steps_ms_avg": step_avg,
    }


def print_markdown_table(results: List[Dict[str, Any]]) -> None:
    step_keys = [
        "detect_column_types_total",
        "detect.numeric_inference",
        "detect.datetime_total_per_col",
        "datetime.pass1_direct",
        "datetime.pass2_str_strip",
        "datetime.dropna",
        "detect.category_nunique",
        "detect.dropna",
        "detect.date_name_hint",
        "detect.col_loop_overhead",
        "null_counts",
        "unique_counts_nunique",
        "describe_compute",
        "describe_round_to_dict",
    ]

    print("\n## build_profile() sub-step breakdown (ms avg)\n")
    header = "| Step | " + " | ".join(r["label"] for r in results) + " |"
    sep = "|------|" + "|".join("------:" for _ in results) + "|"
    print(header)
    print(sep)

    for key in step_keys:
        label = key.replace("detect.", "detect: ").replace("datetime.", "datetime: ")
        cells = []
        for r in results:
            val = r["steps_ms_avg"].get(key, 0.0)
            cells.append(f"{val:,.1f}")
        print(f"| {label} | " + " | ".join(cells) + " |")

    print(sep.replace("-", "="))
    for r in results:
        r["_total_actual"] = r["build_profile_actual_ms"]["avg"]
    total_cells = [f"{r['build_profile_actual_ms']['avg']:,.1f}" for r in results]
    print(f"| **build_profile() actual (main)** | " + " | ".join(total_cells) + " |")
    inst_cells = [f"{r['build_profile_instrumented_ms']['avg']:,.1f}" for r in results]
    print(f"| build_profile() instrumented total | " + " | ".join(inst_cells) + " |")


def main() -> None:
    parser = argparse.ArgumentParser(description="Profile build_profile sub-steps")
    parser.add_argument("--repeats", type=int, default=3, help="Repeats per fixture")
    args = parser.parse_args()

    fixtures = [
        ("retail_10k.csv", "10k"),
        ("retail_50k.csv", "50k"),
        ("retail_100k.csv", "100k"),
    ]

    out_results: List[Dict[str, Any]] = []
    for fname, label in fixtures:
        df = load_fixture(fname)
        result = bench_fixture(df, args.repeats)
        result["fixture"] = fname
        result["label"] = label
        out_results.append(result)

    print_markdown_table(out_results)

    payload = {
        "repeats": args.repeats,
        "fixtures": out_results,
    }
    print("\n```json")
    print(json.dumps(payload, indent=2))
    print("```")


if __name__ == "__main__":
    main()
