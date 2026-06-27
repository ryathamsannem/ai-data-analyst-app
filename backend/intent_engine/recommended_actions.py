"""
Rule-based recommended next actions for AI Insights (Phase C).

Evidence-grounded drilldowns and validation steps — not causal recommendations.
"""

from __future__ import annotations

import re
from typing import Any, Dict, List, Optional, Sequence, Tuple

import pandas as pd

MAX_RECOMMENDED_ACTIONS = 3

MIN_TOP_SHARE = 30.0
MIN_TOP3_SHARE = 70.0
MIN_GAP_RATIO = 2.0
MIN_TREND_CHANGE = 5.0

ActionType = str  # drilldown | validation | risk_check | trend_check | comparison
Priority = str  # high | medium | low

_GAP_LAGGARD_RE = re.compile(
    r"\bis\s+[\d.]+\s*x\s+higher\s+than\s+(.+?)\s+on\b", re.I
)
_TOP3_CLAIM_RE = re.compile(r"\btop\s+3\b", re.I)


def _norm_col(name: str) -> str:
    return re.sub(r"[_\s]+", " ", str(name).lower()).strip()


def _pretty_label(name: str) -> str:
    return re.sub(r"\s+", " ", str(name or "").replace("_", " ")).strip()


def _id_like_column(name: str) -> bool:
    n = _norm_col(name)
    return n.endswith(" id") or n == "id" or "customer id" in n or "employee id" in n


def _make_action(
    *,
    action_type: ActionType,
    title: str,
    description: str,
    question: Optional[str],
    priority: Priority,
    reason: str,
    based_on: Sequence[str],
) -> Dict[str, Any]:
    return {
        "type": action_type,
        "title": title.strip(),
        "description": description.strip(),
        "question": question.strip() if question and question.strip() else None,
        "priority": priority,
        "reason": reason.strip(),
        "basedOn": [str(x).strip() for x in based_on if str(x).strip()],
    }


class _ActionCollector:
    def __init__(self) -> None:
        self._items: List[Dict[str, Any]] = []
        self._keys: set[str] = set()
        self._topics: Dict[str, int] = {}
        self._dimensions: set[str] = set()

    @staticmethod
    def _action_blob(action: Dict[str, Any]) -> str:
        return " ".join(
            str(action.get(k) or "")
            for k in ("title", "description", "question")
        ).lower()

    @staticmethod
    def _topic_key(blob: str) -> Optional[str]:
        if "product" in blob and "category" in blob:
            return "product_category"
        if "product" in blob and "type" in blob:
            return "product_type"
        if "customer segment" in blob or ("segment" in blob and "customer" in blob):
            return "customer_segment"
        if "marketing" in blob and "channel" in blob:
            return "marketing_channel"
        if "delinquency" in blob:
            return "delinquency"
        if "utilization" in blob:
            return "utilization"
        if "credit score" in blob:
            return "credit_score"
        if "trend" in blob and ("time" in blob or "month" in blob or "week" in blob):
            return "trend_stability"
        return None

    @staticmethod
    def _dimension_key(blob: str) -> Optional[str]:
        m = re.search(r"\bby\s+([a-z0-9][\w\s-]{1,40})", blob)
        if not m:
            return None
        return _norm_col(m.group(1))

    def add(self, action: Dict[str, Any]) -> None:
        key = str(action.get("title") or "").lower()
        if not key or key in self._keys:
            return
        blob = self._action_blob(action)
        topic = self._topic_key(blob)
        if topic in ("product_category", "product_type") and self._topics.get(topic, 0) >= 1:
            return
        dim = self._dimension_key(blob)
        if dim and dim in self._dimensions and topic not in ("validation", "risk_check"):
            return
        self._keys.add(key)
        if topic:
            self._topics[topic] = self._topics.get(topic, 0) + 1
        if dim:
            self._dimensions.add(dim)
        self._items.append(action)

    def take(self, limit: int = MAX_RECOMMENDED_ACTIONS) -> List[Dict[str, Any]]:
        order = {"high": 0, "medium": 1, "low": 2}
        ranked = sorted(
            self._items,
            key=lambda a: order.get(str(a.get("priority") or "medium"), 1),
        )
        return ranked[:limit]


