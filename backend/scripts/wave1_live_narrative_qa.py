#!/usr/bin/env python3
"""
Wave 1 live narrative QA — full /ask with Claude narrative (not routing-only).

Evaluation only — no product routing/prompt/UI changes.

Staging runbook: docs/ai-insights-live-narrative-staging-runbook.md
"""
from __future__ import annotations

import argparse
import json
import os
import re
import statistics
import sys
import time
import uuid
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import pandas as pd

BACKEND = Path(__file__).resolve().parents[1]
REPO = BACKEND.parent
FIXTURES = REPO / "test-fixtures" / "domains"
DEFAULT_OUTPUT_STEM = REPO / "docs" / "ai-insights-wave1-live-narrative"

sys.path.insert(0, str(BACKEND))

# Load API key from gitignored .env before importing main
for _env_path in (REPO / ".env", BACKEND / ".env"):
    if _env_path.exists():
        for line in _env_path.read_text(encoding="utf-8", errors="ignore").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            k, v = k.strip(), v.strip().strip('"').strip("'")
            if k and k not in os.environ:
                os.environ[k] = v

import main as m  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from main import ConversationContextPayload  # noqa: E402

from wave1_qa_execution import (  # noqa: E402
    ChainSpec,
    EvalResult,
    QuestionSpec,
    ask,
    build_domain_specs,
    compute_ground,
    evaluate_question,
)

NARRATIVE_DIMS = [
    "data_grounding",
    "executive_summary_quality",
    "recommendation_quality",
    "confidence_explanation",
    "follow_up_continuity",
    "hallucination_resistance",
]

DOMAIN_ALIASES: Dict[str, str] = {
    "retail": "Retail",
    "marketing": "Marketing",
    "sales": "Sales",
    "geography": "Geography",
    "banking": "Banking & Financial Services",
    "banking_financial_services": "Banking & Financial Services",
    "banking & financial services": "Banking & Financial Services",
}

FALLBACK_ANSWER_MARKERS: Tuple[str, ...] = (
    "could not reach the ai service",
    "unable to generate an ai narrative",
    "ai narrative service is temporarily overloaded",
    "the ai service could not authenticate",
    "the ai service returned an error",
)

# Curated Wave 1 live narrative suite (8–10 + negative + one chain per domain)
LIVE_SUITE: Dict[str, Dict[str, Any]] = {
    "Retail": {
        "question_ids": [
            "R-B01",
            "R-B03",
            "R-B05",
            "R-I01",
            "R-E01",
            "R-E02",
            "R-E03",
            "R-I09",
            "R-E10",
            "R-NEG",
        ],
        "chain_id": "R-C1",
        "chain_followups": 3,
    },
    "Marketing": {
        "question_ids": [
            "M-B01",
            "M-B04",
            "M-B05",
            "M-I01",
            "M-E01",
            "M-E02",
            "M-I07",
            "M-B06",
            "M-NEG",
        ],
        "chain_id": "M-C1",
        "chain_followups": 3,
    },
    "Sales": {
        "question_ids": [
            "S-B02",
            "S-B03",
            "S-B05",
            "S-I01",
            "S-E01",
            "S-E02",
            "S-D02",
            "S-I03",
            "S-NEG",
        ],
        "chain_id": "S-C2",
        "chain_followups": 2,
    },
    "Geography": {
        "question_ids": [
            "G-B01",
            "G-B02",
            "G-B05",
            "G-I01",
            "G-I04",
            "G-E06",
            "G-E03",
            "G-NEG",
        ],
        "chain_id": "G-C1",
        "chain_followups": 3,
    },
    "Banking & Financial Services": {
        "question_ids": [
            "B-B01",
            "B-B02",
            "B-B04",
            "B-I01",
            "B-I07",
            "B-E01",
            "B-E02",
            "B-NEG",
        ],
        "chain_id": "B-C1",
        "chain_followups": 3,
    },
}


@dataclass
class RunConfig:
    domains: List[str]
    limit: Optional[int]
    out_json: Path
    out_md: Path
    fail_fast: bool
    preflight_only: bool
    skip_chain: bool


