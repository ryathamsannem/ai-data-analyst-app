"""SaaS plan tier limits for V1 (mock billing — no payment integration)."""

from __future__ import annotations

from typing import Literal, TypedDict

PlanTier = Literal["free", "paid"]

FREE_MAX_FILE_BYTES = 100 * 1024
PAID_MAX_FILE_BYTES = 25 * 1024 * 1024
FREE_MAX_PREVIEW_ROWS = 500
PAID_MAX_DATASET_ROWS = 100_000
PAID_MAX_PREVIEW_ROWS = 100_000
FREE_AI_QUESTIONS_PER_DAY = 10
PAID_AI_QUESTIONS_PER_MONTH = 300
FREE_PDF_EXPORTS_PER_DAY = 1


class PlanLimits(TypedDict):
    tier: PlanTier
    max_file_bytes: int
    max_preview_rows: int
    max_dataset_rows: int | None
    ai_questions_limit: int
    ai_questions_period: Literal["day", "month"]
    pdf_exports_limit: int | None
    pdf_exports_period: Literal["day"] | None
    full_dataset_analysis: bool


def normalize_plan_tier(raw: str | None) -> PlanTier:
    if raw and raw.strip().lower() == "paid":
        return "paid"
    return "free"


def get_limits(tier: PlanTier) -> PlanLimits:
    if tier == "paid":
        return PlanLimits(
            tier="paid",
            max_file_bytes=PAID_MAX_FILE_BYTES,
            max_preview_rows=PAID_MAX_PREVIEW_ROWS,
            max_dataset_rows=PAID_MAX_DATASET_ROWS,
            ai_questions_limit=PAID_AI_QUESTIONS_PER_MONTH,
            ai_questions_period="month",
            pdf_exports_limit=None,
            pdf_exports_period=None,
            full_dataset_analysis=True,
        )
    return PlanLimits(
        tier="free",
        max_file_bytes=FREE_MAX_FILE_BYTES,
        max_preview_rows=FREE_MAX_PREVIEW_ROWS,
        max_dataset_rows=None,
        ai_questions_limit=FREE_AI_QUESTIONS_PER_DAY,
        ai_questions_period="day",
        pdf_exports_limit=FREE_PDF_EXPORTS_PER_DAY,
        pdf_exports_period="day",
        full_dataset_analysis=False,
    )


def format_bytes(num_bytes: int) -> str:
    if num_bytes >= 1024 * 1024:
        mb = num_bytes / (1024 * 1024)
        label = f"{mb:.0f} MB" if mb == int(mb) else f"{mb:.1f} MB"
        return label
    kb = num_bytes / 1024
    label = f"{kb:.0f} KB" if kb == int(kb) else f"{kb:.1f} KB"
    return label


def file_size_limit_message(tier: PlanTier, actual_bytes: int) -> str:
    limits = get_limits(tier)
    cap = format_bytes(limits["max_file_bytes"])
    actual = format_bytes(actual_bytes)
    if tier == "free":
        return (
            f"File size ({actual}) exceeds the Free plan limit ({cap}). "
            "Upgrade to Paid for uploads up to 25 MB."
        )
    return (
        f"File size ({actual}) exceeds the Paid plan limit ({cap}). "
        "Try a smaller file or split your dataset."
    )


def dataset_rows_limit_message(actual_rows: int) -> str:
    cap = PAID_MAX_DATASET_ROWS
    return (
        f"Dataset has {actual_rows:,} rows — the Paid plan supports up to "
        f"{cap:,} rows. Remove rows or upgrade your export pipeline."
    )


def ai_questions_limit_message(tier: PlanTier) -> str:
    limits = get_limits(tier)
    if tier == "free":
        return (
            f"You've reached today's limit of {limits['ai_questions_limit']} AI questions. "
            "Upgrade to Paid for 300 questions per month."
        )
    return (
        f"You've reached this month's limit of {limits['ai_questions_limit']} AI questions. "
        "Contact support to increase your quota."
    )


def pdf_exports_limit_message() -> str:
    return (
        f"You've reached today's limit of {FREE_PDF_EXPORTS_PER_DAY} PDF export. "
        "Upgrade to Paid for unlimited PDF exports."
    )
