#!/usr/bin/env python3
"""
Production QA runner — Waves 1, 2, 3, or all domains.

Wave 1: Retail, Marketing, Sales, Geography, Banking
Wave 2: Finance & FP&A, Operations, Customer Support
Wave 3: HR, Healthcare

Usage:
  cd backend
  python scripts/wave_qa_runner.py --wave 2 --routing-only
  python scripts/wave_qa_runner.py --wave all --routing-only
  python scripts/wave_qa_runner.py --wave 3          # full /ask (requires API key)
"""
from __future__ import annotations

import argparse
import json
import sys
import time
import uuid
from pathlib import Path
from typing import Any, Dict, List

import pandas as pd

BACKEND = Path(__file__).resolve().parents[1]
REPO = BACKEND.parent
sys.path.insert(0, str(BACKEND))

import main as m  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from qa_wave_specs import build_all_wave_specs  # noqa: E402
from wave1_qa_execution import (  # noqa: E402
    FIXTURES,
    EvalResult,
    _intent,
    _routing_body,
    _run_chain_routing,
    evaluate_question,
    run_domain,
)
from main import ConversationContextPayload  # noqa: E402

WAVE_OUT = {
    1: REPO / "docs" / "ai-insights-wave1-results.json",
    2: REPO / "docs" / "ai-insights-wave2-results.json",
    3: REPO / "docs" / "ai-insights-wave3-results.json",
    "all": REPO / "docs" / "ai-insights-production-qa-results.json",
}


def _parse_wave(arg: str) -> List[int]:
    if arg == "all":
        return [1, 2, 3]
    try:
        w = int(arg)
    except ValueError as exc:
        raise SystemExit(f"Invalid --wave {arg!r}; use 1, 2, 3, or all") from exc
    if w not in (1, 2, 3):
        raise SystemExit(f"Invalid --wave {w}; use 1, 2, 3, or all")
    return [w]


def _merge_specs(waves: List[int]) -> Dict[str, Dict[str, Any]]:
    all_specs = build_all_wave_specs()
    merged: Dict[str, Dict[str, Any]] = {}
    for w in waves:
        merged.update(all_specs[w])
    return merged


def _run_routing_domain(
    domain: str,
    cfg: Dict[str, Any],
    results: List[EvalResult],
) -> None:
    path = FIXTURES / cfg["file"]
    df = pd.read_csv(path)
    m.df = df
    m.dataset_profile = m.build_profile(df)
    print(f"=== Domain: {domain} ===", flush=True)
    for spec in cfg["questions"]:
        _exact, viz, analysis = m.compute_visualization_for_question(spec.question)
        body = _routing_body(analysis, viz)
        results.append(evaluate_question(domain, spec, df, body))
    for chain in cfg["chains"]:
        _run_chain_routing(domain, chain, df, results)
    print(
        f"  completed {len([r for r in results if r.domain == domain])} evaluations",
        flush=True,
    )


def _run_full_domain(
    client: TestClient,
    domain: str,
    cfg: Dict[str, Any],
    results: List[EvalResult],
) -> None:
    path = FIXTURES / cfg["file"]
    df = pd.read_csv(path)
    m.df = df
    m.dataset_profile = m.build_profile(df)
    print(f"=== Domain: {domain} ===", flush=True)
    run_domain(client, domain, cfg, results)
    print(
        f"  completed {len([r for r in results if r.domain == domain])} evaluations",
        flush=True,
    )


def run_qa(
    waves: List[int],
    routing_only: bool,
    out_path: Path,
) -> Dict[str, Any]:
    specs = _merge_specs(waves)
    all_results: List[EvalResult] = []
    started = time.time()

    if routing_only:
        for domain, cfg in specs.items():
            _run_routing_domain(domain, cfg, all_results)
    else:
        m.usage_tracker.reset()
        orig_check = m.usage_tracker.check_ai_question
        m.usage_tracker.check_ai_question = lambda sid, tier: (True, None)  # type: ignore
        client = TestClient(m.app)
        for domain, cfg in specs.items():
            _run_full_domain(client, domain, cfg, all_results)
        m.usage_tracker.check_ai_question = orig_check  # type: ignore

    wave_label = "all" if len(waves) > 1 else str(waves[0])
    payload = {
        "executed_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "duration_sec": round(time.time() - started, 1),
        "wave": wave_label,
        "waves": waves,
        "domains": list(specs.keys()),
        "mode": "routing_deterministic_no_llm" if routing_only else "full_ask",
        "note": (
            "Narrative dimensions scored from chart/analysis payloads (routing-only mode)."
            if routing_only
            else "Full /ask with Claude narrative."
        ),
        "results": [
            {
                "domain": r.domain,
                "qid": r.qid,
                "question": r.question,
                "pattern": r.pattern,
                "is_follow_up": r.is_follow_up,
                "scores": r.scores,
                "avg": r.avg,
                "severity": r.severity,
                "notes": r.notes,
                "routing": r.routing,
                "expected": r.expected,
                "actual": r.actual,
            }
            for r in all_results
        ],
    }
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(f"Wrote {out_path}", flush=True)
    return payload


def main() -> None:
    parser = argparse.ArgumentParser(description="AI Insights production QA runner")
    parser.add_argument(
        "--wave",
        default="1",
        help="Wave number: 1, 2, 3, or all (default: 1)",
    )
    parser.add_argument(
        "--routing-only",
        action="store_true",
        help="Score routing/chart/analysis only — no LLM calls",
    )
    parser.add_argument(
        "--out",
        default="",
        help="Override output JSON path",
    )
    args = parser.parse_args()

    waves = _parse_wave(args.wave)
    if args.out:
        out_path = Path(args.out)
    elif len(waves) > 1:
        out_path = WAVE_OUT["all"]
    else:
        out_path = WAVE_OUT[waves[0]]

    run_qa(waves, args.routing_only, out_path)


if __name__ == "__main__":
    main()