def _resolve_output_paths(output: Optional[str]) -> Tuple[Path, Path]:
    if not output:
        stem = DEFAULT_OUTPUT_STEM
        return Path(f"{stem}-results.json"), Path(f"{stem}-report.md")

    p = Path(output)
    if p.suffix.lower() == ".json":
        return p, p.with_name(p.stem + "-report.md")
    if p.suffix.lower() == ".md":
        return p.with_name(p.stem + "-results.json"), p
    if p.is_dir() or str(output).endswith(("/", "\\")):
        d = p
        return d / "results.json", d / "report.md"
    return Path(f"{p}-results.json"), Path(f"{p}-report.md")


def _resolve_domains(domain_arg: Optional[str]) -> List[str]:
    if not domain_arg:
        return list(LIVE_SUITE.keys())
    key = domain_arg.strip().lower().replace("-", "_")
    if key in DOMAIN_ALIASES:
        return [DOMAIN_ALIASES[key]]
    for canonical in LIVE_SUITE:
        if canonical.lower() == domain_arg.strip().lower():
            return [canonical]
    known = ", ".join(sorted(DOMAIN_ALIASES))
    print(
        f"ERROR: Unknown --domain {domain_arg!r}. Use one of: {known}",
        file=sys.stderr,
    )
    sys.exit(2)


def _load_dotenv_key() -> str:
    return (os.getenv("ANTHROPIC_API_KEY") or "").strip()


def is_fallback_answer(answer: str) -> bool:
    low = (answer or "").lower().strip()
    return any(marker in low for marker in FALLBACK_ANSWER_MARKERS)


def run_preflight() -> Dict[str, Any]:
    """
    Confirm API key and a live Claude narrative call before the full matrix.
    Uses the same _generate_insight_narrative path as /ask.
    """
    key = _load_dotenv_key()
    if not key:
        print(
            "PREFLIGHT FAILED: ANTHROPIC_API_KEY is not set.\n"
            "Set it in the environment or in .env at repo root / backend/.env.\n"
            "See docs/ai-insights-live-narrative-staging-runbook.md",
            file=sys.stderr,
        )
        sys.exit(1)

    app_env = (os.getenv("APP_ENV") or "development").strip()
    print(f"Preflight: APP_ENV={app_env}", flush=True)
    print("Preflight: ANTHROPIC_API_KEY present (value not printed)", flush=True)

    try:
        sample = m._generate_insight_narrative(
            "Reply with exactly one word: PREFLIGHT_OK"
        )
    except Exception as exc:
        err_parts = [str(exc)]
        cause = exc
        for _ in range(4):
            cause = getattr(cause, "__cause__", None)
            if not cause:
                break
            err_parts.append(str(cause))
        combined = " ".join(err_parts)
        hint = (
            "TLS/certificate failure reaching api.anthropic.com — "
            "run this harness on staging (Render/Linux), not a broken local SSL host."
            if "CERTIFICATE_VERIFY_FAILED" in combined or "SSL" in combined.upper()
            else "Check API key, network egress, and Anthropic service status."
        )
        err = str(exc)
        print(
            "PREFLIGHT FAILED: Claude narrative call did not complete.\n"
            f"  Error: {type(exc).__name__}: {err[:300]}\n"
            f"  Hint: {hint}\n"
            "Full matrix was NOT started. Fix preflight, then re-run.\n"
            "See docs/ai-insights-live-narrative-staging-runbook.md",
            file=sys.stderr,
        )
        sys.exit(2)

    if not sample or len(sample.strip()) < 2:
        print(
            "PREFLIGHT FAILED: Claude returned an empty narrative.",
            file=sys.stderr,
        )
        sys.exit(2)

    if is_fallback_answer(sample):
        print(
            "PREFLIGHT FAILED: Response looks like a fallback message, not live narrative.",
            file=sys.stderr,
        )
        sys.exit(2)

    print(f"Preflight OK: Claude responded ({len(sample)} chars)", flush=True)
    return {
        "ok": True,
        "app_env": app_env,
        "sample_excerpt": sample[:120],
    }


