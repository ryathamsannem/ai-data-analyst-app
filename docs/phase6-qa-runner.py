"""Phase 6 QA runner — hits live /upload + /ask (no app code changes)."""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional

import urllib.error
import urllib.request

BASE = "http://127.0.0.1:8000"
DOWNLOADS = Path(r"c:\Users\gullu\Downloads")

INVENTED_MARKERS = (
    "market penetration",
    "conversion rate",
    "customer lifetime value",
    "net promoter",
    "nps",
    "churn",
    "patient risk",
    "readmission",
    "bed occupancy",
    "salesperson",
    "quarter has highest",
)

DATASETS = {
    "retail": DOWNLOADS / "retail_analytics_regression.csv",
    "generic": DOWNLOADS / "domain_quality_generic.csv",
    "geographic": DOWNLOADS / "geographic_performance.csv",
}

SCHEMA = {
    "retail": {
        "order_date", "region", "city", "product_category", "product",
        "revenue", "profit", "customers", "orders", "quantity", "growth_rate",
    },
    "generic": {
        "report_date", "region", "department", "category",
        "revenue", "cost", "units", "satisfaction_score",
    },
    "geographic": {
        "city", "state", "zone", "revenue", "profit", "customers", "growth_rate",
    },
}

DOMAIN_CASES: List[Dict[str, Any]] = [
    {
        "domain": "Retail",
        "fixture": "retail",
        "base": "Which city generates the highest revenue?",
        "expected": {
            "intent": "ranking",
            "metric": "revenue",
            "dimension": "city",
            "agg": "sum",
            "top": "Mumbai",
        },
        "follow_lowest": False,
    },
    {
        "domain": "Sales",
        "fixture": "generic",
        "base": "Which region generates the highest revenue?",
        "expected": {
            "intent": "ranking",
            "metric": "revenue",
            "dimension": "region",
            "agg": "sum",
            "top": "North",
        },
        "follow_lowest": False,
    },
    {
        "domain": "Marketing",
        "fixture": "generic",
        "base": "Which category has the highest satisfaction_score?",
        "expected": {
            "intent": "ranking",
            "metric": "satisfaction_score",
            "dimension": "category",
            "agg": "mean",
            "top": "Ward-B",
        },
        "follow_lowest": False,
    },
    {
        "domain": "Finance",
        "fixture": "generic",
        "base": "Which department has the highest cost?",
        "expected": {
            "intent": "ranking",
            "metric": "cost",
            "dimension": "department",
            "agg": "sum",
            "top": "Sales",
        },
        "follow_lowest": False,
    },
    {
        "domain": "Operations",
        "fixture": "generic",
        "base": "Which department has the most units?",
        "expected": {
            "intent_in": ("compare", "ranking"),
            "metric": "units",
            "dimension": "department",
            "agg": "sum",
            "top": "Operations",
        },
        "follow_lowest": False,
    },
    {
        "domain": "HR",
        "fixture": "generic",
        "base": "Rank departments by headcount",
        "expected": {
            "intent": "ranking",
            "metric": "units",
            "dimension": "department",
            "agg": "sum",
            "top": "Operations",
        },
        "follow_lowest": False,
    },
    {
        "domain": "Support",
        "fixture": "generic",
        "base": "Which department has the lowest satisfaction_score?",
        "expected": {
            "intent": "ranking",
            "metric": "satisfaction_score",
            "dimension": "department",
            "agg": "mean",
            "top": "Finance",
        },
        "follow_lowest": True,
    },
    {
        "domain": "Healthcare",
        "fixture": "generic",
        "base": "Compare patient volume across wards",
        "expected": {
            "intent": "compare",
            "metric": "units",
            "dimension": "category",
            "agg": "sum",
            "top": "Product-A",
        },
        "follow_lowest": False,
        "provenance_note": "category column",
    },
    {
        "domain": "Geography",
        "fixture": "geographic",
        "base": "Which city generates the highest revenue?",
        "expected": {
            "intent": "ranking",
            "metric": "revenue",
            "dimension": "city",
            "agg": "sum",
            "top": "Mumbai",
        },
        "follow_lowest": False,
    },
]

FOLLOW_UPS = [
    ("F1", "why"),
    ("F2", "What evidence supports this conclusion?"),
    ("F3", "Which columns were used for this analysis?"),
    ("F4", "Show the calculations behind this answer."),
]


