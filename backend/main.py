from contextlib import asynccontextmanager

from fastapi import FastAPI, UploadFile, File, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field
import pandas as pd
from anthropic import (
    Anthropic,
    APIConnectionError,
    APIStatusError,
    AuthenticationError,
    RateLimitError,
)
from dotenv import load_dotenv
import os
from io import BytesIO
from typing import Optional, List, Dict, Any, Tuple, Callable, Literal
from contextlib import contextmanager
import re
import math
import json
import logging
import time
import uuid

from analytics_metadata import build_insight_title, build_metric_label
from services.executive_kpi_cards import (
    KpiBuildContext,
    build_executive_kpi_cards,
    executive_domain_to_auto_kind,
    executive_domain_to_kpi_domain,
    infer_executive_domain,
    sales_column_allowed_for_domain,
)
from services.file_parsers import (
    detect_dataset_format,
    is_excel_filename,
    load_dataframe_from_upload,
    unsupported_format_message,
)
from services.cors_config import parse_allowed_origins
from services.readiness import (
    get_health_payload,
    get_ready_payload,
    validate_startup_config,
)
from services.plan_limits import (
    PAID_MAX_DATASET_ROWS,
    file_size_limit_message,
    dataset_rows_limit_message,
    get_limits,
)
from services.saas_context import (
    limit_error_detail,
    resolve_plan_tier,
    resolve_session_id,
)
from services.usage_tracker import usage_tracker
from services.ask_turn_cache import AskTurnCacheEntry, ask_turn_cache
from services.ask_narrative_phase import (
    build_ask_narrative_prompt,
    handle_ask_narrative_phase,
    produce_ask_narrative_answer,
)
from services.auto_dashboard_opportunities import (
    DashboardDeps,
    build_dashboard_charts_bundle,
    build_dashboard_charts_from_opportunities,
)

load_dotenv()

logger = logging.getLogger(__name__)

client = Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))


@asynccontextmanager
async def lifespan(_app: FastAPI):
    validate_startup_config()
    yield


app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=parse_allowed_origins(os.getenv("ALLOWED_ORIGINS")),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

df = None
uploaded_file_bytes = None
uploaded_file_name = None
selected_sheet_name = None
dataset_profile = None
column_mapping = {
    "product": None,
    "sales": None,
    "region": None,
    "customer": None,
    "profit": None,
    "date": None,
}
# Explainable semantic mapping from last inference (upload / sheet change).
column_mapping_metadata: Optional[Dict[str, Any]] = None

# Sheet list for Excel uploads; set on `/upload` and `/select-sheet` (CSV → ["CSV"]).
available_sheet_names: Optional[List[str]] = None

NO_RECORDS_FILTERS_MSG = "No records match current filters."


class ConversationContextPayload(BaseModel):
    """Client round-trip snapshot of the last successful analysis (single session)."""

    model_config = ConfigDict(extra="ignore")

    lastQuestion: Optional[str] = None
    lastChartTitle: Optional[str] = None
    metricColumn: Optional[str] = None
    categoryColumn: Optional[str] = None
    aggregation: Optional[str] = None
    chartType: Optional[str] = None
    intentBucket: Optional[str] = None
    filtersApplied: List[str] = Field(default_factory=list)
    """Conversation thread id from the prior server response (for lineage)."""
    turnId: Optional[str] = None
    """Ordered user questions in this BI copilot thread (for PDF / UI)."""
    followUpChain: List[str] = Field(default_factory=list)
    lastInsightChartId: Optional[str] = None
    activeDrillPath: List[str] = Field(default_factory=list)
    # --- Rich thread memory (client-maintained; domain-agnostic) ---
    lastAiAnswer: Optional[str] = None
    lastChartSubtitle: Optional[str] = None
    lastChartLabelSample: List[str] = Field(default_factory=list)
    """Semantic roles (product, sales, date, …) → dataframe column names."""
    columnMapping: Dict[str, str] = Field(default_factory=dict)
    datasetDomain: Optional[str] = None
    """Human-readable active explorer filters from the client (current ask)."""
    activeDashboardFilters: List[str] = Field(default_factory=list)
    """First question in the BI thread — stable scope for meta follow-ups."""
    rootQuestion: Optional[str] = None


class ParentAnalysisContextPayload(BaseModel):
    """Client snapshot of the prior resolved analysis (follow-up lineage)."""

    model_config = ConfigDict(extra="ignore")

    rootQuestion: Optional[str] = None
    priorQuestion: Optional[str] = None
    metricColumn: Optional[str] = None
    categoryColumn: Optional[str] = None
    metricColumnDisplay: Optional[str] = None
    categoryColumnDisplay: Optional[str] = None
    aggregation: Optional[str] = None
    chartType: Optional[str] = None
    chartTitle: Optional[str] = None
    intentBucket: Optional[str] = None
    routingIntent: Optional[str] = None
    followUpChain: List[str] = Field(default_factory=list)
    lastAiAnswer: Optional[str] = None
    turnId: Optional[str] = None


def _pretty_join_dimension_metric(
    cat: Optional[str], met: Optional[str]
) -> str:
    parts: List[str] = []
    if cat:
        parts.append(_pretty_label_text(str(cat)))
    if met:
        parts.append(_pretty_label_text(str(met)))
    if len(parts) >= 2:
        return f"{parts[0]} + {parts[1]}"
    return parts[0] if parts else ""


def _format_using_context_summary(ctx: Optional[ConversationContextPayload]) -> str:
    if not ctx:
        return ""
    return _pretty_join_dimension_metric(ctx.categoryColumn, ctx.metricColumn)


def _extend_follow_up_chain(
    prev: Optional[ConversationContextPayload],
    raw_q: str,
    is_follow_up: bool,
) -> List[str]:
    rq = (raw_q or "").strip()
    if not rq:
        return []
    if is_follow_up and prev:
        pc = list(prev.followUpChain or [])
        if pc:
            return pc + [rq]
        pq = (prev.lastQuestion or "").strip()
        return [pq, rq] if pq else [rq]
    return [rq]


def _conversation_meta_payload(
    *,
    sidecar: Optional[Dict[str, Any]],
    filter_added: List[str],
    turn_id: str,
    parent_tid: Optional[str],
    using_summary: str,
    is_follow_up: bool,
) -> Dict[str, Any]:
    inherited = bool(is_follow_up or filter_added)
    note_parts: List[str] = []
    if is_follow_up:
        note_parts.append(
            "This answer builds on your prior question; inherited metric/dimension selections apply unless you override them."
        )
    if filter_added:
        note_parts.append(
            "Additional row filters were derived from follow-up wording; confirm they match the cohort you intend."
        )
    return {
        "followUpDetected": bool(is_follow_up),
        "usingContextSummary": using_summary if is_follow_up else "",
        "inheritedAssumptionNote": " ".join(note_parts) if inherited else "",
        "turnId": turn_id,
        "parentTurnId": parent_tid,
    }


class DashboardFilterEntryModel(BaseModel):
    """Explicit dashboard filter slice (applied before AI / KPI recompute)."""

    model_config = ConfigDict(extra="ignore")

    column: str = Field(description="Actual dataframe column name")
    label: str = Field(default="", description="Human label shown in chips")
    value: str


class DashboardDateRangeModel(BaseModel):
    model_config = ConfigDict(extra="ignore")

    column: str
    start: Optional[str] = Field(default=None, description="ISO date string inclusive")
    end: Optional[str] = Field(default=None, description="ISO date string inclusive")


AskPhase = Literal["full", "chart", "narrative"]


class QuestionRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    question: str
    conversation_context: Optional[ConversationContextPayload] = None
    parent_analysis_context: Optional[ParentAnalysisContextPayload] = None
    continuation_intent: bool = False
    dashboard_filters: List[DashboardFilterEntryModel] = Field(default_factory=list)
    date_range: Optional[DashboardDateRangeModel] = None
    phase: AskPhase = "full"
    turn_id: Optional[str] = None


class FilteredDashboardRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    dashboard_filters: List[DashboardFilterEntryModel] = Field(default_factory=list)
    date_range: Optional[DashboardDateRangeModel] = None


class SheetRequest(BaseModel):
    sheet_name: str


class ColumnMappingRequest(BaseModel):
    product_column: Optional[str] = None
    sales_column: Optional[str] = None
    region_column: Optional[str] = None
    customer_column: Optional[str] = None
    profit_column: Optional[str] = None
    date_column: Optional[str] = None


class PreviewRequest(BaseModel):
    row_limit: Optional[int] = 10


@app.get("/")
def home():
    return {"message": "AI Data Analyst Backend Running"}


@app.get("/health")
def health():
    return get_health_payload()


@app.get("/ready")
def ready():
    payload = get_ready_payload()
    status_code = 200 if payload["ready"] else 503
    return JSONResponse(status_code=status_code, content=payload)


def detect_header_row(raw_df):
    best_row = 0
    best_score = -1

    for i in range(min(10, len(raw_df))):
        row = raw_df.iloc[i]
        non_empty = row.notna().sum()
        text_cells = row.apply(lambda x: isinstance(x, str)).sum()
        score = non_empty + text_cells

        if score > best_score:
            best_score = score
            best_row = i

    return best_row


def clean_dataframe(input_df):
    input_df = input_df.dropna(axis=1, how="all")
    input_df = input_df.dropna(axis=0, how="all")
    input_df.columns = [str(col).strip() for col in input_df.columns]
    return input_df


_DATE_COL_NAME_HINT = re.compile(
    r"\b(date|dates|datetime|timestamp|time|day|month|year|quarter|week|created|updated|"
    r"order\s*date|invoice\s*date|transaction\s*date|period)\b",
    re.I,
)


_DATETIME_PARSE_RATIO_EARLY_RETURN = 0.9


def _datetime_parse_ratio(series: pd.Series) -> float:
    """Fraction of non-null values that parse as datetimes (mixed formats)."""
    non_null = series.dropna()
    if non_null.empty:
        return 0.0
    try:
        dt = pd.to_datetime(non_null, errors="coerce", format="mixed")
    except TypeError:
        dt = pd.to_datetime(non_null, errors="coerce")
    r1 = float(dt.notna().mean())
    if r1 >= _DATETIME_PARSE_RATIO_EARLY_RETURN:
        return r1
    try:
        dt2 = pd.to_datetime(
            non_null.astype(str).str.strip(), errors="coerce", format="mixed"
        )
    except TypeError:
        dt2 = pd.to_datetime(non_null.astype(str).str.strip(), errors="coerce")
    r2 = float(dt2.notna().mean())
    return max(r1, r2)


def _group_column_is_time_series_eligible(df: pd.DataFrame, group_col: str) -> bool:
    """True when the column mostly parses as datetimes with at least two distinct times."""
    if df is None or df.empty or group_col not in df.columns:
        return False
    s = df[group_col]
    if _datetime_parse_ratio(s) < 0.6:
        return False
    try:
        dt = pd.to_datetime(s, errors="coerce", format="mixed")
    except TypeError:
        dt = pd.to_datetime(s, errors="coerce")
    return int(dt.dropna().nunique()) >= 2


def _infer_date_like_columns_from_values(df: pd.DataFrame) -> List[str]:
    """Column names that behave as time axes even if not tagged 'date' in profile."""
    if df is None or df.empty:
        return []
    out: List[str] = []
    for c in df.columns:
        if _group_column_is_time_series_eligible(df, str(c)):
            out.append(str(c))
    return out


_CANONICAL_INTERNAL_CHART_TYPES = frozenset(
    ("bar", "bar_horizontal", "pie", "donut", "line", "area", "scatter", "histogram")
)


def _normalize_internal_chart_type(raw: Optional[str]) -> str:
    """Map synonyms to internal kinds; unknown kinds fall back to bar (safe render)."""
    t = (raw or "bar").strip().lower().replace("-", "_")
    if t in ("timeseries", "time_series"):
        return "line"
    if t in _CANONICAL_INTERNAL_CHART_TYPES:
        return t
    return "bar"


def detect_column_types(input_df: pd.DataFrame):
    """
    Lightweight type detection for UI.
    Returns: {col: "number"|"date"|"text"|"category"}
    """
    result = {}
    n_rows = len(input_df)

    for col in input_df.columns:
        s = input_df[col]
        non_null = s.dropna()
        if non_null.empty:
            result[col] = "text"
            continue

        # Numeric (handles commas/currency too)
        numeric = pd.to_numeric(
            non_null.astype(str)
            .str.replace(",", "", regex=False)
            .str.replace("₹", "", regex=False)
            .str.replace("$", "", regex=False),
            errors="coerce",
        )
        numeric_ratio = float(numeric.notna().mean()) if len(non_null) else 0.0

        if numeric_ratio >= 0.9:
            result[col] = "number"
            continue

        # Date: mixed-format parsing + optional boost when the header looks temporal.
        date_ratio = _datetime_parse_ratio(s)
        date_named = bool(_DATE_COL_NAME_HINT.search(str(col)))

        if date_ratio >= 0.9:
            result[col] = "date"
            continue
        if date_named and date_ratio >= 0.72:
            result[col] = "date"
            continue

        # Category heuristic: low cardinality vs rows
        nunique = int(non_null.nunique())
        if n_rows > 0 and (nunique <= 50 or nunique / max(n_rows, 1) <= 0.2):
            result[col] = "category"
        else:
            result[col] = "text"

    return result


def build_profile(input_df: pd.DataFrame):
    """Small, cheap dataset profile for UI + AI prompting."""
    column_types = detect_column_types(input_df)
    null_counts = {c: int(input_df[c].isna().sum()) for c in input_df.columns}

    numeric_cols = [c for c, t in column_types.items() if t == "number"]
    summary_stats = {}
    if numeric_cols:
        desc = input_df[numeric_cols].apply(pd.to_numeric, errors="coerce").describe()
        # JSON-friendly
        summary_stats = desc.round(6).to_dict()

    unique_counts = {
        c: int(input_df[c].nunique(dropna=True)) for c in input_df.columns
    }

    return {
        "column_types": column_types,
        "null_counts": null_counts,
        "summary_stats": summary_stats,
        "unique_counts": unique_counts,
    }


def _json_safe(value: Any) -> Any:
    """Recursively coerce NaN/Inf to JSON-safe values."""
    if isinstance(value, dict):
        return {k: _json_safe(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_json_safe(v) for v in value]
    if isinstance(value, tuple):
        return [_json_safe(v) for v in value]
    # Covers built-in floats plus numpy/pandas scalar float values.
    if isinstance(value, (float, int)) and not isinstance(value, bool):
        try:
            fv = float(value)
            if not math.isfinite(fv):
                return None
        except Exception:
            pass
        return value
    # Last-resort numeric-ish objects (e.g., np.float64) that may not satisfy
    # isinstance(x, float) in all environments.
    try:
        fv = float(value)
        if not math.isfinite(fv):
            return None
    except Exception:
        pass
    return value


def get_ai_context(sample_rows: int = 10, question: Optional[str] = None):
    """Keep prompts small: schema + stats + tiny sample."""
    global df, selected_sheet_name, uploaded_file_name, dataset_profile
    if df is None:
        return {}

    profile = dataset_profile or build_profile(df)
    sample = df.head(sample_rows).to_dict(orient="records")
    try:
        from intent_engine.geographic_scope import (
            geographic_context_sample_rows,
            question_geographic_scope_level,
        )

        if question and question_geographic_scope_level(question):
            sample = geographic_context_sample_rows(
                df, profile, question, max_rows=sample_rows
            )
    except Exception:
        pass
    return {
        "file_name": uploaded_file_name,
        "selected_sheet": selected_sheet_name,
        "rows": int(len(df)),
        "columns": df.columns.tolist(),
        "column_types": profile.get("column_types", {}),
        "null_counts": profile.get("null_counts", {}),
        "summary_stats": profile.get("summary_stats", {}),
        "sample_rows": sample,
    }


def read_sheet_from_excel(file_bytes, sheet_name):
    raw_df = pd.read_excel(BytesIO(file_bytes), sheet_name=sheet_name, header=None, nrows=20)
    header_row = detect_header_row(raw_df)

    sheet_df = pd.read_excel(BytesIO(file_bytes), sheet_name=sheet_name, header=header_row)
    return clean_dataframe(sheet_df)


def _norm_header_token(col: str) -> str:
    return re.sub(r"[\s\-]+", "_", str(col).strip().lower())


def _infer_business_domain(columns: List[str]) -> str:
    """Lightweight domain hint for mapping weights (ecommerce / manufacturing / generic)."""
    joined = " ".join(_norm_header_token(c) for c in columns)
    mfg_kw = (
        "bom", "work_order", "routing", "batch", "lot", "plant", "assembly",
        "sku", "material", "warehouse", "inventory", "production",
    )
    ecom_kw = (
        "order", "cart", "checkout", "sku", "product", "customer", "invoice",
        "shipment", "payment", "channel", "listing", "variant",
        "order_value", "revenue", "line_total", "delivery_days",
    )
    ops_kw = (
        "incident", "downtime", "severity", "plant", "machine", "outage",
        "repair", "production_loss", "mttr", "mtbf",
    )
    mkt_kw = ("campaign", "channel", "impression", "click", "conversion", "ad_spend", "spend")
    mfg = sum(1 for k in mfg_kw if k in joined)
    eco = sum(1 for k in ecom_kw if k in joined)
    ops = sum(1 for k in ops_kw if k in joined)
    mkt = sum(1 for k in mkt_kw if k in joined)
    if ops >= 2 and ops >= eco and ops >= mfg:
        return "operations"
    if mkt >= 2 and mkt >= eco:
        return "marketing"
    if mfg >= 3 and mfg >= eco:
        return "manufacturing"
    if eco >= 2:
        return "ecommerce"
    return "generic"


def _product_role_forbidden(col: str) -> bool:
    """
    customer_id / order_id / invoice_id must never be used as product/category dimension.
    """
    n = _norm_header_token(col)
    if re.search(
        r"(^|_)(customer|cust|client|user|buyer|shopper|member)_?id$",
        n,
    ):
        return True
    if re.search(
        r"(^|_)(order|invoice|transaction|payment|shipment|line|cart|session|visit|row)_?id$",
        n,
    ):
        return True
    if n in ("id", "ids", "uuid", "guid", "rowid", "index"):
        return True
    if _id_like_column_name(col):
        # Allow only obvious catalog identifiers.
        if re.search(r"(product|sku|item|variant|article|style|model)_id$", n):
            return False
        return True
    return False


def _customer_role_keyword_score(col: str) -> Tuple[int, List[str]]:
    """Prefer human-readable customer fields; customer_id is valid for the customer role only."""
    n = _norm_header_token(col)
    reasons: List[str] = []
    s = 0
    for kw, w in (
        ("customer_name", 44),
        ("client_name", 34),
        ("customer_id", 36),
        ("cust_id", 32),
        ("client_id", 28),
        ("customer", 26),
        ("client", 22),
        ("buyer", 18),
        ("shopper", 14),
        ("account_name", 30),
        ("company_name", 28),
        ("email", 8),
    ):
        if kw in n:
            s += w
            reasons.append(f"name:{kw}+{w}")
    return s, reasons


def _product_role_keyword_score(col: str) -> Tuple[int, List[str]]:
    n = _norm_header_token(col)
    reasons: List[str] = []
    score = 0
    pairs = (
        ("product", 42),
        ("sku", 40),
        ("item", 28),
        ("category", 36),
        ("subcategory", 32),
        ("brand", 30),
        ("segment", 22),
        ("collection", 18),
        ("variant", 24),
        ("article", 14),
        ("merchandise", 16),
        ("style", 12),
        ("model", 12),
        ("description", 6),
        ("title", 8),
        ("campaign", 40),
        ("campaign_name", 44),
        ("channel", 28),
        ("severity", 26),
        ("plant", 24),
        ("machine", 22),
    )
    for kw, w in pairs:
        if kw in n:
            score += w
            reasons.append(f"name:{kw}+{w}")
    return score, reasons


def _sales_role_keyword_score(col: str, domain: str = "generic") -> Tuple[int, List[str]]:
    """
    Business-keyword score for the sales / primary value metric role.
    Ecommerce: prioritize monetary columns; penalize operational KPIs (delivery time, ratings, counts).
    """
    n = _norm_header_token(col)
    reasons: List[str] = []
    score = 0

    # Primary monetary intent (substring match on normalized header; longer phrases first).
    monetary = (
        ("order_value", 64),
        ("line_total", 54),
        ("order_total", 54),
        ("transaction_total", 50),
        ("transaction_value", 50),
        ("extended_price", 48),
        ("grand_total", 46),
        ("total_revenue", 44),
        ("total_sales", 44),
        ("gross_sales", 44),
        ("net_sales", 44),
        ("net_revenue", 44),
        ("sales_amount", 44),
        ("order_amount", 44),
        ("payment_amount", 42),
        ("total_amount", 40),
        ("amount_paid", 40),
        ("revenue", 42),
        ("sale_amount", 40),
        ("subtotal", 36),
        ("spend", 34),
        ("sales", 36),
        ("amount", 30),
        ("total", 22),
        ("unit_price", 34),
        ("price", 28),
        ("profit", 28),
        ("margin", 22),
        ("discount", 32),
        ("discount_pct", 30),
        ("downtime", 40),
        ("downtime_minutes", 44),
        ("outage_minutes", 40),
        ("repair_cost", 38),
        ("maintenance_cost", 34),
        ("production_loss", 42),
        ("production_loss_units", 44),
        ("units_lost", 36),
        ("incident_count", 28),
    )
    for kw, w in monetary:
        if kw in n:
            score += w
            reasons.append(f"biz_kw:{kw}+{w}")

    # Operational / secondary metrics — never preferred as primary "sales" value.
    operational_penalties = (
        ("delivery_days", 58),
        ("days_to_deliver", 54),
        ("day_to_delivery", 54),
        ("days_to_delivery", 54),
        ("delivery_time", 50),
        ("ship_days", 48),
        ("days_to_ship", 48),
        ("shipping_days", 48),
        ("processing_days", 46),
        ("lead_time", 36),
        ("handling_time", 32),
        ("fulfillment_days", 48),
        ("warehouse_days", 40),
        ("star_rating", 44),
        ("review_rating", 42),
        ("customer_rating", 42),
        ("product_rating", 42),
        ("satisfaction_score", 40),
        ("nps_score", 32),
        ("review_score", 40),
        ("rating", 38),
        ("score", 26),
    )
    for kw, pen in operational_penalties:
        if kw in n:
            score -= pen
            reasons.append(f"ops_penalty:{kw}-{-pen}")

    hr_penalties = (
        ("terminations", 72),
        ("attrition_rate", 70),
        ("attrition", 68),
        ("headcount", 64),
        ("hires", 60),
        ("escalations", 58),
        ("readmissions", 58),
        ("admissions", 54),
        ("tickets_opened", 56),
        ("tickets_resolved", 54),
        ("patient_volume", 56),
        ("personnel_cost", 52),
        ("performance_rating", 50),
        ("defect_rate", 48),
        ("units_produced", 46),
        ("avg_resolution_hours", 50),
        ("credit_utilization", 44),
    )
    for kw, pen in hr_penalties:
        if kw in n:
            score -= pen
            reasons.append(f"domain_penalty:{kw}-{-pen}")

    entity_penalties = (
        ("sales_rep", 90),
        ("salesperson", 90),
        ("sales_person", 90),
        ("employee_id", 85),
        ("employee_name", 85),
        ("customer_id", 80),
        ("customers", 75),
        ("patient_id", 80),
        ("ticket_id", 80),
        ("account_id", 70),
        ("operator", 70),
    )
    for kw, pen in entity_penalties:
        if kw in n:
            score -= pen
            reasons.append(f"entity_penalty:{kw}-{-pen}")

    if domain == "ecommerce":
        if re.search(r"(^|_)(qty|quantity)|units_ordered|line_qty|order_qty", n):
            score -= 28
            reasons.append("eco:penalize_qty_units(-28)")
    elif domain == "manufacturing":
        for kw, w in (("qty", 20), ("quantity", 20), ("units", 18), ("output", 22)):
            if kw in n:
                score += w
                reasons.append(f"mfg_qty:{kw}+{w}")
    else:
        for kw, w in (("qty", 20), ("quantity", 20), ("units", 16)):
            if kw in n:
                score += w
                reasons.append(f"gen_qty:{kw}+{w}")

    return score, reasons


def _region_role_keyword_score(col: str) -> Tuple[int, List[str]]:
    n = _norm_header_token(col)
    reasons: List[str] = []
    score = 0
    for kw, w in (
        ("region", 34),
        ("zone", 36),
        ("state", 18),
        ("country", 22),
        ("city", 20),
        ("zip", 10),
        ("postal", 12),
        ("territory", 26),
        ("location", 16),
        ("market", 14),
        ("geo", 10),
        ("plant", 36),
        ("facility", 28),
        ("site", 20),
        ("workcenter", 22),
        ("severity", 24),
        ("priority", 18),
        ("machine", 26),
        ("equipment", 24),
        ("line", 18),
        ("shift", 14),
    ):
        if kw in n:
            score += w
            reasons.append(f"name:{kw}+{w}")
    return score, reasons


def _profit_role_keyword_score(col: str) -> Tuple[int, List[str]]:
    n = _norm_header_token(col)
    reasons: List[str] = []
    score = 0
    for kw, w in (
        ("profit", 36),
        ("margin", 30),
        ("gp", 18),
        ("ebitda", 22),
        ("earnings", 18),
        ("net_income", 24),
    ):
        if kw in n:
            score += w
            reasons.append(f"name:{kw}+{w}")
    return score, reasons


def _date_role_keyword_score(col: str) -> Tuple[int, List[str]]:
    n = _norm_header_token(col)
    reasons: List[str] = []
    score = 0
    for kw, w in (
        ("order_date", 38),
        ("invoice_date", 34),
        ("ship_date", 28),
        ("transaction_date", 32),
        ("created_at", 22),
        ("timestamp", 18),
        ("date", 20),
        ("month", 8),
        ("period", 8),
        ("incident_date", 36),
        ("campaign_date", 34),
        ("event_date", 30),
        ("reported_date", 28),
        ("start_time", 22),
        ("end_time", 18),
    ):
        if kw in n:
            score += w
            reasons.append(f"name:{kw}+{w}")
    return score, reasons


# Minimum semantic score to auto-assign geography / region role (matches medium-confidence bar).
REGION_ROLE_MIN_SCORE = 18.0

_ADDITIVE_METRIC_SUBSTRINGS = (
    "revenue",
    "sales",
    "profit",
    "spend",
    "cost",
    "impression",
    "click",
    "conversion",
    "order_value",
    "amount",
    "budget",
    "gmv",
    "turnover",
    "units",
    "quantity",
    "volume",
    "customer",
    "employee",
    "headcount",
    "salary",
    "margin",
    "subtotal",
    "gross",
    "net_revenue",
    "orders",
    "order",
)

_GEOGRAPHY_NAME_KEYWORDS = (
    "region",
    "zone",
    "state",
    "country",
    "city",
    "territory",
    "province",
    "county",
    "postal",
    "zipcode",
    "zip_code",
    "geo",
    "location",
    "latitude",
    "longitude",
    "metro",
    "district",
    "warehouse",
    "plant",
    "facility",
    "site",
)


def _column_profile_type(col: str, profile: Optional[Dict[str, Any]]) -> Optional[str]:
    return (profile or {}).get("column_types", {}).get(col)


def _column_name_implies_temporal(col: str) -> bool:
    n = _norm_header_token(col)
    return any(
        tok in n
        for tok in (
            "date",
            "datetime",
            "timestamp",
            "time_stamp",
            "month",
            "year",
            "day",
            "period",
            "week",
            "fiscal_period",
        )
    )


def _column_is_temporal_for_mapping(col: str, profile: Optional[Dict[str, Any]]) -> bool:
    if _column_profile_type(col, profile) == "date":
        return True
    return _column_name_implies_temporal(col)


def _column_name_implies_geography(col: str) -> bool:
    n = _norm_header_token(col)
    if _column_name_implies_temporal(col):
        return False
    for kw in _GEOGRAPHY_NAME_KEYWORDS:
        if kw in n:
            if kw == "market" and "marketing" in n:
                continue
            return True
    return False


def _region_role_candidate_allowed(
    col: str, profile: Optional[Dict[str, Any]], score: float
) -> bool:
    if not col or score < REGION_ROLE_MIN_SCORE:
        return False
    if _column_is_temporal_for_mapping(col, profile):
        return False
    if _column_profile_type(col, profile) == "number":
        return False
    return _column_name_implies_geography(col)


def _pick_region_column_from_candidates(
    cands: List[Dict[str, Any]], profile: Optional[Dict[str, Any]]
) -> Optional[str]:
    for row in cands or []:
        col = str(row.get("column", "")).strip()
        score = float(row.get("score", 0) or 0)
        if _region_role_candidate_allowed(col, profile, score):
            return col
    return None


def _region_column_usable(
    col: Optional[str], profile: Optional[Dict[str, Any]] = None
) -> bool:
    if not col:
        return False
    global dataset_profile
    prof = profile if profile is not None else dataset_profile
    # User-confirmed mapping may omit score metadata; still require geography semantics.
    return _region_role_candidate_allowed(
        str(col), prof, REGION_ROLE_MIN_SCORE
    ) or (
        _column_name_implies_geography(str(col))
        and not _column_is_temporal_for_mapping(str(col), prof)
        and _column_profile_type(str(col), prof) != "number"
    )


def _column_looks_ratio_only_metric(col_name: Optional[str]) -> bool:
    if not col_name:
        return False
    cn = str(col_name).lower().replace("_", " ")
    return bool(
        re.search(
            r"\b(pct|percent(?:age)?|ratio|rates?|probability|score|ctr|spread)\b",
            cn,
            re.I,
        )
    )


def _column_looks_additive_metric(col_name: Optional[str]) -> bool:
    if not col_name:
        return False
    n = _norm_header_token(str(col_name))
    if _column_looks_ratio_only_metric(col_name) and not any(
        k in n for k in ("revenue", "sales", "profit", "spend", "cost", "amount")
    ):
        return False
    return any(sub in n for sub in _ADDITIVE_METRIC_SUBSTRINGS)


def _ranking_or_leaderboard_intent(ql: str) -> bool:
    q = (ql or "").lower()
    try:
        from intent_engine.question_patterns import question_requests_driver_intent

        if question_requests_driver_intent(q):
            return False
    except Exception:
        pass
    if re.search(r"\btop\s+(?:\d+|five|ten|three|four|seven|eight)\b", q):
        return True
    if any(k in q for k in ("ranking", "rank ", "rank,", "ranked")):
        return True
    if re.search(r"\b(which|top\b|best\b|leading|drives?|drive\b|most\b|bottom\b)\b", q):
        return True
    if re.search(r"\bby\s+[a-z0-9_][a-z0-9_\s]{0,40}\b", q):
        return True
    if re.search(r"\b(revenue|sales|profit|spend)\s+by\s+", q):
        return True
    return False


def _explicit_max_aggregation_intent(ql: str) -> bool:
    """True only when the user asks for a peak / single-row maximum — not leaderboard 'highest'."""
    q = (ql or "").lower()
    if re.search(
        r"\b(maximum|max\b|peak|largest\s+(?:single|transaction|order|day|value|record))\b",
        q,
    ):
        return True
    if re.search(
        r"\bhighest\s+(?:single|transaction|order|day|value|record|ever|reading)\b",
        q,
    ):
        return True
    if "largest transaction" in q or "single-day" in q or "single day" in q:
        return True
    if ("highest" in q or "maximum" in q or "largest" in q) and _ranking_or_leaderboard_intent(
        q
    ):
        return False
    if "highest" in q or "maximum" in q:
        if re.search(r"\b(which|top\b|by\s+|per\s+|compare|drives?)\b", q):
            return False
        return True
    return False


def _resolve_agg_label_and_key(
    ql: str,
    *,
    value_col: Optional[str] = None,
    incident_only: bool = False,
    explicit_metric_resolved: bool = False,
) -> Tuple[str, str]:
    """Map question wording + metric column to (agg_label, agg_key) for grouped charts."""
    q = (ql or "").lower()
    if incident_only:
        return "Count", "count"
    if any(k in q for k in ["average", "avg", "mean"]):
        return "Average", "mean"
    try:
        from intent_engine.resolve_explicit_metric import question_requests_record_count

        if question_requests_record_count(
            q,
            resolved_metric_col=value_col if explicit_metric_resolved else None,
        ):
            return "Count", "count"
    except Exception:
        if (
            "count" in q
            or "how many" in q
            or "number of" in q
            or "headcount" in q
        ):
            return "Count", "count"
    if re.search(r"\b(sum|total)\b", q) and (
        "average" not in q and "mean" not in q and "avg" not in q
    ):
        return "Total", "sum"
    try:
        from intent_engine.column_resolve import column_prefers_mean_aggregation

        if (
            value_col
            and column_prefers_mean_aggregation(value_col)
            and _ranking_or_leaderboard_intent(q)
            and not re.search(r"\b(sum|total)\b", q)
        ):
            return "Average", "mean"
    except Exception:
        pass
    if "minimum" in q or "lowest" in q or re.search(r"\bmin\b", q):
        return "Minimum", "min"
    if _explicit_max_aggregation_intent(q):
        return "Maximum", "max"
    if any(
        k in q
        for k in (
            "trend",
            "over time",
            "monthly",
            "by month",
            "quarter",
            "weekly",
            "by date",
            "daily",
            "yearly",
            "timeline",
            "each day",
            "each month",
            "each year",
            "per day",
            "per month",
            "per year",
        )
    ) or re.search(r"\b(by|per)\s+(day|date|week|month|year|quarter)\b", q):
        return "Total", "sum"
    try:
        from intent_engine.column_resolve import column_prefers_mean_aggregation

        if value_col and column_prefers_mean_aggregation(value_col):
            if not re.search(r"\b(sum|total)\b", q):
                return "Average", "mean"
    except Exception:
        pass
    if _ranking_or_leaderboard_intent(q) or _column_looks_additive_metric(value_col):
        try:
            from intent_engine.column_resolve import column_prefers_mean_aggregation

            if (
                value_col
                and column_prefers_mean_aggregation(value_col)
                and not re.search(r"\b(sum|total)\b", q)
            ):
                return "Average", "mean"
        except Exception:
            pass
        return "Total", "sum"
    if any(k in q for k in ("compare", "versus", " vs ")):
        if _column_looks_additive_metric(value_col):
            return "Total", "sum"
        return "Average", "mean"
    return "Average", "mean"


def _cardinality_profile_score(
    df_in: pd.DataFrame, col: str, role: str, domain: str = "generic"
) -> Tuple[float, List[str]]:
    """Returns (points, reasons) using nunique vs row count."""
    reasons: List[str] = []
    if df_in is None or col not in df_in.columns or len(df_in) == 0:
        return 0.0, reasons
    n = int(len(df_in))
    try:
        nu = int(df_in[col].nunique(dropna=True))
    except Exception:
        return 0.0, reasons
    ratio = float(nu) / float(max(n, 1))
    pts = 0.0
    if nu <= 1:
        reasons.append("cardinality:constant(0)")
        return 0.0, reasons
    if role == "product":
        if ratio >= 0.995:
            pts -= 35.0
            reasons.append("cardinality:almost_unique_penalty(-35)")
        elif ratio >= 0.92:
            pts -= 12.0
            reasons.append("cardinality:very_high_cardinality(-12)")
        elif 0.0003 <= ratio <= 0.85:
            pts += 18.0
            reasons.append("cardinality:healthy_dimension(+18)")
        elif ratio < 0.0003:
            pts -= 8.0
            reasons.append("cardinality:too_few_levels(-8)")
    elif role == "customer":
        if 0.002 <= ratio <= 0.9:
            pts += 16.0
            reasons.append("cardinality:customer_like(+16)")
        elif ratio >= 0.995:
            pts -= 25.0
            reasons.append("cardinality:likely_surrogate_id(-25)")
    elif role == "sales":
        nm = _norm_header_token(col)
        money_like = any(
            k in nm
            for k in (
                "revenue",
                "sales",
                "amount",
                "total",
                "price",
                "value",
                "payment",
                "profit",
                "spend",
                "subtotal",
                "gross",
                "net_",
                "order_",
                "transaction",
                "extended",
                "grand",
            )
        )
        if 0.0001 <= ratio <= 0.995:
            pts += 12.0
            reasons.append("cardinality:sales_spread(+12)")
        elif ratio > 0.995 and money_like:
            pts += 11.0
            reasons.append("cardinality:sales_high_unique_monetary(+11)")
        elif ratio > 0.995:
            pts += 3.0
            reasons.append("cardinality:sales_high_unique_weak(+3)")
        if domain == "ecommerce" and money_like and 0.02 <= ratio <= 0.98:
            pts += 4.0
            reasons.append("cardinality:eco_monetary_sweetspot(+4)")
    else:
        if 0.001 <= ratio <= 0.95:
            pts += 10.0
            reasons.append("cardinality:usable(+10)")
    return pts, reasons


def _type_profile_bonus(col: str, profile: Dict[str, Any], role: str) -> Tuple[float, List[str]]:
    ct = (profile or {}).get("column_types", {}) or {}
    t = ct.get(col)
    reasons: List[str] = []
    pts = 0.0
    if role in ("product", "customer", "region"):
        if t == "category":
            pts += 8.0
            reasons.append("dtype:category(+8)")
        elif t == "text":
            pts += 4.0
            reasons.append("dtype:text(+4)")
    elif role in ("sales", "profit"):
        if t == "number":
            pts += 12.0
            reasons.append("dtype:number(+12)")
    elif role == "date":
        if t == "date":
            pts += 25.0
            reasons.append("dtype:date(+25)")
        elif t in ("text", "category"):
            pts += 3.0
            reasons.append("dtype:text_or_category(+3)")
    return pts, reasons


def _domain_weight_bonus(domain: str, role: str, col: str) -> Tuple[float, List[str]]:
    n = _norm_header_token(col)
    reasons: List[str] = []
    pts = 0.0
    if domain == "ecommerce" and role == "product":
        if any(k in n for k in ("listing", "variant", "channel", "sku", "product")):
            pts += 10.0
            reasons.append("domain:ecommerce_product(+10)")
    if domain == "manufacturing" and role == "product":
        if any(k in n for k in ("material", "bom", "sku", "item", "part")):
            pts += 12.0
            reasons.append("domain:mfg_product(+12)")
    if domain == "ecommerce" and role == "customer":
        if "customer" in n or "client" in n:
            pts += 8.0
            reasons.append("domain:ecommerce_customer(+8)")
    if domain == "ecommerce" and role == "sales":
        nm = _norm_header_token(col)
        if any(
            k in nm
            for k in (
                "order_value",
                "revenue",
                "sales",
                "amount",
                "total",
                "price",
                "payment",
                "transaction",
            )
        ):
            pts += 8.0
            reasons.append("domain:eco_sales_monetary_hint(+8)")
        if any(k in nm for k in ("delivery", "ship_days", "days_to", "rating", "review", "nps")):
            pts -= 12.0
            reasons.append("domain:eco_sales_operational_hint(-12)")
    return pts, reasons


def _sales_numeric_usefulness_score(df_in: pd.DataFrame, col: str) -> Tuple[float, List[str]]:
    """Variance / range signals: monetary columns usually spread; penalize flat or binary scales."""
    reasons: List[str] = []
    if df_in is None or col not in df_in.columns or len(df_in) < 3:
        return 0.0, reasons
    try:
        s = pd.to_numeric(df_in[col], errors="coerce").dropna()
    except Exception:
        return 0.0, reasons
    if len(s) < 5:
        reasons.append("numeric:few_values(0)")
        return 0.0, reasons
    nu = int(s.nunique(dropna=True))
    if nu <= 1:
        reasons.append("numeric:constant(-18)")
        return -18.0, reasons
    mn = float(s.min())
    mx = float(s.max())
    if not math.isfinite(mn) or not math.isfinite(mx) or mn == mx:
        reasons.append("numeric:no_range(-14)")
        return -14.0, reasons
    mean_abs = abs(float(s.mean())) + 1e-9
    std = float(s.std(ddof=0))
    cv = std / mean_abs if mean_abs > 1e-12 else 0.0
    pts = min(16.0, 4.0 + min(cv, 6.0) * 2.0)
    reasons.append(f"numeric:cv_bonus(+{pts:.1f})")
    if mx <= 1.0 and mn >= 0.0 and nu <= 3:
        pts -= 10.0
        reasons.append("numeric:binary_like_penalty(-10)")
    return pts, reasons


def _sales_metric_intent_distribution(
    df_in: pd.DataFrame, col: str, domain: str
) -> Tuple[float, List[str]]:
    """
    Penalize small-integer patterns that look like durations/counts when the name
    suggests operations (ecommerce), without double-penalizing already-keyworded names.
    """
    reasons: List[str] = []
    if domain != "ecommerce" or df_in is None or col not in df_in.columns:
        return 0.0, reasons
    n = _norm_header_token(col)
    if not any(
        k in n
        for k in (
            "day",
            "deliver",
            "ship",
            "lead",
            "handling",
            "fulfillment",
            "processing",
            "rating",
            "review",
            "score",
            "qty",
            "quantity",
            "units_",
        )
    ):
        return 0.0, reasons
    try:
        s = pd.to_numeric(df_in[col], errors="coerce").dropna()
    except Exception:
        return 0.0, reasons
    if len(s) < 8:
        return 0.0, reasons
    mx = float(s.max())
    mn = float(s.min())
    if not math.isfinite(mx) or not math.isfinite(mn):
        return 0.0, reasons
    span = mx - mn
    nuniq = int(s.nunique(dropna=True))
    if mx <= 180.0 and span <= 120.0 and nuniq <= 60:
        try:
            frac_whole = float(((s - s.round()).abs() < 1e-5).mean())
        except Exception:
            frac_whole = 0.0
        if frac_whole >= 0.85:
            reasons.append("dist:eco_small_integer_pattern(-16)")
            return -16.0, reasons
    return 0.0, reasons


def _sales_auxiliary_scores(
    df_in: pd.DataFrame, domain: str, col: str
) -> Tuple[float, List[str], Dict[str, float]]:
    """Weighted extras for sales metric: numeric usefulness + distribution / intent."""
    breakdown: Dict[str, float] = {}
    nu_pts, nu_r = _sales_numeric_usefulness_score(df_in, col)
    breakdown["numeric_usefulness"] = round(nu_pts, 2)
    di_pts, di_r = _sales_metric_intent_distribution(df_in, col, domain)
    breakdown["metric_intent_distribution"] = round(di_pts, 2)
    total = nu_pts + di_pts
    return total, nu_r + di_r, breakdown


def _score_role_candidates(
    df_in: pd.DataFrame,
    profile: Dict[str, Any],
    role: str,
    domain: str,
    keyword_fn,
    auxiliary_fn: Optional[Callable[[str], Tuple[float, List[str], Dict[str, float]]]] = None,
) -> List[Dict[str, Any]]:
    columns = df_in.columns.tolist()
    out: List[Dict[str, Any]] = []
    for col in columns:
        if role == "product" and _product_role_forbidden(col):
            continue
        if role == "region" and _id_like_column_name(col):
            continue
        if role == "region" and _column_is_temporal_for_mapping(col, profile):
            continue
        if role == "region" and profile.get("column_types", {}).get(col) == "number":
            continue
        if role == "customer":
            n = _norm_header_token(col)
            if _id_like_column_name(col) and not re.search(
                r"(customer|cust|client|buyer|account)_?id$", n
            ):
                continue
        if role in ("sales", "profit"):
            if profile.get("column_types", {}).get(col) not in ("number",):
                continue
        if role == "date":
            if profile.get("column_types", {}).get(col) not in ("date", "text", "category"):
                continue

        ks, kr = keyword_fn(col)

        aux_pts = 0.0
        aux_r: List[str] = []
        aux_bd: Dict[str, float] = {}
        if auxiliary_fn is not None:
            aux_pts, aux_r, aux_bd = auxiliary_fn(col)

        cp, cr = _cardinality_profile_score(df_in, col, role, domain)
        tb, tr = _type_profile_bonus(col, profile, role)
        dw, dr = _domain_weight_bonus(domain, role, col)

        total = float(ks) + cp + tb + dw + float(aux_pts)
        reasons = kr + cr + tr + dr + aux_r
        breakdown: Dict[str, Any] = {
            "business_keyword": float(ks),
            "cardinality": round(cp, 2),
            "dtype": round(tb, 2),
            "domain_role_bonus": round(dw, 2),
            "auxiliary_total": round(float(aux_pts), 2),
        }
        if aux_bd:
            breakdown["auxiliary_detail"] = aux_bd
        out.append(
            {
                "column": col,
                "score": round(total, 2),
                "reasons": reasons,
                "breakdown": breakdown,
            }
        )
    out.sort(key=lambda x: (-float(x["score"]), str(x["column"]).lower()))
    return out


def _confidence_from_top1_top2(cands: List[Dict[str, Any]]) -> str:
    if not cands or float(cands[0].get("score", 0)) <= 0:
        return "low"
    s1 = float(cands[0]["score"])
    s2 = float(cands[1]["score"]) if len(cands) > 1 else 0.0
    gap = s1 - s2
    if s1 >= 35 and gap >= 8:
        return "high"
    if s1 >= 18 and gap >= 4:
        return "medium"
    return "low"


def compute_semantic_column_mapping(
    frame: pd.DataFrame, profile: Dict[str, Any]
) -> Tuple[Dict[str, Optional[str]], Dict[str, Any]]:
    """
    Returns (proposed_column_mapping, mapping_metadata) without mutating globals.
    """
    empty_map = {k: None for k in ("product", "sales", "region", "customer", "profit", "date")}
    if frame is None or frame.empty:
        meta = {
            "domain": "generic",
            "roles": {},
            "notes": ["Empty dataframe; mapping skipped."],
            "rules_applied": [],
        }
        return empty_map, meta

    columns = frame.columns.tolist()
    domain = _infer_business_domain(columns)

    product_cands = _score_role_candidates(
        frame, profile, "product", domain, _product_role_keyword_score
    )
    sales_cands = _score_role_candidates(
        frame,
        profile,
        "sales",
        domain,
        lambda c: _sales_role_keyword_score(c, domain),
        auxiliary_fn=lambda c: _sales_auxiliary_scores(frame, domain, c),
    )
    region_cands = _score_role_candidates(
        frame, profile, "region", domain, _region_role_keyword_score
    )
    customer_cands = _score_role_candidates(
        frame, profile, "customer", domain, _customer_role_keyword_score
    )
    profit_cands = _score_role_candidates(
        frame, profile, "profit", domain, _profit_role_keyword_score
    )
    date_cands = _score_role_candidates(
        frame, profile, "date", domain, _date_role_keyword_score
    )

    def pick(cands: List[Dict[str, Any]], role_key: str) -> Optional[str]:
        if role_key == "region":
            return _pick_region_column_from_candidates(cands, profile)
        if cands and float(cands[0].get("score", 0)) > 0:
            return str(cands[0]["column"])
        if role_key == "date":
            for c in columns:
                if profile.get("column_types", {}).get(c) == "date":
                    return str(c)
        return None

    proposed = {
        "product": pick(product_cands, "product"),
        "sales": pick(sales_cands, "sales"),
        "region": pick(region_cands, "region"),
        "customer": pick(customer_cands, "customer"),
        "profit": pick(profit_cands, "profit"),
        "date": pick(date_cands, "date"),
    }

    # Avoid using the same column for unrelated roles (e.g. product == customer).
    if proposed.get("customer") and proposed["customer"] == proposed.get("product"):
        alt = None
        for row in customer_cands[1:]:
            c = str(row["column"])
            if c and c != proposed.get("product"):
                alt = c
                break
        proposed["customer"] = alt

    if proposed.get("region") and proposed["region"] == proposed.get("product"):
        skip = {proposed.get("product"), proposed.get("customer")}
        proposed["region"] = _pick_region_column_from_candidates(
            [r for r in region_cands if str(r.get("column", "")) not in skip],
            profile,
        )

    roles_meta: Dict[str, Any] = {}
    for key, cands in (
        ("product", product_cands),
        ("sales", sales_cands),
        ("region", region_cands),
        ("customer", customer_cands),
        ("profit", profit_cands),
        ("date", date_cands),
    ):
        top3 = cands[:3]
        conf = _confidence_from_top1_top2(cands)
        sel = proposed.get(key)
        roles_meta[key] = {
            "selected": sel,
            "confidence": conf,
            "top_candidates": top3,
            "score_breakdown_hint": "Scores combine semantic keywords, cardinality, dtype, domain hints, and (for sales) numeric usefulness + intent distribution.",
        }
        if key == "sales" and cands:
            win = cands[0]
            rs = win.get("reasons") or []
            domain_adj_lines = [
                r
                for r in rs
                if any(
                    r.startswith(p)
                    for p in (
                        "domain:",
                        "eco:",
                        "ops_penalty:",
                        "dist:",
                        "mfg_qty:",
                        "gen_qty:",
                    )
                )
            ]
            sales_debug = {
                "selected_metric_reason": "; ".join(str(x) for x in rs[:16]),
                "candidate_metric_scores": [
                    {
                        "column": str(r.get("column")),
                        "score": r.get("score"),
                        "reasons": (r.get("reasons") or [])[:14],
                        "breakdown": r.get("breakdown") or {},
                    }
                    for r in cands[:15]
                ],
                "domain_adjustments": {
                    "inferred_domain": domain,
                    "matched_reason_lines": domain_adj_lines,
                    "domain_role_bonus_breakdown": (win.get("breakdown") or {}).get(
                        "domain_role_bonus"
                    ),
                },
            }
            roles_meta[key]["debug"] = sales_debug
            try:
                logger.info(
                    "semantic_sales_metric_selection %s",
                    json.dumps(
                        {
                            "selected_column": sel,
                            "selected_metric_reason": sales_debug["selected_metric_reason"],
                            "candidate_metric_scores": sales_debug["candidate_metric_scores"],
                            "domain_adjustments": sales_debug["domain_adjustments"],
                        },
                        default=str,
                    ),
                )
            except Exception:
                logger.info(
                    "semantic_sales_metric_selection selected=%s scores=%s",
                    sel,
                    [c.get("column") for c in cands[:8]],
                )

    notes: List[str] = []
    notes.append(f"Inferred domain: {domain}.")
    if proposed.get("product"):
        notes.append(
            f"Product / category dimension: {_pretty_label_text(proposed['product'])}."
        )
    else:
        notes.append("No strong product/category column detected (IDs excluded).")

    meta = {
        "domain": domain,
        "roles": roles_meta,
        "notes": notes,
        "rules_applied": [
            "customer_id / order_id / invoice_id never rank as product/category.",
            "Semantic keywords, cardinality, uniqueness, dtype, and domain weights are combined.",
        ],
    }
    return proposed, meta


def apply_semantic_column_mapping(frame: pd.DataFrame, profile: Dict[str, Any]) -> Dict[str, Any]:
    """Writes global column_mapping + column_mapping_metadata from inference."""
    global column_mapping, column_mapping_metadata
    proposed, meta = compute_semantic_column_mapping(frame, profile)
    column_mapping = proposed
    column_mapping_metadata = meta
    return meta


def infer_semantic_column_mapping(
    frame: pd.DataFrame, profile: Dict[str, Any]
) -> Dict[str, Any]:
    """Back-compat wrapper: infer + apply."""
    return apply_semantic_column_mapping(frame, profile)


def find_column(possible_names):
    global df

    columns = df.columns.tolist()
    lower_map = {col.lower(): col for col in columns}

    for name in possible_names:
        for col_lower, original_col in lower_map.items():
            if name in col_lower:
                return original_col

    return None


def get_mapped_or_detected_column(mapping_key, possible_names):
    global df, column_mapping, dataset_profile

    mapped = column_mapping.get(mapping_key)
    if mapped and mapped in df.columns:
        if mapping_key == "region" and not _region_column_usable(
            mapped, dataset_profile
        ):
            return None
        return mapped

    detected = find_column(possible_names)
    if mapping_key == "region":
        if detected and _region_column_usable(detected, dataset_profile):
            return detected
        return None
    return detected


def numeric_series(column_name):
    global df

    return pd.to_numeric(
        df[column_name]
        .astype(str)
        .str.replace(",", "", regex=False)
        .str.replace("₹", "", regex=False)
        .str.replace("$", "", regex=False),
        errors="coerce",
    )


def calculate_kpis():
    global df

    from services.kpi_title_validation import is_entity_dimension_column, resolve_currency_metric_column

    exec_dom = infer_executive_domain(df.columns.tolist())
    product_col = get_mapped_or_detected_column("product", ["product", "item", "sku"])
    mapped_sales = get_mapped_or_detected_column(
        "sales", ["sales", "revenue", "amount", "total", "value"]
    )
    sales_col = resolve_currency_metric_column(df.columns.tolist(), mapped_sales)
    if sales_col and not sales_column_allowed_for_domain(sales_col, exec_dom):
        sales_col = resolve_currency_metric_column(
            df.columns.tolist(),
            _find_first_column(
                df.columns.tolist(),
                ["revenue", "sales", "order_value", "order value", "amount", "spend_amount"],
            ),
        )
    if sales_col and is_entity_dimension_column(sales_col):
        sales_col = resolve_currency_metric_column(df.columns.tolist(), None)

    kpis = {
        "total_rows": len(df),
        "total_columns": len(df.columns),
        "total_sales": None,
        "top_product": None,
        "unique_products": None,
    }

    if product_col:
        kpis["unique_products"] = int(df[product_col].nunique())

    if sales_col:
        sales_values = numeric_series(sales_col)
        kpis["total_sales"] = float(sales_values.sum())

    if product_col and sales_col:
        temp = df.copy()
        temp["_sales_numeric"] = numeric_series(sales_col)

        grouped = (
            temp.groupby(product_col)["_sales_numeric"]
            .sum()
            .reset_index()
            .sort_values("_sales_numeric", ascending=False)
        )

        if not grouped.empty:
            top_row = grouped.iloc[0]
            kpis["top_product"] = {
                "name": str(top_row[product_col]),
                "value": float(top_row["_sales_numeric"]),
            }

    return kpis


def _col_lower_list(columns):
    return [str(c).lower() for c in columns]


def _find_first_column(columns, keywords):
    for c in columns:
        cl = str(c).lower()
        if any(k in cl for k in keywords):
            return c
    return None


def infer_dataset_kind() -> str:
    """Rough domain: hr | sales | operations | generic (for KPI labels only)."""
    global df
    if df is None:
        return "generic"
    columns = df.columns.tolist()
    exec_dom = infer_executive_domain(columns)
    if exec_dom == "hr":
        return "hr"
    if exec_dom == "operations":
        return "operations"
    if exec_dom in (
        "sales",
        "retail",
        "geography",
        "banking",
        "marketing",
        "finance_fpa",
        "ecommerce",
        "healthcare",
        "customer_support",
    ):
        return "sales"

    lower = _col_lower_list(columns)

    def col_has(pat_list):
        return any(any(k in c for k in pat_list) for c in lower)

    workforce_signals = col_has(
        ["employee", "emp_", "_emp", "department", "attrition", "salary", "attendance", "staff", "workforce"]
    )
    hr_definitive = col_has(
        ["employee", "emp_id", "attrition", "salary", "attendance", "staff", "workforce"]
    )
    sales_signals = col_has(["sales", "revenue", "product", "order", "sku", "customer", "invoice"])
    ops_signals = col_has(
        ["incident", "downtime", "severity", "production_loss", "repair", "plant", "outage", "mttr"]
    )

    product_col = get_mapped_or_detected_column("product", ["product", "item", "sku"])
    sales_col = get_mapped_or_detected_column("sales", ["sales", "revenue", "amount", "total", "value"])
    salary_col = _find_first_column(columns, ["salary", "ctc", "compensation", "pay", "wage"])
    dept_col = _find_first_column(
        columns, ["department", "dept", "team", "division", "business unit", "business_unit"]
    )

    clear_sales = bool(sales_col and product_col)
    biz = _infer_business_domain(columns)

    # Operational / incident datasets — before generic sales heuristics.
    if biz == "operations" or (ops_signals >= 2 and not clear_sales):
        return "operations"

    # Product + revenue cubes (and strong sales columns) beat department-only HR hints.
    if clear_sales or (sales_signals and sales_col):
        return "sales"

    # HR requires definitive workforce metrics — department alone is an org dimension.
    if hr_definitive and (salary_col or col_has(["attrition", "employee_id", "emp_id"])):
        return "hr"
    if workforce_signals and dept_col and not sales_signals:
        return "hr"
    return "generic"


def _ecommerce_column_hit(lower_cols: List[str]) -> int:
    keys = [
        "return",
        "refund",
        "cart",
        "checkout",
        "session_id",
        "channel",
        "marketplace",
        "listing",
        "order_line",
        "fulfillment",
        "shipping",
        "payment_status",
        "txn",
    ]
    return _domain_keyword_hits(lower_cols, keys)


def _manufacturing_column_hit(lower_cols: List[str]) -> int:
    keys = [
        "plant",
        "work_center",
        "workcenter",
        "bom",
        "routing",
        "batch",
        "machine",
        "oee",
        "scrap",
        "defect_rate",
        "reject_rate",
        "uptime",
        "availability",
        "downtime",
        "maintenance",
        "mttr",
        "mtbf",
        "yield",
        "throughput",
        "units_produced",
        "output",
        "shift",
        "work_order",
        "wo_",
        "wip",
        "station",
        "line_id",
    ]
    return _domain_keyword_hits(lower_cols, keys)


def infer_kpi_domain() -> str:
    """
    Domain label for KPI cards (executive-facing), finer than infer_dataset_kind().
    Returns: manufacturing | ecommerce | hr | sales | operations | generic
    """
    global df
    if df is None or df.empty:
        return "generic"
    exec_dom = infer_executive_domain(df.columns.tolist())
    return executive_domain_to_kpi_domain(exec_dom)


def _build_manufacturing_kpi_cards(
    columns: List[str], profile: Dict[str, Any]
) -> List[Dict[str, Any]]:
    """Executive manufacturing KPIs (best-effort from schema)."""
    global df
    cards: List[Dict[str, Any]] = []
    if df is None or df.empty:
        return cards
    ct = (profile or {}).get("column_types", {}) or {}

    def pick_num(kws: List[str]) -> Optional[str]:
        for c in columns:
            if ct.get(c) != "number":
                continue
            cl = str(c).lower().replace(" ", "_")
            if any(k in cl for k in kws):
                return str(c)
        return None

    def pick_cat(kws: List[str]) -> Optional[str]:
        for c in columns:
            if ct.get(c) not in ("category", "text"):
                continue
            cl = str(c).lower().replace(" ", "_")
            if any(k in cl for k in kws):
                return str(c)
        return None

    plant_col = pick_cat(["plant", "site", "facility", "location", "work_center", "workcenter", "line"])

    produced_col = pick_num(
        ["output", "produced", "units_produced", "production", "throughput", "good_qty", "quantity"]
    )
    defect_col = pick_num(["defect", "scrap", "reject", "ng_", "fault"])
    good_col = pick_num(["good_qty", "pass_qty", "ok_qty", "accepted"])

    # Defect rate %
    dr: Optional[float] = None
    if defect_col and good_col:
        try:
            d = numeric_series(defect_col)
            g = numeric_series(good_col)
            m = pd.concat([d, g], axis=1).dropna()
            if len(m) >= 1:
                td = float(m.iloc[:, 0].sum())
                tg = float(m.iloc[:, 1].sum())
                den = td + tg
                if den > 0:
                    dr = 100.0 * td / den
        except Exception:
            dr = None
    if dr is None and defect_col:
        dv = numeric_series(defect_col)
        if dv.notna().any():
            mx = float(dv.max(skipna=True))
            mn = float(dv.min(skipna=True))
            if mx <= 100.0 and mn >= 0.0 and mx > 1.0:
                dr = float(dv.mean(skipna=True))
            elif mx <= 1.05:
                dr = 100.0 * float(dv.mean(skipna=True))

    if dr is not None:
        cards.append(
            {
                "title": "Defect / reject signal",
                "value": f"{dr:.1f}%",
                "subtitle": "Share or avg rate from defect & pass columns when available",
            }
        )

    uptime_col = pick_num(["uptime", "availability", "oee"])
    if uptime_col:
        uv = numeric_series(uptime_col)
        if uv.notna().any():
            mu = float(uv.mean(skipna=True))
            if mu <= 1.05:
                mu *= 100.0
            cards.append(
                {
                    "title": "Uptime / availability",
                    "value": f"{mu:.1f}%",
                    "subtitle": str(uptime_col)[:44],
                }
            )

    if produced_col:
        pv = numeric_series(produced_col)
        if pv.notna().any():
            cards.append(
                {
                    "title": "Avg production (per row)",
                    "value": f"{float(pv.mean(skipna=True)):,.1f}",
                    "subtitle": str(produced_col)[:44],
                }
            )

    maint_col = pick_num(["maintenance", "mttr", "downtime", "pm_"])
    run_col = pick_num(["runtime", "run_time", "operating_hours", "production_hours"])
    if maint_col and run_col:
        try:
            m = numeric_series(maint_col).fillna(0)
            r = numeric_series(run_col).fillna(0)
            tot = float((m + r).sum())
            if tot > 0:
                ratio = 100.0 * float(m.sum()) / tot
                cards.append(
                    {
                        "title": "Maintenance load",
                        "value": f"{ratio:.1f}%",
                        "subtitle": "Maintenance vs maintenance+runtime (row sums)",
                    }
                )
        except Exception:
            pass
    elif maint_col:
        mv = numeric_series(maint_col)
        if mv.notna().any():
            cards.append(
                {
                    "title": "Maintenance / downtime (total)",
                    "value": f"{float(mv.sum(skipna=True)):,.0f}",
                    "subtitle": str(maint_col)[:44],
                }
            )

    if plant_col and produced_col:
        try:
            sub = df[[plant_col, produced_col]].copy()
            sub["_v"] = numeric_series(produced_col)
            sub = sub.dropna(subset=[plant_col, "_v"])
            if not sub.empty:
                g = sub.groupby(plant_col)["_v"].sum().sort_values(ascending=False)
                if not g.empty:
                    top_p = str(g.index[0])[:48]
                    top_v = float(g.iloc[0])
                    cards.append(
                        {
                            "title": "Highest output plant / line",
                            "value": top_p,
                            "subtitle": f"Output {top_v:,.0f}",
                        }
                    )
        except Exception:
            pass

    if not cards:
        cards.append(
            {
                "title": "Production records",
                "value": f"{int(len(df)):,}",
                "subtitle": "Upload operational fields (plant, output, defects) for richer KPIs",
            }
        )
        return cards[:5]


def _build_operations_kpi_cards(
    columns: List[str], profile: Dict[str, Any], kp: Dict[str, Any]
) -> List[Dict[str, Any]]:
    """Executive operational / incident KPIs from semantic mapping + schema."""
    global df
    cards: List[Dict[str, Any]] = []
    if df is None or df.empty:
        return cards

    metric_col = get_mapped_or_detected_column(
        "sales",
        [
            "production_loss",
            "downtime",
            "repair_cost",
            "maintenance_cost",
            "cost",
            "amount",
            "units",
            "loss",
            "revenue",
            "sales",
        ],
    )
    dim_col = get_mapped_or_detected_column(
        "region",
        ["plant", "site", "facility", "location", "warehouse", "region", "territory"],
    ) or get_mapped_or_detected_column(
        "product",
        ["severity", "issue_type", "issue type", "category", "type", "priority"],
    )

    cards.append(
        {"title": "Records in view", "value": f"{int(len(df)):,}", "subtitle": None}
    )

    if metric_col:
        sv = numeric_series(metric_col)
        if sv.notna().any():
            cards.append(
                {
                    "title": build_metric_label("sum", "total", metric_col),
                    "value": f"{float(sv.sum(skipna=True)):,.0f}",
                    "subtitle": None,
                }
            )
            if dim_col and dim_col in df.columns:
                try:
                    sub = df[[dim_col, metric_col]].copy()
                    sub["_v"] = numeric_series(metric_col)
                    sub = sub.dropna(subset=[dim_col, "_v"])
                    if not sub.empty:
                        g = sub.groupby(dim_col)["_v"].sum().sort_values(ascending=False)
                        if not g.empty:
                            dim_lbl = _pretty_label_text(dim_col)
                            cards.append(
                                {
                                    "title": f"Highest {dim_lbl.lower()}",
                                    "value": str(g.index[0])[:52],
                                    "subtitle": (
                                        f"{build_metric_label('max', 'peak', metric_col)} "
                                        f"{float(g.iloc[0]):,.0f}"
                                    ),
                                }
                            )
                except Exception:
                    pass

    dt_col = _find_first_column(
        columns, ["downtime", "outage", "minutes_down", "downtime_minutes"]
    )
    if dt_col and dt_col != metric_col:
        dv = numeric_series(dt_col)
        if dv.notna().any():
            cards.append(
                {
                    "title": build_metric_label("sum", "total", dt_col),
                    "value": f"{float(dv.sum(skipna=True)):,.0f}",
                    "subtitle": None,
                }
            )

    sev_col = _find_first_column(columns, ["severity", "priority", "risk_level"])
    if sev_col and sev_col != dim_col:
        try:
            vc = df[sev_col].dropna().astype(str).value_counts().head(1)
            if not vc.empty:
                cards.append(
                    {
                        "title": "Top severity level",
                        "value": str(vc.index[0])[:52],
                        "subtitle": f"{int(vc.iloc[0]):,} rows",
                    }
                )
        except Exception:
            pass

    if len(cards) < 3 and kp.get("total_rows"):
        cards.append(
            {
                "title": "Incident records",
                "value": f"{int(kp.get('total_rows') or len(df)):,}",
                "subtitle": "Rows in current filtered view",
            }
        )

    return cards[:5]


def _build_ecommerce_kpi_cards(
    columns: List[str], profile: Dict[str, Any], kp: Dict[str, Any]
) -> List[Dict[str, Any]]:
    """Executive ecommerce / retail KPIs."""
    global df
    cards: List[Dict[str, Any]] = []
    if df is None or df.empty:
        return cards

    sales_col = get_mapped_or_detected_column(
        "sales", ["sales", "revenue", "amount", "total", "value"]
    )
    order_col = _find_order_id_column(columns)
    cust_col = get_mapped_or_detected_column(
        "customer", ["customer", "client", "buyer", "account"]
    )
    cat_col = _find_first_column(
        columns,
        ["category", "segment", "collection", "department", "class", "subcategory"],
    )
    if cat_col is None:
        cat_col = get_mapped_or_detected_column(
            "product", ["product", "item", "sku", "style", "variant"]
        )

    if kp.get("total_sales") is not None and order_col:
        try:
            sub = df[[order_col]].dropna()
            uo = int(sub[order_col].nunique(dropna=True))
            if uo > 0:
                aov = float(kp["total_sales"]) / float(uo)
                cards.append(
                    {
                        "title": "Avg order value",
                        "value": f"{aov:,.0f}",
                        "subtitle": f"{uo:,} distinct orders",
                    }
                )
        except Exception:
            pass

    ret_col = _find_first_column(
        columns,
        ["returned", "is_return", "return_flag", "refund", "return_qty", "return_quantity"],
    )
    if order_col and ret_col and ret_col in df.columns:
        try:
            tmp = df[[order_col, ret_col]].copy()
            rc = tmp[ret_col]
            if pd.api.types.is_numeric_dtype(rc):
                bad = tmp[pd.to_numeric(rc, errors="coerce").fillna(0) > 0]
            else:
                rs = rc.astype(str).str.lower().str.strip()
                bad = tmp[
                    rs.isin(
                        {"1", "true", "yes", "y", "returned", "refunded", "rma"}
                    )
                ]
                tot_o = int(tmp[order_col].nunique())
                ret_o = int(bad[order_col].nunique()) if not bad.empty else 0
                if tot_o > 0:
                    cards.append(
                        {
                            "title": "Return / refund rate (orders)",
                            "value": f"{100.0 * ret_o / tot_o:.1f}%",
                            "subtitle": f"{ret_o:,} of {tot_o:,} orders flagged",
                        }
                    )
        except Exception:
            pass

    if order_col and cust_col:
        try:
            oc = df[[order_col, cust_col]].dropna()
            if not oc.empty:
                freq = oc.groupby(cust_col)[order_col].nunique()
                repeat = int((freq > 1).sum())
                buyers = int(freq.shape[0])
                if buyers > 0:
                    cards.append(
                        {
                            "title": "Repeat customer rate",
                            "value": f"{100.0 * repeat / buyers:.1f}%",
                            "subtitle": f"{repeat:,} repeat of {buyers:,} customers",
                        }
                    )
        except Exception:
            pass

    if cat_col and sales_col:
        try:
            sub = df[[cat_col, sales_col]].copy()
            sub["_v"] = numeric_series(sales_col)
            sub = sub.dropna(subset=[cat_col, "_v"])
            if not sub.empty:
                g = sub.groupby(cat_col)["_v"].sum().sort_values(ascending=False)
                if not g.empty:
                    top_c = str(g.index[0])[:48]
                    top_v = float(g.iloc[0])
                    tot = float(g.sum()) or 1.0
                    conc = 100.0 * top_v / tot
                    hhi = float(((g / tot) ** 2).sum() * 100.0)
                    cards.append(
                        {
                            "title": "Top category / SKU group",
                            "value": top_c,
                            "subtitle": f"{conc:.1f}% of revenue",
                        }
                    )
                    cards.append(
                        {
                            "title": "Revenue concentration (HHI)",
                            "value": f"{hhi:.0f}",
                            "subtitle": "100 = single group; lower = more diversified mix",
                        }
                    )
        except Exception:
            pass

    if kp.get("total_sales") is not None:
        cards.append(
            {
                "title": "Total revenue",
                "value": f'{float(kp["total_sales"]):,.0f}',
                "subtitle": None,
            }
        )

    out: List[Dict[str, Any]] = []
    seen: set = set()
    for c in cards:
        t = str(c.get("title", "")).strip()
        if t and t not in seen:
            seen.add(t)
            out.append(c)
        if len(out) >= 5:
            break
    return out[:5]


def _build_generic_executive_kpi_cards(
    columns: List[str], profile: Dict[str, Any]
) -> List[Dict[str, Any]]:
    """Prefer light business signals over raw schema counts."""
    global df
    cards: List[Dict[str, Any]] = []
    if df is None or df.empty:
        return cards
    ct = (profile or {}).get("column_types", {}) or {}
    cards.append(
        {"title": "Records in dataset", "value": f"{int(len(df)):,}", "subtitle": None}
    )

    date_c = _find_first_column(
        columns,
        ["date", "order date", "timestamp", "created", "period", "month", "fiscal"],
    )
    if date_c:
        try:
            dc = pd.to_datetime(df[date_c], errors="coerce").dropna()
            if len(dc) >= 2:
                cards.append(
                    {
                        "title": "Reporting window",
                        "value": f"{(dc.max() - dc.min()).days} days",
                        "subtitle": f"{dc.min().date()} → {dc.max().date()}",
                    }
                )
        except Exception:
            pass

    money_col = _find_first_column(
        columns,
        ["revenue", "sales", "amount", "total", "value", "price", "cost", "budget"],
    )
    if money_col and ct.get(money_col) == "number":
        sv = numeric_series(money_col)
        if sv.notna().any():
            cards.append(
                {
                    "title": f"Total {_pretty_label_text(money_col)}",
                    "value": f"{float(sv.sum(skipna=True)):,.0f}",
                    "subtitle": "Sum of primary numeric metric",
                }
            )

    cat_dim = None
    for c in columns:
        if ct.get(c) in ("category", "text") and df[c].nunique(dropna=True) <= 80:
            cat_dim = c
            break
    if cat_dim:
        try:
            vc = df[cat_dim].astype(str).value_counts().head(1)
            if not vc.empty:
                cards.append(
                    {
                        "title": "Largest segment",
                        "value": str(vc.index[0])[:52],
                        "subtitle": f"{int(vc.iloc[0]):,} rows · {_pretty_label_text(cat_dim)}",
                    }
                )
        except Exception:
            pass

    if len(cards) < 4:
        cards.append(
            {
                "title": "Tracked attributes",
                "value": f"{len(columns):,}",
                "subtitle": "Columns available for analysis",
            }
        )
    return cards[:5]


def _dimension_label_for_kpi(col: Optional[str]) -> str:
    """Short dimension noun for KPI titles (Campaign, Channel, Category)."""
    if not col or not str(col).strip():
        return "Category"
    phrase = _pretty_label_text(str(col).strip())
    phrase = re.sub(r"\s+names?$", "", phrase, flags=re.I)
    phrase = re.sub(r"\s+ids?$", "", phrase, flags=re.I)
    phrase = re.sub(r"\s+codes?$", "", phrase, flags=re.I)
    phrase = phrase.strip()
    if not phrase:
        return "Category"
    return " ".join(w[:1].upper() + w[1:].lower() for w in phrase.split())


def _kpi_title_top_dimension(col: Optional[str]) -> str:
    return f"Top {_dimension_label_for_kpi(col)}"


def _kpi_title_dimension_count(col: Optional[str]) -> str:
    if not col or not str(col).strip():
        return "Categories tracked"
    return f"{_dimension_label_for_kpi(col)} count"


def _kpi_title_total_sales_metric(sales_col: Optional[str]) -> str:
    if sales_col and "revenue" in str(sales_col).lower():
        return "Total Revenue"
    if sales_col:
        return build_metric_label("sum", "total", str(sales_col))
    return "Total Sales"


def _append_sales_domain_kpi_cards(
    cards: List[Dict[str, Any]],
    kp: Dict[str, Any],
    profile: Dict[str, Any],
    columns: List[str],
) -> None:
    """Sales / marketing-adjacent KPI row labels driven by semantic column mapping."""
    global df
    product_col = get_mapped_or_detected_column(
        "product",
        ["product", "item", "sku", "category", "campaign", "campaign_name"],
    )
    sales_col = get_mapped_or_detected_column(
        "sales", ["sales", "revenue", "amount", "total", "value"]
    )
    profit_col = get_mapped_or_detected_column(
        "profit", ["profit", "margin", "net profit", "earnings", "gp"]
    )
    rev_label = _kpi_title_total_sales_metric(sales_col)
    top_product_title = _kpi_title_top_dimension(product_col)

    if kp.get("total_sales") is not None:
        cards.append(
            {
                "title": rev_label,
                "value": f'{float(kp["total_sales"]):,.0f}',
                "subtitle": None,
            }
        )
    elif sales_col and df is not None and sales_col in df.columns:
        sv = numeric_series(sales_col)
        if sv.notna().any():
            cards.append(
                {
                    "title": rev_label,
                    "value": f"{float(sv.sum(skipna=True)):,.0f}",
                    "subtitle": None,
                }
            )
        else:
            cards.append({"title": rev_label, "value": "N/A", "subtitle": None})
    else:
        cards.append({"title": rev_label, "value": "N/A", "subtitle": None})

    avg_rev_title = (
        "Average Revenue"
        if sales_col and "revenue" in str(sales_col).lower()
        else build_metric_label("mean", "average", sales_col)
    )
    if sales_col and df is not None and sales_col in df.columns:
        sv = numeric_series(sales_col)
        if sv.notna().any():
            cards.append(
                {
                    "title": avg_rev_title,
                    "value": f"{float(sv.mean(skipna=True)):,.0f}",
                    "subtitle": None,
                }
            )
        else:
            cards.append(
                {
                    "title": avg_rev_title,
                    "value": "N/A",
                    "subtitle": None,
                }
            )

    if profit_col and df is not None and profit_col in df.columns:
        pv = numeric_series(profit_col)
        if pv.notna().any():
            cards.append(
                {
                    "title": "Total Profit"
                    if "profit" in str(profit_col).lower()
                    else build_metric_label("sum", "total", profit_col),
                    "value": f"{float(pv.sum(skipna=True)):,.0f}",
                    "subtitle": None,
                }
            )

    region_col = get_mapped_or_detected_column(
        "region", ["region", "state", "city", "location", "country", "territory"]
    )
    if (
        region_col
        and sales_col
        and _region_column_usable(region_col, profile)
    ):
        temp = df[[region_col, sales_col]].copy()
        temp["_v"] = numeric_series(sales_col)
        g = temp.groupby(region_col, dropna=True)["_v"].sum().sort_values(ascending=False)
        if not g.empty:
            top_reg = str(g.index[0])[:42]
            top_val = float(g.iloc[0])
            geo_title = _kpi_title_top_dimension(region_col)
            cards.append(
                {
                    "title": geo_title,
                    "value": top_reg,
                    "subtitle": rev_label.replace("Total ", "") + f" {top_val:,.0f}",
                }
            )

    if kp.get("top_product"):
        tp = kp["top_product"]
        cards.append(
            {
                "title": top_product_title,
                "value": str(tp.get("name", "—"))[:60],
                "subtitle": f'{float(tp.get("value", 0)):,.0f}',
            }
        )
    elif product_col and sales_col and df is not None:
        cards.append({"title": top_product_title, "value": "N/A", "subtitle": None})

    order_col = _find_order_id_column(columns)
    if len(cards) < 5 and order_col and sales_col and kp.get("total_sales") is not None:
        sub_o = df[[order_col, sales_col]].dropna(subset=[order_col])
        sub_o["_v"] = numeric_series(sales_col)
        uniq_orders = sub_o[order_col].nunique(dropna=True)
        if uniq_orders > 1:
            aov = float(kp["total_sales"]) / float(uniq_orders)
            cards.append(
                {
                    "title": "Average Order Value",
                    "value": f"{aov:,.0f}",
                    "subtitle": f"{int(uniq_orders):,} orders",
                }
            )


def _kpi_build_context(profile: Dict[str, Any], kp: Dict[str, Any]) -> KpiBuildContext:
    return KpiBuildContext(
        df=df,
        columns=df.columns.tolist(),
        profile=profile,
        kp=kp,
        get_mapped_column=get_mapped_or_detected_column,
        numeric_series=numeric_series,
        pretty_label=_pretty_label_text,
        region_usable=_region_column_usable,
        find_order_id=_find_order_id_column,
    )


EXECUTIVE_DASHBOARD_LABELS = {
    "hr": "HR / Employee",
    "banking": "Banking / Financial Services",
    "healthcare": "Healthcare",
    "customer_support": "Customer Support",
    "operations": "Operations",
    "marketing": "Marketing",
    "finance_fpa": "Finance / FP&A",
    "geography": "Geographic Analytics",
    "retail": "Retail / Ecommerce",
    "sales": "Sales",
    "ecommerce": "Retail / Ecommerce",
    "generic": "Generic",
}


def build_kpi_cards() -> Tuple[List[Dict[str, Any]], str]:
    """UI + PDF KPI cards with human-facing labels."""
    global df, dataset_profile
    if df is None:
        return [], "generic"

    profile = dataset_profile or build_profile(df)
    kp = calculate_kpis()
    columns = df.columns.tolist()
    exec_domain = infer_executive_domain(columns)
    domain = executive_domain_to_kpi_domain(exec_domain)
    cards = build_executive_kpi_cards(exec_domain, _kpi_build_context(profile, kp))
    return cards[:5], domain


AUTO_DASHBOARD_LABELS = {
    "hr": "HR / Employee",
    "sales": "Sales",
    "finance": "Finance",
    "operations": "Operations",
    "marketing": "Marketing",
    "generic": "Generic",
}


def _domain_keyword_hits(lower_cols: List[str], keywords: List[str]) -> int:
    hits = 0
    for c in lower_cols:
        cn = str(c).lower().replace(" ", "_")
        for k in keywords:
            if k in cn:
                hits += 1
                break
    return hits


def infer_auto_dashboard_kind() -> str:
    """Wider taxonomy than infer_dataset_kind: hr, sales, finance, operations, marketing, generic."""
    global df
    if df is None:
        return "generic"

    columns = df.columns.tolist()
    lower = _col_lower_list(columns)

    hr_kw = [
        "employee",
        "emp_id",
        "salary",
        "department",
        "attrition",
        "staff",
        "workforce",
        "attendance",
        "job_title",
        "designation",
        "benefits",
        "tenure",
    ]
    fin_kw = [
        "budget",
        "expense",
        "ledger",
        "account",
        "payment",
        "tax",
        "ebitda",
        "payable",
        "receivable",
        "journal",
        "invoice",
        "margin",
        "profit",
        "cost_center",
        "gl_",
    ]
    ops_kw = [
        "inventory",
        "warehouse",
        "shipment",
        "logistics",
        "supply",
        "production",
        "capacity",
        "defect",
        "sla",
        "fulfillment",
        "stock",
        "batch",
        "routing",
        "downtime",
        "incident",
        "severity",
        "production_loss",
        "repair",
        "plant",
        "outage",
        "mttr",
        "mtbf",
    ]
    mkt_kw = [
        "campaign",
        "impression",
        "click",
        "ctr",
        "conversion",
        "channel",
        "advertising",
        "ad_",
        "lead",
        "funnel",
        "acquisition",
        "cpc",
        "cpm",
    ]

    scores: Dict[str, int] = {
        "finance": _domain_keyword_hits(lower, fin_kw),
        "operations": _domain_keyword_hits(lower, ops_kw),
        "marketing": _domain_keyword_hits(lower, mkt_kw),
        "sales": _domain_keyword_hits(
            lower,
            ["sales", "revenue", "order", "qty", "quantity", "customer", "sku", "invoice"],
        ),
        "hr": _domain_keyword_hits(lower, hr_kw),
    }

    product_col = get_mapped_or_detected_column("product", ["product", "item", "sku"])
    sales_col_guess = get_mapped_or_detected_column(
        "sales", ["sales", "revenue", "amount", "total", "value"]
    )
    biz_domain = _infer_business_domain(columns)

    if biz_domain == "operations":
        scores["operations"] += 8

    if product_col and sales_col_guess and biz_domain != "operations":
        scores["sales"] += 6

    hr_strong_row = ("salary" in " ".join(lower)) and any(
        x in " ".join(lower) for x in ["department", "dept", "team"]
    )
    if hr_strong_row:
        scores["hr"] += 4
    if any("attrition" in c or "employee" in c for c in lower):
        scores["hr"] += 2

    if product_col and sales_col_guess:
        scores["sales"] += 4
        if any(k in " ".join(lower) for k in ("profit", "cost", "customer_segment", "region")):
            scores["sales"] += 3

    base_kind = infer_dataset_kind()
    if base_kind == "hr":
        return "hr"
    if base_kind == "sales":
        return "sales"
    if base_kind == "operations":
        return "operations"

    best_secondary = max(
        ["sales", "finance", "operations", "marketing"], key=lambda k: scores[k]
    )
    if scores[best_secondary] >= 2:
        return best_secondary

    if scores["hr"] >= 3 and base_kind != "sales":
        return "hr"

    return "generic"


def _find_attrition_risk_column(columns):
    for c in columns:
        cn = str(c).lower().replace(" ", "_")
        if ("risk" in cn) and ("attrition" in cn or "churn" in cn or "flight" in cn):
            return c
        if cn in ("attrition_risk", "risk_score", "risklevel", "attritionrisk"):
            return c
        if cn == "attrition" and "score" not in cn:
            return c  # categorical Yes / High / Risk
    return None


def _count_high_attrition_risk(series) -> Tuple[int, int]:
    """Return (high_count, total_considered)."""
    s = series.dropna()
    n = int(len(s))
    if n == 0:
        return 0, 0

    numeric = pd.to_numeric(s.astype(str).str.strip(), errors="coerce")
    if numeric.notna().sum() >= max(5, int(0.6 * n)):
        vals = numeric.dropna()
        if vals.max() <= 1.05 and vals.min() >= -0.05:
            thresh = float(vals.quantile(0.75))
            if thresh <= 1.5:
                return int((vals >= 0.7).sum()), int(len(vals))
        thresh = float(vals.quantile(0.85))
        return int((vals >= thresh).sum()), int(len(vals))

    lowered = s.astype(str).str.strip().str.lower()
    highish = lowered.isin(
        {"high", "yes", "y", "1", "true", "risk", "at risk", "at_risk"}
    )
    return int(highish.sum()), n


def _find_order_id_column(columns):
    return _find_first_column(
        columns,
        [
            "order_id",
            "order id",
            "transaction_id",
            "txn_id",
            "order_number",
            "order_no",
            "invoice_id",
            "transaction",
        ],
    )


def _append_unique_dashboard_chart(
    out: List[Dict[str, Any]], payload: Optional[Dict[str, Any]]
) -> None:
    if not payload:
        return
    if len(out) >= 8:
        return
    title = str(payload.get("title") or "").strip()
    if not title:
        return
    if any(str(c.get("title", "")).strip() == title for c in out):
        return
    out.append(payload)


_DASH_RECORD_METRIC_KEY = "__records__"
_DASH_BREAKDOWN_CHART_TYPES = frozenset(
    {"bar", "horizontalbar", "pie", "donut", "histogram"}
)
_DASH_TEMPORAL_CHART_TYPES = frozenset({"line", "area"})


def _dash_norm_chart_type(chart_type: Optional[str]) -> str:
    ct = (chart_type or "bar").strip().lower()
    if ct == "horizontalbar":
        return "horizontalbar"
    return ct


def _dash_chart_dimension_column(chart: Dict[str, Any]) -> Optional[str]:
    dim = chart.get("dimensionColumn")
    if dim:
        return str(dim).strip().lower()
    inter = chart.get("interaction") or {}
    drill = inter.get("drillDimensions") or []
    if drill and isinstance(drill[0], dict):
        col = drill[0].get("column")
        if col:
            return str(col).strip().lower()
    return None


def _dash_chart_metric_column(chart: Dict[str, Any]) -> str:
    mc = chart.get("metricColumn")
    if mc:
        return str(mc).strip().lower()
    title = str(chart.get("title") or "").strip().lower()
    if any(
        k in title
        for k in (
            "employee count",
            "record count",
            "count of records",
            "category distribution",
            "distribution ·",
        )
    ):
        return _DASH_RECORD_METRIC_KEY
    return title


def _dash_priority_metric_columns(kind: str) -> Tuple[Optional[str], Optional[str], Optional[str]]:
    """Primary metric, secondary metric, record-count column (if any)."""
    global df, dataset_profile
    if df is None:
        return None, None, None

    columns = df.columns.tolist()
    profile = dataset_profile or build_profile(df)
    ct = profile.get("column_types", {})

    primary = get_mapped_or_detected_column(
        "sales", ["sales", "revenue", "amount", "total", "value"]
    )
    secondary = get_mapped_or_detected_column(
        "profit", ["profit", "margin", "net profit", "earnings", "gp"]
    )

    if not secondary:
        nums = [
            c
            for c in columns
            if ct.get(c) == "number" and not _id_like_column_name(c)
        ]
        for c in nums:
            if primary and str(c).lower() == str(primary).lower():
                continue
            secondary = c
            break

    record_col = None
    if kind == "hr":
        record_col = _find_first_column(
            columns,
            ["employee_id", "emp_id", "staff_id", "emp id", "employee id"],
        )
    if not record_col:
        record_col = _find_order_id_column(columns)
    return primary, secondary, record_col


def _dash_chart_priority_score(
    chart: Dict[str, Any],
    primary: Optional[str],
    secondary: Optional[str],
) -> int:
    mk = _dash_chart_metric_column(chart)
    score = 0
    if primary and mk == str(primary).strip().lower():
        score += 100
    elif secondary and mk == str(secondary).strip().lower():
        score += 80
    elif mk == _DASH_RECORD_METRIC_KEY:
        score += 60
    else:
        score += 20
    ct = _dash_norm_chart_type(chart.get("chartType"))
    if ct in _DASH_TEMPORAL_CHART_TYPES:
        score += 8
    elif ct in {"donut", "pie"}:
        score += 6
    elif ct in {"bar", "horizontalbar"}:
        score += 4
    return score


def _dash_metric_dim_only_duplicate(
    selected: List[Dict[str, Any]], candidate: Dict[str, Any]
) -> bool:
    """Reject a second breakdown chart that only swaps grouping dimension for same metric."""
    cm = _dash_chart_metric_column(candidate)
    cd = _dash_chart_dimension_column(candidate)
    if not cd:
        return False
    for existing in selected:
        if _dash_chart_metric_column(existing) != cm:
            continue
        ed = _dash_chart_dimension_column(existing)
        if not ed or ed == cd:
            continue
        ect = _dash_norm_chart_type(existing.get("chartType"))
        cct = _dash_norm_chart_type(candidate.get("chartType"))
        if ect in _DASH_BREAKDOWN_CHART_TYPES and cct in _DASH_BREAKDOWN_CHART_TYPES:
            if ect not in _DASH_TEMPORAL_CHART_TYPES and cct not in _DASH_TEMPORAL_CHART_TYPES:
                return True
    return False


def _finalize_auto_dashboard_charts(
    charts: List[Dict[str, Any]], *, kind: str, max_charts: int = 3
) -> List[Dict[str, Any]]:
    """
    Curate auto-dashboard mini charts:
    - prefer primary / secondary / record-count metrics
    - max two uses of the same metric
    - avoid same-metric charts that only differ by grouping dimension
    - prefer diverse chart types when possible
    """
    if not charts:
        return []

    primary, secondary, _record_col = _dash_priority_metric_columns(kind)
    remaining = list(charts)
    selected: List[Dict[str, Any]] = []
    metric_usage: Dict[str, int] = {}
    types_used: set = set()

    while len(selected) < max_charts and remaining:
        best_idx = -1
        best_score = -1
        for i, chart in enumerate(remaining):
            mk = _dash_chart_metric_column(chart)
            if metric_usage.get(mk, 0) >= 2:
                continue
            if _dash_metric_dim_only_duplicate(selected, chart):
                continue
            sc = _dash_chart_priority_score(chart, primary, secondary)
            ct = _dash_norm_chart_type(chart.get("chartType"))
            if ct not in types_used:
                sc += 12
            if sc > best_score:
                best_score = sc
                best_idx = i
        if best_idx < 0:
            break
        pick = remaining.pop(best_idx)
        mk = _dash_chart_metric_column(pick)
        metric_usage[mk] = metric_usage.get(mk, 0) + 1
        types_used.add(_dash_norm_chart_type(pick.get("chartType")))
        selected.append(pick)

    return selected[:max_charts]


def _dash_series_payload(
    title: str,
    series: pd.Series,
    *,
    chart_type: str,
    max_points: int = 14,
    category_column: Optional[str] = None,
    metric_column: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    if series is None or series.empty:
        return None
    ct_in = chart_type.strip().lower()
    if ct_in in ("line", "area"):
        try:
            series = _sort_chronologically_by_bucket_labels(series).head(max_points)
        except Exception:
            series = series.head(max_points)
    else:
        series = series.sort_values(ascending=False).head(max_points)
    labels = [_pretty_label_text(x) for x in series.index.tolist()]
    try:
        values = [float(v) if (v == v) else 0.0 for v in series.values]
    except Exception:
        return None
    if not labels or not values:
        return None
    ct_l = chart_type.strip().lower()
    if ct_l == "horizontalbar":
        ct_norm = "horizontalBar"
    elif ct_l == "donut":
        ct_norm = "donut"
    elif ct_l == "pie":
        ct_norm = "pie"
    elif ct_l == "line":
        ct_norm = "line"
    elif ct_l == "area":
        ct_norm = "area"
    elif ct_l == "scatter":
        ct_norm = "scatter"
    elif ct_l == "histogram":
        ct_norm = "histogram"
    else:
        ct_norm = "bar"
    out: Dict[str, Any] = {
        "title": title.strip(),
        "chartType": ct_norm,
        "labels": labels,
        "values": values,
    }
    if category_column and str(category_column).strip():
        cc = str(category_column).strip()
        out["dimensionColumn"] = cc
        out["interaction"] = {
            "drillDimensions": [
                {
                    "column": cc,
                    "role": "primary",
                    "label": _pretty_label_text(cc),
                }
            ]
        }
    if metric_column and str(metric_column).strip():
        out["metricColumn"] = str(metric_column).strip()
    return out


def _dash_hr_dashboard_charts() -> List[Dict[str, Any]]:
    global df, dataset_profile
    out_ch: List[Dict[str, Any]] = []
    if df is None or df.empty:
        return out_ch
    columns = df.columns.tolist()

    emp_id_col = _find_first_column(
        columns,
        ["employee_id", "emp_id", "staff_id", "emp id", "employee id"],
    )
    if emp_id_col is None:
        for c in columns:
            cl = str(c).lower().replace(" ", "_")
            if "employee" in cl and "id" in cl:
                emp_id_col = c
                break

    dept_col = _find_first_column(columns, ["department", "dept", "team", "division"])
    salary_col = _find_first_column(
        columns, ["salary", "ctc", "compensation", "pay", "wage"]
    )

    loc_col = get_mapped_or_detected_column(
        "region", ["location", "city", "office", "site", "branch", "region", "state"]
    )
    if loc_col == dept_col:
        loc_col = None
    if not loc_col:
        loc_col = _find_first_column(
            columns,
            ["location", "city", "office", "site", "branch", "region", "state"],
        )
    if loc_col == dept_col:
        loc_col = _find_first_column(
            columns,
            ["office", "site", "branch", "country"],
        )

    if dept_col and dept_col in df.columns:
        try:
            use_cols = [dept_col] + ([emp_id_col] if emp_id_col else [])
            sub = df[use_cols].dropna(subset=[dept_col])
            if not sub.empty:
                if emp_id_col and emp_id_col in sub.columns:
                    g = sub.groupby(dept_col)[emp_id_col].nunique(dropna=True)
                else:
                    g = sub.groupby(dept_col).size()
                _append_unique_dashboard_chart(
                    out_ch,
                    _dash_series_payload(
                        "Employee count by department",
                        g,
                        chart_type="bar",
                        category_column=dept_col,
                        metric_column=_DASH_RECORD_METRIC_KEY,
                    ),
                )
        except Exception:
            pass

    if dept_col and salary_col and dept_col != salary_col:
        try:
            sub = df[[dept_col, salary_col]].copy()
            sub["_v"] = numeric_series(salary_col)
            sub = sub.dropna(subset=[dept_col, "_v"])
            if not sub.empty:
                g = sub.groupby(dept_col)["_v"].mean()
                _append_unique_dashboard_chart(
                    out_ch,
                    _dash_series_payload(
                        "Average salary by department",
                        g,
                        chart_type="horizontalBar",
                        category_column=dept_col,
                        metric_column=salary_col,
                    ),
                )
        except Exception:
            pass

    if (
        loc_col
        and loc_col in df.columns
        and (not dept_col or loc_col != dept_col)
    ):
        try:
            use_cols = [loc_col] + ([emp_id_col] if emp_id_col else [])
            sub = df[use_cols].dropna(subset=[loc_col])
            if not sub.empty:
                if emp_id_col and emp_id_col in sub.columns:
                    g = sub.groupby(loc_col)[emp_id_col].nunique(dropna=True)
                else:
                    g = sub.groupby(loc_col).size()
                _append_unique_dashboard_chart(
                    out_ch,
                    _dash_series_payload(
                        "Employee count by location",
                        g,
                        chart_type="donut",
                        category_column=loc_col,
                        metric_column=_DASH_RECORD_METRIC_KEY,
                    ),
                )
        except Exception:
            pass

    date_col = _find_first_column(
        columns,
        ["joining_date", "hire date", "start date", "date joined", "join date"],
    )
    if date_col and date_col in df.columns:
        try:
            sub = df[[date_col]].copy()
            sub["_v"] = 1.0
            g_series, _tsm = _adaptive_time_series_grouped(
                sub, str(date_col), "_v", agg_key="sum"
            )
            if g_series is not None and len(g_series) >= 2:
                tb = _freq_human_label(str(_tsm.get("timeBucket") or "M"))
                _append_unique_dashboard_chart(
                    out_ch,
                    _dash_series_payload(
                        f"Employee count Trend by {tb}",
                        g_series,
                        chart_type="line",
                        metric_column=_DASH_RECORD_METRIC_KEY,
                    ),
                )
        except Exception:
            pass

    return out_ch


def _dash_chart_title_by_dimension(
    metric_col: str,
    dim_col: str,
    *,
    agg_key: str = "sum",
    chart_type: str = "horizontalBar",
) -> str:
    """Schema-aware chart title with aggregation, e.g. Total X by plant."""
    return build_insight_title(agg_key, metric_col, dim_col, chart_type)


def _dash_sales_dashboard_charts() -> List[Dict[str, Any]]:
    global df
    out_ch: List[Dict[str, Any]] = []
    if df is None or df.empty:
        return out_ch
    columns = df.columns.tolist()
    sales_col = get_mapped_or_detected_column(
        "sales", ["sales", "revenue", "amount", "total", "value"]
    )
    if not sales_col or sales_col not in df.columns:
        return out_ch

    product_col = get_mapped_or_detected_column(
        "product",
        ["product", "sku", "item", "material", "category", "segment", "line"],
    )

    region_col = get_mapped_or_detected_column(
        "region",
        ["region", "state", "location", "territory", "country", "area", "market"],
    )

    date_col = get_mapped_or_detected_column(
        "date",
        ["date", "order date", "transaction date", "invoice date", "month", "period"],
    )

    if product_col and product_col in df.columns:
        title = _dash_chart_title_by_dimension(sales_col, product_col)
        try:
            sub = df[[product_col, sales_col]].copy()
            sub["_v"] = numeric_series(sales_col)
            sub = sub.dropna(subset=[product_col, "_v"])
            if not sub.empty:
                g = sub.groupby(product_col)["_v"].sum()
                _append_unique_dashboard_chart(
                    out_ch,
                    _dash_series_payload(
                        title,
                        g,
                        chart_type="horizontalBar",
                        category_column=product_col,
                        metric_column=sales_col,
                    ),
                )
        except Exception:
            pass

    if region_col and region_col in df.columns and region_col != product_col:
        try:
            sub = df[[region_col, sales_col]].copy()
            sub["_v"] = numeric_series(sales_col)
            sub = sub.dropna(subset=[region_col, "_v"])
            if not sub.empty:
                g = sub.groupby(region_col)["_v"].sum()
                _append_unique_dashboard_chart(
                    out_ch,
                    _dash_series_payload(
                        _dash_chart_title_by_dimension(sales_col, region_col),
                        g,
                        chart_type="bar",
                        category_column=region_col,
                        metric_column=sales_col,
                    ),
                )
        except Exception:
            pass

    if date_col and date_col in df.columns:
        try:
            g_series, _tsm = _adaptive_time_series_grouped(
                df, str(date_col), str(sales_col), agg_key="sum"
            )
            if g_series is not None and len(g_series) >= 2:
                tb = _freq_human_label(str(_tsm.get("timeBucket") or "M"))
                metric_lbl = _pretty_label_text(sales_col)
                _append_unique_dashboard_chart(
                    out_ch,
                    _dash_series_payload(
                        f"{metric_lbl} Trend by {tb}",
                        g_series,
                        chart_type="line",
                        metric_column=sales_col,
                    ),
                )
        except Exception:
            pass

    profit_col = get_mapped_or_detected_column(
        "profit", ["profit", "margin", "net profit", "earnings", "gp"]
    )
    if (
        profit_col
        and profit_col in df.columns
        and profit_col != sales_col
        and product_col
        and product_col in df.columns
    ):
        try:
            sub = df[[product_col, profit_col]].copy()
            sub["_v"] = numeric_series(profit_col)
            sub = sub.dropna(subset=[product_col, "_v"])
            if not sub.empty:
                g = sub.groupby(product_col)["_v"].sum()
                _append_unique_dashboard_chart(
                    out_ch,
                    _dash_series_payload(
                        _dash_chart_title_by_dimension(profit_col, product_col),
                        g,
                        chart_type="donut",
                        category_column=product_col,
                        metric_column=profit_col,
                    ),
                )
        except Exception:
            pass

    return out_ch


def _dash_operations_dashboard_charts() -> List[Dict[str, Any]]:
    """Schema-aware operational / incident mini-charts for Overview auto dashboard."""
    global df
    out_ch: List[Dict[str, Any]] = []
    if df is None or df.empty:
        return out_ch

    metric_col = get_mapped_or_detected_column(
        "sales",
        [
            "production_loss",
            "downtime",
            "repair_cost",
            "maintenance_cost",
            "cost",
            "amount",
            "units",
            "loss",
        ],
    )
    if not metric_col or metric_col not in df.columns:
        return out_ch

    dim_col = get_mapped_or_detected_column(
        "region",
        ["plant", "site", "facility", "location", "warehouse", "region"],
    ) or get_mapped_or_detected_column(
        "product",
        ["severity", "issue_type", "issue type", "category", "type", "priority"],
    )

    date_col = get_mapped_or_detected_column(
        "date",
        [
            "incident_date",
            "date",
            "event_date",
            "occurred",
            "timestamp",
            "reported",
            "month",
            "period",
        ],
    )

    if dim_col and dim_col in df.columns:
        try:
            sub = df[[dim_col, metric_col]].copy()
            sub["_v"] = numeric_series(metric_col)
            sub = sub.dropna(subset=[dim_col, "_v"])
            if not sub.empty:
                g = sub.groupby(dim_col)["_v"].sum()
                _append_unique_dashboard_chart(
                    out_ch,
                    _dash_series_payload(
                        _dash_chart_title_by_dimension(metric_col, dim_col),
                        g,
                        chart_type="horizontalBar",
                        category_column=dim_col,
                        metric_column=metric_col,
                    ),
                )
        except Exception:
            pass

    alt_dim = get_mapped_or_detected_column(
        "product", ["severity", "issue_type", "issue type"]
    )
    if (
        alt_dim
        and alt_dim in df.columns
        and alt_dim != dim_col
        and len(out_ch) < 3
    ):
        try:
            sub = df[[alt_dim, metric_col]].copy()
            sub["_v"] = numeric_series(metric_col)
            sub = sub.dropna(subset=[alt_dim, "_v"])
            if not sub.empty:
                g = sub.groupby(alt_dim)["_v"].sum()
                _append_unique_dashboard_chart(
                    out_ch,
                    _dash_series_payload(
                        _dash_chart_title_by_dimension(metric_col, alt_dim),
                        g,
                        chart_type="bar",
                        category_column=alt_dim,
                        metric_column=metric_col,
                    ),
                )
        except Exception:
            pass

    if date_col and date_col in df.columns and len(out_ch) < 3:
        try:
            g_series, _tsm = _adaptive_time_series_grouped(
                df, str(date_col), str(metric_col), agg_key="sum"
            )
            if g_series is not None and len(g_series) >= 2:
                tb = _freq_human_label(str(_tsm.get("timeBucket") or "M"))
                metric_lbl = _pretty_label_text(metric_col)
                _append_unique_dashboard_chart(
                    out_ch,
                    _dash_series_payload(
                        f"{metric_lbl} Trend by {tb}",
                        g_series,
                        chart_type="line",
                        metric_column=metric_col,
                    ),
                )
        except Exception:
            pass

    return out_ch


def _dash_pick_generic_category(
    df_in: pd.DataFrame, columns: List[str], ct: Dict[str, Any], exclude: Optional[set]
) -> Optional[str]:
    ex = exclude or set()
    scored: List[Tuple[int, int, str]] = []
    for c in columns:
        if c in ex or ct.get(c) not in ("category", "text"):
            continue
        nu = int(df_in[c].dropna().astype(str).nunique())
        if nu < 2 or nu > 55:
            continue
        skew = abs(nu - 14)
        scored.append((skew, nu, str(c)))
    scored.sort(key=lambda t: (t[0], t[1]))
    return scored[0][2] if scored else None


def _dash_pick_generic_numeric(
    df_in: pd.DataFrame, columns: List[str], ct: Dict[str, Any], exclude: Optional[set]
) -> Optional[str]:
    ex = exclude or set()
    for c in columns:
        if c in ex or ct.get(c) != "number":
            continue
        if _id_like_column_name(c):
            continue
        ss = numeric_series(c)
        if ss.notna().sum() >= 3:
            return str(c)
    nums = [c for c in columns if ct.get(c) == "number" and c not in ex]
    return nums[0] if nums else None


def _dash_pick_generic_date(
    df_in: pd.DataFrame, columns: List[str], ct: Dict[str, Any]
) -> Optional[str]:
    for c in columns:
        if ct.get(c) == "date":
            dd = pd.to_datetime(df_in[c], errors="coerce")
            if dd.notna().sum() >= max(5, int(0.08 * len(df_in))):
                return str(c)
    for c in columns:
        if ct.get(c) not in ("text", "category"):
            continue
        dd = pd.to_datetime(df_in[c], errors="coerce")
        hits = dd.notna().sum()
        if hits >= max(10, int(0.18 * len(df_in))):
            return str(c)
    return _find_first_column(
        df_in.columns.tolist(),
        ["date", "order date", "transaction date", "timestamp", "created", "month"],
    )


def _dash_generic_dashboard_charts(kind: str) -> List[Dict[str, Any]]:
    global df, dataset_profile
    out_ch: List[Dict[str, Any]] = []
    if df is None or df.empty:
        return out_ch
    _ = kind
    profile = dataset_profile or build_profile(df)
    ct = profile.get("column_types", {})
    columns = df.columns.tolist()

    primary, secondary, _record_col = _dash_priority_metric_columns(kind)
    exclude: set = set()
    cat1 = _dash_pick_generic_category(df, columns, ct, exclude)
    if cat1:
        exclude.add(cat1)
    num1 = primary or _dash_pick_generic_numeric(df, columns, ct, exclude)
    if num1:
        exclude.add(num1)

    if cat1 and num1:
        try:
            sub = df[[cat1, num1]].copy()
            sub["_v"] = numeric_series(num1)
            sub = sub.dropna(subset=[cat1, "_v"])
            if not sub.empty:
                g = sub.groupby(cat1)["_v"].mean()
                nice_cat = _pretty_label_text(cat1)
                nice_num = _pretty_label_text(num1)
                tit = f"Average {nice_num.lower()} by {nice_cat.lower()}"
                _append_unique_dashboard_chart(
                    out_ch,
                    _dash_series_payload(
                        tit,
                        g,
                        chart_type="horizontalBar",
                        category_column=cat1,
                        metric_column=num1,
                    ),
                )
        except Exception:
            pass

    date_c = _dash_pick_generic_date(df, columns, ct)
    num_for_trend = num1 or _dash_pick_generic_numeric(df, columns, ct, exclude)
    if date_c and num_for_trend and date_c != num_for_trend:
        try:
            g_series, _tsm = _adaptive_time_series_grouped(
                df, str(date_c), str(num_for_trend), agg_key="sum"
            )
            if g_series is not None and len(g_series) >= 2:
                lbl = _pretty_label_text(num_for_trend)
                tb = _freq_human_label(str(_tsm.get("timeBucket") or "M"))
                tit = f"{lbl} Trend by {tb}"
                _append_unique_dashboard_chart(
                    out_ch,
                    _dash_series_payload(
                        tit,
                        g_series,
                        chart_type="line",
                        metric_column=num_for_trend,
                    ),
                )
        except Exception:
            pass

    if secondary and secondary in df.columns and cat1 and secondary != num1:
        try:
            sub = df[[cat1, secondary]].copy()
            sub["_v"] = numeric_series(secondary)
            sub = sub.dropna(subset=[cat1, "_v"])
            if not sub.empty:
                g = sub.groupby(cat1)["_v"].sum()
                tit = _dash_chart_title_by_dimension(secondary, cat1, chart_type="bar")
                _append_unique_dashboard_chart(
                    out_ch,
                    _dash_series_payload(
                        tit,
                        g,
                        chart_type="bar",
                        category_column=cat1,
                        metric_column=secondary,
                    ),
                )
        except Exception:
            pass

    cat_dist = _dash_pick_generic_category(df, columns, ct, exclude)
    if cat_dist and cat_dist in df.columns:
        try:
            vc = df[cat_dist].dropna().astype(str).value_counts().head(12)
            if not vc.empty:
                lbl = _pretty_label_text(cat_dist)
                tit = f"Category distribution · {lbl}"
                api_typ = "donut" if len(vc) >= 6 else "pie"
                _append_unique_dashboard_chart(
                    out_ch,
                    _dash_series_payload(
                        tit,
                        vc.astype(float),
                        chart_type=api_typ,
                        category_column=cat_dist,
                        metric_column=_DASH_RECORD_METRIC_KEY,
                    ),
                )
        except Exception:
            pass

    return out_ch


def build_auto_dashboard_charts_bundle(
    kind: str, kpi_cards: Optional[List[Dict[str, Any]]] = None
) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    global df, dataset_profile
    if df is None or df.empty:
        return [], {}
    profile = dataset_profile or build_profile(df)
    seed: List[Dict[str, Any]] = []
    if kind == "hr":
        seed = _dash_hr_dashboard_charts()
    elif kind == "sales":
        seed = _dash_sales_dashboard_charts()
    elif kind == "operations":
        seed = _dash_operations_dashboard_charts()
    else:
        seed = _dash_generic_dashboard_charts(kind)
    deps = DashboardDeps(
        numeric_series=numeric_series,
        time_series_grouped=_adaptive_time_series_grouped,
        series_payload=_dash_series_payload,
        pretty_label=_pretty_label_text,
        chart_title_by_dimension=_dash_chart_title_by_dimension,
        freq_human_label=_freq_human_label,
        id_like_column=_id_like_column_name,
        priority_metrics=_dash_priority_metric_columns,
        record_metric_key=_DASH_RECORD_METRIC_KEY,
    )
    return build_dashboard_charts_bundle(
        df, profile, kind, deps, seed_candidates=seed, kpi_cards=kpi_cards
    )


def build_auto_dashboard_charts(
    kind: str, kpi_cards: Optional[List[Dict[str, Any]]] = None
) -> List[Dict[str, Any]]:
    charts, _ = build_auto_dashboard_charts_bundle(kind, kpi_cards=kpi_cards)
    return charts


def build_auto_dashboard(
    *,
    profile: Optional[Dict[str, Any]] = None,
    kp: Optional[Dict[str, Any]] = None,
    exec_domain: Optional[str] = None,
    exec_cards: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    global df, dataset_profile
    if df is None:
        return {
            "kind": "generic",
            "type_label": AUTO_DASHBOARD_LABELS["generic"],
            "cards": [],
            "charts": [],
            "coverage_telemetry": {},
        }

    profile = profile if profile is not None else (dataset_profile or build_profile(df))
    columns = df.columns.tolist()
    exec_domain = (
        exec_domain if exec_domain is not None else infer_executive_domain(columns)
    )
    kind = executive_domain_to_auto_kind(exec_domain)
    label = EXECUTIVE_DASHBOARD_LABELS.get(exec_domain, AUTO_DASHBOARD_LABELS.get(kind, "Generic"))

    out: Dict[str, Any] = {"kind": kind, "type_label": label, "cards": [], "charts": []}

    ct = profile.get("column_types", {})
    kp = kp if kp is not None else calculate_kpis()

    cat_type_count = sum(
        1 for col in columns if ct.get(col) in ("category", "text")
    )

    def clamp_cards(card_list: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        seen_titles = set()
        trimmed: List[Dict[str, Any]] = []
        for x in card_list:
            if not x:
                continue
            t = str(x.get("title", "") or "").strip()
            if not t or t in seen_titles:
                continue
            seen_titles.add(t)
            trimmed.append(x)
            if len(trimmed) >= 6:
                break
        pad_candidates = [
            {
                "title": "Records in view",
                "value": f"{int(len(df)):,}",
                "subtitle": None,
            },
            {
                "title": "Attributes tracked",
                "value": f"{len(columns):,}",
                "subtitle": "Columns available in this slice",
            },
            {
                "title": "Breakdown-style fields",
                "value": f"{cat_type_count:,}",
                "subtitle": "Text / category columns (typical dimensions)",
            },
        ]
        p = 0
        while len(trimmed) < 3 and p < len(pad_candidates):
            pc = pad_candidates[p]
            p += 1
            if pc["title"] not in seen_titles:
                seen_titles.add(str(pc["title"]))
                trimmed.append(pc)
        return trimmed[:6]

    cards = (
        exec_cards
        if exec_cards is not None
        else build_executive_kpi_cards(exec_domain, _kpi_build_context(profile, kp))
    )
    out["cards"] = clamp_cards(cards)
    charts, coverage_telemetry = build_auto_dashboard_charts_bundle(
        kind, kpi_cards=out["cards"]
    )
    out["charts"] = charts
    out["coverage_telemetry"] = coverage_telemetry
    return out


def _clean_question_sentence(s: str) -> str:
    s = re.sub(r"\s+", " ", s.strip())
    # avoid doubled words like "... risk risk"
    s = re.sub(r"\b(\w+)\s+\1\b", r"\1", s, flags=re.IGNORECASE)
    return s


def _q_token(col: Optional[str]) -> str:
    """Raw column token (internal / edge cases only)."""
    if not col:
        return "values"
    return str(col).strip()


def _q_label(col: Optional[str]) -> str:
    """
    Business-facing wording for suggested questions (no underscores).
    Matchers still resolve: _numeric_col_mentioned uses space-normalized column names.
    """
    if not col:
        return "values"
    s = str(col).strip().replace("_", " ").strip()
    s = re.sub(r"\bpercent\b", "percentage", s, flags=re.I)
    s = re.sub(r"\bpct\b", "percentage", s, flags=re.I)
    s = re.sub(r"\s+id\s*$", "", s, flags=re.I).strip()
    return s.lower()


def _dim_scope_plural_from_col(col: Optional[str]) -> str:
    """Natural plural phrase for 'across …' (lowercase)."""
    raw = (col or "").lower()
    lab = _q_label(col)
    if "department" in raw or "department" in lab or re.search(r"\bdept\b", raw + lab):
        return "departments"
    if "region" in raw or "region" in lab or "territory" in raw:
        return "regions"
    if "location" in raw or "location" in lab or "site" in raw or "office" in raw:
        return "locations"
    if "city" in raw or "city" in lab:
        return "cities"
    if "country" in raw or "country" in lab:
        return "countries"
    if "segment" in raw or "segment" in lab:
        return "segments"
    if "category" in raw or "category" in lab:
        return "categories"
    if "product" in raw or "product" in lab or "sku" in raw or "item" in lab:
        return "products"
    if "channel" in raw or "channel" in lab:
        return "channels"
    if "team" in raw or "team" in lab:
        return "teams"
    if "division" in raw or "division" in lab:
        return "divisions"
    if "campaign" in raw or "campaign" in lab:
        return "campaigns"
    if "customer" in raw or "client" in lab or "account" in raw:
        return "customers"
    if "designation" in raw or "title" in lab or "job" in lab:
        return "roles"
    if "status" in raw or "status" in lab:
        return "status groups"
    w = lab.split()[-1] if lab else "group"
    if w.endswith("y") and len(w) > 2 and w[-2] not in "aeiou":
        return w[:-1] + "ies"
    if w.endswith("s"):
        return w
    return f"{w}s"


_BUSINESS_DIMENSION_HINTS = (
    "department",
    "dept",
    "region",
    "territory",
    "location",
    "city",
    "state",
    "country",
    "segment",
    "category",
    "product",
    "channel",
    "status",
    "designation",
    "title",
    "job",
    "team",
    "division",
    "office",
    "business unit",
    "cost center",
    "district",
    "area",
    "zone",
    "branch",
    "store",
    "severity",
    "plant",
    "facility",
    "priority",
)


_METRIC_NAME_PARTS = frozenset(
    {
        "salary",
        "revenue",
        "attendance",
        "score",
        "amount",
        "percentage",
        "bonus",
        "price",
        "downtime",
        "cost",
        "profit",
        "margin",
        "discount",
        "tax",
        "fee",
        "quantity",
        "qty",
        "volume",
        "hours",
        "rate",
        "headcount",
        "turnover",
        "weight",
        "height",
        "width",
        "depth",
        "age",
        "total",
        "avg",
        "mean",
        "median",
        "cnt",
        "count",
        "pct",
        "percent",
        "ratio",
        "share",
        "payment",
        "payments",
        "balance",
        "accrual",
        "utilization",
        "efficiency",
        "yield",
        "spend",
        "budget",
        "forecast",
        "actual",
        "target",
        "quota",
        "comp",
        "compensation",
        "wage",
        "pay",
        "earnings",
        "income",
        "expense",
        "reimbursement",
        "overtime",
        "hoursworked",
        "fte",
    }
)


def _column_name_contains_metric_token(c: str) -> bool:
    parts = [p for p in re.split(r"[^a-z0-9]+", c.lower()) if p]
    return any(p in _METRIC_NAME_PARTS for p in parts)


def _id_like_column_name(col: Optional[str]) -> bool:
    """Identifiers / keys that read poorly in business questions."""
    if not col:
        return True
    c = str(col).strip().lower().replace(" ", "_")
    if _column_name_contains_metric_token(c):
        return False
    if re.search(r"\b(uuid|guid|row_?id|rowid|index|seq|sequence)\b", c):
        return True
    if re.search(
        r"(^|_)(transaction|txn|order|customer|client|user|emp|employee|account|invoice|payment|shipment|cart|session|visit|incident|case|ticket|claim|policy|member|patient|student|vendor|supplier|partner)_?id$|^id$|^ids$",
        c,
    ):
        return True
    if c.endswith("_id") or c.endswith("_ids"):
        stem = c[:-3] if c.endswith("_id") else c[:-4]
        if stem and _column_name_contains_metric_token(stem):
            return False
        return True
    return False


def _column_uniqueness_ratio(df, col: str) -> float:
    if df is None or col not in df.columns or len(df) == 0:
        return 1.0
    try:
        nu = int(df[col].nunique(dropna=True))
        return float(nu) / float(len(df))
    except Exception:
        return 1.0


def _grain_product_dimension(col: Optional[str]) -> bool:
    """Product / SKU style columns may be high-cardinality but are still business dimensions."""
    if not col or _id_like_column_name(col):
        return False
    cl = str(col).lower()
    return any(k in cl for k in ("product", "sku", "item", "article", "style", "model"))


def _score_dimension_column(df, col: str, profile: Dict[str, Any], uniq_ratio: float) -> int:
    """Deterministic score for category-like business dimensions (higher is better)."""
    score = 0
    ct = profile.get("column_types", {})
    cl = str(col).lower().replace("_", " ")
    if ct.get(col) == "category":
        score += 5
    nu = int(df[col].nunique(dropna=True)) if len(df) else 0
    if nu >= 2 and uniq_ratio < 0.5:
        score += 5
    if uniq_ratio <= 0.35 and nu >= 2:
        score += 3
    if any(h in cl for h in _BUSINESS_DIMENSION_HINTS):
        score += 5
    if _grain_product_dimension(col):
        score += 2
    return score


def _rank_category_dimensions(
    df, category_cols: List[str], profile: Dict[str, Any]
) -> List[Tuple[str, int]]:
    ranked: List[Tuple[str, int]] = []
    for c in category_cols:
        if _id_like_column_name(c):
            continue
        ur = _column_uniqueness_ratio(df, c)
        if ur > 0.80 and not _grain_product_dimension(c):
            continue
        sc = _score_dimension_column(df, c, profile, ur)
        if sc <= 0:
            continue
        ranked.append((c, sc))
    ranked.sort(key=lambda t: (-t[1], str(t[0]).lower()))
    return ranked


def _score_metric_column(df, col: str) -> int:
    score = 0
    cl = str(col).lower().replace("_", " ")
    if _id_like_column_name(col):
        return -99
    if any(
        k in cl
        for k in (
            "salary",
            "revenue",
            "sales",
            "amount",
            "profit",
            "margin",
            "cost",
            "expense",
            "budget",
            "qty",
            "quantity",
            "price",
            "payment",
            "spend",
            "conversion",
            "impression",
            "delay",
            "volume",
            "attendance",
            "attrition",
            "cash",
        )
    ):
        score += 6
    try:
        ur = float(df[col].nunique(dropna=True)) / max(len(df), 1)
        if ur > 0.95:
            score -= 4
    except Exception:
        pass
    return score


def _rank_numeric_metrics(df, numeric_cols: List[str]) -> List[Tuple[str, int]]:
    ranked: List[Tuple[str, int]] = []
    for c in numeric_cols:
        sc = _score_metric_column(df, c)
        if sc <= -10:
            continue
        ranked.append((c, sc))
    ranked.sort(key=lambda t: (-t[1], str(t[0]).lower()))
    return ranked


def _dim_score_map(ranked: List[Tuple[str, int]]) -> Dict[str, int]:
    return {c: s for c, s in ranked}


def _resolve_dimension(
    columns: List[str],
    keywords: List[str],
    ranked: List[Tuple[str, int]],
    min_score: int = 1,
) -> Optional[str]:
    """Prefer _find_first_column hit only if it passes ranking; else best ranked fuzzy match."""
    hit = _find_first_column(columns, keywords)
    smap = _dim_score_map(ranked)
    if hit and not _id_like_column_name(hit) and smap.get(hit, 0) >= min_score:
        return hit
    kl = [k.lower() for k in keywords]
    for col, sc in ranked:
        if sc < min_score:
            continue
        cl = str(col).lower().replace("_", " ")
        if any(k in cl for k in kl):
            return col
    for col, sc in ranked:
        if sc >= min_score + 3:
            return col
    return ranked[0][0] if ranked and ranked[0][1] >= min_score else None


def _resolve_metric(columns: List[str], keywords: List[str], ranked: List[Tuple[str, int]]) -> Optional[str]:
    if not ranked:
        return None
    hit = _find_first_column(columns, keywords)
    smap = {c: s for c, s in ranked}
    if hit and not _id_like_column_name(hit) and smap.get(hit, -99) > -10:
        return hit
    for col, sc in ranked:
        if sc <= 0:
            continue
        cl = str(col).lower()
        if any(k in cl for k in keywords):
            return col
    return ranked[0][0] if ranked else None


def _tpl_compare_avg_across(metric: str, dim: str) -> str:
    ml = _q_label(metric)
    scope = _dim_scope_plural_from_col(dim)
    return _clean_question_sentence(f"Compare average {ml} across {scope}")


def _tpl_lead_on_avg(metric: str, dim: str) -> str:
    dl = _q_label(dim)
    ml = _q_label(metric)
    return _clean_question_sentence(f"Which {dl} has the highest average {ml}?")


def _tpl_ranking(dim: str, metric: str, n: int = 5) -> str:
    dl = _q_label(dim)
    ml = _q_label(metric)
    return _clean_question_sentence(f"What are the top {n} {dl} ranked by {ml}?")


def _tpl_distribution_mix(dim: str) -> str:
    dl = _q_label(dim)
    return _clean_question_sentence(f"How does the business mix break down by {dl}?")


def _tpl_trend(metric: str, date_c: str) -> str:
    ml = _q_label(metric)
    tl = _q_label(date_c)
    return _clean_question_sentence(f"How does {ml} trend over {tl}?")


def _tpl_outliers(metric: str) -> str:
    ml = _q_label(metric)
    return _clean_question_sentence(f"Where are the largest outliers in {ml}?")


def _tpl_concentration(loc_dim: str, group_dim: str) -> str:
    ll = _q_label(loc_dim)
    gl = _q_label(group_dim)
    return _clean_question_sentence(
        f"Which {ll} has the strongest headcount concentration by {gl}?"
    )


def _dataset_suggestion_confidence(
    domain_kind: str,
    n_num: int,
    n_cat: int,
    n_rows: int,
) -> str:
    """Heuristic for mixing generic vs schema-tight suggestions (no LLM)."""
    if n_rows < 12 or (n_num == 0 and n_cat == 0):
        return "low"
    if domain_kind == "generic":
        if n_num >= 1 and n_cat >= 1:
            return "medium"
        return "low"
    if n_num >= 1 and n_cat >= 1:
        return "high"
    if n_num >= 1 or n_cat >= 1:
        return "medium"
    return "low"


def _pick_date_column_for_suggestions(
    mapped_date: Optional[str],
    date_cols: List[str],
    columns: List[str],
    ct: Dict[str, Any],
) -> Optional[str]:
    """Prefer mapped date, then typed date columns, then name heuristics."""
    if mapped_date and mapped_date in columns:
        return mapped_date
    for c in date_cols:
        if c in columns and ct.get(c) == "date":
            return c
    if date_cols:
        return date_cols[0]
    return _find_first_column(
        columns,
        [
            "date",
            "order date",
            "transaction date",
            "timestamp",
            "created",
            "period",
            "month",
            "invoice date",
        ],
    )


def _suggested_ecommerce_questions(
    columns: List[str],
    ct: Dict[str, Any],
    ranked_dims: List[Tuple[str, int]],
    ranked_metrics: List[Tuple[str, int]],
    date_c: Optional[str],
    product_col: Optional[str],
    sales_col: Optional[str],
    region_col: Optional[str],
    customer_col: Optional[str],
    profit_col: Optional[str],
) -> List[str]:
    """Executive / operational / anomaly / trend prompts for retail & ecommerce."""
    qs: List[str] = []
    prod = product_col or _resolve_dimension(
        columns, ["product", "sku", "item", "style", "variant", "listing"], ranked_dims
    )
    rev = sales_col or _resolve_metric(
        columns, ["sales", "revenue", "amount", "total", "value", "gmv"], ranked_metrics
    )
    reg = region_col or _resolve_dimension(
        columns, ["region", "state", "territory", "country", "market", "geo"], ranked_dims
    )
    cust = customer_col or _resolve_dimension(
        columns, ["customer", "client", "buyer", "account", "shopper"], ranked_dims
    )
    cat = _find_first_column(
        columns, ["category", "segment", "collection", "department", "class", "subcategory"]
    )
    rating = _find_first_column(
        columns,
        [
            "rating",
            "review_score",
            "stars",
            "nps",
            "satisfaction",
            "csat",
            "feedback_score",
        ],
    )
    ret_col = _find_first_column(
        columns,
        ["returned", "is_return", "return_flag", "refund", "return_qty", "rma", "chargeback"],
    )
    discount = _find_first_column(columns, ["discount", "markdown", "promo", "coupon"])
    order_col = _find_order_id_column(columns)

    # Executive
    if prod and rev:
        qs.append(
            _clean_question_sentence(
                f"Which {_q_label(prod)} drive the most {_q_label(rev)}?"
            )
        )
        qs.append(_tpl_ranking(prod, rev, 10))
    if cat and rev:
        qs.append(
            _clean_question_sentence(
                f"How concentrated is {_q_label(rev)} across {_q_label(cat)}?"
            )
        )

    # Operational
    if reg and rev:
        qs.append(
            _clean_question_sentence(
                f"Which {_q_label(reg)} has the highest {_q_label(rev)}?"
            )
        )
    if reg and ret_col:
        qs.append(
            _clean_question_sentence(
                f"Which {_q_label(reg)} has the highest returns or refunds?"
            )
        )
    if order_col and rev:
        qs.append(
            _clean_question_sentence(
                f"What is average {_q_label(rev)} per order across the dataset?"
            )
        )
    if cust and rev and not _id_like_column_name(str(cust)):
        qs.append(_tpl_compare_avg_across(rev, cust))

    # Customer experience
    if rating and prod:
        qs.append(
            _clean_question_sentence(
                f"What impacts {_q_label(rating)} across {_q_label(prod)}?"
            )
        )
    elif rating and reg:
        qs.append(
            _clean_question_sentence(
                f"How does {_q_label(rating)} compare across {_q_label(reg)}?"
            )
        )

    # Anomaly
    if rev:
        qs.append(_tpl_outliers(rev))
    if profit_col:
        qs.append(_tpl_outliers(profit_col))
    if discount:
        qs.append(
            _clean_question_sentence(
                f"Where are unusually large {_q_label(discount)} values worth reviewing?"
            )
        )

    # Trend
    if date_c and rev:
        qs.append(_tpl_trend(rev, date_c))
    if date_c and ret_col:
        qs.append(
            _clean_question_sentence(
                f"How do returns or refunds trend over {_q_label(date_c)}?"
            )
        )
    if date_c and rating:
        qs.append(_tpl_trend(rating, date_c))

    return qs


def _suggested_manufacturing_questions(
    columns: List[str],
    ct: Dict[str, Any],
    ranked_dims: List[Tuple[str, int]],
    ranked_metrics: List[Tuple[str, int]],
    date_c: Optional[str],
    region_col: Optional[str],
) -> List[str]:
    """Executive / operational / anomaly / trend prompts for manufacturing & ops."""
    qs: List[str] = []
    plant = region_col or _resolve_dimension(
        columns,
        ["plant", "site", "facility", "line", "work center", "workcenter", "warehouse", "cell"],
        ranked_dims,
    )
    defect = _find_first_column(
        columns, ["defect", "scrap", "reject", "ng_", "fault", "rework", "downtime"]
    )
    uptime = _find_first_column(columns, ["uptime", "availability", "oee", "utilization"])
    prod = _resolve_metric(
        columns,
        ["output", "produced", "units_produced", "throughput", "production", "yield", "quantity"],
        ranked_metrics,
    )
    shift = _find_first_column(columns, ["shift", "crew", "team", "operator"])
    batch = _find_first_column(columns, ["batch", "lot", "work_order", "wo_", "run_id"])
    maint = _find_first_column(columns, ["maintenance", "mttr", "pm_", "downtime_hours"])

    # Executive
    if plant and defect:
        qs.append(
            _clean_question_sentence(
                f"Which {_q_label(plant)} has the highest {_q_label(defect)} load?"
            )
        )
    if plant and prod:
        qs.append(
            _clean_question_sentence(
                f"Which {_q_label(plant)} has the highest {_q_label(prod)} output?"
            )
        )
        qs.append(_tpl_ranking(plant, prod, 5))

    # Operational
    if shift and uptime:
        qs.append(
            _clean_question_sentence(
                f"Which {_q_label(shift)} has the lowest {_q_label(uptime)}?"
            )
        )
    if shift and prod:
        qs.append(_tpl_compare_avg_across(prod, shift))
    if maint and plant:
        qs.append(
            _clean_question_sentence(
                f"How does {_q_label(maint)} compare across {_dim_scope_plural_from_col(plant)}?"
            )
        )

    # Trend
    if date_c and prod:
        qs.append(
            _clean_question_sentence(
                f"What is the {_q_label(prod)} trend over {_q_label(date_c)}?"
            )
        )
    if date_c and defect:
        qs.append(_tpl_trend(defect, date_c))
    if date_c and uptime:
        qs.append(_tpl_trend(uptime, date_c))

    # Anomaly
    if defect:
        qs.append(_tpl_outliers(defect))
    if prod:
        qs.append(_tpl_outliers(prod))
    if batch and defect:
        qs.append(
            _clean_question_sentence(
                f"Which {_q_label(batch)} shows unusually high {_q_label(defect)}?"
            )
        )

    if plant and prod:
        qs.append(_tpl_compare_avg_across(prod, plant))

    return qs


def _generic_suggested_questions() -> List[str]:
    return [
        "What are the strongest numeric patterns in this dataset?",
        "Which categories appear most often?",
        "Highlight any obvious outliers worth investigating.",
        "Summarize key differences between the largest groups.",
    ]


def _normalize_suggested_question_key(q: str) -> str:
    """Lowercase, trim, strip punctuation, collapse spaces — for dedup / near-dup removal."""
    qc = _clean_question_sentence(q).strip().lower()
    qc = re.sub(r"[^a-z0-9\s]+", " ", qc, flags=re.I)
    qc = re.sub(r"\s+", " ", qc).strip()
    return qc


def _dedup_question_list(items: List[str], max_n: int = 6) -> List[str]:
    """Dedup by normalized key (near-duplicate removal), preserve order, cap length."""
    out: List[str] = []
    seen: set = set()
    for q in items:
        qc = _clean_question_sentence(q)
        key = _normalize_suggested_question_key(qc)
        if not key or key in seen:
            continue
        seen.add(key)
        out.append(qc)
        if len(out) >= max_n:
            break
    return out


def _schema_suggested_questions(
    ranked_dims: List[Tuple[str, int]],
    ranked_metrics: List[Tuple[str, int]],
    date_cols: List[str],
    domain_q_count: int,
) -> List[str]:
    """Light schema filler — fewer templates when domain already produced enough."""
    if not ranked_dims or not ranked_metrics:
        return []
    d0 = ranked_dims[0][0]
    m0 = ranked_metrics[0][0]
    qs: List[str] = []
    if domain_q_count < 3:
        qs.append(_tpl_compare_avg_across(m0, d0))
    if domain_q_count < 4 and date_cols:
        qs.append(_tpl_trend(m0, date_cols[0]))
    if domain_q_count < 2:
        qs.append(_tpl_lead_on_avg(m0, d0))
    return qs


def _mapped_col_safe(col: Optional[str]) -> Optional[str]:
    if not col or _id_like_column_name(col):
        return None
    return col


def build_suggested_questions() -> List[str]:
    """
    Deterministic, dataset-aware suggested questions (schema + domain heuristics).
    Uses infer_auto_dashboard_kind, dtypes, and mapped columns — no LLM.
    """
    global df, dataset_profile

    if df is None:
        return _generic_suggested_questions()[:6]

    profile = dataset_profile or build_profile(df)
    ct = profile.get("column_types", {})
    columns = df.columns.tolist()
    numeric_cols = [c for c in columns if ct.get(c) == "number"]
    date_cols = [c for c in columns if ct.get(c) == "date"]
    category_cols = [c for c in columns if ct.get(c) in ("category", "text")]

    ranked_dims = _rank_category_dimensions(df, category_cols, profile)
    ranked_metrics = _rank_numeric_metrics(df, numeric_cols)
    if not ranked_dims:
        for c in category_cols:
            if _id_like_column_name(c):
                continue
            if _column_uniqueness_ratio(df, c) > 0.90:
                continue
            ranked_dims = [(c, 1)]
            break
    if not ranked_metrics:
        for c in numeric_cols:
            if _id_like_column_name(c):
                continue
            ranked_metrics = [(c, 1)]
            break

    domain = infer_auto_dashboard_kind()
    row_n = int(len(df))
    conf = _dataset_suggestion_confidence(domain, len(numeric_cols), len(category_cols), row_n)

    date_col = get_mapped_or_detected_column(
        "date", ["date", "order date", "transaction date", "invoice date", "month", "period"]
    )
    date_for_trend = _pick_date_column_for_suggestions(date_col, date_cols, columns, ct)

    try:
        from intent_engine.suggested_questions_engine import compose_suggested_questions

        engine_qs = compose_suggested_questions(
            df=df,
            profile=profile,
            ranked_dims=ranked_dims,
            ranked_metrics=ranked_metrics,
            date_cols=date_cols,
            columns=columns,
            dashboard_kind=domain,
            date_col=date_for_trend,
        )
        deduped = _dedup_question_list(engine_qs, max_n=6)
        if len(deduped) >= 5:
            return deduped[:6]
    except Exception:
        pass

    product_col = _mapped_col_safe(
        get_mapped_or_detected_column("product", ["product", "item", "sku", "category"])
    )
    sales_col = _mapped_col_safe(
        get_mapped_or_detected_column(
            "sales", ["sales", "revenue", "amount", "total", "value", "qty", "quantity"]
        )
    )
    region_col = _mapped_col_safe(
        get_mapped_or_detected_column(
            "region", ["region", "state", "city", "location", "territory"]
        )
    )
    customer_col = _mapped_col_safe(
        get_mapped_or_detected_column(
            "customer", ["customer", "client", "buyer", "account", "company"]
        )
    )
    profit_col = _mapped_col_safe(
        get_mapped_or_detected_column("profit", ["profit", "margin", "net profit", "earnings", "gp"])
    )
    kpi_domain = infer_kpi_domain()

    qs: List[str] = []

    if kpi_domain == "ecommerce":
        qs.extend(
            _suggested_ecommerce_questions(
                columns,
                ct,
                ranked_dims,
                ranked_metrics,
                date_for_trend,
                product_col,
                sales_col,
                region_col,
                customer_col,
                profit_col,
            )
        )
    elif kpi_domain == "manufacturing":
        qs.extend(
            _suggested_manufacturing_questions(
                columns,
                ct,
                ranked_dims,
                ranked_metrics,
                date_for_trend,
                region_col,
            )
        )
    # ---- HR ----
    elif domain == "hr":
        dept = _resolve_dimension(
            columns,
            ["department", "dept", "team", "division", "business unit", "business_unit"],
            ranked_dims,
        )
        salary = _resolve_metric(
            columns, ["salary", "ctc", "compensation", "pay", "wage", "income"], ranked_metrics
        )
        loc = _resolve_dimension(
            columns, ["location", "city", "site", "office", "country"], ranked_dims
        )
        att = _find_first_column(columns, ["attendance", "present", "utilization", "absent"])
        if att and ct.get(att) != "number":
            att = None
        hire = _find_first_column(
            columns,
            ["hire date", "hiring date", "joining date", "join date", "start date", "date of join", "doj"],
        )
        ar_col = _find_attrition_risk_column(columns)
        if not ar_col:
            ar_col = _find_first_column(columns, ["attrition", "churn", "turnover"])

        if dept and salary:
            qs.append(_tpl_compare_avg_across(salary, dept))
            qs.append(_tpl_lead_on_avg(salary, dept))
        if dept and ar_col:
            scope = _dim_scope_plural_from_col(dept)
            qs.append(
                _clean_question_sentence(f"Compare {_q_label(ar_col)} across {scope}")
            )
        if loc and dept:
            qs.append(_tpl_concentration(loc, dept))
        elif loc:
            scope_l = _dim_scope_plural_from_col(loc)
            qs.append(
                _clean_question_sentence(f"How does headcount spread across {scope_l}?")
            )
        if hire and date_col:
            qs.append(
                _clean_question_sentence(
                    f"How does hiring activity trend over {_q_label(date_col)} by {_q_label(hire)}?"
                )
            )
        if dept and att:
            qs.append(
                _clean_question_sentence(
                    f"Which {_q_label(dept)} has the lowest {_q_label(att)}?"
                )
            )
        if salary:
            qs.append(_tpl_outliers(salary))
        if salary and date_col:
            qs.append(_tpl_trend(salary, date_col))

    # ---- Sales (and marketing-adjacent product metrics) ----
    elif domain == "sales":
        prod = product_col or _resolve_dimension(columns, ["product", "sku", "item", "category"], ranked_dims)
        rev = sales_col or _resolve_metric(
            columns, ["sales", "revenue", "amount", "total", "value"], ranked_metrics
        )
        reg = region_col or _resolve_dimension(columns, ["region", "state", "territory"], ranked_dims)
        cust = customer_col or _resolve_dimension(columns, ["customer", "client", "company"], ranked_dims)

        if prod and rev:
            qs.append(
                _clean_question_sentence(
                    f"Which {_q_label(prod)} drives the highest {_q_label(rev)}?"
                )
            )
            qs.append(_tpl_compare_avg_across(rev, prod))
        if date_col and rev:
            qs.append(_tpl_trend(rev, date_col))
        if reg and rev:
            scope_r = _dim_scope_plural_from_col(reg)
            qs.append(
                _clean_question_sentence(
                    f"Compare {_q_label(rev)} performance across {scope_r}"
                )
            )
        if cust and rev and not _id_like_column_name(cust):
            qs.append(_tpl_ranking(cust, rev, 10))
        if profit_col and prod:
            qs.append(
                _clean_question_sentence(
                    f"Which {_q_label(prod)} delivers the strongest {_q_label(profit_col)}?"
                )
            )

    # ---- Finance ----
    elif domain == "finance":
        exp = _resolve_metric(
            columns, ["expense", "spend", "spending", "cost", "payment", "outflow", "debit"], ranked_metrics
        )
        bud = _resolve_metric(columns, ["budget", "planned", "forecast", "target amount"], ranked_metrics)
        act = _resolve_metric(columns, ["actual", "realized", "spent", "outturn"], ranked_metrics)
        dept_f = _resolve_dimension(
            columns, ["department", "cost center", "cost_center", "division"], ranked_dims
        )
        cat_f = _resolve_dimension(
            columns, ["category", "gl", "account", "ledger", "line item"], ranked_dims
        )
        cash = _resolve_metric(columns, ["cash flow", "cashflow", "net cash", "liquidity"], ranked_metrics)
        if exp and cat_f:
            scope_c = _dim_scope_plural_from_col(cat_f)
            qs.append(
                _clean_question_sentence(
                    f"Compare {_q_label(exp)} across {scope_c}"
                )
            )
        if bud and act and date_col:
            qs.append(
                _clean_question_sentence(
                    f"Compare {_q_label(bud)} vs {_q_label(act)} over {_q_label(date_col)}"
                )
            )
        elif bud and act:
            qs.append(
                _clean_question_sentence(
                    f"Compare {_q_label(bud)} vs {_q_label(act)}"
                )
            )
        if exp and dept_f:
            qs.append(_tpl_lead_on_avg(exp, dept_f))
        if date_col and (exp or act or sales_col):
            mcol = exp or act or sales_col
            if mcol:
                qs.append(_tpl_trend(mcol, date_col))
        if profit_col and dept_f:
            qs.append(_tpl_compare_avg_across(profit_col, dept_f))
        if cash and date_col:
            qs.append(_tpl_trend(cash, date_col))
        elif cash:
            qs.append(_tpl_outliers(cash))

    # ---- Operations ----
    elif domain == "operations":
        reg_o = region_col or _resolve_dimension(
            columns, ["region", "warehouse", "site", "plant", "location"], ranked_dims
        )
        sev_o = _resolve_dimension(
            columns, ["severity", "issue_type", "issue type", "priority"], ranked_dims
        )
        loss_m = _resolve_metric(
            columns,
            [
                "production_loss",
                "production loss",
                "downtime",
                "repair_cost",
                "repair cost",
                "maintenance",
            ],
            ranked_metrics,
        ) or sales_col
        delay = _resolve_metric(columns, ["delay", "latency", "lead time", "sla breach"], ranked_metrics)
        vol = _resolve_metric(columns, ["volume", "orders", "units", "throughput", "output"], ranked_metrics)
        ship = _find_first_column(columns, ["shipment", "delivery", "dispatch", "fulfillment"])
        sla = _find_first_column(columns, ["sla", "otif", "on time", "service level"])
        if loss_m and reg_o:
            qs.append(_tpl_ranking(reg_o, loss_m, 5))
        if loss_m and sev_o and sev_o != reg_o:
            qs.append(_tpl_compare_avg_across(loss_m, sev_o))
        if date_col and loss_m:
            qs.append(_tpl_trend(loss_m, date_col))
        elif date_col and delay:
            qs.append(_tpl_trend(delay, date_col))
        elif date_col and vol:
            qs.append(_tpl_trend(vol, date_col))
        if reg_o and ship:
            scope_o = _dim_scope_plural_from_col(reg_o)
            qs.append(
                _clean_question_sentence(
                    f"Compare {_q_label(ship)} outcomes across {scope_o}"
                )
            )
        if sla:
            qs.append(
                _clean_question_sentence(
                    f"How does {_q_label(sla)} vary across the operation?"
                )
            )
        if vol and reg_o and not loss_m:
            qs.append(_tpl_ranking(reg_o, vol, 5))
        dt_m = _resolve_metric(columns, ["downtime", "outage", "minutes"], ranked_metrics)
        if loss_m and dt_m and loss_m != dt_m:
            qs.append(
                _clean_question_sentence(
                    f"Compare {_q_label(loss_m)} with {_q_label(dt_m)}"
                )
            )

    # ---- Marketing ----
    elif domain == "marketing":
        camp = _resolve_dimension(columns, ["campaign", "ad group", "adset", "channel"], ranked_dims)
        conv = _resolve_metric(columns, ["conversion", "conversions", "signup", "lead"], ranked_metrics)
        impr = _resolve_metric(columns, ["impression", "impr", "views"], ranked_metrics)
        spend = _resolve_metric(columns, ["spend", "cost", "budget", "cpc", "cpm"], ranked_metrics)
        if camp and conv:
            qs.append(
                _clean_question_sentence(
                    f"Which {_q_label(camp)} delivers the strongest {_q_label(conv)}?"
                )
            )
        if date_col and spend:
            qs.append(_tpl_trend(spend, date_col))
        channel_col = _resolve_dimension(columns, ["channel", "source", "medium"], ranked_dims)
        if channel_col and spend:
            scope_ch = _dim_scope_plural_from_col(channel_col)
            qs.append(
                _clean_question_sentence(
                    f"Compare {_q_label(spend)} across {scope_ch}"
                )
            )
        if impr and camp:
            qs.append(_tpl_ranking(camp, impr, 5))

    # Schema-driven questions fill gaps for any domain (fewer when domain already filled slots)
    qs.extend(
        _schema_suggested_questions(
            ranked_dims, ranked_metrics, date_cols, len(qs)
        )
    )

    deduped = _dedup_question_list(qs, max_n=6)

    if conf == "low":
        merged: List[str] = []
        for g in _generic_suggested_questions():
            merged.append(g)
        for x in deduped:
            if x not in merged:
                merged.append(x)
        deduped = _dedup_question_list(merged, max_n=6)

    if len(deduped) < 5:
        for g in _generic_suggested_questions():
            if g not in deduped:
                deduped.append(g)
        deduped = _dedup_question_list(deduped, max_n=6)

    if len(deduped) >= 5:
        return deduped[:6]
    return _dedup_question_list(deduped + _generic_suggested_questions(), max_n=6)


def _find_column_in_frame(frame: pd.DataFrame, possible_names: List[str]) -> Optional[str]:
    columns = frame.columns.tolist()
    lower_map = {str(col).lower(): col for col in columns}
    for name in possible_names:
        for col_lower, original_col in lower_map.items():
            if name in col_lower:
                return original_col
    return None


def resolve_standard_dimension_columns(
    frame: pd.DataFrame, profile: Optional[Dict[str, Any]] = None
) -> Dict[str, Optional[str]]:
    """Map logical roles to concrete columns for filters / drilldown."""
    cols = frame.columns.tolist()
    prof = profile or build_profile(frame)
    ct = prof.get("column_types", {}) or {}

    dept = _find_first_column(cols, ["department", "dept", "team", "division"])
    mapped_reg = column_mapping.get("region")
    loc: Optional[str] = None
    if mapped_reg and mapped_reg in frame.columns:
        loc = mapped_reg
    if not loc:
        loc = _find_column_in_frame(
            frame,
            ["location", "city", "office", "site", "branch", "region", "state"],
        )
    if loc == dept:
        loc = _find_column_in_frame(frame, ["office", "site", "branch", "country"])
    if loc == dept:
        loc = None

    desig = _find_first_column(
        cols, ["designation", "job_title", "title", "job title", "position", "role"]
    )

    date_c: Optional[str] = None
    for c in cols:
        if ct.get(c) == "date":
            date_c = str(c)
            break
    if not date_c:
        date_c = _dash_pick_generic_date(frame, cols, ct)

    return {
        "department": dept,
        "location": loc,
        "designation": desig,
        "date": date_c,
    }


def _series_values_match(series: pd.Series, needle: str) -> pd.Series:
    n = needle.strip().lower()
    if not n:
        return pd.Series(False, index=series.index)
    raw = series.astype(str).str.strip()
    m = raw.str.lower() == n
    try:
        pretty_m = raw.map(
            lambda x: _pretty_label_text(str(x)).strip().lower() == n
        )
        m = m | pretty_m.fillna(False)
    except Exception:
        pass
    return m


def apply_dashboard_filters_to_df(
    base_df: pd.DataFrame,
    filters: List[DashboardFilterEntryModel],
    date_range: Optional[DashboardDateRangeModel],
) -> Tuple[pd.DataFrame, List[str]]:
    """AND filters; same column appears twice → last wins."""
    labels: List[str] = []
    if base_df is None:
        return base_df, labels
    out = base_df
    merged: Dict[str, DashboardFilterEntryModel] = {}
    for f in filters or []:
        col = str(f.column).strip()
        if col and col in out.columns:
            merged[col] = f
    for _col_key, f in merged.items():
        col = str(f.column).strip()
        lab = str(f.label).strip() if f.label else _pretty_label_text(col)
        val = str(f.value).strip()
        mask = _series_values_match(out[col], val)
        out = out.loc[mask].copy()
        labels.append(f"{lab} = {val}")
        if out.empty:
            return out, labels

    dr = date_range
    if dr:
        dc = str(dr.column).strip()
        if dc and dc in out.columns:
            dtp = pd.to_datetime(out[dc], errors="coerce")
            nice = _pretty_label_text(dc)
            if dr.start:
                ts = pd.Timestamp(dr.start)
                out = out.loc[dtp >= ts].copy()
                labels.append(f"{nice} ≥ {dr.start}")
            if dr.end and not out.empty:
                te = pd.Timestamp(dr.end)
                day_only = isinstance(dr.end, str) and (
                    len(str(dr.end).strip()) <= 10 and "T" not in str(dr.end).upper()
                )
                if day_only:
                    te = te.normalize() + pd.Timedelta(days=1) - pd.Timedelta(microseconds=1)
                out = out.loc[dtp <= te].copy()
                labels.append(f"{nice} ≤ {dr.end}")
    return out, labels


def _ordered_dashboard_filters(
    filters: List[DashboardFilterEntryModel],
    dim_map: Dict[str, Optional[str]],
) -> List[DashboardFilterEntryModel]:
    col_to_pri: Dict[str, int] = {}
    for i, role in enumerate(["location", "department", "designation"]):
        c = dim_map.get(role)
        if c:
            col_to_pri[str(c)] = i
    dr_col = dim_map.get("date")
    if dr_col:
        col_to_pri[str(dr_col)] = 4

    def pri(f: DashboardFilterEntryModel) -> Tuple[int, str]:
        return (col_to_pri.get(str(f.column), 99), str(f.column))

    return sorted(filters or [], key=pri)


def build_filter_breadcrumb(
    base_frame: pd.DataFrame,
    profile: Dict[str, Any],
    filters: List[DashboardFilterEntryModel],
    date_range: Optional[DashboardDateRangeModel],
) -> str:
    root = "All Employees" if infer_dataset_kind() == "hr" else "All records"
    dim_map = resolve_standard_dimension_columns(base_frame, profile)
    parts: List[str] = [root]
    for f in _ordered_dashboard_filters(list(filters or []), dim_map):
        v = str(f.value).strip()
        if v:
            parts.append(v)
    if date_range and (date_range.start or date_range.end):
        ds = str(date_range.start or "").strip()
        de = str(date_range.end or "").strip()
        if ds and de:
            parts.append(f"{ds} — {de}")
        elif ds or de:
            parts.append(ds or de)
    return " → ".join(parts)


def build_dimension_catalog_for_ui(
    frame: pd.DataFrame, profile: Dict[str, Any]
) -> Dict[str, Any]:
    dims = resolve_standard_dimension_columns(frame, profile)
    out: Dict[str, Any] = {}
    for key, col in dims.items():
        if not col or col not in frame.columns:
            continue
        if key == "date":
            out[key] = {
                "column": col,
                "label": _pretty_label_text(col),
                "values": [],
            }
            continue
        ser = frame[col].dropna().astype(str).str.strip()
        vals = sorted({str(x) for x in ser.unique() if str(x)}, key=lambda z: z.lower())[
            :200
        ]
        out[key] = {"column": col, "label": _pretty_label_text(col), "values": vals}
    return out


def _compose_upload_payload(sheet_names: List[str]) -> Dict[str, Any]:
    global df, selected_sheet_name, column_mapping, uploaded_file_name, uploaded_file_bytes, dataset_profile, column_mapping_metadata

    prof = dataset_profile or build_profile(df)
    kp = calculate_kpis()
    columns = df.columns.tolist()
    exec_domain = infer_executive_domain(columns)
    exec_cards = build_executive_kpi_cards(exec_domain, _kpi_build_context(prof, kp))
    kpi_cards = exec_cards[:5]
    dataset_kind = executive_domain_to_kpi_domain(exec_domain)
    auto_dashboard = build_auto_dashboard(
        profile=prof,
        kp=kp,
        exec_domain=exec_domain,
        exec_cards=exec_cards,
    )
    dim_opts = build_dimension_catalog_for_ui(df, prof)
    bc = build_filter_breadcrumb(df, prof, [], None)
    payload = {
        "file": {
            "name": uploaded_file_name,
            "size_bytes": len(uploaded_file_bytes) if uploaded_file_bytes else 0,
        },
        "columns": df.columns.tolist(),
        "rows": len(df),
        "preview": df.head(15).to_dict(orient="records"),
        "sheets": sheet_names,
        "selected_sheet": selected_sheet_name,
        "profile": prof,
        "kpis": kp,
        "kpi_cards": kpi_cards,
        "dataset_kind": dataset_kind,
        "auto_dashboard": auto_dashboard,
        "suggested_questions": build_suggested_questions(),
        "column_mapping": {
            "product_column": column_mapping.get("product"),
            "sales_column": column_mapping.get("sales"),
            "region_column": column_mapping.get("region"),
            "customer_column": column_mapping.get("customer"),
            "profit_column": column_mapping.get("profit"),
            "date_column": column_mapping.get("date"),
        },
        "dimension_options": dim_opts,
        "filter_breadcrumb": bc,
        "filter_summary": [],
        "empty": False,
        "mapping_metadata": column_mapping_metadata,
    }
    return _json_safe(payload)


def build_upload_response(sheet_names):
    return _compose_upload_payload(sheet_names)


@app.post("/filtered-dashboard")
def filtered_dashboard(data: FilteredDashboardRequest):
    """Recompute KPIs, auto dashboard, and preview for the active filter slice."""
    global df, dataset_profile, available_sheet_names, uploaded_file_name, uploaded_file_bytes, selected_sheet_name

    if df is None:
        raise HTTPException(status_code=400, detail="Please upload a CSV or Excel file first.")

    base_profile = dataset_profile or build_profile(df)
    fd, filt_labels = apply_dashboard_filters_to_df(
        df, data.dashboard_filters, data.date_range
    )
    dim_opts = build_dimension_catalog_for_ui(df, base_profile)
    bc = build_filter_breadcrumb(
        df, base_profile, data.dashboard_filters, data.date_range
    )
    sheet_names = available_sheet_names or (
        ["CSV"]
        if (uploaded_file_name or "").lower().endswith(".csv")
        else [selected_sheet_name or "Sheet1"]
    )

    if fd.empty:
        return {
            **_compose_empty_filtered_payload(
                sheet_names, base_profile, filt_labels, bc, dim_opts
            ),
        }

    saved_df = df
    saved_prof = dataset_profile
    try:
        df = fd
        dataset_profile = build_profile(fd)
        payload = _compose_upload_payload(sheet_names)
    finally:
        df = saved_df
        dataset_profile = saved_prof

    payload["filter_summary"] = filt_labels
    payload["filter_breadcrumb"] = bc
    payload["dimension_options"] = dim_opts
    payload["empty"] = False
    return payload


def _compose_empty_filtered_payload(
    sheet_names: List[str],
    base_profile: Dict[str, Any],
    filt_labels: List[str],
    breadcrumb: str,
    dim_opts: Dict[str, Any],
) -> Dict[str, Any]:
    global uploaded_file_name, uploaded_file_bytes, selected_sheet_name, column_mapping, df

    kind = infer_auto_dashboard_kind()
    label = AUTO_DASHBOARD_LABELS.get(kind, "Generic")
    empty_ad = {"kind": kind, "type_label": label, "cards": [], "charts": []}
    payload = {
        "empty": True,
        "message": NO_RECORDS_FILTERS_MSG,
        "file": {
            "name": uploaded_file_name,
            "size_bytes": len(uploaded_file_bytes) if uploaded_file_bytes else 0,
        },
        "columns": df.columns.tolist(),
        "rows": 0,
        "preview": [],
        "sheets": sheet_names,
        "selected_sheet": selected_sheet_name,
        "profile": base_profile,
        "kpis": {
            "total_rows": 0,
            "total_columns": len(df.columns),
            "total_sales": None,
            "top_product": None,
            "unique_products": None,
        },
        "kpi_cards": [],
        "dataset_kind": kind,
        "auto_dashboard": empty_ad,
        "suggested_questions": build_suggested_questions(),
        "column_mapping": {
            "product_column": column_mapping.get("product"),
            "sales_column": column_mapping.get("sales"),
            "region_column": column_mapping.get("region"),
            "customer_column": column_mapping.get("customer"),
            "profit_column": column_mapping.get("profit"),
            "date_column": column_mapping.get("date"),
        },
        "dimension_options": dim_opts,
        "filter_breadcrumb": breadcrumb,
        "filter_summary": filt_labels,
    }
    return _json_safe(payload)


def _enforce_dataset_row_cap(tier: str, row_count: int) -> None:
    if tier == "paid" and row_count > PAID_MAX_DATASET_ROWS:
        raise HTTPException(
            status_code=413,
            detail=limit_error_detail(
                "dataset_rows",
                dataset_rows_limit_message(row_count),
            ),
        )


def _plan_usage_envelope(request: Request) -> Dict[str, Any]:
    session_id = resolve_session_id(request)
    tier = resolve_plan_tier(request)
    return {
        "tier": tier,
        "limits": get_limits(tier),
        "usage": usage_tracker.get_usage_snapshot(session_id, tier),
    }


@app.get("/plan")
def get_plan(request: Request):
    session_id = resolve_session_id(request)
    tier = resolve_plan_tier(request)
    return {
        "tier": tier,
        "limits": get_limits(tier),
        "usage": usage_tracker.get_usage_snapshot(session_id, tier),
    }


@app.get("/usage")
def get_usage(request: Request):
    return _plan_usage_envelope(request)


@app.post("/usage/pdf-export")
def record_pdf_export(request: Request):
    session_id = resolve_session_id(request)
    tier = resolve_plan_tier(request)
    ok, msg = usage_tracker.check_pdf_export(session_id, tier)
    if not ok:
        raise HTTPException(
            status_code=429,
            detail=limit_error_detail("pdf_exports", msg or ""),
        )
    usage_tracker.record_pdf_export(session_id)
    return _plan_usage_envelope(request)


@app.post("/usage/pdf-export/refund")
def refund_pdf_export(request: Request):
    session_id = resolve_session_id(request)
    usage_tracker.refund_last_pdf_export(session_id)
    return _plan_usage_envelope(request)


@app.post("/upload")
async def upload_file(request: Request, file: UploadFile = File(...)):
    global df, uploaded_file_bytes, uploaded_file_name, selected_sheet_name, column_mapping, dataset_profile, available_sheet_names, column_mapping_metadata

    tier = resolve_plan_tier(request)
    plan_limits = get_limits(tier)

    uploaded_file_bytes = await file.read()
    if len(uploaded_file_bytes) > plan_limits["max_file_bytes"]:
        raise HTTPException(
            status_code=413,
            detail=limit_error_detail(
                "file_size",
                file_size_limit_message(tier, len(uploaded_file_bytes)),
            ),
        )
    if not file.filename:
        raise HTTPException(status_code=400, detail="Missing file name.")

    uploaded_file_name = file.filename
    column_mapping = {
        "product": None,
        "sales": None,
        "region": None,
        "customer": None,
        "profit": None,
        "date": None,
    }

    fmt = detect_dataset_format(uploaded_file_name)
    if fmt in ("csv", "parquet", "json", "jsonl"):
        try:
            df, sheet_label = load_dataframe_from_upload(
                uploaded_file_bytes, uploaded_file_name
            )
        except ValueError as exc:
            logger.warning("Upload rejected (%s): %s", uploaded_file_name, exc)
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        df = clean_dataframe(df)
        if df.empty:
            raise HTTPException(status_code=400, detail="Uploaded file has no data.")
        _enforce_dataset_row_cap(tier, len(df))
        selected_sheet_name = sheet_label
        dataset_profile = build_profile(df)
        apply_semantic_column_mapping(df, dataset_profile)
        available_sheet_names = [sheet_label]
        payload = build_upload_response([sheet_label])
        payload["plan"] = _plan_usage_envelope(request)
        return payload

    if fmt == "excel":
        try:
            excel_file = pd.ExcelFile(BytesIO(uploaded_file_bytes))
        except Exception:
            raise HTTPException(status_code=400, detail="Unable to read Excel file.")
        sheet_names = excel_file.sheet_names
        if not sheet_names:
            raise HTTPException(status_code=400, detail="Excel file has no sheets.")

        best_df = None
        best_score = -1
        best_sheet = sheet_names[0]

        for sheet in sheet_names:
            temp_df = read_sheet_from_excel(uploaded_file_bytes, sheet)
            score = len(temp_df) * len(temp_df.columns)

            if score > best_score:
                best_score = score
                best_df = temp_df
                best_sheet = sheet

        df = best_df
        if df is None or df.empty:
            raise HTTPException(status_code=400, detail="Uploaded file has no usable tabular data.")
        _enforce_dataset_row_cap(tier, len(df))
        selected_sheet_name = best_sheet
        dataset_profile = build_profile(df)
        apply_semantic_column_mapping(df, dataset_profile)
        available_sheet_names = list(sheet_names)

        payload = build_upload_response(sheet_names)
        payload["plan"] = _plan_usage_envelope(request)
        return payload

    logger.warning("Upload rejected (%s): unsupported format", uploaded_file_name)
    raise HTTPException(status_code=400, detail=unsupported_format_message())


@app.on_event("startup")
def _log_parquet_upload_support() -> None:
    try:
        import pyarrow

        logger.info("Parquet upload support enabled (pyarrow %s)", pyarrow.__version__)
    except ImportError:
        logger.warning(
            "Parquet uploads disabled — install pyarrow in this environment: "
            "pip install \"pyarrow>=15.0.0\" then restart the backend."
        )


@app.post("/select-sheet")
def select_sheet(data: SheetRequest, request: Request):
    global df, uploaded_file_bytes, uploaded_file_name, selected_sheet_name, column_mapping, dataset_profile, available_sheet_names, column_mapping_metadata

    tier = resolve_plan_tier(request)

    if uploaded_file_bytes is None:
        raise HTTPException(status_code=400, detail="Please upload an Excel file first.")

    if not is_excel_filename(uploaded_file_name or ""):
        raise HTTPException(status_code=400, detail="Sheet selection is available only for Excel files.")

    excel_file = pd.ExcelFile(BytesIO(uploaded_file_bytes))
    sheet_names = excel_file.sheet_names

    if data.sheet_name not in sheet_names:
        raise HTTPException(status_code=400, detail="Invalid sheet name.")

    df = read_sheet_from_excel(uploaded_file_bytes, data.sheet_name)
    selected_sheet_name = data.sheet_name
    if df.empty:
        raise HTTPException(status_code=400, detail="Selected sheet has no usable data.")
    _enforce_dataset_row_cap(tier, len(df))
    dataset_profile = build_profile(df)
    apply_semantic_column_mapping(df, dataset_profile)
    available_sheet_names = list(sheet_names)

    payload = build_upload_response(sheet_names)
    payload["plan"] = _plan_usage_envelope(request)
    return payload


@app.post("/preview")
def get_preview(data: PreviewRequest, request: Request):
    global df

    if df is None:
        raise HTTPException(status_code=400, detail="Please upload a CSV or Excel file first.")

    tier = resolve_plan_tier(request)
    max_preview = get_limits(tier)["max_preview_rows"]

    limit = data.row_limit
    if limit is not None and limit <= 0:
        raise HTTPException(status_code=400, detail="row_limit must be a positive number or null for all rows.")

    if limit is None:
        safe_limit = min(len(df), max_preview)
    else:
        safe_limit = min(int(limit), max_preview)

    if limit is not None and int(limit) > max_preview:
        raise HTTPException(
            status_code=403,
            detail=limit_error_detail(
                "preview_rows",
                f"Preview is limited to {max_preview:,} rows on the {tier.title()} plan. "
                "Upgrade to Paid for larger previews.",
            ),
        )

    view = df.head(safe_limit)

    return _json_safe({
        "rows": int(len(df)),
        "preview": view.to_dict(orient="records"),
        "preview_capped_at": safe_limit,
        "plan": _plan_usage_envelope(request),
    })


@app.post("/update-column-mapping")
def update_column_mapping(data: ColumnMappingRequest):
    global df, selected_sheet_name, uploaded_file_name, uploaded_file_bytes, column_mapping, dataset_profile, column_mapping_metadata

    if df is None:
        raise HTTPException(status_code=400, detail="Please upload a CSV or Excel file first.")

    incoming_map = {
        "product": data.product_column,
        "sales": data.sales_column,
        "region": data.region_column,
        "customer": data.customer_column,
        "profit": data.profit_column,
        "date": data.date_column,
    }

    prof_now = dataset_profile or build_profile(df)
    proposed, meta = compute_semantic_column_mapping(df, prof_now)
    user_mapped_roles: List[str] = []
    for key, value in incoming_map.items():
        if value and value in df.columns:
            column_mapping[key] = value
            user_mapped_roles.append(key)
        else:
            column_mapping[key] = None

    roles = meta.get("roles") or {}
    core_roles = frozenset({"product", "sales", "region", "date"})
    for rk in ("product", "sales", "region", "customer", "profit", "date"):
        rm = dict(roles.get(rk) or {})
        fin = column_mapping.get(rk)
        auto = proposed.get(rk)
        rm["selected"] = fin
        rm["auto_selected"] = auto
        if fin and rk in user_mapped_roles:
            if fin != auto:
                rm["confidence"] = "high"
                rm["override_note"] = "Saved mapping differs from auto-detect."
            else:
                rm["confidence"] = "high"
                rm["override_note"] = "Confirmed by user mapping."
        roles[rk] = rm
    if len([r for r in user_mapped_roles if r in core_roles]) >= 3:
        for rk in core_roles:
            if rk in user_mapped_roles and column_mapping.get(rk):
                roles.setdefault(rk, {})
                roles[rk] = dict(roles.get(rk) or {})
                roles[rk]["confidence"] = "high"
    meta["roles"] = roles
    meta.setdefault("notes", []).append("Column mapping updated from client request.")
    column_mapping_metadata = meta

    updated_kpis = calculate_kpis()
    dataset_profile = build_profile(df)
    kpi_cards, dataset_kind = build_kpi_cards()
    auto_dashboard = build_auto_dashboard()
    prof = dataset_profile or build_profile(df)

    return _json_safe({
        "kpis": updated_kpis,
        "kpi_cards": kpi_cards,
        "dataset_kind": dataset_kind,
        "auto_dashboard": auto_dashboard,
        "suggested_questions": build_suggested_questions(),
        "profile": prof,
        "dimension_options": build_dimension_catalog_for_ui(df, prof),
        "filter_breadcrumb": build_filter_breadcrumb(df, prof, [], None),
        "mapping_metadata": column_mapping_metadata,
        "column_mapping": {
            "product_column": column_mapping.get("product"),
            "sales_column": column_mapping.get("sales"),
            "region_column": column_mapping.get("region"),
            "customer_column": column_mapping.get("customer"),
            "profit_column": column_mapping.get("profit"),
            "date_column": column_mapping.get("date"),
        },
    })


def _pretty_label_text(raw, max_len: int = 56) -> str:
    s = str(raw).replace("_", " ").strip()
    if len(s) > max_len:
        return s[: max_len - 1] + "…"
    return s


def _strip_id_metric_stem(column_name: Optional[str]) -> str:
    """Strip common id/suffix tokens for friendlier count labels (employee_id → employee)."""
    if not column_name:
        return ""
    c = str(column_name).strip().lower().replace(" ", "_")
    for suf in ("_ids", "_id", "_key", "_number", "_no", "_code"):
        if c.endswith(suf) and len(c) > len(suf) + 1:
            c = c[: -len(suf)]
            break
    return c.strip("_")


def _title_case_words(phrase: str) -> str:
    s = str(phrase).replace("_", " ").strip()
    if not s:
        return ""
    parts = [p for p in s.split() if p]
    out: List[str] = []
    for p in parts:
        if p.lower() in ("id", "no", "n/a"):
            continue
        out.append(p[:1].upper() + p[1:].lower() if len(p) > 1 else p.upper())
    return " ".join(out).strip()


def _business_metric_series_label(
    agg_key: Optional[str],
    agg_label: Optional[str],
    value_col: Optional[str],
) -> str:
    """Delegates to centralized analytics_metadata.build_metric_label."""
    return build_metric_label(agg_key, agg_label, value_col)


def _business_chart_title(
    agg_key: Optional[str],
    agg_label: Optional[str],
    value_col: Optional[str],
    group_col: Optional[str],
) -> str:
    metric = _business_metric_series_label(agg_key, agg_label, value_col)
    dim = _pretty_label_text(group_col) if group_col else "Category"
    return f"{metric} by {dim}".strip()


def _chart_title_from_question(question: str) -> str:
    t = question.strip()
    if not t:
        return "Chart"
    one_line = " ".join(t.split())
    if len(one_line) > 72:
        return one_line[:69].rstrip() + "…"
    return one_line[0].upper() + one_line[1:] if len(one_line) > 1 else one_line.upper()


def _extract_after_by(q: str) -> Optional[str]:
    m = re.search(r"\bby\s+([a-z0-9][a-z0-9_\s%/\-]*)", q, re.I)
    if not m:
        return None
    return m.group(1).strip()


def _extract_all_by_dimension_phrases(ql: str) -> List[str]:
    """All phrases following 'by …' (supports 'by A and B')."""
    out: List[str] = []
    for m in re.finditer(
        r"\bby\s+([a-z0-9][a-z0-9_\s%/\-]*?)(?=\s*(?:,|\.|;|\?|\)|$)|\s+vs\b|\s+versus\b|\s+compared\b)",
        ql,
        re.I,
    ):
        chunk = m.group(1).strip()
        for part in re.split(r"\s+and\s+", chunk, flags=re.I):
            sub = part.strip().strip(",").strip()
            if sub:
                out.append(sub)
    return out


def _which_has_focus_phrase_raw(ql: str) -> Optional[str]:
    m = re.search(
        r"\bwhich\s+([a-z0-9][a-z0-9_\s]{0,48}?)\s+(?:has|have|had|was|is|are|shows?)\b",
        ql,
        re.I,
    )
    if not m:
        return None
    return m.group(1).strip()


def _apply_dimension_redirect_metadata(
    intent_debug: Optional[Dict[str, Any]],
    chart_data: List[Any],
    partial_visualization_warning: Optional[str],
) -> Tuple[Optional[Dict[str, Any]], Optional[str]]:
    """
    When the question names a breakdown column that is not in the schema,
    mark a transparent redirect and surface a partial-viz note for confidence/UI.
    """
    if not intent_debug or not intent_debug.get("requested_dimension_missing"):
        return intent_debug, partial_visualization_warning
    if not chart_data:
        return intent_debug, partial_visualization_warning
    gcol = intent_debug.get("group_col")
    if not gcol:
        return intent_debug, partial_visualization_warning
    focus_phrase = str(intent_debug.get("question_focus_phrase") or "").strip()
    phrase_label = _pretty_label_text(focus_phrase) if focus_phrase else "requested dimension"
    alt = _pretty_label_text(str(gcol))
    msg = (
        f"This dataset has no '{phrase_label}' column to answer the question directly; "
        f"showing the closest valid ranking by {alt} instead."
    )
    out_intent = dict(intent_debug)
    out_intent["dimension_redirect_handled"] = True
    pvw = (partial_visualization_warning or "").strip()
    if not pvw or phrase_label.lower() not in pvw.lower():
        pvw = f"{pvw} {msg}".strip() if pvw else msg
    return out_intent, pvw


def _safe_recharts_series_key(label: str, used: set) -> str:
    base = re.sub(r"[^a-zA-Z0-9]+", "_", str(label).strip())
    base = re.sub(r"_+", "_", base).strip("_") or "series"
    if base and base[0].isdigit():
        base = "s_" + base
    k = base
    n = 2
    while k in used:
        k = f"{base}_{n}"
        n += 1
    used.add(k)
    return k


def _try_build_stacked_two_category_chart(
    df: pd.DataFrame,
    profile: Dict[str, Any],
    primary: str,
    secondary: str,
    agg_key: str,
    value_col: Optional[str],
) -> Optional[Tuple[str, List[Dict[str, Any]], str, Dict[str, Any]]]:
    """
    Stacked bars: primary on category axis, stacks = secondary dimension.
    Returns (exact_result, chart_rows, title, multi_series_meta) or None.
    """
    if primary not in df.columns or secondary not in df.columns or primary == secondary:
        return None
    if agg_key != "count":
        return None
    ct = profile.get("column_types", {})
    try:
        use_cols = [primary, secondary]
        if value_col and value_col in df.columns and value_col not in use_cols:
            use_cols.append(value_col)
        sub = df[use_cols].dropna(subset=[primary, secondary])
        if sub.empty:
            return None
        if value_col and value_col in sub.columns and ct.get(str(value_col)) not in (
            "number",
        ):
            g = sub.groupby([primary, secondary])[value_col].nunique()
        else:
            g = sub.groupby([primary, secondary]).size()
        g = g.reset_index(name="_v")
        piv = g.pivot(index=primary, columns=secondary, values="_v").fillna(0)
        if piv.shape[0] == 0 or piv.shape[1] == 0:
            return None
        col_totals = piv.sum(axis=0).sort_values(ascending=False).head(12)
        piv = piv[[c for c in col_totals.index if c in piv.columns]]
        if piv.shape[1] == 0:
            return None
        row_totals = piv.sum(axis=1).sort_values(ascending=False).head(28)
        piv = piv.loc[[idx for idx in row_totals.index if idx in piv.index]]

        used: set = set()
        key_map: Dict[str, str] = {}
        display_by_key: Dict[str, str] = {}
        for col in piv.columns:
            sk = _safe_recharts_series_key(str(col), used)
            key_map[str(col)] = sk
            display_by_key[sk] = _pretty_label_text(col)

        rows_out: List[Dict[str, Any]] = []
        for idx in piv.index:
            row: Dict[str, Any] = {"name": _pretty_label_text(idx), "value": 0.0}
            tot = 0.0
            for orig_c in piv.columns:
                vv = float(piv.loc[idx, orig_c])
                sk = key_map[str(orig_c)]
                row[sk] = vv
                tot += vv
            row["value"] = tot
            rows_out.append(row)

        series_keys = [key_map[str(c)] for c in piv.columns]
        exact = piv.to_string(max_rows=40, max_cols=20)
        met_phrase = _business_metric_series_label(
            "count", "count", str(value_col) if value_col else None
        )
        title = (
            f"{met_phrase} by {_pretty_label_text(primary)} "
            f"({_pretty_label_text(secondary)} breakdown)"
        ).strip()
        meta = {
            "layout": "stacked_bar",
            "categoryAxisTitle": _pretty_label_text(primary),
            "stackAxisTitle": _pretty_label_text(secondary),
            "seriesKeys": series_keys,
            "seriesLabels": display_by_key,
            "rows": rows_out,
        }
        return exact, rows_out, title, meta
    except Exception:
        return None


def _build_analysis_validation_block(
    *,
    intent_debug: Optional[Dict[str, Any]],
    multi_rendered: bool,
    secondary_requested: bool,
    partial_message: Optional[str],
) -> Dict[str, Any]:
    dual_compare = bool(intent_debug and intent_debug.get("dual_metric_compare"))
    compare_metrics = (
        list(intent_debug.get("compare_metrics") or [])
        if intent_debug
        else []
    )
    metric_ok = bool(intent_debug and intent_debug.get("value_col"))
    if dual_compare:
        metric_ok = len(compare_metrics) >= 2 and bool(
            intent_debug.get("secondary_metric_col")
        )
    elif intent_debug and (
        intent_debug.get("explicit_metric")
        or _question_requests_roi(str(intent_debug.get("normalized_question") or ""))
        or _question_requests_profit_margin(str(intent_debug.get("normalized_question") or ""))
    ):
        metric_ok = _rendered_metric_matches_question(
            str(intent_debug.get("normalized_question") or ""),
            intent_debug,
            None,
        )
    primary_ok = bool(intent_debug and intent_debug.get("group_col"))
    if intent_debug and intent_debug.get("requested_dimension_missing"):
        primary_ok = False
    sec_ok = bool(multi_rendered and secondary_requested)
    if dual_compare:
        sec_label = "Both requested metrics rendered in chart"
        sec_ok = metric_ok and multi_rendered
        checks = [
            {"label": "Both comparison metrics included", "ok": bool(metric_ok)},
            {"label": "Breakdown dimension aligned with question", "ok": bool(primary_ok)},
            {"label": sec_label, "ok": bool(sec_ok)},
        ]
    else:
        sec_label = (
            "Secondary breakdown rendered in chart"
            if secondary_requested
            else "Secondary dimension (not required)"
        )
        if secondary_requested and not sec_ok:
            sec_label = "Secondary grouping omitted or simplified in chart"
        checks = [
            {"label": "Metric aligned with question", "ok": bool(metric_ok)},
            {"label": "Primary dimension aligned with question", "ok": bool(primary_ok)},
            {"label": sec_label, "ok": bool(sec_ok)},
        ]
    return {
        "checks": checks,
        "partialVisualizationWarning": (partial_message or "").strip() or None,
    }


def _extract_top_n(q: str) -> Optional[int]:
    m = re.search(r"\btop\s+(\d{1,2})\b", q, re.I)
    if m:
        return max(2, min(50, int(m.group(1))))
    word_map = {
        "five": 5,
        "ten": 10,
        "three": 3,
        "four": 4,
        "six": 6,
        "seven": 7,
        "eight": 8,
        "nine": 9,
    }
    for w, n in word_map.items():
        if re.search(rf"\btop\s+{w}\b", q, re.I):
            return n
    return None


def _extract_bottom_n(q: str) -> Optional[int]:
    m = re.search(r"\bbottom\s+(\d{1,2})\b", q, re.I)
    if m:
        return max(2, min(50, int(m.group(1))))
    word_map = {
        "five": 5,
        "ten": 10,
        "three": 3,
        "four": 4,
    }
    for w, n in word_map.items():
        if re.search(rf"\bbottom\s+{w}\b", q, re.I):
            return n
    return None


def _match_column_from_phrase(phrase: str, columns: List[str], profile: Dict[str, Any]) -> Optional[str]:
    if not phrase:
        return None
    try:
        from intent_engine.column_resolve import resolve_dimension_phrase_to_column

        hit = resolve_dimension_phrase_to_column(phrase, columns, profile)
        if hit:
            return hit
    except Exception:
        pass
    p = phrase.lower().replace(" ", "_").strip()
    if p.endswith("ies") and len(p) > 4:
        p_alt = p[:-3] + "y"
    elif p.endswith("s") and not p.endswith("ss") and len(p) > 3:
        p_alt = p[:-1]
    else:
        p_alt = p
    ct = profile.get("column_types", {})
    best = None
    best_score = 0
    for c in columns:
        cn = str(c).lower().replace(" ", "_")
        for probe in (p, p_alt):
            score = 0
            if probe == cn:
                score = 100
            elif len(probe) >= 4 and (probe in cn or cn in probe):
                score = 75
            else:
                toks = [t for t in probe.split("_") if len(t) > 1]
                if toks and all(any(tok in cn for tok in toks) for tok in toks):
                    score = 55
            if ct.get(c) in ("category", "text", "date"):
                score += 4
            if score > best_score:
                best_score = score
                best = c
    return best if best_score >= 50 else None


def _resolve_by_column_from_question(q: str, columns: List[str], profile: Dict[str, Any]) -> Optional[str]:
    global df
    phrase = _extract_after_by(q)
    if phrase:
        cat_pool = _dimension_pool_columns(df, profile, columns=columns)
        hit = _match_column_from_phrase(phrase, cat_pool or columns, profile)
        if hit:
            return hit
    return None


def _numeric_entity_dimension_columns(df, profile: Dict[str, Any], max_nu: int = 120) -> List[str]:
    """Numeric columns that are still reasonable group-by keys (machine_id, plant_id, …)."""
    if df is None or df.empty:
        return []
    ct = profile.get("column_types", {})
    out: List[str] = []
    for c in df.columns.tolist():
        if ct.get(c) != "number":
            continue
        n = _norm_header_token(str(c))
        if _id_like_column_name(c) and not re.search(
            r"(machine|plant|line|equipment|asset|campaign|sku|product|order)_id$",
            n,
        ):
            continue
        if not re.search(
            r"(machine|plant|line|equipment|asset|campaign|severity|channel|sku|product)_id$|"
            r"\b(machine|plant|line|equipment|campaign)\b",
            n,
        ):
            continue
        try:
            nu = int(df[c].nunique(dropna=True))
        except Exception:
            continue
        if 2 <= nu <= max_nu:
            out.append(str(c))
    return out


def _dimension_pool_columns(
    df,
    profile: Dict[str, Any],
    columns: Optional[List[str]] = None,
) -> List[str]:
    """Category / text / date columns plus entity-like numeric dimensions."""
    cols = columns if columns is not None else (df.columns.tolist() if df is not None else [])
    ct = profile.get("column_types", {})
    seen: set = set()
    out: List[str] = []
    for c in cols:
        if ct.get(c) in ("category", "text", "date"):
            if c not in seen:
                seen.add(c)
                out.append(c)
    if df is not None:
        for c in _numeric_entity_dimension_columns(df, profile):
            if c not in seen:
                seen.add(c)
                out.append(c)
    return out


def _infer_dimension_column_from_question(
    question_str: str, df, profile
) -> Optional[str]:
    """
    Find a grouping dimension when the question does not say 'by X', e.g.
    'Which department has the highest average salary?'
    """
    if df is None or df.empty:
        return None
    ql = question_str.lower()
    ct = profile.get("column_types", {})
    columns = df.columns.tolist()

    cand_dims = _dimension_pool_columns(df, profile)

    phrase = _extract_after_by(ql)
    if phrase:
        hit = _match_column_from_phrase(phrase, cand_dims or columns, profile)
        if hit:
            return hit

    mm = re.search(
        r"\bwhich\s+([a-z0-9][a-z0-9_\s]{0,48}?)\s+(?:generated|produced|recorded|saw|had)\b",
        ql,
        re.I,
    )
    if mm:
        raw_phrase = mm.group(1).strip().replace("-", "_")
        hit = _match_column_from_phrase(raw_phrase, cand_dims or columns, profile)
        if hit:
            return hit
        alt = raw_phrase.replace(" ", "_")
        hit = _match_column_from_phrase(alt, cand_dims or columns, profile)
        if hit:
            return hit

    mm_is = re.search(r"\bwhich\s+([a-z0-9][a-z0-9_\s]{0,48}?)\s+is\b", ql, re.I)
    if mm_is:
        raw_phrase = mm_is.group(1).strip().replace("-", "_")
        hit = _match_column_from_phrase(raw_phrase, cand_dims or columns, profile)
        if hit:
            return hit
        alt = raw_phrase.replace(" ", "_")
        hit = _match_column_from_phrase(alt, cand_dims or columns, profile)
        if hit:
            return hit

    mm = re.search(
        r"\bwhich\s+([a-z0-9][a-z0-9_\s]*?)\s+(?:has|have|shows?)\b",
        ql,
        re.I,
    )
    if mm:
        raw_phrase = mm.group(1).strip().replace("-", "_")
        hit = _match_column_from_phrase(raw_phrase, cand_dims or columns, profile)
        if hit:
            return hit
        alt = raw_phrase.replace(" ", "_")
        hit = _match_column_from_phrase(alt, cand_dims or columns, profile)
        if hit:
            return hit

    mm_delivers = re.search(
        r"\bwhich\s+([a-z0-9][a-z0-9_\s]{0,48}?)\s+(?:delivers?|drives?|generates?)\b",
        ql,
        re.I,
    )
    if mm_delivers:
        raw_phrase = mm_delivers.group(1).strip().replace("-", "_")
        hit = _match_column_from_phrase(raw_phrase, cand_dims or columns, profile)
        if hit:
            return hit
        alt = raw_phrase.replace(" ", "_")
        hit = _match_column_from_phrase(alt, cand_dims or columns, profile)
        if hit:
            return hit

    mm_contrib = re.search(
        r"\bwhich\s+([a-z0-9][a-z0-9_\s]{0,48}?)\s+contributes?\b",
        ql,
        re.I,
    )
    if mm_contrib:
        raw_phrase = mm_contrib.group(1).strip().replace("-", "_")
        hit = _match_column_from_phrase(raw_phrase, cand_dims or columns, profile)
        if hit:
            return hit
        alt = raw_phrase.replace(" ", "_")
        hit = _match_column_from_phrase(alt, cand_dims or columns, profile)
        if hit:
            return hit

    scored: List[Tuple[int, str]] = []
    for c in cand_dims:
        variants = (
            str(c).lower(),
            str(c).lower().replace("_", " "),
        )
        for key in variants:
            if len(key) < 3:
                continue
            if key in ql:
                scored.append((len(key), c))
                break

    if scored:
        return max(scored, key=lambda t: t[0])[1]

    try:
        from intent_engine.geographic_scope import resolve_geographic_group_column

        geo_col = resolve_geographic_group_column(question_str, df, profile)
        if geo_col:
            return geo_col
    except Exception:
        pass

    rank_city = re.search(
        r"\b(?:rank(?:ing)?|top|best|highest|lowest|leading)\s+(?:\w+\s+){0,4}cit(?:y|ies)\b",
        ql,
        re.I,
    )
    if rank_city:
        for c in cand_dims:
            if str(c).lower() in ("city", "cities", "metro", "location"):
                return str(c)

    rank_dim = re.search(
        r"\brank(?:ing)?\s+([a-z0-9][a-z0-9_\s]{0,32}?)\s+by\b",
        ql,
        re.I,
    )
    if rank_dim:
        try:
            from intent_engine.column_resolve import resolve_dimension_phrase_to_column

            raw_rank_dim = rank_dim.group(1).strip()
            hit = resolve_dimension_phrase_to_column(
                raw_rank_dim, cand_dims or columns, profile
            )
            if hit:
                return str(hit)
        except Exception:
            pass

    ranked_fb = _rank_category_dimensions(df, cand_dims, profile)
    if ranked_fb:
        return ranked_fb[0][0]
    return None


def _pick_executive_summary_dimension(
    df,
    profile: Dict[str, Any],
) -> Optional[str]:
    """Prefer geographic or business rollup dimensions for executive-style questions."""
    if df is None or df.empty:
        return None
    try:
        from intent_engine.geographic_scope import resolve_geographic_group_column

        for hint in (
            "compare region performance",
            "by region",
            "across regions",
            "compare cities",
            "by city",
        ):
            col = resolve_geographic_group_column(hint, df, profile)
            if col and col in df.columns:
                return str(col)
    except Exception:
        pass

    cand_dims = _dimension_pool_columns(df, profile)
    ranked = _rank_category_dimensions(df, cand_dims, profile)
    if not ranked:
        return None
    prefer_tokens = ("region", "zone", "city", "category", "segment", "channel")
    for token in prefer_tokens:
        for col, _sc in ranked:
            if token in str(col).lower().replace("_", " "):
                return str(col)
    return str(ranked[0][0])


def _describe_aggregate_intent(question_str: str, df, profile) -> Optional[Dict[str, Any]]:
    """
    Map natural language to grouping column + value column + aggregation label.
    Uses pandas dtypes only — no AI.
    """
    if df is None or df.empty:
        return None
    ql = question_str.lower().strip()
    cols = df.columns.tolist()
    ct = profile.get("column_types", {})
    numeric_cols = [c for c in cols if ct.get(c) == "number"]

    try:
        from intent_engine.question_patterns import question_requests_correlation_routing
        from intent_engine.correlation_analysis import resolve_relationship_numeric_pair

        if question_requests_correlation_routing(question_str):
            if resolve_relationship_numeric_pair(question_str, df, profile):
                return None
    except Exception:
        pass
    if _scatter_pair_from_question(question_str, numeric_cols):
        return None

    cand_dims = _dimension_pool_columns(df, profile)

    try:
        from intent_engine.dimension_request import (
            extract_rank_dimension_phrase,
            filter_dimension_request_phrases,
            resolve_phrase_to_column,
        )
        from intent_engine.column_resolve import resolve_dimension_phrase_to_column

        rank_dim_phrase = extract_rank_dimension_phrase(ql)
    except Exception:
        rank_dim_phrase = None
        filter_dimension_request_phrases = lambda phrases, *_a, **_k: phrases  # type: ignore
        resolve_dimension_phrase_to_column = None  # type: ignore

    by_phrases = _extract_all_by_dimension_phrases(ql)
    by_phrases = filter_dimension_request_phrases(
        by_phrases, df, profile, match_column=_match_column_from_phrase
    )
    by_cols_ordered: List[str] = []
    seen_b: set = set()
    for phrase in by_phrases:
        if _is_time_bucket_phrase(phrase):
            hit = _pick_date_column_for_trend(df, profile)
        else:
            hit = _match_column_from_phrase(phrase, cand_dims or cols, profile)
        if hit and hit not in seen_b:
            by_cols_ordered.append(hit)
            seen_b.add(hit)

    focus_raw = _which_has_focus_phrase_raw(ql)
    focus_col = (
        _match_column_from_phrase(focus_raw, cand_dims or cols, profile)
        if focus_raw
        else None
    )

    try:
        from intent_engine.dimension_request import (
            extract_dimension_request_phrases,
            phrase_is_time_bucket,
            question_requests_executive_summary,
            resolve_phrase_to_column,
            _phrase_refers_to_metric_column,
        )

        dim_request_phrases = extract_dimension_request_phrases(ql)
    except Exception:
        dim_request_phrases = []
        phrase_is_time_bucket = lambda _p: False  # type: ignore
        question_requests_executive_summary = lambda _q: False  # type: ignore
        resolve_phrase_to_column = lambda *_a, **_k: None  # type: ignore

    secondary_col: Optional[str] = None
    gcol: Optional[str] = None

    if rank_dim_phrase and resolve_dimension_phrase_to_column:
        rank_hit = resolve_dimension_phrase_to_column(
            rank_dim_phrase, cand_dims or cols, profile
        )
        if rank_hit:
            gcol = str(rank_hit)

    if focus_col and by_cols_ordered:
        if focus_col != by_cols_ordered[-1]:
            gcol = focus_col
            secondary_col = by_cols_ordered[-1]
        else:
            gcol = focus_col
    elif len(by_cols_ordered) >= 2:
        gcol = by_cols_ordered[0]
        secondary_col = by_cols_ordered[1]
    else:
        if not gcol:
            gcol = _resolve_by_column_from_question(ql, cols, profile)
        if not gcol and by_cols_ordered:
            gcol = by_cols_ordered[0]
        if not gcol:
            metric_filtered_phrases = filter_dimension_request_phrases(
                dim_request_phrases,
                df,
                profile,
                match_column=_match_column_from_phrase,
            )
            for phrase in metric_filtered_phrases:
                if phrase_is_time_bucket(phrase):
                    dcol = _pick_date_column_for_trend(df, profile)
                    if dcol:
                        gcol = dcol
                        break
                    continue
                resolved = resolve_phrase_to_column(
                    phrase,
                    df,
                    profile,
                    match_column=_match_column_from_phrase,
                    pick_date_column=_pick_date_column_for_trend,
                    dimension_pool=_dimension_pool_columns,
                )
                if resolved:
                    gcol = resolved
                    break
        if not gcol:
            gcol = _infer_dimension_column_from_question(question_str, df, profile)

    for phrase in dim_request_phrases:
        if phrase_is_time_bucket(phrase):
            dcol = _pick_date_column_for_trend(df, profile)
            if dcol:
                gcol = dcol

    if question_requests_executive_summary(question_str):
        try:
            from intent_engine.dimension_request import (
                question_asks_categorical_share_composition,
            )

            skip_exec_summary_dim = bool(by_cols_ordered) or (
                question_asks_categorical_share_composition(question_str)
            )
        except Exception:
            skip_exec_summary_dim = bool(by_cols_ordered)
        if not skip_exec_summary_dim:
            exec_dim = _pick_executive_summary_dimension(df, profile)
            if exec_dim:
                gcol = exec_dim

    try:
        from intent_engine.geographic_scope import (
            question_geographic_scope_level,
            resolve_geographic_group_column,
        )

        geo_gcol = resolve_geographic_group_column(question_str, df, profile)
        if geo_gcol:
            explicit_named = next(
                (
                    str(c)
                    for c in (cand_dims or cols)
                    if _question_explicitly_requests_dimension(ql, str(c))
                ),
                None,
            )
            if explicit_named:
                gcol = explicit_named
            else:
                gcol = geo_gcol
    except Exception:
        pass

    incident_only = bool(re.search(r"\bincidents?\b", ql)) and not re.search(
        r"\b(downtime|minutes|outage|production\s*loss|repair\s*cost|revenue|sales|loss\s*units)\b",
        ql,
    )
    ncol: Optional[str] = None
    if incident_only and gcol:
        icol = _find_first_column(
            cols,
            [
                "incident_count",
                "incident count",
                "incidents_count",
                "num_incidents",
                "n_incidents",
            ],
        )
        if icol and str(icol) != str(gcol) and icol in numeric_cols:
            ncol = icol
        if ncol is None:
            iid = _find_first_column(
                cols,
                [
                    "incident_id",
                    "incident id",
                    "case_id",
                    "case id",
                    "ticket_id",
                    "ticket id",
                ],
            )
            if iid and str(iid) != str(gcol) and iid in cols:
                ncol = str(iid)
    metric_spec = _resolve_question_metric_spec(
        question_str, df, profile, group_col=gcol
    )
    if metric_spec:
        ncol = metric_spec["value_col"]
    elif ncol is None:
        ncol = _best_numeric_column_for_question(question_str, numeric_cols)
    if incident_only and gcol and ncol is not None:
        cn_inc = _norm_metric_phrase_for_match(str(ncol))
        if "downtime" in cn_inc or "outage" in cn_inc:
            ncol = None
    if ncol is None and incident_only and gcol:
        return None

    record_count_requested = False
    try:
        from intent_engine.resolve_explicit_metric import question_requests_record_count

        record_count_requested = question_requests_record_count(
            ql, resolved_metric_col=str(ncol) if ncol else None
        )
    except Exception:
        record_count_requested = bool(
            re.search(r"\b(count|how many|number of)\b", ql) or "headcount" in ql
        )

    if ncol is None and record_count_requested:
        idc = _find_first_column(
            cols,
            ["employee_id", "emp_id", "staff_id", "employee id", "emp id", "staff id"],
        )
        if idc and gcol and str(idc) != str(gcol):
            ncol = idc
    if ncol is None and len(numeric_cols) == 1:
        ncol = numeric_cols[0]

    if ncol is None and gcol and numeric_cols:
        domain = str(
            profile.get("domain") or profile.get("dataset_domain") or "generic"
        )
        ncol = _pick_default_metric_column(question_str, numeric_cols, domain)

    if not ncol or not gcol or ncol == gcol:
        return None

    if _question_requests_trend_intent(ql):
        d_trend = _pick_date_column_for_trend(df, profile)
        if d_trend:
            gcol = d_trend
            secondary_col = None

    if metric_spec and metric_spec.get("derived_profit_margin"):
        agg_label, agg_key = "Profit margin", "mean"
    elif metric_spec and metric_spec.get("derived_roi"):
        agg_label, agg_key = "ROI", "mean"
    elif metric_spec and metric_spec.get("entity_record_count"):
        agg_label, agg_key = "Count", "count"
    else:
        agg_label, agg_key = _resolve_agg_label_and_key(
            ql,
            value_col=ncol,
            incident_only=incident_only,
            explicit_metric_resolved=bool(
                metric_spec
                and metric_spec.get("explicit_metric")
                and not metric_spec.get("entity_record_count")
            ),
        )

    derived_metric_keys = (_DERIVED_ROI_METRIC_KEY, _DERIVED_PROFIT_MARGIN_METRIC_KEY)
    if (
        str(ncol) not in derived_metric_keys
        and agg_key != "count"
        and ncol not in numeric_cols
    ):
        return None

    out_intent: Dict[str, Any] = {
        "group_col": gcol,
        "value_col": ncol,
        "agg_label": agg_label,
        "agg_key": agg_key,
        "normalized_question": ql,
        "question_focus_col": focus_col,
        "secondary_group_col": secondary_col,
    }
    if focus_raw and not focus_col:
        if not _phrase_refers_to_metric_column(
            focus_raw,
            df,
            profile,
            match_column=_match_column_from_phrase,
        ):
            out_intent["question_focus_phrase"] = focus_raw
            out_intent["requested_dimension_missing"] = True

    missing_phrase: Optional[str] = None
    for phrase in dim_request_phrases:
        if _phrase_refers_to_metric_column(
            phrase, df, profile, match_column=_match_column_from_phrase
        ):
            continue
        if phrase_is_time_bucket(phrase):
            if _pick_date_column_for_trend(df, profile):
                missing_phrase = phrase
            else:
                missing_phrase = phrase
            continue
        resolved = resolve_phrase_to_column(
            phrase,
            df,
            profile,
            match_column=_match_column_from_phrase,
            pick_date_column=_pick_date_column_for_trend,
            dimension_pool=_dimension_pool_columns,
        )
        if not resolved:
            missing_phrase = phrase
            break

    if missing_phrase:
        out_intent["question_focus_phrase"] = missing_phrase
        out_intent["requested_dimension_missing"] = True
    if secondary_col and (not focus_col) and len(by_cols_ordered) >= 2:
        out_intent["dimension_notes"] = (
            "Multiple 'by' dimensions detected; using first as primary axis "
            f"and second as stack ({_pretty_label_text(by_cols_ordered[0])} × "
            f"{_pretty_label_text(by_cols_ordered[1])})."
        )
    elif secondary_col and focus_col:
        out_intent["dimension_notes"] = (
            f"Primary breakdown: {_pretty_label_text(focus_col)}; "
            f"stacked by {_pretty_label_text(secondary_col)}."
        )
    if metric_spec:
        _apply_metric_spec_to_intent(out_intent, metric_spec)
    try:
        from intent_engine.column_resolve import dimension_vocabulary_provenance_note

        vocab_note = dimension_vocabulary_provenance_note(question_str, gcol, df)
        if vocab_note:
            existing = out_intent.get("dimension_notes")
            out_intent["dimension_notes"] = (
                f"{existing} {vocab_note}".strip() if existing else vocab_note
            )
    except Exception:
        pass
    try:
        from intent_engine.geographic_scope import question_geographic_scope_level

        geo_level = question_geographic_scope_level(question_str)
        if geo_level:
            out_intent["geographic_scope_level"] = geo_level
            out_intent["geographic_scope_column"] = gcol
    except Exception:
        pass
    return out_intent


def _fallback_aggregate_chart(
    intent: Dict[str, Any],
    question: str = "",
) -> Tuple[List[Dict[str, Any]], str, str, Optional[Dict[str, Any]]]:
    """Produce name/value chart rows + internal chart_type + title (+ optional time-series meta)."""
    global df, dataset_profile

    group_col = intent["group_col"]
    target = intent["value_col"]
    agg_key = intent["agg_key"]

    chart_type_internal = "bar"
    profile = dataset_profile or build_profile(df)
    ct = profile.get("column_types", {})
    q_fb = (question or "").lower()
    gc = _prefer_lower_cardinality_dimension(
        df, profile, str(group_col), str(target), q_fb
    )

    if intent.get("derived_roi"):
        rev = intent.get("revenue_col")
        spend = intent.get("spend_col")
        if rev and spend:
            try:
                g = _grouped_derived_roi_series(df, str(gc), str(rev), str(spend))
                if g is not None and not g.empty:
                    result = g.reset_index()
                    result.columns = ["name", "value"]
                    result = result.sort_values("value", ascending=False)
                    chart_data = [
                        {
                            "name": _pretty_label_text(r["name"]),
                            "value": float(r["value"]),
                        }
                        for _, r in result.iterrows()
                    ]
                    if chart_data:
                        dim = _pretty_label_text(str(gc))
                        title = f"ROI by {dim.lower()}"
                        return chart_data, chart_type_internal, title, None
            except Exception:
                pass
        return [], "", "", None

    if intent.get("derived_profit_margin"):
        profit_c = intent.get("profit_col")
        rev_c = intent.get("revenue_col")
        if profit_c and rev_c:
            try:
                g = _grouped_derived_profit_margin_series(
                    df, str(gc), str(profit_c), str(rev_c)
                )
                if g is not None and not g.empty:
                    result = g.reset_index()
                    result.columns = ["name", "value"]
                    result = result.sort_values("value", ascending=False)
                    chart_data = [
                        {
                            "name": _pretty_label_text(r["name"]),
                            "value": float(r["value"]),
                        }
                        for _, r in result.iterrows()
                    ]
                    if chart_data:
                        dim = _pretty_label_text(str(gc))
                        title = f"Profit margin by {dim.lower()}"
                        return chart_data, chart_type_internal, title, None
            except Exception:
                pass
        return [], "", "", None

    if agg_key == "count" and ct.get(target) not in ("number",):
        try:
            tmp = df[[gc, target]].dropna(subset=[gc])
            if tmp.empty:
                return [], "", "", None
            g = tmp.groupby(gc).size()
        except Exception:
            return [], "", "", None
        result = g.reset_index()
        if result.shape[1] < 2:
            return [], "", "", None
        c0, c1 = result.columns[0], result.columns[1]
        result = result.rename(columns={c0: "name", c1: "value"}).sort_values(
            "value", ascending=False
        )
        chart_data = [
            {
                "name": _pretty_label_text(r["name"]),
                "value": float(r["value"]),
            }
            for _, r in result.iterrows()
        ]
        if not chart_data:
            return [], "", "", None
        title = _business_chart_title(
            str(intent.get("agg_key") or ""),
            str(intent.get("agg_label") or ""),
            str(target),
            str(gc),
        )
        return chart_data, chart_type_internal, title, None
    else:
        sub = df[[gc, target]].copy()
        sub["_v"] = numeric_series(target)
        sub = sub.dropna(subset=[gc, "_v"])
        if sub.empty:
            return [], "", "", None

        group_is_ts_axis = ct.get(str(gc)) == "date" or _group_column_is_time_series_eligible(
            df, str(gc)
        )
        if group_is_ts_axis and str(agg_key) in (
            "sum",
            "mean",
            "min",
            "max",
        ):
            g_series, ts_meta = _adaptive_time_series_grouped(
                df[[gc, target]].copy(),
                str(gc),
                str(target),
                agg_key=str(agg_key),
            )
            if g_series is not None and len(g_series) >= 2:
                chart_data = _time_series_rows_from_grouped(g_series)
                tb = _freq_human_label(str(ts_meta.get("timeBucket") or "M"))
                title = f"{_pretty_label_text(str(target))} over time ({tb})".strip()
                return chart_data, "line", title, ts_meta

        if agg_key == "sum":
            g = sub.groupby(gc)["_v"].sum()
        elif agg_key == "mean":
            g = sub.groupby(gc)["_v"].mean()
        elif agg_key == "min":
            g = sub.groupby(gc)["_v"].min()
        elif agg_key == "max":
            g = sub.groupby(gc)["_v"].max()
        elif agg_key == "count":
            g = sub.groupby(gc)["_v"].count()
        else:
            g = sub.groupby(gc)["_v"].mean()

        result = (
            g.reset_index()
            .rename(columns={gc: "name", "_v": "value"})
            .sort_values("value", ascending=False)
        )
        chart_data = [
            {
                "name": _pretty_label_text(r["name"]),
                "value": float(r["value"]),
            }
            for _, r in result.iterrows()
        ]
        if not chart_data:
            return [], "", "", None

        title = _business_chart_title(
            str(intent.get("agg_key") or ""),
            str(intent.get("agg_label") or ""),
            str(target),
            str(gc),
        )
        return chart_data, chart_type_internal, title, None


def _tabular_exact_from_name_value_rows(
    rows: List[Dict[str, Any]], max_rows: int = 55
) -> str:
    if not rows:
        return ""
    lines = ["name\tvalue"]
    for r in rows[:max_rows]:
        nm = _pretty_label_text(r.get("name"))
        try:
            vv = float(r.get("value"))
        except (TypeError, ValueError):
            continue
        lines.append(f"{nm}\t{vv:g}")
    if len(rows) > max_rows:
        lines.append(f"(… {len(rows) - max_rows} more rows omitted)")
    return "\n".join(lines)


def _norm_metric_phrase_for_match(s: str) -> str:
    """Align suggested-question wording (percentage, pct) with column token matching."""
    t = str(s).lower().replace("_", " ")
    t = re.sub(r"\bpercentage\b", "percent", t)
    t = re.sub(r"\bpct\b", "percent", t)
    return t


_DERIVED_ROI_METRIC_KEY = "__derived_roi__"
_DERIVED_PROFIT_MARGIN_METRIC_KEY = "__derived_profit_margin__"


def _question_requests_profit_margin(q: str) -> bool:
    ql = _norm_metric_phrase_for_match(q)
    if re.search(r"\bprofit\s+margin\b", ql):
        return True
    if re.search(r"\bprofitability\s+rate\b", ql):
        return True
    if re.search(
        r"\b(best|highest|lowest|worst|maximum|max|minimum|min|top)\s+margin\b", ql
    ):
        return True
    if re.search(r"\bmargin\s+(by|across|per)\b", ql):
        return True
    if re.search(r"\b(best|highest|lowest)\s+profitability\b", ql):
        return True
    if re.search(r"\bmargin\b", ql) and re.search(
        r"\b(region|product|department|channel|segment|campaign|which|what)\b", ql
    ):
        return True
    return False


def _question_requests_roi(q: str) -> bool:
    ql = _norm_metric_phrase_for_match(q)
    return bool(
        re.search(r"\broi\b", ql)
        or re.search(r"\breturn\s+on\s+investment\b", ql)
        or re.search(r"\bcampaign\s+efficiency\b", ql)
        or re.search(r"\bcampaign\s+roi\b", ql)
    )


def _find_roi_column(columns: List[str], numeric_cols: List[str]) -> Optional[str]:
    for c in numeric_cols:
        cn = _norm_metric_phrase_for_match(str(c))
        if cn == "roi" or re.search(r"\broi\b", cn):
            return str(c)
    for c in columns:
        cn = _norm_metric_phrase_for_match(str(c))
        if cn == "roi" or re.search(r"\broi\b", cn):
            return str(c)
    return None


def _find_revenue_and_spend_columns(
    columns: List[str], numeric_cols: List[str]
) -> Tuple[Optional[str], Optional[str]]:
    rev = get_mapped_or_detected_column(
        "sales",
        [
            "sales",
            "revenue",
            "amount",
            "total",
            "value",
            "total_revenue",
            "gross_revenue",
        ],
    )
    if rev and rev not in numeric_cols:
        rev = None
    if not rev:
        for c in numeric_cols:
            cn = _norm_header_token(str(c))
            if any(k in cn for k in ("revenue", "sales", "gross")):
                rev = str(c)
                break
    spend = None
    for c in numeric_cols:
        cn = _norm_header_token(str(c))
        if any(
            k in cn
            for k in (
                "spend",
                "cost",
                "ad_spend",
                "adspend",
                "budget",
                "expense",
                "investment",
            )
        ):
            spend = str(c)
            break
    if rev and spend and str(rev).lower() == str(spend).lower():
        spend = None
    return rev, spend


def _find_profit_and_revenue_columns(
    columns: List[str], numeric_cols: List[str]
) -> Tuple[Optional[str], Optional[str]]:
    profit = get_mapped_or_detected_column(
        "profit",
        ["profit", "net profit", "gross profit", "earnings", "gp"],
    )
    if profit and profit not in numeric_cols:
        profit = None
    if not profit:
        for c in numeric_cols:
            cn = _norm_header_token(str(c))
            if "profit" in cn and "margin" not in cn:
                profit = str(c)
                break
    revenue = get_mapped_or_detected_column(
        "sales",
        [
            "sales",
            "revenue",
            "amount",
            "total",
            "value",
            "total_revenue",
            "gross_revenue",
        ],
    )
    if revenue and revenue not in numeric_cols:
        revenue = None
    if not revenue:
        for c in numeric_cols:
            cn = _norm_header_token(str(c))
            if any(k in cn for k in ("revenue", "sales", "gross")) and "profit" not in cn:
                revenue = str(c)
                break
    if profit and revenue and str(profit).lower() == str(revenue).lower():
        revenue = None
    return profit, revenue


def _resolve_question_metric_spec(
    question: str,
    df_in: pd.DataFrame,
    profile: Dict[str, Any],
    *,
    group_col: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    """
    Resolve derived measures (profit margin %, ROI) when the question names them
    but no dedicated column exists.
    """
    if df_in is None or df_in.empty:
        return None
    ql = str(question or "").lower().strip()
    columns = df_in.columns.tolist()
    ct = profile.get("column_types", {})
    numeric_cols = [c for c in columns if ct.get(c) == "number"]

    if _question_requests_profit_margin(question):
        profit_col, rev_col = _find_profit_and_revenue_columns(columns, numeric_cols)
        if (
            profit_col
            and rev_col
            and profit_col in df_in.columns
            and rev_col in df_in.columns
        ):
            return {
                "value_col": _DERIVED_PROFIT_MARGIN_METRIC_KEY,
                "metric_display": "Profit margin %",
                "requested_metric_token": "profit_margin",
                "derived_profit_margin": True,
                "profit_col": profit_col,
                "revenue_col": rev_col,
            }
        return None

    try:
        from intent_engine.resolve_explicit_metric import resolve_explicit_metric_spec

        explicit = resolve_explicit_metric_spec(
            question, df_in, profile, group_col=group_col
        )
        if explicit:
            return explicit
    except Exception:
        pass

    if not _question_requests_roi(question):
        return None

    roi_col = _find_roi_column(columns, numeric_cols)
    if roi_col and roi_col in df_in.columns:
        return {
            "value_col": roi_col,
            "metric_display": "ROI",
            "requested_metric_token": "roi",
            "derived_roi": False,
        }

    rev, spend = _find_revenue_and_spend_columns(columns, numeric_cols)
    if rev and spend and rev in df_in.columns and spend in df_in.columns:
        return {
            "value_col": _DERIVED_ROI_METRIC_KEY,
            "metric_display": "ROI",
            "requested_metric_token": "roi",
            "derived_roi": True,
            "revenue_col": rev,
            "spend_col": spend,
        }
    return None


def _apply_metric_spec_to_intent(
    intent: Dict[str, Any], spec: Dict[str, Any]
) -> Dict[str, Any]:
    intent["value_col"] = spec["value_col"]
    intent["metricColumnDisplay"] = spec.get("metric_display") or "ROI"
    intent["requested_metric_token"] = spec.get("requested_metric_token")
    if spec.get("explicit_metric"):
        intent["explicit_metric"] = True
    if spec.get("entity_record_count"):
        intent["entity_record_count"] = True
    if spec.get("derived_roi"):
        intent["derived_roi"] = True
        intent["revenue_col"] = spec.get("revenue_col")
        intent["spend_col"] = spec.get("spend_col")
        intent.pop("derived_profit_margin", None)
        intent.pop("profit_col", None)
    elif spec.get("derived_profit_margin"):
        intent["derived_profit_margin"] = True
        intent["profit_col"] = spec.get("profit_col")
        intent["revenue_col"] = spec.get("revenue_col")
        intent["agg_label"] = "Profit margin"
        intent["agg_key"] = "mean"
        intent.pop("derived_roi", None)
        intent.pop("spend_col", None)
    else:
        intent.pop("derived_roi", None)
        intent.pop("revenue_col", None)
        intent.pop("spend_col", None)
        intent.pop("derived_profit_margin", None)
        intent.pop("profit_col", None)
    return intent


def _grouped_derived_profit_margin_series(
    df_in: pd.DataFrame,
    group_col: str,
    profit_col: str,
    revenue_col: str,
) -> pd.Series:
    sub = df_in[[group_col, profit_col, revenue_col]].copy()
    sub["_p"] = numeric_series(profit_col)
    sub["_r"] = numeric_series(revenue_col)
    sub = sub.dropna(subset=[group_col])
    if sub.empty:
        return pd.Series(dtype=float)
    g_p = sub.groupby(group_col, dropna=False)["_p"].sum()
    g_r = sub.groupby(group_col, dropna=False)["_r"].sum()
    denom = g_r.replace(0, float("nan"))
    margin_pct = (g_p / denom) * 100.0
    margin_pct = margin_pct.replace([float("inf"), float("-inf")], float("nan")).dropna()
    return margin_pct.sort_values(ascending=False)


def _grouped_derived_roi_series(
    df_in: pd.DataFrame,
    group_col: str,
    revenue_col: str,
    spend_col: str,
) -> pd.Series:
    sub = df_in[[group_col, revenue_col, spend_col]].copy()
    sub["_rev"] = numeric_series(revenue_col)
    sub["_spend"] = numeric_series(spend_col)
    sub = sub.dropna(subset=[group_col])
    if sub.empty:
        return pd.Series(dtype=float)
    g_rev = sub.groupby(group_col, dropna=False)["_rev"].sum()
    g_spend = sub.groupby(group_col, dropna=False)["_spend"].sum()
    denom = g_spend.replace(0, float("nan"))
    roi = (g_rev - g_spend) / denom
    roi = roi.replace([float("inf"), float("-inf")], float("nan")).dropna()
    return roi.sort_values(ascending=False)


def _metric_display_from_intent(intent: Optional[Dict[str, Any]]) -> str:
    if not intent:
        return "—"
    disp = intent.get("metricColumnDisplay")
    if isinstance(disp, str) and disp.strip():
        return disp.strip()
    if intent.get("derived_roi"):
        return "ROI"
    if intent.get("derived_profit_margin"):
        return "Profit margin %"
    vc = intent.get("value_col")
    if vc and str(vc) != _DERIVED_ROI_METRIC_KEY:
        return _pretty_label_text(str(vc))
    return "—"


def _rendered_metric_matches_question(
    question: str,
    intent_debug: Optional[Dict[str, Any]],
    smart_trace: Optional[Dict[str, Any]],
) -> bool:
    if intent_debug and intent_debug.get("explicit_metric"):
        expected = str(intent_debug.get("value_col") or "").strip()
        if not expected:
            return False
        rendered = str((smart_trace or {}).get("numeric_column") or "").strip()
        if rendered and rendered == expected:
            return True
        if not rendered:
            return True
        try:
            from intent_engine.column_resolve import column_matches_token

            return column_matches_token(rendered, expected) or column_matches_token(
                expected, rendered
            )
        except Exception:
            return rendered == expected
    try:
        from intent_engine.resolve_explicit_metric import resolve_explicit_metric_column

        expected_col = resolve_explicit_metric_column(
            question,
            df if df is not None else pd.DataFrame(),
            dataset_profile or {},
        )
        if expected_col and intent_debug:
            actual = str(intent_debug.get("value_col") or "").strip()
            if actual and actual != str(expected_col):
                return False
    except Exception:
        pass
    if _question_requests_profit_margin(question):
        if not intent_debug:
            return False
        if (
            intent_debug.get("derived_profit_margin")
            or intent_debug.get("requested_metric_token") == "profit_margin"
        ):
            return True
        vc = str(intent_debug.get("value_col") or "").lower()
        if "margin" in _norm_metric_phrase_for_match(vc):
            return True
        sv = str((smart_trace or {}).get("numeric_column") or "").lower()
        if sv and "margin" in _norm_metric_phrase_for_match(sv):
            return True
        return False
    if not _question_requests_roi(question):
        return True
    if not intent_debug:
        return False
    if intent_debug.get("derived_roi") or intent_debug.get("requested_metric_token") == "roi":
        return True
    vc = str(intent_debug.get("value_col") or "").lower()
    if "roi" in _norm_metric_phrase_for_match(vc):
        return True
    sv = str((smart_trace or {}).get("numeric_column") or "").lower()
    if sv and "roi" in _norm_metric_phrase_for_match(sv):
        return True
    return False


def _column_phrase_matches_normalized_question(ql_norm: str, col: str) -> bool:
    """
    True when the column's natural phrase appears in the question.
    Uses word boundaries for short tokens to avoid traps like column 'age'
    matching inside the word 'percentage'.
    """
    phrase = _norm_metric_phrase_for_match(str(col)).strip()
    if not phrase or not ql_norm:
        return False
    parts = phrase.split()
    if len(parts) == 1:
        token = parts[0]
        if len(token) <= 3:
            return re.search(r"(?<!\w)" + re.escape(token) + r"(?!\w)", ql_norm) is not None
        return token in ql_norm
    pat = r"(?<!\w)" + r"\s+".join(re.escape(p) for p in parts) + r"(?!\w)"
    return re.search(pat, ql_norm) is not None


def _best_numeric_column_for_question(q: str, numeric_cols: List[str]) -> Optional[str]:
    """
    Pick the numeric column the question is most likely about (deterministic).
    Prefers longer / more specific column phrases and avoids substring false positives.
    """
    if not numeric_cols:
        return None
    ql_raw = str(q).lower()
    ql_norm = _norm_metric_phrase_for_match(q)
    best: Optional[str] = None
    best_score = 0
    ranked = sorted(
        numeric_cols,
        key=lambda c: len(_norm_metric_phrase_for_match(str(c))),
        reverse=True,
    )
    for c in ranked:
        cn = _norm_metric_phrase_for_match(str(c))
        if not cn:
            continue
        if _id_like_column_name(c) and not re.search(
            r"\b(employee|emp|staff|worker)\b.*\b(id|ids|identifier|number)\b|"
            r"\b(id|ids|identifier|number)\b.*\b(employee|emp|staff|worker)\b",
            ql_norm,
        ):
            continue
        score = 0
        raw_l = str(c).strip().lower()
        raw_spaced = raw_l.replace("_", " ")
        if raw_l in ql_raw.replace(" ", "_") or raw_spaced in ql_raw:
            score = 500 + len(cn)
        elif _column_phrase_matches_normalized_question(ql_norm, c):
            score = 100 + len(cn)
        if "salary" in ql_raw and "salary" in cn:
            score += 140
        if any(k in ql_raw for k in ("attendance", "absent", "present")) and (
            "attend" in cn or "absent" in cn or "present" in cn
        ):
            score += 140
        if re.search(r"\bproduction\s+loss\b", ql_raw) or re.search(
            r"\bproduction[_\s]+loss\b", ql_norm
        ):
            if "production" in cn and "loss" in cn:
                score += 360
            if "downtime" in cn or "outage" in cn:
                score -= 280
        if re.search(r"\bproduction\s+loss\b", ql_raw) is None and re.search(
            r"\bdowntime\b", ql_raw
        ):
            if "downtime" in cn or "outage" in cn:
                score += 120
        if re.search(r"\bincidents?\b", ql_raw) and not re.search(
            r"\b(downtime|minutes|outage|production\s+loss|repair|revenue|sales|loss)\b",
            ql_raw,
        ):
            if re.search(r"incident.*count|count.*incident", cn.replace(" ", "_")):
                score += 340
            if "downtime" in cn and "incident" not in cn:
                score -= 260
        try:
            from intent_engine.resolve_explicit_metric import (
                extract_explicit_metric_phrases,
                _score_column_for_phrase,
            )

            for phrase in extract_explicit_metric_phrases(q):
                if _score_column_for_phrase(str(c), phrase) >= 120:
                    score += 620
        except Exception:
            pass
        if _question_requests_roi(q):
            if cn == "roi" or re.search(r"\broi\b", cn):
                score += 520
            elif any(k in cn for k in ("revenue", "sales", "amount")) and "roi" not in cn:
                score -= 380
        if _question_requests_profit_margin(q):
            if "margin" in cn and "profit" in cn:
                score += 520
            elif "profit" in cn and "margin" not in cn:
                score -= 420
            elif any(k in cn for k in ("revenue", "sales")) and "profit" not in cn:
                score -= 200
        if re.search(
            r"\b(?:resolution|response|handling)\s+time\b|"
            r"\b(?:longest|shortest)\s+resolution\b",
            ql_raw,
        ):
            if "resolution" in cn and any(
                k in cn for k in ("hour", "minute", "time", "duration")
            ):
                score += 480
            if "tickets" in cn and "opened" in cn:
                score -= 420
            if cn.endswith(" opened") or "tickets opened" in cn:
                score -= 420
        if re.search(
            r"\b(?:patient\s+)?risk\s+(?:score|index)\b|\bclinical\s+risk\s+score\b",
            ql_raw,
        ):
            if "patient" in cn and "volume" in cn:
                score -= 520
            if "risk" in cn and ("score" in cn or "index" in cn):
                score += 460
        try:
            from intent_engine.banking_metric_resolve import (
                penalize_spend_amount_fallback,
                resolve_banking_metric_column,
            )

            global df, dataset_profile
            if df is not None and not df.empty:
                banking_col = resolve_banking_metric_column(
                    q, df, dataset_profile or build_profile(df)
                )
                if banking_col and str(c) == str(banking_col):
                    score += 720
            if penalize_spend_amount_fallback(q, str(c)):
                score -= 900
        except Exception:
            pass
        if score > best_score:
            best_score = score
            best = c
    return best


def _numeric_col_mentioned(q: str, numeric_cols: List[str]) -> Optional[str]:
    """Prefer the same scoring as aggregate intent (consistent charts / smart routing)."""
    hit = _best_numeric_column_for_question(q, numeric_cols)
    if hit:
        return hit
    ql = _norm_metric_phrase_for_match(q)
    for c in sorted(numeric_cols, key=lambda x: len(_norm_metric_phrase_for_match(str(x))), reverse=True):
        cn = _norm_metric_phrase_for_match(str(c))
        if _column_phrase_matches_normalized_question(ql, c):
            return c
    return None


def _pick_label_column(sort_col: str, category_cols: List[str], columns: List[str]) -> str:
    for c in category_cols:
        if c != sort_col:
            return c
    for c in columns:
        if c != sort_col:
            return c
    return sort_col


def _looks_like_ranking_question(ql: str) -> bool:
    if _extract_top_n(ql):
        return True
    if re.search(r"\btop\s+(?:\d+|five|ten|three|four|seven|eight)", ql):
        return True
    if re.search(
        r"\b(top|best|highest|lowest|leading|trailing)\s+performing\b",
        ql,
    ):
        return True
    if re.search(
        r"\b(highest|lowest|leading|trailing|best|worst)\b",
        ql,
    ):
        return True
    if re.search(
        r"\b(?:drives?|delivers?|generates?)\s+the\s+most\b",
        ql,
    ):
        return True
    if re.search(r"\bunderperform", ql) and re.search(r"\bwhich\b", ql):
        return True
    if re.search(
        r"\b(?:which|what)\b.+\b(?:longest|shortest|slowest|fastest)\b",
        ql,
    ):
        return True
    if re.search(
        r"\b(?:which|what)\b.+\bexceeds?\b.+\bthe\s+most\b",
        ql,
    ) or re.search(r"\bexceeds?\s+\w+\s+the\s+most\b", ql):
        return True
    return any(k in ql for k in ("ranking", "rank ", "rank,", "ranked"))


def _column_value_label_set(df: pd.DataFrame, col: str) -> set[str]:
    """Normalized + raw labels present in a grouping column."""
    out: set[str] = set()
    if df is None or col not in df.columns:
        return out
    for v in df[col].dropna().unique():
        raw = str(v).strip()
        if not raw:
            continue
        out.add(raw)
        out.add(_pretty_label_text(raw))
    return out


def _detect_chart_label_dimension(
    df: pd.DataFrame,
    profile: Dict[str, Any],
    labels: List[str],
    *,
    exclude_col: Optional[str] = None,
) -> Optional[str]:
    """Best-effort column whose values match chart category labels."""
    if df is None or df.empty or not labels:
        return None
    clean = [str(l).strip() for l in labels if str(l).strip()]
    if not clean:
        return None
    best_col: Optional[str] = None
    best_hits = 0
    for col in _dimension_pool_columns(df, profile):
        if exclude_col and str(col) == str(exclude_col):
            continue
        vals = _column_value_label_set(df, str(col))
        if not vals:
            continue
        hits = sum(
            1
            for lab in clean
            if lab in vals or _pretty_label_text(lab) in vals
        )
        if hits > best_hits:
            best_hits = hits
            best_col = str(col)
    if best_col and best_hits >= max(2, int(len(clean) * 0.75)):
        return best_col
    return None


def _validate_chart_dimension_alignment(
    *,
    intent_debug: Optional[Dict[str, Any]],
    chart_data: List[Dict[str, Any]],
    df: Optional[pd.DataFrame],
    profile: Optional[Dict[str, Any]],
    question: str,
    chart_type: Optional[str] = None,
) -> Optional[str]:
    """
    Return a warning when chart labels do not match the resolved breakdown column.
    """
    if not intent_debug or not chart_data or df is None or df.empty:
        return None
    if str(intent_debug.get("agg_key") or "").lower() == "scatter":
        return None
    if str(chart_type or "").strip().lower() in ("scatter", "histogram"):
        return None
    if intent_debug.get("histogram"):
        return None
    if intent_debug.get("trend_time_series"):
        return None
    if _question_requests_correlation_routing(question):
        return None
    if not _chart_rows_are_simple_categorical(chart_data):
        return None
    group_col = str(intent_debug.get("group_col") or "").strip()
    if not group_col or group_col not in df.columns:
        return None
    if (profile or {}).get("column_types", {}).get(group_col) == "date":
        return None

    labels = [
        str(r.get("name") or "").strip()
        for r in chart_data
        if isinstance(r, dict) and str(r.get("name") or "").strip()
    ]
    if len(labels) < 2:
        return None

    if all(re.match(r"^point\s*\d+$", lab, re.I) for lab in labels[: min(3, len(labels))]):
        return None

    expected_vals = _column_value_label_set(df, group_col)
    hits = sum(
        1
        for lab in labels
        if lab in expected_vals or _pretty_label_text(lab) in expected_vals
    )
    if hits >= max(2, int(len(labels) * 0.75)):
        return None

    actual_col = _detect_chart_label_dimension(
        df, profile or build_profile(df), labels, exclude_col=group_col
    )
    dim_disp = _pretty_label_text(group_col)
    actual_disp = _pretty_label_text(actual_col) if actual_col else "another breakdown"
    return (
        f"Chart dimension mismatch: metadata uses '{dim_disp}' ({group_col}) but "
        f"chart labels match '{actual_disp}' ({actual_col or 'unknown'}) — "
        f"{len(labels)} categories shown for question: {question.strip()!r}."
    )


def _validate_chart_metric_alignment(
    *,
    question: str,
    intent_debug: Optional[Dict[str, Any]],
    chart_data: List[Dict[str, Any]],
    chart_title: str,
    smart_trace: Optional[Dict[str, Any]],
) -> Optional[str]:
    """Warn when chart metric/title disagrees with the question's explicit metric."""
    if not intent_debug or not chart_data:
        return None
    if intent_debug.get("dual_metric_compare"):
        return None
    if str(intent_debug.get("agg_key") or "").lower() == "scatter":
        return None
    if _question_requests_correlation_routing(question):
        return None

    expected_col = str(intent_debug.get("value_col") or "").strip()
    if not expected_col:
        return None

    rendered_col = str((smart_trace or {}).get("numeric_column") or expected_col).strip()
    if not _rendered_metric_matches_question(question, intent_debug, smart_trace):
        expected_disp = _metric_display_from_intent(intent_debug)
        rendered_disp = _pretty_label_text(rendered_col) if rendered_col else "—"
        return (
            f"Chart metric mismatch: question expects '{expected_disp}' ({expected_col}) "
            f"but chart used '{rendered_disp}' ({rendered_col})."
        )

    title_l = str(chart_title or "").lower()
    expected_disp_l = _metric_display_from_intent(intent_debug).lower()
    if expected_disp_l and expected_disp_l not in ("—", "value"):
        key_token = expected_disp_l.split()[-1]
        if key_token and len(key_token) >= 4 and key_token not in title_l:
            try:
                from intent_engine.resolve_explicit_metric import (
                    resolve_explicit_metric_column,
                )

                if resolve_explicit_metric_column(question, df, dataset_profile or {}):
                    return (
                        f"Chart title mismatch: expected metric '{expected_disp_l}' "
                        f"but title is '{chart_title}'."
                    )
            except Exception:
                pass

    if str(intent_debug.get("agg_key") or "").lower() == "count":
        try:
            from intent_engine.resolve_explicit_metric import (
                question_names_metric_quantity,
            )

            if question_names_metric_quantity(question, expected_col):
                vals = [
                    float(r.get("value"))
                    for r in chart_data
                    if isinstance(r, dict) and r.get("value") is not None
                ]
                if vals and len(set(vals)) == 1 and vals[0] == 1.0:
                    return (
                        f"Chart metric mismatch: '{expected_col}' is a quantity metric but "
                        "chart shows count=1 per group — use sum/mean on the metric column."
                    )
        except Exception:
            pass

    return None


def _build_aggregate_chart_from_intent(
    intent: Dict[str, Any],
    question: str,
) -> Tuple[str, List[Dict[str, Any]], str, str, Optional[Dict[str, Any]]]:
    """Build chart rows from resolved intent (group_col, value_col, agg)."""
    fb_rows, fb_type, fb_title, fb_ts = _fallback_aggregate_chart(intent, question)
    if not fb_rows:
        return "", [], "", "", None
    chart_data = list(_normalize_chart_records(fb_rows))
    tab = _tabular_exact_from_name_value_rows(
        [{"name": r.get("name"), "value": r.get("value")} for r in chart_data]
    )
    return (
        tab,
        chart_data,
        (fb_type or "bar").strip() or "bar",
        (fb_title or "").strip(),
        fb_ts if isinstance(fb_ts, dict) else None,
    )


def _question_explicitly_requests_dimension(question_lower: str, col: str) -> bool:
    """True when the user clearly named this column (including *_id)."""
    if not col:
        return False
    ql = (question_lower or "").lower().replace("-", "_")
    raw = str(col).strip()
    variants = {
        raw.lower(),
        raw.lower().replace(" ", "_"),
        raw.lower().replace("_", " "),
    }
    for v in variants:
        if len(v) >= 3 and re.search(
            rf"(?<!\w){re.escape(v.replace(' ', '_'))}(?!\w)|"
            rf"(?<!\w){re.escape(v.replace('_', ' '))}(?!\w)",
            ql,
        ):
            return True
    toks = [t for t in raw.lower().split("_") if len(t) >= 3]
    return any(re.search(rf"(?<!\w){re.escape(t)}(?!\w)", ql) for t in toks)


def _prefer_lower_cardinality_dimension(
    df,
    profile: Dict[str, Any],
    current: str,
    metric_col: Optional[str],
    question_lower: str,
) -> str:
    """
    Prefer readable business dimensions (region, channel, …) over *_id columns
    and over extremely high-cardinality keys when the user did not name them explicitly.
    """
    if df is None or df.empty or not current:
        return current
    if _question_explicitly_requests_dimension(question_lower, current):
        return current
    try:
        from intent_engine.geographic_scope import (
            question_geographic_scope_level,
            resolve_geographic_group_column,
        )

        if question_geographic_scope_level(question_lower):
            geo_col = resolve_geographic_group_column(question_lower, df, profile)
            if geo_col and str(geo_col) in df.columns:
                return str(geo_col)
    except Exception:
        pass
    try:
        from intent_engine.dimension_request import question_requests_concentration_analysis

        if question_requests_concentration_analysis(question_lower):
            return current
    except Exception:
        pass
    try:
        nu_cur = int(df[str(current)].nunique(dropna=True))
    except Exception:
        return current
    id_like = _id_like_column_name(current)
    if nu_cur <= 15 and not id_like:
        return current

    pool = [
        c
        for c in _dimension_pool_columns(df, profile)
        if str(c) != str(metric_col) and str(c) != str(current)
    ]
    ranked = _rank_category_dimensions(df, pool, profile)
    best: Optional[str] = None
    best_nu = nu_cur
    for c, _sc in ranked:
        try:
            nu = int(df[str(c)].nunique(dropna=True))
        except Exception:
            continue
        if nu < 2:
            continue
        if nu < best_nu:
            best = str(c)
            best_nu = nu
            if best_nu <= 15 and not _id_like_column_name(best):
                break
    if best and best != current:
        if best_nu < nu_cur or (
            id_like
            and not _id_like_column_name(best)
            and best_nu <= min(nu_cur, 80)
        ):
            return best
    return current


def _chart_rows_are_simple_categorical(rows: List[Dict[str, Any]]) -> bool:
    """True when rows are plain name/value points (not stacked multi-series dicts)."""
    if not rows:
        return False
    for r in rows[:5]:
        if not isinstance(r, dict):
            return False
        for k in r.keys():
            if k in ("name", "value", "x", "displayValue", "displayX"):
                continue
            return False
    return True


def _apply_high_cardinality_cap_to_chart_rows(
    rows: List[Dict[str, Any]],
    *,
    chart_type: str,
    category_column: Optional[str],
    question: str,
) -> Tuple[List[Dict[str, Any]], Optional[str]]:
    """
    Cap unreadable category cardinality: Top 10 + Others, user-facing notice,
    and never return huge label lists. Line/area: light downsampling only.
    """
    if not rows:
        return rows, None
    ct = (chart_type or "").strip().lower().replace("-", "_")

    if ct == "scatter":
        if len(rows) > 400:
            return rows[:400], (
                "Many scatter points detected; showing the first 400 points for responsiveness."
            )
        return rows, None

    if ct in ("line", "area"):
        n = len(rows)
        if n <= 60:
            return rows, None
        stride = max(1, int(math.ceil((n - 1) / max(1, 49))))
        picked: List[Dict[str, Any]] = []
        last_i = -1
        for i in range(0, n, stride):
            picked.append(rows[i])
            last_i = i
        if last_i != n - 1:
            picked.append(rows[-1])
        dedup: List[Dict[str, Any]] = []
        seen: set = set()
        for r in picked:
            k = str(r.get("name", ""))
            if k in seen:
                continue
            seen.add(k)
            dedup.append(r)
        return (
            dedup,
            f"Many periods detected ({n}). Showing {len(dedup)} periods for readability.",
        )

    if ct not in ("bar", "bar_horizontal", "histogram", "pie", "donut"):
        return rows, None

    n = len(rows)
    if n <= 15:
        return rows, None

    SHOW_TOP = 10
    sorted_rows = sorted(
        rows,
        key=lambda r: float(r.get("value") if r.get("value") is not None else 0.0),
        reverse=True,
    )
    top = sorted_rows[:SHOW_TOP]
    tail = sorted_rows[SHOW_TOP:]
    others = sum(float(r.get("value") or 0.0) for r in tail)
    out: List[Dict[str, Any]] = [dict(r) for r in top]
    if others != 0.0 or len(tail) > 0:
        out.append({"name": "Others", "value": float(others)})

    if ct in ("pie", "donut"):
        s = sum(float(r.get("value") or 0.0) for r in out)
        if s > 0:
            out = [
                {
                    "name": r.get("name"),
                    "value": 100.0 * float(r.get("value") or 0.0) / s,
                }
                for r in out
            ]

    dim_note = f" on {_pretty_label_text(category_column)}" if category_column else ""
    msg = (
        f"Too many unique values detected{dim_note} ({n} groups). "
        f"Showing Top {SHOW_TOP} groups"
        + (" plus an “Others” bucket." if (others != 0.0 or len(tail) > 0) else ".")
    )
    if category_column and _id_like_column_name(str(category_column)):
        msg += (
            " For clearer charts, try grouping by a business field "
            "(for example region, channel, severity, or category) instead of an ID column."
        )
    if len(out) > 35:
        out = out[:35]
    return out, msg


def _normalize_chart_records(rows: List[Any]) -> List[Dict[str, Any]]:
    out = []
    for r in rows or []:
        if not isinstance(r, dict):
            continue
        try:
            v = float(r.get("value"))
        except (TypeError, ValueError):
            continue
        raw_name = r.get("name")
        nm = _pretty_label_text(raw_name if raw_name is not None else "—")
        item: Dict[str, Any] = {"name": nm, "value": v}
        if r.get("x") is not None:
            try:
                item["x"] = float(r["x"])
            except (TypeError, ValueError):
                pass
        for ek, ev in r.items():
            if ek in ("name", "value", "x"):
                continue
            try:
                fv = float(ev)
            except (TypeError, ValueError):
                continue
            if fv == fv:
                item[str(ek)] = fv
        out.append(item)
    return out


def _time_series_span_days(dt: pd.Series) -> float:
    """Calendar span (max − min) in fractional days; 0 if empty or single instant."""
    s = pd.to_datetime(dt, errors="coerce").dropna()
    if s.empty:
        return 0.0
    delta = s.max() - s.min()
    return max(0.0, float(delta / pd.Timedelta(days=1)))


def _time_coverage_meta(dt_clean: pd.Series, n_input_rows: int) -> Dict[str, Any]:
    """Lightweight coverage + density for UI / provenance (not statistical tests)."""
    span = _time_series_span_days(dt_clean)
    norms = dt_clean.dt.normalize()
    udays = int(norms.nunique())
    rows_per_ud = float(n_input_rows) / max(udays, 1)
    # Higher when many rows land on relatively few calendar days (dense sampling).
    density_raw = float(n_input_rows) / max(float(udays), 1.0)
    density_score = float(max(0.0, min(1.0, math.log1p(density_raw) / math.log1p(24.0))))
    return {
        "spanDays": round(span, 4),
        "uniqueCalendarDays": udays,
        "avgRowsPerUniqueDay": round(rows_per_ud, 4),
        "dateDensityScore": round(density_score, 4),
    }


def _preferred_time_bucket_from_span(span_days: float) -> str:
    """
    Adaptive granularity:
    <= 7 days  -> daily
    <= 90 days -> weekly (ISO week starting Monday)
    > 90 days  -> monthly
    """
    if span_days <= 7:
        return "D"
    if span_days <= 90:
        return "W"
    return "M"


_GROWTH_INTENT_RE = re.compile(
    r"\b("
    r"growing\s+fastest|fastest\s+growing|fastest\s+growth|growth\s+rate|"
    r"increasing\s+fastest|grow(?:ing)?\s+fastest|rate\s+of\s+change|"
    r"period[- ]over[- ]period|month[- ]over[- ]month|\bmom\b|\byoy\b|"
    r"which\s+\w+\s+(?:is|are)\s+growing|what\s+\w+\s+(?:is|are)\s+growing|"
    r"momentum\s+by\s+\w+|trend\s+by\s+\w+\s+over\s+time"
    r")\b",
    re.I,
)


def _question_requests_correlation_routing(q: str) -> bool:
    """Row-level scatter / Pearson routing (not category bar aggregation)."""
    try:
        from intent_engine.question_patterns import question_requests_correlation_routing

        return question_requests_correlation_routing(q)
    except Exception:
        return _question_triggers_numeric_relationship_chart(q)


def _question_requests_growth_intent(q: str) -> bool:
    """Change-over-time / fastest-growth questions (may differ from simple trend charts)."""
    ql = (q or "").lower().strip()
    if not ql:
        return False
    if _question_requests_correlation_routing(q):
        return False
    if _GROWTH_INTENT_RE.search(ql):
        return True
    if re.search(r"\b(grow(?:th|ing)?)\b", ql) and re.search(
        r"\b(fastest|highest\s+growth|most\s+growth|quickest)\b", ql
    ):
        return True
    if re.search(r"\b(growth|growing)\b", ql) and re.search(
        r"\b(region|product|department|channel|segment|category|campaign)\b", ql
    ):
        return True
    return False


def _question_asks_entity_growth_comparison(q: str) -> bool:
    ql = (q or "").lower().strip()
    if re.search(
        r"\b(which|what)\s+\w+.*\b(grow(?:ing)?|growth|fastest|momentum)\b", ql
    ):
        return True
    if re.search(
        r"\b(region|product|department|channel|segment|campaign)\b", ql
    ) and re.search(r"\b(grow(?:ing)?|growth|fastest|momentum)\b", ql):
        return True
    return False


def _distinct_date_period_count(df: pd.DataFrame, date_col: str) -> int:
    if not date_col or date_col not in df.columns:
        return 0
    ser = pd.to_datetime(df[date_col], errors="coerce")
    valid = ser.dropna()
    if valid.empty:
        return 0
    return int(valid.dt.normalize().nunique())


def _unsupported_growth_payload(
    *,
    periods_available: int,
    reason_code: str,
    recommended_action: str,
) -> Dict[str, Any]:
    return {
        "active": True,
        "periodsAvailable": int(max(0, periods_available)),
        "status": "Insufficient Time-Series Data",
        "leadSentence": (
            "Growth metric detected, but period/methodology is unknown — "
            "growth comparison is directional only because no date/baseline period exists."
        ),
        "recommendedAction": recommended_action,
        "reasonCode": reason_code,
    }


def _assess_unsupported_decline_analysis(
    *,
    question: str,
    df: Optional[pd.DataFrame],
    profile: Optional[Dict[str, Any]],
    chart_type_internal: str,
    intent_debug: Optional[Dict[str, Any]],
    time_series_analysis: Optional[Dict[str, Any]],
) -> Optional[Dict[str, Any]]:
    """Decline ranking without multi-period evidence — suppress misleading category charts."""
    if df is None:
        return None
    try:
        from intent_engine.decline_intent import assess_unsupported_decline_for_api

        return assess_unsupported_decline_for_api(
            question=question,
            df=df,
            profile=profile or {},
            chart_type_internal=str(chart_type_internal or "bar"),
            intent_debug=intent_debug,
            time_series_analysis=time_series_analysis,
        )
    except Exception:
        return None


def _assess_unsupported_multi_metric_analysis(
    *,
    question: str,
    df: Optional[pd.DataFrame],
    profile: Optional[Dict[str, Any]],
) -> Optional[Dict[str, Any]]:
    """Compare X vs Y when a requested metric column is missing — suppress ranking fallbacks."""
    if df is None:
        return None
    try:
        from intent_engine.multi_metric_intent import assess_unsupported_multi_metric_for_api

        return assess_unsupported_multi_metric_for_api(
            question=question,
            df=df,
            profile=profile or {},
        )
    except Exception:
        return None


def _assess_unsupported_growth_analysis(
    *,
    question: str,
    df: Optional[pd.DataFrame],
    profile: Optional[Dict[str, Any]],
    chart_type_internal: str,
    chart_points: int,
    intent_debug: Optional[Dict[str, Any]],
    time_series_analysis: Optional[Dict[str, Any]],
) -> Optional[Dict[str, Any]]:
    """
    When the question requires change-over-time / growth ranking but the cohort
    cannot support rate-of-change, return diagnostic metadata for the UI.
    """
    if not _question_requests_growth_intent(question):
        return None
    if _question_requests_trend_intent(question):
        date_col_early = (
            _pick_date_column_for_trend(df, profile)
            if df is not None and profile is not None
            else None
        )
        if date_col_early and _distinct_date_period_count(df, str(date_col_early)) >= 2:
            return None
    if _question_requests_correlation_routing(question):
        return None

    date_col = (
        _pick_date_column_for_trend(df, profile)
        if df is not None and profile is not None
        else None
    )
    periods = (
        _distinct_date_period_count(df, str(date_col))
        if date_col and df is not None
        else 0
    )

    ts = time_series_analysis if isinstance(time_series_analysis, dict) else {}
    ts_buckets = int(ts.get("uniqueBuckets") or 0) if ts else 0
    effective_periods = max(periods, ts_buckets)

    group_col = str(intent_debug.get("group_col") or "") if intent_debug else ""
    group_is_date = bool(date_col and group_col and str(group_col) == str(date_col))

    ct = str(chart_type_internal or "").strip().lower()
    is_time_chart = ct in ("line", "area") and (group_is_date or ts_buckets >= 2)

    entity_growth = _question_asks_entity_growth_comparison(question)
    ql = (question or "").lower()
    selected_value_col = str(intent_debug.get("value_col") or "") if intent_debug else ""
    # If the dataset already provides a "growth rate" style metric and the question is
    # asking to compare that metric across categories (not a computed period-over-period
    # rate-of-change), do not suppress the visualization due to missing baseline periods.
    requests_rate_of_change = bool(
        re.search(
            r"\b(over\s+time|period[- ]over[- ]period|rate\s+of\s+change|mom\b|yoy\b|yoy\+|mom\+)\b",
            ql,
            flags=re.I,
        )
    )
    selected_looks_growth_metric = "growth" in selected_value_col.lower()
    if (
        selected_looks_growth_metric
        and not requests_rate_of_change
        and int(chart_points) >= 2
    ):
        return None

    if not date_col:
        return _unsupported_growth_payload(
            periods_available=0,
            reason_code="no_time_dimension",
            recommended_action="Add a date column with multiple periods per entity",
        )

    if effective_periods < 2:
        action = (
            "Add multiple periods per region"
            if re.search(r"\bregion\b", question.lower())
            else "Add multiple order dates per entity to compare period-over-period change"
        )
        return _unsupported_growth_payload(
            periods_available=max(effective_periods, 1 if periods == 1 else 0),
            reason_code="single_period",
            recommended_action=action,
        )

    if entity_growth and not is_time_chart:
        if selected_looks_growth_metric and not requests_rate_of_change:
            return None
        return _unsupported_growth_payload(
            periods_available=effective_periods,
            reason_code="category_snapshot",
            recommended_action="Add multiple periods per region",
        )

    if entity_growth and is_time_chart and group_is_date and chart_points >= 2:
        return _unsupported_growth_payload(
            periods_available=effective_periods,
            reason_code="entity_growth_needs_panel",
            recommended_action="Group by region and date (or use a multi-period panel)",
        )

    return None


def _question_requests_trend_intent(q: str) -> bool:
    """True when the user asks for a time-series view (not a category ranking)."""
    try:
        from intent_engine.trend_date_resolve import question_requests_trend_intent

        return question_requests_trend_intent(q)
    except Exception:
        ql = (q or "").lower().strip()
        return bool(ql and ("trend" in ql or "over time" in ql))


def _forced_time_bucket_from_question(q: str) -> Optional[str]:
    """When the question names a grain, prefer that bucket before span heuristics."""
    ql = (q or "").lower()
    if re.search(r"\b(by month|monthly|month[- ]wise|each month|per month|every month)\b", ql):
        return "M"
    if re.search(r"\b(by week|weekly|each week|per week)\b", ql):
        return "W"
    if re.search(r"\b(by day|daily|each day|per day|by date)\b", ql):
        return "D"
    if re.search(r"\b(by quarter|quarterly|each quarter)\b", ql):
        return "Q"
    if re.search(r"\b(by year|yearly|each year|per year)\b", ql):
        return "Y"
    return None


def _is_time_bucket_phrase(phrase: str) -> bool:
    p = (phrase or "").lower().strip().replace("-", " ")
    if not p:
        return False
    if p in {
        "month",
        "monthly",
        "week",
        "weekly",
        "day",
        "daily",
        "quarter",
        "quarterly",
        "year",
        "yearly",
        "date",
        "time",
        "period",
        "periods",
        "timeline",
    }:
        return True
    return bool(
        re.search(r"\b(month[- ]wise|time series|over time)\b", p)
    )


def _pick_date_column_for_trend(
    df_in: pd.DataFrame,
    profile: Dict[str, Any],
    question: Optional[str] = None,
) -> Optional[str]:
    """Best date / datetime column for trend charts."""
    if df_in is None or df_in.empty:
        return None
    cols = df_in.columns.tolist()
    mapped = get_mapped_or_detected_column(
        "date",
        [
            "date",
            "order date",
            "order_date",
            "report date",
            "report_date",
            "transaction date",
            "transaction_date",
            "invoice date",
            "invoice_date",
            "created_at",
            "timestamp",
        ],
    )
    if mapped and mapped in cols:
        if _group_column_is_time_series_eligible(df_in, str(mapped)):
            return str(mapped)
    try:
        from intent_engine.trend_date_resolve import pick_trend_date_column

        return pick_trend_date_column(df_in, profile, question)
    except Exception:
        pass
    ct = profile.get("column_types", {}) if profile else {}
    candidates: List[str] = []
    for c in cols:
        if ct.get(c) == "date" and c not in candidates:
            candidates.append(str(c))
    for c in _infer_date_like_columns_from_values(df_in):
        if c not in candidates:
            candidates.append(str(c))
    for c in candidates:
        if _group_column_is_time_series_eligible(df_in, c):
            return c
    return candidates[0] if candidates else None


def _trend_metric_column_for_question(
    question: str,
    df_in: pd.DataFrame,
    profile: Dict[str, Any],
    metric_spec: Optional[Dict[str, Any]] = None,
) -> Optional[str]:
    if metric_spec and (
        not metric_spec.get("derived_roi")
        and not metric_spec.get("derived_profit_margin")
    ):
        vc = metric_spec.get("value_col")
        if vc and str(vc) in df_in.columns:
            return str(vc)
    try:
        from intent_engine.narrative_guardrails import detect_missing_requested_metrics

        finance_margin_ids = {
            "ebitda_margin",
            "operating_margin",
            "gross_margin",
            "net_margin",
            "nim",
            "margin_pct",
        }
        missing = detect_missing_requested_metrics(question, df_in, profile)
        if any(m.get("id") in finance_margin_ids for m in missing):
            return None
    except Exception:
        pass
    ql_guard = (question or "").lower()
    if re.search(r"\bebitda\b", ql_guard) and not any(
        "ebitda" in str(c).lower() for c in df_in.columns
    ):
        return None
    ct = profile.get("column_types", {}) if profile else {}
    numeric_cols = [c for c in df_in.columns if ct.get(c) == "number"]
    try:
        from intent_engine.resolve_explicit_metric import resolve_explicit_metric_column

        explicit = resolve_explicit_metric_column(question, df_in, profile)
        if explicit and str(explicit) in numeric_cols:
            return str(explicit)
    except Exception:
        pass
    hit = _numeric_col_mentioned(question.lower(), numeric_cols)
    if hit:
        return str(hit)
    ql = (question or "").lower()
    for token in (
        "satisfaction",
        "satisfaction score",
        "headcount",
        "units",
        "cost",
        "profit",
        "customers",
        "revenue",
    ):
        if token in ql:
            try:
                from intent_engine.column_resolve import find_column_for_token

                mapped = find_column_for_token(
                    token,
                    numeric_cols,
                    numeric_only=True,
                    profile=profile,
                )
                if mapped:
                    return str(mapped)
            except Exception:
                pass
    mapped = get_mapped_or_detected_column(
        "sales",
        ["sales", "revenue", "amount", "total", "value"],
    )
    if mapped and mapped in df_in.columns:
        return str(mapped)
    if len(numeric_cols) == 1:
        return str(numeric_cols[0])
    return _best_numeric_column_for_question(question, numeric_cols)


def _try_build_trend_line_visualization(
    question: str,
    df_in: pd.DataFrame,
    profile: Dict[str, Any],
    metric_spec: Optional[Dict[str, Any]] = None,
) -> Optional[
    Tuple[
        List[Dict[str, Any]],
        str,
        str,
        Dict[str, Any],
        Dict[str, Any],
    ]
]:
    """
    Monthly/weekly/daily revenue (etc.) trend line.
    Returns (chart_rows, chart_type, title, intent_debug, smart_trace) or None.
    """
    dcol = _pick_date_column_for_trend(df_in, profile, question)
    ncol = _trend_metric_column_for_question(question, df_in, profile, metric_spec)
    if not dcol or not ncol or str(dcol) == str(ncol):
        return None

    ql = question.lower().strip()
    force_freq = _forced_time_bucket_from_question(ql)
    try:
        from intent_engine.column_resolve import column_prefers_mean_aggregation

        agg_key = "mean" if column_prefers_mean_aggregation(ncol) else "sum"
    except Exception:
        agg_key = "sum"
    agg_label = "Average" if agg_key == "mean" else "Total"
    g_series, ts_meta = _adaptive_time_series_grouped(
        df_in[[dcol, ncol]].copy(),
        str(dcol),
        str(ncol),
        agg_key=agg_key,
        force_freq=force_freq,
    )
    if g_series is None or len(g_series) < 2:
        return None

    chart_data = _time_series_rows_from_grouped(g_series)
    tb_l = _freq_human_label(str(ts_meta.get("timeBucket") or force_freq or "M"))
    met_lbl = _business_metric_series_label(agg_key, agg_label, str(ncol))
    title = f"{met_lbl} Trend by {tb_l}"
    intent_debug: Dict[str, Any] = {
        "group_col": dcol,
        "value_col": ncol,
        "agg_label": agg_label,
        "agg_key": agg_key,
        "normalized_question": ql,
        "trend_time_series": True,
        "time_bucket": ts_meta.get("timeBucket"),
    }
    smart_trace: Dict[str, Any] = {
        "routing": "trend_time_series",
        "category_column": dcol,
        "numeric_column": ncol,
        "aggregation": agg_key,
        "aggregation_key": agg_key,
        "rows_analyzed": int(len(df_in)),
        "notes": ts_meta.get("selectionReason")
        or f"Trend chart: {met_lbl} by {tb_l} period.",
        "timeSeriesAnalysis": {
            **{
                k: v
                for k, v in ts_meta.items()
                if k != "granularityFallbackChain"
            },
            "granularityFallbackChain": ts_meta.get("granularityFallbackChain", []),
        },
    }
    return chart_data, "line", title, intent_debug, smart_trace


def _bucket_labels_for_freq(dt: pd.Series, freq: str) -> pd.Series:
    """Map timestamps to stable bucket label strings for grouping."""
    d = pd.to_datetime(dt, errors="coerce")
    if freq == "M":
        return d.dt.to_period("M").astype(str)
    if freq == "Q":
        return d.dt.to_period("Q").astype(str)
    if freq == "Y":
        return d.dt.to_period("Y").astype(str)
    if freq == "W":
        return d.dt.to_period("W-MON").astype(str)
    if freq == "D":
        return d.dt.normalize().dt.strftime("%Y-%m-%d")
    if freq == "H":
        return d.dt.floor("h").dt.strftime("%Y-%m-%d %H:00")
    if freq == "T":
        return d.dt.floor("min").dt.strftime("%Y-%m-%d %H:%M")
    return d.dt.to_period("M").astype(str)


def _finer_time_bucket(freq: str) -> Optional[str]:
    return {"M": "W", "W": "D", "D": "H", "H": "T"}.get(freq)


def _freq_human_label(freq: str) -> str:
    return {
        "M": "monthly",
        "Q": "quarterly",
        "Y": "yearly",
        "W": "weekly",
        "D": "daily",
        "H": "hourly",
        "T": "by minute",
        "raw": "raw timestamps",
    }.get(freq, freq)


def _bucket_label_sort_key(label: str) -> Tuple[int, float, str]:
    """Stable ordering for bucket labels (ISO dates, pandas weekly period strings, etc.)."""
    s = str(label).strip()
    if not s:
        return (2, 0.0, "")

    t = pd.to_datetime(s, errors="coerce")
    if pd.notna(t):
        return (0, float(t.value), s)

    if "/" in s:
        left = s.split("/", 1)[0].strip()
        t2 = pd.to_datetime(left, errors="coerce")
        if pd.notna(t2):
            return (0, float(t2.value), s)

    qy = re.match(r"^Q([1-4])\s*['\u2019]?\s*(\d{2,4})$", s, re.I)
    if qy:
        qn = int(qy.group(1))
        yr = int(qy.group(2))
        if yr < 100:
            yr += 2000
        return (0, float(yr * 10 + qn), s)

    yq = re.match(r"^(\d{4})[-\s]?Q([1-4])$", s, re.I)
    if yq:
        yr = int(yq.group(1))
        qn = int(yq.group(2))
        return (0, float(yr * 10 + qn), s)

    per = re.match(r"^(\d{4})-(\d{2})$", s)
    if per:
        try:
            t3 = pd.Timestamp(year=int(per.group(1)), month=int(per.group(2)), day=1)
            return (0, float(t3.value), s)
        except Exception:
            pass

    per_w = re.match(r"^(\d{4})-(\d{2})-(\d{2})/", s)
    if per_w:
        try:
            t4 = pd.Timestamp(
                year=int(per_w.group(1)),
                month=int(per_w.group(2)),
                day=int(per_w.group(3)),
            )
            return (0, float(t4.value), s)
        except Exception:
            pass

  # Pandas weekly period e.g. 2026-03-02/2026-03-08
    try:
        tp = pd.Period(s, freq="W")
        return (0, float(tp.start_time.value), s)
    except Exception:
        pass
    try:
        tp_m = pd.Period(s, freq="M")
        return (0, float(tp_m.start_time.value), s)
    except Exception:
        pass

    return (1, 0.0, s)


def _sort_chronologically_by_bucket_labels(g: pd.Series) -> pd.Series:
    """Reorder aggregated series so line charts read left-to-right in time."""
    if g.empty:
        return g
    idx = [str(x) for x in g.index.tolist()]
    order = sorted(range(len(idx)), key=lambda i: _bucket_label_sort_key(idx[i]))
    return g.iloc[order]


def _adaptive_time_series_grouped(
    df_in: pd.DataFrame,
    date_col: str,
    value_col: str,
    agg_key: str = "sum",
    force_freq: Optional[str] = None,
) -> Tuple[Optional[pd.Series], Dict[str, Any]]:
    """
    Group (date, value) into adaptive time buckets; widen/narrow buckets to avoid
    degenerate single-point series when possible.

    Returns (aggregated series indexed by bucket label, meta) or (None, meta).
    """
    meta: Dict[str, Any] = {
        "timeBucket": None,
        "spanDays": None,
        "timeCoverage": {},
        "selectionReason": "",
        "granularityFallbackChain": [],
    }
    try:
        tmp = df_in[[date_col, value_col]].copy()
    except Exception:
        return None, {**meta, "reason": "missing_columns"}

    tmp["_dt"] = pd.to_datetime(tmp[date_col], errors="coerce")
    tmp["_v"] = numeric_series(value_col)
    tmp = tmp.dropna(subset=["_dt", "_v"])
    n_in = int(len(tmp))
    if n_in < 2:
        return None, {**meta, "reason": "insufficient_valid_pairs", "rowsUsed": n_in}

    span = _time_series_span_days(tmp["_dt"])
    coverage = _time_coverage_meta(tmp["_dt"], n_in)
    preferred = force_freq or _preferred_time_bucket_from_span(span)
    meta["spanDays"] = round(span, 4)
    meta["timeCoverage"] = coverage

    freqs: List[str] = []
    if force_freq:
        freqs = [force_freq]
    else:
        cur: Optional[str] = preferred
        while cur:
            freqs.append(cur)
            cur = _finer_time_bucket(cur)

    chosen: Optional[str] = None
    g_out: Optional[pd.Series] = None
    for freq in freqs:
        bk = _bucket_labels_for_freq(tmp["_dt"], freq)
        n_buck = int(bk.nunique())
        meta["granularityFallbackChain"].append({"freq": freq, "uniqueBuckets": n_buck})
        if n_buck >= 2:
            chosen = freq
            gb = tmp.groupby(bk, sort=False)["_v"]
            if agg_key == "mean":
                g_out = gb.mean()
            elif agg_key == "min":
                g_out = gb.min()
            elif agg_key == "max":
                g_out = gb.max()
            else:
                g_out = gb.sum()
            break

    if g_out is None or g_out.empty:
        # Minute-level buckets (same calendar day, many intraday points).
        bk = _bucket_labels_for_freq(tmp["_dt"], "T")
        if int(bk.nunique()) >= 2:
            chosen = "T"
            gb = tmp.groupby(bk, sort=False)["_v"]
            if agg_key == "mean":
                g_out = gb.mean()
            elif agg_key == "min":
                g_out = gb.min()
            elif agg_key == "max":
                g_out = gb.max()
            else:
                g_out = gb.sum()
            meta["granularityFallbackChain"].append({"freq": "T", "uniqueBuckets": int(bk.nunique())})

    if g_out is None or g_out.empty:
        # One row per distinct timestamp (no calendar bucketing).
        gb = tmp.groupby(tmp["_dt"].dt.floor("s").astype(str), sort=False)["_v"]
        if agg_key == "mean":
            g_try = gb.mean()
        elif agg_key == "min":
            g_try = gb.min()
        elif agg_key == "max":
            g_try = gb.max()
        else:
            g_try = gb.sum()
        if len(g_try) >= 2:
            chosen = "raw"
            g_out = g_try
            meta["granularityFallbackChain"].append({"freq": "raw", "uniqueBuckets": len(g_try)})

    if g_out is None or len(g_out) < 2:
        return None, {
            **meta,
            "reason": "insufficient_time_distribution",
            "timeBucket": chosen,
        }

    g_out = _sort_chronologically_by_bucket_labels(g_out)
    meta["timeBucket"] = chosen or preferred
    meta["uniqueBuckets"] = int(len(g_out))
    pref_h = _freq_human_label(str(preferred))
    sel_h = _freq_human_label(str(chosen or preferred))
    if chosen == preferred:
        meta["selectionReason"] = (
            f"Adaptive {sel_h} buckets: span ≈ {span:.1f} d, {n_in} rows, "
            f"{len(g_out)} periods (preferred granularity for this span)."
        )
    else:
        meta["selectionReason"] = (
            f"Started with {pref_h} for span ≈ {span:.1f} d; refined to {sel_h} "
            f"({len(g_out)} periods) to avoid a single-bucket chart."
        )
    return g_out, meta


def _time_series_rows_from_grouped(g: pd.Series) -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []
    for k, v in g.items():
        try:
            fv = float(v)
        except (TypeError, ValueError):
            continue
        if not (fv == fv):
            continue
        rows.append({"name": _pretty_label_text(str(k)), "value": fv})
    return rows


def _pick_default_metric_column(
    q: str, numeric_cols: List[str], domain: str
) -> Optional[str]:
    """When the question names no explicit metric, pick a sensible primary numeric column."""
    if not numeric_cols:
        return None
    hit = _best_numeric_column_for_question(q, numeric_cols)
    if hit:
        return hit
    ql = str(q).lower()
    scored: List[Tuple[int, str]] = []
    for c in numeric_cols:
        if _id_like_column_name(c) and not re.search(
            r"(revenue|sales|amount|value|downtime|loss|cost|spend|discount)", str(c).lower()
        ):
            continue
        n = _norm_header_token(str(c))
        sc = 0
        for kw, pt in (
            ("revenue", 50),
            ("sales", 48),
            ("order_value", 46),
            ("order_amount", 44),
            ("amount", 40),
            ("value", 36),
            ("downtime", 44),
            ("production_loss", 42),
            ("repair_cost", 38),
            ("spend", 34),
            ("discount", 32),
        ):
            if kw in n:
                sc += pt
        if domain == "operations" and "downtime" in n:
            sc += 28
        if domain == "marketing" and ("revenue" in n or "conversion" in n):
            sc += 18
        if "risk" in ql or "risky" in ql or "riskiest" in ql:
            if any(k in n for k in ("severity", "incident", "downtime", "loss", "hazard")):
                sc += 42
        if "performance" in ql and ("revenue" in n or "sales" in n or "conversion" in n):
            sc += 35
        if re.search(r"\b(credit\s+risk|npl|delinquency|loan\s+balance|deposit)\b", ql):
            if "npl" in n:
                sc += 95
            if "delinquency" in n:
                sc += 95
            if "loan" in n and "balance" in n:
                sc += 90
            if "deposit" in n and "balance" in n:
                sc += 88
            if "utilization" in n:
                sc += 85
            if n == "spend amount" or n.endswith("spend_amount"):
                sc -= 120
        if re.search(r"\butilization\b", ql):
            if "utilization" in n:
                sc += 95
            if n == "spend amount" or n.endswith("spend_amount"):
                sc -= 120
        if re.search(r"\bproduction\s+loss\b", ql) or re.search(
            r"\bproduction[_\s]+loss\b", ql.replace("_", " ")
        ):
            if "production" in n and "loss" in n:
                sc += 120
            if "downtime" in n or "outage" in n:
                sc -= 100
        scored.append((sc, str(c)))
    scored.sort(key=lambda t: (-t[0], t[1].lower()))
    if scored and scored[0][0] > 0:
        return scored[0][1]
    for c in numeric_cols:
        if not _id_like_column_name(c):
            return str(c)
    return str(numeric_cols[0])


def _histogram_bucket_rows(
    df_in: pd.DataFrame, col: str, bins: int = 12
) -> Tuple[List[Dict[str, Any]], str]:
    """Bucket a numeric column for a histogram-style vertical bar chart."""
    try:
        s = pd.to_numeric(df_in[col], errors="coerce").dropna()
    except Exception:
        return [], ""
    if len(s) < 4:
        return [], ""
    n_bins = int(max(4, min(bins, max(5, int(len(s) ** 0.5)))))
    try:
        cuts = pd.cut(s, bins=n_bins, duplicates="drop")
    except Exception:
        return [], ""
    vc = cuts.value_counts().sort_index()
    rows: List[Dict[str, Any]] = []
    for interval, cnt in vc.items():
        try:
            fv = float(cnt)
        except (TypeError, ValueError):
            continue
        if fv <= 0:
            continue
        label = str(interval).replace("(", "[").replace("]", ")")
        rows.append({"name": _pretty_label_text(label, 48), "value": fv})
    if len(rows) < 2:
        return [], ""
    title = f"Histogram — {_pretty_label_text(str(col))}"
    return rows, title


def _question_asks_outlier_analysis(ql: str) -> bool:
    """Individual outlier / extreme-value questions — not department averages."""
    s = str(ql).lower().strip()
    if not s:
        return False
    try:
        from intent_engine.executive_ambiguous_intent import (
            question_requests_standout_analysis,
        )

        if question_requests_standout_analysis(s):
            return True
    except Exception:
        pass
    if re.search(
        r"\b(outliers?|anomal(?:y|ies)|unusually\s+(?:high|low)|extreme\s+values?)\b",
        s,
    ):
        return True
    if re.search(r"\bunusual(?:ly)?\b.*\bpatterns?\b", s):
        return True
    if re.search(r"\bidentify\s+unusual\b", s):
        return True
    if re.search(
        r"\b(?:above|below)\s+(?:the\s+)?\d+(?:st|nd|rd|th)?\s+percentile\b",
        s,
    ):
        return True
    if re.search(r"\bwhere\s+are\b.*\boutliers?\b", s):
        return True
    if re.search(r"\b(?:largest|smallest|highest|lowest|max|min)\b", s) and re.search(
        r"\b(?:outliers?|distribution|spread|range)\b", s
    ):
        return True
    return False


def _question_explicitly_groups_by_dimension(ql: str) -> bool:
    """User named a breakdown dimension (by department, by region, …)."""
    return bool(re.search(r"\bby\s+[a-z0-9]", str(ql).lower()))


_CAT_OUTLIER_WHICH_RE = re.compile(
    r"\bwhich\s+(?P<dim>[a-z][a-z0-9_\s]{1,48}?)\s+(?:is\s+an?\s+)?outliers?\b",
    re.I,
)


def _question_asks_categorical_outlier_ranking(ql: str) -> bool:
    """
    Outlier by named category (which department is an outlier?) — bar ranking,
    not a numeric value histogram.
    """
    s = str(ql).lower().strip()
    if not _question_asks_outlier_analysis(s):
        return False
    if _CAT_OUTLIER_WHICH_RE.search(s):
        return True
    if re.search(
        r"\b(department|product|region|campaign|territory|channel|branch|zone|"
        r"city|segment|category|vendor|supplier|store|team|division)\b",
        s,
    ) and re.search(r"\boutliers?\b", s):
        return True
    return False


def _resolve_categorical_outlier_dimension_column(
    question: str,
    df: pd.DataFrame,
    profile: Dict[str, Any],
) -> Optional[str]:
    """Resolve breakdown column for categorical outlier questions."""
    ql = str(question or "").lower()
    m = _CAT_OUTLIER_WHICH_RE.search(ql)
    cand_dims = _dimension_pool_columns(df, profile)
    pool = cand_dims or df.columns.tolist()
    if m:
        phrase = str(m.group("dim") or "").strip()
        hit = _match_column_from_phrase(phrase, pool, profile)
        if hit and str(hit) in df.columns:
            return str(hit)
    for col in pool:
        if _question_explicitly_requests_dimension(ql, str(col)) and str(col) in df.columns:
            return str(col)
    return None


_HISTOGRAM_NUMERIC_INTENT_TERMS_RE = re.compile(
    r"\b("
    r"histogram|"
    r"frequency(?:\s+distribution)?|"
    r"binning|bins?|"
    r"buckets?(?:\s+ranges?)?|"
    r"bucketi[sz](?:e|ed|es|ing)?|"
    r"grouped\s+ranges?|"
    r"ranges?"
    r")\b",
    re.I,
)


def _question_asks_numeric_distribution_histogram(ql: str) -> bool:
    """User wants a numeric value distribution (histogram), not category share."""
    s = str(ql).lower()
    try:
        from intent_engine.geographic_scope import question_asks_geographic_outliers

        if question_asks_geographic_outliers(s):
            return False
    except Exception:
        pass
    if _question_asks_categorical_outlier_ranking(s):
        return False
    if _question_asks_outlier_analysis(s) and not _question_explicitly_groups_by_dimension(s):
        return True
    if _HISTOGRAM_NUMERIC_INTENT_TERMS_RE.search(s):
        return True
    if re.search(r"\bspread\b", s):
        return True
    if re.search(r"\bdistribut(?:ion|ed)\b", s):
        return True
    return False


def _try_build_histogram_visualization(
    question: str,
    df_in: pd.DataFrame,
    profile: Dict[str, Any],
    trace: Optional[Dict[str, Any]] = None,
) -> Optional[
    Tuple[List[Dict[str, Any]], str, str, Dict[str, Any], Dict[str, Any]]
]:
    """Numeric histogram when the question asks for value buckets/bins/distribution."""
    if df_in is None or df_in.empty:
        return None
    q = question.lower().strip()
    columns = df_in.columns.tolist()
    ct_map = profile.get("column_types", {})
    numeric_cols = [c for c in columns if ct_map.get(c) == "number"]
    if not numeric_cols:
        return None
    domain = _infer_business_domain(columns)
    hist_ncol = _resolve_histogram_numeric_column_for_question(
        question, q, numeric_cols, columns, {"column_types": ct_map}, domain
    )
    if not hist_ncol or str(hist_ncol) not in df_in.columns:
        return None
    h_rows, h_title = _histogram_bucket_rows(df_in, str(hist_ncol))
    if not h_rows:
        return None
    metric_label = _pretty_label_text(str(hist_ncol))
    title = (h_title or "").strip() or f"Distribution — {metric_label}"
    smart_trace = {
        "routing": "histogram",
        "category_column": str(hist_ncol),
        "numeric_column": str(hist_ncol),
        "aggregation": "count",
        "aggregation_key": "count",
        "rows_analyzed": int(len(df_in)),
        "notes": "Histogram: row counts per numeric value range.",
        "histogram": True,
    }
    if trace is not None:
        trace.update(smart_trace)
    intent_debug = {
        "value_col": str(hist_ncol),
        "agg_label": "Count",
        "agg_key": "count",
        "metricColumnDisplay": metric_label,
        "normalized_question": q,
        "histogram": True,
    }
    return h_rows, "histogram", title, intent_debug, smart_trace


def _pick_individual_label_column(
    df: pd.DataFrame,
    profile: Dict[str, Any],
    columns: List[str],
    metric_col: str,
) -> Optional[str]:
    """Prefer employee/name/id labels over department for outlier-ranked views."""
    pool = [c for c in _dimension_pool_columns(df, profile, columns) if c != metric_col]
    if not pool:
        return None
    preferred: List[str] = []
    for c in pool:
        cl = str(c).lower().replace(" ", "_")
        if any(
            tok in cl
            for tok in (
                "employee",
                "emp_name",
                "staff",
                "worker",
                "name",
                "full_name",
                "record",
            )
        ):
            preferred.append(c)
        elif cl.endswith("_id") or cl == "id" or "employee_id" in cl or "emp_id" in cl:
            preferred.append(c)
    if preferred:
        return preferred[0]
    for c in pool:
        cl = str(c).lower()
        if "department" in cl or cl == "dept":
            continue
        return c
    return pool[0]


def _enrich_categorical_outlier_narrative(
    *,
    trace: Optional[Dict[str, Any]],
    chart_rows: List[Dict[str, Any]],
    question: str,
    category_column: Optional[str],
    metric_column: Optional[str],
    exact_result: Optional[str] = None,
    intent_debug: Optional[Dict[str, Any]] = None,
) -> str:
    """Peer median/z-score outlier context for category charts (not histogram bins)."""
    if not chart_rows or len(chart_rows) < 3:
        return (exact_result or "").strip()
    try:
        from intent_engine.categorical_outlier_narrative import (
            compute_categorical_outlier_insights,
            format_categorical_outlier_context,
        )
        from intent_engine.geographic_scope import (
            geographic_scope_display_label,
            question_geographic_scope_level,
        )

        level = question_geographic_scope_level(question) or "category"
        dim_label = geographic_scope_display_label(level, category_column)
        met_label = _pretty_label_text(str(metric_column or "value"))
        insights = compute_categorical_outlier_insights(
            chart_rows,
            dimension_label=dim_label,
            metric_label=met_label,
        )
        if not insights:
            return (exact_result or "").strip()
        if trace is not None:
            trace["categoricalOutlierInsights"] = insights
        if intent_debug is not None:
            intent_debug["categoricalOutlierInsights"] = insights
        block = format_categorical_outlier_context(insights)
        er = (exact_result or "").strip()
        if block and block not in er:
            er = f"{er}\n\n{block}".strip() if er else block
        return er
    except Exception:
        return (exact_result or "").strip()


def _try_outlier_visualization(
    question: str, trace: Optional[Dict[str, Any]] = None
) -> Tuple[List[Dict[str, Any]], str, str, str]:
    """
    Outlier-focused charts: histogram or ranked individuals — never department averages
    unless the question explicitly says "by department".
    """
    global df, dataset_profile
    subtitle = "Outlier-focused view"
    q = question.lower().strip()
    if not _question_asks_outlier_analysis(q):
        return [], "", "", ""
    if _question_explicitly_groups_by_dimension(q):
        return [], "", "", ""
    if df is None or df.empty:
        return [], "", "", ""

    profile = dataset_profile or build_profile(df)
    try:
        from intent_engine.geographic_scope import build_geographic_outlier_chart

        geo_pack = build_geographic_outlier_chart(question, df, profile)
        if geo_pack:
            g_rows, g_type, g_title, g_sub, g_group, g_metric = geo_pack
            if trace is not None:
                trace.update(
                    {
                        "routing": "geographic_outlier",
                        "category_column": g_group,
                        "numeric_column": g_metric,
                        "aggregation": "sum",
                        "aggregation_key": "sum",
                        "rows_analyzed": int(len(df)),
                        "notes": "Geographic outlier view by category label (not histogram bins).",
                        "geographic_outlier_view": True,
                    }
                )
            return g_rows, g_type, g_title, g_sub or subtitle
    except Exception:
        pass
    ct_map = profile.get("column_types", {})
    columns = df.columns.tolist()
    numeric_cols = [c for c in columns if ct_map.get(c) == "number"]
    domain = _infer_business_domain(columns)
    ncol = _numeric_col_mentioned(q, numeric_cols) or _pick_default_metric_column(
        q, numeric_cols, domain
    )
    if not ncol or str(ncol) not in df.columns:
        return [], "", "", ""

    metric_label = _pretty_label_text(str(ncol))

    if _question_asks_categorical_outlier_ranking(q):
        dim_col = _resolve_categorical_outlier_dimension_column(question, df, profile)
        if dim_col and str(dim_col) in df.columns:
            cat_intent = {
                "group_col": str(dim_col),
                "value_col": str(ncol),
                "agg_key": "sum",
                "agg_label": "Total",
            }
            cat_rows, cat_type, cat_title, _cat_ts = _fallback_aggregate_chart(
                cat_intent, question
            )
            if cat_rows and len(cat_rows) >= 2:
                dim_human = _pretty_label_text(str(dim_col))
                title = (
                    cat_title.strip()
                    if cat_title
                    else f"{metric_label} outliers by {dim_human}"
                )
                ctype = (cat_type or "bar").strip() or "bar"
                if trace is not None:
                    trace.update(
                        {
                            "routing": "categorical_outlier",
                            "category_column": str(dim_col),
                            "numeric_column": str(ncol),
                            "aggregation": "sum",
                            "aggregation_key": "sum",
                            "rows_analyzed": int(len(df)),
                            "notes": (
                                f"Categorical outlier view: {metric_label} by "
                                f"{dim_human} (not histogram bins)."
                            ),
                            "outlier_view": True,
                        }
                    )
                return cat_rows, ctype, title, subtitle

    h_rows, _h_title = _histogram_bucket_rows(df, str(ncol))
    if h_rows and len(h_rows) >= 3:
        title = f"{metric_label} outliers — value distribution"
        if trace is not None:
            trace.update(
                {
                    "routing": "outlier_histogram",
                    "category_column": str(ncol),
                    "numeric_column": str(ncol),
                    "aggregation": "count",
                    "aggregation_key": "count",
                    "rows_analyzed": int(len(df)),
                    "notes": "Histogram of metric values to surface outliers.",
                    "histogram": True,
                    "outlier_view": True,
                }
            )
        return h_rows, "histogram", title, subtitle

    label_col = _pick_individual_label_column(df, profile, columns, str(ncol))
    if not label_col or str(label_col) not in df.columns:
        return [], "", "", ""

    try:
        sub = df[[label_col, ncol]].copy()
        sub["_v"] = numeric_series(ncol)
        sub = sub.dropna(subset=["_v"])
        if len(sub) < 2:
            return [], "", "", ""

        label_lower = str(label_col).lower().replace(" ", "_")
        dept_like = "department" in label_lower or label_lower == "dept"
        n_cat = int(sub[label_col].nunique(dropna=True))

        if dept_like and n_cat < 40:
            sub = df[[ncol]].copy()
            sub["_v"] = numeric_series(ncol)
            sub = sub.dropna(subset=["_v"]).sort_values("_v", ascending=False)
            ranked_n = int(len(sub))
            show = sub.head(24)
            chart_data = [
                {
                    "name": f"Record {i + 1}",
                    "value": float(row["_v"]),
                }
                for i, (_, row) in enumerate(show.iterrows())
            ]
            label_human = "Record"
        else:
            show = sub.sort_values("_v", ascending=False).head(24)
            ranked_n = int(len(show))
            chart_data = [
                {
                    "name": _pretty_label_text(row[label_col]),
                    "value": float(row["_v"]),
                }
                for _, row in show.iterrows()
            ]
            label_human = _pretty_label_text(label_col)

        if len(chart_data) < 2:
            return [], "", "", ""

        ctype = "bar_horizontal" if len(chart_data) > 6 else "bar"
        title = f"{metric_label} outliers — ranked by {label_human}"
        if trace is not None:
            trace.update(
                {
                    "routing": "outlier_ranked",
                    "category_column": label_col,
                    "numeric_column": str(ncol),
                    "aggregation": "value",
                    "aggregation_key": "max",
                    "rows_analyzed": ranked_n,
                    "notes": "Ranked individual metric values to highlight outliers.",
                    "outlier_view": True,
                }
            )
        return chart_data, ctype, title, subtitle
    except Exception:
        return [], "", "", ""


def _numeric_column_for_histogram_question(
    question: str,
    numeric_cols: List[str],
    columns: List[str],
    profile: Dict[str, Any],
) -> Optional[str]:
    """Resolve which numeric column to bucket for a distribution / histogram question."""
    ql = str(question).lower().strip()
    patterns = (
        r"\b(?:distribution|histogram|frequency(?:\s+distribution)?|spread|ranges?)\s+of\s+([a-z0-9][a-z0-9_\s%/\-]{1,64})",
        r"\b(?:show|display|analyze)\s+([a-z0-9][a-z0-9_\s]{1,64}?)\s+(?:distribution|histogram|buckets?|bins?|ranges?)\b",
        r"\b([a-z0-9][a-z0-9_\s]{1,64}?)\s+(?:distribution|histogram|buckets?|bins?|ranges?)\b",
        r"\bhow\s+(?:is|are)\s+([a-z0-9][a-z0-9_\s]{1,64}?)\s+distribut(?:ion|ed)\b",
        r"\b(?:bucket(?:ize|ing)|bin(?:ning)?)\s+([a-z0-9][a-z0-9_\s]{1,64})\b",
        r"\b(?:grouped\s+)?(?:bucket|range|bin)\s+ranges?\s+(?:for|of)\s+([a-z0-9][a-z0-9_\s]{1,64})",
    )
    for pat in patterns:
        m = re.search(pat, ql, re.I)
        if m:
            phrase = m.group(1).strip()
            hit = _match_column_from_phrase(phrase, numeric_cols, profile)
            if hit:
                return str(hit)
    return _numeric_col_mentioned(question, numeric_cols)


def _categorical_share_distribution_phrase(ql: str) -> bool:
    """True for pie-style 'distribution/share of categories' (status, channel, …)."""
    s = str(ql).lower()
    return bool(
        re.search(
            r"\b(share|split|breakdown|proportion|percentage|mix|composition)\b",
            s,
        )
        or re.search(
            r"\b(status|channels?|payment|segment|types?|categories?|customer)\b[^.?\n]{0,48}\bdistribution\b|\bdistribution\b[^.?\n]{0,48}\b(status|channels?|payment|segment|types?|categories?|customer)\b",
            s,
        )
    )


def _resolve_histogram_numeric_column_for_question(
    question: str,
    q: str,
    numeric_cols: List[str],
    columns: List[str],
    ct: Dict[str, Any],
    domain: str,
) -> Optional[str]:
    """Pick the numeric column to histogram, or None if the question is not numeric-distribution intent."""
    if not numeric_cols or not _question_asks_numeric_distribution_histogram(q):
        return None
    hcol = _numeric_column_for_histogram_question(question, numeric_cols, columns, ct)
    if hcol:
        return str(hcol)
    if _HISTOGRAM_NUMERIC_INTENT_TERMS_RE.search(q) or re.search(r"\bspread\b", q):
        hm = _numeric_col_mentioned(question, numeric_cols)
        if hm:
            return str(hm)
        pc = _pick_default_metric_column(q, numeric_cols, domain)
        return str(pc) if pc else None
    if "distribution" in q or re.search(r"\bdistribut(?:ion|ed)\b", q):
        hm = _numeric_col_mentioned(question, numeric_cols)
        return str(hm) if hm else None
    return None


def _deterministic_viz_last_resort(
    question: str,
    smart_trace: Dict[str, Any],
) -> Tuple[List[Dict[str, Any]], str, str, str]:
    """
    Last-resort charts when analyze_data + intent fallback + build_smart_chart produced nothing.
    """
    global df, dataset_profile
    subtitle = "Deterministic chart from question + schema"
    if df is None or df.empty:
        return [], "", "", ""
    profile = dataset_profile or build_profile(df)
    q = question.lower().strip()
    columns = df.columns.tolist()
    ct_map = profile.get("column_types", {})
    numeric_cols = [c for c in columns if ct_map.get(c) == "number"]
    if not numeric_cols:
        smart_trace["deterministic_fallback_reason"] = "no_numeric_columns"
        return [], "", "", ""

    date_cols = [c for c in columns if ct_map.get(c) == "date"]
    for c in columns:
        if c not in date_cols and _group_column_is_time_series_eligible(df, str(c)):
            date_cols.append(c)

    domain = _infer_business_domain(columns)
    trendish = any(
        k in q
        for k in (
            "trend",
            "over time",
            "time series",
            "by date",
            "daily",
            "weekly",
            "monthly",
            "show trend",
            "incident trend",
        )
    ) or bool(re.search(r"\b(by|per)\s+(day|date|week|month)\b", q))

    if date_cols and _question_requests_trend_intent(q):
        ncol = _numeric_col_mentioned(q, numeric_cols) or _pick_default_metric_column(
            q, numeric_cols, domain
        )
        dcol = _pick_date_column_for_trend(df, profile) or date_cols[0]
        force_freq = _forced_time_bucket_from_question(q)
        if ncol and str(dcol) != str(ncol):
            g_series, ts_meta = _adaptive_time_series_grouped(
                df[[dcol, ncol]].copy(),
                str(dcol),
                str(ncol),
                agg_key="sum",
                force_freq=force_freq,
            )
            if g_series is not None and len(g_series) >= 2:
                chart_data = _time_series_rows_from_grouped(g_series)
                tb_l = _freq_human_label(str(ts_meta.get("timeBucket") or "M"))
                title = f"{_pretty_label_text(ncol)} over time ({tb_l})"
                smart_trace.update(
                    {
                        "routing": "deterministic_fallback",
                        "category_column": dcol,
                        "numeric_column": ncol,
                        "aggregation": "sum",
                        "aggregation_key": "sum",
                        "rows_analyzed": int(len(df)),
                        "notes": ts_meta.get("selectionReason")
                        or "Deterministic time-series fallback",
                        "timeSeriesAnalysis": ts_meta,
                        "deterministic_fallback_reason": "time_series_default",
                    }
                )
                return chart_data, "line", title, subtitle

    sp = _scatter_pair_from_question(q, numeric_cols)
    if not sp and (
        _question_requests_correlation_routing(question)
        or _question_triggers_numeric_relationship_chart(q)
    ):
        try:
            from intent_engine.correlation_analysis import (
                resolve_relationship_numeric_pair,
            )

            sp = resolve_relationship_numeric_pair(question, df, profile)
        except Exception:
            sp = None
    try:
        from intent_engine.geographic_scope import question_geographic_scope_level

        if question_geographic_scope_level(question):
            sp = None
    except Exception:
        pass
    if sp:
        xc, yc = sp
        try:
            tmp = df[[xc, yc]].copy()
            tmp["_x"] = numeric_series(xc)
            tmp["_y"] = numeric_series(yc)
            tmp = tmp.dropna(subset=["_x", "_y"]).head(450).reset_index(drop=True)
            if len(tmp) >= 2:
                point_labels = [f"•{i + 1}" for i in range(len(tmp))]
                chart_data = []
                for i, (_, row) in enumerate(tmp.iterrows()):
                    chart_data.append(
                        {
                            "name": point_labels[i],
                            "x": float(row["_x"]),
                            "value": float(row["_y"]),
                        }
                    )
                title = f"{_pretty_label_text(yc)} vs {_pretty_label_text(xc)}"
                rel_ins = _compute_scatter_relationship_insights(
                    tmp, str(xc), str(yc), point_labels
                )
                smart_trace.update(
                    {
                        "routing": "deterministic_fallback",
                        "category_column": xc,
                        "numeric_column": yc,
                        "aggregation": "scatter",
                        "aggregation_key": "mean",
                        "rows_analyzed": int(len(tmp)),
                        "notes": "Deterministic scatter (relationship question).",
                        "scatter_x_column": xc,
                        "scatter_y_column": yc,
                        "relationshipInsights": rel_ins,
                        "scatterFallback": False,
                        "deterministic_fallback_reason": "scatter_relationship",
                    }
                )
                return chart_data, "scatter", title, subtitle
        except Exception:
            pass

    ol_rows, ol_type, ol_title, ol_sub = _try_outlier_visualization(question, smart_trace)
    if ol_rows:
        return ol_rows, ol_type, ol_title, ol_sub

    hist_ncol_det = _resolve_histogram_numeric_column_for_question(
        question, q, numeric_cols, columns, {"column_types": ct_map}, domain
    )
    if hist_ncol_det and str(hist_ncol_det) in df.columns:
        h_rows, h_title = _histogram_bucket_rows(df, str(hist_ncol_det))
        if h_rows:
            smart_trace.update(
                {
                    "routing": "deterministic_fallback",
                    "category_column": str(hist_ncol_det),
                    "numeric_column": str(hist_ncol_det),
                    "aggregation": "count",
                    "aggregation_key": "count",
                    "rows_analyzed": int(len(df)),
                    "notes": "Histogram: row counts per numeric value range.",
                    "histogram": True,
                    "deterministic_fallback_reason": "histogram",
                }
            )
            return h_rows, "histogram", h_title, subtitle

    want_incident_row_counts = bool(re.search(r"\bincidents?\b", q)) and not re.search(
        r"\b(downtime|minutes|outage|production\s*loss|repair\s*cost|revenue|sales|loss\s*units)\b",
        q,
    )
    if want_incident_row_counts:
        g_ic = _resolve_by_column_from_question(
            q, columns, {"column_types": ct_map}
        ) or _infer_dimension_column_from_question(question, df, profile)
        pool_ic = _dimension_pool_columns(df, profile, columns)
        if not g_ic and pool_ic:
            g_ic = pool_ic[0]
        if g_ic and str(g_ic) in df.columns:
            try:
                cnt = df.groupby(g_ic, dropna=False).size().sort_values(ascending=False)
                chart_data_ic = [
                    {"name": _pretty_label_text(str(nm)), "value": float(v)}
                    for nm, v in cnt.items()
                ]
                if len(chart_data_ic) >= 2:
                    title_ic = f"Incident count by {_pretty_label_text(g_ic)}"
                    ctype_ic = "bar_horizontal" if len(chart_data_ic) > 8 else "bar"
                    smart_trace.update(
                        {
                            "routing": "deterministic_fallback",
                            "category_column": g_ic,
                            "numeric_column": None,
                            "aggregation": "count",
                            "aggregation_key": "count",
                            "rows_analyzed": int(len(df)),
                            "notes": "Each row treated as one incident; counts by category.",
                            "deterministic_fallback_reason": "incident_count_by_dimension",
                        }
                    )
                    return chart_data_ic, ctype_ic, title_ic, subtitle
            except Exception:
                pass

    ncol = _numeric_col_mentioned(q, numeric_cols) or _pick_default_metric_column(
        q, numeric_cols, domain
    )
    if not ncol:
        smart_trace["deterministic_fallback_reason"] = "no_metric_column"
        return [], "", "", ""

    pool = [c for c in _dimension_pool_columns(df, profile, columns) if c != ncol]
    if not pool:
        smart_trace["deterministic_fallback_reason"] = "no_dimension_column"
        return [], "", "", ""

    best_g: Optional[str] = None
    best_nu = 10**9
    for c in pool:
        try:
            nu = int(df[c].nunique(dropna=True))
        except Exception:
            continue
        if nu < 2:
            continue
        if nu < best_nu:
            best_nu = nu
            best_g = c
    gcol = best_g or pool[0]

    try:
        sub = df[[gcol, ncol]].copy()
        sub["_v"] = numeric_series(ncol)
        sub = sub.dropna(subset=[gcol, "_v"])
        if sub.empty or int(sub[gcol].nunique(dropna=True)) < 2:
            smart_trace["deterministic_fallback_reason"] = "empty_after_dropna"
            return [], "", "", ""
        want_mean = any(k in q for k in ("average", "avg", "mean"))
        gb = sub.groupby(gcol)["_v"].mean() if want_mean else sub.groupby(gcol)["_v"].sum()
        out = gb.reset_index()
        out.columns = ["name", "value"]
        out = out.sort_values("value", ascending=False).head(24)
        chart_data = [
            {"name": _pretty_label_text(r["name"]), "value": float(r["value"])}
            for _, r in out.iterrows()
        ]
        if not chart_data:
            smart_trace["deterministic_fallback_reason"] = "groupby_empty"
            return [], "", "", ""
        want_h = len(chart_data) > 10 or any(
            k in q for k in ("highest", "lowest", "rank", "which ")
        )
        ctype = "bar_horizontal" if want_h else "bar"
        op = "Average" if want_mean else "Total"
        ak = "mean" if want_mean else "sum"
        title = _business_chart_title(ak, op, str(ncol), str(gcol))
        smart_trace.update(
            {
                "routing": "deterministic_fallback",
                "category_column": gcol,
                "numeric_column": ncol,
                "aggregation": op.lower(),
                "aggregation_key": ak,
                "rows_analyzed": int(len(sub)),
                "notes": "Deterministic aggregate: primary metric by inferred dimension.",
                "deterministic_fallback_reason": "default_metric_by_dimension",
            }
        )
        return chart_data, ctype, title, subtitle
    except Exception:
        smart_trace["deterministic_fallback_reason"] = "groupby_error"
        return [], "", "", ""


def build_smart_chart(
    question: str, trace: Optional[Dict[str, Any]] = None
) -> Tuple[List[Dict[str, Any]], str, str, str]:
    """When rule-based charts miss, infer bar/line/pie/h-bar from intent + schema."""
    global df, dataset_profile
    subtitle = "Generated from AI analysis"
    if trace is not None:
        trace.clear()
        trace["routing"] = "smart_chart"
    if df is None or df.empty:
        return [], "", "", ""

    q = question.lower().strip()
    profile = dataset_profile or build_profile(df)
    ct_map = profile.get("column_types", {})
    columns = df.columns.tolist()

    numeric_cols = [c for c in columns if ct_map.get(c) == "number"]
    date_cols = [c for c in columns if ct_map.get(c) == "date"]
    for c in columns:
        if c not in date_cols and _group_column_is_time_series_eligible(df, str(c)):
            date_cols.append(c)
    cat_cols = [c for c in columns if ct_map.get(c) in ("category", "text")]
    ct: Dict[str, Any] = {"column_types": ct_map}
    domain = _infer_business_domain(columns)
    pie_dims = _dimension_pool_columns(df, profile, columns)
    hist_ncol = _resolve_histogram_numeric_column_for_question(
        question, q, numeric_cols, columns, ct, domain
    )
    sp = _scatter_pair_from_question(q, numeric_cols)
    if not sp and (
        _question_requests_correlation_routing(question)
        or _question_triggers_numeric_relationship_chart(q)
    ):
        try:
            from intent_engine.correlation_analysis import (
                resolve_relationship_numeric_pair,
            )

            sp = resolve_relationship_numeric_pair(question, df, profile)
        except Exception:
            sp = None
    try:
        from intent_engine.geographic_scope import question_geographic_scope_level

        if question_geographic_scope_level(question):
            sp = None
    except Exception:
        pass
    if sp:
        xc, yc = sp
        try:
            tmp = df[[xc, yc]].copy()
            tmp["_x"] = numeric_series(xc)
            tmp["_y"] = numeric_series(yc)
            tmp = tmp.dropna(subset=["_x", "_y"]).head(450).reset_index(drop=True)
            if len(tmp) >= 2:
                point_labels = [f"•{i + 1}" for i in range(len(tmp))]
                chart_data = []
                for i, (_, row) in enumerate(tmp.iterrows()):
                    chart_data.append(
                        {
                            "name": point_labels[i],
                            "x": float(row["_x"]),
                            "value": float(row["_y"]),
                        }
                    )
                title = f"{_pretty_label_text(yc)} vs {_pretty_label_text(xc)}"
                rel_ins = _compute_scatter_relationship_insights(
                    tmp, str(xc), str(yc), point_labels
                )
                if trace is not None:
                    trace.update(
                        {
                            "category_column": xc,
                            "numeric_column": yc,
                            "aggregation": "scatter",
                            "aggregation_key": "mean",
                            "rows_analyzed": int(len(tmp)),
                            "notes": "Scatter: each point is one row (y vs x).",
                            "scatter_x_column": xc,
                            "scatter_y_column": yc,
                            "relationshipInsights": rel_ins,
                            "scatterFallback": False,
                        }
                    )
                return chart_data, "scatter", title, subtitle
            sx = float(numeric_series(xc).sum(skipna=True))
            sy = float(numeric_series(yc).sum(skipna=True))
            fb_rows = [
                {
                    "name": _pretty_label_text(str(xc)),
                    "value": sx,
                },
                {
                    "name": _pretty_label_text(str(yc)),
                    "value": sy,
                },
            ]
            fb_title = (
                f"{_pretty_label_text(yc)} vs {_pretty_label_text(xc)} "
                "(column totals — scatter unavailable)"
            )
            if trace is not None:
                trace.update(
                    {
                        "category_column": xc,
                        "numeric_column": yc,
                        "aggregation": "sum",
                        "aggregation_key": "sum",
                        "rows_analyzed": int(len(df)),
                        "notes": (
                            "Scatter fallback: fewer than two rows had both metrics populated."
                        ),
                        "scatter_x_column": xc,
                        "scatter_y_column": yc,
                        "scatterFallback": True,
                        "scatter_fallback_reason": "insufficient_joint_pairs",
                        "relationshipInsights": None,
                    }
                )
            return fb_rows, "bar", fb_title, subtitle
        except Exception:
            try:
                sx = float(numeric_series(xc).sum(skipna=True))
                sy = float(numeric_series(yc).sum(skipna=True))
                fb_rows = [
                    {"name": _pretty_label_text(str(xc)), "value": sx},
                    {"name": _pretty_label_text(str(yc)), "value": sy},
                ]
                fb_title = (
                    f"{_pretty_label_text(yc)} vs {_pretty_label_text(xc)} "
                    "(column totals — scatter build failed)"
                )
                if trace is not None:
                    trace.update(
                        {
                            "category_column": xc,
                            "numeric_column": yc,
                            "aggregation": "sum",
                            "aggregation_key": "sum",
                            "rows_analyzed": int(len(df)),
                            "notes": "Scatter fallback after processing error; totals shown.",
                            "scatter_x_column": xc,
                            "scatter_y_column": yc,
                            "scatterFallback": True,
                            "scatter_fallback_reason": "processing_error",
                            "relationshipInsights": None,
                        }
                    )
                return fb_rows, "bar", fb_title, subtitle
            except Exception:
                pass

    trend_kw = (
        "trend",
        "over time",
        "time series",
        "monthly",
        "by month",
        "by date",
        "quarter",
        "weekly",
        "daily",
        "yearly",
        "timeline",
        "each month",
        "every month",
        "each day",
        "each year",
        "joining",
        "join trend",
        "hire trend",
        "hiring trend",
        "momentum",
        "show trend",
        "incident trend",
    )
    pie_kw = (
        "share",
        "split",
        "breakdown",
        "proportion",
        "percentage",
        "mix",
        "composition",
        "contribution",
        "% of ",
        " percent",
    )

    # ---- Line: date bucket + numeric (adaptive daily / weekly / monthly) ----
    if date_cols and numeric_cols and _question_requests_trend_intent(q):
        ncol = _numeric_col_mentioned(q, numeric_cols)
        if ncol is None and len(numeric_cols) == 1:
            ncol = numeric_cols[0]
        if ncol is None:
            ncol = _pick_default_metric_column(q, numeric_cols, domain)
        dcol = _pick_date_column_for_trend(df, profile) or date_cols[0]
        force_freq = _forced_time_bucket_from_question(q)
        if ncol:
            g_series, ts_meta = _adaptive_time_series_grouped(
                df,
                str(dcol),
                str(ncol),
                agg_key="sum",
                force_freq=force_freq,
            )
            if g_series is not None and len(g_series) >= 2:
                chart_data = _time_series_rows_from_grouped(g_series)
                tb_l = _freq_human_label(str(ts_meta.get("timeBucket") or "M"))
                title = f"{_pretty_label_text(ncol)} over time ({tb_l})"
                if trace is not None:
                    trace.update(
                        {
                            "category_column": dcol,
                            "numeric_column": ncol,
                            "aggregation": "sum",
                            "aggregation_key": "sum",
                            "rows_analyzed": int(len(df)),
                            "notes": ts_meta.get("selectionReason")
                            or f"Adaptive {tb_l} buckets from date column",
                            "timeSeriesAnalysis": {
                                **{
                                    k: v
                                    for k, v in ts_meta.items()
                                    if k != "granularityFallbackChain"
                                },
                                "granularityFallbackChain": ts_meta.get(
                                    "granularityFallbackChain", []
                                ),
                            },
                        }
                    )
                return chart_data, "line", title, subtitle
            if _question_requests_trend_intent(q):
                return [], "", "", subtitle
            # Sparse / degenerate time axis: fall back to category totals if possible.
            if pie_dims:
                fb_dims = [c for c in pie_dims if c != ncol and c != dcol]
                ccol = fb_dims[0] if fb_dims else pie_dims[0]
                try:
                    sub = df[[ccol, ncol]].copy()
                    sub["_v"] = numeric_series(ncol)
                    sub = sub.dropna(subset=[ccol, "_v"])
                    if len(sub) >= 2 and int(sub[ccol].nunique()) >= 2:
                        g2 = (
                            sub.groupby(ccol)["_v"]
                            .sum()
                            .sort_values(ascending=False)
                            .head(12)
                        )
                        chart_data = [
                            {"name": _pretty_label_text(str(i), 40), "value": float(v)}
                            for i, v in g2.items()
                        ]
                        if len(chart_data) >= 2:
                            title = (
                                f"{_pretty_label_text(ncol)} by {_pretty_label_text(ccol)} "
                                f"(sparse dates — category totals)"
                            )
                            if trace is not None:
                                trace.update(
                                    {
                                        "category_column": ccol,
                                        "numeric_column": ncol,
                                        "aggregation": "sum",
                                        "aggregation_key": "sum",
                                        "rows_analyzed": int(len(sub)),
                                        "notes": (
                                            (ts_meta.get("reason") or "sparse_time_distribution")
                                            + " · Fallback: category totals."
                                        ),
                                        "timeSeriesAnalysis": ts_meta,
                                    }
                                )
                            return chart_data, "bar", title, subtitle
                except Exception:
                    pass

    ol_rows, ol_type, ol_title, ol_sub = _try_outlier_visualization(question, trace)
    if ol_rows:
        return ol_rows, ol_type, ol_title, ol_sub

    # ---- Histogram: numeric value distribution (after time-series routing) ----
    if hist_ncol and str(hist_ncol) in df.columns:
        h_rows, h_title = _histogram_bucket_rows(df, str(hist_ncol))
        if h_rows:
            if trace is not None:
                trace.update(
                    {
                        "category_column": str(hist_ncol),
                        "numeric_column": str(hist_ncol),
                        "aggregation": "count",
                        "aggregation_key": "count",
                        "rows_analyzed": int(len(df)),
                        "notes": "Histogram: row counts per numeric value range.",
                        "histogram": True,
                    }
                )
            return h_rows, "histogram", h_title, subtitle

    skip_pie_for_metric_share = "contribution" in q and (
        "revenue" in q or "sales" in q or bool(_numeric_col_mentioned(q, numeric_cols))
    )
    want_pie_composition = any(k in q for k in pie_kw) or _categorical_share_distribution_phrase(
        q
    )
    skip_pie_for_numeric_hist_intent = bool(
        hist_ncol and str(hist_ncol) in df.columns
    )
    # ---- Pie / donut: category shares (row counts), not monetary contribution splits ----
    if (
        pie_dims
        and want_pie_composition
        and not skip_pie_for_numeric_hist_intent
        and not skip_pie_for_metric_share
    ):
        ccol = _match_column_from_phrase(_extract_after_by(q) or "", pie_dims, ct) if _extract_after_by(
            q
        ) else None
        if ccol is None:
            for c in pie_dims:
                if str(c).lower() in q:
                    ccol = c
                    break
        if ccol is None:
            ccol = pie_dims[0]
        vc = df[ccol].astype(str).value_counts(dropna=False).head(14)
        tot = float(vc.sum())
        if tot <= 0:
            pass
        else:
            chart_data = [
                {"name": _pretty_label_text(i, 40), "value": round(100 * float(v) / tot, 1)}
                for i, v in vc.items()
            ]
            if chart_data:
                title = f"Distribution — {_pretty_label_text(ccol)}"
                if trace is not None:
                    trace.update(
                        {
                            "category_column": ccol,
                            "numeric_column": None,
                            "aggregation": "share",
                            "aggregation_key": "sum",
                            "rows_analyzed": int(df[ccol].notna().sum()),
                            "notes": "Percent share of row counts per category",
                        }
                    )
                return chart_data, "pie", title, subtitle

    # ---- Top‑N rows (horizontal bar): sort by numeric ----
    top_n = _extract_top_n(q)
    if top_n and numeric_cols:
        sort_col = _numeric_col_mentioned(q, numeric_cols)
        if sort_col is None and len(numeric_cols) == 1:
            sort_col = numeric_cols[0]
        if sort_col and sort_col in df.columns:
            label_candidates = [
                c for c in _dimension_pool_columns(df, profile, columns) if c != sort_col
            ]
            label_col = _pick_label_column(sort_col, label_candidates, columns)
            try:
                from intent_engine.geographic_scope import (
                    resolve_geographic_group_column,
                )

                geo_label = resolve_geographic_group_column(question, df, profile)
                if geo_label:
                    label_col = geo_label
            except Exception:
                pass
            show = df[[label_col, sort_col]].copy()
            show["_v"] = numeric_series(sort_col)
            show = show.dropna(subset=["_v"]).sort_values("_v", ascending=False)
            ranked_n = int(len(show))
            show = show.head(top_n)
            if not show.empty:
                chart_data = [
                    {
                        "name": _pretty_label_text(row[label_col]),
                        "value": float(row["_v"]),
                    }
                    for _, row in show.iterrows()
                ]
                tn = top_n
                title = f"Top {tn} — {_pretty_label_text(sort_col)}"
                if trace is not None:
                    top_agg_key = (
                        "sum"
                        if _column_looks_additive_metric(sort_col)
                        else "max"
                    )
                    trace.update(
                        {
                            "category_column": label_col,
                            "numeric_column": sort_col,
                            "aggregation": "total"
                            if top_agg_key == "sum"
                            else "value",
                            "aggregation_key": top_agg_key,
                            "rows_analyzed": ranked_n,
                            "notes": f"Top {tn} rows by numeric column",
                        }
                    )
                return chart_data, "bar_horizontal", title, subtitle

    # ---- Generic aggregation: metric by category ----
    gcol = _resolve_by_column_from_question(q, columns, ct)
    if not gcol and numeric_cols and (
        any(k in q for k in ("compare", "performance", "analyze", "analysis"))
        or re.search(r"\bwhich\b", q)
        or "risky" in q
    ):
        gcol = _infer_dimension_column_from_question(question, df, profile)
    if not gcol and pie_dims:
        ranked_pd = _rank_category_dimensions(df, pie_dims, profile)
        gcol = ranked_pd[0][0] if ranked_pd else pie_dims[0]

    geo_scope_locked = False
    try:
        from intent_engine.geographic_scope import (
            question_geographic_scope_level,
            resolve_geographic_group_column,
        )

        geo_gcol = resolve_geographic_group_column(question, df, profile)
        if geo_gcol:
            gcol = geo_gcol
            geo_scope_locked = question_geographic_scope_level(question) is not None
    except Exception:
        pass

    if gcol and numeric_cols and not geo_scope_locked:
        ncol_hint = _numeric_col_mentioned(q, numeric_cols)
        others_nc = [c for c in numeric_cols if str(c) != str(gcol)]
        if ncol_hint is None and len(others_nc) == 1:
            ncol_hint = others_nc[0]
        if ncol_hint is None:
            ncol_hint = _pick_default_metric_column(q, numeric_cols, domain)
        if ncol_hint and str(ncol_hint) != str(gcol):
            gcol2 = _prefer_lower_cardinality_dimension(
                df, profile, str(gcol), str(ncol_hint), q
            )
            if gcol2 != str(gcol) and trace is not None:
                trace["dimensionSwap"] = {"from": str(gcol), "to": str(gcol2)}
            gcol = gcol2

    want_incident_row_counts = bool(re.search(r"\bincidents?\b", q)) and not re.search(
        r"\b(downtime|minutes|outage|production\s*loss|repair\s*cost|revenue|sales|loss\s*units)\b",
        q,
    )
    if gcol and want_incident_row_counts and str(gcol) in df.columns:
        try:
            cnt = df.groupby(gcol, dropna=False).size().sort_values(ascending=False)
            chart_ic = [
                {"name": _pretty_label_text(str(nm)), "value": float(v)}
                for nm, v in cnt.items()
            ]
            if len(chart_ic) >= 2:
                title_ic = f"Incident count by {_pretty_label_text(gcol)}"
                ctype_ic = "bar_horizontal" if len(chart_ic) > 8 else "bar"
                if trace is not None:
                    trace.update(
                        {
                            "category_column": gcol,
                            "numeric_column": None,
                            "aggregation": "count",
                            "aggregation_key": "count",
                            "rows_analyzed": int(len(df)),
                            "notes": "Each row = one incident record; value is count per category.",
                        }
                    )
                return chart_ic, ctype_ic, title_ic, subtitle
        except Exception:
            pass

    if gcol and numeric_cols:
        ncol = _numeric_col_mentioned(q, numeric_cols)
        others = [c for c in numeric_cols if c != gcol]
        if ncol is None and len(others) == 1:
            ncol = others[0]
        if ncol is None:
            ncol = _pick_default_metric_column(q, numeric_cols, domain)
        if ncol and ncol != gcol:
            sub = df[[gcol, ncol]].copy()
            sub["_v"] = numeric_series(ncol)
            sub = sub.dropna(subset=[gcol, "_v"])
            if not sub.empty:
                want_mean = any(k in q for k in ("average", "avg", "mean"))
                topn_b = _extract_top_n(q)
                if want_mean:
                    gb = sub.groupby(gcol)["_v"].mean()
                elif "count" in q and "distinct" not in q:
                    gb = sub.groupby(gcol)["_v"].count()
                else:
                    gb = sub.groupby(gcol)["_v"].sum()
                out = gb.reset_index()
                out.columns = ["name", "value"]
                out = out.sort_values("value", ascending=False)
                if topn_b:
                    out = out.head(topn_b)
                chart_data = [
                    {"name": _pretty_label_text(r["name"]), "value": float(r["value"])}
                    for _, r in out.iterrows()
                ]
                if chart_data:
                    want_h = bool(topn_b) or len(chart_data) > 10 or any(
                        k in q
                        for k in (
                            "rank",
                            "ranking",
                            "highest",
                            "lowest",
                            "which ",
                            "best",
                            "most risky",
                            "riskiest",
                        )
                    ) or bool(re.search(r"\bwhich\s+\w+", q))
                    op = (
                        "Average"
                        if want_mean
                        else ("Count" if "count" in q else "Total")
                    )
                    ak_title = "mean" if want_mean else ("count" if "count" in q else "sum")
                    title = _business_chart_title(ak_title, op, str(ncol), str(gcol))
                    ctype = "bar_horizontal" if want_h else "bar"
                    if trace is not None:
                        ak = "mean" if want_mean else ("count" if "count" in q else "sum")
                        trace.update(
                            {
                                "category_column": gcol,
                                "numeric_column": ncol,
                                "aggregation": op.lower(),
                                "aggregation_key": ak,
                                "rows_analyzed": int(len(sub)),
                            }
                        )
                    return chart_data, ctype, title, subtitle

    return [], "", "", ""


def _numeric_spread_pattern_rows(
    df_in: pd.DataFrame, numeric_cols: List[str], limit: int = 14
) -> List[Dict[str, Any]]:
    """
    Rank numeric columns by variability (IQR / scale) for generic exploration charts.
    Used for 'strongest numeric patterns' style questions — not sales-trend routing.
    """
    scored: List[Tuple[str, float]] = []
    for c in numeric_cols:
        if _id_like_column_name(c):
            continue
        try:
            s = pd.to_numeric(df_in[c], errors="coerce").dropna()
        except Exception:
            continue
        if len(s) < 8 or int(s.nunique(dropna=True)) < 3:
            continue
        med = float(s.median())
        iqr = float(s.quantile(0.75) - s.quantile(0.25))
        if not math.isfinite(iqr) or iqr <= 0:
            continue
        sc = iqr / (abs(med) + 1e-6)
        scored.append((c, sc))
    scored.sort(key=lambda t: (-t[1], str(t[0]).lower()))
    out: List[Dict[str, Any]] = []
    for c, sc in scored[:limit]:
        v = float(sc)
        out.append(
            {
                "name": _pretty_label_text(c),
                "value": v,
                "displayValue": f"{v:.3g}",
            }
        )
    return out


def _question_asks_numeric_spread_patterns(q_lower: str) -> bool:
    """Matches the /ask numeric exploration branch (spread by metric, not sales trend)."""
    q = q_lower
    return (
        ("strongest" in q and "numeric" in q and "pattern" in q)
        or ("numeric pattern" in q)
        or ("numeric patterns" in q)
        or (
            "pattern" in q
            and "numeric" in q
            and "dataset" in q
            and any(k in q for k in ("strong", "strongest", "key", "main"))
        )
    )


def analyze_data(question: str):
    global df

    q = question.lower()

    product_col = get_mapped_or_detected_column(
        "product",
        [
            "product",
            "item",
            "sku",
            "category",
            "product_category",
            "subcategory",
            "campaign",
            "campaign_name",
        ],
    )
    sales_col = get_mapped_or_detected_column(
        "sales",
        [
            "sales",
            "revenue",
            "amount",
            "total",
            "value",
            "order_value",
            "order value",
            "order_amount",
            "order amount",
            "line_total",
            "transaction_total",
            "downtime",
            "downtime_minutes",
            "downtime minutes",
            "production_loss",
            "production_loss_units",
            "repair_cost",
            "repair cost",
        ],
    )
    region_col = get_mapped_or_detected_column(
        "region",
        [
            "region",
            "state",
            "city",
            "location",
            "plant",
            "facility",
            "site",
            "country",
        ],
    )
    customer_col = get_mapped_or_detected_column(
        "customer", ["customer", "client", "buyer", "account"]
    )
    profit_col = get_mapped_or_detected_column(
        "profit", ["profit", "margin", "net profit", "earnings"]
    )
    date_col = get_mapped_or_detected_column(
        "date",
        [
            "date",
            "order date",
            "order_date",
            "transaction date",
            "transaction_date",
            "invoice date",
            "invoice_date",
            "incident_date",
            "incident date",
            "campaign_date",
            "campaign date",
            "created_at",
            "timestamp",
            "month",
        ],
    )

    chart_data = []
    exact_result = ""
    chart_type = ""

    # ---- Simple numeric Q&A via pandas (ground truth) ----
    profile = dataset_profile or build_profile(df)
    numeric_cols = [c for c, t in profile.get("column_types", {}).items() if t == "number"]
    metric_spec = _resolve_question_metric_spec(question, df, profile)

    if metric_spec and metric_spec.get("derived_roi"):
        group_col = _resolve_by_column_from_question(q, df.columns.tolist(), profile)
        if group_col is None:
            group_col = _infer_dimension_column_from_question(question, df, profile)
        rev = metric_spec.get("revenue_col")
        spend = metric_spec.get("spend_col")
        if group_col and rev and spend and group_col in df.columns:
            try:
                g = _grouped_derived_roi_series(df, str(group_col), str(rev), str(spend))
                if g is not None and not g.empty:
                    result = g.reset_index()
                    result.columns = ["name", "value"]
                    result = result.sort_values("value", ascending=False)
                    topn = _extract_top_n(q)
                    if topn:
                        result = result.head(topn)
                    chart_data = [
                        {
                            "name": _pretty_label_text(r["name"]),
                            "value": float(r["value"]),
                        }
                        for _, r in result.iterrows()
                    ]
                    if chart_data:
                        want_h = bool(topn) or len(chart_data) > 10
                        chart_type = "bar_horizontal" if want_h else "bar"
                        exact_result = result.to_string(index=False)
                        dim = _pretty_label_text(str(group_col))
                        return exact_result, chart_data, chart_type
            except Exception:
                pass

    if metric_spec and metric_spec.get("derived_profit_margin"):
        group_col = _resolve_by_column_from_question(q, df.columns.tolist(), profile)
        if group_col is None:
            group_col = _infer_dimension_column_from_question(question, df, profile)
        profit_c = metric_spec.get("profit_col")
        rev_c = metric_spec.get("revenue_col")
        if group_col and profit_c and rev_c and group_col in df.columns:
            try:
                g = _grouped_derived_profit_margin_series(
                    df, str(group_col), str(profit_c), str(rev_c)
                )
                if g is not None and not g.empty:
                    result = g.reset_index()
                    result.columns = ["name", "value"]
                    result = result.sort_values("value", ascending=False)
                    topn = _extract_top_n(q)
                    if topn:
                        result = result.head(topn)
                    chart_data = [
                        {
                            "name": _pretty_label_text(r["name"]),
                            "value": float(r["value"]),
                        }
                        for _, r in result.iterrows()
                    ]
                    if chart_data:
                        want_h = bool(topn) or len(chart_data) > 10
                        chart_type = "bar_horizontal" if want_h else "bar"
                        exact_result = result.to_string(index=False)
                        top = result.iloc[0]
                        bot = result.iloc[-1]
                        spread = float(top["value"]) - float(bot["value"])
                        close_note = ""
                        if spread < 1.5:
                            close_note = (
                                " All regions are close, so differences are small."
                            )
                        exact_result = (
                            f"Profit margin by {_pretty_label_text(str(group_col)).lower()} "
                            f"(SUM(profit)/SUM(revenue)×100). "
                            f"{_pretty_label_text(top['name'])} has the best profit margin "
                            f"at approximately {float(top['value']):.2f}%.{close_note}\n\n"
                            f"{result.to_string(index=False)}"
                        )
                        return exact_result, chart_data, chart_type
            except Exception:
                pass

    if _question_requests_profit_margin(q) and not (
        metric_spec and metric_spec.get("derived_profit_margin")
    ):
        profit_c, rev_c = _find_profit_and_revenue_columns(
            df.columns.tolist(), numeric_cols
        )
        group_col = _resolve_by_column_from_question(q, df.columns.tolist(), profile)
        if group_col is None:
            group_col = _infer_dimension_column_from_question(question, df, profile)
        if profit_c and not rev_c and group_col and group_col in df.columns:
            try:
                sub = df[[group_col, profit_c]].copy()
                sub["_v"] = numeric_series(profit_c)
                sub = sub.dropna(subset=[group_col, "_v"])
                g = sub.groupby(group_col)["_v"].sum()
                if g is not None and not g.empty:
                    result = g.reset_index()
                    result.columns = ["name", "value"]
                    result = result.sort_values("value", ascending=False)
                    chart_data = [
                        {
                            "name": _pretty_label_text(r["name"]),
                            "value": float(r["value"]),
                        }
                        for _, r in result.iterrows()
                    ]
                    if chart_data:
                        chart_type = (
                            "bar_horizontal"
                            if len(chart_data) > 6
                            else "bar"
                        )
                        dim = _pretty_label_text(str(group_col))
                        exact_result = (
                            "Profit margin cannot be calculated without a revenue column. "
                            f"Context only — total profit by {dim.lower()} (not margin):\n\n"
                            f"{result.to_string(index=False)}"
                        )
                        return exact_result, chart_data, chart_type
            except Exception:
                pass

    if _question_asks_numeric_spread_patterns(q):
        rows = _numeric_spread_pattern_rows(df, numeric_cols, limit=14)
        if rows:
            chart_data = rows
            chart_type = "bar_horizontal"
            tbl = pd.DataFrame(
                [{"metric": r["name"], "spread_index": r["value"]} for r in rows]
            )
            exact_result = tbl.to_string(index=False)
            return exact_result, chart_data, chart_type

    def find_target_numeric_column():
        if metric_spec and (
            metric_spec.get("derived_roi")
            or metric_spec.get("derived_profit_margin")
        ):
            return metric_spec.get("value_col")
        if metric_spec and not metric_spec.get("derived_roi"):
            vc = metric_spec.get("value_col")
            if vc and vc in numeric_cols:
                return vc
        best = _best_numeric_column_for_question(q, numeric_cols)
        if best:
            return best
        if _question_requests_roi(question) or _question_requests_profit_margin(question):
            return None
        # Prefer mapped sales if user asks about sales/revenue/amount/total/value
        if any(k in q for k in ["sales", "revenue", "amount", "total", "value"]):
            mapped_sales = get_mapped_or_detected_column(
                "sales", ["sales", "revenue", "amount", "total", "value"]
            )
            if mapped_sales and mapped_sales in numeric_cols:
                return mapped_sales

        # Match explicit column names as whole tokens (avoid substring traps)
        for col in df.columns:
            if col not in numeric_cols:
                continue
            if _column_phrase_matches_normalized_question(
                _norm_metric_phrase_for_match(q), str(col)
            ):
                return col

        if len(numeric_cols) == 1:
            return numeric_cols[0]
        return None

    target_for_agg = find_target_numeric_column()
    _agg_label_legacy, agg_key_legacy = _resolve_agg_label_and_key(
        q, value_col=target_for_agg
    )
    metric = agg_key_legacy if agg_key_legacy else None

    if _question_requests_trend_intent(q):
        trend_pack = _try_build_trend_line_visualization(
            question, df, profile, metric_spec
        )
        if trend_pack:
            t_rows, t_type, t_title, _t_intent, _t_trace = trend_pack
            exact_result = _tabular_exact_from_name_value_rows(t_rows)
            return exact_result, t_rows, t_type
        exact_result = (
            "Time-series visualization unavailable: need a parseable date column "
            "(e.g. order_date) and at least two monthly (or weekly) periods with revenue."
        )
        return exact_result, [], ""

    if metric:
        cols_list = df.columns.tolist()
        group_col = _resolve_by_column_from_question(q, cols_list, profile)
        if group_col is None:
            group_col = _infer_dimension_column_from_question(question, df, profile)
        target = find_target_numeric_column()

        if group_col and group_col in df.columns:
            if metric == "count":
                try:
                    gc = df.groupby(group_col).size().reset_index(name="value")
                    gc = gc.rename(columns={group_col: "name"}).sort_values(
                        "value", ascending=False
                    )
                    topn = _extract_top_n(q)
                    if topn:
                        gc = gc.head(topn)
                    chart_data = [
                        {
                            "name": _pretty_label_text(r["name"]),
                            "value": float(r["value"]),
                        }
                        for _, r in gc.iterrows()
                    ]
                    if chart_data:
                        want_h = bool(topn) or len(chart_data) > 10
                        chart_type = "bar_horizontal" if want_h else "bar"
                        exact_result = gc.to_string(index=False)
                        return exact_result, chart_data, chart_type
                except Exception:
                    pass
            elif target and group_col != target:
                try:
                    sub = df[[group_col, target]].copy()
                    sub["_v"] = numeric_series(target)
                    sub = sub.dropna(subset=[group_col, "_v"])
                    if not sub.empty:
                        if metric == "sum":
                            g = sub.groupby(group_col)["_v"].sum()
                        elif metric == "mean":
                            g = sub.groupby(group_col)["_v"].mean()
                        elif metric == "min":
                            g = sub.groupby(group_col)["_v"].min()
                        elif metric == "max":
                            g = sub.groupby(group_col)["_v"].max()
                        elif metric == "count":
                            g = sub.groupby(group_col)["_v"].count()
                        else:
                            g = None
                        if g is not None and not g.empty:
                            result = g.reset_index()
                            result.columns = ["name", "value"]
                            result = result.sort_values("value", ascending=False)
                            topn = _extract_top_n(q)
                            if topn:
                                result = result.head(topn)
                            chart_data = [
                                {
                                    "name": _pretty_label_text(r["name"]),
                                    "value": float(r["value"]),
                                }
                                for _, r in result.iterrows()
                            ]
                            want_h = bool(topn) or len(chart_data) > 10 or any(
                                k in q
                                for k in (
                                    "rank",
                                    "ranking",
                                    "rank ",
                                    "ranked",
                                )
                            )
                            chart_type = "bar_horizontal" if want_h else "bar"
                            exact_result = result.to_string(index=False)
                            return exact_result, chart_data, chart_type
                except Exception:
                    pass

        if target:
            s = numeric_series(target)
            value = None
            if metric == "sum":
                value = float(s.sum(skipna=True))
            elif metric == "mean":
                value = float(s.mean(skipna=True))
            elif metric == "min":
                value = float(s.min(skipna=True))
            elif metric == "max":
                value = float(s.max(skipna=True))
            elif metric == "count":
                value = int(s.notna().sum())

            exact_result = (
                f"Computed {metric} for column '{target}': {value} "
                f"(based on {int(s.notna().sum())} numeric rows)."
            )
            return exact_result, [], ""

    trend_q = any(
        k in q
        for k in (
            "trend",
            "over time",
            "time series",
            "timeline",
            "monthly",
            "yearly",
            "daily",
            "weekly",
            "quarter",
            "by date",
            "month over month",
            "week over week",
            "year over year",
        )
    ) or bool(re.search(r"\b(by|per)\s+(day|date|week|month|year|quarter)\b", q)    ) or bool(
        re.search(
            r"\b(grew|growth)\b.*\b(over\s+time|month\s+over\s+month|week\s+over\s+week|year\s+over\s+year|mom|wow|yoy)\b",
            q,
        )
        or re.search(
            r"\b(increase\s+over\s+time|decline\s+over\s+time|month\s+over\s+month|week\s+over\s+week|year\s+over\s+year)\b",
            q,
        )
    )
    if trend_q:
        cols_list = df.columns.tolist()
        group_col = _pick_date_column_for_trend(df, profile)
        if group_col is None:
            group_col = _resolve_by_column_from_question(q, cols_list, profile)
        if group_col is None:
            group_col = _infer_dimension_column_from_question(question, df, profile)
        target_ts = find_target_numeric_column()
        if (
            group_col
            and target_ts
            and str(group_col) != str(target_ts)
            and _group_column_is_time_series_eligible(df, str(group_col))
        ):
            try:
                g_series, _tsm = _adaptive_time_series_grouped(
                    df[[group_col, target_ts]].copy(),
                    str(group_col),
                    str(target_ts),
                    agg_key="sum",
                )
                if g_series is not None and len(g_series) >= 2:
                    chart_data = _time_series_rows_from_grouped(g_series)
                    result = pd.DataFrame(chart_data)
                    exact_result = result.to_string(index=False)
                    chart_type = "line"
                    return exact_result, chart_data, chart_type
            except Exception:
                pass

    if date_col and sales_col and (
        ("monthly" in q and ("sales" in q or "revenue" in q) and "trend" in q)
        or ("revenue trend by month" in q)
        or ("sales over time" in q)
        or ("trend by month" in q)
    ):
        temp = df.copy()
        temp["_value"] = numeric_series(sales_col)
        temp["_date"] = pd.to_datetime(temp[date_col], errors="coerce")
        temp = temp.dropna(subset=["_date", "_value"])

        if not temp.empty:
            g_series, _tsm = _adaptive_time_series_grouped(
                df[[date_col, sales_col]].copy(),
                str(date_col),
                str(sales_col),
                agg_key="sum",
            )
            if g_series is not None and len(g_series) >= 2:
                chart_data = _time_series_rows_from_grouped(g_series)
                result = pd.DataFrame(chart_data)
                exact_result = result.to_string(index=False)
                chart_type = "line"
            else:
                exact_result = (
                    "Date and sales values parsed, but time bucketing produced fewer than "
                    "two periods — try a wider date range or a category breakdown question."
                )
        else:
            exact_result = (
                "Date and sales values could not be parsed for monthly trend analysis."
            )

    elif product_col and sales_col and (
        ("sales" in q and "product" in q)
        or ("revenue" in q and "product" in q)
        or ("product wise" in q)
        or ("by product" in q)
    ):
        temp = df.copy()
        temp["_value"] = numeric_series(sales_col)

        result = (
            temp.groupby(product_col)["_value"]
            .sum()
            .reset_index()
            .sort_values("_value", ascending=False)
        )

        result = result.rename(columns={product_col: "name", "_value": "value"})

        chart_data = result.to_dict(orient="records")
        exact_result = result.to_string(index=False)
        chart_type = "bar"

    elif product_col and sales_col and (
        "highest sales" in q
        or "top product" in q
        or "highest revenue" in q
        or "best product" in q
        or "top selling" in q
    ):
        temp = df.copy()
        temp["_value"] = numeric_series(sales_col)

        grouped = (
            temp.groupby(product_col)["_value"]
            .sum()
            .reset_index()
            .sort_values("_value", ascending=False)
        )

        top_row = grouped.iloc[0]

        exact_result = (
            f"The highest sales product is {top_row[product_col]} "
            f"with total sales {top_row['_value']}."
        )

        chart_data = grouped.rename(
            columns={product_col: "name", "_value": "value"}
        ).to_dict(orient="records")

        chart_type = "bar"

    elif region_col and sales_col and (
        ("sales" in q and "region" in q)
        or ("revenue" in q and "region" in q)
        or ("by region" in q)
    ):
        temp = df.copy()
        temp["_value"] = numeric_series(sales_col)

        result = (
            temp.groupby(region_col)["_value"]
            .sum()
            .reset_index()
            .sort_values("_value", ascending=False)
        )

        result = result.rename(columns={region_col: "name", "_value": "value"})
        chart_data = result.to_dict(orient="records")
        exact_result = result.to_string(index=False)
        chart_type = "bar"

    elif customer_col and sales_col and (
        ("customer" in q and "sales" in q)
        or ("top customer" in q)
        or ("top customers by sales" in q)
    ):
        temp = df.copy()
        temp["_value"] = numeric_series(sales_col)

        result = (
            temp.groupby(customer_col)["_value"]
            .sum()
            .reset_index()
            .sort_values("_value", ascending=False)
            .head(10)
        )

        result = result.rename(columns={customer_col: "name", "_value": "value"})
        chart_data = result.to_dict(orient="records")
        exact_result = result.to_string(index=False)
        chart_type = "bar"

    elif profit_col and product_col and (
        ("profit" in q and "product" in q)
        or ("profit by product" in q)
    ):
        temp = df.copy()
        temp["_value"] = numeric_series(profit_col)

        result = (
            temp.groupby(product_col)["_value"]
            .sum()
            .reset_index()
            .sort_values("_value", ascending=False)
        )

        result = result.rename(columns={product_col: "name", "_value": "value"})
        chart_data = result.to_dict(orient="records")
        exact_result = result.to_string(index=False)
        chart_type = "bar"

    else:
        ctx = get_ai_context(sample_rows=10)
        exact_result = f"""No direct chart rule matched.

Use the dataset context below to answer the user question using real column names and the provided statistics/sample only.

DATASET CONTEXT (schema/stats/sample):
{ctx}
"""

    return exact_result, chart_data, chart_type


def _looks_like_money_metric_column(col_name: Optional[str]) -> bool:
    if not col_name:
        return False
    cn = str(col_name).lower().replace("_", " ")
    return bool(
        re.search(
            r"\b(salary|wages?|monthly.?income|income|ctc|pay|compensation|earning|bonus|benefit)"
            r"|(\brevenue\b|\bsales\b|amount\b|pricing|invoice|loan|premium|deposit|cash|capital|budget|profit\b|cost\b|qty)"
            r"|(\border.?value\b|purchase|spend)",
            cn,
            re.I,
        )
    )


def _looks_like_ratio_metric_column(col_name: Optional[str]) -> bool:
    if not col_name:
        return False
    cn = str(col_name).lower().replace("_", " ")
    return bool(
        re.search(
            r"\b(pct|percent(?:age)?|ratio|rates?|probability|conversion|score|ctr|spread|roi)\b",
            cn,
            re.I,
        )
    )


def _infer_agg_hint_from_question(q_lower: str, value_col: Optional[str] = None) -> Optional[str]:
    _label, key = _resolve_agg_label_and_key(q_lower, value_col=value_col)
    return key


def infer_visualization_rounding_category(
    chart_type_internal: str,
    question_lower: str,
    value_column_hint: Optional[str],
    agg_hint: Optional[str],
    values_nonempty: List[float],
) -> str:
    ql = question_lower.lower()
    if chart_type_internal in ("pie", "donut"):
        return "pct_1"
    if chart_type_internal == "scatter":
        return "ratio_1"
    if chart_type_internal == "histogram":
        return "int_0"

    ak = agg_hint or ""
    if ak == "count":
        return "int_0"
    vmax = max((abs(v) for v in values_nonempty), default=0.0) if values_nonempty else 0.0

    if ak == "mean":
        if _looks_like_money_metric_column(value_column_hint):
            return "money_0"
        if _looks_like_ratio_metric_column(value_column_hint):
            return "ratio_1"
        return "money_0" if vmax >= 120 else "ratio_1"

    if ak in ("sum", "max", "min"):
        if _looks_like_money_metric_column(value_column_hint) or (
            re.search(r"\b(revenue|sales)\b", ql)
            and "distribution" not in ql
        ):
            return "money_0"
        return "money_0" if vmax >= 500 else "ratio_1"

    # Unknown aggregation heuristic
    if _looks_like_money_metric_column(value_column_hint) or vmax >= 1000:
        return "money_0"
    if vmax <= 35 and vmax > 0:
        return "ratio_1"
    return "money_0"


def round_display_numeric(category: str, val: float) -> float:
    if category == "pct_1":
        return round(float(val), 1)
    if category in ("money_0", "int_0"):
        return float(int(round(float(val))))
    if category == "ratio_1":
        return round(float(val), 1)
    return round(float(val), 2)


def format_display_numeric(category: str, val_rounded: float) -> str:
    if category == "pct_1":
        return f"{val_rounded:.1f}%"
    if category == "money_0":
        return f"{int(round(val_rounded)):,}"
    if category == "int_0":
        return f"{int(round(val_rounded)):,}"
    if category == "ratio_1":
        ir = round(val_rounded)
        if abs(float(val_rounded) - ir) < 1e-5:
            return f"{int(ir):,}"
        s = f"{val_rounded:,.1f}"
        if "." in s:
            s = s.rstrip("0").rstrip(".")
        return s
    sx = f"{val_rounded:,.6f}".rstrip("0").rstrip(".")
    return sx


def _scatter_relationship_anchor_for_prompt(viz: Dict[str, Any]) -> str:
    """Business-safe chart-values block for scatter — no Point N / row index labels."""
    ri = viz.get("relationshipInsights") if isinstance(viz.get("relationshipInsights"), dict) else {}
    x_lab = _title_case_words(str(viz.get("scatterXLabel") or "X"))
    y_lab = _title_case_words(str(viz.get("scatterYLabel") or "Y"))
    lines: List[str] = [
        f"Relationship scatter: {y_lab} (y-axis) vs {x_lab} (x-axis), one point per filtered row.",
    ]
    if ri.get("pearson") is not None:
        try:
            r = float(ri["pearson"])
            if r == r:
                lines.append(f"Pearson correlation coefficient: {r:+.2f}")
        except (TypeError, ValueError):
            pass
    if ri.get("spearman") is not None:
        try:
            rho = float(ri["spearman"])
            if rho == rho:
                lines.append(f"Spearman correlation coefficient: {rho:+.2f}")
        except (TypeError, ValueError):
            pass
    if ri.get("correlationStrength"):
        lines.append(f"Interpretation: {ri.get('correlationStrength')}")
    if ri.get("correlationLabel"):
        lines.append(f"Signed strength: {ri.get('correlationLabel')}")
    if ri.get("direction"):
        lines.append(f"Direction: {ri.get('direction')}")
    if ri.get("qualitativeOnly") and ri.get("pearson") is None:
        lines.append(
            "Numeric correlation unavailable — qualitative discussion only."
        )
    n = ri.get("sampleSize")
    if n is not None:
        try:
            lines.append(f"Sample size: {int(n)} row(s) with both metrics populated")
        except (TypeError, ValueError):
            pass
    labels = viz.get("labels") or []
    vals = viz.get("values") or []
    sx_disp = viz.get("scatterXDisplay") or viz.get("scatterX") or []
    pairs: List[Tuple[float, float]] = []
    for i in range(min(len(labels), len(vals))):
        try:
            yv = float(vals[i])
            xv = float(sx_disp[i]) if i < len(sx_disp) else float("nan")
        except (TypeError, ValueError):
            continue
        if xv == xv and yv == yv:
            pairs.append((xv, yv))
    if pairs:
        xs = [p[0] for p in pairs]
        ys = [p[1] for p in pairs]
        lines.append(f"{x_lab} range: {min(xs):g} to {max(xs):g}")
        lines.append(f"{y_lab} range: {min(ys):g} to {max(ys):g}")
        lo = min(pairs, key=lambda p: p[1])
        hi = max(pairs, key=lambda p: p[1])
        lines.append(
            f"Lowest {y_lab} in cohort: {y_lab}={lo[1]:g}, {x_lab}={lo[0]:g}"
        )
        lines.append(
            f"Highest {y_lab} in cohort: {y_lab}={hi[1]:g}, {x_lab}={hi[0]:g}"
        )
    margin = ri.get("marginByCategory") if isinstance(ri.get("marginByCategory"), dict) else {}
    hi_m = margin.get("highest") if isinstance(margin.get("highest"), dict) else {}
    lo_m = margin.get("lowest") if isinstance(margin.get("lowest"), dict) else {}
    dim = _title_case_words(str(margin.get("dimensionColumn") or "category"))
    if hi_m.get("label"):
        lines.append(
            f"Highest profit margin by {dim.lower()}: {hi_m.get('label')} "
            f"({hi_m.get('marginPct')}%)"
        )
    if lo_m.get("label"):
        lines.append(
            f"Lowest profit margin by {dim.lower()}: {lo_m.get('label')} "
            f"({lo_m.get('marginPct')}%)"
        )
    olist = ri.get("strongestOutliers") if isinstance(ri.get("strongestOutliers"), list) else []
    if olist and isinstance(olist[0], dict):
        o0 = olist[0]
        ox, oy = o0.get("x"), o0.get("y")
        if ox is not None and oy is not None:
            try:
                lines.append(
                    f"Notable outlier (joint z-score): {x_lab}={float(ox):g}, {y_lab}={float(oy):g}"
                )
            except (TypeError, ValueError):
                pass
    lines.append(
        "Prose rule: do not cite Point N, row numbers, or internal point labels."
    )
    return "\n".join(lines)


def build_visualization_anchor_for_prompt(viz: Dict[str, Any]) -> str:
    if str(viz.get("chartType") or "").lower() == "scatter":
        return _scatter_relationship_anchor_for_prompt(viz)
    coi = viz.get("categoricalOutlierInsights")
    outlier_prefix = ""
    if isinstance(coi, dict) and (coi.get("highOutliers") or coi.get("lowOutliers")):
        try:
            from intent_engine.categorical_outlier_narrative import (
                format_categorical_outlier_context,
            )

            outlier_prefix = (
                format_categorical_outlier_context(coi) + "\n\nChart values by category:\n"
            )
        except Exception:
            outlier_prefix = ""
    srows = viz.get("stackedBarRows")
    ms = viz.get("multiSeries") if isinstance(viz.get("multiSeries"), dict) else {}
    keys = ms.get("seriesKeys") if isinstance(ms.get("seriesKeys"), list) else []
    labels_map = (
        ms.get("seriesLabels") if isinstance(ms.get("seriesLabels"), dict) else {}
    )
    if isinstance(srows, list) and srows and keys:
        layout = str(ms.get("layout") or "").strip().lower()
        grouped_dual = layout == "grouped_bar"
        lines: List[str] = []
        for r in srows:
            if not isinstance(r, dict):
                continue
            nm = str(r.get("name", "")).strip()
            tot = r.get("valueDisplay")
            if tot is None:
                tot = r.get("value")
            parts = []
            for k in keys:
                sk = str(k)
                if sk not in r:
                    continue
                lab = str(labels_map.get(sk) or sk).strip()
                try:
                    fv = float(r[sk])
                except (TypeError, ValueError):
                    continue
                if fv == fv:
                    parts.append(f"{lab}: {fv:g}")
            if parts:
                if grouped_dual:
                    lines.append(f"  • {nm}: " + "; ".join(parts))
                else:
                    lines.append(f"  • {nm}: total={tot} (" + "; ".join(parts) + ")")
            else:
                lines.append(f"  • {nm}: total={tot}")
        if lines:
            return "\n".join(lines)

    labels = viz.get("labels") or []
    disp = viz.get("valueDisplay")
    vals = viz.get("values") or []
    sx_disp = viz.get("scatterXDisplay")
    rows = []
    for i, lab in enumerate(labels):
        txt = ""
        if isinstance(disp, list) and i < len(disp) and disp[i] is not None:
            txt = str(disp[i])
        elif i < len(vals):
            txt = str(vals[i])
        if isinstance(sx_disp, list) and i < len(sx_disp) and sx_disp[i] is not None:
            rows.append(f"  • {lab}: x={sx_disp[i]} y={txt}")
        else:
            rows.append(f"  • {lab}: {txt}")
    body = "\n".join(rows)
    if outlier_prefix:
        return outlier_prefix + body
    return body


def _chart_type_for_api(internal: str) -> str:
    """Public chart type names for structured visualization payloads."""
    i = (internal or "bar").strip().lower().replace("-", "_")
    if i == "bar_horizontal":
        return "horizontalBar"
    if i in ("timeseries", "time_series"):
        return "line"
    if i in ("pie", "donut", "line", "area", "bar", "scatter", "histogram"):
        return i
    return "bar"


def _humanize_chart_type_for_provenance(api_chart_type: str) -> str:
    t = (api_chart_type or "bar").strip()
    return {
        "bar": "Vertical bar chart",
        "horizontalBar": "Horizontal bar chart",
        "line": "Line chart",
        "area": "Area chart",
        "pie": "Pie chart",
        "donut": "Donut chart",
        "scatter": "Scatter plot",
        "histogram": "Histogram",
    }.get(t, t)


def _agg_label_readable_from_key(agg_key: Optional[str]) -> str:
    ak = (agg_key or "mean").strip().lower()
    return {
        "mean": "Average",
        "sum": "Total",
        "count": "Count",
        "min": "Minimum",
        "max": "Maximum",
    }.get(ak, "Average")


def _count_valid_pair_rows(df, group_col: Optional[str], value_col: Optional[str]) -> Optional[int]:
    if df is None or df.empty or not group_col or not value_col:
        return None
    if group_col not in df.columns or value_col not in df.columns:
        return None
    try:
        sub = df[[group_col, value_col]].copy()
        sub["_v"] = numeric_series(value_col)
        sub = sub.dropna(subset=[group_col, "_v"])
        return int(sub.shape[0])
    except Exception:
        return None


def _compute_provenance_confidence(
    *,
    rows_analyzed: int,
    chart_points: int,
    intent_structured: bool,
    fallback_used: bool,
    smart_routing_used: bool,
    category_column: Optional[str],
    numeric_column: Optional[str],
    chart_type_internal: str,
    partial_alignment: bool = False,
    multi_series_rendered: bool = False,
    chart_suppressed_misleading: bool = False,
) -> str:
    """Heuristic trust level for the explainability panel (pandas-only)."""
    pie = chart_type_internal in ("pie", "donut")
    scatter = chart_type_internal == "scatter"
    clear_category = bool(category_column and str(category_column).strip())
    clear_numeric = (
        bool(numeric_column and str(numeric_column).strip()) or pie or scatter
    )
    very_small = rows_analyzed < 5 or chart_points < 2
    weak_mapping = not clear_category or not clear_numeric

    if chart_suppressed_misleading:
        return "Low"

    base = "Medium"
    if very_small or (weak_mapping and smart_routing_used):
        base = "Low"
    elif fallback_used:
        base = "Medium"
    elif smart_routing_used and (not intent_structured or weak_mapping):
        base = "Medium"
    elif intent_structured and clear_category and clear_numeric and rows_analyzed >= 5:
        base = "High"
    elif (
        not intent_structured
        and weak_mapping
        and rows_analyzed >= 5
        and chart_points >= 3
        and not smart_routing_used
        and not fallback_used
    ):
        base = "Medium"
    elif not intent_structured and weak_mapping:
        base = "Low"
    elif weak_mapping or rows_analyzed < 5:
        base = "Medium"

    if multi_series_rendered and base == "Medium" and not partial_alignment:
        if intent_structured and clear_category and rows_analyzed >= 5 and chart_points >= 2:
            base = "High"
    if partial_alignment and base == "High":
        base = "Medium"
    return base


def _series_label_looks_temporal(label: str) -> bool:
    """Deterministic time-bucket detection for chart category labels (no LLM)."""
    s = str(label).strip()
    if not s:
        return False
    if re.match(
        r"^(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b",
        s,
        re.I,
    ):
        return True
    if re.search(r"\bq[1-4]\b(?:\s*[''\u2019]?|/|\s|,)\s*\d{2,4}$", s, re.I):
        return True
    if re.match(r"^\d{4}-\d{2}-\d{2}", s):
        return True
    if re.match(r"^\d{4}-\d{2}$", s):
        return True
    if re.match(r"^\d{4}$", s) and len(s) == 4 and s.isdigit():
        return True
    ts = pd.to_datetime(s, errors="coerce")
    if pd.notna(ts):
        return True
    return False


def _chart_series_labels_all_temporal(chart_data: List[Dict[str, Any]]) -> bool:
    if len(chart_data) < 2:
        return False
    for r in chart_data:
        if not _series_label_looks_temporal(str(r.get("name", ""))):
            return False
    return True


def _values_look_like_percent_shares(vals: List[float]) -> bool:
    if not vals:
        return False
    s = sum(vals)
    if 99.0 <= s <= 101.0:
        return True
    if all(0.0 <= v <= 100.0 for v in vals) and s <= 100.5:
        return True
    return False


def _chart_selection_question_bucket(ql: str) -> str:
    """
    High-level intent bucket for chart selection (deterministic, no LLM).
    """
    q = str(ql).lower()
    try:
        from intent_engine.correlation_routing_guard import chart_selection_bucket_override

        rel_bucket = chart_selection_bucket_override(q)
        if rel_bucket:
            return rel_bucket
    except Exception:
        pass
    try:
        from intent_engine.executive_ambiguous_intent import (
            chart_selection_bucket_override as exec_chart_bucket,
        )

        exec_bucket = exec_chart_bucket(q)
        if exec_bucket:
            return exec_bucket
    except Exception:
        pass
    if _question_asks_outlier_analysis(q) and not _question_explicitly_groups_by_dimension(q):
        return "outlier"
    try:
        from intent_engine.trend_date_resolve import question_requests_trend_intent

        if question_requests_trend_intent(q):
            return "trend"
    except Exception:
        pass
    if _question_asks_numeric_distribution_histogram(q):
        return "distribution"
    if re.search(r"\b(vs\.?|versus|against)\b", q):
        try:
            from intent_engine.question_patterns import (
                question_requests_grouped_dual_metric_compare,
            )

            if question_requests_grouped_dual_metric_compare(q):
                return "compare"
        except Exception:
            pass
        try:
            from intent_engine.dimension_request import (
                question_requests_dimension_value_compare,
            )

            if question_requests_dimension_value_compare(q):
                return "compare"
        except Exception:
            pass
        return "relationship"
    if _looks_like_ranking_question(q) or _extract_top_n(q) is not None:
        return "ranking"
    if re.search(
        r"\b(?:which|what)\b.+\b(?:exceed|above|below|surpass|over|under)\b.+\b(?:average|mean)\b",
        q,
    ) or re.search(
        r"\b(?:exceed|above|below|surpass)\b.+\b(?:average|mean)\b",
        q,
    ):
        return "ranking"
    if any(
        k in q
        for k in (
            "trend",
            "over time",
            "time series",
            "monthly",
            "by month",
            "weekly",
            "each month",
            "momentum",
        )
    ) or re.search(r"\b(by|per)\s+(day|date|week|month|year|quarter)\b", q):
        return "trend"
    if _question_asks_share_or_composition_pie(q) or (
        "distribution" in q and " by " in q and "average" not in q and "mean" not in q
    ):
        return "distribution"
    if re.search(
        r"\b(compare|comparison|across departments|across regions|across each|by department|by region|by product)\b",
        q,
    ):
        return "compare"
    if (
        " by " not in q
        and re.search(
            r"\b(total|sum|average|mean|count of|how many employees|headcount|number of employees)\b",
            q,
        )
    ):
        return "kpi_summary"
    return "compare"


def _question_triggers_numeric_relationship_chart(qn: str) -> bool:
    """Keywords for scatter / numeric relationship intent."""
    s = _norm_metric_phrase_for_match(qn.lower()).strip()
    if re.search(r"\bvs\.?\b|\bversus\b|\bagainst\b", s):
        return True
    if re.search(
        r"\b(relationship|correlations?|correlate|correlated|"
        r"associated|association|dependency|dependencies)\b",
        s,
    ):
        return True
    if re.search(r"\bimpact\b", s):
        return True
    if "compare numeric relationship" in s:
        return True
    if "numeric relationship" in s and "compare" in s:
        return True
    return False


def _phrase_first_position_in_question(ql_norm: str, col: str) -> Optional[int]:
    """Start index of the first match of a column's natural phrase in the question."""
    if not _column_phrase_matches_normalized_question(ql_norm, col):
        return None
    phrase = _norm_metric_phrase_for_match(str(col)).strip()
    parts = phrase.split()
    if len(parts) == 1:
        token = parts[0]
        if len(token) <= 3:
            m = re.search(r"(?<!\w)" + re.escape(token) + r"(?!\w)", ql_norm)
            return m.start() if m else None
        idx = ql_norm.find(token)
        return idx if idx >= 0 else None
    pat = r"(?<!\w)" + r"\s+".join(re.escape(p) for p in parts) + r"(?!\w)"
    m = re.search(pat, ql_norm)
    return m.start() if m else None


def _ordered_numeric_columns_in_question(q_text: str, numeric_cols: List[str]) -> List[str]:
    """Numeric columns whose tokens appear in the question, ordered by first mention (left → right)."""
    ql_norm = _norm_metric_phrase_for_match(q_text.lower())
    ranked = sorted(
        numeric_cols,
        key=lambda x: len(_norm_metric_phrase_for_match(str(x))),
        reverse=True,
    )
    hits: List[Tuple[int, int, str]] = []
    seen: set = set()
    for c in ranked:
        if c in seen:
            continue
        pos = _phrase_first_position_in_question(ql_norm, c)
        if pos is not None:
            seen.add(c)
            hits.append((pos, -len(str(c)), str(c)))
    hits.sort(key=lambda t: (t[0], t[1]))
    return [t[2] for t in hits]


def _scatter_pair_from_question(q: str, numeric_cols: List[str]) -> Optional[Tuple[str, str]]:
    """
    Two numeric columns for a scatter (x, y): X = first metric mentioned, Y = second.
    Triggered by relationship / correlation / versus / impact / compare phrases.
    """
    if len(numeric_cols) < 2:
        return None
    if _question_requests_two_metric_compare(q):
        return None
    if not _question_triggers_numeric_relationship_chart(q):
        return None
    ordered = _ordered_numeric_columns_in_question(q, numeric_cols)
    if len(ordered) >= 2:
        return ordered[0], ordered[1]
    return None


def _question_requests_explicit_dual_metric_by_dimension(q: str) -> bool:
    """Revenue vs spend (or ROI by dimension) with an explicit breakdown dimension."""
    ql = _norm_metric_phrase_for_match(q).strip()
    if not re.search(r"\bby\s+", ql):
        return False
    if re.search(
        r"\b(revenue|sales)\s+(?:vs\.?|versus)\s+(?:spend|cost|ad\s+spend)\b",
        ql,
    ) or re.search(
        r"\b(spend|cost|ad\s+spend)\s+(?:vs\.?|versus)\s+(?:revenue|sales)\b",
        ql,
    ):
        return True
    if re.search(r"\bcompare\s+(?:campaign\s+)?roi\b", ql):
        return True
    if re.search(r"\bcampaign\s+(?:roi|efficiency)\b", ql) and re.search(
        r"\b(revenue|spend|cost)\b", ql
    ):
        return True
    return False


def _question_requests_two_metric_compare(q: str) -> bool:
    """Compare two numeric measures within each category (e.g. revenue vs spend by campaign)."""
    if _question_requests_explicit_dual_metric_by_dimension(q):
        return True
    if _question_requests_roi(q) or _question_requests_profit_margin(q):
        return False
    ql = _norm_metric_phrase_for_match(q).strip()
    if _question_triggers_numeric_relationship_chart(q):
        if re.search(
            r"\bby\s+(region|product|category|department|channel|segment|campaign)\b",
            ql,
        ):
            return True
        return False
    if re.search(
        r"\b(correlation|correlate|correlated|scatter|pearson|regression)\b",
        ql,
    ):
        if not re.search(r"\bby\s+", ql):
            return False
    has_compare = bool(
        re.search(r"\b(compare|comparison|versus|vs\.?)\b", ql)
    )
    has_and_by = bool(re.search(r"\band\b", ql) and re.search(r"\bby\s+", ql))
    return bool(has_compare or has_and_by)


def _resolve_compare_metric_columns(
    question: str, numeric_cols: List[str]
) -> List[str]:
    """
    Two numeric columns for a compare-by-dimension question.
    Supplements phrase-order matching when shorthand tokens appear (e.g. spend → ad_spend).
    """
    ordered = _ordered_numeric_columns_in_question(question, numeric_cols)
    if len(ordered) >= 2:
        return ordered[:2]

    ql = _norm_metric_phrase_for_match(question)
    hits: List[Tuple[int, int, str]] = []
    seen: set = set()
    for pos, col in enumerate(ordered):
        if col not in seen:
            hits.append((pos, -len(str(col)), col))
            seen.add(col)

    compare_tokens = [
        t
        for t in re.findall(
            r"\b(revenue|sales|spend|cost|budget|profit|margin|amount)\w*\b",
            ql,
        )
        if len(t) >= 4
    ]
    for c in sorted(numeric_cols, key=lambda x: len(str(x)), reverse=True):
        if c in seen:
            continue
        cn = _norm_header_token(str(c))
        cn_sp = cn.replace("_", " ")
        matched = False
        pos = 10_000
        for tok in compare_tokens:
            if tok in cn or tok in cn_sp or re.search(
                r"(?<!\w)" + re.escape(tok) + r"(?!\w)", cn_sp
            ):
                idx = ql.find(tok)
                pos = min(pos, idx if idx >= 0 else 10_000)
                matched = True
        if re.search(r"\bspend\b", ql) and "spend" in cn:
            idx = ql.find("spend")
            pos = min(pos, idx if idx >= 0 else 10_000)
            matched = True
        if re.search(r"\b(revenue|sales)\b", ql) and any(
            k in cn for k in ("revenue", "sales", "gross")
        ):
            idx = ql.find("revenue") if "revenue" in ql else ql.find("sales")
            pos = min(pos, idx if idx >= 0 else 10_000)
            matched = True
        if matched:
            hits.append((pos, -len(str(c)), str(c)))
            seen.add(c)

    hits.sort(key=lambda t: (t[0], t[1]))
    out = [t[2] for t in hits]
    return out[:2] if len(out) >= 2 else []


def _resolve_two_metric_compare_spec(
    question: str, df_in: pd.DataFrame, profile: Dict[str, Any]
) -> Optional[Dict[str, Any]]:
    if not _question_requests_two_metric_compare(question):
        return None
    if df_in is None or df_in.empty:
        return None
    cols = df_in.columns.tolist()
    ct = profile.get("column_types", {})
    numeric_cols = [c for c in cols if ct.get(c) == "number"]
    ordered = _resolve_compare_metric_columns(question, numeric_cols)
    if len(ordered) < 2:
        return None
    metric_a, metric_b = ordered[0], ordered[1]
    if metric_a == metric_b:
        return None
    ql = question.lower().strip()
    group_col = _resolve_by_column_from_question(ql, cols, profile)
    if not group_col:
        group_col = _infer_dimension_column_from_question(question, df_in, profile)
    if not group_col or group_col not in cols:
        return None
    if str(metric_a) == str(group_col) or str(metric_b) == str(group_col):
        return None
    agg_label, agg_key = _resolve_agg_label_and_key(ql, value_col=metric_a)
    return {
        "group_col": str(group_col),
        "metric_a": str(metric_a),
        "metric_b": str(metric_b),
        "agg_label": agg_label,
        "agg_key": agg_key,
        "metric_display": _dual_metric_chart_display_title(
            str(group_col), str(metric_a), str(metric_b)
        ),
        "dual_metric_compare": True,
    }


def _dual_metric_chart_display_title(
    group_col: str, metric_a: str, metric_b: str
) -> str:
    """Executive-style title for revenue/spend style dual-metric compares."""
    def _title_words(phrase: str) -> str:
        t = _pretty_label_text(phrase).strip()
        return " ".join(w.capitalize() for w in t.split()) if t else ""

    dim = _title_words(group_col)
    dim = re.sub(r"\s+Name$", "", dim, flags=re.I).strip() or dim
    la = _title_words(metric_a)
    lb = _title_words(metric_b)
    return f"{la} and {lb} by {dim}"


def _try_build_grouped_two_metric_chart(
    df_in: pd.DataFrame,
    profile: Dict[str, Any],
    group_col: str,
    metric_a: str,
    metric_b: str,
    agg_key: str,
) -> Optional[Tuple[str, List[Dict[str, Any]], str, Dict[str, Any]]]:
    """
    Grouped side-by-side bars: one category per group, two metric series.
    Returns (exact_result, chart_rows, title, multi_series_meta) or None.
    """
    if (
        group_col not in df_in.columns
        or metric_a not in df_in.columns
        or metric_b not in df_in.columns
        or metric_a == metric_b
    ):
        return None
    ct = profile.get("column_types", {})
    if ct.get(metric_a) != "number" or ct.get(metric_b) != "number":
        return None
    try:
        sub = df_in[[group_col, metric_a, metric_b]].copy()
        sub["_a"] = numeric_series(metric_a)
        sub["_b"] = numeric_series(metric_b)
        sub = sub.dropna(subset=[group_col])
        if sub.empty:
            return None
        if agg_key == "mean":
            g = sub.groupby(group_col, dropna=False).agg(
                _a=("_a", "mean"), _b=("_b", "mean")
            )
        elif agg_key == "max":
            g = sub.groupby(group_col, dropna=False).agg(
                _a=("_a", "max"), _b=("_b", "max")
            )
        elif agg_key == "min":
            g = sub.groupby(group_col, dropna=False).agg(
                _a=("_a", "min"), _b=("_b", "min")
            )
        else:
            g = sub.groupby(group_col, dropna=False).agg(
                _a=("_a", "sum"), _b=("_b", "sum")
            )
        if g is None or g.empty:
            return None
        g = g.fillna(0.0)
        g["_sort"] = g["_a"] + g["_b"]
        g = g.sort_values("_sort", ascending=False).head(28)

        used: set = set()
        key_a = _safe_recharts_series_key(str(metric_a), used)
        key_b = _safe_recharts_series_key(str(metric_b), used)
        label_a = _pretty_label_text(metric_a)
        label_b = _pretty_label_text(metric_b)

        rows_out: List[Dict[str, Any]] = []
        for idx, row in g.iterrows():
            va = float(row["_a"])
            vb = float(row["_b"])
            rows_out.append(
                {
                    "name": _pretty_label_text(idx),
                    "value": va + vb,
                    key_a: va,
                    key_b: vb,
                }
            )

        if not rows_out:
            return None

        tbl = g.reset_index()
        tbl.columns = [
            _pretty_label_text(group_col),
            label_a,
            label_b,
            "_sort",
        ]
        exact = tbl.drop(columns=["_sort"], errors="ignore").to_string(index=False)
        title = _dual_metric_chart_display_title(group_col, metric_a, metric_b)
        disp_a = " ".join(w.capitalize() for w in label_a.split())
        disp_b = " ".join(w.capitalize() for w in label_b.split())
        meta = {
            "layout": "grouped_bar",
            "categoryAxisTitle": _pretty_label_text(group_col),
            "stackAxisTitle": "Amount",
            "seriesKeys": [key_a, key_b],
            "seriesLabels": {key_a: disp_a, key_b: disp_b},
            "rows": rows_out,
        }
        return exact, rows_out, title, meta
    except Exception:
        return None


def _compute_scatter_relationship_insights(
    df_in: pd.DataFrame,
    xc: str,
    yc: str,
    point_names: List[str],
) -> Dict[str, Any]:
    """Pearson + Spearman correlation and strength classification for scatter plots."""
    from intent_engine.correlation_analysis import compute_relationship_correlations

    try:
        return compute_relationship_correlations(
            df_in,
            str(xc),
            str(yc),
            x_label=str(_pretty_label_text(xc)),
            y_label=str(_pretty_label_text(yc)),
            include_outliers=True,
        )
    except Exception:
        return {
            "pearson": None,
            "spearman": None,
            "direction": None,
            "summaryLine": None,
            "strongestOutliers": [],
            "qualitativeOnly": True,
        }


def _relationship_margin_by_dimension(
    df_in: pd.DataFrame,
    profile: Dict[str, Any],
    profit_col: str,
    revenue_col: str,
    question: str,
) -> Optional[Dict[str, Any]]:
    """Profit margin % by category for relationship fallback / narrative chips."""
    dim = _resolve_by_column_from_question(
        question, df_in.columns.tolist(), profile
    )
    if dim is None:
        dim = _infer_dimension_column_from_question(question, df_in, profile)
    if not dim or dim not in df_in.columns:
        return None
    try:
        g = _grouped_derived_profit_margin_series(
            df_in, str(dim), str(profit_col), str(revenue_col)
        )
        if g is None or g.empty:
            return None
        s = g.sort_values(ascending=False)
        top_name = _pretty_label_text(str(s.index[0]))
        bot_name = _pretty_label_text(str(s.index[-1]))
        return {
            "dimensionColumn": str(dim),
            "highest": {
                "label": top_name,
                "marginPct": round(float(s.iloc[0]), 2),
            },
            "lowest": {
                "label": bot_name,
                "marginPct": round(float(s.iloc[-1]), 2),
            },
        }
    except Exception:
        return None


def _relationship_chart_title(question: str, xc: str, yc: str) -> str:
    """Human chart title — prefer the user's relationship phrasing when concise."""
    q = (question or "").strip()
    if q and len(q) <= 88:
        ql = q.lower()
        if " between " in ql:
            return q[:1].upper() + q[1:] if q else q
        if re.search(r"\b(vs\.?|versus)\b", ql):
            return _relationship_measure_label(xc, yc)
        if re.search(
            r"\b(relationship|correlation|correlat|associated|association|impact)\b",
            ql,
        ):
            return q[:1].upper() + q[1:] if q else q
    return _relationship_measure_label(xc, yc)


def _relationship_measure_label(xc: str, yc: str) -> str:
    """Measure chip text: two metrics only (no aggregation prefix)."""
    xl = _title_case_words(str(xc))
    yl = _title_case_words(str(yc))
    return f"{xl} vs {yl}"


def _relationship_exact_result_text(
    *,
    xc: str,
    yc: str,
    rel_ins: Dict[str, Any],
    row_count: int,
    margin_meta: Optional[Dict[str, Any]] = None,
    mode: str = "scatter",
) -> str:
    from intent_engine.correlation_analysis import format_correlation_exact_result_lines

    xn = _pretty_label_text(xc)
    yn = _pretty_label_text(yc)
    rel_ins = dict(rel_ins)
    if rel_ins.get("sampleSize") is None:
        rel_ins["sampleSize"] = int(row_count)
    lines = format_correlation_exact_result_lines(
        x_col=xc,
        y_col=yc,
        rel_ins=rel_ins,
        x_pretty=xn,
        y_pretty=yn,
    )
    if margin_meta:
        hi = margin_meta.get("highest") or {}
        lo = margin_meta.get("lowest") or {}
        dim = _pretty_label_text(str(margin_meta.get("dimensionColumn") or "category"))
        if hi.get("label"):
            lines.append(
                f"Highest profit margin by {dim.lower()}: {hi.get('label')} "
                f"({hi.get('marginPct')}%)."
            )
        if lo.get("label"):
            lines.append(
                f"Lowest profit margin by {dim.lower()}: {lo.get('label')} "
                f"({lo.get('marginPct')}%)."
            )
    if mode == "profit_margin_fallback":
        lines.append(
            "Scatter plot unavailable — showing profit margin % by category instead "
            "(do not sum revenue and profit)."
        )
    lines.append(
        "Do not rank combined revenue+profit totals; discuss correlation and margin only."
    )
    return "\n".join(lines)


def _try_correlation_routing_pack(
    question: str,
    df_in: pd.DataFrame,
    profile: Dict[str, Any],
) -> Tuple[str, List[Dict[str, Any]], str, str, Dict[str, Any], Dict[str, Any]]:
    """
    Correlation / relationship questions: scatter, correlation-only, or missing-column message.
    Never falls through to unrelated category bar charts.
    """
    rel_pack = _try_build_relationship_scatter_visualization(question, df_in, profile)
    if not rel_pack:
        rel_pack = _try_build_relationship_correlation_only(question, df_in, profile)
    if rel_pack:
        return rel_pack
    try:
        from intent_engine.correlation_analysis import (
            build_unsupported_driver_analysis,
            build_unsupported_relationship_missing_columns,
        )
        from intent_engine.question_patterns import question_requests_driver_intent

        if question_requests_driver_intent(question):
            missing = build_unsupported_driver_analysis(question, df_in, profile)
        else:
            missing = build_unsupported_relationship_missing_columns(
                question, df_in, profile
            )
    except Exception:
        missing = {
            "active": True,
            "leadSentence": (
                "Required columns not found — could not resolve two numeric "
                "columns for this correlation question."
            ),
            "detailLines": [],
        }
    lead = str(missing.get("leadSentence") or "").strip()
    detail = [
        str(ln).strip()
        for ln in (missing.get("detailLines") or [])
        if str(ln).strip()
    ]
    exact = "\n".join([lead, *detail]) if lead else "Required columns not found."
    intent_debug = {
        "relationship_scatter": False,
        "correlation_routing_failed": True,
        "unsupportedRelationship": missing,
        "normalized_question": question.lower().strip(),
    }
    smart_trace = {
        "routing": "relationship_unsupported",
        "unsupportedRelationship": missing,
        "notes": lead,
    }
    return exact, [], "", lead, intent_debug, smart_trace


def _try_build_relationship_correlation_only(
    question: str,
    df_in: pd.DataFrame,
    profile: Dict[str, Any],
) -> Optional[
    Tuple[str, List[Dict[str, Any]], str, str, Dict[str, Any], Dict[str, Any]]
]:
    """
    Relationship / correlation without scatter — still return Pearson + Spearman stats.
    """
    if df_in is None or df_in.empty:
        return None
    try:
        from intent_engine.correlation_analysis import (
            compute_relationship_correlations,
            resolve_relationship_numeric_pair,
        )
    except Exception:
        return None

    sp = resolve_relationship_numeric_pair(question, df_in, profile)
    if not sp:
        return None
    xc, yc = sp
    rel_ins = compute_relationship_correlations(
        df_in,
        str(xc),
        str(yc),
        x_label=str(_pretty_label_text(xc)),
        y_label=str(_pretty_label_text(yc)),
        include_outliers=False,
    )
    n = int(rel_ins.get("sampleSize") or 0)
    title = _relationship_chart_title(question, str(xc), str(yc))
    measure_label = _relationship_measure_label(str(xc), str(yc))
    rel_ins["measureLabel"] = measure_label
    rel_ins["chartTitle"] = title
    exact = _relationship_exact_result_text(
        xc=xc,
        yc=yc,
        rel_ins=rel_ins,
        row_count=n,
        margin_meta=None,
        mode="correlation_only",
    )
    smart_trace: Dict[str, Any] = {
        "routing": "relationship_correlation",
        "scatter_x_column": xc,
        "scatter_y_column": yc,
        "relationshipInsights": rel_ins,
        "correlation_only": True,
        "rows_analyzed": n,
        "notes": "Deterministic correlation (no scatter chart).",
    }
    intent_debug = {
        "group_col": xc,
        "value_col": yc,
        "agg_label": "Correlation",
        "agg_key": "correlation",
        "relationship_scatter": False,
        "correlation_only": True,
        "scatter_x_column": xc,
        "scatter_y_column": yc,
        "relationship_measure_label": measure_label,
        "relationship_chart_title": title,
        "relationshipInsights": rel_ins,
        "normalized_question": question.lower().strip(),
    }
    return exact, [], "", title, intent_debug, smart_trace


def _try_build_relationship_scatter_visualization(
    question: str,
    df_in: pd.DataFrame,
    profile: Dict[str, Any],
) -> Optional[
    Tuple[str, List[Dict[str, Any]], str, str, Dict[str, Any], Dict[str, Any]]
]:
    """
    Relationship / correlation questions → scatter (or profit-margin fallback).
    Returns (exact_result, chart_rows, chart_type, chart_title, intent_debug, smart_trace).
    """
    if df_in is None or df_in.empty:
        return None
    if not _question_requests_correlation_routing(question):
        return None
    cols = df_in.columns.tolist()
    ct = profile.get("column_types", {})
    numeric_cols = [c for c in cols if ct.get(c) == "number"]
    sp = None
    try:
        from intent_engine.correlation_analysis import resolve_relationship_numeric_pair

        sp = resolve_relationship_numeric_pair(question, df_in, profile)
    except Exception:
        sp = None
    if not sp:
        sp = _scatter_pair_from_question(question, numeric_cols)
    if not sp:
        return None
    xc, yc = sp
    smart_trace: Dict[str, Any] = {"routing": "relationship_scatter"}
    profit_c, rev_c = _find_profit_and_revenue_columns(cols, numeric_cols)
    margin_meta = None
    if profit_c and rev_c and not _question_requests_correlation_routing(question):
        margin_meta = _relationship_margin_by_dimension(
            df_in, profile, str(profit_c), str(rev_c), question
        )

    try:
        tmp = df_in[[xc, yc]].copy()
        tmp["_x"] = numeric_series(xc)
        tmp["_y"] = numeric_series(yc)
        tmp = tmp.dropna(subset=["_x", "_y"]).head(450).reset_index(drop=True)
        if len(tmp) >= 2:
            point_labels = [f"Point {i + 1}" for i in range(len(tmp))]
            chart_data: List[Dict[str, Any]] = []
            for i, (_, row) in enumerate(tmp.iterrows()):
                chart_data.append(
                    {
                        "name": point_labels[i],
                        "x": float(row["_x"]),
                        "value": float(row["_y"]),
                    }
                )
            title = _relationship_chart_title(question, str(xc), str(yc))
            measure_label = _relationship_measure_label(str(xc), str(yc))
            rel_ins = _compute_scatter_relationship_insights(
                tmp, str(xc), str(yc), point_labels
            )
            rel_ins["sampleSize"] = int(len(tmp))
            rel_ins["measureLabel"] = measure_label
            rel_ins["chartTitle"] = title
            if margin_meta:
                rel_ins["marginByCategory"] = margin_meta
            smart_trace.update(
                {
                    "category_column": xc,
                    "numeric_column": yc,
                    "aggregation": "scatter",
                    "aggregation_key": "scatter",
                    "rows_analyzed": int(len(tmp)),
                    "notes": "Relationship scatter: one point per row (y vs x).",
                    "scatter_x_column": xc,
                    "scatter_y_column": yc,
                    "relationshipInsights": rel_ins,
                    "relationship_measure_label": measure_label,
                    "scatterFallback": False,
                    "deterministic_fallback_reason": "scatter_relationship",
                }
            )
            intent_debug = {
                "group_col": xc,
                "value_col": yc,
                "agg_label": "Scatter",
                "agg_key": "scatter",
                "relationship_scatter": True,
                "scatter_x_column": xc,
                "scatter_y_column": yc,
                "metricColumnDisplay": _pretty_label_text(str(yc)),
                "categoryColumnDisplay": _pretty_label_text(str(xc)),
                "relationship_measure_label": measure_label,
                "relationship_chart_title": title,
                "relationshipInsights": rel_ins,
                "normalized_question": question.lower().strip(),
            }
            exact = _relationship_exact_result_text(
                xc=xc,
                yc=yc,
                rel_ins=rel_ins,
                row_count=len(tmp),
                margin_meta=margin_meta,
                mode="scatter",
            )
            return exact, chart_data, "scatter", title, intent_debug, smart_trace
    except Exception:
        pass

    if (
        profit_c
        and rev_c
        and margin_meta
        and not _question_requests_correlation_routing(question)
    ):
        dim = str(margin_meta.get("dimensionColumn") or "")
        if dim and dim in df_in.columns:
            try:
                g = _grouped_derived_profit_margin_series(
                    df_in, dim, str(profit_c), str(rev_c)
                )
                if g is not None and not g.empty:
                    chart_data = [
                        {
                            "name": _pretty_label_text(str(nm)),
                            "value": float(v),
                        }
                        for nm, v in g.sort_values(ascending=False).items()
                    ]
                    title = (
                        f"Profit margin % by {_pretty_label_text(dim)} "
                        f"({_pretty_label_text(yc)} vs {_pretty_label_text(xc)} fallback)"
                    )
                    rel_ins = {
                        "pearson": None,
                        "direction": None,
                        "summaryLine": (
                            "Insufficient paired rows for a scatter plot; profit margin % "
                            f"by {_pretty_label_text(dim).lower()} is shown instead."
                        ),
                        "strongestOutliers": [],
                        "sampleSize": int(len(df_in)),
                        "marginByCategory": margin_meta,
                    }
                    smart_trace.update(
                        {
                            "category_column": dim,
                            "numeric_column": str(profit_c),
                            "aggregation": "mean",
                            "aggregation_key": "mean",
                            "derived_profit_margin": True,
                            "profit_col": profit_c,
                            "revenue_col": rev_c,
                            "rows_analyzed": int(len(df_in)),
                            "relationshipInsights": rel_ins,
                            "scatterFallback": True,
                            "scatter_fallback_reason": "profit_margin_by_category",
                            "scatter_x_column": xc,
                            "scatter_y_column": yc,
                            "notes": title,
                        }
                    )
                    intent_debug = {
                        "group_col": dim,
                        "value_col": _DERIVED_PROFIT_MARGIN_METRIC_KEY,
                        "agg_label": "Profit margin",
                        "agg_key": "mean",
                        "derived_profit_margin": True,
                        "profit_col": profit_c,
                        "revenue_col": rev_c,
                        "metricColumnDisplay": "Profit margin %",
                        "normalized_question": question.lower().strip(),
                    }
                    exact = _relationship_exact_result_text(
                        xc=xc,
                        yc=yc,
                        rel_ins=rel_ins,
                        row_count=int(len(df_in)),
                        margin_meta=margin_meta,
                        mode="profit_margin_fallback",
                    )
                    return (
                        exact,
                        chart_data,
                        "bar",
                        title,
                        intent_debug,
                        smart_trace,
                    )
            except Exception:
                pass
    return None


def _question_asks_share_or_composition_pie(ql: str) -> bool:
    """When true, a modest-sized category breakdown is better as pie/donut than bars."""
    if any(
        k in ql
        for k in (
            "contribution",
            "share of",
            " proportion",
            "proportion of",
            "mix",
            "composition",
        )
    ):
        return True
    return _categorical_share_distribution_phrase(ql)


def determine_chart_type_and_reason(
    ql: str,
    chart_type_in: str,
    chart_data: List[Dict[str, Any]],
    intent_debug: Optional[Dict[str, Any]],
    smart_trace: Dict[str, Any],
) -> Tuple[str, str, str]:
    """
    Deterministic chart selection (no LLM).
    Returns (internal_chart_type, human_reason, selection_confidence High|Medium|Low).
    """
    base = _normalize_internal_chart_type(chart_type_in or "bar")
    n = len(chart_data)
    if n == 0:
        return "bar", "No chart points available.", "Low"

    names = [str(r.get("name", "")).strip() for r in chart_data]
    vals: List[float] = []
    for r in chart_data:
        try:
            vals.append(float(r.get("value")))
        except (TypeError, ValueError):
            vals.append(float("nan"))
    if any(math.isnan(v) for v in vals):
        return base, "Numeric series contains invalid values; keeping the upstream chart type.", "Low"

    if base == "scatter":
        return (
            "scatter",
            "Scatter plot: each point pairs two numeric measurements from the dataset.",
            "High",
        )

    if base == "histogram" or smart_trace.get("histogram"):
        return (
            "histogram",
            "Histogram: each category is a value range; bar height is the number of rows in that bucket.",
            "High",
        )

    if smart_trace.get("multi_series"):
        ms_layout = ""
        meta_ms = smart_trace.get("multi_series_meta")
        if isinstance(meta_ms, dict):
            ms_layout = str(meta_ms.get("layout") or "").strip().lower()
        if ms_layout == "grouped_bar":
            return (
                "bar",
                "Grouped side-by-side bars compare two metrics within each category.",
                "High",
            )
        return (
            "bar",
            "Stacked bars: primary category on the axis with segments for the secondary dimension.",
            "High",
        )

    trendish = any(
        k in ql
        for k in (
            "trend",
            "over time",
            "time series",
            "monthly",
            "by month",
            "by date",
            "quarter",
            "weekly",
            "daily",
            "yearly",
            "timeline",
            "each month",
            "every month",
            "each day",
            "each year",
            "joining",
            "join trend",
            "hire trend",
            "hiring trend",
            "momentum",
            "over the year",
            "fiscal year",
        )
    ) or bool(
        re.search(
            r"\b(monthly|quarterly|weekly|annual|daily|yearly)\b",
            ql,
        )
    ) or bool(re.search(r"\b(by|per)\s+(day|date|week|month|year|quarter)\b", ql))

    temporal_all = _chart_series_labels_all_temporal(chart_data)
    date_hint = None
    if smart_trace.get("category_column"):
        date_hint = str(smart_trace["category_column"])
    elif intent_debug and intent_debug.get("group_col"):
        date_hint = str(intent_debug["group_col"])
    dc_pretty = _pretty_label_text(date_hint) if date_hint else "the time field"

    wants_period_area = (
        ("monthly" in ql or "yearly" in ql)
        and n >= 2
        and (
            "trend" in ql
            or "revenue" in ql
            or "sales" in ql
            or "profit" in ql
            or "over time" in ql
        )
    )

    if base == "line":
        if wants_period_area:
            return (
                "area",
                f"Period-based trend ({dc_pretty}); area chart highlights movement between time buckets.",
                "High",
            )
        return (
            "line",
            f"Time-series trend detected from {dc_pretty}.",
            "High",
        )

    if base in ("bar", "bar_horizontal") and temporal_all and trendish:
        if wants_period_area:
            return (
                "area",
                f"Ordered period labels on the category axis ({n} points); area chart for bucketed trends.",
                "High",
            )
        return (
            "line",
            f"Time-series pattern read from category labels (via {dc_pretty}).",
            "High",
        )

    if base == "bar_horizontal":
        return (
            base,
            "Ranking-style question or long labels; horizontal bar chart.",
            "High",
        )

    if base == "bar":
        bucket = _chart_selection_question_bucket(ql)
        if (
            bucket == "compare"
            and n <= 14
            and not (_looks_like_ranking_question(ql) or _extract_top_n(ql))
            and not _question_asks_share_or_composition_pie(ql)
        ):
            return (
                "bar",
                "Grouped comparison across categories — vertical bars make gaps between groups easy to scan.",
                "High",
            )
        if _looks_like_ranking_question(ql) or _extract_top_n(ql) is not None:
            return (
                "bar_horizontal",
                "Top-N / ranking intent; horizontal bars for readable ordering.",
                "High",
            )
        if n >= 12:
            return (
                "bar_horizontal",
                f"{n} categories; horizontal layout reduces label overlap.",
                "High",
            )

    value_col = None
    if intent_debug:
        value_col = intent_debug.get("value_col")

    if (
        value_col
        and _column_looks_ratio_only_metric(str(value_col))
        and not _question_asks_share_or_composition_pie(ql)
        and base in ("pie", "donut", "bar")
    ):
        return (
            "bar_horizontal",
            "Rate or percentage metric by category; horizontal bar with average per group.",
            "High",
        )

    if base == "pie":
        kind = "donut" if n >= 5 else "pie"
        pct_like = _values_look_like_percent_shares(vals)
        tail = (
            "segment values are percent shares."
            if pct_like
            else "counts normalized to percent of total for the chart."
        )
        return (
            kind,
            f"Composition chart with {n} segments ({tail})",
            "High",
        )

    if base == "bar" and _question_asks_share_or_composition_pie(ql) and 3 <= n <= 10 and not temporal_all and not smart_trace.get("histogram"):
        kind = "donut" if n >= 5 else "pie"
        return (
            kind,
            "Share or composition phrasing with a modest number of categories; pie-style view.",
            "High",
        )

    gcol = intent_debug.get("group_col") if intent_debug else None
    gro = _pretty_label_text(gcol) if gcol else "categories"
    if base == "bar":
        return (
            base,
            f"Category comparison across {gro} ({n} groups); vertical bar chart.",
            "Medium",
        )

    if n < 3:
        return base, "Very few points; vertical bar chart as a stable default.", "Low"
    return base, "Standard comparison; vertical bar chart.", "Medium"


def _assemble_visualization_provenance(
    *,
    df,
    intent_debug: Optional[Dict[str, Any]],
    smart_trace: Dict[str, Any],
    fallback_used: bool,
    smart_routing_used: bool,
    chart_type_internal: str,
    chart_points: int,
    agg_eff: Optional[str],
    chart_selection_reason: Optional[str] = None,
    analysis_validation: Optional[Dict[str, Any]] = None,
    partial_alignment: bool = False,
    multi_series_rendered: bool = False,
    chart_suppressed_misleading: bool = False,
    category_labels: Optional[List[str]] = None,
    question: Optional[str] = None,
    chart_title: Optional[str] = None,
) -> Dict[str, Any]:
    cat_col: Optional[str] = None
    num_col: Optional[str] = None
    agg_key_out: Optional[str] = agg_eff
    agg_label_out: str = _agg_label_readable_from_key(str(agg_eff or "mean")).lower()

    if intent_debug:
        cat_col = intent_debug.get("group_col")
        num_col = intent_debug.get("value_col")
        if intent_debug.get("agg_key"):
            agg_key_out = intent_debug.get("agg_key")
        lab = str(intent_debug.get("agg_label") or "").strip()
        if lab:
            agg_label_out = lab.lower()

    if smart_trace:
        cat_col = cat_col or smart_trace.get("category_column")
        if not num_col:
            num_col = smart_trace.get("numeric_column")
        if smart_trace.get("aggregation_key"):
            agg_key_out = smart_trace.get("aggregation_key")
        if smart_trace.get("aggregation"):
            agg_label_out = str(smart_trace["aggregation"]).strip().lower()

    agg_key_out = agg_key_out or agg_eff or "mean"
    if not agg_label_out:
        agg_label_out = _agg_label_readable_from_key(str(agg_key_out)).lower()

    rows_analyzed: int = int(len(df)) if df is not None and not df.empty else 0
    if smart_trace.get("rows_analyzed") is not None:
        try:
            rows_analyzed = int(smart_trace["rows_analyzed"])
        except (TypeError, ValueError):
            pass
    else:
        rc = _count_valid_pair_rows(df, cat_col, num_col)
        if rc is not None:
            rows_analyzed = rc

    intent_structured = bool(
        intent_debug
        and intent_debug.get("group_col")
        and intent_debug.get("value_col")
        and intent_debug.get("group_col") != intent_debug.get("value_col")
    )

    api_type = _chart_type_for_api(chart_type_internal or "bar")
    chart_sel_reason_out = (chart_selection_reason or "").strip() or None
    viz_type_label = _humanize_chart_type_for_provenance(api_type)
    try:
        from intent_engine.chart_presentation_align import (
            humanize_api_chart_type,
            resolve_presented_bar_api_type,
        )

        labels_for_align = [
            str(x).strip()
            for x in (category_labels or [])
            if str(x).strip()
        ]
        if labels_for_align:
            api_type, reason_override = resolve_presented_bar_api_type(
                question=str(question or ""),
                title=str(chart_title or ""),
                category_labels=labels_for_align,
                engine_api_type=api_type,
            )
            viz_type_label = humanize_api_chart_type(api_type)
            if reason_override:
                chart_sel_reason_out = reason_override
            from intent_engine.chart_presentation_align import (
                selection_explanation_for_presented_type,
            )

            chart_sel_reason_out = selection_explanation_for_presented_type(
                api_type,
                category_axis=_pretty_label_text(str(cat_col)) if cat_col else "categories",
                metric_axis=_pretty_label_text(str(num_col)) if num_col else "values",
            )
    except Exception:
        pass
    confidence = _compute_provenance_confidence(
        rows_analyzed=rows_analyzed,
        chart_points=chart_points,
        intent_structured=intent_structured,
        fallback_used=fallback_used,
        smart_routing_used=smart_routing_used,
        category_column=cat_col,
        numeric_column=num_col,
        chart_type_internal=str(chart_type_internal or ""),
        partial_alignment=partial_alignment,
        multi_series_rendered=multi_series_rendered,
        chart_suppressed_misleading=chart_suppressed_misleading,
    )

    num_disp = None
    cat_disp = None
    is_rel_scatter = (
        str(agg_key_out or "").lower() == "scatter"
        or str(chart_type_internal or "").lower() == "scatter"
        or bool(intent_debug and intent_debug.get("relationship_scatter"))
    )
    if is_rel_scatter:
        xc = smart_trace.get("scatter_x_column") or cat_col
        yc = smart_trace.get("scatter_y_column") or num_col
        if xc:
            cat_disp = _title_case_words(str(xc))
        if yc:
            num_disp = _title_case_words(str(yc))
        agg_label_out = "relationship"
        agg_key_out = "scatter"
    else:
        if num_col:
            num_disp = _business_metric_series_label(
                str(agg_key_out or ""),
                str(agg_label_out or ""),
                str(num_col),
            )
        if cat_col:
            cat_disp = _pretty_label_text(cat_col)

    out: Dict[str, Any] = {
        "categoryColumn": cat_col,
        "numericColumn": num_col,
        "numericColumnDisplay": num_disp,
        "categoryColumnDisplay": cat_disp,
        "aggregation": agg_label_out,
        "aggregationKey": agg_key_out,
        "rowsAnalyzed": rows_analyzed,
        "chartPoints": chart_points,
        "visualizationType": (
            humanize_api_chart_type(api_type)
            if "humanize_api_chart_type" in dir()
            else _humanize_chart_type_for_provenance(api_type)
        ),
        "chartTypeApi": api_type,
        "confidence": confidence,
        "flags": {
            "fallbackAggregateUsed": bool(fallback_used),
            "smartChartRoutingUsed": bool(smart_routing_used),
            "intentStructured": bool(intent_structured),
        },
        "notes": smart_trace.get("notes"),
        "chartSelectionReason": chart_sel_reason_out,
        "analysisValidation": analysis_validation,
    }
    rel_ml = smart_trace.get("relationship_measure_label") if smart_trace else None
    if not rel_ml and intent_debug:
        rel_ml = intent_debug.get("relationship_measure_label")
    if rel_ml:
        out["relationshipMeasureLabel"] = str(rel_ml).strip()
    if smart_trace and isinstance(smart_trace.get("timeSeriesAnalysis"), dict):
        out["timeSeriesAnalysis"] = smart_trace["timeSeriesAnalysis"]
    return out


def _detect_intent_tags(question: str) -> List[str]:
    ql = str(question).lower()
    tags: List[str] = []
    if _explicit_max_aggregation_intent(ql):
        tags.append("maximum")
    elif _ranking_or_leaderboard_intent(ql) and any(
        k in ql for k in ("highest", "top", "best", "leading", "most")
    ):
        tags.append("ranking")
    elif any(k in ql for k in ("highest", "maximum", "largest", "peak")) or re.search(
        r"\bmax\b", ql
    ):
        tags.append("highest")
    if any(k in ql for k in ("lowest", "minimum", "smallest", "least")) or re.search(
        r"\bmin\b", ql
    ):
        tags.append("lowest")
    if any(k in ql for k in ("average", "mean", "avg")):
        tags.append("average")
    if any(k in ql for k in ("compare", "versus", " vs ")):
        tags.append("compare")
    if _question_requests_growth_intent(ql):
        tags.append("growth")
    if any(
        k in ql
        for k in (
            "trend",
            "over time",
            "monthly",
            "quarterly",
            "weekly",
            "annual",
        )
    ):
        tags.append("trend")
    if _extract_top_n(ql) or re.search(r"\btop\s+\d+\b", ql):
        tags.append("topN")
    if any(
        k in ql
        for k in (
            "distribution",
            "share",
            "mix",
            "composition",
            "proportion",
            "breakdown",
        )
    ):
        tags.append("distribution")
    out: List[str] = []
    seen: set = set()
    for t in tags:
        if t not in seen:
            seen.add(t)
            out.append(t)
    return out


def _metric_type_for_chart_recommendation(col_hint: Optional[str]) -> str:
    if not col_hint:
        return "numeric"
    if _looks_like_ratio_metric_column(str(col_hint)):
        return "percent"
    if _looks_like_money_metric_column(str(col_hint)):
        return "currency"
    return "numeric"


def _build_chart_recommendation_dict(
    ql: str,
    ll: int,
    ncol_guess: Optional[str],
    chart_type_internal: str,
    selection_explanation: str,
    metric_phrase: Optional[str] = None,
) -> Dict[str, Any]:
    expl = (selection_explanation or "").strip() or (
        "Vertical bar chart selected as a stable default."
    )
    mp = (metric_phrase or "").strip()
    if mp and mp.lower() not in expl.lower():
        expl = f"Measure: {mp}. {expl}"
    return {
        "detectedIntent": _chart_selection_question_bucket(ql),
        "categoryCount": int(ll),
        "metricType": _metric_type_for_chart_recommendation(ncol_guess),
        "recommendedChart": _chart_type_for_api(chart_type_internal or "bar"),
        "selectionExplanation": expl,
    }


def _build_focus_kpis_from_intent(
    intent: Optional[Dict[str, Any]], chart_point_count: int
) -> List[Dict[str, Any]]:
    if not intent:
        return []
    ri = intent.get("relationshipInsights")
    if isinstance(ri, dict) and (
        intent.get("relationship_scatter") or intent.get("correlation_only")
    ):
        kpis: List[Dict[str, Any]] = []
        if ri.get("pearson") is not None:
            try:
                p = float(ri["pearson"])
                kpis.append(
                    {
                        "title": "Pearson correlation",
                        "value": f"{p:+.2f}",
                        "subtitle": str(ri.get("correlationLabel") or "").strip()
                        or None,
                    }
                )
            except (TypeError, ValueError):
                pass
        n = ri.get("sampleSize")
        if n is not None:
            kpis.append(
                {
                    "title": "Sample size",
                    "value": f"{int(n):,}",
                    "subtitle": "Joint row pairs with both metrics",
                }
            )
        strength = str(ri.get("correlationStrength") or "").strip()
        if strength and strength != "Unknown":
            kpis.append(
                {
                    "title": "Relationship strength",
                    "value": strength,
                    "subtitle": None,
                }
            )
        direction = str(ri.get("direction") or "").strip()
        if direction and direction != "unknown":
            kpis.append(
                {
                    "title": "Direction",
                    "value": direction.capitalize(),
                    "subtitle": None,
                }
            )
        if kpis:
            return kpis[:4]
    m = intent.get("value_col")
    g = intent.get("group_col")
    agg_lab = intent.get("agg_label")
    met_disp = _metric_display_from_intent(intent)
    if met_disp == "—" and m:
        met_disp = _business_metric_series_label(
            str(intent.get("agg_key") or ""),
            str(agg_lab or ""),
            str(m) if m else None,
        )
    return [
        {
            "title": "Metric analyzed",
            "value": met_disp,
            "subtitle": str(agg_lab) if agg_lab else None,
        },
        {
            "title": "Breakdown dimension",
            "value": _pretty_label_text(g) if g else "—",
            "subtitle": None,
        },
        {
            "title": "Chart series points",
            "value": f"{int(chart_point_count):,}",
            "subtitle": "Aligned with AI appendix and chart",
        },
    ]


def _aggregate_mapping_confidence_from_meta() -> Optional[str]:
    """Worst-case role confidence from persisted column-mapping metadata."""
    global column_mapping_metadata
    meta = column_mapping_metadata or {}
    roles = meta.get("roles") if isinstance(meta.get("roles"), dict) else {}
    if not roles:
        return None
    worst = "high"
    for key in ("sales", "product", "date", "region", "customer"):
        role = roles.get(key) if isinstance(roles.get(key), dict) else {}
        conf = str((role or {}).get("confidence") or "").strip().lower()
        if conf == "low":
            return "low"
        if conf == "medium":
            worst = "medium"
    return worst


def _insight_confidence_meta(
    n_rows: int,
    chart_pts: int,
    mapping_confidence: Optional[str] = None,
    *,
    dual_metric_compare: bool = False,
    dual_metric_complete: bool = True,
    trend_request_unsatisfied: bool = False,
    growth_request_unsatisfied: bool = False,
    decline_request_unsatisfied: bool = False,
    multi_metric_request_unsatisfied: bool = False,
    relationship_scatter: bool = False,
    relationship_sample_size: Optional[int] = None,
    correlation_qualitative_only: bool = False,
    forecast_projection_low: bool = False,
    forecast_can_forecast: Optional[bool] = None,
    analysis_kind: Optional[str] = None,
    chart_type: Optional[str] = None,
    intent_structured: bool = False,
    alignment_repaired: bool = False,
    partial_visualization_warning: bool = False,
    dimension_redirect_handled: bool = False,
    requested_dimension_missing: bool = False,
    unsupported_explained: bool = False,
) -> Dict[str, Any]:
    """
    Evidence / sample-size metadata for API clients and prompt contracts.
    chart_pts = number of points in the returned chart series (may differ from n_rows).
    """
    from intent_engine.confidence_scoring import compute_insight_confidence_meta

    map_conf = str(mapping_confidence or "").strip().lower() or None
    if map_conf not in ("low", "medium", "high"):
        map_conf = _aggregate_mapping_confidence_from_meta()
    return compute_insight_confidence_meta(
        n_rows,
        chart_pts,
        map_conf,
        dual_metric_compare=dual_metric_compare,
        dual_metric_complete=dual_metric_complete,
        trend_request_unsatisfied=trend_request_unsatisfied,
        growth_request_unsatisfied=growth_request_unsatisfied,
        decline_request_unsatisfied=decline_request_unsatisfied,
        multi_metric_request_unsatisfied=multi_metric_request_unsatisfied,
        relationship_scatter=relationship_scatter,
        relationship_sample_size=relationship_sample_size,
        correlation_qualitative_only=correlation_qualitative_only,
        forecast_projection_low=forecast_projection_low,
        forecast_can_forecast=forecast_can_forecast,
        analysis_kind=analysis_kind,
        chart_type=chart_type,
        intent_structured=intent_structured,
        alignment_repaired=alignment_repaired,
        partial_visualization_warning=partial_visualization_warning,
        dimension_redirect_handled=dimension_redirect_handled,
        requested_dimension_missing=requested_dimension_missing,
        unsupported_explained=unsupported_explained,
    )


def _confidence_answer_prompt_block(conf: Dict[str, Any]) -> str:
    """Row-aware instructions appended to the /ask user prompt."""
    n = int(conf.get("analysisRowCount") or 0)
    cp = int(conf.get("chartSeriesPointCount") or 0)
    small = bool(conf.get("smallSampleCohort"))
    cautious = bool(conf.get("cautiousNarrativeRequired")) or small
    map_low = str(conf.get("mappingConfidenceLevel") or "").lower() == "low"
    few_cats = cp > 0 and cp <= 5
    growth_unsupported = bool(conf.get("growthRequestUnsatisfied"))
    multi_metric_unsupported = bool(conf.get("multiMetricRequestUnsatisfied"))
    relationship_scatter = bool(conf.get("relationshipScatter"))
    level = str(conf.get("insightConfidenceLevel") or "low")
    score_disp = int(conf.get("insightConfidenceScore") or 0)
    reason_lines = conf.get("insightConfidenceReasons")
    executive_narrative = bool(conf.get("executiveNarrative"))
    lines: List[str] = [
        "Confidence-aware reasoning (mandatory):",
        f"- Engine sample: **{n:,} filtered rows**; chart series: **{cp}** point(s). "
        f"Insight confidence: **{level}** (score **{score_disp}/100**).",
        "- Ground every numeric claim in the exact calculated result and/or authoritative chart-values block. "
        "If a claim is not supported there, do not state it.",
    ]
    if executive_narrative:
        lines.extend(
            [
                "- Use these labeled sections only (plain text labels with a colon, no markdown #):",
                "  Executive takeaway: — one direct sentence.",
                "  Evidence: — up to 2 bullets with chart numbers.",
                "  Recommended action: — one hedged action from available data only.",
                "- Total answer 120–180 words. Do NOT use Key findings / What this may indicate.",
            ]
        )
    else:
        lines.extend(
            [
                "- Separate your reply into labeled sections (use plain text labels with a colon, no markdown heading symbols):",
                "  1) Key findings — only facts visible from the numbers/table.",
                "  2) What this may indicate — clearly marked as not proven, tentative, and tied to what would falsify them.",
                "  3) Suggested next steps — optional, conservative, and framed as next data to collect or validate (not as facts).",
            ]
        )
    lines.extend(
        [
        "- Do not diagnose data quality, customer dissatisfaction, churn, loyalty, or operational failure "
        "unless the calculated result explicitly quantifies those constructs with defined columns. "
        "If unsupported, say there is insufficient evidence in this sample.",
        "- Do not state that customer density, order volumes, pricing, or product-category mix **are** the cause "
        "unless those columns were directly aggregated in the calculated result. Preferred wording: "
        "\"Potential drivers could include customer density, order volume, pricing, or product mix. "
        "Additional analysis is required.\"",
        "- Avoid words like proves, definitively, clearly indicates, obviously, must be, always when the sample is small "
        "or when no statistical test output is provided.",
        ]
    )
    if isinstance(reason_lines, list) and reason_lines:
        lines.append("- Confidence factors:")
        for r in reason_lines[:6]:
            rs = str(r).strip()
            if rs:
                lines.append(f"  - {rs}")
    if cautious:
        lines.extend(
            [
                "- **Cautious narrative required** — use hedging language (may indicate, could suggest, "
                "appears to rank highest in this cohort) and avoid definitive business conclusions.",
            ]
        )
    if small:
        lines.extend(
            [
                f"- **Small sample (<100 rows)** — use cautious phrasing such as "
                f"\"may indicate\", \"could suggest\", \"is consistent with (weakly)\", "
                f"and explicitly mention **small sample size** once.",
                "- Do not present strong business conclusions; prefer exploratory language.",
            ]
        )
    if map_low:
        lines.append(
            "- **Low mapping confidence** — metric/breakdown columns were inferred; "
            "do not state that a leader is structurally best without confirming field mapping."
        )
    if few_cats:
        lines.append(
            f"- **Few chart categories ({cp})** — compare groups directionally; "
            "do not over-interpret small value gaps as proof of dominance."
        )
    if growth_unsupported:
        lines.extend(
            [
                "- **Unsupported growth analysis** — The user asked about growth or fastest change, "
                "but this cohort lacks sufficient time-series evidence.",
                "- In Key findings, open with: Growth metric detected, but period/methodology is unknown — "
                "growth comparison is directional only because no date/baseline period exists.",
                "- Then explain why (e.g. single date snapshot or no multi-period series per entity). "
                "You may note static totals as context only — not as a growth ranking.",
                "- Do not imply the highest current total is the fastest growing region or product.",
            ]
        )
    if bool(conf.get("lossProfitabilityAnalysis")):
        lines.extend(
            [
                "- **Loss / profitability question** — Use profit (or margin) totals from the "
                "calculated result. Do NOT describe revenue ranking as loss analysis.",
                "- If the calculated result states that no loss-making groups exist, say that "
                "explicitly before discussing low-profit segments.",
                "- Preferred follow-up topics: profit margin by segment, negative-profit rows, "
                "loss thresholds, product-region profitability.",
            ]
        )
    exec_amb = str(conf.get("executiveAmbiguousBucket") or "").strip()
    if exec_amb == "executive_strategy":
        lines.append(
            "- **Management priority question** — Combine concentration, risk, opportunity, and "
            "growth/margin signals; do not answer with only a product revenue ranking."
        )
    elif exec_amb == "executive_risk":
        lines.append(
            "- **Executive risk question** — Identify top business risk, concentration/dependency "
            "exposure, and weakest performers. Structure as Primary concern, Secondary concern, "
            "and Watch item; avoid a generic revenue leaderboard."
        )
    elif exec_amb == "executive_opportunity":
        lines.append(
            "- **Improvement question** — Focus on uplift segments (gap, growth vs revenue, margin); "
            "not only top revenue products."
        )
    elif exec_amb == "executive_outlier_standout":
        lines.append(
            "- **Standout / outlier question** — Describe unusual highs, lows, gaps, and "
            "concentration; avoid generic ranking copy."
        )
    if exec_amb in (
        "executive_strategy",
        "executive_risk",
        "executive_opportunity",
        "executive_outlier_standout",
    ) or executive_narrative:
        lines.extend(
            [
                "- **Executive structure** — Labels: Executive takeaway / Evidence / Recommended action.",
                "- Do not open with process narration (avoid I will / Let me / To answer).",
                "- Keep under ~180 words; avoid generic strategy language.",
            ]
        )
    if exec_amb == "executive_risk" or bool(conf.get("concentrationRiskQuestion")):
        lines.append(
            "- **Concentration / risk** — Prefer revenue concentration, geographic dependency, "
            "portfolio concentration, or channel dependency; avoid market penetration unless "
            "that column exists."
        )
    if bool(conf.get("driverAnalysis")):
        lines.extend(
            [
                "- **Driver / root-cause question (association only)** — Describe the strongest "
                "**observed relationship** or **strongest available predictor** in this sample.",
                "- Use association language (associated with, co-varies with, aligns with) — "
                "never causal claims (drives, causes, dominant driver, proves).",
                "- State once that correlation/association does not prove causation.",
                "- Name the explanatory metric with the strongest |r| vs the outcome from the "
                "exact calculated result; cite Pearson r and sample size.",
            ]
        )
    if multi_metric_unsupported:
        lines.extend(
            [
                "- **Unsupported metric comparison** — The user asked to compare metrics directly, "
                "but a required metric column is missing from the dataset.",
                "- In Key findings, use ONLY the exact calculated result block (missing metric, "
                "requested metrics, available columns, recommended action).",
                "- Do NOT report product/category rankings, highest/lowest entities, "
                "revenue-by-product totals, or unrelated single-metric summaries.",
            ]
        )
    if bool(conf.get("unsupportedRequestedMetric")):
        lines.extend(
            [
                "- **Missing requested metric** — Open limitation-first; do not substitute "
                "another metric as the answer.",
                "- Do not use forbidden business phrases listed in the phrase-guardrails block.",
                "- If a fallback chart is present, label any mention as fallback context only.",
            ]
        )
    if bool(conf.get("forecastProjectionLow")):
        lines.extend(
            [
                "- **Scenario estimate (not forecast)** — Reliable forecasting cannot be performed "
                "because historical time-series data is unavailable.",
                "- Label as **Scenario estimate** with **Directional projection**; "
                "Forecast Confidence: Low.",
                "- Do NOT present extrapolated numbers as forecasts; use qualitative directional "
                "language only.",
                "- Do not imply model accuracy, seasonality, or confidence intervals.",
            ]
        )
    if relationship_scatter:
        lines.extend(
            [
                "- **Relationship / correlation question** — Use the exact calculated result: "
                "Pearson coefficient, Spearman coefficient, strength interpretation "
                "(Very Weak / Weak / Moderate / Strong / Very Strong), signed label, and sample size. "
                "If qualitativeOnly is true, discuss association qualitatively only.",
                "- Do NOT sum revenue and profit into one total or rank products by combined values.",
                "- If profit margin by category is provided, you may cite highest/lowest margin — "
                "not highest combined revenue+profit.",
                "- **Never cite row numbers, Point N, row 63, or internal chart point labels** in "
                "user-facing prose. Describe observations using metric values, ranges, or "
                "business dimensions (product, region) only.",
                "- Do not use internal field names (scatter profit, category column ids) in prose.",
            ]
        )
    if bool(conf.get("derivedProfitMargin")):
        lines.extend(
            [
                "- **Derived profit margin** — Values are SUM(profit) ÷ SUM(revenue) × 100 by group. "
                "Answer in percent (e.g. 22.47%), not as currency totals.",
                "- In Key findings, name the best-margin group and its approximate margin from the "
                "exact calculated result; do not rank by total profit unless the result explicitly "
                "labels a profit-only context chart.",
                "- If margins are very close (spread under ~1.5 percentage points), say differences "
                "are small and avoid overstating dominance.",
            ]
        )
    if bool(conf.get("profitMarginUnavailable")):
        lines.extend(
            [
                "- **Profit margin unavailable** — No revenue column; margin cannot be calculated.",
                "- Explain that limitation first; any profit chart is context only (total profit), "
                "not margin — label it clearly as context, not margin.",
            ]
        )
    if not cautious:
        lines.append(
            "- You may be somewhat more direct than for thin-evidence cohorts, but still avoid claims "
            "not evidenced by the calculated result."
        )
    return "\n".join(lines)


INSIGHT_SAFETY_SYSTEM_PROMPT = (
    "You are an analyst assistant for tabular business data. "
    "You must not hallucinate columns, metrics, or magnitudes. "
    "Never mention business concepts (conversion rate, NPS, CLV, market penetration, churn, "
    "salesperson, net interest margin) unless the user message shows those columns exist. "
    "Never invent statistical significance: if no p-values, confidence intervals, or "
    "explicit tests appear in the user message, do not claim significance. "
    "Prefer calibrated, honest uncertainty. Keep answers concise and plain text "
    "(no markdown # or **). "
    "When the user question uses retail wording (revenue, product, region) but the dataset "
    "and calculated result reflect different business semantics (e.g. plant, severity, "
    "production loss, downtime, repair cost), do not refuse with 'I cannot summarize'. "
    "Briefly note the wording mismatch in one sentence, then interpret the chart using the "
    "actual metric and dimension names from the dataset context and authoritative numbers."
)

_CLAUDE_NARRATIVE_RETRY_DELAYS_S = (1.0, 2.5, 5.0)
_CLAUDE_TRANSIENT_STATUS_CODES = frozenset({408, 429, 500, 502, 503, 504, 529})


def _anthropic_http_status(exc: BaseException) -> Optional[int]:
    if isinstance(exc, APIStatusError):
        return exc.status_code
    return None


def _is_transient_anthropic_error(exc: BaseException) -> bool:
    if isinstance(exc, (RateLimitError, APIConnectionError)):
        return True
    code = _anthropic_http_status(exc)
    return code is not None and code in _CLAUDE_TRANSIENT_STATUS_CODES


def _generate_insight_narrative(prompt: str) -> str:
    """Call Claude for insight prose; retry transient overload / rate-limit errors."""
    attempts = len(_CLAUDE_NARRATIVE_RETRY_DELAYS_S) + 1
    last_exc: Optional[BaseException] = None
    for attempt in range(attempts):
        try:
            response = client.messages.create(
                model="claude-haiku-4-5-20251001",
                max_tokens=520,
                system=INSIGHT_SAFETY_SYSTEM_PROMPT,
                messages=[{"role": "user", "content": prompt}],
            )
            return response.content[0].text.strip()
        except APIStatusError as exc:
            if not _is_transient_anthropic_error(exc):
                raise
            last_exc = exc
            if attempt < attempts - 1:
                logger.warning(
                    "Claude API transient error (attempt %s/%s): %s",
                    attempt + 1,
                    attempts,
                    exc,
                )
                time.sleep(_CLAUDE_NARRATIVE_RETRY_DELAYS_S[attempt])
                continue
            raise
        except (RateLimitError, APIConnectionError) as exc:
            last_exc = exc
            if attempt < attempts - 1:
                logger.warning(
                    "Claude API transient error (attempt %s/%s): %s",
                    attempt + 1,
                    attempts,
                    exc,
                )
                time.sleep(_CLAUDE_NARRATIVE_RETRY_DELAYS_S[attempt])
                continue
            raise
    if last_exc is not None:
        raise last_exc
    raise RuntimeError("Claude narrative call failed without exception")


def _claude_narrative_fallback_answer(exc: BaseException) -> str:
    code = _anthropic_http_status(exc)
    if code == 529 or isinstance(exc, RateLimitError) or code == 429:
        return (
            "The AI narrative service is temporarily overloaded. "
            "Please wait a moment and ask again — your chart and calculated metrics "
            "below are still available."
        )
    if isinstance(exc, APIConnectionError):
        return (
            "Could not reach the AI service. Check your network connection and try again. "
            "Your chart and calculated metrics below are still available."
        )
    if isinstance(exc, AuthenticationError):
        return (
            "The AI service could not authenticate. "
            "Verify ANTHROPIC_API_KEY is configured on the server."
        )
    if isinstance(exc, APIStatusError):
        return (
            "The AI service returned an error. Please try again shortly. "
            "Your chart and calculated metrics below are still available."
        )
    return (
        "Unable to generate an AI narrative right now. Please try again. "
        "Your chart and calculated metrics below are still available."
    )


def _semantic_intent_correction_prompt_block(question: str) -> str:
    """
    When question vocabulary mismatches inferred domain, steer the model toward
    auto-corrected business semantics instead of hard refusals.
    """
    global df
    if df is None or df.empty:
        return ""
    columns = df.columns.tolist()
    domain = _infer_business_domain(columns)
    ql = str(question or "").lower()
    mentions_retail = bool(
        re.search(r"\b(revenue|sales|product|sku|order value)\b", ql)
    )
    mentions_region_only = bool(re.search(r"\bregion\b", ql)) and domain == "operations"

    if domain not in ("operations", "manufacturing") and not mentions_retail:
        return ""

    if domain in ("operations", "manufacturing") and (
        mentions_retail or mentions_region_only
    ):
        metric_col = get_mapped_or_detected_column(
            "sales",
            [
                "production_loss",
                "downtime",
                "repair_cost",
                "maintenance_cost",
                "cost",
                "amount",
                "revenue",
                "sales",
            ],
        )
        dim_col = get_mapped_or_detected_column(
            "region",
            ["plant", "site", "facility", "location", "warehouse", "region"],
        ) or get_mapped_or_detected_column(
            "product", ["severity", "issue_type", "category", "type", "priority"],
        )
        m_lbl = _pretty_label_text(metric_col) if metric_col else "primary metric"
        d_lbl = _pretty_label_text(dim_col) if dim_col else "breakdown dimension"
        return (
            "Semantic intent correction (mandatory when retail wording appears):\n"
            f"- Inferred dataset domain: {domain}. Prefer operational language "
            f"({m_lbl}, {d_lbl}, incident, plant, severity) over revenue/product/region.\n"
            "- Open with a short clarification that the question wording differs from the schema, "
            "then summarize what the chart values show using the correct labels.\n"
            "- Use the authoritative chart-values block and exact calculated result; "
            "do not invent columns.\n"
        )

    return ""


def _build_unified_analysis_payload(
    *,
    question: str,
    intent_debug: Optional[Dict[str, Any]],
    chart_title: str,
    chart_type_internal: str,
    exact_result: str,
    chart_points: int,
    alignment_repaired: bool,
    analysis_row_count: int = 0,
    chart_recommendation: Optional[Dict[str, Any]] = None,
    analysis_validation: Optional[Dict[str, Any]] = None,
    partial_visualization_warning: Optional[str] = None,
    trend_request_unsatisfied: bool = False,
    growth_request_unsatisfied: bool = False,
    unsupported_growth_analysis: Optional[Dict[str, Any]] = None,
    unsupported_trend_analysis: Optional[Dict[str, Any]] = None,
    decline_request_unsatisfied: bool = False,
    unsupported_decline_analysis: Optional[Dict[str, Any]] = None,
    multi_metric_request_unsatisfied: bool = False,
    unsupported_multi_metric_analysis: Optional[Dict[str, Any]] = None,
    unsupported_requested_metric_unsatisfied: bool = False,
    unsupported_requested_metric_analysis: Optional[Dict[str, Any]] = None,
    df_for_intent: Optional[pd.DataFrame] = None,
    profile_for_intent: Optional[Dict[str, Any]] = None,
    time_series_analysis_for_intent: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    api_t = _chart_type_for_api(chart_type_internal or "bar")
    agg_label = None
    agg_key = None
    if intent_debug:
        agg_label = str(intent_debug.get("agg_label") or "").strip() or None
        agg_key = intent_debug.get("agg_key")
    m_disp = None
    c_disp = None
    if intent_debug and intent_debug.get("value_col"):
        m_disp = _metric_display_from_intent(intent_debug)
        if m_disp == "—":
            m_disp = _business_metric_series_label(
                str(intent_debug.get("agg_key") or ""),
                str(intent_debug.get("agg_label") or ""),
                str(intent_debug.get("value_col") or ""),
            )
    if intent_debug and intent_debug.get("group_col"):
        c_disp = _pretty_label_text(intent_debug.get("group_col"))

    focus_kpis = _build_focus_kpis_from_intent(intent_debug, chart_points)
    if analysis_row_count > 0:
        focus_kpis = [
            {
                "title": "Rows in analysis",
                "value": f"{int(analysis_row_count):,}",
                "subtitle": "Filtered cohort for this answer",
            },
            *focus_kpis,
        ]

    dual_compare = bool(intent_debug and intent_debug.get("dual_metric_compare"))
    compare_metrics = (
        list(intent_debug.get("compare_metrics") or [])
        if intent_debug
        else []
    )
    dual_complete = (
        dual_compare
        and len(compare_metrics) >= 2
        and bool(intent_debug.get("secondary_metric_col"))
    )
    ct_l = str(chart_type_internal or "bar").lower()
    relationship_scatter = ct_l == "scatter" or bool(
        intent_debug
        and (
            intent_debug.get("relationship_scatter")
            or intent_debug.get("correlation_only")
        )
    )
    rel_sample_n: Optional[int] = None
    if intent_debug:
        ri_dbg = intent_debug.get("relationshipInsights")
        if isinstance(ri_dbg, dict) and ri_dbg.get("sampleSize") is not None:
            try:
                rel_sample_n = int(ri_dbg["sampleSize"])
            except (TypeError, ValueError):
                rel_sample_n = None
    forecast_guardrails = None
    try:
        from intent_engine.forecast_guardrails import assess_forecast_guardrails

        forecast_guardrails = assess_forecast_guardrails(
            question,
            profile_for_intent,
            df=df_for_intent,
            time_series_analysis=time_series_analysis_for_intent,
        )
    except Exception:
        forecast_guardrails = None
    forecast_projection_low = bool(
        forecast_guardrails
        and forecast_guardrails.get("active")
        and not forecast_guardrails.get("canForecast")
    )
    forecast_can_forecast = (
        bool(forecast_guardrails.get("canForecast"))
        if isinstance(forecast_guardrails, dict) and forecast_guardrails.get("active")
        else None
    )
    rel_ins_conf = (
        intent_debug.get("relationshipInsights")
        if intent_debug and isinstance(intent_debug.get("relationshipInsights"), dict)
        else {}
    )
    correlation_qualitative_only = False
    if relationship_scatter:
        correlation_qualitative_only = bool(rel_ins_conf.get("qualitativeOnly"))
        try:
            p_val = rel_ins_conf.get("pearson")
            if p_val is not None and float(p_val) == float(p_val):
                correlation_qualitative_only = False
        except (TypeError, ValueError):
            pass
    intent_structured = bool(
        intent_debug
        and intent_debug.get("value_col")
        and intent_debug.get("group_col")
        and str(intent_debug.get("agg_key") or "").strip()
    )
    driver_analysis = False
    try:
        from intent_engine.question_patterns import question_requests_driver_intent

        driver_analysis = question_requests_driver_intent(question)
    except Exception:
        driver_analysis = False
    outlier_analysis = _question_asks_outlier_analysis(question)
    dimension_redirect_handled = bool(
        intent_debug and intent_debug.get("dimension_redirect_handled")
    )
    requested_dimension_missing = bool(
        intent_debug and intent_debug.get("requested_dimension_missing")
    )
    if relationship_scatter:
        analysis_kind = "driver" if driver_analysis else "relationship_scatter"
    elif outlier_analysis:
        analysis_kind = "outlier"
    elif dual_compare:
        analysis_kind = "compare"
    elif ct_l in ("line", "area"):
        if dimension_redirect_handled and _ranking_or_leaderboard_intent(question):
            analysis_kind = "ranking"
        else:
            analysis_kind = "trend"
    elif _ranking_or_leaderboard_intent(question):
        analysis_kind = "ranking"
    else:
        analysis_kind = "aggregation"
    unsupported_explained = bool(
        unsupported_growth_analysis and unsupported_growth_analysis.get("active")
    )
    from intent_engine.confidence_scoring import normalize_confidence_chart_type

    conf = _insight_confidence_meta(
        analysis_row_count,
        chart_points,
        dual_metric_compare=dual_compare,
        dual_metric_complete=dual_complete,
        trend_request_unsatisfied=trend_request_unsatisfied,
        growth_request_unsatisfied=growth_request_unsatisfied,
        decline_request_unsatisfied=decline_request_unsatisfied,
        multi_metric_request_unsatisfied=multi_metric_request_unsatisfied,
        relationship_scatter=relationship_scatter,
        relationship_sample_size=rel_sample_n,
        correlation_qualitative_only=correlation_qualitative_only,
        forecast_projection_low=forecast_projection_low,
        forecast_can_forecast=forecast_can_forecast,
        analysis_kind=analysis_kind,
        chart_type=normalize_confidence_chart_type(chart_type_internal or "bar"),
        intent_structured=intent_structured,
        alignment_repaired=bool(alignment_repaired),
        partial_visualization_warning=bool(partial_visualization_warning),
        dimension_redirect_handled=dimension_redirect_handled,
        requested_dimension_missing=requested_dimension_missing,
        unsupported_explained=unsupported_explained,
    )
    if driver_analysis:
        conf["driverAnalysis"] = True

    out: Dict[str, Any] = {
        "metricColumn": intent_debug.get("value_col") if intent_debug else None,
        "categoryColumn": intent_debug.get("group_col") if intent_debug else None,
        "secondaryGroupColumn": intent_debug.get("secondary_group_col")
        if intent_debug
        else None,
        "metricColumnDisplay": m_disp,
        "categoryColumnDisplay": c_disp,
        "aggregation": agg_label,
        "aggregationKey": agg_key,
        "chartType": api_t,
        "chartTypeInternal": str(chart_type_internal or "bar"),
        "chartTitle": (chart_title or "").strip(),
        "insightSummary": (exact_result or "")[:12000],
        "detectedIntent": _detect_intent_tags(question),
        "alignmentRepaired": bool(alignment_repaired),
        "chartPointCount": int(chart_points),
        "focusKpis": focus_kpis,
        **conf,
    }
    if relationship_scatter and intent_debug:
        x_col = intent_debug.get("scatter_x_column") or intent_debug.get("group_col")
        y_col = intent_debug.get("scatter_y_column") or intent_debug.get("value_col")
        if x_col and y_col:
            driver_q = False
            try:
                from intent_engine.question_patterns import question_requests_driver_intent

                driver_q = question_requests_driver_intent(question)
            except Exception:
                driver_q = False
            try:
                from intent_engine.correlation_analysis import (
                    resolve_scatter_metric_columns_for_payload,
                )

                primary, secondary = resolve_scatter_metric_columns_for_payload(
                    question,
                    str(x_col),
                    str(y_col),
                    driver=driver_q,
                    profile=profile_for_intent,
                )
            except Exception:
                primary, secondary = str(x_col), str(y_col)
            out["metricColumn"] = str(primary)
            out["secondaryMetricColumn"] = str(secondary)
            out["categoryColumn"] = str(secondary)
            out["scatterXColumn"] = str(x_col)
            out["scatterYColumn"] = str(y_col)
            if intent_debug.get("relationship_measure_label"):
                out["relationshipMeasureLabel"] = intent_debug[
                    "relationship_measure_label"
                ]
    if dual_compare:
        out["dualMetricCompare"] = True
        out["compareMetrics"] = compare_metrics
        sec_m = intent_debug.get("secondary_metric_col") if intent_debug else None
        if sec_m:
            out["secondaryMetricColumn"] = sec_m
    if chart_recommendation:
        out["chartRecommendation"] = chart_recommendation
    if analysis_validation:
        out["analysisValidation"] = analysis_validation
    if partial_visualization_warning:
        out["partialVisualizationWarning"] = partial_visualization_warning.strip()
    if dimension_redirect_handled:
        out["dimensionRedirectHandled"] = True
    if requested_dimension_missing:
        out["requestedDimensionMissing"] = True
    if unsupported_growth_analysis:
        out["unsupportedGrowthAnalysis"] = unsupported_growth_analysis
        out["growthRequestUnsatisfied"] = True
    if unsupported_trend_analysis:
        out["unsupportedTrendAnalysis"] = unsupported_trend_analysis
        out["trendRequestUnsatisfied"] = True
    if intent_debug and intent_debug.get("categoricalOutlierInsights"):
        out["categoricalOutlierInsights"] = intent_debug["categoricalOutlierInsights"]
    if intent_debug and intent_debug.get("rankedExecutiveInsights"):
        out["rankedExecutiveInsights"] = intent_debug["rankedExecutiveInsights"]
    exec_lens_out: Optional[str] = None
    if intent_debug and intent_debug.get("executive_lens"):
        exec_lens_out = str(intent_debug["executive_lens"])
    else:
        try:
            from intent_engine.executive_lens import detect_executive_lens

            exec_lens_out = detect_executive_lens(question)
        except Exception:
            exec_lens_out = None
    if exec_lens_out:
        out["executiveLens"] = exec_lens_out
    if intent_debug and intent_debug.get("executive_ambiguous_bucket"):
        out["executiveAmbiguousBucket"] = str(intent_debug["executive_ambiguous_bucket"])
        conf["executiveAmbiguousBucket"] = out["executiveAmbiguousBucket"]
    if intent_debug and isinstance(intent_debug.get("lossProfitabilityContext"), dict):
        lpc = intent_debug["lossProfitabilityContext"]
        out["lossProfitabilityContext"] = lpc
        conf["lossProfitabilityAnalysis"] = True
    if intent_debug and isinstance(intent_debug.get("executiveRiskContext"), dict):
        erc = intent_debug["executiveRiskContext"]
        out["executiveRiskContext"] = erc
        conf["executiveRiskAnalysis"] = True
    if conf.get("insightConfidenceBreakdown"):
        out["insightConfidenceBreakdown"] = conf["insightConfidenceBreakdown"]
    if forecast_guardrails and forecast_guardrails.get("active"):
        out["forecastGuardrails"] = forecast_guardrails
    if unsupported_decline_analysis:
        out["unsupportedDeclineAnalysis"] = unsupported_decline_analysis
        out["declineRequestUnsatisfied"] = True
    if unsupported_multi_metric_analysis:
        out["unsupportedMultiMetricAnalysis"] = unsupported_multi_metric_analysis
        out["multiMetricRequestUnsatisfied"] = True
    if unsupported_requested_metric_analysis:
        out["unsupportedRequestedMetricAnalysis"] = unsupported_requested_metric_analysis
        out["unsupportedRequestedMetric"] = True
    if unsupported_requested_metric_unsatisfied:
        out["requestedMetricUnsatisfied"] = True
        out["metricColumn"] = None
        out["metricColumnDisplay"] = None
        out["categoryColumn"] = None
        out["categoryColumnDisplay"] = None
    if intent_debug and intent_debug.get("derived_profit_margin"):
        out["derivedProfitMargin"] = True
    elif _question_requests_profit_margin(question) and not (
        intent_debug and intent_debug.get("derived_profit_margin")
    ):
        out["profitMarginUnavailable"] = True
    try:
        from intent_engine.attach import enrich_analysis_with_intent

        enrich_analysis_with_intent(
            out,
            question=question,
            df=df_for_intent,
            profile=profile_for_intent,
            intent_debug=intent_debug,
            chart_type_internal=str(chart_type_internal or "bar"),
            chart_points=int(chart_points),
            time_series_analysis=time_series_analysis_for_intent,
            unsupported_growth_analysis=unsupported_growth_analysis,
        )
    except Exception as _ie_exc:
        print(
            "[intent_engine] attach skipped:",
            type(_ie_exc).__name__,
            str(_ie_exc)[:300],
            flush=True,
        )
    return out


# Strong signals: meaningful without prior context (used to reject when no snapshot).
_FOLLOW_UP_STANDALONE = re.compile(
    r"(?:^|\b)(?:why|explain)\b|"
    r"^\s*(?:show\s+)?(?:only\s+)?top\s+\d{1,2}\b|"
    r"^\s*(?:show\s+)?(?:only\s+)?top\s+(?:three|four|five|six|seven|eight|nine|ten)\b|"
    r"^\s*(?:show\s+)?bottom\s+\d{1,2}\b|"
    r"^\s*(?:show\s+)?bottom\s+(?:three|four|five|ten)\b|"
    r"convert(?:\s+to)?|show\s+as|as\s+a\s+(?:pie|line|bar|donut|area)\b|"
    r"(?:pie|line|bar|donut|area)\s+chart\b|"
    r"sort\s+(?:ascending|descending|desc|asc)\b",
    re.I,
)

# Extra tokens when prior analysis exists (continuation / refinement).
_FOLLOW_UP_WITH_PRIOR = re.compile(
    r"\bnow\s+show\b|\bonly\b|\bfilters?\b|"
    r"\btop\s+\d{1,2}\b|\btop\s+(?:three|four|five|six|seven|eight|nine|ten)\b|"
    r"\bbottom\s+\d{1,2}\b|\bbottom\s+(?:three|four|five|ten)\b|"
    r"convert(?:\s+to)?|show\s+as|as\s+a\s+(?:pie|line|bar|donut|area)\b|"
    r"(?:pie|line|bar|donut|area)\s+chart\b|"
    r"sort\s+(?:ascending|descending|desc|asc)\b|"
    r"(?:^|\b)(?:why|explain)\b",
    re.I,
)

# Meta / advisory follow-ups: keep prior pandas scope; answer references prior analysis.
_THREAD_META_FOLLOW_UP = re.compile(
    r"\b("
    r"what\s+should\s+we\s+(?:check|do|look|analyze|explore)|"
    r"what\s+else\s+(?:should\s+we\s+)?(?:check|do|look|try|explore)|"
    r"what\s+to\s+(?:check|do|look\s+at)\s+next|"
    r"what\s+do\s+you\s+recommend|"
    r"where\s+should\s+we\s+(?:look|focus|dig)|"
    r"next\s+steps?|"
    r"anything\s+else\s+to\s+(?:check|try|look\s+at)|"
    r"(?:go|dig)\s+deeper|"
    r"how\s+should\s+we\s+proceed|"
    r"what\s+are\s+the\s+next\s+steps|"
    r"what\s+evidence\s+supports|"
    r"what\s+caution\s+applies(?:\s+to\s+causation)?|"
    r"\bcausation\b|"
    r"(?:does|did)\s+(?:that|this|it)\s+cause|"
    r"is\s+(?:that|this|it)\s+driving|"
    r"which\s+columns?\s+(?:were\s+)?(?:used|involved)|"
    r"show\s+the\s+calculations?\s+behind|"
    r"how\s+(?:was|were)\s+(?:this|these)\s+(?:calculated|computed)|"
    r"what\s+columns?\s+(?:did\s+you\s+use|were\s+used)|"
    r"this\s+(?:answer|conclusion|analysis|result)\b"
    r")\b",
    re.I,
)


def _looks_like_follow_up_question(q: str, *, has_prior: bool) -> bool:
    s = (q or "").strip()
    if not s:
        return False
    if has_prior:
        if _FOLLOW_UP_WITH_PRIOR.search(s):
            return True
        if _THREAD_META_FOLLOW_UP.search(s):
            return True
    else:
        if _FOLLOW_UP_STANDALONE.search(s):
            return True
    if len(s) <= 36 and re.match(r"^\s*(why|explain)\s*\??\s*$", s, re.I):
        return True
    return False


def _is_thread_meta_follow_up(q: str) -> bool:
    s = (q or "").strip()
    if not s:
        return False
    return bool(_THREAD_META_FOLLOW_UP.search(s))


def _is_explanation_follow_up(q: str) -> bool:
    s = (q or "").strip()
    if not s:
        return False
    if len(s) <= 48 and re.match(
        r"^\s*(why|explain)(\s+that|\s+this|\s+it)?\s*\??\s*$", s, re.I
    ):
        return True
    if len(s) > 120:
        return False
    if re.search(
        r"\bwhy\s+is\b.+\b(highest|lowest|top|leading|largest|best|worst|most)\b",
        s,
        re.I,
    ):
        return True
    if re.search(r"\bwhat\s+explains\b.+\b(highest|lowest|being)\b", s, re.I):
        return True
    return False


def _scoped_follow_up_question(q: str) -> bool:
    """Follow-ups that reuse prior analysis scope without concatenating a new intent."""
    return _is_explanation_follow_up(q) or _is_thread_meta_follow_up(q)


def _parse_forced_chart_mutation(q: str) -> Optional[str]:
    ql = (q or "").lower()
    if "donut" in ql:
        return "donut"
    if "pie" in ql:
        return "pie"
    if "area" in ql:
        return "area"
    if "line" in ql:
        return "line"
    if "horizontal" in ql and "bar" in ql:
        return "bar_horizontal"
    if re.search(r"\bbar\s+chart\b", ql) or (
        "bar" in ql and "horizontal" not in ql and "chart" in ql
    ):
        return "bar"
    if re.search(r"\bbar\b", ql) and "horizontal" not in ql:
        return "bar"
    return None


def _parse_sort_direction_follow_up(q: str) -> Optional[bool]:
    """True = descending by value, False = ascending, None = no sort instruction."""
    ql = (q or "").lower()
    if re.search(r"sort\s+(descending|desc)\b", ql):
        return True
    if re.search(r"sort\s+(ascending|asc)\b", ql):
        return False
    return None


def _attach_conversation_followup_payload(
    analysis_ctx: Dict[str, Any],
    sidecar: Optional[Dict[str, Any]],
) -> Dict[str, Any]:
    if not sidecar:
        return analysis_ctx
    out = dict(analysis_ctx)
    out["conversationFollowUp"] = sidecar
    return out


def _apply_follow_up_post_process_chart(
    chart_data: List[Dict[str, Any]],
    chart_type: str,
    ops: Optional[Dict[str, Any]],
) -> Tuple[List[Dict[str, Any]], str]:
    if not chart_data or not ops:
        return chart_data, chart_type
    if str(chart_type or "").strip() == "scatter":
        return chart_data, chart_type
    ct = str(chart_type or "bar").strip()
    fc = ops.get("forced_chart_internal")
    if isinstance(fc, str) and fc.strip():
        ct = fc.strip()
    rows: List[Dict[str, Any]] = []
    for r in chart_data:
        if not isinstance(r, dict):
            continue
        rows.append(dict(r))
    if not rows:
        return chart_data, ct
    sd = ops.get("sort_desc")
    if sd is True:
        rows.sort(key=lambda x: float(x.get("value", 0)), reverse=True)
    elif sd is False:
        rows.sort(key=lambda x: float(x.get("value", 0)))
    st = ops.get("slice_top")
    sb = ops.get("slice_bottom")
    if isinstance(st, int) and st > 0:
        rows = rows[: min(st, len(rows))]
    elif isinstance(sb, int) and sb > 0:
        rows.sort(key=lambda x: float(x.get("value", 0)))
        rows = rows[: min(sb, len(rows))]
    return rows, ct


def _try_build_follow_up_filtered_df(
    base_df: pd.DataFrame,
    profile: Dict[str, Any],
    ctx: Optional[ConversationContextPayload],
    follow_q: str,
) -> Tuple[pd.DataFrame, List[str]]:
    """
    Deterministic row filters parsed from the follow-up text only.
    Returns (filtered_df, human-readable filter labels).
    """
    labels: List[str] = []
    out = base_df
    q = (follow_q or "").strip()
    if not q:
        return out, labels
    ql = q.lower()
    ct = profile.get("column_types", {}) or {}
    cols = out.columns.tolist()

    def _norm_series(col: str) -> pd.Series:
        return out[col].astype(str).str.strip().str.lower()

    # --- (now) show only A and B ... (multiple category values on prior dimension) ---
    m_only_tail = re.search(
        r"(?:^|\b)(?:now\s+)?(?:show\s+)?only\s+(.+?)\s*$",
        q.strip(),
        re.I | re.S,
    )
    if m_only_tail and ctx and ctx.categoryColumn:
        phrase_full = m_only_tail.group(1).strip().strip('"').strip("'")
        phrases = [
            p.strip().strip('"').strip("'")
            for p in re.split(r"\s+and\s+|,\s*", phrase_full)
            if p.strip()
        ]
        cc = str(ctx.categoryColumn)
        if cc in out.columns and len(phrases) >= 2:
            try:
                combined: Optional[pd.Series] = None
                for ph in phrases:
                    sub = _norm_series(cc).str.contains(re.escape(ph.lower()), na=False)
                    combined = sub if combined is None else (combined | sub)
                if combined is not None:
                    n0 = len(out)
                    out = out.loc[combined].copy()
                    labels.append(
                        f"Only {cc} in [{', '.join(phrases)}] ({n0} → {len(out)})"
                    )
                    return out, labels
            except Exception:
                pass

    # --- only <phrase> ---
    m_only = re.search(
        r"\bonly\s+(?:the\s+)?(.+?)(?:\s+employees)?(?:\s+staff)?$",
        q,
        re.I,
    )
    if m_only:
        phrase = m_only.group(1).strip().strip('"').strip("'")
        phrase_l = phrase.lower()
        target_col = None
        if ctx and ctx.categoryColumn and str(ctx.categoryColumn) in out.columns:
            cc = str(ctx.categoryColumn)
            try:
                if out[cc].astype(str).str.lower().str.contains(re.escape(phrase_l), na=False).any():
                    target_col = cc
            except Exception:
                pass
        if target_col is None:
            hints = [
                "location",
                "city",
                "region",
                "state",
                "department",
                "dept",
                "team",
                "office",
                "country",
            ]
            for c in cols:
                cn = str(c).lower().replace(" ", "_")
                if ct.get(c) in ("text", "category") and any(h in cn for h in hints):
                        try:
                            if _norm_series(c).str.contains(re.escape(phrase_l), na=False).any():
                                target_col = c
                                break
                        except Exception:
                            continue
        if target_col is None:
            for c in cols:
                if c == (ctx.categoryColumn if ctx else None):
                    continue
                try:
                    if _norm_series(c).str.contains(re.escape(phrase_l), na=False).any():
                        target_col = c
                        break
                except Exception:
                    continue
        if target_col:
            try:
                mask = _norm_series(target_col).str.contains(re.escape(phrase_l), na=False)
                n0 = len(out)
                out = out.loc[mask].copy()
                labels.append(f"Only rows where {target_col} matches “{phrase}” ({n0} → {len(out)})")
            except Exception:
                pass

    # --- <col> above / below <num> ---
    m_cmp = re.search(
        r"\b([a-z0-9][a-z0-9_\s]{0,40}?)\s+(above|over|greater\s+than|>|below|under|less\s+than|<)\s*([\d,]+(?:\.\d+)?)",
        ql,
        re.I,
    )
    if m_cmp:
        col_hint = m_cmp.group(1).strip().replace(" ", "_")
        opw = m_cmp.group(2).lower()
        try:
            threshold = float(str(m_cmp.group(3)).replace(",", ""))
        except (TypeError, ValueError):
            threshold = float("nan")
        if threshold == threshold:
            ncol = None
            if ctx and ctx.metricColumn and str(ctx.metricColumn) in out.columns:
                if col_hint in str(ctx.metricColumn).lower().replace(" ", "_"):
                    ncol = str(ctx.metricColumn)
            if ncol is None:
                ncol = _match_column_from_phrase(col_hint.replace("_", " "), cols, profile)
            if ncol and ncol in out.columns and ct.get(ncol) == "number":
                vs = pd.to_numeric(
                    out[ncol]
                    .astype(str)
                    .str.replace(",", "", regex=False)
                    .str.replace("₹", "", regex=False)
                    .str.replace("$", "", regex=False),
                    errors="coerce",
                )
                if opw in ("above", "over", "greater than", ">"):
                    mask = vs > threshold
                    lab = f"{ncol} above {threshold:g}"
                else:
                    mask = vs < threshold
                    lab = f"{ncol} below {threshold:g}"
                n0 = len(out)
                out = out.loc[mask].copy()
                labels.append(f"{lab} ({n0} → {len(out)})")

    return out, labels


def _looks_like_new_root_analysis(q: str) -> bool:
    """Compare / trend / relationship questions must not inherit prior thread scope."""
    s = (q or "").strip()
    if not s:
        return False
    return bool(
        re.search(
            r"\bcompare\b|"
            r"\b(correlat|correlation|relationship)\b|"
            r"\bversus\b|\bvs\.?\b|"
            r"\b(trend\b|over time|growth rate|seasonal|forecast)\b|"
            r"\b(distribution|histogram|spread|frequency)\b",
            s,
            re.I,
        )
    )


def resolve_follow_up_turn(
    raw_question: str,
    ctx: Optional[ConversationContextPayload],
    *,
    continuation_intent: bool = False,
    parent_ctx: Optional[ParentAnalysisContextPayload] = None,
) -> Dict[str, Any]:
    """
    Deterministic follow-up routing. Returns keys used by /ask:
    blocked, blocked_message, effective_question, follow_up_ops,
    conversation_sidecar (for analysis + UI), filtered_df, filter_labels
    """
    rq = (raw_question or "").strip()
    out: Dict[str, Any] = {
        "blocked": False,
        "blocked_message": "",
        "effective_question": rq,
        "follow_up_ops": None,
        "conversation_sidecar": None,
        "filtered_df": None,
        "filter_labels": [],
        "ai_context_block": "",
    }
    if not rq:
        return out

    prior = (ctx.lastQuestion or "").strip() if ctx else ""
    if not prior and parent_ctx:
        prior = (parent_ctx.priorQuestion or parent_ctx.rootQuestion or "").strip()

    if not continuation_intent and _looks_like_new_root_analysis(rq):
        return out

    is_follow = bool(continuation_intent and prior)
    if not is_follow:
        is_follow = _looks_like_follow_up_question(rq, has_prior=bool(prior))

    if is_follow and not prior:
        out["blocked"] = True
        out["blocked_message"] = (
            "Please ask an initial analysis question first."
        )
        return out

    if not is_follow:
        return out

    if not ctx and not parent_ctx:
        return out

    root_q = (
        (ctx.rootQuestion or "").strip()
        if ctx and (ctx.rootQuestion or "").strip()
        else (parent_ctx.rootQuestion or "").strip()
        if parent_ctx and (parent_ctx.rootQuestion or "").strip()
        else prior
    )
    scope_q = root_q or prior

    explanation = _is_explanation_follow_up(rq)
    thread_meta = _is_thread_meta_follow_up(rq)
    scoped = explanation or thread_meta
    if scoped:
        eff = scope_q
    else:
        eff = f"{prior} {rq}".strip()

    out["effective_question"] = eff

    prev_summary = (ctx.lastChartTitle or "").strip() if ctx else ""
    if not prev_summary and parent_ctx:
        prev_summary = (parent_ctx.chartTitle or scope_q or "")[:120]
    if not prev_summary:
        prev_summary = scope_q[:120]

    applied_bits: List[str] = []
    if explanation:
        applied_bits.append("Explain / why (same calculation as previous question)")
    elif thread_meta:
        applied_bits.append(
            "Thread guidance (same prior analysis scope; answer references prior results)"
        )
    else:
        applied_bits.append(f"Continued from previous question ({rq})")

    narrow_ok = not explanation and not thread_meta
    fchart = _parse_forced_chart_mutation(rq)
    sortd = _parse_sort_direction_follow_up(rq) if narrow_ok else None
    stn = _extract_top_n(rq.lower()) if narrow_ok else None
    sbn = _extract_bottom_n(rq.lower()) if narrow_ok else None

    ops: Dict[str, Any] = {}
    if fchart:
        ops["forced_chart_internal"] = fchart
        applied_bits.append(f"Chart preference: {fchart}")
    if sortd is not None:
        ops["sort_desc"] = sortd
        applied_bits.append("Sort: " + ("descending" if sortd else "ascending"))
    if stn:
        ops["slice_top"] = int(stn)
        applied_bits.append(f"Top {stn}")
    if sbn:
        ops["slice_bottom"] = int(sbn)
        applied_bits.append(f"Bottom {sbn}")

    if ops:
        out["follow_up_ops"] = ops

    follow_line = " · ".join(applied_bits)
    ctx_used = (
        f"Previous analysis: {prev_summary}\nFollow-up applied: {follow_line}"
    )

    def _clip(s: Optional[str], n: int) -> str:
        t = (s or "").strip()
        if not t:
            return "—"
        return t if len(t) <= n else t[: n - 1] + "…"

    labs = (
        [x for x in (ctx.lastChartLabelSample or []) if str(x).strip()][:12]
        if ctx
        else []
    )
    lab_line = ", ".join(str(x).strip() for x in labs) if labs else "—"
    cmap = dict(ctx.columnMapping or {}) if ctx else {}
    if parent_ctx:
        if parent_ctx.metricColumn and not cmap.get("sales"):
            cmap.setdefault("sales", parent_ctx.metricColumn)
        if parent_ctx.categoryColumn and not cmap.get("region"):
            cmap.setdefault("region", parent_ctx.categoryColumn)
    cmap_lines = "\n".join(
        f"  - {k}: {v}" for k, v in sorted(cmap.items()) if str(v).strip()
    )
    dash_chip = ctx.activeDashboardFilters if ctx else []
    dash_lines = "\n".join(f"  - {ln}" for ln in dash_chip if str(ln).strip())
    prev_ans = _clip(
        (ctx.lastAiAnswer if ctx else None)
        or (parent_ctx.lastAiAnswer if parent_ctx else None),
        3600,
    )
    metric_col = (
        (ctx.metricColumn if ctx else None)
        or (parent_ctx.metricColumn if parent_ctx else None)
        or "—"
    )
    cat_col = (
        (ctx.categoryColumn if ctx else None)
        or (parent_ctx.categoryColumn if parent_ctx else None)
        or "—"
    )
    agg_val = (
        (ctx.aggregation if ctx else None)
        or (parent_ctx.aggregation if parent_ctx else None)
        or "—"
    )
    chart_type_val = (
        (ctx.chartType if ctx else None)
        or (parent_ctx.chartType if parent_ctx else None)
        or "—"
    )
    chain = list(ctx.followUpChain or []) if ctx else []
    if not chain and parent_ctx and parent_ctx.followUpChain:
        chain = list(parent_ctx.followUpChain)

    ai_block = (
        "Conversation Context\n"
        "(Follow-up turn — keep reasoning aligned with this thread. "
        "The user's latest message may be short; infer missing subjects from the prior turn.)\n"
        f"- Latest user message: {rq}\n"
        f"- Root question (analysis scope): {scope_q}\n"
        f"- Previous question: {prior}\n"
        f"- Follow-up chain: {', '.join(chain) if chain else '—'}\n"
        f"- Previous chart title: {(ctx.lastChartTitle if ctx else None) or (parent_ctx.chartTitle if parent_ctx else None) or '—'}\n"
        f"- Previous chart subtitle: {(ctx.lastChartSubtitle if ctx else None) or '—'}\n"
        f"- Sample category labels (prior chart): {lab_line}\n"
        f"- Prior chart type: {chart_type_val}\n"
        f"- Metric column (prior focus): {metric_col}\n"
        f"- Category / grouping column (prior): {cat_col}\n"
        f"- Aggregation (prior): {agg_val}\n"
        f"- Dataset domain hint: {(ctx.datasetDomain if ctx else None) or '—'}\n"
    )
    if parent_ctx and (parent_ctx.metricColumnDisplay or parent_ctx.categoryColumnDisplay):
        ai_block += (
            "- Resolved labels (prior): "
            f"metric={parent_ctx.metricColumnDisplay or metric_col}, "
            f"dimension={parent_ctx.categoryColumnDisplay or cat_col}\n"
        )
    if cmap_lines.strip():
        ai_block += "- Column mapping (semantic role → column):\n" + cmap_lines + "\n"
    if dash_lines.strip():
        ai_block += "- Active dashboard filters (this request):\n" + dash_lines + "\n"
    if ctx and ctx.filtersApplied:
        ai_block += "- Row-scope notes from prior turns:\n" + "\n".join(
            f"  - {ln}" for ln in ctx.filtersApplied if str(ln).strip()
        ) + "\n"
    ai_block += (
        "- Previous AI answer (excerpt; cite chart numbers from the authoritative block, "
        "not from memory if they differ):\n"
        f"{prev_ans}\n"
    )
    if thread_meta and re.search(r"columns?\s+(?:were\s+)?used", rq, re.I):
        ai_block += (
            "\nThread meta (columns): Answer briefly. List metric column, breakdown "
            "column, and aggregation from the prior analysis above. Open with "
            '"For the prior chart, the calculation used …". Do not invent columns.\n'
        )
    if thread_meta and re.search(
        r"show\s+(?:the\s+)?calculations?\s+behind|how\s+(?:was|were)\s+(?:this|these)\s+(?:calculated|computed)",
        rq,
        re.I,
    ):
        ai_block += (
            "\nThread meta (calculations): State metric, dimension, aggregation, and "
            "top result from the prior chart. Open with "
            '"Based on the previous result, the calculation used …".\n'
        )
    out["ai_context_block"] = ai_block
    out["conversation_sidecar"] = {
        "wasFollowUp": True,
        "previousAnalysisSummary": prev_summary,
        "followUpApplied": follow_line,
        "contextUsedLine": ctx_used,
        "originalFollowUp": rq,
        "rootQuestion": scope_q,
    }
    out["scope_question"] = scope_q
    out["scoped_follow_up"] = scoped
    return out


def compute_visualization_for_question(
    question: str,
    conversation_sidecar: Optional[Dict[str, Any]] = None,
    follow_up_ops: Optional[Dict[str, Any]] = None,
) -> Tuple[str, Optional[Dict[str, Any]], Dict[str, Any]]:
    """
    Structured visualization pipeline: pandas/analysis only (never parse AI prose).
    Returns (exact_numeric_context_for_ai, visualization_or_none, unified_analysis_context).
    """
    global df

    def fin(ac: Dict[str, Any]) -> Dict[str, Any]:
        return _attach_conversation_followup_payload(ac, conversation_sidecar)

    if df is None:
        return (
            "No dataset uploaded.",
            None,
            fin(
                _build_unified_analysis_payload(
                    question=question,
                    intent_debug=None,
                    chart_title="",
                    chart_type_internal="bar",
                    exact_result="No dataset uploaded.",
                    chart_points=0,
                    alignment_repaired=False,
                    analysis_row_count=0,
                )
            ),
        )

    analysis_row_count = int(len(df))
    profile_live = dataset_profile or build_profile(df)
    ql = question.lower().strip()

    cohort_df = df
    entity_filter_meta: Optional[Dict[str, str]] = None
    entity_explain_peer_compare = False
    dimension_value_compare: Optional[Dict[str, Any]] = None
    try:
        from intent_engine.dimension_request import (
            find_categorical_entity_filter,
            find_dimension_value_compare,
            question_requests_entity_performance_explanation,
            resolve_entity_explain_chart_plan,
        )

        dimension_value_compare = find_dimension_value_compare(
            question, df, profile_live
        )
        if dimension_value_compare:
            gcol = str(dimension_value_compare["group_col"])
            values = [str(v) for v in dimension_value_compare.get("values") or []]
            if gcol in df.columns and values:
                sub = df[
                    df[gcol].astype(str).str.strip().isin(values)
                ]
                if not sub.empty:
                    cohort_df = sub
                    analysis_row_count = int(len(cohort_df))
                    entity_filter_meta = {
                        "column": gcol,
                        "value": " vs ".join(values),
                        "mode": "value_compare",
                    }
    except Exception:
        pass
    try:
        from intent_engine.dimension_request import (
            find_categorical_entity_filter,
            question_requests_entity_performance_explanation,
            resolve_entity_explain_chart_plan,
        )

        if question_requests_entity_performance_explanation(question):
            entity_hit = find_categorical_entity_filter(question, df, profile_live)
            if entity_hit:
                fcol, fval = entity_hit
                plan = resolve_entity_explain_chart_plan(
                    str(fcol), str(fval), df, profile_live
                )
                entity_filter_meta = {
                    "column": str(fcol),
                    "value": str(fval),
                    "mode": str(plan.get("mode") or "cohort_breakdown"),
                }
                if plan.get("mode") == "peer_compare" and plan.get("use_full_cohort"):
                    entity_explain_peer_compare = True
                    analysis_row_count = int(len(df))
                else:
                    sub = df[df[fcol].astype(str).str.strip() == fval]
                    if not sub.empty:
                        cohort_df = sub
                        analysis_row_count = int(len(cohort_df))
    except Exception:
        pass

    correlation_routing_locked = _question_requests_correlation_routing(question)

    intent_debug = _describe_aggregate_intent(question, cohort_df, profile_live)
    if dimension_value_compare and intent_debug:
        intent_debug["group_col"] = str(dimension_value_compare["group_col"])
        intent_debug["dimension_value_compare"] = True
        intent_debug.pop("secondary_group_col", None)
    if entity_filter_meta and intent_debug:
        intent_debug["entity_filter_column"] = entity_filter_meta["column"]
        intent_debug["entity_filter_value"] = entity_filter_meta["value"]
        intent_debug["entity_explain_mode"] = entity_filter_meta.get(
            "mode", "cohort_breakdown"
        )
        try:
            from intent_engine.dimension_request import (
                pick_entity_cohort_breakdown_column,
                question_requests_entity_performance_explanation,
                resolve_entity_explain_chart_plan,
            )

            if question_requests_entity_performance_explanation(question):
                if entity_explain_peer_compare:
                    intent_debug["group_col"] = entity_filter_meta["column"]
                else:
                    breakdown = pick_entity_cohort_breakdown_column(
                        cohort_df,
                        profile_live,
                        exclude_columns=[entity_filter_meta["column"]],
                    )
                    if breakdown:
                        intent_debug["group_col"] = breakdown
        except Exception:
            pass
    metric_spec_live = _resolve_question_metric_spec(question, cohort_df, profile_live)
    if metric_spec_live and intent_debug:
        _apply_metric_spec_to_intent(intent_debug, metric_spec_live)

    if intent_debug:
        try:
            from intent_engine.executive_ambiguous_intent import (
                apply_executive_ambiguous_routing,
            )

            apply_executive_ambiguous_routing(
                question, cohort_df, profile_live, intent_debug
            )
        except Exception:
            pass
        try:
            from intent_engine.executive_metric_resolve import (
                apply_executive_metric_to_intent,
            )

            apply_executive_metric_to_intent(
                question, cohort_df, profile_live, intent_debug
            )
        except Exception:
            pass

    original_df = df
    if entity_filter_meta is not None and not entity_explain_peer_compare:
        df = cohort_df

    try:
        exact_result, visualization, analysis_ctx = (
            _compute_visualization_for_question_body(
            question=question,
            conversation_sidecar=conversation_sidecar,
            follow_up_ops=follow_up_ops,
            fin=fin,
            profile_live=profile_live,
            ql=ql,
            analysis_row_count=analysis_row_count,
            intent_debug=intent_debug,
            metric_spec_live=metric_spec_live,
            correlation_routing_locked=correlation_routing_locked,
            )
        )

        # When the question references a specific categorical entity (e.g. city= Mumbai),
        # keep chart titles aligned with that cohort context. This avoids generic
        # "Total X by Y" titles when the chart is actually filtered to the entity.
        if (
            entity_filter_meta
            and isinstance(visualization, dict)
            and str(entity_filter_meta.get("value") or "").strip()
            and entity_filter_meta.get("mode") != "peer_compare"
        ):
            entity_val = str(entity_filter_meta.get("value") or "").strip()
            title = str(visualization.get("title") or "").strip()
            if title and entity_val.lower() not in title.lower():
                stripped = re.sub(
                    r"^(total|average|avg|mean|minimum|min|max|maximum)\s+",
                    "",
                    title,
                    flags=re.I,
                ).strip()
                if stripped:
                    visualization["title"] = f"{entity_val} {stripped}".strip()

        if isinstance(analysis_ctx, dict) and isinstance(visualization, dict):
            viz_title = str(visualization.get("title") or "").strip()
            if viz_title:
                analysis_ctx["chartTitle"] = viz_title
            if entity_filter_meta:
                analysis_ctx["entityFilterColumn"] = entity_filter_meta.get("column")
                analysis_ctx["entityFilterValue"] = entity_filter_meta.get("value")
                if entity_filter_meta.get("mode"):
                    analysis_ctx["entityExplainMode"] = entity_filter_meta.get("mode")

        return exact_result, visualization, analysis_ctx
    finally:
        df = original_df


def _compute_visualization_for_question_body(
    *,
    question: str,
    conversation_sidecar: Optional[Dict[str, Any]],
    follow_up_ops: Optional[Dict[str, Any]],
    fin,
    profile_live: Dict[str, Any],
    ql: str,
    analysis_row_count: int,
    intent_debug: Optional[Dict[str, Any]],
    metric_spec_live: Optional[Dict[str, Any]],
    correlation_routing_locked: bool,
) -> Tuple[str, Optional[Dict[str, Any]], Dict[str, Any]]:
    global df

    partial_visualization_warning: Optional[str] = None
    suppress_auto_charts = False
    used_two_dim_stacked = False
    partial_alignment = False
    chart_suppressed_misleading = False
    unsupported_decline: Optional[Dict[str, Any]] = None
    decline_request_unsatisfied = False
    unsupported_multi_metric: Optional[Dict[str, Any]] = None
    multi_metric_request_unsatisfied = False

    unsupported_multi_metric = _assess_unsupported_multi_metric_analysis(
        question=question,
        df=df,
        profile=profile_live,
    )
    multi_metric_request_unsatisfied = bool(unsupported_multi_metric)
    if unsupported_multi_metric and unsupported_multi_metric.get("active"):
        suppress_auto_charts = True
        chart_suppressed_misleading = True
        partial_visualization_warning = (
            str(unsupported_multi_metric.get("leadSentence") or "").strip()
            or "Required metric column missing — comparison chart suppressed."
        )

    unsupported_requested_metric_routing: Optional[Dict[str, Any]] = None
    unsupported_requested_metric_unsatisfied = False
    try:
        from intent_engine.narrative_guardrails import (
            assess_unsupported_requested_metric,
            build_unsupported_requested_metric_exact_context,
        )

        unsupported_requested_metric_routing = assess_unsupported_requested_metric(
            question=question,
            df=df,
            profile=profile_live,
            analysis_ctx=intent_debug,
        )
    except Exception:
        unsupported_requested_metric_routing = None
    unsupported_requested_metric_unsatisfied = bool(
        unsupported_requested_metric_routing
        and unsupported_requested_metric_routing.get("active")
    )
    exact_result = ""
    chart_data: List[Any] = []
    chart_type = ""
    chart_title = ""
    chart_subtitle = "Generated from AI analysis"
    chart_path_handled = False

    if unsupported_requested_metric_unsatisfied:
        suppress_auto_charts = True
        chart_suppressed_misleading = True
        partial_visualization_warning = (
            str(unsupported_requested_metric_routing.get("leadSentence") or "").strip()
            or "Requested metric not available in this dataset."
        )
        exact_result = build_unsupported_requested_metric_exact_context(
            unsupported_requested_metric_routing
        )
        chart_data = []
        chart_type = ""
        chart_title = ""
        chart_path_handled = True
        if intent_debug is None:
            intent_debug = {}
        intent_debug["unsupported_requested_metric"] = True
        intent_debug["normalized_question"] = ql

    fallback_used = False
    smart_trace: Dict[str, Any] = {}
    smart_routing_used = False
    alignment_repaired = False

    if not chart_path_handled and _question_requests_correlation_routing(question):
        exact_result, chart_data, chart_type, chart_title, intent_debug, smart_trace = (
            _try_correlation_routing_pack(question, df, profile_live)
        )
        chart_data = list(_normalize_chart_records(chart_data))
        smart_routing_used = True
        chart_path_handled = True
        if intent_debug and intent_debug.get("correlation_routing_failed"):
            suppress_auto_charts = True
            chart_suppressed_misleading = True
            partial_visualization_warning = (
                str(chart_title or "").strip()
                or "Required columns not found for this correlation question."
            )

    if correlation_routing_locked:
        suppress_auto_charts = True
        if smart_trace is not None:
            smart_trace = dict(smart_trace)
            smart_trace["correlationRoutingLocked"] = True
            smart_trace["routing"] = smart_trace.get("routing") or "correlation_pack"

    sec_dim = (intent_debug or {}).get("secondary_group_col")
    pri_dim = (intent_debug or {}).get("group_col")
    agg_key_here = str((intent_debug or {}).get("agg_key") or "")

    dual_compare_spec = (
        None
        if correlation_routing_locked
        else _resolve_two_metric_compare_spec(question, df, profile_live)
    )
    if dual_compare_spec:
        gt_dual = _try_build_grouped_two_metric_chart(
            df,
            profile_live,
            str(dual_compare_spec["group_col"]),
            str(dual_compare_spec["metric_a"]),
            str(dual_compare_spec["metric_b"]),
            str(dual_compare_spec.get("agg_key") or "sum"),
        )
        if gt_dual:
            exact_result, raw_rows, chart_title, meta_group = gt_dual
            chart_data = list(_normalize_chart_records(raw_rows))
            chart_type = "bar"
            chart_path_handled = True
            used_two_dim_stacked = True
            intent_debug = {
                "group_col": dual_compare_spec["group_col"],
                "value_col": dual_compare_spec["metric_a"],
                "secondary_metric_col": dual_compare_spec["metric_b"],
                "compare_metrics": [
                    dual_compare_spec["metric_a"],
                    dual_compare_spec["metric_b"],
                ],
                "dual_metric_compare": True,
                "agg_label": dual_compare_spec["agg_label"],
                "agg_key": dual_compare_spec["agg_key"],
                "metricColumnDisplay": dual_compare_spec["metric_display"],
                "normalized_question": ql,
            }
            smart_trace = {
                "category_column": dual_compare_spec["group_col"],
                "numeric_column": dual_compare_spec["metric_a"],
                "secondary_numeric_column": dual_compare_spec["metric_b"],
                "aggregation": str(dual_compare_spec.get("agg_label", "")).lower(),
                "aggregation_key": dual_compare_spec.get("agg_key"),
                "rows_analyzed": int(len(df)),
                "notes": (
                    "Grouped comparison: two metrics side-by-side within each category."
                ),
                "multi_series": True,
                "multi_series_meta": meta_group,
            }

    if (
        not correlation_routing_locked
        and not chart_path_handled
        and intent_debug
        and sec_dim
        and pri_dim
        and str(sec_dim) != str(pri_dim)
    ):
        if agg_key_here == "count":
            st_try = _try_build_stacked_two_category_chart(
                df,
                profile_live,
                str(pri_dim),
                str(sec_dim),
                "count",
                intent_debug.get("value_col"),
            )
            if st_try:
                exact_result, raw_rows, chart_title, meta_stack = st_try
                chart_data = list(_normalize_chart_records(raw_rows))
                chart_type = "bar"
                used_two_dim_stacked = True
                chart_path_handled = True
                smart_trace = {
                    "category_column": str(pri_dim),
                    "numeric_column": intent_debug.get("value_col"),
                    "aggregation": str(intent_debug.get("agg_label", "")).lower(),
                    "aggregation_key": intent_debug.get("agg_key"),
                    "rows_analyzed": int(len(df)),
                    "notes": intent_debug.get("dimension_notes"),
                    "multi_series": True,
                    "multi_series_meta": meta_stack,
                    "secondary_column": str(sec_dim),
                }
            else:
                intent_one = dict(intent_debug)
                intent_one["secondary_group_col"] = None
                fb_rows, fb_type, fb_title, _fb_ts = _fallback_aggregate_chart(intent_one, question)
                er_ana, _, _ = analyze_data(question)
                if fb_rows:
                    chart_data = list(_normalize_chart_records(fb_rows))
                    chart_type = (fb_type or "bar").strip() or "bar"
                    chart_title = (fb_title or "").strip()
                    fallback_used = True
                    partial_alignment = True
                    partial_visualization_warning = (
                        "Visualization partially answers the question."
                    )
                    tab = _tabular_exact_from_name_value_rows(
                        [
                            {"name": r.get("name"), "value": r.get("value")}
                            for r in chart_data
                        ]
                    )
                    exact_result = "\n\n".join(
                        x for x in (tab, (er_ana or "").strip()) if x
                    )
                    chart_path_handled = True
                else:
                    suppress_auto_charts = True
                    chart_suppressed_misleading = True
                    chart_data = []
                    chart_type = ""
                    partial_visualization_warning = (
                        "Advanced multi-dimensional visualization not available yet."
                    )
                    exact_result, _, _ = analyze_data(question)
                    chart_path_handled = True
        else:
            suppress_auto_charts = True
            chart_suppressed_misleading = True
            partial_visualization_warning = (
                "Advanced multi-dimensional visualization not available yet."
            )
            exact_result, _, _ = analyze_data(question)
            chart_data = []
            chart_type = ""
            chart_path_handled = True

    trend_request_unsatisfied = False

    if not chart_path_handled and _question_requests_trend_intent(ql):
        trend_pack = _try_build_trend_line_visualization(
            question, df, profile_live, metric_spec_live
        )
        if trend_pack:
            t_rows, t_type, t_title, t_intent, t_trace = trend_pack
            chart_data = list(_normalize_chart_records(t_rows))
            chart_type = t_type
            chart_title = t_title
            intent_debug = t_intent
            smart_trace = t_trace
            smart_routing_used = True
            chart_path_handled = True
            tab_t = _tabular_exact_from_name_value_rows(t_rows)
            exact_result = tab_t or exact_result
        else:
            trend_request_unsatisfied = True
            suppress_auto_charts = True
            chart_suppressed_misleading = True
            partial_visualization_warning = (
                "Time-series visualization unavailable for this question — "
                "could not aggregate by month/week with the available date column."
            )
            exact_result = (
                (exact_result or "").strip()
                + "\n\n"
                + partial_visualization_warning
            ).strip()
            chart_data = []
            chart_type = ""
            chart_title = ""
            chart_path_handled = True

    skip_histogram_for_categorical_distribution = False
    try:
        from intent_engine.dimension_request import (
            question_requests_categorical_distribution_chart,
        )

        skip_histogram_for_categorical_distribution = (
            question_requests_categorical_distribution_chart(
                question,
                df,
                profile_live,
                match_column=_match_column_from_phrase,
            )
        )
    except Exception:
        pass

    if (
        not chart_path_handled
        and not correlation_routing_locked
        and _question_asks_numeric_distribution_histogram(ql)
        and not _question_asks_outlier_analysis(ql)
        and not _question_explicitly_groups_by_dimension(ql)
        and not skip_histogram_for_categorical_distribution
    ):
        hist_pack = _try_build_histogram_visualization(
            question, df, profile_live, smart_trace
        )
        if hist_pack:
            h_rows, h_type, h_title, h_intent, h_trace = hist_pack
            chart_data = list(_normalize_chart_records(h_rows))
            chart_type = h_type
            chart_title = h_title
            intent_debug = h_intent
            smart_trace = h_trace
            smart_routing_used = True
            chart_path_handled = True
            tab_h = _tabular_exact_from_name_value_rows(h_rows)
            exact_result = tab_h or exact_result

    if not chart_path_handled and not correlation_routing_locked:
        standout_category_compare = bool(
            intent_debug and intent_debug.get("executive_standout_analysis")
        )
        if (
            _question_asks_outlier_analysis(ql)
            and not _question_explicitly_groups_by_dimension(ql)
            and not standout_category_compare
        ):
            ol_rows, ol_type, ol_title, ol_sub = _try_outlier_visualization(
                question, smart_trace
            )
            if ol_rows:
                chart_path_handled = True
                chart_data = list(_normalize_chart_records(ol_rows))
                chart_type = (ol_type or "bar").strip() or "bar"
                chart_title = (ol_title or "").strip()
                chart_subtitle = (ol_sub or chart_subtitle).strip()
                smart_routing_used = True
                exact_result, _, _ = analyze_data(question)
            else:
                suppress_auto_charts = True
                exact_result, _, _ = analyze_data(question)
                chart_data = []
                chart_type = ""
                chart_path_handled = True
                partial_visualization_warning = (
                    "No suitable outlier visualization available for this dataset. "
                    "The narrative above still describes individual outliers in the metric."
                )
        if not chart_path_handled:
            if unsupported_multi_metric and unsupported_multi_metric.get("active"):
                from intent_engine.multi_metric_intent import (
                    build_unsupported_multi_metric_exact_context,
                )

                exact_result = build_unsupported_multi_metric_exact_context(
                    unsupported_multi_metric
                )
                chart_data = []
                chart_type = ""
                chart_path_handled = True
            else:
                intent_chart_built = False
                if (
                    intent_debug
                    and intent_debug.get("group_col")
                    and intent_debug.get("value_col")
                ):
                    tab_er, intent_rows, intent_type, intent_title, intent_ts = (
                        _build_aggregate_chart_from_intent(intent_debug, question)
                    )
                    if intent_rows:
                        exact_result = tab_er
                        chart_data = intent_rows
                        chart_type = intent_type
                        chart_title = intent_title
                        chart_path_handled = True
                        intent_chart_built = True
                        if intent_ts:
                            smart_trace = {
                                "category_column": intent_debug.get("group_col"),
                                "numeric_column": intent_debug.get("value_col"),
                                "aggregation": str(
                                    intent_debug.get("agg_label", "")
                                ).lower(),
                                "aggregation_key": intent_debug.get("agg_key"),
                                "rows_analyzed": int(len(df)),
                                "notes": intent_debug.get("dimension_notes")
                                or str(intent_ts.get("selectionReason") or "").strip()
                                or None,
                                "timeSeriesAnalysis": intent_ts,
                            }
                        elif intent_debug:
                            smart_trace = {
                                "category_column": intent_debug.get("group_col"),
                                "numeric_column": intent_debug.get("value_col"),
                                "aggregation": str(
                                    intent_debug.get("agg_label", "")
                                ).lower(),
                                "aggregation_key": intent_debug.get("agg_key"),
                                "rows_analyzed": int(len(df)),
                                "notes": intent_debug.get("dimension_notes"),
                            }
                if not intent_chart_built:
                    exact_result, chart_data, chart_type = analyze_data(question)

    chart_data = list(_normalize_chart_records(chart_data))
    dim_mismatch = _validate_chart_dimension_alignment(
        intent_debug=intent_debug,
        chart_data=chart_data,
        df=df,
        profile=profile_live,
        question=question,
        chart_type=chart_type,
    )
    if dim_mismatch:
        print("[viz] dimension_mismatch:", dim_mismatch, flush=True)
        rebuilt = False
        if intent_debug and intent_debug.get("group_col") and intent_debug.get("value_col"):
            tab_er, intent_rows, intent_type, intent_title, intent_ts = (
                _build_aggregate_chart_from_intent(intent_debug, question)
            )
            if intent_rows:
                rematch = _validate_chart_dimension_alignment(
                    intent_debug=intent_debug,
                    chart_data=intent_rows,
                    df=df,
                    profile=profile_live,
                    question=question,
                    chart_type=intent_type,
                )
                if not rematch:
                    exact_result = tab_er
                    chart_data = intent_rows
                    chart_type = intent_type
                    chart_title = intent_title
                    alignment_repaired = True
                    rebuilt = True
                    if intent_ts:
                        smart_trace = {
                            "category_column": intent_debug.get("group_col"),
                            "numeric_column": intent_debug.get("value_col"),
                            "aggregation": str(
                                intent_debug.get("agg_label", "")
                            ).lower(),
                            "aggregation_key": intent_debug.get("agg_key"),
                            "rows_analyzed": int(len(df)),
                            "notes": intent_debug.get("dimension_notes")
                            or str(intent_ts.get("selectionReason") or "").strip()
                            or None,
                            "timeSeriesAnalysis": intent_ts,
                        }
        if not rebuilt:
            chart_data = []
            chart_type = ""
            chart_title = ""
            suppress_auto_charts = True
            chart_suppressed_misleading = True
            partial_visualization_warning = dim_mismatch

    metric_mismatch = _validate_chart_metric_alignment(
        question=question,
        intent_debug=intent_debug,
        chart_data=chart_data,
        chart_title=chart_title,
        smart_trace=smart_trace,
    )
    if metric_mismatch:
        print("[viz] metric_mismatch:", metric_mismatch, flush=True)
        metric_rebuilt = False
        if intent_debug and intent_debug.get("group_col") and intent_debug.get("value_col"):
            tab_er, intent_rows, intent_type, intent_title, intent_ts = (
                _build_aggregate_chart_from_intent(intent_debug, question)
            )
            if intent_rows:
                remetric = _validate_chart_metric_alignment(
                    question=question,
                    intent_debug=intent_debug,
                    chart_data=intent_rows,
                    chart_title=intent_title,
                    smart_trace={
                        "numeric_column": intent_debug.get("value_col"),
                        "category_column": intent_debug.get("group_col"),
                    },
                )
                if not remetric:
                    exact_result = tab_er
                    chart_data = intent_rows
                    chart_type = intent_type
                    chart_title = intent_title
                    alignment_repaired = True
                    metric_rebuilt = True
                    smart_trace = {
                        "category_column": intent_debug.get("group_col"),
                        "numeric_column": intent_debug.get("value_col"),
                        "aggregation": str(intent_debug.get("agg_label", "")).lower(),
                        "aggregation_key": intent_debug.get("agg_key"),
                        "rows_analyzed": int(len(df)),
                        "notes": "Chart rebuilt so metric matches the question.",
                    }
        if not metric_rebuilt:
            chart_data = []
            chart_type = ""
            chart_title = ""
            suppress_auto_charts = True
            chart_suppressed_misleading = True
            partial_visualization_warning = metric_mismatch

    if (
        chart_data
        and smart_trace
        and len(chart_data) >= 3
        and (
            smart_trace.get("geographic_outlier_view")
            or (
                smart_trace.get("outlier_view")
                and not smart_trace.get("histogram")
                and smart_trace.get("category_column")
            )
        )
    ):
        exact_result = _enrich_categorical_outlier_narrative(
            trace=smart_trace,
            chart_rows=chart_data,
            question=question,
            category_column=smart_trace.get("category_column"),
            metric_column=smart_trace.get("numeric_column"),
            exact_result=exact_result,
            intent_debug=intent_debug,
        )
    print(
        "[viz] received_question:",
        repr((question or "").strip())[:520],
        flush=True,
    )
    print(
        "[viz] intent_category_col:",
        (intent_debug or {}).get("group_col"),
        "intent_numeric_col:",
        (intent_debug or {}).get("value_col"),
        "intent_agg:",
        (intent_debug.get("agg_label"), intent_debug.get("agg_key")) if intent_debug else None,
        "secondary_dim:",
        intent_debug.get("secondary_group_col") if intent_debug else None,
        "stacked_two_dim:",
        used_two_dim_stacked,
        flush=True,
    )
    print("[viz] after_analyze_chart_points=", len(chart_data), flush=True)

    ts_meta_early = (
        smart_trace.get("timeSeriesAnalysis")
        if smart_trace and isinstance(smart_trace.get("timeSeriesAnalysis"), dict)
        else None
    )
    unsupported_decline = _assess_unsupported_decline_analysis(
        question=question,
        df=df,
        profile=profile_live,
        chart_type_internal=str(chart_type or "bar"),
        intent_debug=intent_debug,
        time_series_analysis=ts_meta_early,
    )
    decline_request_unsatisfied = bool(unsupported_decline)
    if unsupported_decline and unsupported_decline.get("active"):
        chart_data = []
        chart_type = ""
        chart_title = ""
        suppress_auto_charts = True
        chart_suppressed_misleading = True
        partial_visualization_warning = (
            partial_visualization_warning
            or "Decline ranking requires multi-period data per entity — "
            "category totals alone cannot identify which entity is declining."
        )

    if unsupported_multi_metric and unsupported_multi_metric.get("active"):
        chart_data = []
        chart_type = ""
        chart_title = ""
        suppress_auto_charts = True
        chart_suppressed_misleading = True
        partial_visualization_warning = (
            partial_visualization_warning
            or str(unsupported_multi_metric.get("leadSentence") or "").strip()
            or "Required metric column missing — comparison chart suppressed."
        )

    if unsupported_requested_metric_unsatisfied:
        chart_data = []
        chart_type = ""
        chart_title = ""
        suppress_auto_charts = True
        chart_suppressed_misleading = True
        if unsupported_requested_metric_routing:
            partial_visualization_warning = (
                partial_visualization_warning
                or str(unsupported_requested_metric_routing.get("leadSentence") or "").strip()
                or "Requested metric not available in this dataset."
            )
            if not (exact_result or "").strip():
                try:
                    from intent_engine.narrative_guardrails import (
                        build_unsupported_requested_metric_exact_context,
                    )

                    exact_result = build_unsupported_requested_metric_exact_context(
                        unsupported_requested_metric_routing
                    )
                except Exception:
                    pass

    if (
        chart_data
        and _question_requests_trend_intent(ql)
        and str(chart_type or "").strip().lower() not in ("line", "area")
    ):
        trend_request_unsatisfied = True
        chart_data = []
        chart_type = ""
        chart_title = ""
        suppress_auto_charts = True
        chart_suppressed_misleading = True
        partial_visualization_warning = (
            "Trend question received a category chart — time-series view suppressed."
        )

    if not chart_data and intent_debug and not suppress_auto_charts:
        fb_rows: List[Dict[str, Any]] = []
        fb_type = ""
        fb_title = ""
        fb_ts: Optional[Dict[str, Any]] = None
        if _question_requests_trend_intent(ql):
            suppress_auto_charts = True
            trend_request_unsatisfied = True
        else:
            fb_rows, fb_type, fb_title, fb_ts = _fallback_aggregate_chart(
                intent_debug, question
            )
        if fb_rows:
            chart_data = list(_normalize_chart_records(fb_rows))
            chart_type = (fb_type or "bar").strip() or "bar"
            chart_title = (fb_title or "").strip()
            fallback_used = True
            if fb_ts and isinstance(fb_ts, dict):
                smart_trace = {
                    "category_column": intent_debug.get("group_col"),
                    "numeric_column": intent_debug.get("value_col"),
                    "aggregation": str(intent_debug.get("agg_label", "")).lower(),
                    "aggregation_key": intent_debug.get("agg_key"),
                    "rows_analyzed": int(len(df)),
                    "notes": intent_debug.get("dimension_notes")
                    or str(fb_ts.get("selectionReason") or "").strip()
                    or None,
                    "timeSeriesAnalysis": fb_ts,
                }
            print("[viz] used_intent_aggregate_fallback rows=", len(chart_data), flush=True)

    if (
        chart_data
        and _question_asks_outlier_analysis(ql)
        and not _question_explicitly_groups_by_dimension(ql)
        and intent_debug
    ):
        gcol = str(intent_debug.get("group_col") or "").lower()
        agg_k = str(intent_debug.get("agg_key") or "").lower()
        title_l = (chart_title or "").lower()
        if (
            ("department" in gcol or "dept" in gcol)
            and agg_k in ("mean", "avg", "average")
        ) or re.search(r"\bby\s+department\b", title_l):
            ol_rows, ol_type, ol_title, ol_sub = _try_outlier_visualization(
                question, smart_trace
            )
            if ol_rows:
                chart_data = list(_normalize_chart_records(ol_rows))
                chart_type = (ol_type or "bar").strip() or "bar"
                chart_title = (ol_title or "").strip()
                chart_subtitle = (ol_sub or chart_subtitle).strip()
                smart_routing_used = True
                alignment_repaired = True
                partial_visualization_warning = (
                    "Replaced a department-average chart with an outlier-focused view."
                )
            else:
                chart_data = []
                chart_type = ""
                chart_title = ""
                chart_suppressed_misleading = True
                partial_visualization_warning = (
                    "No suitable outlier visualization available. "
                    "Department averages do not show individual outliers."
                )

    if not chart_data and not suppress_auto_charts:
        sm_data, sm_type, sm_title, sm_sub = build_smart_chart(question, smart_trace)
        if sm_data:
            smart_routing_used = True
            chart_data = list(_normalize_chart_records(sm_data))
            chart_type = (sm_type or chart_type or "").strip() or "bar"
            chart_title = (sm_title or "").strip()
            chart_subtitle = (sm_sub or chart_subtitle).strip()
            if smart_trace.get("scatterFallback"):
                _sfw = (
                    "Scatter plot was not available for the chosen metrics; "
                    "the chart shows each column’s total as a simple bar comparison."
                )
                partial_visualization_warning = (
                    f"{(partial_visualization_warning or '').strip()} {_sfw}".strip()
                    if partial_visualization_warning
                    else _sfw
                )
            if str(smart_trace.get("aggregation", "")).lower() == "scatter":
                ri0 = smart_trace.get("relationshipInsights") or {}
                sl0 = str(ri0.get("summaryLine") or "").strip()
                extra_sc = sl0
                if extra_sc:
                    base_er = (exact_result or "").strip()
                    if not base_er or "No direct chart rule matched" in base_er:
                        exact_result = extra_sc
                    else:
                        exact_result = f"{base_er}\n\n{extra_sc}"

    if not chart_data and not suppress_auto_charts:
        lr, lt, lti, lsub = _deterministic_viz_last_resort(question, smart_trace)
        if lr:
            smart_routing_used = True
            fallback_used = True
            chart_data = list(_normalize_chart_records(lr))
            chart_type = (lt or "bar").strip() or "bar"
            chart_title = (lti or "").strip()
            chart_subtitle = (lsub or chart_subtitle).strip()
            det_note = (
                "Chart generated from deterministic schema rules (no rule-based path matched earlier)."
            )
            partial_visualization_warning = (
                f"{(partial_visualization_warning or '').strip()} {det_note}".strip()
                if partial_visualization_warning
                else det_note
            )
            tab_lr = _tabular_exact_from_name_value_rows(
                [{"name": r.get("name"), "value": r.get("value")} for r in chart_data],
                max_rows=40,
            )
            if tab_lr:
                base_er = (exact_result or "").strip()
                if not base_er or "No direct chart rule matched" in base_er:
                    exact_result = tab_lr
                elif tab_lr not in base_er:
                    exact_result = f"{base_er}\n\n{tab_lr}"

    if (
        not correlation_routing_locked
        and chart_data
        and intent_debug
        and intent_debug.get("value_col")
        and smart_routing_used
        and smart_trace.get("numeric_column")
        and not smart_trace.get("multi_series")
        and not intent_debug.get("relationship_scatter")
        and str(smart_trace.get("aggregation", "")).lower() != "scatter"
    ):
        iv = str(intent_debug["value_col"]).strip()
        sv = str(smart_trace.get("numeric_column")).strip()
        roi_mismatch = (
            _question_requests_roi(question)
            and not _rendered_metric_matches_question(
                question, intent_debug, smart_trace
            )
        )
        margin_mismatch = (
            _question_requests_profit_margin(question)
            and not _rendered_metric_matches_question(
                question, intent_debug, smart_trace
            )
        )
        if roi_mismatch or margin_mismatch or (
            sv
            and iv
            and sv != iv
            and str(smart_trace.get("aggregation", "")).lower() != "scatter"
        ):
            fb_rows, fb_type, fb_title, fb_ts = _fallback_aggregate_chart(
                intent_debug, question
            )
            if fb_rows:
                chart_data = list(_normalize_chart_records(fb_rows))
                chart_type = (fb_type or "bar").strip() or "bar"
                chart_title = (fb_title or "").strip()
                smart_routing_used = False
                fallback_used = True
                alignment_repaired = True
                st_line = "Visualization rebuilt so the chart metric matches the question."
                smart_trace = {
                    "category_column": intent_debug["group_col"],
                    "numeric_column": intent_debug["value_col"],
                    "aggregation": str(intent_debug.get("agg_label", "")).lower(),
                    "aggregation_key": intent_debug.get("agg_key"),
                    "rows_analyzed": int(len(df)),
                    "notes": st_line,
                }
                if fb_ts and isinstance(fb_ts, dict):
                    smart_trace["timeSeriesAnalysis"] = fb_ts
                    extra = str(fb_ts.get("selectionReason") or "").strip()
                    if extra:
                        smart_trace["notes"] = f"{st_line} {extra}".strip()

    ts_meta_pre_viz = (
        smart_trace.get("timeSeriesAnalysis")
        if smart_trace and isinstance(smart_trace.get("timeSeriesAnalysis"), dict)
        else None
    )
    unsupported_decline = _assess_unsupported_decline_analysis(
        question=question,
        df=df,
        profile=profile_live,
        chart_type_internal=str(chart_type or "bar"),
        intent_debug=intent_debug,
        time_series_analysis=ts_meta_pre_viz,
    )
    decline_request_unsatisfied = bool(unsupported_decline)
    if unsupported_decline and unsupported_decline.get("active"):
        chart_data = []
        chart_type = ""
        chart_title = ""
        suppress_auto_charts = True
        chart_suppressed_misleading = True
        partial_visualization_warning = (
            partial_visualization_warning
            or "Decline ranking requires multi-period data per entity — "
            "category totals alone cannot identify which entity is declining."
        )

    if not chart_data:
        no_chart_reason = (
            "suppress_auto_charts"
            if suppress_auto_charts
            else (
                str(smart_trace.get("deterministic_fallback_reason") or "").strip()
                or str(smart_trace.get("scatter_fallback_reason") or "").strip()
                or (
                    "advanced_multi_dim_unavailable"
                    if chart_suppressed_misleading
                    else "no_rows_after_pipeline"
                )
            )
        )
        try:
            dbg_no = {
                "question": (question or "")[:520],
                "detected_intent": _chart_selection_question_bucket(ql),
                "selected_metric": (intent_debug or {}).get("value_col"),
                "selected_dimension": (intent_debug or {}).get("group_col"),
                "smart_routing": smart_trace.get("routing"),
                "smart_metric": smart_trace.get("numeric_column"),
                "smart_dimension": smart_trace.get("category_column"),
                "deterministic_reason": smart_trace.get("deterministic_fallback_reason"),
                "suppress_auto_charts": suppress_auto_charts,
                "chart_suppressed": chart_suppressed_misleading,
                "reason_no_chart": no_chart_reason[:800],
            }
            print(
                "[viz_debug] no_chart",
                json.dumps(_json_safe(dbg_no), default=str)[:2400],
                flush=True,
            )
        except Exception:
            print(
                "[viz] outgoing_visualization= None fallback_used=",
                fallback_used,
                flush=True,
            )
        kpi_rec = {
            "detectedIntent": _chart_selection_question_bucket(ql),
            "categoryCount": 0,
            "metricType": "numeric",
            "recommendedChart": "kpiCards",
            "selectionExplanation": "Single-value summary; KPI cards convey the answer without a multi-point chart.",
        }
        av_empty = _build_analysis_validation_block(
            intent_debug=intent_debug,
            multi_rendered=False,
            secondary_requested=bool(sec_dim),
            partial_message=partial_visualization_warning,
        )
        if unsupported_decline:
            av_checks = list(av_empty.get("checks") or [])
            av_checks.extend(
                [
                    {"label": "Decline analysis supported", "ok": False},
                    {
                        "label": "Time periods available for decline ranking",
                        "ok": int(unsupported_decline.get("periodsAvailable") or 0)
                        >= 2,
                    },
                ]
            )
            av_empty["checks"] = av_checks
        if unsupported_multi_metric:
            av_checks = list(av_empty.get("checks") or [])
            av_checks.extend(
                [
                    {"label": "Multi-metric comparison supported", "ok": False},
                    {
                        "label": "All requested metric columns present",
                        "ok": False,
                    },
                ]
            )
            av_empty["checks"] = av_checks
        unsupported_trend_empty = None
        try:
            from intent_engine.trend_unsupported import assess_unsupported_trend_for_api

            unsupported_trend_empty = assess_unsupported_trend_for_api(
                question=question,
                df=df,
                profile=profile_live,
                trend_request_unsatisfied=bool(trend_request_unsatisfied),
                time_series_analysis=ts_meta_pre_viz,
            )
        except Exception:
            pass
        trend_unsat_empty = bool(trend_request_unsatisfied or unsupported_trend_empty)
        if unsupported_trend_empty:
            av_checks = list(av_empty.get("checks") or [])
            av_checks.extend(
                [
                    {"label": "Trend analysis supported", "ok": False},
                    {
                        "label": "Time periods available for trend",
                        "ok": int(unsupported_trend_empty.get("periodsAvailable") or 0)
                        >= 2,
                    },
                ]
            )
            av_empty["checks"] = av_checks
        analysis_empty = _build_unified_analysis_payload(
            question=question,
            intent_debug=intent_debug,
            chart_title="",
            chart_type_internal="bar",
            exact_result=exact_result,
            chart_points=0,
            alignment_repaired=alignment_repaired,
            analysis_row_count=analysis_row_count,
            chart_recommendation=kpi_rec,
            analysis_validation=av_empty,
            partial_visualization_warning=partial_visualization_warning,
            trend_request_unsatisfied=trend_unsat_empty,
            unsupported_trend_analysis=unsupported_trend_empty,
            decline_request_unsatisfied=decline_request_unsatisfied,
            unsupported_decline_analysis=unsupported_decline,
            multi_metric_request_unsatisfied=multi_metric_request_unsatisfied,
            unsupported_multi_metric_analysis=unsupported_multi_metric,
            unsupported_requested_metric_unsatisfied=unsupported_requested_metric_unsatisfied,
            unsupported_requested_metric_analysis=unsupported_requested_metric_routing,
            df_for_intent=df,
            profile_for_intent=profile_live,
            time_series_analysis_for_intent=ts_meta_pre_viz,
        )
        if no_chart_reason and str(no_chart_reason) not in str(exact_result or ""):
            tail = f"\n\n[Chart unavailable] {no_chart_reason}"
            analysis_empty["insightSummary"] = (
                str(analysis_empty.get("insightSummary") or "").strip() + tail
            ).strip()
            exact_result = (str(exact_result or "").strip() + tail).strip()
        try:
            from intent_engine.routing_consistency import attach_routing_backbone

            attach_routing_backbone(
                question=question,
                analysis=analysis_empty,
                visualization=None,
            )
        except Exception:
            pass
        return exact_result, None, fin(analysis_empty)

    chart_type_pre_sl = str(chart_type or "").strip().lower().replace("-", "_")
    chart_type = _normalize_internal_chart_type(chart_type)
    if chart_type == "bar" and chart_type_pre_sl and chart_type_pre_sl != "bar":
        try:
            print(
                "[viz_debug] unsupported_chart_type_fallback_bar",
                json.dumps({"requested": chart_type_pre_sl}, default=str)[:500],
                flush=True,
            )
        except Exception:
            pass

    chart_type, chart_sel_reason, chart_sel_conf = determine_chart_type_and_reason(
        ql,
        chart_type,
        chart_data,
        intent_debug,
        smart_trace or {},
    )
    if chart_sel_conf == "Low" and chart_type not in (
        "line",
        "area",
        "bar_horizontal",
        "pie",
        "donut",
        "scatter",
        "histogram",
    ):
        chart_type = "bar"
        extra = "Low confidence in chart pattern; defaulting to a vertical bar chart."
        chart_sel_reason = f"{chart_sel_reason} {extra}".strip()

    if follow_up_ops:
        chart_data, chart_type = _apply_follow_up_post_process_chart(
            chart_data, chart_type, follow_up_ops
        )
        fc = follow_up_ops.get("forced_chart_internal")
        if isinstance(fc, str) and fc.strip():
            note = f"Follow-up requested chart type: {fc}."
            chart_sel_reason = (
                f"{chart_sel_reason} {note}".strip() if chart_sel_reason else note
            )

    chart_type = _normalize_internal_chart_type(chart_type)

    if chart_type in ("pie", "donut") and chart_data:
        vals_f: List[float] = []
        for r in chart_data:
            try:
                vals_f.append(float(r.get("value")))
            except (TypeError, ValueError):
                vals_f.append(float("nan"))
        if vals_f and not any(math.isnan(v) for v in vals_f):
            if not _values_look_like_percent_shares(vals_f):
                s = float(sum(vals_f))
                if s > 0:
                    chart_data = [
                        {
                            "name": r.get("name"),
                            "value": 100.0 * float(r["value"]) / s,
                        }
                        for r in chart_data
                    ]

    if chart_data and _chart_rows_are_simple_categorical(chart_data):
        cat_col = None
        st_m = smart_trace if isinstance(smart_trace, dict) else {}
        cat_col = st_m.get("category_column")
        if not cat_col and intent_debug:
            cat_col = intent_debug.get("group_col")
        chart_data2, hc_msg = _apply_high_cardinality_cap_to_chart_rows(
            chart_data,
            chart_type=str(chart_type or ""),
            category_column=str(cat_col) if cat_col else None,
            question=question,
        )
        if hc_msg:
            chart_data = chart_data2
            partial_visualization_warning = (
                f"{(partial_visualization_warning or '').strip()} {hc_msg}".strip()
                if partial_visualization_warning
                else hc_msg
            )
            smart_trace = {
                **(smart_trace if isinstance(smart_trace, dict) else {}),
                "highCardinalityApplied": True,
                "highCardinalityNote": hc_msg,
            }

    if not chart_title.strip():
        chart_title = _chart_title_from_question(question)

    if (
        intent_debug
        and intent_debug.get("value_col")
        and intent_debug.get("group_col")
        and chart_type not in ("pie", "donut", "line", "area", "scatter")
        and not smart_trace.get("multi_series")
    ):
        if alignment_repaired or not smart_routing_used:
            if intent_debug.get("derived_profit_margin"):
                dim_l = _pretty_label_text(str(intent_debug.get("group_col") or "category"))
                chart_title = f"Profit margin by {dim_l.lower()}".strip()
            elif intent_debug.get("derived_roi"):
                dim_l = _pretty_label_text(str(intent_debug.get("group_col") or "category"))
                chart_title = f"ROI by {dim_l.lower()}".strip()
            else:
                chart_title = _business_chart_title(
                    str(intent_debug.get("agg_key") or ""),
                    str(intent_debug.get("agg_label") or ""),
                    str(intent_debug.get("value_col") or ""),
                    str(intent_debug.get("group_col") or ""),
                ).strip()

    if (
        chart_data
        and _question_requests_roi(question)
        and intent_debug
        and not _rendered_metric_matches_question(question, intent_debug, smart_trace)
    ):
        fb_rows, fb_type, fb_title, fb_ts = _fallback_aggregate_chart(
            intent_debug, question
        )
        if fb_rows:
            chart_data = list(_normalize_chart_records(fb_rows))
            chart_type = (fb_type or "bar").strip() or "bar"
            chart_title = (fb_title or chart_title or "").strip()
            smart_routing_used = False
            fallback_used = True
            alignment_repaired = True
            smart_trace = {
                "category_column": intent_debug.get("group_col"),
                "numeric_column": intent_debug.get("value_col"),
                "aggregation": str(intent_debug.get("agg_label", "")).lower(),
                "aggregation_key": intent_debug.get("agg_key"),
                "rows_analyzed": int(len(df)),
                "notes": "Chart rebuilt to use ROI instead of a mismatched revenue metric.",
            }
            if fb_ts and isinstance(fb_ts, dict):
                smart_trace["timeSeriesAnalysis"] = fb_ts
            partial_visualization_warning = (
                f"{(partial_visualization_warning or '').strip()} "
                "Metric alignment guard: visualization now uses ROI."
            ).strip()

    if (
        chart_data
        and _question_requests_profit_margin(question)
        and intent_debug
        and not _rendered_metric_matches_question(question, intent_debug, smart_trace)
    ):
        fb_rows, fb_type, fb_title, fb_ts = _fallback_aggregate_chart(
            intent_debug, question
        )
        if fb_rows:
            chart_data = list(_normalize_chart_records(fb_rows))
            chart_type = (fb_type or "bar").strip() or "bar"
            chart_title = (fb_title or chart_title or "").strip()
            smart_routing_used = False
            fallback_used = True
            alignment_repaired = True
            smart_trace = {
                "category_column": intent_debug.get("group_col"),
                "numeric_column": intent_debug.get("value_col"),
                "aggregation": str(intent_debug.get("agg_label", "")).lower(),
                "aggregation_key": intent_debug.get("agg_key"),
                "rows_analyzed": int(len(df)),
                "notes": "Chart rebuilt to use profit margin % instead of a mismatched profit metric.",
            }
            if fb_ts and isinstance(fb_ts, dict):
                smart_trace["timeSeriesAnalysis"] = fb_ts
            partial_visualization_warning = (
                f"{(partial_visualization_warning or '').strip()} "
                "Metric alignment guard: visualization now uses profit margin %."
            ).strip()

    if (
        _question_asks_numeric_spread_patterns(ql)
        and chart_data
        and str(chart_type).strip() == "bar_horizontal"
    ):
        chart_title = "Numeric spread by metric"
        chart_subtitle = (
            "Each bar is a numeric field ranked by relative spread "
            "(IQR ÷ median scale); higher means more dispersed values."
        )

    dbg_ct = profile_live.get("column_types", {})
    detected_date_columns = [c for c, t in dbg_ct.items() if t == "date"]
    selected_numeric_column = (
        (intent_debug or {}).get("value_col")
        or (smart_trace or {}).get("numeric_column")
    )
    generated_chart_type = chart_type
    grouped_dataset_preview = chart_data[:12] if chart_data else []
    print("[viz] detected_date_columns:", detected_date_columns, flush=True)
    print(
        "[viz] selected_numeric_column:",
        selected_numeric_column,
        flush=True,
    )
    print("[viz] generated_chart_type:", generated_chart_type, flush=True)
    print(
        "[viz] grouped_dataset_preview:",
        json.dumps(_json_safe(grouped_dataset_preview))[:1600],
        flush=True,
    )
    try:
        dbg_ok = {
            "question": (question or "")[:520],
            "detected_intent": _chart_selection_question_bucket(ql),
            "selected_metric": selected_numeric_column,
            "selected_dimension": (
                (intent_debug or {}).get("group_col")
                or (smart_trace or {}).get("category_column")
            ),
            "selected_chart_type": _chart_type_for_api(str(chart_type or "bar")),
            "routing": (smart_trace or {}).get("routing"),
            "chart_selection_reason": chart_sel_reason,
        }
        print(
            "[viz_debug] chart_ok",
            json.dumps(_json_safe(dbg_ok), default=str)[:2200],
            flush=True,
        )
    except Exception:
        pass

    print(
        "[viz] finalized_category_col:",
        intent_debug.get("group_col") if intent_debug else None,
        "finalized_numeric_col:",
        intent_debug.get("value_col") if intent_debug else None,
        "finalized_agg:",
        (intent_debug.get("agg_label"), intent_debug.get("agg_key"))
        if intent_debug
        else None,
        "chart_type_internal=",
        chart_type,
        flush=True,
    )

    is_scatter = str(chart_type or "").strip() == "scatter"
    labels: List[str] = []
    vals: List[float] = []
    xs_src: List[float] = []
    if is_scatter:
        for row in chart_data:
            try:
                fx = float(row.get("x"))
                fy = float(row.get("value"))
            except (TypeError, ValueError):
                continue
            if not (fx == fx and fy == fy):
                continue
            labels.append(str(row.get("name", "")).strip() or "•")
            vals.append(fy)
            xs_src.append(fx)
    else:
        for row in chart_data:
            try:
                nm = row.get("name")
                vv = row.get("value")
                fv = float(vv)
                if not (fv == fv):  # NaN
                    continue
                labels.append(str(nm))
                vals.append(fv)
            except (TypeError, ValueError):
                continue

    ll = min(len(labels), len(vals))
    if is_scatter:
        ll = min(ll, len(xs_src))
    if ll == 0:
        av_ll0 = _build_analysis_validation_block(
            intent_debug=intent_debug,
            multi_rendered=False,
            secondary_requested=bool(sec_dim),
            partial_message=partial_visualization_warning,
        )
        ts_meta_empty = (
            smart_trace.get("timeSeriesAnalysis")
            if smart_trace and isinstance(smart_trace.get("timeSeriesAnalysis"), dict)
            else None
        )
        unsupported_trend_empty = None
        try:
            from intent_engine.trend_unsupported import assess_unsupported_trend_for_api

            unsupported_trend_empty = assess_unsupported_trend_for_api(
                question=question,
                df=df,
                profile=profile_live,
                trend_request_unsatisfied=bool(trend_request_unsatisfied),
                time_series_analysis=ts_meta_empty,
            )
        except Exception:
            pass
        trend_unsat_empty = bool(trend_request_unsatisfied or unsupported_trend_empty)
        analysis_empty = _build_unified_analysis_payload(
            question=question,
            intent_debug=intent_debug,
            chart_title=chart_title.strip(),
            chart_type_internal=str(chart_type or "bar"),
            exact_result=exact_result,
            chart_points=0,
            alignment_repaired=alignment_repaired,
            analysis_row_count=analysis_row_count,
            chart_recommendation=_build_chart_recommendation_dict(
                ql,
                0,
                intent_debug.get("value_col") if intent_debug else None,
                "bar",
                "No valid numeric pairs for the requested chart; defaulting to KPI-style text.",
            ),
            analysis_validation=av_ll0,
            partial_visualization_warning=partial_visualization_warning,
            trend_request_unsatisfied=trend_unsat_empty,
            unsupported_trend_analysis=unsupported_trend_empty,
            unsupported_requested_metric_unsatisfied=unsupported_requested_metric_unsatisfied,
            unsupported_requested_metric_analysis=unsupported_requested_metric_routing,
            df_for_intent=df,
            profile_for_intent=profile_live,
            time_series_analysis_for_intent=ts_meta_empty,
        )
        try:
            from intent_engine.routing_consistency import attach_routing_backbone

            attach_routing_backbone(
                question=question,
                analysis=analysis_empty,
                visualization=None,
            )
        except Exception:
            pass
        return exact_result, None, fin(analysis_empty)

    ncol_guess = None
    if intent_debug:
        ncol_guess = intent_debug.get("value_col")
    if ncol_guess is None:
        ncol_guess = _numeric_col_mentioned(
            ql,
            [
                c
                for c in df.columns.tolist()
                if profile_live.get("column_types", {}).get(c) == "number"
            ],
        )
    if is_scatter and smart_trace.get("scatter_y_column"):
        ncol_guess = str(smart_trace.get("scatter_y_column"))

    agg_eff = intent_debug.get("agg_key") if intent_debug else None
    if agg_eff is None:
        agg_eff = _infer_agg_hint_from_question(ql)

    trimmed_vals = vals[:ll]
    if intent_debug and (
        intent_debug.get("derived_profit_margin")
        or _question_requests_profit_margin(question)
        or (
            ncol_guess
            and "margin" in _norm_metric_phrase_for_match(str(ncol_guess))
        )
    ):
        round_cat = "pct_1"
    elif intent_debug and (
        intent_debug.get("derived_roi")
        or _question_requests_roi(question)
        or (
            ncol_guess
            and "roi" in _norm_metric_phrase_for_match(str(ncol_guess))
        )
    ):
        round_cat = "ratio_1"
    else:
        round_cat = infer_visualization_rounding_category(
            str(chart_type or ""),
            ql,
            ncol_guess,
            agg_eff,
            trimmed_vals,
        )
    rounded_vals = [round_display_numeric(round_cat, v) for v in trimmed_vals]
    value_display = [format_display_numeric(round_cat, v) for v in rounded_vals]

    scatter_x_rounded: List[float] = []
    scatter_x_display: List[str] = []
    if is_scatter and ll > 0:
        xtrim = xs_src[:ll]
        scatter_x_rounded = [round_display_numeric(round_cat, v) for v in xtrim]
        scatter_x_display = [
            format_display_numeric(round_cat, v) for v in scatter_x_rounded
        ]

    intent_debug, partial_visualization_warning = _apply_dimension_redirect_metadata(
        intent_debug,
        chart_data,
        partial_visualization_warning,
    )

    analysis_validation_block = _build_analysis_validation_block(
        intent_debug=intent_debug,
        multi_rendered=bool(used_two_dim_stacked),
        secondary_requested=bool(sec_dim),
        partial_message=partial_visualization_warning,
    )

    stacked_bar_payload: Optional[List[Dict[str, Any]]] = None
    multi_series_payload: Optional[Dict[str, Any]] = None
    meta_ms = smart_trace.get("multi_series_meta") if smart_trace else None
    if smart_trace.get("multi_series") and isinstance(meta_ms, dict):
        keys = meta_ms.get("seriesKeys") or []
        stacked_bar_payload = []
        for i in range(ll):
            r = chart_data[i] if i < len(chart_data) else {}
            if not isinstance(r, dict):
                continue
            entry: Dict[str, Any] = {
                "name": labels[i],
                "value": rounded_vals[i],
                "valueDisplay": value_display[i],
            }
            for sk in keys:
                sks = str(sk)
                if sks in r:
                    try:
                        entry[sks] = round_display_numeric(round_cat, float(r[sks]))
                    except (TypeError, ValueError):
                        pass
            stacked_bar_payload.append(entry)
        multi_series_payload = {
            "layout": meta_ms.get("layout"),
            "seriesKeys": keys,
            "seriesLabels": meta_ms.get("seriesLabels") or {},
            "categoryAxisTitle": meta_ms.get("categoryAxisTitle"),
            "stackAxisTitle": meta_ms.get("stackAxisTitle"),
        }

    provenance = _assemble_visualization_provenance(
        df=df,
        intent_debug=intent_debug,
        smart_trace=smart_trace,
        fallback_used=fallback_used,
        smart_routing_used=smart_routing_used,
        chart_type_internal=str(chart_type or "bar"),
        chart_points=ll,
        agg_eff=agg_eff,
        chart_selection_reason=chart_sel_reason,
        analysis_validation=analysis_validation_block,
        partial_alignment=partial_alignment,
        multi_series_rendered=bool(used_two_dim_stacked),
        chart_suppressed_misleading=chart_suppressed_misleading,
        category_labels=labels,
        question=question,
        chart_title=str(chart_title or ""),
    )

    metric_phrase_rec = None
    if intent_debug and intent_debug.get("relationship_scatter"):
        metric_phrase_rec = (
            intent_debug.get("relationship_measure_label")
            or _relationship_measure_label(
                str(
                    intent_debug.get("scatter_x_column")
                    or intent_debug.get("group_col")
                    or ""
                ),
                str(
                    intent_debug.get("scatter_y_column")
                    or intent_debug.get("value_col")
                    or ""
                ),
            )
        )
    elif intent_debug and intent_debug.get("value_col"):
        metric_phrase_rec = _metric_display_from_intent(intent_debug)
        if metric_phrase_rec == "—":
            metric_phrase_rec = _business_metric_series_label(
                str(intent_debug.get("agg_key") or ""),
                str(intent_debug.get("agg_label") or ""),
                str(intent_debug.get("value_col") or ""),
            )
    presented_api_type = (
        str(provenance.get("chartTypeApi") or "").strip()
        or _chart_type_for_api(chart_type or "bar")
    )
    chart_sel_for_rec = (
        str(provenance.get("chartSelectionReason") or "").strip()
        or chart_sel_reason
    )
    chart_rec = _build_chart_recommendation_dict(
        ql,
        ll,
        ncol_guess,
        presented_api_type,
        chart_sel_for_rec,
        metric_phrase_rec,
    )

    visualization: Dict[str, Any] = {
        "chartType": presented_api_type,
        "title": chart_title.strip(),
        "subtitle": chart_subtitle,
        "labels": labels[:ll],
        "values": rounded_vals,
        "valueDisplay": value_display,
        "roundingHint": round_cat,
        "provenance": provenance,
        "chartRecommendation": chart_rec,
    }
    if stacked_bar_payload and multi_series_payload:
        visualization["stackedBarRows"] = stacked_bar_payload
        visualization["multiSeries"] = multi_series_payload
    drill_dims: List[Dict[str, Any]] = []
    pri_d = intent_debug.get("group_col") if intent_debug else None
    if pri_d:
        drill_dims.append(
            {
                "column": str(pri_d),
                "role": "primary",
                "label": _pretty_label_text(str(pri_d)),
            }
        )
    sec_d = intent_debug.get("secondary_group_col") if intent_debug else None
    if sec_d:
        drill_dims.append(
            {
                "column": str(sec_d),
                "role": "secondary",
                "label": _pretty_label_text(str(sec_d)),
            }
        )
    if drill_dims:
        visualization["interaction"] = {"drillDimensions": drill_dims}
    if partial_visualization_warning:
        visualization["partialVisualizationWarning"] = (
            partial_visualization_warning.strip()
        )
    if is_scatter and scatter_x_rounded:
        visualization["scatterX"] = scatter_x_rounded
        visualization["scatterXDisplay"] = scatter_x_display
        visualization["scatterXLabel"] = _title_case_words(
            str(smart_trace.get("scatter_x_column") or "")
        )
        visualization["scatterYLabel"] = _title_case_words(
            str(smart_trace.get("scatter_y_column") or "")
        )
    coi_viz = smart_trace.get("categoricalOutlierInsights") if smart_trace else None
    if isinstance(coi_viz, dict) and coi_viz:
        visualization["categoricalOutlierInsights"] = _json_safe(coi_viz)
    ri_viz = smart_trace.get("relationshipInsights") if smart_trace else None
    if is_scatter and isinstance(ri_viz, dict) and ri_viz:
        visualization["relationshipInsights"] = _json_safe(ri_viz)
        ml = ri_viz.get("measureLabel") or smart_trace.get(
            "relationship_measure_label"
        )
        if ml:
            visualization["relationshipMeasureLabel"] = str(ml).strip()
    if ll >= 2 and str(chart_type or "").lower() not in ("scatter",):
        try:
            from intent_engine.executive_insight_ranking import (
                rank_category_executive_insights,
            )

            series_rows = [
                {"name": str(labels[i]), "value": float(rounded_vals[i])}
                for i in range(ll)
                if i < len(labels) and i < len(rounded_vals)
            ]
            try:
                from intent_engine.insight_card_titles import (
                    resolve_executive_dimension_label,
                    resolve_executive_measure_label,
                )

                m_lab = resolve_executive_measure_label(
                    metric_column_display=(
                        _metric_display_from_intent(intent_debug)
                        if intent_debug
                        else None
                    ),
                    metric_column=(
                        str(intent_debug.get("value_col"))
                        if intent_debug and intent_debug.get("value_col")
                        else None
                    ),
                    value_axis=chart_title,
                    chart_title=chart_title,
                    dataset_columns=(
                        list(df.columns) if df is not None else None
                    ),
                )
                d_lab = resolve_executive_dimension_label(
                    category_column_display=(
                        _pretty_label_text(str(intent_debug.get("group_col")))
                        if intent_debug and intent_debug.get("group_col")
                        else None
                    ),
                    category_column=(
                        str(intent_debug.get("group_col"))
                        if intent_debug and intent_debug.get("group_col")
                        else None
                    ),
                )
            except Exception:
                m_lab = (
                    _metric_display_from_intent(intent_debug)
                    if intent_debug
                    else "Value"
                )
                d_lab = (
                    _pretty_label_text(str(intent_debug.get("group_col")))
                    if intent_debug and intent_debug.get("group_col")
                    else "category"
                )
            coi_rank = (
                smart_trace.get("categoricalOutlierInsights")
                if smart_trace
                else None
            )
            exec_lens = None
            try:
                from intent_engine.executive_lens import (
                    build_lens_specific_insights,
                    detect_executive_lens,
                    merge_lens_insights,
                )

                exec_lens = detect_executive_lens(question)
            except Exception:
                exec_lens = None

            ranked_exec = rank_category_executive_insights(
                series_rows,
                metric_label=str(m_lab or "value"),
                dimension_label=str(d_lab or "category"),
                outlier_insights=coi_rank if isinstance(coi_rank, dict) else None,
                chart_kind=str(chart_type or "bar"),
                cohort_row_count=len(df) if df is not None else None,
            )
            if exec_lens and df is not None:
                try:
                    lens_cards = build_lens_specific_insights(
                        df,
                        profile_live,
                        question=question,
                        lens=exec_lens,
                        metric_col=(
                            str(intent_debug.get("value_col"))
                            if intent_debug and intent_debug.get("value_col")
                            else None
                        ),
                        dimension_col=(
                            str(intent_debug.get("group_col"))
                            if intent_debug and intent_debug.get("group_col")
                            else None
                        ),
                    )
                    ranked_exec = merge_lens_insights(
                        ranked_exec or [],
                        lens_cards,
                        lens=exec_lens,
                    )
                except Exception:
                    pass
            if ranked_exec:
                visualization["rankedExecutiveInsights"] = _json_safe(ranked_exec)
                if intent_debug is not None:
                    intent_debug["rankedExecutiveInsights"] = ranked_exec
                    if exec_lens:
                        intent_debug["executive_lens"] = exec_lens
        except Exception:
            pass

    if conversation_sidecar and isinstance(
        conversation_sidecar.get("contextUsedLine"), str
    ):
        visualization["contextUsed"] = conversation_sidecar["contextUsedLine"]

    ts_meta = (
        smart_trace.get("timeSeriesAnalysis")
        if smart_trace and isinstance(smart_trace.get("timeSeriesAnalysis"), dict)
        else None
    )
    unsupported_growth = _assess_unsupported_growth_analysis(
        question=question,
        df=df,
        profile=profile_live,
        chart_type_internal=str(chart_type or "bar"),
        chart_points=ll,
        intent_debug=intent_debug,
        time_series_analysis=ts_meta,
    )
    growth_request_unsatisfied = bool(unsupported_growth)
    unsupported_trend = None
    try:
        from intent_engine.trend_unsupported import assess_unsupported_trend_for_api

        unsupported_trend = assess_unsupported_trend_for_api(
            question=question,
            df=df,
            profile=profile_live,
            trend_request_unsatisfied=bool(trend_request_unsatisfied),
            time_series_analysis=ts_meta,
        )
    except Exception as _ut_exc:
        print(
            "[intent_engine] unsupported_trend skipped:",
            type(_ut_exc).__name__,
            str(_ut_exc)[:200],
            flush=True,
        )
    if unsupported_trend:
        trend_request_unsatisfied = True
    if unsupported_growth and analysis_validation_block:
        av_checks = list(analysis_validation_block.get("checks") or [])
        av_checks.extend(
            [
                {"label": "Growth analysis supported", "ok": False},
                {
                    "label": "Time periods available for rate-of-change",
                    "ok": int(unsupported_growth.get("periodsAvailable") or 0) >= 2,
                },
            ]
        )
        analysis_validation_block["checks"] = av_checks

    if unsupported_decline and analysis_validation_block:
        av_checks = list(analysis_validation_block.get("checks") or [])
        av_checks.extend(
            [
                {"label": "Decline analysis supported", "ok": False},
                {
                    "label": "Time periods available for decline ranking",
                    "ok": int(unsupported_decline.get("periodsAvailable") or 0) >= 2,
                },
            ]
        )
        analysis_validation_block["checks"] = av_checks

    if unsupported_multi_metric and analysis_validation_block:
        av_checks = list(analysis_validation_block.get("checks") or [])
        av_checks.extend(
            [
                {"label": "Multi-metric comparison supported", "ok": False},
                {"label": "All requested metric columns present", "ok": False},
            ]
        )
        analysis_validation_block["checks"] = av_checks

    if intent_debug and isinstance(intent_debug.get("lossProfitabilityContext"), dict):
        loss_block = str(
            intent_debug["lossProfitabilityContext"].get("exactBlock") or ""
        ).strip()
        if loss_block:
            er_tail = (exact_result or "").strip()
            exact_result = f"{loss_block}\n\n{er_tail}" if er_tail else loss_block

    if intent_debug and isinstance(intent_debug.get("executiveRiskContext"), dict):
        risk_block = str(
            intent_debug["executiveRiskContext"].get("exactBlock") or ""
        ).strip()
        if risk_block:
            er_tail = (exact_result or "").strip()
            exact_result = f"{risk_block}\n\n{er_tail}" if er_tail else risk_block

    analysis_ctx = _build_unified_analysis_payload(
        question=question,
        intent_debug=intent_debug,
        chart_title=str(visualization.get("title") or ""),
        chart_type_internal=str(chart_type or "bar"),
        exact_result=exact_result,
        chart_points=ll,
        alignment_repaired=alignment_repaired,
        analysis_row_count=analysis_row_count,
        chart_recommendation=chart_rec,
        analysis_validation=analysis_validation_block,
        partial_visualization_warning=partial_visualization_warning,
        trend_request_unsatisfied=trend_request_unsatisfied,
        growth_request_unsatisfied=growth_request_unsatisfied,
        unsupported_growth_analysis=unsupported_growth,
        unsupported_trend_analysis=unsupported_trend,
        decline_request_unsatisfied=decline_request_unsatisfied,
        unsupported_decline_analysis=unsupported_decline,
        multi_metric_request_unsatisfied=multi_metric_request_unsatisfied,
        unsupported_multi_metric_analysis=unsupported_multi_metric,
        unsupported_requested_metric_unsatisfied=unsupported_requested_metric_unsatisfied,
        unsupported_requested_metric_analysis=unsupported_requested_metric_routing,
        df_for_intent=df,
        profile_for_intent=profile_live,
        time_series_analysis_for_intent=ts_meta,
    )
    try:
        from intent_engine.routing_consistency import attach_routing_backbone

        attach_routing_backbone(
            question=question,
            analysis=analysis_ctx,
            visualization=visualization,
        )
    except Exception as _rb_exc:
        print(
            "[routing_plan] attach skipped:",
            type(_rb_exc).__name__,
            str(_rb_exc)[:300],
            flush=True,
        )

    try:
        from intent_engine.reasoning_blocks import attach_reasoning_blocks_to_analysis

        attach_reasoning_blocks_to_analysis(
            analysis_ctx,
            labels=list(visualization.get("labels") or []),
            values=list(visualization.get("values") or []),
        )
    except Exception as _rb_exc:
        print(
            "[reasoning_blocks] attach skipped:",
            type(_rb_exc).__name__,
            str(_rb_exc)[:300],
            flush=True,
        )

    try:
        print(
            "[viz] outgoing_visualization=",
            str(
                {
                    "chartType": visualization["chartType"],
                    "title": visualization["title"],
                    "point_count": len(visualization["labels"]),
                    "sample_labels": visualization["labels"][:4],
                    "sample_values": visualization["values"][:4],
                    "fallback_aggregate_used": fallback_used,
                    "alignment_repaired": alignment_repaired,
                    "routingIntent": (analysis_ctx.get("routingPlan") or {}).get("intent"),
                }
            )[:950],
            flush=True,
        )
    except Exception:
        print("[viz] outgoing_visualization print failed", flush=True)
    return exact_result, visualization, fin(analysis_ctx)


def _build_ask_conversation_out(
    *,
    plan: Dict[str, Any],
    data: QuestionRequest,
    eff_q: str,
    analysis_ctx: Dict[str, Any],
    visualization: Optional[Dict[str, Any]],
    prev_filters: List[str],
    filter_added: List[str],
    turn_id_session: str,
    follow_chain_session: List[str],
    lic_id_session: Optional[str],
    drill_path_session: List[str],
) -> Dict[str, Any]:
    chart_rec_out = (
        analysis_ctx.get("chartRecommendation")
        if isinstance(analysis_ctx.get("chartRecommendation"), dict)
        else {}
    )
    viz_title = ""
    if visualization and isinstance(visualization.get("title"), str):
        viz_title = visualization["title"].strip()
    conv_scope_q = str(plan.get("scope_question") or "").strip()
    conv_root_q = (
        conv_scope_q
        or (
            data.conversation_context.rootQuestion
            if data.conversation_context
            and (data.conversation_context.rootQuestion or "").strip()
            else None
        )
        or eff_q
    )
    conv_last_q = (
        conv_scope_q if plan.get("scoped_follow_up") and conv_scope_q else eff_q
    )
    return {
        "lastQuestion": conv_last_q,
        "rootQuestion": conv_root_q,
        "lastChartTitle": viz_title
        or str(analysis_ctx.get("chartTitle") or "").strip(),
        "metricColumn": analysis_ctx.get("metricColumn"),
        "categoryColumn": analysis_ctx.get("categoryColumn"),
        "aggregation": analysis_ctx.get("aggregation"),
        "chartType": analysis_ctx.get("chartType"),
        "intentBucket": chart_rec_out.get("detectedIntent"),
        "filtersApplied": prev_filters + filter_added,
        "turnId": turn_id_session,
        "followUpChain": follow_chain_session,
        "lastInsightChartId": lic_id_session,
        "activeDrillPath": drill_path_session,
    }


def _ask_request_snapshot(data: QuestionRequest) -> Dict[str, Any]:
    return {
        "question": data.question,
        "continuation_intent": data.continuation_intent,
        "conversation_context": (
            data.conversation_context.model_dump()
            if data.conversation_context is not None
            else None
        ),
        "parent_analysis_context": (
            data.parent_analysis_context.model_dump()
            if data.parent_analysis_context is not None
            else None
        ),
        "dashboard_filters": [f.model_dump() for f in data.dashboard_filters],
        "date_range": (
            data.date_range.model_dump() if data.date_range is not None else None
        ),
    }


def _ask_plan_snapshot(
    plan: Dict[str, Any], sidecar: Optional[Dict[str, Any]]
) -> Dict[str, Any]:
    return {
        "ai_context_block": plan.get("ai_context_block"),
        "follow_up_ops": plan.get("follow_up_ops"),
        "scoped_follow_up": plan.get("scoped_follow_up"),
        "scope_question": plan.get("scope_question"),
        "effective_question": plan.get("effective_question"),
        "conversation_sidecar": plan.get("conversation_sidecar") or sidecar,
    }


@app.post("/ask")
def ask_question(data: QuestionRequest, request: Request):
    global df, dataset_profile

    if df is None:
        return {
            "answer": "Please upload a CSV or Excel file first.",
            "visualization": None,
            "analysis": None,
        }

    session_id = resolve_session_id(request)

    if data.phase == "narrative":
        return handle_ask_narrative_phase(data, request, session_id)

    tier = resolve_plan_tier(request)
    ai_ok, ai_msg = usage_tracker.check_ai_question(session_id, tier)
    if not ai_ok:
        raise HTTPException(
            status_code=429,
            detail=limit_error_detail("ai_questions", ai_msg or ""),
        )

    plan = resolve_follow_up_turn(
        data.question,
        data.conversation_context,
        continuation_intent=bool(data.continuation_intent),
        parent_ctx=data.parent_analysis_context,
    )
    if plan.get("blocked"):
        return _json_safe(
            {
                "answer": plan.get("blocked_message")
                or "Please ask an initial analysis question first.",
                "visualization": None,
                "analysis": None,
                "conversation_meta": {
                    "followUpDetected": False,
                    "usingContextSummary": "",
                    "inheritedAssumptionNote": "",
                    "turnId": "",
                    "parentTurnId": None,
                },
            }
        )

    phase = data.phase

    if phase == "full":
        usage_tracker.record_ai_question(session_id)

    prev_filters: List[str] = []
    if data.conversation_context and data.conversation_context.filtersApplied:
        prev_filters = list(data.conversation_context.filtersApplied)

    eff_q = str(plan.get("effective_question") or data.question).strip()
    sidecar = plan.get("conversation_sidecar")
    filter_added: List[str] = []

    turn_id_session = str(uuid.uuid4())
    parent_tid_session = (
        data.conversation_context.turnId if data.conversation_context else None
    )
    is_fu_session = bool(
        sidecar and isinstance(sidecar, dict) and sidecar.get("wasFollowUp")
    )
    follow_chain_session = _extend_follow_up_chain(
        data.conversation_context,
        data.question.strip(),
        is_fu_session,
    )
    lic_id_session = (
        data.conversation_context.lastInsightChartId
        if data.conversation_context
        else None
    )
    drill_path_session = (
        list(data.conversation_context.activeDrillPath or [])
        if data.conversation_context
        else []
    )

    base_profile = dataset_profile or build_profile(df)
    dash_slice, dash_labs = apply_dashboard_filters_to_df(
        df,
        list(data.dashboard_filters or []),
        data.date_range,
    )
    if dash_slice.empty:
        bc_early = build_filter_breadcrumb(
            df,
            base_profile,
            list(data.dashboard_filters or []),
            data.date_range,
        )
        return _json_safe(
            {
                "answer": NO_RECORDS_FILTERS_MSG,
                "visualization": None,
                "analysis": None,
                "conversation_context": {
                    "lastQuestion": eff_q or data.question.strip(),
                    "lastChartTitle": "",
                    "metricColumn": None,
                    "categoryColumn": None,
                    "aggregation": None,
                    "chartType": "",
                    "intentBucket": "",
                    "filtersApplied": prev_filters,
                    "turnId": turn_id_session,
                    "followUpChain": follow_chain_session,
                    "lastInsightChartId": lic_id_session,
                    "activeDrillPath": drill_path_session,
                },
                "conversation_meta": _conversation_meta_payload(
                    sidecar=sidecar,
                    filter_added=[],
                    turn_id=turn_id_session,
                    parent_tid=parent_tid_session,
                    using_summary=(
                        _format_using_context_summary(data.conversation_context)
                        if is_fu_session and data.conversation_context
                        else ""
                    ),
                    is_follow_up=is_fu_session,
                ),
                "dashboard_filter_summary": dash_labs,
                "filter_breadcrumb": bc_early,
            }
        )

    profile_dash = build_profile(dash_slice)
    if sidecar and data.conversation_context:
        fd_follow, flabs = _try_build_follow_up_filtered_df(
            dash_slice,
            profile_dash,
            data.conversation_context,
            data.question.strip(),
        )
        if flabs:
            filter_added = list(flabs)
            plan["filtered_df"] = fd_follow
            sc = dict(sidecar)
            extra = "; ".join(flabs)
            sc["followUpApplied"] = (
                f"{sc.get('followUpApplied', '')} · {extra}".replace("  ", " ").strip(" ·")
            )
            sc["contextUsedLine"] = (
                f"{sc.get('contextUsedLine', '')}\nRow filters: {extra}"
            ).strip()
            sidecar = sc
            plan["conversation_sidecar"] = sc

    final_df = (
        plan["filtered_df"]
        if plan.get("filtered_df") is not None
        else dash_slice
    )
    if final_df.empty:
        bc_e = build_filter_breadcrumb(
            df,
            base_profile,
            list(data.dashboard_filters or []),
            data.date_range,
        )
        return _json_safe(
            {
                "answer": NO_RECORDS_FILTERS_MSG,
                "visualization": None,
                "analysis": None,
                "conversation_context": {
                    "lastQuestion": eff_q or data.question.strip(),
                    "lastChartTitle": "",
                    "metricColumn": None,
                    "categoryColumn": None,
                    "aggregation": None,
                    "chartType": "",
                    "intentBucket": "",
                    "filtersApplied": prev_filters + filter_added,
                    "turnId": turn_id_session,
                    "followUpChain": follow_chain_session,
                    "lastInsightChartId": lic_id_session,
                    "activeDrillPath": drill_path_session,
                },
                "conversation_meta": _conversation_meta_payload(
                    sidecar=sidecar,
                    filter_added=filter_added,
                    turn_id=turn_id_session,
                    parent_tid=parent_tid_session,
                    using_summary=(
                        _format_using_context_summary(data.conversation_context)
                        if is_fu_session and data.conversation_context
                        else ""
                    ),
                    is_follow_up=is_fu_session,
                ),
                "dashboard_filter_summary": dash_labs + filter_added,
                "filter_breadcrumb": bc_e,
            }
        )

    bc_full = build_filter_breadcrumb(
        df,
        base_profile,
        list(data.dashboard_filters or []),
        data.date_range,
    )

    saved_df = df
    saved_prof = dataset_profile
    try:
        df = final_df
        dataset_profile = build_profile(final_df)
        exact_result, visualization, analysis_ctx = compute_visualization_for_question(
            eff_q,
            conversation_sidecar=sidecar,
            follow_up_ops=plan.get("follow_up_ops"),
        )

        if isinstance(analysis_ctx, dict):
            icr_fu = str(analysis_ctx.get("insightConfidenceRationale") or "").strip()
            extras_fu: List[str] = []
            if is_fu_session:
                extras_fu.append(
                    "Follow-up thread: prior metric/dimension focus carries forward unless overridden."
                )
            if filter_added:
                extras_fu.append(
                    "Parsed follow-up filters narrow the cohort; confirm labels match your intent."
                )
            if extras_fu:
                analysis_ctx["insightConfidenceRationale"] = (
                    icr_fu + " " + " ".join(extras_fu)
                ).strip()

        all_row_scope = list(dash_labs) + list(filter_added)
        if visualization and all_row_scope:
            prov = visualization.get("provenance")
            if isinstance(prov, dict):
                prov2 = dict(prov)
                prov2["dashboardFiltersApplied"] = all_row_scope
                visualization["provenance"] = prov2

        if phase == "chart":
            conv_out = _build_ask_conversation_out(
                plan=plan,
                data=data,
                eff_q=eff_q,
                analysis_ctx=analysis_ctx,
                visualization=visualization,
                prev_filters=prev_filters,
                filter_added=filter_added,
                turn_id_session=turn_id_session,
                follow_chain_session=follow_chain_session,
                lic_id_session=lic_id_session,
                drill_path_session=drill_path_session,
            )
            conversation_meta_ok = _conversation_meta_payload(
                sidecar=sidecar,
                filter_added=filter_added,
                turn_id=turn_id_session,
                parent_tid=parent_tid_session,
                using_summary=(
                    _format_using_context_summary(data.conversation_context)
                    if is_fu_session and data.conversation_context
                    else ""
                ),
                is_follow_up=is_fu_session,
            )
            ask_turn_cache.store(
                session_id,
                turn_id_session,
                AskTurnCacheEntry(
                    question=data.question,
                    effective_question=eff_q,
                    exact_result=exact_result,
                    visualization=visualization,
                    analysis_ctx=analysis_ctx,
                    sidecar=sidecar if isinstance(sidecar, dict) else None,
                    plan_snapshot=_ask_plan_snapshot(plan, sidecar),
                    request_snapshot=_ask_request_snapshot(data),
                    dash_labs=list(dash_labs),
                    filter_added=list(filter_added),
                    prev_filters=list(prev_filters),
                    is_follow_up=is_fu_session,
                    parent_turn_id=parent_tid_session,
                    analysis_profile=dict(dataset_profile or {}),
                    filter_breadcrumb=bc_full,
                    follow_chain_session=list(follow_chain_session),
                    lic_id_session=lic_id_session,
                    drill_path_session=list(drill_path_session),
                ),
            )
            usage_tracker.record_ai_question(session_id)
            return _json_safe(
                {
                    "answer": "",
                    "visualization": visualization,
                    "analysis": analysis_ctx,
                    "conversation_context": conv_out,
                    "conversation_meta": conversation_meta_ok,
                    "dashboard_filter_summary": dash_labs,
                    "filter_breadcrumb": bc_full,
                    "narrative_status": "pending",
                    "turn_id": turn_id_session,
                }
            )

        narrative_assembly, _ = build_ask_narrative_prompt(
            question=data.question,
            eff_q=eff_q,
            exact_result=exact_result,
            visualization=visualization,
            analysis_ctx=analysis_ctx,
            plan=plan,
            sidecar=sidecar,
            dash_labs=dash_labs,
            df=df,
            dataset_profile=dataset_profile,
        )
        answer_text = produce_ask_narrative_answer(
            narrative_assembly,
            question=data.question,
            analysis_ctx=analysis_ctx,
            sidecar=sidecar,
            df=df,
            dataset_profile=dataset_profile,
        )

        conv_out = _build_ask_conversation_out(
            plan=plan,
            data=data,
            eff_q=eff_q,
            analysis_ctx=analysis_ctx,
            visualization=visualization,
            prev_filters=prev_filters,
            filter_added=filter_added,
            turn_id_session=turn_id_session,
            follow_chain_session=follow_chain_session,
            lic_id_session=lic_id_session,
            drill_path_session=drill_path_session,
        )

        conversation_meta_ok = _conversation_meta_payload(
            sidecar=sidecar,
            filter_added=filter_added,
            turn_id=turn_id_session,
            parent_tid=parent_tid_session,
            using_summary=(
                _format_using_context_summary(data.conversation_context)
                if is_fu_session and data.conversation_context
                else ""
            ),
            is_follow_up=is_fu_session,
        )

        return _json_safe({
            "answer": answer_text,
            "visualization": visualization,
            "analysis": analysis_ctx,
            "conversation_context": conv_out,
            "conversation_meta": conversation_meta_ok,
            "dashboard_filter_summary": dash_labs,
            "filter_breadcrumb": bc_full,
        })
    finally:
        df = saved_df
        dataset_profile = saved_prof