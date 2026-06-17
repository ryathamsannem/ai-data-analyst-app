#!/usr/bin/env python3
"""Dashboard chart discovery profiler (analysis only)."""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path
from typing import Any, Dict, List

BACKEND = Path(__file__).resolve().parents[1]
REPO = BACKEND.parent
FIXTURE_DIR = REPO / "test-fixtures" / "large-dataset"

os.chdir(BACKEND)
sys.path.insert(0, str(BACKEND))

import main as main_mod  # noqa: E402
from main import (  # noqa: E402
    _adaptive_time_series_grouped,
    build_auto_dashboard,
    build_auto_dashboard_charts,
    build_profile,
    clean_dataframe,
    load_dataframe_from_upload,
    numeric_series,
)
from services.auto_dashboard_opportunities import (  # noqa: E402
    DashboardDeps,
    build_dashboard_charts_from_opportunities,
    classify_columns,
    discover_chart_opportunities,
    select_diverse_charts,
    extract_kpi_chart_context,
    target_chart_count,
    _bind_deps_to_dataframe,
    _dimension_cardinality,
    _ordered_breakdown_dimensions,
)


def load_fixture(name: str):
    path = FIXTURE_DIR / name
    raw, _ = load_dataframe_from_upload(path.read_bytes(), path.name)
    df = clean_dataframe(raw)
    profile = build_profile(df)
    main_mod.df = df
    main_mod.dataset_profile = profile
    main_mod.column_mapping = {k: None for k in main_mod.column_mapping}
    proposed, _ = main_mod.compute_semantic_column_mapping(df, profile)
    for key, val in proposed.items():
        main_mod.column_mapping[key] = val
    dash = build_auto_dashboard(profile=profile)
    kind = str(dash.get("kind") or "sales")
    kpi_cards = dash.get("cards") or []
    return df, profile, kind, kpi_cards


def make_deps() -> DashboardDeps:
    return DashboardDeps(
        numeric_series=main_mod.numeric_series,
        time_series_grouped=main_mod._adaptive_time_series_grouped,
        series_payload=main_mod._dash_series_payload,
        pretty_label=main_mod._pretty_label_text,
        chart_title_by_dimension=main_mod._dash_chart_title_by_dimension,
        freq_human_label=main_mod._freq_human_label,
        id_like_column=main_mod._id_like_column_name,
        priority_metrics=main_mod._dash_priority_metric_columns,
        record_metric_key=main_mod._DASH_RECORD_METRIC_KEY,
    )


def bench(fn, repeats: int = 3) -> Dict[str, float]:
    times: List[float] = []
    result = None
    for _ in range(repeats):
        t0 = time.perf_counter()
        result = fn()
        times.append((time.perf_counter() - t0) * 1000.0)
    return {
        "ms_avg": round(sum(times) / len(times), 1),
        "ms_min": round(min(times), 1),
        "ms_max": round(max(times), 1),
        "result": result,
    }


def profile_fixture(name: str, repeats: int) -> Dict[str, Any]:
    df, profile, kind, kpi_cards = load_fixture(name)
    deps = make_deps()
    bound = _bind_deps_to_dataframe(df, deps)

    stages: Dict[str, Any] = {}

    stages["build_auto_dashboard_charts"] = bench(
        lambda: build_auto_dashboard_charts(kind, kpi_cards=kpi_cards), repeats
    )
    chart_count = len(stages["build_auto_dashboard_charts"].pop("result") or [])

    stages["classify_columns_once"] = bench(
        lambda: classify_columns(df, profile, id_like_fn=bound.id_like_column), repeats
    )
    stages["classify_columns_once"].pop("result", None)

    inv = classify_columns(df, profile, id_like_fn=bound.id_like_column)
    stages["ordered_breakdown_dimensions"] = bench(
        lambda: _ordered_breakdown_dimensions(df, inv, bound.id_like_column), repeats
    )
    stages["ordered_breakdown_dimensions"].pop("result", None)

    stages["discover_chart_opportunities"] = bench(
        lambda: discover_chart_opportunities(df, profile, kind, bound, inv=inv), repeats
    )
    discovered = stages["discover_chart_opportunities"].pop("result") or []

    stages["select_diverse_charts"] = bench(
        lambda: select_diverse_charts(
            list(discovered),
            kind=kind,
            max_charts=target_chart_count(inv, len(df)),
            deps=bound,
            kpi_context=extract_kpi_chart_context(kpi_cards),
        ),
        repeats,
    )
    stages["select_diverse_charts"].pop("result", None)

    # Time series calls (retail: 1 date col, 3 trend metrics)
    date_cols = inv.dates[:2]
    numerics = inv.numerics[:3]
    ts_times: List[float] = []
    for date_c in date_cols:
        for num_c in numerics:
            t0 = time.perf_counter()
            _adaptive_time_series_grouped(df, str(date_c), str(num_c), agg_key="sum")
            ts_times.append((time.perf_counter() - t0) * 1000.0)
    stages["adaptive_time_series_grouped_per_call_ms_avg"] = {
        "ms_avg": round(sum(ts_times) / max(len(ts_times), 1), 1),
        "calls": len(ts_times),
        "ms_total_est": round(sum(ts_times), 1),
    }

    dim_nunique_calls = 0
    t0 = time.perf_counter()
    for col in df.columns:
        _dimension_cardinality(df, str(col))
        dim_nunique_calls += 1
    stages["dimension_cardinality_all_columns"] = {
        "ms_avg": round((time.perf_counter() - t0) * 1000.0, 1),
        "calls": dim_nunique_calls,
    }

    t0 = time.perf_counter()
    for col in df.columns:
        if profile.get("column_types", {}).get(col) == "number":
            numeric_series(col)
    stages["numeric_series_all_numeric_cols"] = {
        "ms_avg": round((time.perf_counter() - t0) * 1000.0, 1),
        "calls": sum(
            1 for c in df.columns if profile.get("column_types", {}).get(c) == "number"
        ),
    }

    return {
        "fixture": name,
        "rows": int(len(df)),
        "columns": int(len(df.columns)),
        "kind": kind,
        "chart_count": chart_count,
        "discovered_candidates": len(discovered),
        "stages": stages,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repeats", type=int, default=3)
    parser.add_argument(
        "--fixtures",
        nargs="*",
        default=["retail_10k.csv", "retail_50k.csv", "retail_100k.csv"],
    )
    args = parser.parse_args()

    out = [profile_fixture(f, args.repeats) for f in args.fixtures]
    print(json.dumps(out, indent=2))


if __name__ == "__main__":
    main()
