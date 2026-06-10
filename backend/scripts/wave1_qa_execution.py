#!/usr/bin/env python3
"""
Wave 1 AI Insights Production QA execution.
Evaluates routing + /ask responses against domain fixtures. Read-only — no fixes.
"""
from __future__ import annotations

import json
import re
import statistics
import sys
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import pandas as pd

BACKEND = Path(__file__).resolve().parents[1]
REPO = BACKEND.parent
FIXTURES = REPO / "test-fixtures" / "domains"
OUT_JSON = REPO / "docs" / "ai-insights-wave1-results.json"

sys.path.insert(0, str(BACKEND))

import main as m  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from main import ConversationContextPayload, ParentAnalysisContextPayload  # noqa: E402

HALLUCINATION_MARKERS = [
    "conversion rate",
    "net promoter",
    "nps",
    "customer lifetime value",
    "clv",
    "churn rate",
    "market penetration",
    "salesperson",
    "patient risk score",
]

BAR_FAMILY = {"bar", "horizontalbar", "groupedbar", "stackedbar"}
LINE_FAMILY = {"line", "area"}
SCATTER_FAMILY = {"scatter"}


@dataclass
class QuestionSpec:
    id: str
    question: str
    pattern: str
    expect_intent: Tuple[str, ...]
    expect_chart: Tuple[str, ...]
    metric_hint: Optional[str] = None
    dimension_hint: Optional[str] = None
    negative: bool = False
    ground_fn: Optional[str] = None


@dataclass
class ChainSpec:
    id: str
    root: QuestionSpec
    followups: List[str]


@dataclass
class EvalResult:
    domain: str
    qid: str
    question: str
    pattern: str
    is_follow_up: bool = False
    scores: Dict[str, float] = field(default_factory=dict)
    avg: float = 0.0
    notes: List[str] = field(default_factory=list)
    severity: str = "none"
    routing: Dict[str, Any] = field(default_factory=dict)
    expected: Dict[str, Any] = field(default_factory=dict)
    actual: Dict[str, Any] = field(default_factory=dict)


def _norm_chart(t: Optional[str]) -> str:
    return str(t or "").strip().lower().replace("_", "")


def _chart_family(t: Optional[str]) -> str:
    c = _norm_chart(t)
    if c in BAR_FAMILY or "bar" in c:
        return "bar"
    if c in LINE_FAMILY:
        return "line"
    if c in SCATTER_FAMILY:
        return "scatter"
    if c in ("histogram",):
        return "histogram"
    if not c:
        return "none"
    return c


def _intent(analysis: Optional[Dict]) -> str:
    if not analysis:
        return ""
    rp = analysis.get("routingPlan") or {}
    return str(rp.get("intent") or analysis.get("intentBucket") or "").lower()


def _metric_col(analysis: Optional[Dict]) -> str:
    if not analysis:
        return ""
    return str(analysis.get("metricColumn") or "").lower()


def _cat_col(analysis: Optional[Dict]) -> str:
    if not analysis:
        return ""
    return str(analysis.get("categoryColumn") or "").lower()


def _find_col(df: pd.DataFrame, hints: List[str]) -> Optional[str]:
    cols = {c.lower(): c for c in df.columns}
    for h in hints:
        for lc, orig in cols.items():
            if h in lc:
                return orig
    return None


def ground_top_entity(df: pd.DataFrame, metric: str, dimension: str, agg: str = "sum") -> Tuple[str, float]:
    mcol = _find_col(df, [metric]) or metric
    dcol = _find_col(df, [dimension]) or dimension
    if mcol not in df.columns or dcol not in df.columns:
        return "", 0.0
    if not pd.api.types.is_numeric_dtype(df[mcol]):
        # prefer numeric column when hint is ambiguous (e.g. spend -> spend_amount)
        for c in df.columns:
            if metric in c.lower() and pd.api.types.is_numeric_dtype(df[c]):
                mcol = c
                break
        else:
            return "", 0.0
    s = df.groupby(dcol)[mcol]
    if agg == "mean":
        ranked = s.mean()
    else:
        ranked = s.sum()
    ranked = ranked.sort_values(ascending=False)
    top = str(ranked.index[0])
    try:
        val = float(ranked.iloc[0])
    except (TypeError, ValueError):
        val = 0.0
    return top, val


def compute_ground(spec: QuestionSpec, df: pd.DataFrame) -> Dict[str, Any]:
    fn = spec.ground_fn or spec.pattern
    if fn in ("ranking", "compare") and spec.metric_hint and spec.dimension_hint:
        top, val = ground_top_entity(df, spec.metric_hint, spec.dimension_hint)
        return {"top_entity": top, "top_value": val}
    if fn == "trend" and spec.metric_hint:
        mcol = _find_col(df, [spec.metric_hint]) or spec.metric_hint
        dcol = _find_col(df, ["date", "order_date", "report_date"])
        if mcol in df.columns and dcol:
            series = df.groupby(dcol)[mcol].sum().sort_index()
            return {"periods": len(series), "last_value": float(series.iloc[-1]) if len(series) else 0}
    return {}