def _index_specs(
    all_specs: Dict[str, Dict[str, Any]],
) -> Tuple[Dict[str, QuestionSpec], Dict[str, ChainSpec]]:
    by_id: Dict[str, QuestionSpec] = {}
    chains: Dict[str, ChainSpec] = {}
    for cfg in all_specs.values():
        for spec in cfg.get("questions", []):
            by_id[spec.id] = spec
        for chain in cfg.get("chains", []):
            chains[chain.id] = chain
            by_id[chain.root.id] = chain.root
    return by_id, chains


def score_correlation_narrative(answer: str, spec: QuestionSpec) -> Tuple[float, List[str]]:
    if spec.pattern != "relationship":
        return 7.0, ["N/A — not correlation question"]
    low = answer.lower()
    notes: List[str] = []
    score = 5.0
    if re.search(r"\bcorrelat", low):
        score += 2.0
    if re.search(r"\bscatter\b|\brelationship\b|\bassociation\b", low):
        score += 1.0
    if re.search(r"\bcausat", low) or re.search(r"\bcannot\s+(?:prove|establish)\s+caus", low):
        score += 1.5
        notes.append("Mentions causation limits")
    elif re.search(r"\bcaus", low) and not re.search(r"\bnot\s+caus|\bno\s+caus|\bcannot\b", low):
        score -= 1.5
        notes.append("Causation language without hedge")
    if re.search(r"\b\d+\.?\d*\b", answer[:500]):
        score += 1.0
    return min(10.0, max(1.0, score)), notes


def score_limitation_first(answer: str, spec: QuestionSpec) -> Tuple[float, List[str]]:
    if not spec.negative:
        return 7.0, ["N/A"]
    low = answer.lower()
    if re.search(r"conversion rate|nps|net promoter", low):
        return 1.0, ["Asserted missing metric as fact"]
    if re.search(
        r"cannot|not available|no column|unsupported|don't have|do not have|"
        r"not in (?:the|this) (?:data|dataset)|limitation|missing metric",
        low,
    ):
        return 9.0, ["Limitation-first wording"]
    return 5.0, ["Negative test without clear limitation"]


@dataclass
class NarrativeEval(EvalResult):
    correlation_narrative: float = 7.0
    limitation_first: float = 7.0
    chart_ok_answer_weak: bool = False
    answer_ok_conf_weak: bool = False
    narrative_avg: float = 0.0
    answer_full: str = ""
    narrative_source: str = "unknown"


def enrich_narrative_eval(
    er: EvalResult,
    body: Dict[str, Any],
    spec: QuestionSpec,
) -> NarrativeEval:
    answer = str(body.get("answer") or "")
    viz = body.get("visualization")
    chart_score = er.scores.get("chart_selection", 7.0)
    ground = er.scores.get("data_grounding", 7.0)
    exec_s = er.scores.get("executive_summary_quality", 7.0)
    conf = er.scores.get("confidence_explanation", 7.0)

    corr, corr_notes = score_correlation_narrative(answer, spec)
    lim, lim_notes = score_limitation_first(answer, spec)

    chart_ok = chart_score >= 8.0 and viz and (viz.get("labels") or viz.get("chartData"))
    answer_weak = chart_ok and (ground < 7.0 or exec_s < 7.0)
    conf_weak = (ground >= 7.0 or exec_s >= 7.0) and conf < 7.0 and answer.strip()

    narr_scores = [er.scores.get(d, 7.0) for d in NARRATIVE_DIMS]
    narr_avg = round(statistics.mean(narr_scores), 2)
    narr_source = "fallback" if is_fallback_answer(answer) else "live"

    ne = NarrativeEval(
        domain=er.domain,
        qid=er.qid,
        question=er.question,
        pattern=er.pattern,
        is_follow_up=er.is_follow_up,
        scores=er.scores,
        avg=er.avg,
        notes=list(er.notes) + corr_notes + lim_notes,
        severity=er.severity,
        routing=er.routing,
        expected=er.expected,
        actual={
            **er.actual,
            "answer_length": len(answer),
            "has_chart": bool(viz and (viz.get("labels") or viz.get("chartData"))),
            "narrative_source": narr_source,
        },
        correlation_narrative=corr,
        limitation_first=lim,
        chart_ok_answer_weak=answer_weak,
        answer_ok_conf_weak=conf_weak,
        narrative_avg=narr_avg,
        answer_full=answer[:4000],
        narrative_source=narr_source,
    )
    if spec.pattern == "relationship":
        ne.notes.append(f"Correlation narrative score: {corr:.1f}")
    if spec.negative:
        ne.notes.append(f"Limitation-first score: {lim:.1f}")
    return ne


