#!/usr/bin/env python3
"""Strict structural QA analysis against wave specs."""
from __future__ import annotations

import json
import sys
from collections import Counter, defaultdict
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
REPO = BACKEND.parent
sys.path.insert(0, str(BACKEND))
sys.path.insert(0, str(BACKEND / "scripts"))

from qa_wave_specs import build_all_wave_specs  # noqa: E402
from wave1_qa_execution import (  # noqa: E402
    ChainSpec,
    QuestionSpec,
    _chart_family,
    _intent,
    score_chart,
    score_intent,
)

JSON_PATH = REPO / "docs" / "ai-insights-production-qa-results.json"


def _all_specs():
    merged = {}
    for w in [1, 2, 3]:
        merged.update(build_all_wave_specs()[w])
    return merged


def _spec_for_result(all_specs, r) -> QuestionSpec:
    qid = r["qid"]
    domain = r["domain"]
    cfg = all_specs.get(domain) or {}
    for s in cfg.get("questions", []):
        if s.id == qid:
            return s
    for chain in cfg.get("chains", []):
        if qid == chain.root.id:
            return chain.root
        if r["question"] in chain.followups:
            exp = r.get("expected") or {}
            return QuestionSpec(
                qid,
                r["question"],
                r.get("pattern", "follow_up"),
                tuple(exp.get("intent", [])),
                tuple(exp.get("chart", [])),
            )
    exp = r.get("expected") or {}
    return QuestionSpec(
        qid,
        r["question"],
        r.get("pattern", ""),
        tuple(exp.get("intent", [])),
        tuple(exp.get("chart", [])),
    )


def strict_pass(r, spec: QuestionSpec) -> tuple[bool, list[str]]:
    rout = r.get("routing") or {}
    analysis = {
        "metricColumn": rout.get("metricColumn"),
        "categoryColumn": rout.get("categoryColumn"),
        "routingPlan": {"intent": rout.get("intent")},
        "intentBucket": rout.get("intent"),
    }
    viz = {
        "chartType": rout.get("chartType"),
        "labels": ["x"],
        "chartData": [1],
    }
    is_score, inotes = score_intent(analysis, spec)
    cs, cnotes = score_chart(viz, spec, analysis)
    ok = is_score >= 10 and cs >= 10
    notes = inotes + cnotes
    return ok, notes


def bucket_for(qid: str, spec: QuestionSpec, notes: list[str]) -> str:
    n = " ".join(notes).lower()
    if spec.negative:
        return "F"
    if spec.is_follow_up if hasattr(spec, "is_follow_up") else "-F" in qid or qid.endswith("-F1"):
        if any(x in qid for x in ("-F1", "-F2", "-F3")) or "columns were used" in spec.question.lower():
            return "E"
    if qid.endswith("-F1") or qid.endswith("-F2") or qid.endswith("-F3"):
        return "E"
    if "columns were used" in spec.question.lower() or "calculations behind" in spec.question.lower():
        return "E"
    if "risk does" in spec.question.lower() or "action should management" in spec.question.lower():
        return "C"
    if spec.pattern in ("executive", "summary") or "executive" in str(spec.expect_intent):
        if "intent" in n and "executive" in str(spec.expect_intent):
            return "B"
        if "metric hint" in n:
            return "B"
    if "breakdown" in spec.question.lower() or "distribution" in spec.expect_intent:
        return "D"
    if "intent" in n and ("ranking" in str(spec.expect_intent) or "compare" in str(spec.expect_intent)):
        return "A"
    if "metric hint" in n:
        return "B"
    return "F"


def main() -> None:
    data = json.loads(JSON_PATH.read_text(encoding="utf-8"))
    results = data["results"]
    all_specs = _all_specs()
    fails = []
    for r in results:
        spec = _spec_for_result(all_specs, r)
        ok, notes = strict_pass(r, spec)
        if not ok:
            rout = r.get("routing") or {}
            fails.append(
                {
                    "qid": r["qid"],
                    "question": r["question"],
                    "actual": (
                        rout.get("intent"),
                        rout.get("chartType"),
                        rout.get("metricColumn"),
                        rout.get("categoryColumn"),
                    ),
                    "expected": (
                        spec.expect_intent,
                        spec.expect_chart,
                        spec.metric_hint,
                        spec.dimension_hint,
                    ),
                    "notes": notes,
                    "bucket": bucket_for(r["qid"], spec, notes),
                    "severity": r.get("severity"),
                }
            )
    strict_ok = len(results) - len(fails)
    rubric_ok = sum(1 for r in results if r.get("avg", 0) >= 7.0)
    high = sum(1 for r in results if r.get("severity") == "high")
    bc = Counter(f["bucket"] for f in fails)
    print(f"strict_pass={strict_ok}/{len(results)}")
    print(f"rubric_pass={rubric_ok}/{len(results)}")
    print(f"high_severity={high}")
    print(f"fail_buckets={dict(bc)}")
    for f in fails:
        print(
            f"{f['bucket']}|{f['qid']}|{f['actual'][0]}|{f['notes'][0] if f['notes'] else ''}"
        )


if __name__ == "__main__":
    main()