def score_intent(analysis: Optional[Dict], spec: QuestionSpec) -> Tuple[float, List[str]]:
    notes: List[str] = []
    if spec.negative:
        unsup = analysis and (
            analysis.get("growthRequestUnsatisfied")
            or (analysis.get("unsupportedGrowthAnalysis") or {}).get("active")
            or str((analysis.get("routingPlan") or {}).get("supportStatus") or "").lower() == "unsupported"
        )
        ans_limit = False  # checked in grounding/hallucination
        intent = _intent(analysis)
        if unsup or intent in ("fallback", "unsupported"):
            return 9.0, ["Negative test: unsupported/limitation routing"]
        if spec.metric_hint and spec.metric_hint not in _metric_col(analysis):
            return 7.0, ["Did not hard-fail unsupported question"]
        return 4.0, ["Expected limitation routing for negative question"]

    intent = _intent(analysis)
    if intent in spec.expect_intent or any(e in intent for e in spec.expect_intent):
        score = 10.0
    elif intent in ("compare", "ranking") and spec.pattern in ("ranking", "compare", "executive", "summary"):
        score = 7.0
        notes.append(f"Intent {intent!r} acceptable fallback for {spec.pattern}")
    elif intent:
        score = 5.0
        notes.append(f"Intent mismatch: got {intent!r}, expected {spec.expect_intent}")
    else:
        score = 2.0
        notes.append("Missing intent")

    if spec.metric_hint and spec.metric_hint not in _metric_col(analysis):
        score = min(score, 6.0)
        notes.append(f"Metric hint {spec.metric_hint} not in {_metric_col(analysis)}")
    if spec.dimension_hint and spec.dimension_hint not in _cat_col(analysis):
        if spec.pattern not in ("relationship", "trend", "executive", "summary"):
            score = min(score, 6.0)
            notes.append(f"Dimension hint {spec.dimension_hint} not in {_cat_col(analysis)}")
    return score, notes


def score_chart(viz: Optional[Dict], spec: QuestionSpec, analysis: Optional[Dict]) -> Tuple[float, List[str]]:
    notes: List[str] = []
    if spec.negative:
        return 8.0, ["Chart optional for negative test"]

    ctype = _chart_family(viz.get("chartType") if viz else None)
    expected = {_chart_family(x) for x in spec.expect_chart}

    if not viz or not (viz.get("labels") or viz.get("chartData")):
        if "none" in expected or "unsupported" in spec.expect_chart:
            return 9.0, ["No chart as expected"]
        return 2.0, ["Missing visualization"]

    if ctype in expected or (ctype == "bar" and "bar" in expected):
        return 10.0, []
    if ctype == "bar" and "horizontalbar" in {_norm_chart(x) for x in spec.expect_chart}:
        return 9.0, ["Bar family swap ok"]
    if spec.pattern == "relationship" and ctype == "scatter":
        return 10.0, []
    if spec.pattern == "trend" and ctype == "line":
        return 10.0, []

    notes.append(f"Chart family {ctype!r} vs expected {expected}")
    if spec.pattern == "executive" and ctype == "bar":
        return 7.0, notes
    return 4.0, notes


def score_grounding(
    answer: str,
    viz: Optional[Dict],
    analysis: Optional[Dict],
    ground: Dict[str, Any],
    spec: QuestionSpec,
) -> Tuple[float, List[str]]:
    notes: List[str] = []
    if spec.negative:
        if re.search(r"conversion rate|nps|net promoter", answer, re.I):
            return 2.0, ["Answer asserted missing metric"]
        if re.search(r"cannot|not available|no column|unsupported|don't have|do not have|limitation", answer, re.I):
            return 9.0, ["Stated limitation"]
        return 6.0, ["Negative test without clear limitation wording"]

    top = ground.get("top_entity", "")
    if top and viz and viz.get("labels"):
        labels = [str(x) for x in viz.get("labels") or []]
        if labels and str(labels[0]).lower() != top.lower() and top.lower() not in labels[0].lower():
            # allow if top is in top 3
            if not any(top.lower() in str(l).lower() for l in labels[:3]):
                notes.append(f"Chart top {labels[0]!r} vs pandas top {top!r}")
                return 5.0, notes

    if top and top.lower() not in answer.lower():
        notes.append(f"Answer may omit top entity {top}")
        return 6.5, notes

    if viz and viz.get("values") and top:
        return 8.5, notes
    if answer.strip():
        return 7.0, notes
    return 3.0, ["Empty or missing answer"]


def score_exec_summary(answer: str, spec: QuestionSpec) -> Tuple[float, List[str]]:
    if not answer.strip():
        return 2.0, ["Empty answer"]
    first = answer.strip()[:400].lower()
    bad_starts = ("i'll ", "i will ", "let me ", "to answer", "first,")
    if first.startswith(bad_starts):
        return 5.0, ["Process-led opening"]
    if spec.pattern in ("executive", "summary") and len(answer) > 800:
        return 6.0, ["Verbose executive block"]
    if any(w in first for w in ("highest", "lowest", "leads", "total", "summary", "risk", "opportunity", "focus")):
        return 8.5, []
    if re.search(r"\d[\d,\.]*", answer[:300]):
        return 8.0, []
    return 6.0, ["Lead sentence unclear"]


def score_recommendations(answer: str, spec: QuestionSpec) -> Tuple[float, List[str]]:
    if spec.pattern not in ("executive", "summary", "profitability") and "risk" not in spec.pattern:
        return 7.0, ["N/A — not recommendation-focused question"]
    rec_words = ("recommend", "should", "focus", "consider", "next step", "priorit", "action", "mitig")
    hedge = ("may", "might", "could", "suggest", "indicate", "appears")
    has_rec = any(w in answer.lower() for w in rec_words)
    has_hedge = any(w in answer.lower() for w in hedge)
    if has_rec and has_hedge:
        return 8.5, []
    if has_rec:
        return 7.0, ["Recommendation without much hedging"]
    if spec.pattern == "executive":
        return 5.0, ["Executive question lacks actionable recommendation"]
    return 7.0, []


