"""Load uploaded dataset files into pandas DataFrames."""
from __future__ import annotations

import json
import os
from io import BytesIO
from typing import Literal, Tuple, Union

import pandas as pd

DatasetFormat = Literal["csv", "excel", "parquet", "json", "jsonl"]

_PARQUET_UNAVAILABLE_MSG = (
    "Parquet support is not yet enabled on the server. "
    "Please install pyarrow and restart the backend."
)


def _upload_basename(filename: str) -> str:
    return os.path.basename((filename or "").strip())


def _pyarrow_available() -> bool:
    try:
        import pyarrow  # noqa: F401
    except ImportError:
        return False
    return True


def detect_dataset_format(filename: str) -> DatasetFormat | None:
    lower = _upload_basename(filename).lower()
    if lower.endswith(".csv"):
        return "csv"
    if lower.endswith(".xlsx") or lower.endswith(".xls"):
        return "excel"
    if lower.endswith(".parquet"):
        return "parquet"
    if lower.endswith(".jsonl"):
        return "jsonl"
    if lower.endswith(".json"):
        return "json"
    return None


def is_excel_filename(filename: str) -> bool:
    return detect_dataset_format(filename) == "excel"


def unsupported_format_message() -> str:
    return (
        "Unsupported file type. Upload CSV, Excel (.xlsx/.xls), "
        "JSON (.json/.jsonl), or Parquet (.parquet)."
    )


def _single_table_sheet_label(fmt: DatasetFormat) -> str:
    return {"csv": "CSV", "parquet": "Parquet", "json": "JSON", "jsonl": "JSON"}[fmt]


def _coerce_json_dataframe(raw: object) -> pd.DataFrame:
    if isinstance(raw, pd.DataFrame):
        return raw
    if isinstance(raw, pd.Series):
        return raw.to_frame().T
    raise ValueError("JSON did not contain tabular data.")


def _cell_is_nested_json(value: object) -> bool:
    return isinstance(value, (dict, list))


def _flatten_json_dataframe(df: pd.DataFrame) -> pd.DataFrame:
    """
    Flatten nested JSON objects into columns; stringify any remaining dict/list
    cells so downstream pandas stats (nunique, groupby) do not fail.
    """
    if df.empty:
        return df

    sample = df.head(200)
    has_nested = any(
        _cell_is_nested_json(v)
        for v in sample.to_numpy().ravel()
        if v is not None and not (isinstance(v, float) and pd.isna(v))
    )

    if has_nested:
        try:
            records = df.to_dict(orient="records")
            flattened = pd.json_normalize(records, sep=".")
            if not flattened.empty:
                df = flattened
        except (ValueError, TypeError):
            pass

    for col in df.columns:
        ser = df[col]
        if not ser.map(lambda x: _cell_is_nested_json(x) if pd.notna(x) else False).any():
            continue
        df[col] = ser.map(
            lambda x: json.dumps(x, ensure_ascii=False, sort_keys=True)
            if _cell_is_nested_json(x)
            else x
        )

    return df


def _read_json_bytes(file_bytes: bytes, *, lines: bool) -> pd.DataFrame:
    try:
        df = _flatten_json_dataframe(
            _coerce_json_dataframe(pd.read_json(BytesIO(file_bytes), lines=lines))
        )
        return df
    except ValueError:
        if lines:
            raise
        text = file_bytes.decode("utf-8-sig").strip()
        payload = json.loads(text)
        if isinstance(payload, list):
            df = _flatten_json_dataframe(_coerce_json_dataframe(pd.json_normalize(payload)))
            return df
        if isinstance(payload, dict):
            if payload and all(isinstance(v, list) for v in payload.values()):
                df = _flatten_json_dataframe(_coerce_json_dataframe(pd.DataFrame(payload)))
                return df
            df = _flatten_json_dataframe(_coerce_json_dataframe(pd.json_normalize(payload)))
            return df
        raise ValueError("JSON did not contain tabular data.") from None


def load_dataframe_from_upload(
    file: Union[bytes, bytearray],
    filename: str,
) -> Tuple[pd.DataFrame, str]:
    """
    Parse a single-table upload into a DataFrame.

    Args:
        file: Raw file bytes (e.g. from ``UploadFile.read()``).
        filename: Original filename (used for format detection).

    Returns:
        (dataframe, sheet_label) for pseudo-sheet metadata (same pattern as CSV).
    """
    file_bytes = bytes(file)
    fmt = detect_dataset_format(filename)
    if fmt is None or fmt == "excel":
        raise ValueError(unsupported_format_message())

    readable = {"csv": "CSV", "parquet": "Parquet", "json": "JSON", "jsonl": "JSON"}[fmt]

    try:
        if fmt == "csv":
            try:
                df = pd.read_csv(BytesIO(file_bytes))
            except pd.errors.EmptyDataError as exc:
                raise ValueError(
                    "The file appears empty or has no readable rows."
                ) from exc
        elif fmt == "parquet":
            if not _pyarrow_available():
                raise ValueError(_PARQUET_UNAVAILABLE_MSG)
            try:
                df = pd.read_parquet(BytesIO(file_bytes))
            except ImportError as exc:
                raise ValueError(_PARQUET_UNAVAILABLE_MSG) from exc
            except Exception as exc:
                raise ValueError(
                    "Unable to read Parquet file. Check that the file is valid."
                ) from exc
        elif fmt == "jsonl":
            df = _read_json_bytes(file_bytes, lines=True)
        else:
            try:
                df = _read_json_bytes(file_bytes, lines=False)
            except ValueError:
                df = _read_json_bytes(file_bytes, lines=True)
        return df, _single_table_sheet_label(fmt)
    except ValueError:
        raise
    except Exception as exc:
        raise ValueError(f"Unable to read {readable} file.") from exc
