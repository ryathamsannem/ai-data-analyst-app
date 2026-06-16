#!/usr/bin/env python3
"""One-shot cold-start upload profiler (analysis only; not imported by app)."""
from __future__ import annotations

import importlib
import json
import os
import sys
import time
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
REPO = BACKEND.parent
CSV = REPO / "test-fixtures" / "large-dataset" / "retail_10k.csv"

os.chdir(BACKEND)
sys.path.insert(0, str(BACKEND))

file_bytes = CSV.read_bytes()
stages: list[tuple[str, float]] = []


def mark(name: str, t0: float) -> None:
    stages.append((name, round((time.perf_counter() - t0) * 1000, 1)))


for mod in ("numpy", "pandas", "fastapi", "anthropic", "uvicorn", "starlette"):
    t0 = time.perf_counter()
    importlib.import_module(mod)
    mark(f"import:{mod}", t0)

t0 = time.perf_counter()
import main as main_mod  # noqa: E402

mark("import:main_module", t0)

from fastapi.testclient import TestClient  # noqa: E402

t0 = time.perf_counter()
client = TestClient(main_mod.app)
mark("testclient_construct", t0)

headers = {"X-Plan-Tier": "paid", "X-Session-Id": "cold-probe-1"}

t0 = time.perf_counter()
r1 = client.post(
    "/upload",
    files={"file": ("retail_10k.csv", file_bytes, "text/csv")},
    headers=headers,
)
mark("http_upload_cold_request_total", t0)

t0 = time.perf_counter()
r2 = client.post(
    "/upload",
    files={"file": ("retail_10k.csv", file_bytes, "text/csv")},
    headers=headers,
)
mark("http_upload_warm_request_total", t0)

from main import (  # noqa: E402
    apply_semantic_column_mapping,
    build_auto_dashboard,
    build_filter_breadcrumb,
    build_kpi_cards,
    build_profile,
    build_suggested_questions,
    build_upload_response,
    build_dimension_catalog_for_ui,
    calculate_kpis,
    clean_dataframe,
    load_dataframe_from_upload,
)

t0 = time.perf_counter()
_ = file_bytes
mark("1_upload_entry_file_read", t0)

t0 = time.perf_counter()
df, _sheet = load_dataframe_from_upload(file_bytes, "retail_10k.csv")
mark("3_pandas_read_csv", t0)

t0 = time.perf_counter()
df = clean_dataframe(df)
mark("3b_clean_dataframe", t0)

t0 = time.perf_counter()
prof = build_profile(df)
mark("4_profiling", t0)

t0 = time.perf_counter()
apply_semantic_column_mapping(df, prof)
mark("5_semantic_mapping", t0)

main_mod.df = df
main_mod.dataset_profile = prof
main_mod.uploaded_file_bytes = file_bytes
main_mod.uploaded_file_name = "retail_10k.csv"
main_mod.selected_sheet_name = "CSV"
main_mod.column_mapping = {k: None for k in main_mod.column_mapping}

t0 = time.perf_counter()
payload = build_upload_response(["CSV"])
mark("6_upload_response_total", t0)

t0 = time.perf_counter()
build_kpi_cards()
mark("6a_kpi_cards", t0)

t0 = time.perf_counter()
build_auto_dashboard()
mark("6b_dashboard_generation", t0)

t0 = time.perf_counter()
build_suggested_questions()
mark("6c_suggested_questions", t0)

t0 = time.perf_counter()
build_dimension_catalog_for_ui(df, prof)
mark("6d_dimension_catalog", t0)

t0 = time.perf_counter()
build_filter_breadcrumb(df, prof, [], None)
mark("6e_filter_breadcrumb", t0)

t0 = time.perf_counter()
calculate_kpis()
mark("6f_calculate_kpis", t0)

lazy: list[tuple[str, float]] = []
for label, mod_name in [
    ("lazy:suggested_questions_engine", "intent_engine.suggested_questions_engine"),
    ("lazy:geographic_scope", "intent_engine.geographic_scope"),
    ("lazy:pyarrow", "pyarrow"),
]:
    t0 = time.perf_counter()
    try:
        importlib.import_module(mod_name)
    except Exception:
        pass
    lazy.append((label, round((time.perf_counter() - t0) * 1000, 1)))

t0 = time.perf_counter()
_ = main_mod.client
mark("7_llm_client_reference", t0)

t0 = time.perf_counter()
json.dumps(payload)
mark("json_serialize_payload", t0)

out = {
    "status_cold": r1.status_code,
    "status_warm": r2.status_code,
    "rows": payload.get("rows"),
    "stages": stages,
    "lazy_imports_after_upload_path": lazy,
}
print(json.dumps(out, indent=2))
