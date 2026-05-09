from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import pandas as pd
from anthropic import Anthropic
from dotenv import load_dotenv
import os
from io import BytesIO
from typing import Optional, List, Dict, Any, Tuple
import re

load_dotenv()

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


class QuestionRequest(BaseModel):
    question: str


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

        # Date
        # pandas>=3 removed infer_datetime_format; inference is automatic
        dt = pd.to_datetime(non_null, errors="coerce")
        date_ratio = float(dt.notna().mean()) if len(non_null) else 0.0

        if numeric_ratio >= 0.9:
            result[col] = "number"
            continue
        if date_ratio >= 0.9:
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


def build_kpi_cards() -> Tuple[List[Dict[str, Any]], str]:
    """UI + PDF KPI cards with human-facing labels."""
    global df, dataset_profile
    kind = infer_dataset_kind()
    if df is None:
        return [], kind

    profile = dataset_profile or build_profile(df)
    ct = profile.get("column_types", {})
    kp = calculate_kpis()
    cards: List[Dict[str, Any]] = []
    columns = df.columns.tolist()

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
                cards.append(
                    {
                        "title": "Average Salary",
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
                cards.append({"title": "Average Salary", "value": "N/A", "subtitle": None})
                cards.append({"title": "Highest Paid Employee", "value": "N/A", "subtitle": None})
        else:
            cards.append({"title": "Average Salary", "value": "N/A", "subtitle": None})
            cards.append({"title": "Highest Paid Employee", "value": "N/A", "subtitle": None})

        dept_col = _find_first_column(columns, ["department", "dept", "team", "division"])
        if dept_col:
            dcount = int(df[dept_col].nunique(dropna=True))
            cards.append({"title": "Departments", "value": f"{dcount:,}", "subtitle": None})
        else:
            cards.append({"title": "Departments", "value": "N/A", "subtitle": None})

        return cards[:4], kind

    if kind == "sales":
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
        if date_col and sales_col:
            cards.append(
                {
                    "title": "Period Trend",
                    "value": "Supported",
                    "subtitle": "Use a monthly / time-based sales question",
                }
            )

        return cards[:4], kind

    # generic
    num_n = sum(1 for c in columns if ct.get(c) == "number")
    cat_n = sum(1 for c in columns if ct.get(c) in ("category", "text"))

    cards = [
        {"title": "Total Rows", "value": f"{int(len(df)):,}", "subtitle": None},
        {"title": "Total Columns", "value": f"{len(columns):,}", "subtitle": None},
        {"title": "Numeric Columns", "value": f"{num_n:,}", "subtitle": None},
        {"title": "Category Columns", "value": f"{cat_n:,}", "subtitle": None},
    ]
    return cards, kind


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


def build_auto_dashboard() -> Dict[str, Any]:
    global df, dataset_profile
    kind = infer_auto_dashboard_kind()
    label = AUTO_DASHBOARD_LABELS[kind]

    out: Dict[str, Any] = {"kind": kind, "type_label": label, "cards": []}
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
                "title": "Total Columns",
                "value": f"{len(columns):,}",
                "subtitle": None,
            },
            {
                "title": "Numeric Columns",
                "value": f"{typed_count('number'):,}",
                "subtitle": None,
            },
            {
                "title": "Category Columns",
                "value": f"{cat_type_count:,}",
                "subtitle": None,
            },
            {
                "title": "Total Rows",
                "value": f"{int(len(df)):,}",
                "subtitle": None,
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
                        "title": "Average Salary",
                        "value": f"{avg:,.0f}",
                        "subtitle": None,
                    }
                )
                cards.append(
                    {
                        "title": "Highest Salary",
                        "value": f"{hi_val:,.0f}",
                        "subtitle": None,
                    }
                )
            else:
                cards.append({"title": "Average Salary", "value": "N/A", "subtitle": None})
                cards.append({"title": "Highest Salary", "value": "N/A", "subtitle": None})
        else:
            cards.append({"title": "Average Salary", "value": "N/A", "subtitle": None})
            cards.append({"title": "Highest Salary", "value": "N/A", "subtitle": None})

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
        return out

    if kind == "generic":
        num_n = typed_count("number")
        cat_n = cat_type_count
        date_n = typed_count("date")
        cards = [
            {"title": "Total Rows", "value": f"{int(len(df)):,}", "subtitle": None},
            {"title": "Total Columns", "value": f"{len(columns):,}", "subtitle": None},
            {"title": "Numeric Columns", "value": f"{num_n:,}", "subtitle": None},
            {"title": "Category Columns", "value": f"{cat_n:,}", "subtitle": None},
            {"title": "Date Columns", "value": f"{date_n:,}", "subtitle": None},
        ]
        out["cards"] = cards[:6]
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

        cards.append(
            {"title": "Numeric Columns", "value": f"{typed_count('number'):,}", "subtitle": None}
        )

        out["cards"] = clamp_cards(cards)
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
        return out

    # fallback (should not reach — all kinds handled above)
    out["cards"] = clamp_cards([])
    return out