def _evidence_from_blocks(
    blocks: Sequence[Dict[str, Any]],
) -> Dict[str, Any]:
    snap: Dict[str, Any] = {
        "claims": [],
        "top_share": None,
        "top_entity": None,
        "top3_share": None,
        "gap_ratio": None,
        "leader": None,
        "laggard": None,
        "trend_change_pct": None,
        "has_signal": False,
    }
    for b in blocks:
        if not isinstance(b, dict):
            continue
        claim = str(b.get("claim") or "").strip()
        if claim:
            snap["claims"].append(claim)
        btype = str(b.get("type") or "")
        if btype == "contribution":
            share = b.get("sharePct")
            try:
                share_f = float(share) if share is not None else None
            except (TypeError, ValueError):
                share_f = None
            if share_f is None:
                continue
            if b.get("entity") and (snap["top_share"] is None or share_f > snap["top_share"]):
                snap["top_share"] = share_f
                snap["top_entity"] = str(b.get("entity") or "").strip() or None
                snap["has_signal"] = True
            elif _TOP3_CLAIM_RE.search(claim):
                snap["top3_share"] = share_f
                snap["has_signal"] = True
        elif btype == "leader_laggard_gap":
            try:
                ratio = float(b.get("gapRatio")) if b.get("gapRatio") is not None else None
            except (TypeError, ValueError):
                ratio = None
            if ratio is not None:
                snap["gap_ratio"] = ratio
                snap["leader"] = str(b.get("entity") or "").strip() or None
                snap["has_signal"] = True
            m = _GAP_LAGGARD_RE.search(claim)
            if m:
                snap["laggard"] = m.group(1).strip()
        elif btype == "trend_movement":
            try:
                chg = float(b.get("sharePct")) if b.get("sharePct") is not None else None
            except (TypeError, ValueError):
                chg = None
            if chg is not None and abs(chg) >= MIN_TREND_CHANGE:
                snap["trend_change_pct"] = chg
                snap["has_signal"] = True
    return snap


def _detect_domain(
    cols: Sequence[str],
    metric_col: Optional[str],
) -> str:
    blob = " ".join(_norm_col(c) for c in cols) + " " + _norm_col(metric_col or "")
    if any(t in blob for t in ("loan balance", "delinquency", "utilization", "credit score")):
        return "banking"
    if any(t in blob for t in ("attrition", "engagement score", "job level", "department")):
        return "hr"
    if any(t in blob for t in ("sales amount", "product category", "customer segment", "profit")):
        return "retail"
    return "generic"


def _find_column(
    cols: Sequence[str],
    column_types: Dict[str, Any],
    *tokens: str,
    exclude: Optional[Sequence[str]] = None,
    kinds: Tuple[str, ...] = ("category", "text", "number", "date"),
) -> Optional[str]:
    ex = {_norm_col(x) for x in (exclude or [])}
    for c in cols:
        if _norm_col(c) in ex:
            continue
        nc = _norm_col(c)
        if column_types.get(c) not in kinds and column_types.get(c) is not None:
            if column_types.get(c) not in ("category", "text", "number", "date"):
                continue
        if any(t in nc for t in tokens):
            if _id_like_column(c) and not any(t in nc for t in ("segment", "category", "type")):
                continue
            return c
    return None


