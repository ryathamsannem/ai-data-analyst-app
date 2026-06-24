"""Narrative prompt assembly and phase=narrative handler for /ask."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List, Optional, TYPE_CHECKING

import pandas as pd
from fastapi import HTTPException, Request

from services.ask_turn_cache import AskTurnCacheEntry, ask_turn_cache

if TYPE_CHECKING:
    from main import QuestionRequest


@dataclass
class AskNarrativeAssembly:
    prompt: str
    executive_narrative: bool
    unsupported_requested_metric: Optional[Dict[str, Any]]


def _main():
    import main as m

    return m


def build_ask_narrative_prompt(
    *,
    question: str,
    eff_q: str,
    exact_result: str,
    visualization: Optional[Dict[str, Any]],
    analysis_ctx: Dict[str, Any],
    plan: Dict[str, Any],
    sidecar: Optional[Dict[str, Any]],
    dash_labs: List[str],
    df: pd.DataFrame,
    dataset_profile: Any,
) -> tuple[AskNarrativeAssembly, str]:
    """Build the Claude user prompt; returns assembly and possibly-updated exact_result."""
    m = _main()
    re = __import__("re")

    viz_anchor = ""
    viz_rule = ""
    if visualization:
        ctype = visualization.get("chartType", "")
        npts = len(visualization.get("labels", []))
        viz_anchor = (
            "\nChart values generated from pandas (AUTHORITATIVE for prose — cite these amounts exactly):\n"
            + m.build_visualization_anchor_for_prompt(visualization)
            + "\n"
        )
        viz_rule = (
            f"A {ctype} visualization with {npts} points accompanies this reply. "
            "Your explanation MUST use ONLY the labeled amounts in the authoritative chart-values block above "
            "(same rounding string). Do not recalculate totals or averages from prose.\n"
        )

    trend_rule = ""
    if visualization and visualization.get("chartType") in ("line", "area"):
        trend_rule = "- Focus on the trajectory over periods shown in the calculated result.\n"

    focus_line = ""
    is_rel_viz = (
        visualization
        and str(visualization.get("chartType") or "").lower() == "scatter"
    )
    if is_rel_viz:
        x_lab = m._title_case_words(
            str(visualization.get("scatterXLabel") or analysis_ctx.get("categoryColumn") or "")
        )
        y_lab = m._title_case_words(
            str(visualization.get("scatterYLabel") or analysis_ctx.get("metricColumn") or "")
        )
        rel_ml = (
            visualization.get("relationshipMeasureLabel")
            or m._relationship_measure_label(
                str(analysis_ctx.get("categoryColumn") or ""),
                str(analysis_ctx.get("metricColumn") or ""),
            )
        )
        focus_line = (
            "\nDetected question focus (relationship / correlation scatter):\n"
            f"- X-axis metric: {x_lab}\n"
            f"- Y-axis metric: {y_lab}\n"
            f"- Relationship label (use in prose): {rel_ml}\n"
            "- Do not cite row numbers, Point N, or internal point labels.\n"
        )
    elif analysis_ctx.get("metricColumn"):
        m_disp_line = ""
        m_disp = analysis_ctx.get("metricColumnDisplay")
        if isinstance(m_disp, str) and m_disp.strip():
            m_disp_line = f"- Metric label (use in prose): {m_disp.strip()}\n"
        focus_line = (
            "\nDetected question focus (do not substitute a different metric or column):\n"
            f"- Metric column: {analysis_ctx.get('metricColumn')}\n"
            f"{m_disp_line}"
            f"- Breakdown dimension: {analysis_ctx.get('categoryColumn')}\n"
            f"- Aggregation: {analysis_ctx.get('aggregation')} ({analysis_ctx.get('aggregationKey')})\n"
            "- When stating totals, averages, or counts, use the metric label above — "
            "do not drop the aggregation word (Total, Average, Count, etc.).\n"
        )
        sec_g = analysis_ctx.get("secondaryGroupColumn")
        if sec_g:
            focus_line += f"- Secondary breakdown dimension: {sec_g}\n"
        if analysis_ctx.get("dualMetricCompare"):
            cm = analysis_ctx.get("compareMetrics")
            sec_m = analysis_ctx.get("secondaryMetricColumn")
            if isinstance(cm, list) and len(cm) >= 2:
                focus_line += (
                    "- Dual-metric comparison (mandatory): discuss BOTH metrics — "
                    f"{m._pretty_label_text(str(cm[0]))} AND "
                    f"{m._pretty_label_text(str(cm[1]))} — for each relevant category "
                    "using the authoritative chart-values block. Do not focus on only "
                    "one metric.\n"
                )
            elif sec_m:
                focus_line += (
                    "- Dual-metric comparison: include both the primary metric and "
                    f"{m._pretty_label_text(str(sec_m))} in your answer.\n"
                )
        entity_col = analysis_ctx.get("entityFilterColumn")
        entity_val = analysis_ctx.get("entityFilterValue")
        explain_mode = str(analysis_ctx.get("entityExplainMode") or "").strip().lower()
        if entity_col and entity_val:
            entity_col_lbl = m._pretty_label_text(str(entity_col))
            focus_line += (
                f"\nEntity focus (mandatory):\n"
                f"- Focused entity: {entity_val} ({entity_col_lbl})\n"
            )
            if explain_mode == "peer_compare":
                focus_line += (
                    "- Compare this entity against peer "
                    f"{entity_col_lbl.lower()}s using the chart values. "
                    "Do not claim the entity cannot be isolated — it is highlighted in the chart.\n"
                    "- Do not answer with a global product-only ranking across all rows.\n"
                )
            else:
                focus_line += (
                    "- Break down performance within this entity cohort using the chart breakdown dimension.\n"
                    "- Do not answer with a global ranking that ignores the focused entity.\n"
                )

    conv_block = plan.get("ai_context_block") or ""
    if sidecar and isinstance(sidecar.get("contextUsedLine"), str):
        conv_block = (
            f"{conv_block}\nContext used (for your reasoning — user-visible in the app):\n"
            f"{sidecar.get('contextUsedLine')}\n"
        ).strip()
    if dash_labs:
        conv_block = (
            f"{conv_block}\nActive dashboard filters (row subset):\n"
            + "\n".join(f"- {ln}" for ln in dash_labs)
        ).strip()

    ctx = m.get_ai_context(sample_rows=10, question=eff_q or question)
    evidence_line = ""
    esl = analysis_ctx.get("evidenceSummaryLine")
    if isinstance(esl, str) and esl.strip():
        evidence_line = f"\nEvidence scope (use verbatim when discussing sample size):\n{esl.strip()}\n"
    rationale_line = ""
    icr = analysis_ctx.get("insightConfidenceRationale")
    if isinstance(icr, str) and icr.strip():
        rationale_line = f"\nHeuristic confidence note: {icr.strip()}\n"

    unsupported_requested_metric: Optional[Dict[str, Any]] = None
    guard_block = ""
    concentration_risk_question = False
    try:
        from intent_engine.narrative_guardrails import (
            assess_unsupported_requested_metric,
            build_unsupported_requested_metric_context,
            narrative_guardrails_prompt_block,
        )

        unsupported_requested_metric = assess_unsupported_requested_metric(
            question=question,
            df=df,
            profile=dataset_profile,
            analysis_ctx=analysis_ctx,
        )
        concentration_risk_question = bool(
            str(analysis_ctx.get("executiveAmbiguousBucket") or "")
            in ("executive_risk", "executive_strategy")
            or re.search(
                r"\b(risk|concentrat|dependency|portfolio|exposure)\b",
                str(question or ""),
                re.I,
            )
        )
        guard_block = narrative_guardrails_prompt_block(
            question=question,
            df=df,
            profile=dataset_profile,
            analysis_ctx=analysis_ctx,
            unsupported_requested=unsupported_requested_metric,
        )
        if guard_block:
            guard_block = f"\n{guard_block}\n"
        if (
            unsupported_requested_metric
            and unsupported_requested_metric.get("active")
        ):
            lim_ctx = build_unsupported_requested_metric_context(
                unsupported_requested_metric
            )
            exact_result = f"{lim_ctx}\n\n{exact_result}".strip()
    except Exception:
        pass

    polish_block = ""
    executive_narrative = False
    try:
        from intent_engine.narrative_polish import (
            executive_narrative_prompt_block,
            follow_up_narrative_prompt_block,
            is_executive_narrative_question,
        )

        executive_narrative = is_executive_narrative_question(question, analysis_ctx)
        exec_polish = executive_narrative_prompt_block(question, analysis_ctx)
        fu_polish = follow_up_narrative_prompt_block(
            question,
            sidecar=sidecar if isinstance(sidecar, dict) else None,
            analysis_ctx=analysis_ctx,
        )
        parts = [p for p in (exec_polish, fu_polish) if p]
        if parts:
            polish_block = "\n\n" + "\n\n".join(parts) + "\n"
    except Exception:
        pass

    conf_prompt = m._confidence_answer_prompt_block(
        {
            "analysisRowCount": int(analysis_ctx.get("analysisRowCount") or 0),
            "chartSeriesPointCount": int(
                analysis_ctx.get("chartSeriesPointCount")
                or analysis_ctx.get("chartPointCount")
                or 0
            ),
            "smallSampleCohort": bool(analysis_ctx.get("smallSampleCohort")),
            "cautiousNarrativeRequired": bool(
                analysis_ctx.get("cautiousNarrativeRequired")
            ),
            "mappingConfidenceLevel": analysis_ctx.get("mappingConfidenceLevel"),
            "insightConfidenceLevel": str(
                analysis_ctx.get("insightConfidenceLevel") or "low"
            ),
            "growthRequestUnsatisfied": bool(
                analysis_ctx.get("growthRequestUnsatisfied")
                or (
                    isinstance(analysis_ctx.get("unsupportedGrowthAnalysis"), dict)
                    and analysis_ctx["unsupportedGrowthAnalysis"].get("active")
                )
            ),
            "multiMetricRequestUnsatisfied": bool(
                analysis_ctx.get("multiMetricRequestUnsatisfied")
                or (
                    isinstance(
                        analysis_ctx.get("unsupportedMultiMetricAnalysis"), dict
                    )
                    and analysis_ctx["unsupportedMultiMetricAnalysis"].get("active")
                )
            ),
            "unsupportedRequestedMetric": bool(
                unsupported_requested_metric
                and unsupported_requested_metric.get("active")
            ),
            "concentrationRiskQuestion": concentration_risk_question,
            "executiveAmbiguousBucket": analysis_ctx.get("executiveAmbiguousBucket"),
            "executiveNarrative": executive_narrative,
            "relationshipScatter": bool(
                str(analysis_ctx.get("chartTypeInternal") or "").lower() == "scatter"
                or (
                    isinstance(analysis_ctx.get("intent"), dict)
                    and (analysis_ctx.get("intent") or {}).get("primaryGoal")
                    == "relationship"
                )
            ),
            "derivedProfitMargin": bool(analysis_ctx.get("derivedProfitMargin")),
            "profitMarginUnavailable": bool(
                analysis_ctx.get("profitMarginUnavailable")
            ),
            "forecastProjectionLow": bool(
                isinstance(analysis_ctx.get("forecastGuardrails"), dict)
                and analysis_ctx["forecastGuardrails"].get("active")
                and not analysis_ctx["forecastGuardrails"].get("canForecast")
            ),
        }
    )
    geo_block = ""
    try:
        from intent_engine.geographic_scope import geographic_scope_prompt_block

        gcol_geo = None
        if isinstance(analysis_ctx, dict):
            intent_geo = analysis_ctx.get("intent") or {}
            gcol_geo = (
                analysis_ctx.get("categoryColumn")
                or intent_geo.get("geographic_scope_column")
                or intent_geo.get("group_col")
            )
        geo_block = geographic_scope_prompt_block(
            question, gcol_geo, dataset_profile
        )
        if geo_block:
            geo_block = f"\n{geo_block}\n"
    except Exception:
        pass

    outlier_block = ""
    try:
        from intent_engine.categorical_outlier_narrative import (
            categorical_outlier_prompt_block,
        )

        coi_prompt = None
        if visualization and isinstance(
            visualization.get("categoricalOutlierInsights"), dict
        ):
            coi_prompt = visualization["categoricalOutlierInsights"]
        elif isinstance(analysis_ctx.get("categoricalOutlierInsights"), dict):
            coi_prompt = analysis_ctx["categoricalOutlierInsights"]
        outlier_block = categorical_outlier_prompt_block(coi_prompt)
        if outlier_block:
            outlier_block = f"\n{outlier_block}\n"
    except Exception:
        pass

    forecast_block = ""
    try:
        from intent_engine.forecast_guardrails import forecast_guardrails_prompt_block

        fg = analysis_ctx.get("forecastGuardrails")
        forecast_block = forecast_guardrails_prompt_block(
            fg if isinstance(fg, dict) else None
        )
        if forecast_block:
            forecast_block = f"\n{forecast_block}\n"
    except Exception:
        pass

    exec_rank_block = ""
    try:
        from intent_engine.executive_insight_ranking import executive_insight_prompt_block

        ranked_raw = None
        if visualization and isinstance(
            visualization.get("rankedExecutiveInsights"), list
        ):
            ranked_raw = visualization["rankedExecutiveInsights"]
        elif isinstance(analysis_ctx.get("rankedExecutiveInsights"), list):
            ranked_raw = analysis_ctx["rankedExecutiveInsights"]
        exec_rank_block = executive_insight_prompt_block(
            ranked_raw or [],
            cohort_row_count=int(analysis_ctx.get("analysisRowCount") or 0) or None,
            executive_lens=analysis_ctx.get("executiveLens"),
        )
        if exec_rank_block:
            exec_rank_block = f"\n{exec_rank_block}\n"
    except Exception:
        pass

    why_followup_block = ""
    why_followup_active = False
    why_ctx = analysis_ctx.get("whyFollowupContext")
    if isinstance(why_ctx, dict) and why_ctx.get("type") == "why_followup":
        why_followup_active = True
        try:
            from intent_engine.why_followup_reasoning import why_followup_prompt_block

            why_followup_block = why_followup_prompt_block(why_ctx)
            if why_followup_block:
                why_followup_block = f"\n{why_followup_block}\n"
        except Exception:
            pass

    reasoning_block = ""
    if not why_followup_active:
        try:
            from intent_engine.reasoning_blocks import reasoning_blocks_prompt_block

            rb_raw = analysis_ctx.get("reasoningBlocks")
            if isinstance(rb_raw, list) and rb_raw:
                reasoning_block = reasoning_blocks_prompt_block(rb_raw)
                if reasoning_block:
                    reasoning_block = f"\n{reasoning_block}\n"
        except Exception:
            pass

    semantic_correction = m._semantic_intent_correction_prompt_block(question)
    needs_cautious = bool(
        analysis_ctx.get("cautiousNarrativeRequired")
        or analysis_ctx.get("smallSampleCohort")
    )
    insight_style_line = (
        "- Favor cautious, exploratory language over definitive business claims; "
        "lead with what the numbers show, then what they may suggest.\n"
        if needs_cautious
        else "- Mention a clear, evidence-backed takeaway if the numbers support it.\n"
    )

    prompt = f"""