def _clean_question_sentence(s: str) -> str:
    s = re.sub(r"\s+", " ", s.strip())
    # avoid doubled words like "... risk risk"
    s = re.sub(r"\b(\w+)\s+\1\b", r"\1", s, flags=re.IGNORECASE)
    return s


def build_suggested_questions():
    global df, dataset_profile

    if df is None:
        return [
            "Show key trends in this dataset",
            "What are the top 5 records by main metric?",
            "What data quality issues should I fix first?",
        ]

    profile = dataset_profile or build_profile(df)
    column_types = profile.get("column_types", {})
    columns = df.columns.tolist()
    lower_cols = [c.lower() for c in columns]

    def contains_any(col_name, keywords):
        c = col_name.lower()
        return any(k in c for k in keywords)

    numeric_cols = [c for c in columns if column_types.get(c) == "number"]
    date_cols = [c for c in columns if column_types.get(c) == "date"]
    category_cols = [c for c in columns if column_types.get(c) in ("category", "text")]

    questions = []

    # Domain hinting: employee/workforce datasets
    workforce_hint = any(
        any(k in c for k in ["employee", "emp", "department", "attendance", "attrition", "salary"])
        for c in lower_cols
    )
    sales_hint = any(
        any(k in c for k in ["sales", "revenue", "product", "order", "customer", "region"])
        for c in lower_cols
    )

    dept_word = "department"
    salary_word = "salary"

    def pretty_fallback_column(col: str) -> str:
        raw = str(col).replace("_", " ").strip()
        return raw[0].lower() + raw[1:] if raw else "this field"

    if workforce_hint:
        dept_col = next((c for c in columns if contains_any(c, ["department", "team", "function"])), None)
        salary_col = next((c for c in columns if contains_any(c, ["salary", "ctc", "compensation", "pay"])), None)
        attrition_col = next((c for c in columns if contains_any(c, ["attrition", "churn", "exit"])), None)
        location_col = next((c for c in columns if contains_any(c, ["location", "city", "region", "office"])), None)
        attendance_col = next((c for c in columns if contains_any(c, ["attendance", "present", "utilization"])), None)

        if dept_col and salary_col:
            questions.append(_clean_question_sentence(f"Which {dept_word} has highest average {salary_word}?"))
        if dept_col and attrition_col:
            ac = str(attrition_col).replace("_", " ").lower()
            if "attrition" in ac:
                phrase = "attrition risk" if "risk" in ac else "attrition"
            else:
                phrase = "risk indicators"
            questions.append(_clean_question_sentence(f"Show {phrase} by {dept_word}"))
        if salary_col:
            questions.append(_clean_question_sentence(f"Top 5 employees by {salary_word}"))
        if location_col:
            questions.append("Location wise employee distribution")
        if dept_col and attendance_col:
            questions.append(
                _clean_question_sentence(f"Which {dept_word} has lowest attendance percentage?")
            )

    if sales_hint:
        sales_col = next((c for c in columns if contains_any(c, ["sales", "revenue", "amount", "total", "value"])), None)
        product_col = next((c for c in columns if contains_any(c, ["product", "item", "sku", "category"])), None)
        region_col = next((c for c in columns if contains_any(c, ["region", "state", "city"])), None)
        product_word = "product"
        sales_word = "sales"

        if sales_col and product_col:
            questions.extend(
                [
                    _clean_question_sentence(f"Show {sales_word} by {product_word}"),
                    _clean_question_sentence(f"Which {product_word} has highest {sales_word}?"),
                ]
            )
        if date_cols and sales_col:
            questions.append(_clean_question_sentence("Monthly sales trend"))
        if region_col and sales_col:
            questions.append(_clean_question_sentence(f"Show {sales_word} by region"))

    # Generic fallbacks by types
    if not questions:
        if numeric_cols and category_cols:
            questions.append(
                _clean_question_sentence(
                    f"Show average {pretty_fallback_column(numeric_cols[0])} by {pretty_fallback_column(category_cols[0])}"
                )
            )
            questions.append(
                _clean_question_sentence(
                    f"Top 5 {pretty_fallback_column(category_cols[0])} by {pretty_fallback_column(numeric_cols[0])}"
                )
            )
        if date_cols and numeric_cols:
            questions.append(
                _clean_question_sentence(
                    f"{pretty_fallback_column(numeric_cols[0]).title()} trend over {pretty_fallback_column(date_cols[0])}"
                )
            )
        if category_cols:
            questions.append(
                _clean_question_sentence(
                    f"{pretty_fallback_column(category_cols[0]).title()} wise record distribution"
                )
            )
        if numeric_cols:
            questions.append(
                _clean_question_sentence(
                    f"What are min, max, and average of {pretty_fallback_column(numeric_cols[0])}?"
                )
            )

    # keep concise and unique
    dedup = []
    seen = set()
    for q in questions:
        qc = _clean_question_sentence(q)
        norm = qc.strip().lower()
        if norm and norm not in seen:
            seen.add(norm)
            dedup.append(qc)

    return dedup[:6] or [
        "Show key trends in this dataset",
        "Which categories contribute most?",
        "What are the top outliers to investigate?",
    ]