def _secondary_breakdown_cols(
    cols: Sequence[str],
    column_types: Dict[str, Any],
    category_col: Optional[str],
    domain: str,
) -> List[str]:
    priority_tokens: List[List[str]] = []
    if domain == "retail":
        priority_tokens = [
            ["customer", "segment"],
            ["marketing", "channel"],
            ["state"],
            ["city"],
            ["product", "category"],
            ["sub", "category"],
            ["campaign"],
            ["discount"],
            ["delivery"],
        ]
    elif domain == "hr":
        priority_tokens = [
            ["job", "level"],
            ["tenure"],
            ["engagement"],
            ["performance"],
            ["salary"],
            ["location"],
            ["manager"],
        ]
    elif domain == "banking":
        priority_tokens = [
            ["delinquency"],
            ["credit", "score"],
            ["utilization"],
            ["region"],
            ["city"],
            ["product", "type"],
        ]
    else:
        priority_tokens = [["segment"], ["category"], ["type"], ["region"]]

    out: List[str] = []
    for tokens in priority_tokens:
        c = _find_column(cols, column_types, *tokens, exclude=[category_col or ""])
        if c and c not in out:
            out.append(c)
    for c in cols:
        if c == category_col or c in out or _id_like_column(c):
            continue
        if column_types.get(c) in ("category", "text"):
            out.append(c)
        if len(out) >= 5:
            break
    return out


def _pick_breakdown_col(
    secondaries: Sequence[str],
    used: set[str],
    *,
    prefer_tokens: Optional[Sequence[str]] = None,
    skip_tokens: Optional[Sequence[str]] = None,
) -> Optional[str]:
    """Pick the next unused breakdown column, preferring investigative diversity."""
    prefer = tuple(prefer_tokens or ())
    skip = tuple(skip_tokens or ())

    def _matches(c: str, tokens: Sequence[str]) -> bool:
        nc = _norm_col(c)
        return any(t in nc for t in tokens)

    for c in secondaries:
        key = _norm_col(c)
        if key in used:
            continue
        if skip and _matches(c, skip):
            continue
        if prefer and not _matches(c, prefer):
            continue
        used.add(key)
        return c

    for c in secondaries:
        key = _norm_col(c)
        if key in used:
            continue
        if skip and _matches(c, skip):
            continue
        used.add(key)
        return c
    return None


def _metric_is_attrition_count(metric_col: Optional[str], metric_label: str) -> bool:
    blob = _norm_col(metric_col or "") + " " + _norm_col(metric_label)
    return "attrition" in blob and "rate" not in blob