def _check_fail_fast(
    cfg: RunConfig,
    *,
    qid: str,
    question: str,
    body: Dict[str, Any],
) -> None:
    if not cfg.fail_fast:
        return
    if body.get("error"):
        print(
            f"FAIL-FAST: /ask error on {qid}: {body.get('error')}",
            file=sys.stderr,
        )
        sys.exit(3)
    answer = str(body.get("answer") or "")
    if is_fallback_answer(answer):
        print(
            f"FAIL-FAST: fallback narrative on {qid} ({question[:60]}...)\n"
            f"  Answer: {answer[:200]}",
            file=sys.stderr,
        )
        sys.exit(3)


def run_domain_live(
    client: TestClient,
    domain: str,
    cfg: Dict[str, Any],
    suite: Dict[str, Any],
    by_id: Dict[str, QuestionSpec],
    chains: Dict[str, ChainSpec],
    results: List[NarrativeEval],
    run_cfg: RunConfig,
) -> None:
    path = FIXTURES / cfg["file"]
    df = pd.read_csv(path)
    m.df = df
    m.dataset_profile = m.build_profile(df)

    qids = list(suite["question_ids"])
    if run_cfg.limit is not None:
        qids = qids[: max(0, run_cfg.limit)]

    for qid in qids:
        spec = by_id[qid]
        print(f"  [{qid}] {spec.question[:60]}...", flush=True)
        body = ask(client, spec.question)
        _check_fail_fast(run_cfg, qid=qid, question=spec.question, body=body)
        if body.get("error"):
            results.append(
                NarrativeEval(
                    domain=domain,
                    qid=spec.id,
                    question=spec.question,
                    pattern=spec.pattern,
                    avg=0.0,
                    scores={d: 0.0 for d in NARRATIVE_DIMS},
                    notes=[f"API error: {body.get('error')}"],
                    severity="critical",
                    narrative_avg=0.0,
                    narrative_source="error",
                )
            )
            continue
        er = evaluate_question(domain, spec, df, body)
        results.append(enrich_narrative_eval(er, body, spec))
        time.sleep(0.35)

    if run_cfg.skip_chain:
        return

    chain = chains[suite["chain_id"]]
    root_spec = chain.root
    n_fu = int(suite.get("chain_followups", 3))
    print(f"  [chain {chain.id}] {root_spec.question[:50]}...", flush=True)
    body = ask(client, root_spec.question)
    _check_fail_fast(run_cfg, qid=root_spec.id, question=root_spec.question, body=body)
    if body.get("error"):
        return
    ground = compute_ground(root_spec, df)
    entity = ground.get("top_entity") or "the top entity"
    results.append(
        enrich_narrative_eval(
            evaluate_question(domain, root_spec, df, body), body, root_spec
        )
    )

    analysis = body.get("analysis") or {}
    ctx = ConversationContextPayload(
        lastQuestion=root_spec.question,
        rootQuestion=root_spec.question,
        metricColumn=analysis.get("metricColumn"),
        categoryColumn=analysis.get("categoryColumn"),
        aggregation=analysis.get("aggregationLabel") or analysis.get("aggregationKey"),
        chartType=(body.get("visualization") or {}).get("chartType"),
        intentBucket=(analysis.get("routingPlan") or {}).get("intent") or "",
        lastChartTitle=analysis.get("chartTitle") or "",
        followUpChain=[root_spec.question],
        lastAiAnswer=str(body.get("answer") or "")[:2000],
        turnId=str(uuid.uuid4()),
    )

    for i, tmpl in enumerate(chain.followups[:n_fu]):
        fq = tmpl.replace("{ENTITY}", entity)
        fu_spec = QuestionSpec(
            f"{chain.id}-F{i+1}",
            fq,
            "follow_up",
            root_spec.expect_intent,
            root_spec.expect_chart,
            root_spec.metric_hint,
            root_spec.dimension_hint,
        )
        print(f"  [{fu_spec.id}] {fq[:50]}...", flush=True)
        plan = m.resolve_follow_up_turn(fq, ctx, continuation_intent=True)
        fbody = ask(client, fq, ctx=ctx, continuation=True)
        _check_fail_fast(run_cfg, qid=fu_spec.id, question=fq, body=fbody)
        if fbody.get("error"):
            continue
        er = evaluate_question(domain, fu_spec, df, fbody, plan=plan, is_follow_up=True)
        results.append(enrich_narrative_eval(er, fbody, fu_spec))
        ctx.followUpChain = list(ctx.followUpChain or []) + [fq]
        ctx.lastQuestion = fq
        ctx.lastAiAnswer = str(fbody.get("answer") or "")[:2000]
        fa = fbody.get("analysis") or {}
        if fa.get("metricColumn"):
            ctx.metricColumn = fa.get("metricColumn")
        if fa.get("categoryColumn"):
            ctx.categoryColumn = fa.get("categoryColumn")
        time.sleep(0.35)