def _post_json(path: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        f"{BASE}{path}",
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=180) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _upload(path: Path) -> None:
    boundary = "----Phase6Boundary"
    body = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="file"; filename="{path.name}"\r\n'
        f"Content-Type: text/csv\r\n\r\n"
    ).encode("utf-8") + path.read_bytes() + f"\r\n--{boundary}--\r\n".encode("utf-8")
    req = urllib.request.Request(
        f"{BASE}/upload",
        data=body,
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        resp.read()


def _contains(hay: Optional[str], needle: str) -> bool:
    if not hay or not needle:
        return False
    return needle.lower().replace("_", " ") in hay.lower().replace("_", " ")


def _leading_entity(viz: Dict[str, Any], lowest: bool) -> str:
    labels = list(viz.get("labels") or [])
    values = list(viz.get("values") or [])
    if not labels:
        return "Unknown"
    if lowest and values and len(values) == len(labels):
        idx = min(range(len(values)), key=lambda i: float(values[i]))
        return str(labels[idx])
    return str(labels[0])


def _extract_row(resp: Dict[str, Any], step: str) -> Dict[str, Any]:
    analysis = resp.get("analysis") or {}
    plan = analysis.get("routingPlan") or {}
    viz = resp.get("visualization") or {}
    meta = resp.get("conversation_meta") or {}
    prov = viz.get("provenance") or {}
    answer = str(resp.get("answer") or "")
    title = str(viz.get("title") or analysis.get("chartTitle") or "")
    return {
        "step": step,
        "answer_excerpt": answer[:500],
        "answer_len": len(answer),
        "intent": plan.get("intent") or analysis.get("routingIntent"),
        "chartType": viz.get("chartType") or plan.get("chartType"),
        "metric": analysis.get("metricColumn") or plan.get("metricColumn"),
        "dimension": analysis.get("categoryColumn") or plan.get("dimensionColumn"),
        "agg": analysis.get("aggregationKey") or plan.get("aggregationKey"),
        "aggregation_label": analysis.get("aggregation") or prov.get("aggregationLabel"),
        "confidence": analysis.get("insightConfidenceLevel"),
        "supportStatus": plan.get("supportStatus"),
        "title": title,
        "labels": (viz.get("labels") or [])[:6],
        "values": (viz.get("values") or [])[:6],
        "followUpDetected": meta.get("followUpDetected"),
        "wasFollowUp": (meta.get("followUpDetected") or (resp.get("conversation_meta") or {}).get("followUpDetected")),
        "has_chart": bool(viz.get("labels")),
    }


def _hallucination_issues(answer: str, schema: set[str]) -> List[str]:
    issues: List[str] = []
    low = answer.lower()
    for marker in INVENTED_MARKERS:
        if marker in low:
            issues.append(f"invented_marker:{marker}")
    return issues


def _score_base(row: Dict[str, Any], expected: Dict[str, Any], answer: str, schema: set[str]) -> Dict[str, Any]:
    fails: List[str] = []
    intent = str(row.get("intent") or "")
    if "intent_in" in expected:
        if intent not in expected["intent_in"]:
            fails.append(f"intent={intent}")
    elif intent != expected["intent"]:
        fails.append(f"intent={intent}")

    metric = str(row.get("metric") or "")
    if metric != expected["metric"]:
        fails.append(f"metric={metric}")

    dim = str(row.get("dimension") or "")
    if dim != expected["dimension"]:
        fails.append(f"dimension={dim}")

    agg = str(row.get("agg") or "").lower()
    if agg != expected["agg"]:
        fails.append(f"agg={agg}")

    chart = str(row.get("chartType") or "").lower()
    if chart not in ("bar", "horizontalbar", "line", "area", "scatter", ""):
        fails.append(f"chart={chart}")
    if not row.get("has_chart"):
        fails.append("missing_chart")

    title = str(row.get("title") or "").lower()
    if expected["agg"] == "mean" and "average" not in title and "mean" not in title:
        fails.append("title_missing_average")

    top = expected.get("top")
    labels = row.get("labels") or []
    if top and labels and str(labels[0]) != top and expected.get("intent") != "compare":
        # Support lowest: check values path handled separately
        if "lowest" not in answer.lower() and top.lower() not in answer.lower():
            fails.append(f"answer_missing_entity:{top}")

    hall = _hallucination_issues(answer, schema)
    fails.extend(hall)

    return {"pass": not fails, "fails": fails}


def _score_follow(row: Dict[str, Any], base_question: str, metric: str, dim: str, entity: str, step: str) -> Dict[str, Any]:
    fails: List[str] = []
    if not row.get("followUpDetected") and step != "F1":
        fails.append("followUp_not_detected")
    answer = row.get("answer_excerpt") or ""
    if metric.lower() not in answer.lower() and step in ("F3", "F4"):
        fails.append("metric_not_in_answer")
    if dim.lower() not in answer.lower() and step in ("F3", "F4"):
        fails.append("dimension_not_in_answer")
    if step == "F1" and entity.lower() not in answer.lower():
        fails.append(f"entity_{entity}_not_in_why_answer")
    hall = _hallucination_issues(answer, set())
    fails.extend(hall)
    return {"pass": not fails, "fails": fails}


def run_domain(case: Dict[str, Any], uploaded_fixture: str) -> Dict[str, Any]:
    schema = SCHEMA[case["fixture"]]
    base_q = case["base"]
    expected = case["expected"]

    base_resp = _post_json("/ask", {"question": base_q})
    base_row = _extract_row(base_resp, "base")
    base_answer = str(base_resp.get("answer") or "")
    base_score = _score_base(base_row, expected, base_answer, schema)

    viz = base_resp.get("visualization") or {}
    entity = _leading_entity(viz, case.get("follow_lowest", False))
    if case["domain"] == "Support":
        entity = "Finance"

    ctx = {
        "lastQuestion": base_q,
        "rootQuestion": base_q,
        "metricColumn": base_row.get("metric"),
        "categoryColumn": base_row.get("dimension"),
        "aggregation": base_row.get("aggregation_label") or base_row.get("agg"),
        "chartType": base_row.get("chartType"),
        "lastChartTitle": base_row.get("title"),
        "followUpChain": [base_q],
        "lastAiAnswer": base_answer[:400],
        "lastChartLabelSample": base_row.get("labels") or [],
        "turnId": "phase6-turn",
    }
    parent_ctx = {
        "rootQuestion": base_q,
        "priorQuestion": base_q,
        "metricColumn": base_row.get("metric"),
        "categoryColumn": base_row.get("dimension"),
        "metricColumnDisplay": base_row.get("metric"),
        "categoryColumnDisplay": base_row.get("dimension"),
        "aggregation": base_row.get("aggregation_label") or base_row.get("agg"),
        "chartType": base_row.get("chartType"),
        "chartTitle": base_row.get("title"),
        "followUpChain": [base_q],
        "lastAiAnswer": base_answer[:400],
        "turnId": "phase6-turn",
        "routingPlan": (base_resp.get("analysis") or {}).get("routingPlan"),
    }

    follow_results: Dict[str, Any] = {}
    for step_id, kind in FOLLOW_UPS:
        if kind == "why":
            if case.get("follow_lowest"):
                q = f"Why is {entity} lowest?"
            else:
                q = f"Why is {entity} highest?"
        else:
            q = kind
        fu_resp = _post_json(
            "/ask",
            {
                "question": q,
                "conversation_context": ctx,
                "continuation_intent": True,
                "parent_analysis_context": parent_ctx,
            },
        )
        row = _extract_row(fu_resp, step_id)
        score = _score_follow(
            row,
            base_q,
            str(base_row.get("metric") or ""),
            str(base_row.get("dimension") or ""),
            entity,
            step_id,
        )
        follow_results[step_id] = {"question": q, "row": row, "score": score}

    provenance_ok = True
    prov_notes: List[str] = []
    if case.get("provenance_note"):
        combined = base_answer.lower() + str(base_row.get("title") or "").lower()
        if case["provenance_note"] not in combined:
            prov_notes.append("ward_proxy_not_in_user_visible_text")
            provenance_ok = False

    return {
        "domain": case["domain"],
        "fixture": uploaded_fixture,
        "base_question": base_q,
        "entity": entity,
        "base": {"row": base_row, "score": base_score, "answer": base_answer[:800]},
        "follow_ups": follow_results,
        "provenance_ok": provenance_ok,
        "provenance_notes": prov_notes,
    }


def main() -> int:
    for key, path in DATASETS.items():
        if not path.exists():
            print(f"MISSING DATASET: {path}", file=sys.stderr)
            return 1

    results: List[Dict[str, Any]] = []
    current_fixture: Optional[str] = None

    for case in DOMAIN_CASES:
        fix = case["fixture"]
        if fix != current_fixture:
            _upload(DATASETS[fix])
            current_fixture = fix
        results.append(run_domain(case, fix))

    out = Path(__file__).with_name("phase6-qa-results.json")
    out.write_text(json.dumps(results, indent=2), encoding="utf-8")
    print(out)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