def build_recommended_actions(
    analysis_ctx: Dict[str, Any],
    reasoning_blocks: Sequence[Dict[str, Any]],
    df: Optional[pd.DataFrame] = None,
    profile: Optional[Dict[str, Any]] = None,
    *,
    question: str = "",
) -> List[Dict[str, Any]]:
    blocks = [b for b in reasoning_blocks if isinstance(b, dict)]
    if not blocks:
        return []

    evidence = _evidence_from_blocks(blocks)
    if not evidence.get("has_signal"):
        return []

    metric_col = str(analysis_ctx.get("metricColumn") or "").strip() or None
    category_col = str(analysis_ctx.get("categoryColumn") or "").strip() or None
    metric_label = str(
        analysis_ctx.get("metricColumnDisplay")
        or analysis_ctx.get("metricColumn")
        or "value"
    ).replace("_", " ")
    dimension_label = str(
        analysis_ctx.get("categoryColumnDisplay")
        or analysis_ctx.get("categoryColumn")
        or "category"
    ).replace("_", " ")

    cols: List[str] = []
    column_types: Dict[str, Any] = {}
    if df is not None and not df.empty:
        cols = [str(c) for c in df.columns.tolist()]
    if profile and isinstance(profile.get("column_types"), dict):
        column_types = profile["column_types"]

    domain = _detect_domain(cols, metric_col)
    entity = evidence.get("top_entity") or evidence.get("leader")
    leader = evidence.get("leader") or evidence.get("top_entity")
    laggard = evidence.get("laggard")
    based_claims = list(evidence.get("claims") or [])[:3]

    collector = _ActionCollector()
    secondaries = _secondary_breakdown_cols(cols, column_types, category_col, domain)
    used_breakdown_dims: set[str] = set()

    top_share = evidence.get("top_share")
    top3_share = evidence.get("top3_share")
    gap_ratio = evidence.get("gap_ratio")
    trend_chg = evidence.get("trend_change_pct")

    skip_generic_breakdowns = domain == "banking" and metric_col and (
        "loan" in _norm_col(metric_col) or "utilization" in _norm_col(metric_col)
    )

    # --- HR domain (before generic so rate validation wins slots) ---
    if domain == "hr" and _metric_is_attrition_count(metric_col, metric_label):
        collector.add(
            _make_action(
                action_type="validation",
                title="Calculate attrition rate by department",
                description=(
                    "Current view sums attrition counts — calculate attrition rate using "
                    "employee headcount as the denominator before comparing departments."
                ),
                question="Which department has the highest attrition rate?",
                priority="high",
                reason="Attrition count ranking may differ from rate per headcount.",
                based_on=based_claims[:1],
            )
        )
        for tokens, label in (
            (["job", "level"], "job level"),
            (["engagement"], "engagement score"),
            (["performance"], "performance rating"),
            (["salary"], "salary"),
        ):
            c = _find_column(cols, column_types, *tokens, exclude=[category_col or ""])
            if not c:
                continue
            dept = leader or entity or "high-attrition departments"
            collector.add(
                _make_action(
                    action_type="comparison",
                    title=f"Compare {dept} by {label}",
                    description=(
                        f"Review {_pretty_label(c).lower()} within {dept} alongside other "
                        "departments to see whether workforce signals differ."
                    ),
                    question=f"Compare attrition by {_pretty_label(c).lower()}.",
                    priority="medium",
                    reason="HR drilldown on available workforce columns.",
                    based_on=based_claims[:1],
                )
            )
            break

    # --- Banking domain (before generic so risk/customer checks win slots) ---
    if domain == "banking" and metric_col and "loan" in _norm_col(metric_col):
        if _find_column(cols, column_types, "customer", "id") or _find_column(
            cols, column_types, "customer"
        ):
            collector.add(
                _make_action(
                    action_type="validation",
                    title="Compare average loan balance per customer",
                    description=(
                        f"Separate customer volume from loan size — compare average "
                        f"{_pretty_label(metric_label).lower()} per customer by segment."
                    ),
                    question=(
                        "Which customer segment has the highest average loan balance per customer?"
                    ),
                    priority="high",
                    reason="Concentration may reflect fewer large loans vs many customers.",
                    based_on=based_claims[:1],
                )
            )
        if _find_column(cols, column_types, "delinquency"):
            collector.add(
                _make_action(
                    action_type="risk_check",
                    title="Review delinquency by customer segment",
                    description=(
                        "Before treating loan concentration as healthy growth, check "
                        "delinquency rates across segments."
                    ),
                    question="Show delinquency by customer segment.",
                    priority="high",
                    reason="Loan concentration warrants risk validation.",
                    based_on=based_claims[:1],
                )
            )
        pt = _find_column(cols, column_types, "product", "type")
        if pt and entity:
            collector.add(
                _make_action(
                    action_type="drilldown",
                    title=f"Break down {entity} loan balance by product type",
                    description=(
                        f"See which products contribute most to {entity}'s "
                        f"{_pretty_label(metric_label).lower()}."
                    ),
                    question=f"Compare {entity} loan balance by product type.",
                    priority="medium",
                    reason="Product mix explains segment-level loan totals.",
                    based_on=based_claims[:1],
                )
            )

    if domain == "banking" and metric_col and "utilization" in _norm_col(metric_col):
        if _find_column(cols, column_types, "delinquency"):
            collector.add(
                _make_action(
                    action_type="risk_check",
                    title="Check delinquency alongside utilization",
                    description=(
                        "High utilization may coincide with repayment stress — compare "
                        "delinquency and credit score by segment."
                    ),
                    question="Show delinquency by customer segment.",
                    priority="medium",
                    reason="Utilization trends benefit from risk cross-checks.",
                    based_on=based_claims[:1],
                )
            )

    prefer_generic = (
        ("segment", "channel", "state", "city")
        if domain == "retail"
        else ("delinquency", "credit", "utilization", "product", "type", "region")
        if domain == "banking"
        else ("segment", "channel", "state", "city")
    )

    # --- Contribution / concentration ---
    if (
        not skip_generic_breakdowns
        and top_share is not None
        and top_share >= MIN_TOP_SHARE
        and entity
        and secondaries
    ):
        brk_col = _pick_breakdown_col(
            secondaries,
            used_breakdown_dims,
            prefer_tokens=prefer_generic,
        )
        if brk_col:
            brk = _pretty_label(brk_col)
            collector.add(
                _make_action(
                    action_type="drilldown",
                    title=f"Break down {entity} by {brk.lower()}",
                    description=(
                        f"{entity} represents a large share of {_pretty_label(metric_label).lower()}; "
                        f"compare {brk.lower()} within {entity} to see what drives the lead."
                    ),
                    question=f"Compare {entity} by {brk.lower()}.",
                    priority="high" if top_share >= 40 else "medium",
                    reason="Top-group share exceeds 30% in the current chart.",
                    based_on=based_claims[:1],
                )
            )

    if top3_share is not None and top3_share >= MIN_TOP3_SHARE:
        collector.add(
            _make_action(
                action_type="validation",
                title="Validate concentration across groups",
                description=(
                    f"The top 3 {_pretty_label(dimension_label).lower()}s account for "
                    f"{round(top3_share)}% of {_pretty_label(metric_label).lower()} — "
                    "check whether reliance on a few groups is expected or worth monitoring."
                ),
                question=(
                    f"Which {_pretty_label(dimension_label).lower()} contributes most "
                    f"to total {_pretty_label(metric_label).lower()}?"
                ),
                priority="high",
                reason="Top-3 concentration exceeds 70%.",
                based_on=[c for c in based_claims if _TOP3_CLAIM_RE.search(c)][:1]
                or based_claims[:1],
            )
        )

    # --- Leader / laggard gap ---
    if (
        not skip_generic_breakdowns
        and gap_ratio is not None
        and gap_ratio >= MIN_GAP_RATIO
        and leader
        and laggard
    ):
        if secondaries:
            brk_col = _pick_breakdown_col(
                secondaries,
                used_breakdown_dims,
                prefer_tokens=prefer_generic,
                skip_tokens=("product", "category") if domain == "retail" else (),
            ) or _pick_breakdown_col(secondaries, used_breakdown_dims)
            if brk_col:
                brk = _pretty_label(brk_col)
                collector.add(
                    _make_action(
                        action_type="comparison",
                        title=f"Compare {leader} vs {laggard} by {brk.lower()}",
                        description=(
                            f"The gap between {leader} and {laggard} is {gap_ratio:.1f}x on "
                            f"{_pretty_label(metric_label).lower()} — compare both by {brk.lower()} "
                            "to see where the spread comes from."
                        ),
                        question=f"Compare {leader} and {laggard} by {brk.lower()}.",
                        priority="high",
                        reason="Leader/laggard gap ratio exceeds 2x.",
                        based_on=[
                            c for c in based_claims if "x higher than" in c.lower()
                        ][:1]
                        or based_claims[:1],
                    )
                )

    # --- Trend movement ---
    if trend_chg is not None and abs(trend_chg) >= MIN_TREND_CHANGE:
        brk_col = category_col
        for c in secondaries:
            if c != category_col:
                brk_col = c
                break
        brk = _pretty_label(brk_col or dimension_label)
        direction = "increase" if trend_chg > 0 else "decrease"
        collector.add(
            _make_action(
                action_type="trend_check",
                title=f"Check recent {direction} by {brk.lower()}",
                description=(
                    f"Latest period moved {abs(trend_chg):.0f}% vs the prior period — "
                    f"split the trend by {brk.lower()} to see which groups moved most."
                ),
                question=(
                    f"Show {_pretty_label(metric_label).lower()} trend by {brk.lower()}."
                ),
                priority="medium",
                reason="Latest period change exceeds 5%.",
                based_on=[
                    c for c in based_claims if "latest period" in c.lower()
                ][:1]
                or based_claims[:1],
            )
        )

    # --- Retail domain extras ---
    if domain == "retail" and entity and len(secondaries) > 1:
        brk_col = _pick_breakdown_col(
            secondaries,
            used_breakdown_dims,
            prefer_tokens=("product", "category"),
        )
        if brk_col:
            brk2 = _pretty_label(brk_col)
            collector.add(
                _make_action(
                    action_type="drilldown",
                    title=f"Review {entity} by {brk2.lower()}",
                    description=(
                        f"Cross-check regional concentration by {brk2.lower()} to find mix "
                        "differences beyond total sales."
                    ),
                    question=f"Compare {entity} by {brk2.lower()}.",
                    priority="medium",
                    reason="Secondary retail breakdown available in schema.",
                    based_on=based_claims[:1],
                )
            )

    date_col = _find_column(
        cols,
        column_types,
        "order",
        "date",
        exclude=[category_col or ""],
        kinds=("date",),
    ) or _find_column(cols, column_types, "month", kinds=("date", "category", "text"))
    if domain == "retail" and entity and date_col and top_share and top_share >= MIN_TOP_SHARE:
        collector.add(
            _make_action(
                action_type="trend_check",
                title=f"Check whether {entity}'s lead is stable over time",
                description=(
                    f"Review {_pretty_label(metric_label).lower()} trend for {entity} "
                    "to see if the lead is recent or sustained."
                ),
                question=f"Show {_pretty_label(metric_label).lower()} trend for {entity} by {_pretty_label(date_col).lower()}.",
                priority="low",
                reason="Regional leads should be validated over time.",
                based_on=based_claims[:1],
            )
        )

    return collector.take(MAX_RECOMMENDED_ACTIONS)