def build_upload_response(sheet_names):
    global df, selected_sheet_name, column_mapping, uploaded_file_name, uploaded_file_bytes, dataset_profile

    kpi_cards, dataset_kind = build_kpi_cards()
    auto_dashboard = build_auto_dashboard()
    return {
        "file": {
            "name": uploaded_file_name,
            "size_bytes": len(uploaded_file_bytes) if uploaded_file_bytes else 0,
        },
        "columns": df.columns.tolist(),
        "rows": len(df),
        "preview": df.head(15).to_dict(orient="records"),
        "sheets": sheet_names,
        "selected_sheet": selected_sheet_name,
        "profile": dataset_profile or build_profile(df),
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
    }


@app.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    global df, uploaded_file_bytes, uploaded_file_name, selected_sheet_name, column_mapping, dataset_profile

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

        return build_upload_response(sheet_names)

    raise HTTPException(status_code=400, detail="Unsupported file type. Upload CSV or Excel (.xlsx/.xls).")


@app.post("/select-sheet")
def select_sheet(data: SheetRequest):
    global df, uploaded_file_bytes, uploaded_file_name, selected_sheet_name, column_mapping, dataset_profile

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

    return {
        "rows": int(len(df)),
        "preview": view.to_dict(orient="records"),
    }


@app.post("/update-column-mapping")
def update_column_mapping(data: ColumnMappingRequest):
    global df, selected_sheet_name, uploaded_file_name, uploaded_file_bytes, column_mapping, dataset_profile

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

    for key, value in incoming_map.items():
        if value and value in df.columns:
            column_mapping[key] = value
        else:
            column_mapping[key] = None
    updated_kpis = calculate_kpis()
    dataset_profile = build_profile(df)
    kpi_cards, dataset_kind = build_kpi_cards()
    auto_dashboard = build_auto_dashboard()

    return {
        "kpis": updated_kpis,
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
    }


def _pretty_label_text(raw, max_len: int = 56) -> str:
    s = str(raw).replace("_", " ").strip()
    if len(s) > max_len:
        return s[: max_len - 1] + "…"
    return s


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

    gcol = _resolve_by_column_from_question(ql, cols, profile)
    if not gcol:
        gcol = _infer_dimension_column_from_question(question_str, df, profile)

    ncol = None
    for c in numeric_cols:
        kl = str(c).lower().replace("_", " ")
        if kl in ql or str(c).lower() in ql:
            ncol = c
            break
    if ncol is None and len(numeric_cols) == 1:
        ncol = numeric_cols[0]

    if not ncol or not gcol or ncol == gcol:
        return None

    if any(k in ql for k in ["average", "avg", "mean"]):
        agg_label, agg_key = "Average", "mean"
    elif "count" in ql or "how many" in ql or "number of" in ql:
        agg_label, agg_key = "Count", "count"
    elif (re.search(r"\b(sum|total)\b", ql)) and (
        "average" not in ql and "mean" not in ql and "avg" not in ql
    ):
        agg_label, agg_key = "Total", "sum"
    elif "minimum" in ql or "lowest" in ql or re.search(r"\bmin\b", ql):
        agg_label, agg_key = "Minimum", "min"
    elif "maximum" in ql or "highest" in ql or re.search(r"\bmax\b", ql):
        agg_label, agg_key = "Maximum", "max"
    else:
        agg_label, agg_key = "Average", "mean"

    return {
        "group_col": gcol,
        "value_col": ncol,
        "agg_label": agg_label,
        "agg_key": agg_key,
        "normalized_question": ql,
    }