def score_confidence(analysis: Optional[Dict]) -> Tuple[float, List[str]]:
    if not analysis:
        return 3.0, ["No analysis payload"]
    level = str(analysis.get("insightConfidenceLevel") or "").lower()
    rationale = str(analysis.get("insightConfidenceRationale") or analysis.get("evidenceSummaryLine") or "")
    if level in ("high", "moderate", "medium") and len(rationale) > 20:
        return 9.0, []
    if level and rationale:
        return 7.0, ["Thin confidence rationale"]
    if level:
        return 6.0, ["Missing rationale"]
    return 4.0, ["Missing confidence band"]


def score_hallucination(answer: str, df: pd.DataFrame) -> Tuple[float, List[str]]:
    low = answer.lower()
    cols = {c.lower() for c in df.columns}
    hits = [mk for mk in HALLUCINATION_MARKERS if mk in low]
    if hits:
        return 1.0, [f"Hallucination markers: {hits}"]
    # quarter without quarter column
    if "quarter" in low and not any("quarter" in c for c in cols):
        return 5.0, ["Mentioned quarter without quarter column"]
    return 9.5, []


def score_follow_up(
    plan: Dict[str, Any],
    analysis: Optional[Dict],
    parent_metric: str,
    parent_cat: str,
    root_q: str,
) -> Tuple[float, List[str]]:
    notes: List[str] = []
    sidecar = plan.get("conversation_sidecar") or {}
    if not sidecar.get("wasFollowUp"):
        return 3.0, ["Follow-up not detected"]
    eff = str(plan.get("effective_question") or "")
    if root_q.strip().lower() not in eff.strip().lower() and eff != root_q:
        notes.append(f"Effective question {eff!r} != root {root_q!r}")
        score = 5.0
    else:
        score = 9.0
    if analysis:
        if parent_metric and parent_metric not in _metric_col(analysis):
            score = min(score, 6.0)
            notes.append("Metric drift on follow-up")
        if parent_cat and parent_cat not in _cat_col(analysis):
            score = min(score, 6.0)
            notes.append("Dimension drift on follow-up")
    return score, notes


def classify_severity(avg: float, scores: Dict[str, float]) -> str:
    if scores.get("hallucination_resistance", 10) <= 3:
        return "critical"
    if avg < 5:
        return "high"
    if avg < 7:
        return "medium"
    if any(v < 4 for v in scores.values()):
        return "medium"
    return "low"


def ask(
    client: TestClient,
    question: str,
    ctx: Optional[ConversationContextPayload] = None,
    continuation: bool = False,
) -> Dict[str, Any]:
    payload: Dict[str, Any] = {"question": question}
    if ctx:
        payload["conversation_context"] = ctx.model_dump(exclude_none=True)
        payload["continuation_intent"] = continuation
        payload["parent_analysis_context"] = ParentAnalysisContextPayload(
            rootQuestion=ctx.rootQuestion or ctx.lastQuestion,
            priorQuestion=ctx.lastQuestion,
            metricColumn=ctx.metricColumn,
            categoryColumn=ctx.categoryColumn,
            aggregation=ctx.aggregation,
            chartType=ctx.chartType,
            chartTitle=ctx.lastChartTitle,
            intentBucket=ctx.intentBucket,
            followUpChain=ctx.followUpChain,
            lastAiAnswer=ctx.lastAiAnswer,
            turnId=ctx.turnId,
        ).model_dump(exclude_none=True)
    headers = {"X-Plan-Tier": "paid", "X-Session-Id": str(uuid.uuid4())}
    resp = client.post("/ask", json=payload, headers=headers)
    if resp.status_code == 429:
        return {"error": "rate_limit", "status": 429}
    if resp.status_code != 200:
        return {"error": resp.text, "status": resp.status_code}
    return resp.json()


def evaluate_question(
    domain: str,
    spec: QuestionSpec,
    df: pd.DataFrame,
    body: Dict[str, Any],
    plan: Optional[Dict[str, Any]] = None,
    is_follow_up: bool = False,
) -> EvalResult:
    analysis = body.get("analysis") or {}
    viz = body.get("visualization")
    answer = str(body.get("answer") or "")
    ground = compute_ground(spec, df)

    scores: Dict[str, float] = {}
    all_notes: List[str] = []

    for name, fn in [
        ("intent_detection", lambda: score_intent(analysis, spec)),
        ("chart_selection", lambda: score_chart(viz, spec, analysis)),
        ("data_grounding", lambda: score_grounding(answer, viz, analysis, ground, spec)),
        ("executive_summary_quality", lambda: score_exec_summary(answer, spec)),
        ("recommendation_quality", lambda: score_recommendations(answer, spec)),
        ("confidence_explanation", lambda: score_confidence(analysis)),
    ]:
        s, n = fn()
        scores[name] = s
        all_notes.extend(n)

    if is_follow_up and plan:
        s, n = score_follow_up(
            plan,
            analysis,
            str(analysis.get("metricColumn") or ""),
            str(analysis.get("categoryColumn") or ""),
            spec.question,
        )
        scores["follow_up_continuity"] = s
        all_notes.extend(n)
    else:
        scores["follow_up_continuity"] = 7.0 if not is_follow_up else 5.0

    s, n = score_hallucination(answer, df)
    scores["hallucination_resistance"] = s
    all_notes.extend(n)

    avg = round(statistics.mean(scores.values()), 2)
    er = EvalResult(
        domain=domain,
        qid=spec.id,
        question=spec.question,
        pattern=spec.pattern,
        is_follow_up=is_follow_up,
        scores=scores,
        avg=avg,
        notes=all_notes,
        severity=classify_severity(avg, scores),
        routing={
            "intent": _intent(analysis),
            "metricColumn": analysis.get("metricColumn"),
            "categoryColumn": analysis.get("categoryColumn"),
            "chartType": (viz or {}).get("chartType"),
            "confidence": analysis.get("insightConfidenceLevel"),
            "supportStatus": (analysis.get("routingPlan") or {}).get("supportStatus"),
        },
        expected={
            "intent": spec.expect_intent,
            "chart": spec.expect_chart,
            "ground": ground,
        },
        actual={
            "answer_excerpt": answer[:280].replace("\n", " "),
            "chart_labels_sample": (viz or {}).get("labels", [])[:3] if viz else [],
        },
    )
    return er