def write_report(
    payload: Dict[str, Any],
    results: List[NarrativeEval],
    out_md: Path,
) -> None:
    by_domain: Dict[str, List[NarrativeEval]] = defaultdict(list)
    for r in results:
        by_domain[r.domain].append(r)

    lines: List[str] = []
    lines.append("# AI Insights Wave 1 — Live Narrative QA Report")
    lines.append("")
    lines.append("**Status:** Evaluation only — no fixes implemented.")
    lines.append("")
    lines.append(f"**Executed:** {payload.get('executed_at', 'unknown')}")
    lines.append(f"**Mode:** `{payload.get('mode')}`")
    lines.append(f"**Duration:** {payload.get('duration_sec')}s")
    lines.append(f"**API key present:** {payload.get('api_key_present')}")
    lines.append(f"**Preflight:** {json.dumps(payload.get('preflight', {}))}")
    lines.append(
        f"**Live narratives:** {payload.get('claude_narrative_success', 0)} / "
        f"{payload.get('claude_narrative_success', 0) + payload.get('claude_narrative_fallback', 0)}"
    )
    if payload.get("claude_narrative_fallback", 0) > 0:
        lines.append("")
        lines.append(
            "> ⚠️ Some or all answers used connection fallback text — "
            "narrative scores are not valid for sign-off. See "
            "[staging runbook](ai-insights-live-narrative-staging-runbook.md)."
        )
    if payload.get("api_errors"):
        lines.append(f"**API errors:** {payload.get('api_errors')}")
    lines.append("")
    lines.append("**Runbook:** [`ai-insights-live-narrative-staging-runbook.md`](ai-insights-live-narrative-staging-runbook.md)")
    lines.append("**Fixtures:** `test-fixtures/domains/`")
    lines.append("")
    lines.append("---")
    lines.append("")
    lines.append("## 1. Live narrative scorecard")
    lines.append("")
    lines.append(
        "| Domain | N | Narrative avg | Ground | Exec | Rec | Conf | Follow-up | Halluc | Pass ≥7 | Verdict |"
    )
    lines.append(
        "|--------|--:|--------------:|-------:|-----:|---:|----:|----------:|-------:|--------:|---------|"
    )

    all_issues: List[NarrativeEval] = []
    chart_weak: List[NarrativeEval] = []
    conf_weak: List[NarrativeEval] = []
    hall_fails: List[NarrativeEval] = []

    for domain in payload.get("domains_run", list(LIVE_SUITE.keys())):
        rs = by_domain.get(domain, [])
        if not rs:
            continue
        narr_avgs = [r.narrative_avg for r in rs]
        dom_narr = round(statistics.mean(narr_avgs), 2)
        dim = {d: round(statistics.mean([r.scores.get(d, 7) for r in rs]), 2) for d in NARRATIVE_DIMS}
        pass_n = sum(1 for a in narr_avgs if a >= 7.0)
        if dom_narr >= 7.5 and pass_n / max(len(rs), 1) >= 0.85:
            verdict = "Pass"
        elif dom_narr >= 6.5:
            verdict = "Conditional"
        else:
            verdict = "Fail"
        lines.append(
            f"| {domain} | {len(rs)} | **{dom_narr}** | {dim['data_grounding']} | "
            f"{dim['executive_summary_quality']} | {dim['recommendation_quality']} | "
            f"{dim['confidence_explanation']} | {dim['follow_up_continuity']} | "
            f"{dim['hallucination_resistance']} | {pass_n}/{len(rs)} | {verdict} |"
        )
        for r in rs:
            if r.narrative_avg < 7.0 or r.severity in ("medium", "high", "critical"):
                all_issues.append(r)
            if r.chart_ok_answer_weak:
                chart_weak.append(r)
            if r.answer_ok_conf_weak:
                conf_weak.append(r)
            if r.scores.get("hallucination_resistance", 10) <= 3:
                hall_fails.append(r)

    lines.append("")
    lines.append("---")
    lines.append("")
    lines.append("## 2. Top narrative issues")
    lines.append("")
    ranked = sorted(all_issues, key=lambda r: (r.narrative_avg, r.avg))[:15]
    if not ranked:
        lines.append("No narrative issues below 7.0 average.")
    else:
        for r in ranked:
            lines.append(
                f"### {r.domain} — `{r.qid}` (narrative **{r.narrative_avg}**, "
                f"source={r.narrative_source})"
            )
            lines.append(f"- **Question:** {r.question}")
            lines.append(f"- **Notes:** {'; '.join(r.notes[:6])}")
            lines.append("")

    lines.append("---")
    lines.append("")
    lines.append("## 3. Hallucination failures")
    lines.append("")
    if not hall_fails:
        lines.append("**None detected.**")
    else:
        for r in hall_fails:
            lines.append(f"- **{r.qid}** ({r.domain}): {r.question}")

    lines.append("")
    lines.append("---")
    lines.append("")
    lines.append("## 4. Chart correct, answer weak")
    lines.append("")
    if not chart_weak:
        lines.append("None flagged.")
    else:
        for r in chart_weak[:20]:
            lines.append(f"- **{r.qid}** ({r.domain}): {r.question}")

    lines.append("")
    lines.append("---")
    lines.append("")
    lines.append("## 5. Per-question detail")
    lines.append("")
    for r in sorted(results, key=lambda x: (x.domain, x.qid)):
        lines.append(f"### {r.qid} — {r.domain} (narrative {r.narrative_avg}, {r.narrative_source})")
        lines.append(f"- Question: {r.question}")
        if r.answer_full:
            lines.append(f"- Excerpt: {r.answer_full[:300].replace(chr(10), ' ')}")
        lines.append("")

    out_md.parent.mkdir(parents=True, exist_ok=True)
    out_md.write_text("\n".join(lines), encoding="utf-8")
    print(f"Wrote {out_md}", flush=True)


