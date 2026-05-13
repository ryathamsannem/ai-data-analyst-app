from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict, Field
import pandas as pd
from anthropic import Anthropic
from dotenv import load_dotenv
import os
from io import BytesIO
from typing import Optional, List, Dict, Any, Tuple, Callable
from contextlib import contextmanager
import re
import math
import json
import logging
import uuid

from analytics_metadata import build_metric_label

load_dotenv()

logger = logging.getLogger(__name__)

client = Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
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


class QuestionRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    question: str
    conversation_context: Optional[ConversationContextPayload] = None
    dashboard_filters: List[DashboardFilterEntryModel] = Field(default_factory=list)
    date_range: Optional[DashboardDateRangeModel] = None


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


def _normalize_internal_chart_type(raw: Optional[str]) -> str:
    """Map synonyms to internal kinds; unknown kinds fall back to bar (safe render)."""
    t = (raw or "bar").strip().lower().replace("-", "_")
    if t in ("timeseries", "time_series"):
        return "line"
    known = frozenset(
        ("bar", "bar_horizontal", "pie", "donut", "line", "area", "scatter")
    )
    if t in known:
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

        # Date: mixed-format parsing + optional boost when the header looks temporal.
        date_ratio = _datetime_parse_ratio(s)
        date_named = bool(_DATE_COL_NAME_HINT.search(str(col)))

        if numeric_ratio >= 0.9:
            result[col] = "number"
            continue
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

    return {
        "column_types": column_types,
        "null_counts": null_counts,
        "summary_stats": summary_stats,
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


def get_ai_context(sample_rows: int = 10):
    """Keep prompts small: schema + stats + tiny sample."""
    global df, selected_sheet_name, uploaded_file_name, dataset_profile
    if df is None:
        return {}

    profile = dataset_profile or build_profile(df)
    sample = df.head(sample_rows).to_dict(orient="records")
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
    mfg = sum(1 for k in mfg_kw if k in joined)
    eco = sum(1 for k in ecom_kw if k in joined)
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
        ("state", 18),
        ("country", 22),
        ("city", 20),
        ("zip", 10),
        ("postal", 12),
        ("territory", 26),
        ("location", 16),
        ("market", 14),
        ("geo", 10),
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
    ):
        if kw in n:
            score += w
            reasons.append(f"name:{kw}+{w}")
    return score, reasons


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
        alt_r = None
        for row in region_cands[1:]:
            c = str(row["column"])
            if c and c not in (proposed.get("product"), proposed.get("customer")):
                alt_r = c
                break
        proposed["region"] = alt_r

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
    global df, column_mapping

    mapped = column_mapping.get(mapping_key)
    if mapped and mapped in df.columns:
        return mapped

    return find_column(possible_names)


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

    product_col = get_mapped_or_detected_column("product", ["product", "item", "sku"])
    sales_col = get_mapped_or_detected_column(
        "sales", ["sales", "revenue", "amount", "total", "value"]
    )

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
    """Rough domain: hr | sales | generic (for KPI labels only)."""
    global df
    if df is None:
        return "generic"
    columns = df.columns.tolist()
    lower = _col_lower_list(columns)

    def col_has(pat_list):
        return any(any(k in c for k in pat_list) for c in lower)

    workforce_signals = col_has(
        ["employee", "emp_", "_emp", "department", "attrition", "salary", "attendance", "staff", "workforce"]
    )
    sales_signals = col_has(["sales", "revenue", "product", "order", "sku", "customer", "invoice"])

    product_col = get_mapped_or_detected_column("product", ["product", "item", "sku"])
    sales_col = get_mapped_or_detected_column("sales", ["sales", "revenue", "amount", "total", "value"])
    salary_col = _find_first_column(columns, ["salary", "ctc", "compensation", "pay", "wage"])
    dept_col = _find_first_column(
        columns, ["department", "dept", "team", "division", "business unit", "business_unit"]
    )

    clear_sales = bool(sales_col and product_col)

    # Prefer HR when people/org signals exist and we're not clearly a product sales cube.
    if workforce_signals and (salary_col or dept_col or not clear_sales):
        if clear_sales and not (salary_col or dept_col):
            return "sales"
        return "hr"

    if clear_sales or (sales_signals and sales_col):
        return "sales"
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
    Returns: manufacturing | ecommerce | hr | sales | generic
    """
    global df
    if df is None or df.empty:
        return "generic"
    columns = df.columns.tolist()
    lower = _col_lower_list(columns)
    base = infer_dataset_kind()
    if base == "hr":
        return "hr"

    mfg_h = _manufacturing_column_hit(lower)
    eco_h = _ecommerce_column_hit(lower)
    auto = infer_auto_dashboard_kind()
    cust_col = get_mapped_or_detected_column(
        "customer", ["customer", "client", "buyer", "account"]
    )
    order_hint = _find_order_id_column(columns)

    if base == "sales":
        if eco_h >= 2 or (eco_h >= 1 and order_hint and cust_col):
            return "ecommerce"
        return "sales"

    if mfg_h >= 2 and mfg_h > eco_h:
        return "manufacturing"
    if auto == "operations" and mfg_h >= 2:
        return "manufacturing"

    return "generic"


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


def build_kpi_cards() -> Tuple[List[Dict[str, Any]], str]:
    """UI + PDF KPI cards with human-facing labels."""
    global df, dataset_profile
    if df is None:
        return [], "generic"

    domain = infer_kpi_domain()
    profile = dataset_profile or build_profile(df)
    kp = calculate_kpis()
    cards: List[Dict[str, Any]] = []
    columns = df.columns.tolist()

    if domain == "hr":
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

        total_employees = int(df[emp_id_col].nunique(dropna=True)) if emp_id_col else int(len(df))
        cards.append(
            {"title": "Total Employees", "value": f"{total_employees:,}", "subtitle": None}
        )

        salary_col = _find_first_column(columns, ["salary", "ctc", "compensation", "pay", "wage"])
        if salary_col:
            sv = numeric_series(salary_col)
            if sv.notna().any():
                avg = float(sv.mean(skipna=True))
                cards.append(
                    {
                        "title": build_metric_label("mean", "average", salary_col),
                        "value": f"{avg:,.0f}",
                        "subtitle": None,
                    }
                )
                amax_idx = sv.idxmax(skipna=True)
                hi_val = float(sv.max(skipna=True))
                name_col = _find_first_column(columns, ["name", "employee name", "full name", "emp_name"]) or emp_id_col
                hi_name = "—"
                if amax_idx is not None and name_col is not None and name_col in df.columns:
                    try:
                        hi_name = str(df.loc[amax_idx, name_col])
                    except Exception:
                        hi_name = "—"
                cards.append(
                    {
                        "title": "Highest Paid Employee",
                        "value": hi_name[:60] + ("..." if len(str(hi_name)) > 60 else ""),
                        "subtitle": f"Salary {hi_val:,.0f}",
                    }
                )
            else:
                cards.append(
                    {
                        "title": build_metric_label("mean", "average", salary_col),
                        "value": "N/A",
                        "subtitle": None,
                    }
                )
                cards.append({"title": "Highest Paid Employee", "value": "N/A", "subtitle": None})
        else:
            ct_fb = profile.get("column_types", {})
            numeric_fallback = [c for c in columns if ct_fb.get(c) == "number"]
            fb_col = numeric_fallback[0] if numeric_fallback else None
            cards.append(
                {
                    "title": build_metric_label("mean", "average", fb_col)
                    if fb_col
                    else "Average metric",
                    "value": "N/A",
                    "subtitle": None,
                }
            )
            cards.append({"title": "Highest Paid Employee", "value": "N/A", "subtitle": None})

        dept_col = _find_first_column(columns, ["department", "dept", "team", "division"])
        if dept_col:
            dcount = int(df[dept_col].nunique(dropna=True))
            cards.append({"title": "Departments", "value": f"{dcount:,}", "subtitle": None})
        else:
            cards.append({"title": "Departments", "value": "N/A", "subtitle": None})

        return cards[:4], domain

    if domain == "manufacturing":
        cards = _build_manufacturing_kpi_cards(columns, profile)
        return (cards[:5] if cards else _build_generic_executive_kpi_cards(columns, profile)), domain

    if domain == "ecommerce":
        cards = _build_ecommerce_kpi_cards(columns, profile, kp)
        if not cards:
            cards = _build_generic_executive_kpi_cards(columns, profile)
        return cards[:5], domain

    if domain == "sales":
        if kp.get("total_sales") is not None:
            cards.append(
                {
                    "title": "Total Sales",
                    "value": f'{float(kp["total_sales"]):,.0f}',
                    "subtitle": None,
                }
            )
        else:
            cards.append({"title": "Total Sales", "value": "N/A", "subtitle": None})

        if kp.get("top_product"):
            tp = kp["top_product"]
            cards.append(
                {
                    "title": "Top Product",
                    "value": str(tp.get("name", "—"))[:60],
                    "subtitle": f'{float(tp.get("value", 0)):,.0f}',
                }
            )
        else:
            cards.append({"title": "Top Product", "value": "N/A", "subtitle": None})

        if kp.get("unique_products") is not None:
            cards.append(
                {
                    "title": "Products",
                    "value": f'{int(kp["unique_products"]):,}',
                    "subtitle": None,
                }
            )
        else:
            cards.append({"title": "Products", "value": "N/A", "subtitle": None})

        date_col = get_mapped_or_detected_column(
            "date",
            ["date", "order date", "transaction date", "invoice date", "month", "period"],
        )
        sales_col = get_mapped_or_detected_column(
            "sales",
            ["sales", "revenue", "amount", "total", "value"],
        )
        order_col = _find_order_id_column(columns)
        if order_col:
            try:
                uo = int(df[order_col].nunique(dropna=True))
                if uo > 0:
                    cards.append(
                        {
                            "title": "Distinct orders / transactions",
                            "value": f"{uo:,}",
                            "subtitle": "Count of unique order keys in this file",
                        }
                    )
            except Exception:
                pass
        elif date_col and sales_col:
            cards.append(
                {
                    "title": "Trend-ready",
                    "value": "Yes",
                    "subtitle": "Date + revenue fields detected for time-series questions",
                }
            )

        return cards[:5], domain

    cards = _build_generic_executive_kpi_cards(columns, profile)
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

    if product_col and sales_col_guess:
        scores["sales"] += 6

    hr_strong_row = ("salary" in " ".join(lower)) and any(
        x in " ".join(lower) for x in ["department", "dept", "team"]
    )
    if hr_strong_row:
        scores["hr"] += 4
    if any("attrition" in c or "employee" in c for c in lower):
        scores["hr"] += 2

    base_kind = infer_dataset_kind()
    if base_kind == "hr":
        return "hr"
    if base_kind == "sales":
        return "sales"

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
    if len(out) >= 3:
        return
    title = str(payload.get("title") or "").strip()
    if not title:
        return
    if any(str(c.get("title", "")).strip() == title for c in out):
        return
    out.append(payload)


def _dash_series_payload(
    title: str,
    series: pd.Series,
    *,
    chart_type: str,
    max_points: int = 14,
    category_column: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    if series is None or series.empty:
        return None
    ct_in = chart_type.strip().lower()
    if ct_in == "line":
        try:
            order = sorted(series.index.tolist(), key=lambda x: str(x))
            series = series.reindex(order).dropna(how="all").head(max_points)
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
    ct_norm = chart_type.strip()
    if ct_norm.lower() == "horizontalbar":
        ct_norm = "horizontalBar"
    elif ct_norm.lower() == "donut":
        ct_norm = "donut"
    elif ct_norm.lower() == "pie":
        ct_norm = "pie"
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
        out["interaction"] = {
            "drillDimensions": [
                {
                    "column": cc,
                    "role": "primary",
                    "label": _pretty_label_text(cc),
                }
            ]
        }
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
                        chart_type="horizontalBar",
                        category_column=loc_col,
                    ),
                )
        except Exception:
            pass

    return out_ch[:3]


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
        title = (
            "Revenue by category"
            if any(
                k in str(product_col).lower()
                for k in ("category", "segment", "class", "type")
            )
            else "Revenue by product"
        )
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
                        "Revenue by region",
                        g,
                        chart_type="bar",
                        category_column=region_col,
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
                _append_unique_dashboard_chart(
                    out_ch,
                    _dash_series_payload(
                        f"Sales trend ({tb})", g_series, chart_type="line"
                    ),
                )
        except Exception:
            pass

    return out_ch[:3]


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

    exclude: set = set()
    cat1 = _dash_pick_generic_category(df, columns, ct, exclude)
    if cat1:
        exclude.add(cat1)
    num1 = _dash_pick_generic_numeric(df, columns, ct, exclude)

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
                    ),
                )
        except Exception:
            pass

    date_c = _dash_pick_generic_date(df, columns, ct)
    num_for_trend = _dash_pick_generic_numeric(df, columns, ct, exclude)
    if date_c and num_for_trend and date_c != num_for_trend:
        try:
            g_series, _tsm = _adaptive_time_series_grouped(
                df, str(date_c), str(num_for_trend), agg_key="sum"
            )
            if g_series is not None and len(g_series) >= 2:
                lbl = _pretty_label_text(num_for_trend)
                tb = _freq_human_label(str(_tsm.get("timeBucket") or "M"))
                tit = f"{lbl} trend ({tb})"
                _append_unique_dashboard_chart(
                    out_ch,
                    _dash_series_payload(tit, g_series, chart_type="line"),
                )
        except Exception:
            pass

    cat_dist = _dash_pick_generic_category(df, columns, ct, exclude)
    if cat_dist and cat_dist in df.columns:
        try:
            vc = df[cat_dist].dropna().astype(str).value_counts().head(12)
            if not vc.empty and len(out_ch) < 3:
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
                    ),
                )
        except Exception:
            pass

    return out_ch[:3]


def build_auto_dashboard_charts(kind: str) -> List[Dict[str, Any]]:
    if kind == "hr":
        return _dash_hr_dashboard_charts()
    if kind == "sales":
        return _dash_sales_dashboard_charts()
    return _dash_generic_dashboard_charts(kind)


def build_auto_dashboard() -> Dict[str, Any]:
    global df, dataset_profile
    kind = infer_auto_dashboard_kind()
    label = AUTO_DASHBOARD_LABELS[kind]

    out: Dict[str, Any] = {"kind": kind, "type_label": label, "cards": [], "charts": []}
    if df is None:
        return out

    profile = dataset_profile or build_profile(df)
    ct = profile.get("column_types", {})
    columns = df.columns.tolist()
    kp = calculate_kpis()
    cards: List[Dict[str, Any]] = []

    def typed_count(tp: str) -> int:
        return sum(1 for col in columns if ct.get(col) == tp)

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

    if kind == "hr":
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

        total_employees = int(df[emp_id_col].nunique(dropna=True)) if emp_id_col else int(len(df))
        cards.append(
            {"title": "Total Employees", "value": f"{total_employees:,}", "subtitle": None}
        )

        salary_col = _find_first_column(columns, ["salary", "ctc", "compensation", "pay", "wage"])
        if salary_col:
            sv = numeric_series(salary_col)
            if sv.notna().any():
                avg = float(sv.mean(skipna=True))
                hi_val = float(sv.max(skipna=True))
                cards.append(
                    {
                        "title": build_metric_label("mean", "average", salary_col),
                        "value": f"{avg:,.0f}",
                        "subtitle": None,
                    }
                )
                cards.append(
                    {
                        "title": build_metric_label("max", "maximum", salary_col),
                        "value": f"{hi_val:,.0f}",
                        "subtitle": None,
                    }
                )
            else:
                cards.append(
                    {
                        "title": build_metric_label("mean", "average", salary_col),
                        "value": "N/A",
                        "subtitle": None,
                    }
                )
                cards.append(
                    {
                        "title": build_metric_label("max", "maximum", salary_col),
                        "value": "N/A",
                        "subtitle": None,
                    }
                )
        else:
            prof_ct = profile.get("column_types", {})
            num_fb = [c for c in columns if prof_ct.get(c) == "number"]
            fb_m = num_fb[0] if num_fb else None
            cards.append(
                {
                    "title": build_metric_label("mean", "average", fb_m)
                    if fb_m
                    else "Average metric",
                    "value": "N/A",
                    "subtitle": None,
                }
            )
            cards.append(
                {
                    "title": build_metric_label("max", "maximum", fb_m)
                    if fb_m
                    else "Maximum metric",
                    "value": "N/A",
                    "subtitle": None,
                }
            )

        dept_col = _find_first_column(columns, ["department", "dept", "team", "division"])
        if dept_col:
            cards.append(
                {
                    "title": "Department Count",
                    "value": f'{int(df[dept_col].nunique(dropna=True)):,}',
                    "subtitle": None,
                }
            )
        else:
            cards.append({"title": "Department Count", "value": "N/A", "subtitle": None})

        risk_col = _find_attrition_risk_column(columns)
        if risk_col and risk_col in df.columns:
            hi_cnt, denom = _count_high_attrition_risk(df[risk_col])
            sub = f"{hi_cnt:,} of {denom:,} flagged" if denom else None
            cards.append(
                {"title": "High Attrition Risk Count", "value": f"{hi_cnt:,}", "subtitle": sub}
            )

        out["cards"] = clamp_cards(cards)
        out["charts"] = build_auto_dashboard_charts(kind)
        return out

    if kind == "sales":
        sales_col_inner = get_mapped_or_detected_column(
            "sales", ["sales", "revenue", "amount", "total", "value"]
        )
        rev_label = "Total Revenue"
        if sales_col_inner and "revenue" not in str(sales_col_inner).lower():
            rev_label = "Total Sales"

        if kp.get("total_sales") is not None:
            cards.append(
                {
                    "title": rev_label,
                    "value": f'{float(kp["total_sales"]):,.0f}',
                    "subtitle": None,
                }
            )
        else:
            cards.append({"title": rev_label, "value": "N/A", "subtitle": None})

        if kp.get("top_product"):
            tp = kp["top_product"]
            cards.append(
                {
                    "title": "Top Product",
                    "value": str(tp.get("name", "—"))[:60],
                    "subtitle": f'{float(tp.get("value", 0)):,.0f}',
                }
            )
        else:
            cards.append({"title": "Top Product", "value": "N/A", "subtitle": None})

        if kp.get("unique_products") is not None:
            cards.append(
                {
                    "title": "Product Count",
                    "value": f'{int(kp["unique_products"]):,}',
                    "subtitle": None,
                }
            )
        else:
            cards.append({"title": "Product Count", "value": "N/A", "subtitle": None})

        region_col = get_mapped_or_detected_column(
            "region", ["region", "state", "city", "location", "country", "territory"]
        )
        sales_col_eff = sales_col_inner
        if region_col and sales_col_eff:
            temp = df[[region_col, sales_col_eff]].copy()
            temp["_v"] = numeric_series(sales_col_eff)
            g = temp.groupby(region_col, dropna=True)["_v"].sum().sort_values(ascending=False)
            if not g.empty:
                top_reg = str(g.index[0])[:42]
                top_val = float(g.iloc[0])
                cards.append(
                    {
                        "title": "Best Region",
                        "value": top_reg,
                        "subtitle": rev_label.replace("Total ", "") + f" {top_val:,.0f}",
                    }
                )

        order_col = _find_order_id_column(columns)
        if order_col and sales_col_eff and kp.get("total_sales") is not None:
            sub_o = df[[order_col, sales_col_eff]].dropna(subset=[order_col])
            sub_o["_v"] = numeric_series(sales_col_eff)
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

        out["cards"] = clamp_cards(cards)
        out["charts"] = build_auto_dashboard_charts(kind)
        return out

    if kind == "generic":
        cards = _build_generic_executive_kpi_cards(columns, profile)
        out["cards"] = clamp_cards(cards)
        out["charts"] = build_auto_dashboard_charts(kind)
        return out

    if kind == "finance":
        cards.append({"title": "Total Records", "value": f"{int(len(df)):,}", "subtitle": None})
        amt_col = _find_first_column(
            columns,
            ["amount", "total_amount", "value", "debit", "credit", "payment", "budget", "expense", "balance", "net"],
        )
        if amt_col:
            sv = numeric_series(amt_col)
            if sv.notna().any():
                cards.append(
                    {
                        "title": "Sum of Amounts",
                        "value": f"{float(sv.sum(skipna=True)):,.0f}",
                        "subtitle": str(amt_col)[:42],
                    }
                )

        profit_col = _find_first_column(
            columns, ["profit", "net profit", "ebitda", "margin", "income"]
        )
        if profit_col:
            pv = numeric_series(profit_col)
            if pv.notna().any():
                cards.append(
                    {
                        "title": "Total Profit",
                        "value": f"{float(pv.sum(skipna=True)):,.0f}",
                        "subtitle": None,
                    }
                )

        acct_col = _find_first_column(
            columns, ["account", "gl_", "cost_center", "category", "line item"]
        )
        if acct_col:
            cards.append(
                {
                    "title": "Distinct Accounts",
                    "value": f'{int(df[acct_col].nunique(dropna=True)):,}',
                    "subtitle": None,
                }
            )

        date_col = _find_first_column(columns, ["date", "period", "month", "fiscal"])
        cards.append({"title": "Total Columns", "value": f"{len(columns):,}", "subtitle": None})

        if date_col:
            dc = pd.to_datetime(df[date_col], errors="coerce").dropna()
            if len(dc) >= 2:
                rng = dc.max() - dc.min()
                cards.append(
                    {
                        "title": "Date Span",
                        "value": str(rng.days) + " days",
                        "subtitle": f"{dc.min().date()} → {dc.max().date()}",
                    }
                )

        out["cards"] = clamp_cards(cards)
        out["charts"] = build_auto_dashboard_charts(kind)
        return out

    if kind == "operations":
        cards.append({"title": "Total Records", "value": f"{int(len(df)):,}", "subtitle": None})

        vol_col = _find_first_column(
            columns,
            ["quantity", "units", "qty", "volume", "shipped", "produced", "output", "throughput"],
        )
        if vol_col:
            qv = numeric_series(vol_col)
            if qv.notna().any():
                cards.append(
                    {
                        "title": "Total Volume",
                        "value": f"{float(qv.sum(skipna=True)):,.0f}",
                        "subtitle": str(vol_col)[:42],
                    }
                )

        sku_like = _find_first_column(columns, ["sku", "item_id", "part", "material"])
        if sku_like:
            cards.append(
                {
                    "title": "Unique SKUs",
                    "value": f'{int(df[sku_like].nunique(dropna=True)):,}',
                    "subtitle": None,
                }
            )

        loc_col = _find_first_column(
            columns, ["warehouse", "site", "location", "plant", "facility"]
        )
        if loc_col:
            cards.append(
                {
                    "title": "Sites / Warehouses",
                    "value": f'{int(df[loc_col].nunique(dropna=True)):,}',
                    "subtitle": None,
                }
            )

        def_col = _find_first_column(columns, ["defect", "scrap", "rework", "downtime"])
        if def_col:
            dv = numeric_series(def_col)
            if dv.notna().any():
                cards.append(
                    {
                        "title": "Total Defects / Events",
                        "value": f"{float(dv.sum(skipna=True)):,.0f}",
                        "subtitle": str(def_col)[:38],
                    }
                )

        out["cards"] = clamp_cards(cards)
        out["charts"] = build_auto_dashboard_charts(kind)
        return out

    if kind == "marketing":
        cards.append({"title": "Total Records", "value": f"{int(len(df)):,}", "subtitle": None})

        spend_col = _find_first_column(columns, ["spend", "cost", "budget", "ad_spend"])
        if spend_col:
            sp = numeric_series(spend_col)
            if sp.notna().any():
                cards.append(
                    {"title": "Total Spend", "value": f"{float(sp.sum()):,.0f}", "subtitle": None}
                )

        impr_col = _find_first_column(columns, ["impression", "imps", "impr"])
        if impr_col:
            im = numeric_series(impr_col)
            if im.notna().any():
                cards.append(
                    {
                        "title": "Total Impressions",
                        "value": f"{float(im.sum()):,.0f}",
                        "subtitle": None,
                    }
                )

        clk_col = _find_first_column(columns, ["click", "clicks"])
        if clk_col:
            ck = numeric_series(clk_col)
            if ck.notna().any():
                cards.append(
                    {"title": "Total Clicks", "value": f"{float(ck.sum()):,.0f}", "subtitle": None}
                )

        conv_col = _find_first_column(columns, ["conversion", "conversions"])
        if conv_col:
            cv = numeric_series(conv_col)
            if cv.notna().any():
                cards.append(
                    {
                        "title": "Total Conversions",
                        "value": f"{float(cv.sum()):,.0f}",
                        "subtitle": None,
                    }
                )

        ctr_col = _find_first_column(columns, ["ctr"])
        if ctr_col:
            ctrv = numeric_series(ctr_col)
            if ctrv.notna().any():
                avg_ctr = float(ctrv.mean(skipna=True))
                if avg_ctr > 1:
                    ctr_show = f"{avg_ctr:.2f}%"
                else:
                    ctr_show = f"{avg_ctr:.2%}"
                cards.append({"title": "Avg CTR", "value": ctr_show, "subtitle": None})

        camp_col = _find_first_column(columns, ["campaign", "channel"])
        if camp_col:
            cards.append(
                {
                    "title": "Active Campaigns",
                    "value": f'{int(df[camp_col].nunique(dropna=True)):,}',
                    "subtitle": None,
                }
            )

        out["cards"] = clamp_cards(cards)
        out["charts"] = build_auto_dashboard_charts(kind)
        return out

    # fallback (should not reach — all kinds handled above)
    out["cards"] = clamp_cards([])
    out["charts"] = build_auto_dashboard_charts(kind)
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
)


def _id_like_column_name(col: Optional[str]) -> bool:
    """Identifiers / keys that read poorly in business questions."""
    if not col:
        return True
    c = str(col).strip().lower().replace(" ", "_")
    if re.search(r"\b(uuid|guid|row_?id|rowid|index|seq|sequence)\b", c):
        return True
    if re.search(
        r"(^|_)(transaction|txn|order|customer|client|user|emp|employee|account|invoice|payment)_?id$|^id$|^ids$",
        c,
    ):
        return True
    if c.endswith("_id") or c.endswith("_ids"):
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
    date_col = get_mapped_or_detected_column(
        "date", ["date", "order date", "transaction date", "invoice date", "month", "period"]
    )
    kpi_domain = infer_kpi_domain()
    date_for_trend = _pick_date_column_for_suggestions(date_col, date_cols, columns, ct)

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
        delay = _resolve_metric(columns, ["delay", "latency", "lead time", "sla breach"], ranked_metrics)
        vol = _resolve_metric(columns, ["volume", "orders", "units", "throughput", "output"], ranked_metrics)
        ship = _find_first_column(columns, ["shipment", "delivery", "dispatch", "fulfillment"])
        sla = _find_first_column(columns, ["sla", "otif", "on time", "service level"])
        if reg_o and ship:
            scope_o = _dim_scope_plural_from_col(reg_o)
            qs.append(
                _clean_question_sentence(
                    f"Compare {_q_label(ship)} outcomes across {scope_o}"
                )
            )
        if date_col and delay:
            qs.append(_tpl_trend(delay, date_col))
        elif date_col and vol:
            qs.append(_tpl_trend(vol, date_col))
        if sla:
            qs.append(
                _clean_question_sentence(
                    f"How does {_q_label(sla)} vary across the operation?"
                )
            )
        if vol and reg_o:
            qs.append(_tpl_ranking(reg_o, vol, 5))

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

    kpi_cards, dataset_kind = build_kpi_cards()
    auto_dashboard = build_auto_dashboard()
    prof = dataset_profile or build_profile(df)
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
        "kpis": calculate_kpis(),
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


@app.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    global df, uploaded_file_bytes, uploaded_file_name, selected_sheet_name, column_mapping, dataset_profile, available_sheet_names, column_mapping_metadata

    uploaded_file_bytes = await file.read()
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

    lower_name = uploaded_file_name.lower()
    if lower_name.endswith(".csv"):
        try:
            df = pd.read_csv(BytesIO(uploaded_file_bytes))
        except Exception:
            raise HTTPException(status_code=400, detail="Unable to read CSV file.")
        df = clean_dataframe(df)
        if df.empty:
            raise HTTPException(status_code=400, detail="Uploaded file has no data.")
        selected_sheet_name = "CSV"
        dataset_profile = build_profile(df)
        apply_semantic_column_mapping(df, dataset_profile)
        available_sheet_names = ["CSV"]
        return build_upload_response(["CSV"])

    if lower_name.endswith(".xlsx") or lower_name.endswith(".xls"):
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
        selected_sheet_name = best_sheet
        dataset_profile = build_profile(df)
        apply_semantic_column_mapping(df, dataset_profile)
        available_sheet_names = list(sheet_names)

        return build_upload_response(sheet_names)

    raise HTTPException(status_code=400, detail="Unsupported file type. Upload CSV or Excel (.xlsx/.xls).")


@app.post("/select-sheet")
def select_sheet(data: SheetRequest):
    global df, uploaded_file_bytes, uploaded_file_name, selected_sheet_name, column_mapping, dataset_profile, available_sheet_names, column_mapping_metadata

    if uploaded_file_bytes is None:
        raise HTTPException(status_code=400, detail="Please upload an Excel file first.")

    if uploaded_file_name.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Sheet selection is available only for Excel files.")

    excel_file = pd.ExcelFile(BytesIO(uploaded_file_bytes))
    sheet_names = excel_file.sheet_names

    if data.sheet_name not in sheet_names:
        raise HTTPException(status_code=400, detail="Invalid sheet name.")

    df = read_sheet_from_excel(uploaded_file_bytes, data.sheet_name)
    selected_sheet_name = data.sheet_name
    if df.empty:
        raise HTTPException(status_code=400, detail="Selected sheet has no usable data.")
    dataset_profile = build_profile(df)
    apply_semantic_column_mapping(df, dataset_profile)
    available_sheet_names = list(sheet_names)

    return build_upload_response(sheet_names)


@app.post("/preview")
def get_preview(data: PreviewRequest):
    global df

    if df is None:
        raise HTTPException(status_code=400, detail="Please upload a CSV or Excel file first.")

    limit = data.row_limit
    if limit is not None and limit <= 0:
        raise HTTPException(status_code=400, detail="row_limit must be a positive number or null for all rows.")

    if limit is None:
        view = df
    else:
        # Guardrail for accidental huge responses.
        safe_limit = min(int(limit), 10000)
        view = df.head(safe_limit)

    return _json_safe({
        "rows": int(len(df)),
        "preview": view.to_dict(orient="records"),
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
    for key, value in incoming_map.items():
        if value and value in df.columns:
            column_mapping[key] = value
        else:
            column_mapping[key] = None

    roles = meta.get("roles") or {}
    for rk in ("product", "sales", "region", "customer", "profit", "date"):
        rm = dict(roles.get(rk) or {})
        fin = column_mapping.get(rk)
        auto = proposed.get(rk)
        rm["selected"] = fin
        rm["auto_selected"] = auto
        if fin != auto:
            rm["confidence"] = "user"
            rm["override_note"] = "Saved mapping differs from auto-detect."
        roles[rk] = rm
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
        r"\bwhich\s+([a-z0-9][a-z0-9_\s]{0,48}?)\s+(?:has|have|shows?)\b",
        ql,
        re.I,
    )
    if not m:
        return None
    return m.group(1).strip()


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
    metric_ok = bool(intent_debug and intent_debug.get("value_col"))
    primary_ok = bool(intent_debug and intent_debug.get("group_col"))
    sec_ok = bool(multi_rendered and secondary_requested)
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
    p = phrase.lower().replace(" ", "_").strip()
    ct = profile.get("column_types", {})
    best = None
    best_score = 0
    for c in columns:
        cn = str(c).lower().replace(" ", "_")
        score = 0
        if p == cn:
            score = 100
        elif p in cn or cn in p:
            score = 75
        else:
            toks = [t for t in p.split("_") if len(t) > 1]
            if toks and all(any(tok in cn for tok in toks) for tok in toks):
                score = 55
        if ct.get(c) in ("category", "text", "date"):
            score += 4
        if score > best_score:
            best_score = score
            best = c
    return best if best_score >= 50 else None


def _resolve_by_column_from_question(q: str, columns: List[str], profile: Dict[str, Any]) -> Optional[str]:
    phrase = _extract_after_by(q)
    if phrase:
        cat_pool = [
            c
            for c in columns
            if profile.get("column_types", {}).get(c) in ("category", "text", "date")
        ]
        hit = _match_column_from_phrase(phrase, cat_pool or columns, profile)
        if hit:
            return hit
    return None


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

    cand_dims = [
        c for c in columns if ct.get(c) in ("category", "text", "date")
    ]

    phrase = _extract_after_by(ql)
    if phrase:
        hit = _match_column_from_phrase(phrase, cand_dims or columns, profile)
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

    return max(scored, key=lambda t: t[0])[1] if scored else None


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

    if _scatter_pair_from_question(question_str, numeric_cols):
        return None

    cand_dims = [c for c in cols if ct.get(c) in ("category", "text", "date")]
    by_phrases = _extract_all_by_dimension_phrases(ql)
    by_cols_ordered: List[str] = []
    seen_b: set = set()
    for phrase in by_phrases:
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

    secondary_col: Optional[str] = None
    gcol: Optional[str] = None

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
        gcol = _resolve_by_column_from_question(ql, cols, profile)
        if not gcol and by_cols_ordered:
            gcol = by_cols_ordered[0]
        if not gcol:
            gcol = _infer_dimension_column_from_question(question_str, df, profile)

    ncol = _best_numeric_column_for_question(question_str, numeric_cols)
    if ncol is None and (
        re.search(r"\b(count|how many|number of)\b", ql)
        or "employee" in ql
        or "headcount" in ql
    ):
        idc = _find_first_column(
            cols,
            ["employee_id", "emp_id", "staff_id", "employee id", "emp id", "staff id"],
        )
        if idc and gcol and str(idc) != str(gcol):
            ncol = idc
    if ncol is None and len(numeric_cols) == 1:
        ncol = numeric_cols[0]

    if not ncol or not gcol or ncol == gcol:
        return None

    if any(k in ql for k in ["average", "avg", "mean"]):
        agg_label, agg_key = "Average", "mean"
    elif "count" in ql or "how many" in ql or "number of" in ql or "headcount" in ql:
        agg_label, agg_key = "Count", "count"
    elif (re.search(r"\b(sum|total)\b", ql)) and (
        "average" not in ql and "mean" not in ql and "avg" not in ql
    ):
        agg_label, agg_key = "Total", "sum"
    elif "minimum" in ql or "lowest" in ql or re.search(r"\bmin\b", ql):
        agg_label, agg_key = "Minimum", "min"
    elif "maximum" in ql or "highest" in ql or re.search(r"\bmax\b", ql):
        agg_label, agg_key = "Maximum", "max"
    elif any(k in ql for k in ("compare", "versus", " vs ")):
        agg_label, agg_key = "Average", "mean"
    elif any(
        k in ql
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
    ) or re.search(r"\b(by|per)\s+(day|date|week|month|year|quarter)\b", ql):
        agg_label, agg_key = "Total", "sum"
    else:
        agg_label, agg_key = "Average", "mean"

    if agg_key != "count" and ncol not in numeric_cols:
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
    return out_intent


def _fallback_aggregate_chart(
    intent: Dict[str, Any],
) -> Tuple[List[Dict[str, Any]], str, str, Optional[Dict[str, Any]]]:
    """Produce name/value chart rows + internal chart_type + title (+ optional time-series meta)."""
    global df, dataset_profile

    group_col = intent["group_col"]
    target = intent["value_col"]
    agg_key = intent["agg_key"]

    chart_type_internal = "bar"
    profile = dataset_profile or build_profile(df)
    ct = profile.get("column_types", {})

    if agg_key == "count" and ct.get(target) not in ("number",):
        try:
            tmp = df[[group_col, target]].dropna(subset=[group_col])
            if tmp.empty:
                return [], "", "", None
            g = tmp.groupby(group_col).size()
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
            str(group_col),
        )
        return chart_data, chart_type_internal, title, None
    else:
        sub = df[[group_col, target]].copy()
        sub["_v"] = numeric_series(target)
        sub = sub.dropna(subset=[group_col, "_v"])
        if sub.empty:
            return [], "", "", None

        group_is_ts_axis = ct.get(str(group_col)) == "date" or _group_column_is_time_series_eligible(
            df, str(group_col)
        )
        if group_is_ts_axis and str(agg_key) in (
            "sum",
            "mean",
            "min",
            "max",
        ):
            g_series, ts_meta = _adaptive_time_series_grouped(
                df[[group_col, target]].copy(),
                str(group_col),
                str(target),
                agg_key=str(agg_key),
            )
            if g_series is not None and len(g_series) >= 2:
                chart_data = _time_series_rows_from_grouped(g_series)
                tb = _freq_human_label(str(ts_meta.get("timeBucket") or "M"))
                title = f"{_pretty_label_text(str(target))} over time ({tb})".strip()
                return chart_data, "line", title, ts_meta

        if agg_key == "sum":
            g = sub.groupby(group_col)["_v"].sum()
        elif agg_key == "mean":
            g = sub.groupby(group_col)["_v"].mean()
        elif agg_key == "min":
            g = sub.groupby(group_col)["_v"].min()
        elif agg_key == "max":
            g = sub.groupby(group_col)["_v"].max()
        elif agg_key == "count":
            g = sub.groupby(group_col)["_v"].count()
        else:
            g = sub.groupby(group_col)["_v"].mean()

        result = (
            g.reset_index()
            .rename(columns={group_col: "name", "_v": "value"})
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
            str(group_col),
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
    return any(k in ql for k in ("ranking", "rank ", "rank,", "ranked"))


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


def _bucket_labels_for_freq(dt: pd.Series, freq: str) -> pd.Series:
    """Map timestamps to stable bucket label strings for grouping."""
    d = pd.to_datetime(dt, errors="coerce")
    if freq == "M":
        return d.dt.to_period("M").astype(str)
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
        "W": "weekly",
        "D": "daily",
        "H": "hourly",
        "T": "by minute",
        "raw": "raw timestamps",
    }.get(freq, freq)


def _bucket_label_sort_key(label: str) -> Tuple[int, float, str]:
    """Stable ordering for bucket labels (ISO dates, pandas weekly period strings, etc.)."""
    s = str(label).strip()
    t = pd.to_datetime(s, errors="coerce")
    if pd.notna(t):
        return (0, float(t.value), s)
    if "/" in s:
        left = s.split("/", 1)[0].strip()
        t2 = pd.to_datetime(left, errors="coerce")
        if pd.notna(t2):
            return (0, float(t2.value), s)
    return (1, 0.0, s)


def _sort_chronologically_by_bucket_labels(g: pd.Series) -> pd.Series:
    """Reorder aggregated series so line charts read left-to-right in time."""
    if g.empty:
        return g
    idx = [str(x) for x in g.index.tolist()]
    order = sorted(range(len(idx)), key=lambda i: _bucket_label_sort_key(idx[i]))
    return g.iloc[order]


def _adaptive_time_series_grouped(
    df_in: pd.DataFrame, date_col: str, value_col: str, agg_key: str = "sum"
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
    preferred = _preferred_time_bucket_from_span(span)
    meta["spanDays"] = round(span, 4)
    meta["timeCoverage"] = coverage

    freqs: List[str] = []
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

    sp = _scatter_pair_from_question(q, numeric_cols)
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
    )
    pie_kw = (
        "distribution",
        "share",
        "split",
        "breakdown",
        "proportion",
        "percentage",
        "mix",
        "composition",
        "% of ",
        " percent",
    )

    # ---- Line: date bucket + numeric (adaptive daily / weekly / monthly) ----
    if date_cols and numeric_cols and any(k in q for k in trend_kw):
        ncol = _numeric_col_mentioned(q, numeric_cols)
        if ncol is None and len(numeric_cols) == 1:
            ncol = numeric_cols[0]
        dcol = date_cols[0]
        if ncol:
            g_series, ts_meta = _adaptive_time_series_grouped(
                df, str(dcol), str(ncol), agg_key="sum"
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
            # Sparse / degenerate time axis: fall back to category totals if possible.
            if cat_cols:
                ccol = cat_cols[0]
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

    # ---- Pie / donut: category shares ----
    if cat_cols and any(k in q for k in pie_kw):
        ccol = _match_column_from_phrase(_extract_after_by(q) or "", cat_cols, ct) if _extract_after_by(
            q
        ) else None
        if ccol is None:
            for c in cat_cols:
                if str(c).lower() in q:
                    ccol = c
                    break
        if ccol is None:
            ccol = cat_cols[0]
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
            label_col = _pick_label_column(sort_col, cat_cols, columns)
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
                    trace.update(
                        {
                            "category_column": label_col,
                            "numeric_column": sort_col,
                            "aggregation": "value",
                            "aggregation_key": "max",
                            "rows_analyzed": ranked_n,
                            "notes": f"Top {tn} rows by numeric column",
                        }
                    )
                return chart_data, "bar_horizontal", title, subtitle

    # ---- Generic aggregation: metric by category ----
    gcol = _resolve_by_column_from_question(q, columns, ct)
    if gcol and numeric_cols:
        ncol = _numeric_col_mentioned(q, numeric_cols)
        others = [c for c in numeric_cols if c != gcol]
        if ncol is None and len(others) == 1:
            ncol = others[0]
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
                        k in q for k in ("rank", "ranking", "highest", "lowest")
                    )
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

    product_col = get_mapped_or_detected_column("product", ["product", "item", "sku"])
    sales_col = get_mapped_or_detected_column(
        "sales", ["sales", "revenue", "amount", "total", "value"]
    )
    region_col = get_mapped_or_detected_column(
        "region", ["region", "state", "city", "location"]
    )
    customer_col = get_mapped_or_detected_column(
        "customer", ["customer", "client", "buyer", "account"]
    )
    profit_col = get_mapped_or_detected_column(
        "profit", ["profit", "margin", "net profit", "earnings"]
    )
    date_col = get_mapped_or_detected_column(
        "date", ["date", "order date", "transaction date", "invoice date", "month"]
    )

    chart_data = []
    exact_result = ""
    chart_type = ""

    # ---- Simple numeric Q&A via pandas (ground truth) ----
    profile = dataset_profile or build_profile(df)
    numeric_cols = [c for c, t in profile.get("column_types", {}).items() if t == "number"]

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
        best = _best_numeric_column_for_question(q, numeric_cols)
        if best:
            return best
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

    metric = None
    if any(k in q for k in ["average", "avg", "mean"]):
        metric = "mean"
    elif any(k in q for k in ["total", "sum"]):
        metric = "sum"
    elif "min" in q or "minimum" in q or "lowest" in q:
        metric = "min"
    elif "max" in q or "maximum" in q or "highest" in q:
        metric = "max"
    elif "count" in q or "how many" in q or "number of" in q:
        metric = "count"

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
        )
    ) or bool(re.search(r"\b(by|per)\s+(day|date|week|month|year|quarter)\b", q))
    if trend_q:
        cols_list = df.columns.tolist()
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
            r"\b(pct|percent(?:age)?|ratio|rates?|probability|conversion|score|ctr|spread)\b",
            cn,
            re.I,
        )
    )


def _infer_agg_hint_from_question(q_lower: str) -> Optional[str]:
    if any(k in q_lower for k in ("average", "avg", "mean")):
        return "mean"
    if "count" in q_lower or "how many" in q_lower or "number of" in q_lower:
        return "count"
    if re.search(r"\b(sum|total)\b", q_lower):
        return "sum"
    if "minimum" in q_lower or "lowest" in q_lower or re.search(r"\bmin\b", q_lower):
        return "min"
    if "maximum" in q_lower or "highest" in q_lower or re.search(r"\bmax\b", q_lower):
        return "max"
    return None


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


def build_visualization_anchor_for_prompt(viz: Dict[str, Any]) -> str:
    srows = viz.get("stackedBarRows")
    ms = viz.get("multiSeries") if isinstance(viz.get("multiSeries"), dict) else {}
    keys = ms.get("seriesKeys") if isinstance(ms.get("seriesKeys"), list) else []
    labels_map = (
        ms.get("seriesLabels") if isinstance(ms.get("seriesLabels"), dict) else {}
    )
    if isinstance(srows, list) and srows and keys:
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
                if fv == fv and fv != 0.0:
                    parts.append(f"{lab}: {fv:g}")
            if parts:
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
    return "\n".join(rows)


def _chart_type_for_api(internal: str) -> str:
    """Public chart type names for structured visualization payloads."""
    i = (internal or "bar").strip().lower().replace("-", "_")
    if i == "bar_horizontal":
        return "horizontalBar"
    if i in ("timeseries", "time_series"):
        return "line"
    if i in ("pie", "donut", "line", "area", "bar", "scatter"):
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
    if re.search(r"\b(vs\.?|versus|against)\b", q):
        return "relationship"
    if any(
        k in q
        for k in (
            "trend",
            "over time",
            "time series",
            "monthly",
            "by month",
            "quarter",
            "weekly",
            "each month",
            "momentum",
        )
    ):
        return "trend"
    if _question_asks_share_or_composition_pie(q) or (
        "distribution" in q and " by " in q and "average" not in q and "mean" not in q
    ):
        return "distribution"
    if _looks_like_ranking_question(q) or _extract_top_n(q) is not None:
        return "ranking"
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
        r"\b(relationship|correlations?|correlate|correlated|dependency|dependencies)\b",
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
    if not _question_triggers_numeric_relationship_chart(q):
        return None
    ordered = _ordered_numeric_columns_in_question(q, numeric_cols)
    if len(ordered) >= 2:
        return ordered[0], ordered[1]
    return None


def _compute_scatter_relationship_insights(
    df_in: pd.DataFrame,
    xc: str,
    yc: str,
    point_names: List[str],
) -> Dict[str, Any]:
    """Light-weight Pearson + outlier hints for scatter plots."""
    out: Dict[str, Any] = {
        "pearson": None,
        "direction": None,
        "summaryLine": None,
        "strongestOutliers": [],
    }
    try:
        sub = df_in[[xc, yc]].copy()
        sub["_x"] = numeric_series(xc)
        sub["_y"] = numeric_series(yc)
        sub = sub.dropna(subset=["_x", "_y"]).reset_index(drop=True)
        n = int(len(sub))
        if n < 2:
            return out
        r = float(sub["_x"].corr(sub["_y"]))
        if r == r:
            out["pearson"] = round(r, 4)
            if r > 0.25:
                out["direction"] = "positive"
            elif r < -0.25:
                out["direction"] = "negative"
            else:
                out["direction"] = "weak"
        x_mn = str(_pretty_label_text(xc))
        y_mn = str(_pretty_label_text(yc))
        if n >= 3 and r == r:
            if r > 0.25:
                out["summaryLine"] = (
                    f"Correlation is positive (Pearson r ≈ {r:+.2f}): higher {x_mn} "
                    f"generally aligns with higher {y_mn}."
                )
            elif r < -0.25:
                out["summaryLine"] = (
                    f"Correlation is negative (Pearson r ≈ {r:+.2f}): higher {x_mn} "
                    f"generally aligns with lower {y_mn}."
                )
            else:
                out["summaryLine"] = (
                    f"Linear correlation is weak (Pearson r ≈ {r:+.2f}); the relationship may be "
                    f"flat, noisy, or non-linear."
                )
        std_x = float(sub["_x"].std(ddof=0) or 0.0)
        std_y = float(sub["_y"].std(ddof=0) or 0.0)
        if n >= 3 and std_x > 1e-12 and std_y > 1e-12:
            zx = (sub["_x"] - sub["_x"].mean()) / std_x
            zy = (sub["_y"] - sub["_y"].mean()) / std_y
            dist = (zx * zx + zy * zy) ** 0.5
            sub["_d"] = dist
            top_idx = sub["_d"].nlargest(min(2, n)).index.astype(int).tolist()
            olist = []
            for j in top_idx:
                label = point_names[j] if j < len(point_names) else f"•{j + 1}"
                olist.append(
                    {
                        "point": str(label),
                        "note": "Largest joint z-score distance from the series center.",
                    }
                )
            out["strongestOutliers"] = olist
    except Exception:
        pass
    return out


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
    if "distribution" in ql and not any(
        k in ql for k in ("average", "avg", "mean", "median")
    ):
        return True
    return False


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

    if smart_trace.get("multi_series"):
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
        ):
            return (
                "bar",
                "Comparison of one numeric metric across categorical groups; vertical bar chart.",
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

    if base == "bar" and _question_asks_share_or_composition_pie(ql) and 3 <= n <= 10 and not temporal_all:
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
        "visualizationType": _humanize_chart_type_for_provenance(api_type),
        "chartTypeApi": api_type,
        "confidence": confidence,
        "flags": {
            "fallbackAggregateUsed": bool(fallback_used),
            "smartChartRoutingUsed": bool(smart_routing_used),
            "intentStructured": bool(intent_structured),
        },
        "notes": smart_trace.get("notes"),
        "chartSelectionReason": (chart_selection_reason or "").strip() or None,
        "analysisValidation": analysis_validation,
    }
    if smart_trace and isinstance(smart_trace.get("timeSeriesAnalysis"), dict):
        out["timeSeriesAnalysis"] = smart_trace["timeSeriesAnalysis"]
    return out


def _detect_intent_tags(question: str) -> List[str]:
    ql = str(question).lower()
    tags: List[str] = []
    if any(k in ql for k in ("highest", "maximum", "largest", "peak")) or re.search(
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
) -> Dict[str, Any]:
    return {
        "detectedIntent": _chart_selection_question_bucket(ql),
        "categoryCount": int(ll),
        "metricType": _metric_type_for_chart_recommendation(ncol_guess),
        "recommendedChart": _chart_type_for_api(chart_type_internal or "bar"),
        "selectionExplanation": (selection_explanation or "").strip()
        or "Vertical bar chart selected as a stable default.",
    }


def _build_focus_kpis_from_intent(
    intent: Optional[Dict[str, Any]], chart_point_count: int
) -> List[Dict[str, Any]]:
    if not intent:
        return []
    m = intent.get("value_col")
    g = intent.get("group_col")
    agg_lab = intent.get("agg_label")
    met_disp = (
        _business_metric_series_label(
            str(intent.get("agg_key") or ""),
            str(agg_lab or ""),
            str(m) if m else None,
        )
        if m
        else "—"
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


def _insight_confidence_meta(n_rows: int, chart_pts: int) -> Dict[str, Any]:
    """
    Evidence / sample-size metadata for API clients and prompt contracts.
    chart_pts = number of points in the returned chart series (may differ from n_rows).
    """
    n = max(0, int(n_rows))
    cp = max(0, int(chart_pts))
    small = n < 100
    if n <= 0:
        return {
            "analysisRowCount": 0,
            "chartSeriesPointCount": cp,
            "insightConfidenceScore": 0,
            "insightConfidenceLevel": "low",
            "smallSampleCohort": True,
            "insightConfidenceRationale": "No rows in scope for this analysis.",
            "evidenceSummaryLine": "No filtered rows; do not infer business outcomes.",
        }
    if n < 30:
        level, score = "low", 22
        rationale = "Very few rows — treat any pattern as anecdotal."
    elif n < 100:
        level, score = "low", 40
        rationale = "Under 100 rows — avoid definitive business conclusions."
    elif n < 500:
        level, score = "medium", 58
        rationale = "Moderate sample; qualify interpretations."
    elif n < 3000:
        level, score = "medium", 74
        rationale = "Reasonable sample for directional insights."
    else:
        level, score = "high", 90
        rationale = "Large cohort — still anchor claims in the calculated result."

    if cp < 2 and n >= 30:
        score = max(25, score - 10)
        if level == "high" and score < 82:
            level = "medium"
    if cp < 2 and n < 100:
        score = min(score, 35)
        level = "low"

    return {
        "analysisRowCount": n,
        "chartSeriesPointCount": cp,
        "insightConfidenceScore": int(score),
        "insightConfidenceLevel": level,
        "smallSampleCohort": bool(small),
        "insightConfidenceRationale": rationale,
        "evidenceSummaryLine": (
            f"Aggregations and chart are based on {n:,} filtered row(s) "
            f"and {cp} chart series point(s)."
        ),
    }


def _confidence_answer_prompt_block(conf: Dict[str, Any]) -> str:
    """Row-aware instructions appended to the /ask user prompt."""
    n = int(conf.get("analysisRowCount") or 0)
    cp = int(conf.get("chartSeriesPointCount") or 0)
    small = bool(conf.get("smallSampleCohort"))
    level = str(conf.get("insightConfidenceLevel") or "low")
    lines: List[str] = [
        "Confidence-aware reasoning (mandatory):",
        f"- Engine sample: **{n:,} filtered rows**; chart series: **{cp}** point(s). "
        f"Insight confidence level (heuristic): **{level}**.",
        "- Ground every numeric claim in the exact calculated result and/or authoritative chart-values block. "
        "If a claim is not supported there, do not state it.",
        "- Separate your reply into labeled sections (use plain text labels with a colon, no markdown heading symbols):",
        "  1) Statistical observations — only facts visible from the numbers/table.",
        "  2) Inferred hypotheses — clearly marked as not proven, tentative, and tied to what would falsify them.",
        "  3) Recommendations — optional, conservative, and framed as next data to collect or validate (not as facts).",
        "- Do not diagnose data quality, customer dissatisfaction, churn, loyalty, or operational failure "
        "unless the calculated result explicitly quantifies those constructs with defined columns. "
        "If unsupported, say there is insufficient evidence in this sample.",
        "- Avoid words like proves, definitively, clearly indicates, obviously, must be, always when the sample is small "
        "or when no statistical test output is provided.",
    ]
    if small:
        lines.extend(
            [
                f"- **Small sample (<100 rows)** — use cautious phrasing such as "
                f"\"may indicate\", \"could suggest\", \"is consistent with (weakly)\", "
                f"and explicitly mention **small sample size** once.",
                "- Do not present strong business conclusions; prefer exploratory language.",
            ]
        )
    else:
        lines.append(
            "- You may be somewhat more direct than for tiny samples, but still avoid claims "
            "not evidenced by the calculated result."
        )
    return "\n".join(lines)


INSIGHT_SAFETY_SYSTEM_PROMPT = (
    "You are an analyst assistant for tabular business data. "
    "You must not hallucinate columns, metrics, or magnitudes. "
    "Never invent statistical significance: if no p-values, confidence intervals, or "
    "explicit tests appear in the user message, do not claim significance. "
    "Prefer calibrated, honest uncertainty. Keep answers concise and plain text "
    "(no markdown # or **)."
)


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

    conf = _insight_confidence_meta(analysis_row_count, chart_points)

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
    if chart_recommendation:
        out["chartRecommendation"] = chart_recommendation
    if analysis_validation:
        out["analysisValidation"] = analysis_validation
    if partial_visualization_warning:
        out["partialVisualizationWarning"] = partial_visualization_warning.strip()
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
    r"what\s+are\s+the\s+next\s+steps"
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
    if len(s) > 48:
        return False
    return bool(re.match(r"^\s*(why|explain)(\s+that|\s+this|\s+it)?\s*\??\s*$", s, re.I))


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


def resolve_follow_up_turn(
    raw_question: str,
    ctx: Optional[ConversationContextPayload],
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
    is_follow = _looks_like_follow_up_question(rq, has_prior=bool(prior))

    if is_follow and not prior:
        out["blocked"] = True
        out["blocked_message"] = (
            "Please ask an initial analysis question first."
        )
        return out

    if not is_follow or not ctx:
        return out

    explanation = _is_explanation_follow_up(rq)
    thread_meta = _is_thread_meta_follow_up(rq)
    if explanation or thread_meta:
        eff = prior
    else:
        eff = f"{prior} {rq}".strip()

    out["effective_question"] = eff

    prev_summary = (ctx.lastChartTitle or "").strip() or prior[:120]
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

    labs = [x for x in (ctx.lastChartLabelSample or []) if str(x).strip()][:12]
    lab_line = ", ".join(str(x).strip() for x in labs) if labs else "—"
    cmap = ctx.columnMapping or {}
    cmap_lines = "\n".join(
        f"  - {k}: {v}" for k, v in sorted(cmap.items()) if str(v).strip()
    )
    dash_chip = ctx.activeDashboardFilters or []
    dash_lines = "\n".join(f"  - {ln}" for ln in dash_chip if str(ln).strip())
    prev_ans = _clip(ctx.lastAiAnswer, 3600)

    ai_block = (
        "Conversation Context\n"
        "(Follow-up turn — keep reasoning aligned with this thread. "
        "The user's latest message may be short; infer missing subjects from the prior turn.)\n"
        f"- Latest user message: {rq}\n"
        f"- Previous question: {prior}\n"
        f"- Previous chart title: {ctx.lastChartTitle or '—'}\n"
        f"- Previous chart subtitle: {ctx.lastChartSubtitle or '—'}\n"
        f"- Sample category labels (prior chart): {lab_line}\n"
        f"- Prior chart type: {ctx.chartType or '—'}\n"
        f"- Metric column (prior focus): {ctx.metricColumn or '—'}\n"
        f"- Category / grouping column (prior): {ctx.categoryColumn or '—'}\n"
        f"- Aggregation (prior): {ctx.aggregation or '—'}\n"
        f"- Dataset domain hint: {ctx.datasetDomain or '—'}\n"
    )
    if cmap_lines.strip():
        ai_block += "- Column mapping (semantic role → column):\n" + cmap_lines + "\n"
    if dash_lines.strip():
        ai_block += "- Active dashboard filters (this request):\n" + dash_lines + "\n"
    if ctx.filtersApplied:
        ai_block += "- Row-scope notes from prior turns:\n" + "\n".join(
            f"  - {ln}" for ln in ctx.filtersApplied if str(ln).strip()
        ) + "\n"
    ai_block += (
        "- Previous AI answer (excerpt; cite chart numbers from the authoritative block, "
        "not from memory if they differ):\n"
        f"{prev_ans}\n"
    )
    out["ai_context_block"] = ai_block
    out["conversation_sidecar"] = {
        "wasFollowUp": True,
        "previousAnalysisSummary": prev_summary,
        "followUpApplied": follow_line,
        "contextUsedLine": ctx_used,
        "originalFollowUp": rq,
    }
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

    intent_debug = _describe_aggregate_intent(question, df, profile_live)

    partial_visualization_warning: Optional[str] = None
    suppress_auto_charts = False
    used_two_dim_stacked = False
    partial_alignment = False
    chart_suppressed_misleading = False

    exact_result = ""
    chart_data: List[Any] = []
    chart_type = ""
    chart_title = ""
    chart_subtitle = "Generated from AI analysis"

    fallback_used = False
    smart_trace: Dict[str, Any] = {}
    smart_routing_used = False
    alignment_repaired = False

    chart_path_handled = False
    sec_dim = (intent_debug or {}).get("secondary_group_col")
    pri_dim = (intent_debug or {}).get("group_col")
    agg_key_here = str((intent_debug or {}).get("agg_key") or "")

    if (
        intent_debug
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
                fb_rows, fb_type, fb_title, _fb_ts = _fallback_aggregate_chart(intent_one)
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

    if not chart_path_handled:
        exact_result, chart_data, chart_type = analyze_data(question)

    chart_data = list(_normalize_chart_records(chart_data))
    print(
        "[viz] received_question:",
        repr((question or "").strip())[:520],
        flush=True,
    )
    print(
        "[viz] intent_category_col:",
        intent_debug["group_col"] if intent_debug else None,
        "intent_numeric_col:",
        intent_debug["value_col"] if intent_debug else None,
        "intent_agg:",
        (intent_debug.get("agg_label"), intent_debug.get("agg_key")) if intent_debug else None,
        "secondary_dim:",
        intent_debug.get("secondary_group_col") if intent_debug else None,
        "stacked_two_dim:",
        used_two_dim_stacked,
        flush=True,
    )
    print("[viz] after_analyze_chart_points=", len(chart_data), flush=True)

    if not chart_data and intent_debug and not suppress_auto_charts:
        fb_rows, fb_type, fb_title, fb_ts = _fallback_aggregate_chart(intent_debug)
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
                tab_sc = _tabular_exact_from_name_value_rows(
                    [
                        {"name": r.get("name"), "value": r.get("value")}
                        for r in chart_data
                    ],
                    max_rows=32,
                )
                ri0 = smart_trace.get("relationshipInsights") or {}
                sl0 = str(ri0.get("summaryLine") or "").strip()
                extra_sc = "\n\n".join(x for x in (tab_sc, sl0) if x)
                if extra_sc:
                    base_er = (exact_result or "").strip()
                    if not base_er or "No direct chart rule matched" in base_er:
                        exact_result = extra_sc
                    else:
                        exact_result = f"{base_er}\n\n{extra_sc}"

    if (
        chart_data
        and intent_debug
        and intent_debug.get("value_col")
        and smart_routing_used
        and smart_trace.get("numeric_column")
        and not smart_trace.get("multi_series")
    ):
        iv = str(intent_debug["value_col"]).strip()
        sv = str(smart_trace.get("numeric_column")).strip()
        if (
            sv
            and iv
            and sv != iv
            and str(smart_trace.get("aggregation", "")).lower() != "scatter"
        ):
            fb_rows, fb_type, fb_title, fb_ts = _fallback_aggregate_chart(intent_debug)
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

    if not chart_data:
        print(
            "[viz] outgoing_visualization= None fallback_used=", fallback_used,
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
        )
        return exact_result, None, fin(analysis_empty)

    chart_type = _normalize_internal_chart_type(chart_type)

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
            chart_title = _business_chart_title(
                str(intent_debug.get("agg_key") or ""),
                str(intent_debug.get("agg_label") or ""),
                str(intent_debug.get("value_col") or ""),
                str(intent_debug.get("group_col") or ""),
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

    print(
        "[viz] finalized_category_col:",
        intent_debug["group_col"] if intent_debug else None,
        "finalized_numeric_col:",
        intent_debug["value_col"] if intent_debug else None,
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
        )
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
    )

    chart_rec = _build_chart_recommendation_dict(
        ql,
        ll,
        ncol_guess,
        str(chart_type or "bar"),
        chart_sel_reason,
    )

    visualization: Dict[str, Any] = {
        "chartType": _chart_type_for_api(chart_type or "bar"),
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
        visualization["scatterXLabel"] = _pretty_label_text(
            smart_trace.get("scatter_x_column")
        )
        visualization["scatterYLabel"] = _pretty_label_text(
            smart_trace.get("scatter_y_column")
        )
    ri_viz = smart_trace.get("relationshipInsights") if smart_trace else None
    if is_scatter and isinstance(ri_viz, dict) and ri_viz:
        visualization["relationshipInsights"] = _json_safe(ri_viz)

    if conversation_sidecar and isinstance(
        conversation_sidecar.get("contextUsedLine"), str
    ):
        visualization["contextUsed"] = conversation_sidecar["contextUsedLine"]

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
                }
            )[:950],
            flush=True,
        )
    except Exception:
        print("[viz] outgoing_visualization print failed", flush=True)
    return exact_result, visualization, fin(analysis_ctx)


@app.post("/ask")
def ask_question(data: QuestionRequest):
    global df, dataset_profile

    if df is None:
        return {
            "answer": "Please upload a CSV or Excel file first.",
            "visualization": None,
            "analysis": None,
        }

    plan = resolve_follow_up_turn(data.question, data.conversation_context)
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

        viz_anchor = ""
        viz_rule = ""
        if visualization:
            ctype = visualization.get("chartType", "")
            npts = len(visualization.get("labels", []))
            viz_anchor = (
                "\nChart values generated from pandas (AUTHORITATIVE for prose — cite these amounts exactly):\n"
                + build_visualization_anchor_for_prompt(visualization)
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
        if analysis_ctx.get("metricColumn"):
            focus_line = (
                "\nDetected question focus (do not substitute a different metric or column):\n"
                f"- Metric column: {analysis_ctx.get('metricColumn')}\n"
                f"- Breakdown dimension: {analysis_ctx.get('categoryColumn')}\n"
                f"- Aggregation: {analysis_ctx.get('aggregation')} ({analysis_ctx.get('aggregationKey')})\n"
            )
            sec_g = analysis_ctx.get("secondaryGroupColumn")
            if sec_g:
                focus_line += f"- Secondary breakdown dimension: {sec_g}\n"

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

        ctx = get_ai_context(sample_rows=10)
        evidence_line = ""
        esl = analysis_ctx.get("evidenceSummaryLine")
        if isinstance(esl, str) and esl.strip():
            evidence_line = f"\nEvidence scope (use verbatim when discussing sample size):\n{esl.strip()}\n"
        rationale_line = ""
        icr = analysis_ctx.get("insightConfidenceRationale")
        if isinstance(icr, str) and icr.strip():
            rationale_line = f"\nHeuristic confidence note: {icr.strip()}\n"

        conf_prompt = _confidence_answer_prompt_block(
            {
                "analysisRowCount": int(analysis_ctx.get("analysisRowCount") or 0),
                "chartSeriesPointCount": int(
                    analysis_ctx.get("chartSeriesPointCount")
                    or analysis_ctx.get("chartPointCount")
                    or 0
                ),
                "smallSampleCohort": bool(analysis_ctx.get("smallSampleCohort")),
                "insightConfidenceLevel": str(
                    analysis_ctx.get("insightConfidenceLevel") or "low"
                ),
            }
        )
        insight_style_line = (
            "- Mention a clear, evidence-backed takeaway if the numbers support it.\n"
            if not bool(analysis_ctx.get("smallSampleCohort"))
            else "- Favor cautious, exploratory language over definitive business claims.\n"
        )

        prompt = f"""
You are a business data analyst for small and medium businesses.

{conv_block}

User question:
{data.question}

Dataset context (use this, do not invent columns):
{ctx}

Exact calculated result (ground truth metrics / table):
{exact_result}
{focus_line}
{viz_anchor}
{evidence_line}{rationale_line}
Rules:
{viz_rule}- Explain in simple business language.
- Do not use markdown symbols like # or **.
- Keep the answer concise but complete enough to include the three labeled sections when asked below.
{insight_style_line}
{conf_prompt}
{trend_rule}"""

        response = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=520,
            system=INSIGHT_SAFETY_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": prompt}],
        )

        chart_rec_out = (
            analysis_ctx.get("chartRecommendation")
            if isinstance(analysis_ctx.get("chartRecommendation"), dict)
            else {}
        )
        viz_title = ""
        if visualization and isinstance(visualization.get("title"), str):
            viz_title = visualization["title"].strip()
        conv_out = {
            "lastQuestion": eff_q,
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
            "answer": response.content[0].text.strip(),
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