def build_domain_specs() -> Dict[str, Dict[str, Any]]:
    """15–25 questions + 2 follow-up chains per Wave 1 domain."""
    return {
        "Retail": {
            "file": "retail.csv",
            "questions": [
                QuestionSpec("R-B01", "Which city generates the highest revenue?", "ranking", ("ranking", "compare"), ("bar", "horizontalBar"), "revenue", "city", ground_fn="ranking"),
                QuestionSpec("R-B03", "Compare revenue across cities", "compare", ("compare", "ranking"), ("bar",), "revenue", "city"),
                QuestionSpec("R-B05", "Show revenue trend over time", "trend", ("trend",), ("line", "area"), "revenue", "order_date"),
                QuestionSpec("R-I01", "Is revenue correlated with customers?", "relationship", ("relationship",), ("scatter",), "revenue", "customers"),
                QuestionSpec("R-I02", "Which city is an revenue outlier?", "outlier", ("outlier", "ranking"), ("bar", "histogram"), "revenue", "city"),
                QuestionSpec("R-E01", "What are the biggest opportunities in this retail data?", "executive", ("executive", "compare"), ("bar",), "revenue", "city"),
                QuestionSpec("R-E02", "What are the biggest risks?", "executive", ("executive", "risk"), ("bar",), "profit", "city"),
                QuestionSpec("R-E03", "Summarize business performance", "summary", ("summary", "executive", "compare"), ("bar",), "revenue", "city"),
                QuestionSpec("R-NEG", "Compare conversion rate across cities", "negative", ("fallback", "unsupported", "compare"), ("none", "unsupported"), "conversion", "city", negative=True),
                QuestionSpec("R-B06", "Rank product categories by revenue", "ranking", ("ranking", "compare"), ("bar",), "revenue", "product_category"),
                QuestionSpec("R-B04", "Compare profit across regions", "compare", ("compare",), ("bar",), "profit", "region"),
                QuestionSpec("R-I10", "Show growth rate trend over time", "trend", ("trend",), ("line", "area"), "growth_rate", "order_date"),
                QuestionSpec("R-E04", "What should leadership focus on?", "executive", ("executive",), ("bar",), "revenue", "city"),
                QuestionSpec("R-E06", "Where are we losing money?", "profitability", ("profitability", "executive"), ("bar",), "profit", "city"),
                QuestionSpec("R-B07", "Which product drives the most orders?", "ranking", ("ranking",), ("bar",), "orders", "product"),
                QuestionSpec("R-I06", "Compare quantity sold across products", "compare", ("compare",), ("bar",), "quantity", "product"),
                QuestionSpec("R-E10", "What concentration risk exists in our revenue?", "executive", ("executive",), ("bar",), "revenue", "city"),
                QuestionSpec("R-I09", "Compare East vs West region revenue", "compare", ("compare",), ("bar",), "revenue", "region"),
                QuestionSpec("R-D07", "What is average order value by city?", "ranking", ("ranking", "compare"), ("bar",), "revenue", "city"),
                QuestionSpec("R-E07", "Give an executive summary of revenue by region", "summary", ("summary", "compare"), ("bar",), "revenue", "region"),
            ],
            "chains": [
                ChainSpec(
                    "R-C1",
                    QuestionSpec("R-C1-Q", "Which city generates the highest revenue?", "ranking", ("ranking",), ("bar",), "revenue", "city", ground_fn="ranking"),
                    [
                        "Why is {ENTITY} highest?",
                        "What evidence supports this conclusion?",
                        "Which columns were used for this analysis?",
                        "Show the calculations behind this answer.",
                        "Compare {ENTITY} with the second highest city.",
                    ],
                ),
                ChainSpec(
                    "R-C2",
                    QuestionSpec("R-C2-Q", "Compare revenue across cities", "compare", ("compare",), ("bar",), "revenue", "city", ground_fn="ranking"),
                    [
                        "Why is {ENTITY} highest?",
                        "What risk does this concentration create?",
                        "Which columns were used for this analysis?",
                    ],
                ),
            ],
        },
        "Marketing": {
            "file": "marketing.csv",
            "questions": [
                QuestionSpec("M-B01", "Compare satisfaction_score by channel", "compare", ("compare",), ("bar",), "satisfaction", "channel"),
                QuestionSpec("M-B04", "Rank channels by revenue", "ranking", ("ranking",), ("bar",), "revenue", "channel", ground_fn="ranking"),
                QuestionSpec("M-B05", "Monthly trend of satisfaction score", "trend", ("trend",), ("line", "area"), "satisfaction", "report_date"),
                QuestionSpec("M-I01", "Is revenue correlated with satisfaction_score?", "relationship", ("relationship",), ("scatter",), "revenue", "satisfaction"),
                QuestionSpec("M-I02", "Compare campaign ROI: revenue vs spend by campaign", "compare", ("compare",), ("bar",), "revenue", "campaign"),
                QuestionSpec("M-I03", "Which channel underperforms on satisfaction?", "ranking", ("ranking",), ("bar",), "satisfaction", "channel"),
                QuestionSpec("M-I05", "Conversion analysis: revenue per conversion by channel", "compare", ("compare", "ranking"), ("bar",), "revenue", "channel"),
                QuestionSpec("M-E01", "Biggest marketing opportunity", "executive", ("executive",), ("bar",), "revenue", "channel"),
                QuestionSpec("M-E02", "Biggest marketing risk", "executive", ("executive",), ("bar",), "satisfaction", "channel"),
                QuestionSpec("M-E03", "Executive summary of campaign performance", "summary", ("summary", "executive"), ("bar",), "revenue", "campaign"),
                QuestionSpec("M-NEG", "Compare NPS across channels", "negative", ("fallback",), ("none",), "nps", "channel", negative=True),
                QuestionSpec("M-B02", "Which channel has the highest satisfaction_score?", "ranking", ("ranking",), ("bar",), "satisfaction", "channel"),
                QuestionSpec("M-B08", "Compare revenue by channel", "compare", ("compare",), ("bar",), "revenue", "channel"),
                QuestionSpec("M-B05b", "Show revenue trend over time", "trend", ("trend",), ("line",), "revenue", "report_date"),
                QuestionSpec("M-I07", "Outlier campaigns on spend", "outlier", ("outlier", "ranking"), ("bar",), "spend", "campaign"),
                QuestionSpec("M-I06", "Geographic: satisfaction by region", "compare", ("compare",), ("bar",), "satisfaction", "region"),
                QuestionSpec("M-D01", "Campaign ROI: compare revenue to cost by campaign", "compare", ("compare",), ("bar",), "revenue", "campaign"),
                QuestionSpec("M-E05", "Strategic recommendation for budget allocation", "executive", ("executive",), ("bar", "none"), "spend", "channel"),
                QuestionSpec("M-B06", "Rank campaigns by conversions", "ranking", ("ranking",), ("bar",), "conversions", "campaign"),
                QuestionSpec("M-I09", "Compare spend across channels", "compare", ("compare",), ("bar",), "spend", "channel"),
            ],
            "chains": [
                ChainSpec(
                    "M-C1",
                    QuestionSpec("M-C1-Q", "Compare satisfaction_score by channel", "compare", ("compare",), ("bar",), "satisfaction", "channel", ground_fn="ranking"),
                    ["Why is {ENTITY} highest?", "Which columns were used for this analysis?", "Show the calculations behind this answer."],
                ),
                ChainSpec(
                    "M-C2",
                    QuestionSpec("M-C2-Q", "Is revenue correlated with satisfaction_score?", "relationship", ("relationship",), ("scatter",), "revenue", "satisfaction"),
                    ["What evidence supports this conclusion?", "What caution applies to causation?"],
                ),
            ],
        },
        "Sales": {
            "file": "sales.csv",
            "questions": [
                QuestionSpec("S-B01", "Which region has the highest revenue?", "ranking", ("ranking",), ("bar",), "revenue", "region", ground_fn="ranking"),
                QuestionSpec("S-B02", "Rank departments by revenue", "ranking", ("ranking",), ("bar", "horizontalBar"), "revenue", "department"),
                QuestionSpec("S-B03", "Compare revenue across regions", "compare", ("compare",), ("bar",), "revenue", "region"),
                QuestionSpec("S-B05", "Show revenue trend over time", "trend", ("trend",), ("line", "area"), "revenue", "report_date"),
                QuestionSpec("S-I01", "Is revenue correlated with units?", "relationship", ("relationship",), ("scatter",), "revenue", "units"),
                QuestionSpec("S-D01", "Which territory delivers the most revenue?", "ranking", ("ranking",), ("bar",), "revenue", "territory", ground_fn="ranking"),
                QuestionSpec("S-D02", "Compare sales team performance by department", "compare", ("compare",), ("bar",), "revenue", "department"),
                QuestionSpec("S-I03", "Which department is an outlier for revenue?", "outlier", ("outlier", "ranking"), ("bar",), "revenue", "department"),
                QuestionSpec("S-E01", "What is the biggest sales opportunity?", "executive", ("executive",), ("bar",), "revenue", "region"),
                QuestionSpec("S-E02", "What is the biggest sales risk?", "executive", ("executive",), ("bar",), "revenue", "region"),
                QuestionSpec("S-E03", "Summarize sales performance", "summary", ("summary",), ("bar",), "revenue", "region"),
                QuestionSpec("S-NEG", "Compare win rate by sales stage", "negative", ("fallback",), ("none",), "win", "stage", negative=True),
                QuestionSpec("S-B04", "Which product line generates the most revenue?", "ranking", ("ranking",), ("bar",), "revenue", "product_line"),
                QuestionSpec("S-I08", "Rank product lines by revenue", "ranking", ("ranking",), ("bar",), "revenue", "product_line"),
                QuestionSpec("S-D07", "Which region grew revenue month over month?", "trend", ("trend",), ("line",), "revenue", "report_date"),
                QuestionSpec("S-E10", "What concentration risk exists by region?", "executive", ("executive",), ("bar",), "revenue", "region"),
                QuestionSpec("S-I06", "Which region has the best attainment percentage?", "ranking", ("ranking",), ("bar",), "attainment", "region"),
                QuestionSpec("S-B07", "Compare units sold across departments", "compare", ("compare",), ("bar",), "units", "department"),
                QuestionSpec("S-E04", "What should the sales leader focus on?", "executive", ("executive",), ("bar",), "revenue", "territory"),
            ],
            "chains": [
                ChainSpec(
                    "S-C1",
                    QuestionSpec("S-C1-Q", "Which region has the highest revenue?", "ranking", ("ranking",), ("bar",), "revenue", "region", ground_fn="ranking"),
                    ["Why is {ENTITY} highest?", "Compare with the second highest region.", "Which columns were used for this analysis?"],
                ),
                ChainSpec(
                    "S-C2",
                    QuestionSpec("S-C2-Q", "Rank departments by revenue", "ranking", ("ranking",), ("bar",), "revenue", "department", ground_fn="ranking"),
                    ["What action should management take for the lowest department?", "Show the calculations behind this answer."],
                ),
            ],
        },
        "Geography": {
            "file": "geography.csv",
            "questions": [
                QuestionSpec("G-B01", "Which city generates the highest revenue?", "ranking", ("ranking",), ("bar",), "revenue", "city", ground_fn="ranking"),
                QuestionSpec("G-B02", "Compare revenue across zones", "compare", ("compare",), ("bar",), "revenue", "zone"),
                QuestionSpec("G-B05", "Show revenue trend over time", "trend", ("trend",), ("line", "area"), "revenue", "report_date"),
                QuestionSpec("G-I01", "Is revenue correlated with customers?", "relationship", ("relationship",), ("scatter",), "revenue", "customers"),
                QuestionSpec("G-I02", "Regional concentration: revenue share by zone", "executive", ("executive", "compare"), ("bar",), "revenue", "zone"),
                QuestionSpec("G-I03", "Which city is a revenue outlier?", "outlier", ("outlier",), ("bar",), "revenue", "city"),
                QuestionSpec("G-E01", "Biggest geographic opportunity", "executive", ("executive",), ("bar",), "revenue", "zone"),
                QuestionSpec("G-E02", "Biggest geographic risk", "executive", ("executive",), ("bar",), "revenue", "city"),
                QuestionSpec("G-E03", "Executive summary of regional performance", "summary", ("summary",), ("bar",), "revenue", "zone"),
                QuestionSpec("G-B06", "Which zone has the lowest revenue?", "ranking", ("ranking",), ("bar",), "revenue", "zone"),
                QuestionSpec("G-B10", "Total revenue by state", "compare", ("compare",), ("bar",), "revenue", "state"),
                QuestionSpec("G-I04", "Compare Mumbai vs Bengaluru revenue", "compare", ("compare",), ("bar",), "revenue", "city"),
                QuestionSpec("G-D01", "Regional concentration of revenue", "executive", ("executive",), ("bar",), "revenue", "zone"),
                QuestionSpec("G-B08", "Which city has the highest growth rate?", "ranking", ("ranking",), ("bar",), "growth_rate", "city"),
                QuestionSpec("G-I06", "Profit per customer by city", "ranking", ("ranking",), ("bar",), "profit", "city"),
                QuestionSpec("G-E06", "Where is revenue overly concentrated?", "executive", ("executive",), ("bar",), "revenue", "city"),
                QuestionSpec("G-D07", "West vs South zone comparison", "compare", ("compare",), ("bar",), "revenue", "zone"),
                QuestionSpec("G-NEG", "Compare sales by salesperson across cities", "negative", ("fallback",), ("none",), "salesperson", "city", negative=True),
            ],
            "chains": [
                ChainSpec(
                    "G-C1",
                    QuestionSpec("G-C1-Q", "Which city generates the highest revenue?", "ranking", ("ranking",), ("bar",), "revenue", "city", ground_fn="ranking"),
                    ["Why is {ENTITY} highest?", "What evidence supports this conclusion?", "Which columns were used for this analysis?"],
                ),
                ChainSpec(
                    "G-C2",
                    QuestionSpec("G-C2-Q", "Compare revenue across zones", "compare", ("compare",), ("bar",), "revenue", "zone", ground_fn="ranking"),
                    ["What risk does concentration create?", "What action should management take?"],
                ),
            ],
        },
        "Banking & Financial Services": {
            "file": "banking_financial_services.csv",
            "questions": [
                QuestionSpec("B-B01", "Which branch has the highest loan balance?", "ranking", ("ranking",), ("bar",), "loan_balance", "branch", ground_fn="ranking"),
                QuestionSpec("B-B02", "Compare deposits across regions", "compare", ("compare",), ("bar",), "deposit_balance", "region"),
                QuestionSpec("B-B03", "Rank customer segments by interest income", "ranking", ("ranking",), ("bar",), "interest_income", "customer_segment"),
                QuestionSpec("B-B04", "Show deposit trend over time", "trend", ("trend",), ("line",), "deposit_balance", "report_date"),
                QuestionSpec("B-B05", "Which branch has the lowest delinquency rate?", "ranking", ("ranking",), ("bar",), "delinquency", "branch"),
                QuestionSpec("B-I01", "Loan portfolio concentration by region", "executive", ("executive", "compare"), ("bar",), "loan_balance", "region"),
                QuestionSpec("B-I03", "Is interest income correlated with loan balance?", "relationship", ("relationship",), ("scatter",), "interest_income", "loan"),
                QuestionSpec("B-I04", "Which regions exceed average delinquency?", "ranking", ("ranking",), ("bar",), "delinquency", "region"),
                QuestionSpec("B-E01", "Biggest portfolio opportunity", "executive", ("executive",), ("bar",), "interest_income", "segment"),
                QuestionSpec("B-E02", "Biggest credit risk", "executive", ("executive",), ("bar",), "npl", "region"),
                QuestionSpec("B-E03", "Executive summary of branch performance", "summary", ("summary",), ("bar",), "deposit_balance", "branch"),
                QuestionSpec("B-B07", "Total NPL amount by region", "compare", ("compare",), ("bar",), "npl", "region"),
                QuestionSpec("B-I07", "Credit utilization risk concentration", "executive", ("executive",), ("bar",), "credit_utilization", "segment"),
                QuestionSpec("B-D06", "Delinquency rate by branch", "ranking", ("ranking",), ("bar",), "delinquency", "branch"),
                QuestionSpec("B-D07", "Spend category breakdown", "compare", ("compare", "distribution"), ("bar", "donut"), "spend_amount", "spend_category"),
                QuestionSpec("B-I02", "Delinquency outlier branches", "outlier", ("outlier",), ("bar",), "delinquency", "branch"),
                QuestionSpec("B-E04", "What should the CRO focus on?", "executive", ("executive",), ("bar",), "npl", "region"),
                QuestionSpec("B-NEG", "Compare net interest margin trend by quarter", "negative", ("fallback",), ("none",), "nim", "quarter", negative=True),
            ],
            "chains": [
                ChainSpec(
                    "B-C1",
                    QuestionSpec("B-C1-Q", "Which branch has the highest loan balance?", "ranking", ("ranking",), ("bar",), "loan_balance", "branch", ground_fn="ranking"),
                    ["Why is {ENTITY} highest?", "Which columns were used for this analysis?", "Show the calculations behind this answer."],
                ),
                ChainSpec(
                    "B-C2",
                    QuestionSpec("B-C2-Q", "Compare deposits across regions", "compare", ("compare",), ("bar",), "deposit_balance", "region", ground_fn="ranking"),
                    ["What risk does concentration create?", "What action should management take?"],
                ),
            ],
        },
    }