def parse_args() -> RunConfig:
    parser = argparse.ArgumentParser(
        description="Wave 1 live narrative QA (full /ask + Claude). See docs/ai-insights-live-narrative-staging-runbook.md",
    )
    parser.add_argument(
        "--domain",
        metavar="NAME",
        help="Run one domain only: retail, marketing, sales, geography, banking",
    )
    parser.add_argument(
        "--limit",
        type=int,
        metavar="N",
        help="Max standalone questions per domain (chain still runs unless --skip-chain)",
    )
    parser.add_argument(
        "--output",
        metavar="PATH",
        help="Output stem or directory (default: docs/ai-insights-wave1-live-narrative)",
    )
    parser.add_argument(
        "--fail-fast",
        action="store_true",
        help="Exit on first /ask error or fallback narrative answer",
    )
    parser.add_argument(
        "--preflight-only",
        action="store_true",
        help="Run API/TLS preflight only; do not execute the QA matrix",
    )
    parser.add_argument(
        "--skip-chain",
        action="store_true",
        help="Skip follow-up chain per domain (faster smoke)",
    )
    args = parser.parse_args()
    out_json, out_md = _resolve_output_paths(args.output)
    return RunConfig(
        domains=_resolve_domains(args.domain),
        limit=args.limit,
        out_json=out_json,
        out_md=out_md,
        fail_fast=bool(args.fail_fast),
        preflight_only=bool(args.preflight_only),
        skip_chain=bool(args.skip_chain),
    )


