#!/usr/bin/env python3
"""Large-dataset validation bench (analysis only). Usage: python scripts/large_dataset_validation.py 50000"""
from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path

import numpy as np
import pandas as pd

BACKEND = Path(__file__).resolve().parents[1]
REPO = BACKEND.parent
OUT_DIR = REPO / "test-fixtures" / "large-dataset"

os.chdir(BACKEND)
sys.path.insert(0, str(BACKEND))


def ensure_csv(rows: int) -> Path:
    path = OUT_DIR / f"retail_{rows // 1000}k.csv"
    if path.exists() and sum(1 for _ in open(path, encoding="utf-8")) - 1 == rows:
        return path
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    rng = np.random.default_rng(42)
    regions = ["North", "South", "East", "West", "Central"]
    cities = {
        "North": ["Delhi", "Chandigarh", "Jaipur"],
        "South": ["Bengaluru", "Chennai", "Hyderabad"],
        "East": ["Kolkata", "Patna", "Bhubaneswar"],
        "West": ["Mumbai", "Pune", "Ahmedabad"],
        "Central": ["Bhopal", "Nagpur", "Indore"],
    }
    cats = ["Electronics", "Furniture", "Clothing", "Home"]
    products = {
        "Electronics": ["Laptop", "Phone", "Tablet", "Monitor"],
        "Furniture": ["Chair", "Desk", "Sofa"],
        "Clothing": ["Jacket", "Tshirt", "Jeans"],
        "Home": ["Blender", "Vacuum", "Lamp"],
    }
    dates = pd.date_range("2024-01-01", periods=365, freq="D")
    chunk = []
    for i in range(rows):
        region = regions[i % len(regions)]
        city = cities[region][i % len(cities[region])]
        cat = cats[i % len(cats)]
        prod = products[cat][i % len(products[cat])]
        rev = float(rng.uniform(40_000, 260_000))
        chunk.append(
            {
                "order_date": dates[i % len(dates)].strftime("%Y-%m-%d"),
                "region": region,
                "city": city,
                "product_category": cat,
                "product": prod,
                "revenue": round(rev, 2),
                "profit": round(rev * rng.uniform(0.08, 0.35), 2),
                "customers": int(rng.integers(80, 560)),
                "orders": int(rng.integers(50, 420)),
                "quantity": int(rng.integers(60, 540)),
                "growth_rate": round(float(rng.uniform(-0.05, 0.38)), 4),
            }
        )
    pd.DataFrame(chunk).to_csv(path, index=False)
    return path


def bench(name: str, fn, repeats: int = 3) -> dict:
    times = []
    result = None
    for _ in range(repeats):
        t0 = time.perf_counter()
        result = fn()
        times.append((time.perf_counter() - t0) * 1000)
    return {
        "name": name,
        "ms_avg": round(sum(times) / len(times), 1),
        "ms_min": round(min(times), 1),
        "ms_max": round(max(times), 1),
        "result": result,
    }


def main() -> None:
    rows = int(sys.argv[1]) if len(sys.argv) > 1 else 50_000
    csv_path = ensure_csv(rows)
    file_bytes = csv_path.read_bytes()
    file_mb = len(file_bytes) / (1024 * 1024)

    import main as main_mod
    from fastapi.testclient import TestClient
    from main import (
        apply_semantic_column_mapping,
        build_auto_dashboard,
        build_profile,
        clean_dataframe,
        load_dataframe_from_upload,
    )

    try:
        import psutil

        proc = psutil.Process()
        rss_before = proc.memory_info().rss / (1024 * 1024)
    except Exception:
        proc = None
        rss_before = None

    client = TestClient(main_mod.app)
    headers = {"X-Plan-Tier": "paid", "X-Session-Id": f"bench-{rows}"}

    uploads = []
    for i in range(3):
        t0 = time.perf_counter()
        r = client.post(
            "/upload",
            files={"file": (csv_path.name, file_bytes, "text/csv")},
            headers=headers,
        )
        uploads.append(
            {
                "run": i + 1,
                "ms": round((time.perf_counter() - t0) * 1000, 1),
                "status": r.status_code,
                "resp_kb": round(len(r.content) / 1024, 1),
            }
        )

    raw_df, _ = load_dataframe_from_upload(file_bytes, csv_path.name)
    cleaned = clean_dataframe(raw_df.copy())

    stages = [
        bench("parse_csv", lambda: load_dataframe_from_upload(file_bytes, csv_path.name)[0] is not None),
        bench("clean", lambda: clean_dataframe(raw_df.copy()) is not None),
        bench("profiling", lambda: build_profile(cleaned)),
    ]
    prof = build_profile(cleaned)
    stages.append(
        bench(
            "semantic_mapping",
            lambda: apply_semantic_column_mapping(cleaned.copy(), prof),
        )
    )

    main_mod.df = cleaned
    main_mod.dataset_profile = prof
    main_mod.uploaded_file_bytes = file_bytes
    main_mod.uploaded_file_name = csv_path.name
    main_mod.selected_sheet_name = "CSV"
    main_mod.column_mapping = {k: None for k in main_mod.column_mapping}
    apply_semantic_column_mapping(main_mod.df, prof)

    dash_bench = bench("dashboard_generation", main_mod.build_auto_dashboard)
    dash_result = dash_bench.get("result") if isinstance(dash_bench.get("result"), dict) else {}
    dash = {k: v for k, v in dash_bench.items() if k != "result"}
    dash["chart_count"] = len(dash_result.get("charts", []))

    for s in stages:
        s.pop("result", None)
    ask_times = []
    ask_meta = []
    question = "Which city generates the highest revenue?"
    for i in range(2):
        t0 = time.perf_counter()
        r = client.post(
            "/ask",
            json={"question": question, "dashboard_filters": []},
            headers=headers,
        )
        ask_times.append(round((time.perf_counter() - t0) * 1000, 1))
        body = r.json()
        viz = body.get("visualization") or {}
        analysis = body.get("analysis") or {}
        ask_meta.append(
            {
                "status": r.status_code,
                "chartType": viz.get("chartType"),
                "metricColumn": analysis.get("metricColumn"),
                "categoryColumn": analysis.get("categoryColumn"),
                "intent": (analysis.get("routingPlan") or {}).get("intent")
                or analysis.get("intentBucket"),
                "point_count": len(viz.get("chartData") or viz.get("labels") or []),
            }
        )

    viz_only = bench(
        "ai_viz_routing",
        lambda: main_mod.compute_visualization_for_question(question),
        repeats=2,
    )

    rss_after = proc.memory_info().rss / (1024 * 1024) if proc else None

    out = {
        "rows": rows,
        "file_mb": round(file_mb, 3),
        "csv_path": str(csv_path),
        "upload_http": uploads,
        "stages": stages,
        "dashboard": dash,
        "ask_http_ms": ask_times,
        "ask_meta": ask_meta,
        "viz_only_ms_avg": viz_only["ms_avg"],
        "memory_rss_mb_before": round(rss_before, 1) if rss_before else None,
        "memory_rss_mb_after": round(rss_after, 1) if rss_after else None,
        "auto_chart_count": dash.get("chart_count"),
    }

    print(json.dumps(out, indent=2))


if __name__ == "__main__":
    main()
