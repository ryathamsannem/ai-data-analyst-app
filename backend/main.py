from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import pandas as pd
from anthropic import Anthropic
from dotenv import load_dotenv
import os
from io import BytesIO
from typing import Optional

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


def build_suggested_questions():
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

    questions = []

    if product_col and sales_col:
        questions.extend(
            [
                "Show sales by product",
                "Which product has highest sales?",
            ]
        )

    if region_col and sales_col:
        questions.append("Show sales by region")

    if customer_col and sales_col:
        questions.append("Show top customers by sales")

    if profit_col and product_col:
        questions.append("Show profit by product")

    if date_col and sales_col:
        questions.append("Monthly sales trend")

    if not questions:
        questions = [
            "Show sales by product",
            "Which product has highest sales?",
            "Show sales by region",
        ]

    return questions


def build_upload_response(sheet_names):
    global df, selected_sheet_name, column_mapping, uploaded_file_name, uploaded_file_bytes, dataset_profile

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

    return {
        "kpis": updated_kpis,
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
        target = find_target_numeric_column()
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


@app.post("/ask")
def ask_question(data: QuestionRequest):
    global df

    if df is None:
        return {
            "answer": "Please upload a CSV or Excel file first.",
            "chart": [],
            "chart_type": "",
        }

    exact_result, chart_data, chart_type = analyze_data(data.question)
    trend_rule = ""
    if chart_type == "line":
        trend_rule = "- Explain only the monthly trend shown in the calculated result.\n"

    ctx = get_ai_context(sample_rows=10)
    prompt = f"""
You are a business data analyst for small and medium businesses.

User question:
{data.question}

Dataset context (use this, do not invent columns):
{ctx}

Exact calculated result:
{exact_result}

Rules:
- Explain in simple business language.
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
        "answer": response.content[0].text,
        "chart": chart_data,
        "chart_type": chart_type,
    }