def main() -> None:
    run_cfg = parse_args()
    preflight = run_preflight()
    if run_cfg.preflight_only:
        print("Preflight-only mode: exiting without QA matrix.", flush=True)
        sys.exit(0)

    all_specs = build_domain_specs()
    by_id, chains = _index_specs(all_specs)
    results: List[NarrativeEval] = []
    api_errors = 0

    m.usage_tracker.reset()
    orig_check = m.usage_tracker.check_ai_question
    m.usage_tracker.check_ai_question = lambda sid, tier: (True, None)  # type: ignore
    client = TestClient(m.app)

    started = time.time()
    for domain in run_cfg.domains:
        if domain not in LIVE_SUITE:
            print(f"SKIP unknown domain {domain}", flush=True)
            continue
        suite = LIVE_SUITE[domain]
        cfg = all_specs[domain]
        print(f"=== Domain: {domain} ===", flush=True)
        run_domain_live(
            client, domain, cfg, suite, by_id, chains, results, run_cfg
        )
        print(
            f"  done ({len([r for r in results if r.domain == domain])} evals)",
            flush=True,
        )

    m.usage_tracker.check_ai_question = orig_check  # type: ignore

    for r in results:
        if any("API error" in n for n in r.notes):
            api_errors += 1

    live_n = sum(1 for r in results if r.narrative_source == "live")
    fallback_n = sum(1 for r in results if r.narrative_source == "fallback")

    payload = {
        "executed_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "duration_sec": round(time.time() - started, 1),
        "mode": "full_ask_live_narrative",
        "api_key_present": True,
        "preflight": preflight,
        "domains_run": run_cfg.domains,
        "limit_per_domain": run_cfg.limit,
        "skip_chain": run_cfg.skip_chain,
        "api_errors": api_errors,
        "claude_narrative_success": live_n,
        "claude_narrative_fallback": fallback_n,
        "note": (
            "Live Claude narrative via /ask."
            if fallback_n == 0
            else "Some answers used fallback — narrative scores not valid for sign-off."
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
                "narrative_avg": r.narrative_avg,
                "narrative_source": r.narrative_source,
                "correlation_narrative": r.correlation_narrative,
                "limitation_first": r.limitation_first,
                "chart_ok_answer_weak": r.chart_ok_answer_weak,
                "answer_ok_conf_weak": r.answer_ok_conf_weak,
                "severity": r.severity,
                "notes": r.notes,
                "routing": r.routing,
                "actual": r.actual,
                "answer_excerpt": r.answer_full[:500],
            }
            for r in results
        ],
    }
    run_cfg.out_json.parent.mkdir(parents=True, exist_ok=True)
    run_cfg.out_json.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(f"Wrote {run_cfg.out_json}", flush=True)
    write_report(payload, results, run_cfg.out_md)

    if fallback_n > 0:
        print(
            f"WARNING: {fallback_n}/{len(results)} answers were fallback text.",
            file=sys.stderr,
        )
        sys.exit(4)


if __name__ == "__main__":
    main()