You are a business data analyst for small and medium businesses.

{conv_block}

User question:
{question}

Dataset context (use this, do not invent columns):
{ctx}

Exact calculated result (ground truth metrics / table):
{exact_result}
{why_followup_block}{focus_line}
{geo_block}
{outlier_block}
{forecast_block}
{exec_rank_block}
{reasoning_block}
{guard_block}
{polish_block}
{viz_anchor}
{evidence_line}{rationale_line}
Rules:
{viz_rule}- Explain in simple business language.
- Do not use markdown symbols like # or **.
- Keep the answer concise but complete enough to include the three labeled sections when asked below.
{insight_style_line}
{conf_prompt}
{semantic_correction}
{trend_rule}"""

    return (
        AskNarrativeAssembly(
            prompt=prompt,
            executive_narrative=executive_narrative,
            unsupported_requested_metric=unsupported_requested_metric,
        ),
        exact_result,
    )


def produce_ask_narrative_answer(
    assembly: AskNarrativeAssembly,
    *,
    question: str,
    analysis_ctx: Dict[str, Any],
    sidecar: Optional[Dict[str, Any]],
    df: pd.DataFrame,
    dataset_profile: Any,
) -> str:
    m = _main()
    try:
        answer_text = m._generate_insight_narrative(assembly.prompt)
        try:
            from intent_engine.narrative_guardrails import sanitize_narrative_answer
            from intent_engine.narrative_polish import polish_narrative_answer

            answer_text = sanitize_narrative_answer(
                answer_text,
                df,
                dataset_profile,
                question,
                assembly.unsupported_requested_metric,
                analysis_ctx,
            )
            answer_text = polish_narrative_answer(
                answer_text,
                question=question,
                analysis_ctx=analysis_ctx,
                sidecar=sidecar if isinstance(sidecar, dict) else None,
                executive=assembly.executive_narrative,
                df=df,
                profile=dataset_profile,
            )
        except Exception:
            pass
        return answer_text
    except Exception as exc:
        m.logger.warning("Claude narrative unavailable: %s", exc, exc_info=True)
        return m._claude_narrative_fallback_answer(exc)


def question_request_from_snapshot(snap: Dict[str, Any]) -> QuestionRequest:
    m = _main()
    conv = snap.get("conversation_context")
    parent = snap.get("parent_analysis_context")
    filters = snap.get("dashboard_filters") or []
    dr = snap.get("date_range")
    return m.QuestionRequest(
        question=str(snap.get("question") or ""),
        conversation_context=(
            m.ConversationContextPayload(**conv) if isinstance(conv, dict) else None
        ),
        parent_analysis_context=(
            m.ParentAnalysisContextPayload(**parent)
            if isinstance(parent, dict)
            else None
        ),
        continuation_intent=bool(snap.get("continuation_intent")),
        dashboard_filters=[
            m.DashboardFilterEntryModel(**f) for f in filters if isinstance(f, dict)
        ],
        date_range=m.DashboardDateRangeModel(**dr) if isinstance(dr, dict) else None,
    )


def restore_ask_cohort_df_from_cache(
    cached: AskTurnCacheEntry, source_df: pd.DataFrame
) -> pd.DataFrame:
    m = _main()
    snap = cached.request_snapshot
    filters = [
        m.DashboardFilterEntryModel(**f)
        for f in (snap.get("dashboard_filters") or [])
        if isinstance(f, dict)
    ]
    dr_raw = snap.get("date_range")
    date_range = (
        m.DashboardDateRangeModel(**dr_raw) if isinstance(dr_raw, dict) else None
    )
    dash_slice, _ = m.apply_dashboard_filters_to_df(source_df, filters, date_range)
    conv_raw = snap.get("conversation_context")
    if cached.filter_added and isinstance(conv_raw, dict):
        profile_dash = m.build_profile(dash_slice)
        conv = m.ConversationContextPayload(**conv_raw)
        fd_follow, _ = m._try_build_follow_up_filtered_df(
            dash_slice,
            profile_dash,
            conv,
            str(snap.get("question") or cached.question).strip(),
        )
        if fd_follow is not None and not fd_follow.empty:
            return fd_follow
    return dash_slice


def handle_ask_narrative_phase(
    data: QuestionRequest, request: Request, session_id: str
) -> Dict[str, Any]:
    m = _main()
    turn_id = str(data.turn_id or "").strip()
    if not turn_id:
        raise HTTPException(
            status_code=422,
            detail={
                "code": "turn_id_required",
                "message": "turn_id is required when phase is narrative.",
            },
        )

    cached = ask_turn_cache.get(session_id, turn_id)
    if cached is None:
        raise HTTPException(
            status_code=410,
            detail={
                "code": "ask_turn_not_found",
                "message": (
                    "Ask turn expired or not found for this session. "
                    "Request the chart phase again."
                ),
            },
        )

    saved_df = m.df
    saved_prof = m.dataset_profile
    try:
        cohort_df = restore_ask_cohort_df_from_cache(cached, saved_df)
        m.df = cohort_df
        m.dataset_profile = cached.analysis_profile or m.build_profile(cohort_df)

        plan = dict(cached.plan_snapshot)
        sidecar = cached.sidecar
        question = cached.question
        eff_q = cached.effective_question
        exact_result = cached.exact_result
        visualization = cached.visualization
        analysis_ctx = cached.analysis_ctx

        assembly, _ = build_ask_narrative_prompt(
            question=question,
            eff_q=eff_q,
            exact_result=exact_result,
            visualization=visualization,
            analysis_ctx=analysis_ctx,
            plan=plan,
            sidecar=sidecar,
            dash_labs=list(cached.dash_labs),
            df=cohort_df,
            dataset_profile=m.dataset_profile,
        )
        answer_text = produce_ask_narrative_answer(
            assembly,
            question=question,
            analysis_ctx=analysis_ctx,
            sidecar=sidecar,
            df=cohort_df,
            dataset_profile=m.dataset_profile,
        )

        req_data = question_request_from_snapshot(cached.request_snapshot)
        conv_out = m._build_ask_conversation_out(
            plan=plan,
            data=req_data,
            eff_q=eff_q,
            analysis_ctx=analysis_ctx,
            visualization=visualization,
            prev_filters=list(cached.prev_filters),
            filter_added=list(cached.filter_added),
            turn_id_session=turn_id,
            follow_chain_session=list(cached.follow_chain_session),
            lic_id_session=cached.lic_id_session,
            drill_path_session=list(cached.drill_path_session),
        )
        conv_payload = req_data.conversation_context
        conversation_meta_ok = m._conversation_meta_payload(
            sidecar=sidecar,
            filter_added=list(cached.filter_added),
            turn_id=turn_id,
            parent_tid=cached.parent_turn_id,
            using_summary=(
                m._format_using_context_summary(conv_payload)
                if cached.is_follow_up and conv_payload
                else ""
            ),
            is_follow_up=cached.is_follow_up,
        )

        return m._json_safe(
            {
                "answer": answer_text,
                "conversation_context": conv_out,
                "conversation_meta": conversation_meta_ok,
                "dashboard_filter_summary": list(cached.dash_labs),
                "filter_breadcrumb": cached.filter_breadcrumb,
                "narrative_status": "complete",
                "turn_id": turn_id,
            }
        )
    finally:
        m.df = saved_df
        m.dataset_profile = saved_prof