def _fallback_aggregate_chart(intent: Dict[str, Any]) -> Tuple[List[Dict[str, Any]], str, str]:
    """Produce name/value chart rows + internal chart_type + title from structured intent."""
    global df

    group_col = intent["group_col"]
    target = intent["value_col"]
    agg_key = intent["agg_key"]

    chart_type_internal = "bar"

    sub = df[[group_col, target]].copy()
    sub["_v"] = numeric_series(target)
    sub = sub.dropna(subset=[group_col, "_v"])
    if sub.empty:
        return [], "", ""

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
        return [], "", ""

    title = (
        f"{intent['agg_label']} {_pretty_label_text(target)} by {_pretty_label_text(group_col)}"
    )
    return chart_data, chart_type_internal, title


def _numeric_col_mentioned(q: str, numeric_cols: List[str]) -> Optional[str]:
    ql = q.lower()
    for c in numeric_cols:
        cn = str(c).lower().replace("_", " ")
        if cn in ql or str(c).lower() in ql:
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
        out.append({"name": nm, "value": v})
    return out


def build_smart_chart(question: str) -> Tuple[List[Dict[str, Any]], str, str, str]:
    """When rule-based charts miss, infer bar/line/pie/h-bar from intent + schema."""
    global df, dataset_profile
    subtitle = "Generated from AI analysis"
    if df is None or df.empty:
        return [], "", "", ""

    q = question.lower().strip()
    profile = dataset_profile or build_profile(df)
    ct_map = profile.get("column_types", {})
    columns = df.columns.tolist()

    numeric_cols = [c for c in columns if ct_map.get(c) == "number"]
    date_cols = [c for c in columns if ct_map.get(c) == "date"]
    cat_cols = [c for c in columns if ct_map.get(c) in ("category", "text")]
    ct: Dict[str, Any] = {"column_types": ct_map}

    trend_kw = (
        "trend",
        "over time",
        "time series",
        "monthly",
        "by month",
        "quarter",
        "weekly",
        "each month",
        "every month",
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

    # ---- Line: date bucket + numeric ----
    if date_cols and numeric_cols and any(k in q for k in trend_kw):
        ncol = _numeric_col_mentioned(q, numeric_cols)
        if ncol is None and len(numeric_cols) == 1:
            ncol = numeric_cols[0]
        dcol = date_cols[0]
        if ncol:
            tmp = df[[dcol, ncol]].copy()
            tmp["_dt"] = pd.to_datetime(tmp[dcol], errors="coerce")
            tmp["_v"] = numeric_series(ncol)
            tmp = tmp.dropna(subset=["_dt", "_v"])
            if len(tmp) >= 2:
                tmp["_m"] = tmp["_dt"].dt.to_period("M").astype(str)
                gg = tmp.groupby("_m")["_v"].sum().reset_index().sort_values("_m")
                gg = gg.rename(columns={"_m": "name", "_v": "value"})
                chart_data = [
                    {"name": str(r["name"]), "value": float(r["value"])}
                    for _, r in gg.iterrows()
                ]
                title = f"{_pretty_label_text(ncol)} over time"
                return chart_data, "line", title, subtitle

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
            show = show.dropna(subset=["_v"]).sort_values("_v", ascending=False).head(top_n)
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
                    title = f"{op} {_pretty_label_text(ncol)} by {_pretty_label_text(gcol)}"
                    ctype = "bar_horizontal" if want_h else "bar"
                    return chart_data, ctype, title, subtitle

    return [], "", "", ""


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

    def find_target_numeric_column():
        # Prefer mapped sales if user asks about sales/revenue/amount/total/value
        if any(k in q for k in ["sales", "revenue", "amount", "total", "value"]):
            mapped_sales = get_mapped_or_detected_column(
                "sales", ["sales", "revenue", "amount", "total", "value"]
            )
            if mapped_sales:
                return mapped_sales

        # Match explicit column names in question
        for col in df.columns:
            if str(col).lower() in q and col in numeric_cols:
                return col

        # Fallback: single numeric column
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
            temp["_month"] = temp["_date"].dt.to_period("M").astype(str)
            result = (
                temp.groupby("_month")["_value"]
                .sum()
                .reset_index()
                .sort_values("_month")
            )

            result = result.rename(columns={"_month": "name", "_value": "value"})
            chart_data = result.to_dict(orient="records")
            exact_result = result.to_string(index=False)
            chart_type = "line"
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
    if chart_type_internal == "pie":
        return "pct_1"

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
    labels = viz.get("labels") or []
    disp = viz.get("valueDisplay")
    vals = viz.get("values") or []
    rows = []
    for i, lab in enumerate(labels):
        txt = ""
        if isinstance(disp, list) and i < len(disp) and disp[i] is not None:
            txt = str(disp[i])
        elif i < len(vals):
            txt = str(vals[i])
        rows.append(f"  • {lab}: {txt}")
    return "\n".join(rows)


def _chart_type_for_api(internal: str) -> str:
    """Public chart type names for structured visualization payloads."""
    if internal == "bar_horizontal":
        return "horizontalBar"
    if internal in ("pie", "line", "bar"):
        return internal
    return "bar"


def compute_visualization_for_question(question: str) -> Tuple[str, Optional[Dict[str, Any]]]:
    """
    Structured visualization pipeline: pandas/analysis only (never parse AI prose).
    Returns (exact_numeric_context_for_ai, visualization_or_none).
    """
    global df

    if df is None:
        return "No dataset uploaded.", None

    profile_live = dataset_profile or build_profile(df)
    ql = question.lower().strip()

    intent_debug = _describe_aggregate_intent(question, df, profile_live)

    exact_result, chart_data, chart_type = analyze_data(question)
    chart_data = list(_normalize_chart_records(chart_data))
    chart_title = ""
    chart_subtitle = "Generated from AI analysis"

    fallback_used = False
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
        flush=True,
    )
    print("[viz] after_analyze_chart_points=", len(chart_data), flush=True)

    if not chart_data and intent_debug:
        fb_rows, fb_type, fb_title = _fallback_aggregate_chart(intent_debug)
        if fb_rows:
            chart_data = list(_normalize_chart_records(fb_rows))
            chart_type = (fb_type or "bar").strip() or "bar"
            chart_title = (fb_title or "").strip()
            fallback_used = True
            print("[viz] used_intent_aggregate_fallback rows=", len(chart_data), flush=True)

    if not chart_data:
        sm_data, sm_type, sm_title, sm_sub = build_smart_chart(question)
        if sm_data:
            chart_data = list(_normalize_chart_records(sm_data))
            chart_type = (sm_type or chart_type or "").strip() or "bar"
            chart_title = (sm_title or "").strip()
            chart_subtitle = (sm_sub or chart_subtitle).strip()

    if chart_type == "bar" and chart_data and (
        _looks_like_ranking_question(ql) or len(chart_data) >= 12
    ):
        chart_type = "bar_horizontal"

    if not chart_data:
        print(
            "[viz] outgoing_visualization= None fallback_used=", fallback_used,
            flush=True,
        )
        return exact_result, None

    if not chart_title.strip():
        hinted = None
        if intent_debug:
            hinted = (
                f"{intent_debug['agg_label']} {_pretty_label_text(intent_debug['value_col'])}"
                f" by {_pretty_label_text(intent_debug['group_col'])}"
            )
        chart_title = hinted or _chart_title_from_question(question)

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

    labels: List[str] = []
    vals: List[float] = []
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
    if ll == 0:
        return exact_result, None

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

    visualization: Dict[str, Any] = {
        "chartType": _chart_type_for_api(chart_type or "bar"),
        "title": chart_title.strip(),
        "subtitle": chart_subtitle,
        "labels": labels[:ll],
        "values": rounded_vals,
        "valueDisplay": value_display,
        "roundingHint": round_cat,
    }
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
                }
            )[:950],
            flush=True,
        )
    except Exception:
        print("[viz] outgoing_visualization print failed", flush=True)
    return exact_result, visualization


@app.post("/ask")
def ask_question(data: QuestionRequest):
    global df

    if df is None:
        return {
            "answer": "Please upload a CSV or Excel file first.",
            "visualization": None,
        }

    exact_result, visualization = compute_visualization_for_question(data.question)

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
    if visualization and visualization.get("chartType") == "line":
        trend_rule = "- Focus on the trajectory over periods shown in the calculated result.\n"

    ctx = get_ai_context(sample_rows=10)
    prompt = f"""
You are a business data analyst for small and medium businesses.

User question:
{data.question}

Dataset context (use this, do not invent columns):
{ctx}

Exact calculated result (ground truth metrics / table):
{exact_result}
{viz_anchor}
Rules:
{viz_rule}- Explain in simple business language.
- Do not use markdown symbols like # or **.
- Keep answer short and useful.
- Mention clear business insight if possible.
{trend_rule}"""

    response = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=400,
        messages=[{"role": "user", "content": prompt}],
    )

    return {
        "answer": response.content[0].text.strip(),
        "visualization": visualization,
    }