def run_domain(
    client: TestClient,
    domain: str,
    cfg: Dict[str, Any],
    results: List[EvalResult],
) -> None:
    path = FIXTURES / cfg["file"]
    df = pd.read_csv(path)
    m.df = df
    m.dataset_profile = m.build_profile(df)

    for spec in cfg["questions"]:
        body = ask(client, spec.question)
        if body.get("error"):
            results.append(
                EvalResult(
                    domain=domain,
                    qid=spec.id,
                    question=spec.question,
                    pattern=spec.pattern,
                    avg=0.0,
                    scores={k: 0.0 for k in [
                        "intent_detection", "chart_selection", "data_grounding",
                        "executive_summary_quality", "recommendation_quality",
                        "confidence_explanation", "follow_up_continuity", "hallucination_resistance",
                    ]},
                    notes=[f"API error: {body.get('error')}"],
                    severity="critical",
                )
            )
            continue
        results.append(evaluate_question(domain, spec, df, body))
        time.sleep(0.15)

    for chain in cfg["chains"]:
        root_spec = chain.root
        body = ask(client, root_spec.question)
        if body.get("error"):
            continue
        ground = compute_ground(root_spec, df)
        entity = ground.get("top_entity") or "the top entity"
        root_er = evaluate_question(domain, root_spec, df, body)
        results.append(root_er)

        analysis = body.get("analysis") or {}
        ctx = ConversationContextPayload(
            lastQuestion=root_spec.question,
            rootQuestion=root_spec.question,
            metricColumn=analysis.get("metricColumn"),
            categoryColumn=analysis.get("categoryColumn"),
            aggregation=analysis.get("aggregationLabel") or analysis.get("aggregationKey"),
            chartType=(body.get("visualization") or {}).get("chartType"),
            intentBucket=_intent(analysis),
            lastChartTitle=analysis.get("chartTitle") or "",
            followUpChain=[root_spec.question],
            lastAiAnswer=str(body.get("answer") or "")[:2000],
            turnId=str(uuid.uuid4()),
        )

        for i, tmpl in enumerate(chain.followups):
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
            plan = m.resolve_follow_up_turn(fq, ctx, continuation_intent=True)
            fbody = ask(client, fq, ctx=ctx, continuation=True)
            if fbody.get("error"):
                continue
            er = evaluate_question(domain, fu_spec, df, fbody, plan=plan, is_follow_up=True)
            # merge follow-up score emphasis
            results.append(er)
            ctx.followUpChain = list(ctx.followUpChain or []) + [fq]
            ctx.lastQuestion = fq
            ctx.lastAiAnswer = str(fbody.get("answer") or "")[:2000]
            fa = fbody.get("analysis") or {}
            if fa.get("metricColumn"):
                ctx.metricColumn = fa.get("metricColumn")
            if fa.get("categoryColumn"):
                ctx.categoryColumn = fa.get("categoryColumn")
            time.sleep(0.15)