def attach_recommended_actions_to_analysis(
    analysis_ctx: Dict[str, Any],
    *,
    df: Optional[pd.DataFrame] = None,
    profile: Optional[Dict[str, Any]] = None,
    question: str = "",
) -> None:
    """Mutates analysis_ctx — adds recommendedActions when evidence supports them."""
    if analysis_ctx is None or not isinstance(analysis_ctx, dict):
        return
    ct = str(analysis_ctx.get("chartTypeInternal") or "").lower()
    if ct == "scatter":
        analysis_ctx["recommendedActions"] = []
        return

    blocks = analysis_ctx.get("reasoningBlocks")
    if not isinstance(blocks, list) or not blocks:
        analysis_ctx["recommendedActions"] = []
        return

    actions = build_recommended_actions(
        analysis_ctx,
        blocks,
        df=df,
        profile=profile,
        question=question,
    )
    analysis_ctx["recommendedActions"] = actions


def recommended_actions_prompt_block(actions: Sequence[Dict[str, Any]]) -> str:
    """Grounded next-step suggestions for Claude narrative."""
    if not actions:
        return ""
    lines = [
        "Recommended next actions (authoritative — use only for Suggested next steps):",
        "- These are evidence-grounded next analyses, not guaranteed fixes.",
        "- Do not invent additional actions beyond this list.",
        "- Do not present actions as proven root causes or certain outcomes.",
        "- Prefer paraphrasing; you may use 1–2 items in Suggested next steps.",
    ]
    for i, a in enumerate(actions[:MAX_RECOMMENDED_ACTIONS], start=1):
        if not isinstance(a, dict):
            continue
        title = str(a.get("title") or "").strip()
        desc = str(a.get("description") or "").strip()
        if not title:
            continue
        lines.append(f"{i}. {title}")
        if desc:
            lines.append(f"   Why: {desc}")
        q = a.get("question")
        if isinstance(q, str) and q.strip():
            lines.append(f"   Ask: {q.strip()}")
    return "\n".join(lines)