def main() -> None:
    import sys as _sys
    routing_only = "--routing-only" in _sys.argv
    specs = build_domain_specs()
    all_results: List[EvalResult] = []

    started = time.time()
    if routing_only:
        for domain, cfg in specs.items():
            path = FIXTURES / cfg["file"]
            df = pd.read_csv(path)
            m.df = df
            m.dataset_profile = m.build_profile(df)
            print(f"=== Domain: {domain} ===", flush=True)
            for spec in cfg["questions"]:
                _exact, viz, analysis = m.compute_visualization_for_question(spec.question)
                body = _routing_body(analysis, viz)
                all_results.append(evaluate_question(domain, spec, df, body))
            for chain in cfg["chains"]:
                _run_chain_routing(domain, chain, df, all_results)
            print(
                f"  completed {len([r for r in all_results if r.domain == domain])} evaluations",
                flush=True,
            )
    else:
        m.usage_tracker.reset()
        orig_check = m.usage_tracker.check_ai_question
        m.usage_tracker.check_ai_question = lambda sid, tier: (True, None)  # type: ignore
        client = TestClient(m.app)
        for domain, cfg in specs.items():
            print(f"=== Domain: {domain} ===", flush=True)
            run_domain(client, domain, cfg, all_results)
            print(
                f"  completed {len([r for r in all_results if r.domain == domain])} evaluations",
                flush=True,
            )
        m.usage_tracker.check_ai_question = orig_check  # type: ignore

    payload = {
        "executed_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "duration_sec": round(time.time() - started, 1),
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
    OUT_JSON.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(f"Wrote {OUT_JSON}", flush=True)


def _routing_body(analysis: Optional[Dict], viz: Optional[Dict]) -> Dict[str, Any]:
    parts: List[str] = []
    title = (analysis or {}).get("chartTitle") or (viz or {}).get("title") or ""
    if title:
        parts.append(str(title).strip() + ".")
    labels = (viz or {}).get("labels") or []
    values = (viz or {}).get("values") or []
    if labels and values:
        parts.append(f"{labels[0]} leads with {values[0]}.")
    ev = (analysis or {}).get("evidenceSummaryLine") or (analysis or {}).get(
        "insightConfidenceRationale"
    )
    if ev:
        parts.append(str(ev))
    for card in ((analysis or {}).get("rankedExecutiveInsights") or [])[:3]:
        t = card.get("title") or ""
        v = card.get("value") or ""
        if t:
            parts.append(f"{t}: {v}.")
    ug = (analysis or {}).get("unsupportedGrowthAnalysis") or {}
    if ug.get("active"):
        parts.append(str(ug.get("leadSentence") or ug.get("reason") or ""))
    if (analysis or {}).get("growthRequestUnsatisfied"):
        parts.append("This metric or view is not fully supported by the loaded dataset.")
    answer = " ".join(p for p in parts if p) or "Analysis complete for the requested view."
    return {"answer": answer, "visualization": viz, "analysis": analysis}


def _run_chain_routing(
    domain: str,
    chain: ChainSpec,
    df: pd.DataFrame,
    results: List[EvalResult],
) -> None:
    from main import ConversationContextPayload, resolve_follow_up_turn

    root_spec = chain.root
    _exact, viz, analysis = m.compute_visualization_for_question(root_spec.question)
    body = _routing_body(analysis, viz)
    ground = compute_ground(root_spec, df)
    entity = ground.get("top_entity") or "the top entity"
    results.append(evaluate_question(domain, root_spec, df, body))

    ctx = ConversationContextPayload(
        lastQuestion=root_spec.question,
        rootQuestion=root_spec.question,
        metricColumn=analysis.get("metricColumn"),
        categoryColumn=analysis.get("categoryColumn"),
        aggregation=analysis.get("aggregationLabel") or analysis.get("aggregationKey"),
        chartType=(viz or {}).get("chartType"),
        intentBucket=_intent(analysis),
        lastChartTitle=analysis.get("chartTitle") or "",
        followUpChain=[root_spec.question],
        lastAiAnswer=body["answer"][:2000],
        turnId="qa-root",
    )

    for i, tmpl in enumerate(chain.followups):
        fq = tmpl.replace("{ENTITY}", entity)
        plan = resolve_follow_up_turn(fq, ctx, continuation_intent=True)
        eff = str(plan.get("effective_question") or fq)
        _exact, fv, fa = m.compute_visualization_for_question(
            eff,
            conversation_sidecar=plan.get("conversation_sidecar"),
            follow_up_ops=plan.get("follow_up_ops"),
        )
        fbody = _routing_body(fa, fv)
        fu_spec = QuestionSpec(
            f"{chain.id}-F{i+1}",
            fq,
            "follow_up",
            root_spec.expect_intent,
            root_spec.expect_chart,
            root_spec.metric_hint,
            root_spec.dimension_hint,
        )
        results.append(
            evaluate_question(domain, fu_spec, df, fbody, plan=plan, is_follow_up=True)
        )
        ctx.followUpChain = list(ctx.followUpChain or []) + [fq]
        ctx.lastQuestion = fq


if __name__ == "__main__":
    main()
