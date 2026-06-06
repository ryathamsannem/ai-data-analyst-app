"""In-memory per-session usage counters for V1 SaaS limits."""

from __future__ import annotations

import threading
import time
from datetime import datetime, timezone
from typing import Any

from services.plan_limits import (
    FREE_AI_QUESTIONS_PER_DAY,
    FREE_PDF_EXPORTS_PER_DAY,
    PAID_AI_QUESTIONS_PER_MONTH,
    PlanTier,
    ai_questions_limit_message,
    get_limits,
    pdf_exports_limit_message,
)


def _utc_day_start_ts() -> float:
    now = datetime.now(timezone.utc)
    start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    return start.timestamp()


def _utc_month_start_ts() -> float:
    now = datetime.now(timezone.utc)
    start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    return start.timestamp()


class UsageTracker:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._sessions: dict[str, dict[str, list[float]]] = {}

    def reset(self) -> None:
        with self._lock:
            self._sessions.clear()

    def _bucket(self, session_id: str) -> dict[str, list[float]]:
        sid = session_id.strip() or "anonymous"
        if sid not in self._sessions:
            self._sessions[sid] = {"ai_questions": [], "pdf_exports": []}
        return self._sessions[sid]

    @staticmethod
    def _prune(events: list[float], window_start: float) -> list[float]:
        return [ts for ts in events if ts >= window_start]

    def _count_since(self, session_id: str, key: str, window_start: float) -> int:
        with self._lock:
            bucket = self._bucket(session_id)
            bucket[key] = self._prune(bucket[key], window_start)
            return len(bucket[key])

    def _record(self, session_id: str, key: str) -> None:
        with self._lock:
            bucket = self._bucket(session_id)
            bucket[key].append(time.time())

    def check_ai_question(self, session_id: str, tier: PlanTier) -> tuple[bool, str | None]:
        limits = get_limits(tier)
        if tier == "free":
            used = self._count_since(session_id, "ai_questions", _utc_day_start_ts())
            cap = FREE_AI_QUESTIONS_PER_DAY
        else:
            used = self._count_since(session_id, "ai_questions", _utc_month_start_ts())
            cap = PAID_AI_QUESTIONS_PER_MONTH
        if used >= cap:
            return False, ai_questions_limit_message(tier)
        return True, None

    def record_ai_question(self, session_id: str) -> None:
        self._record(session_id, "ai_questions")

    def check_pdf_export(self, session_id: str, tier: PlanTier) -> tuple[bool, str | None]:
        if tier == "paid":
            return True, None
        used = self._count_since(session_id, "pdf_exports", _utc_day_start_ts())
        if used >= FREE_PDF_EXPORTS_PER_DAY:
            return False, pdf_exports_limit_message()
        return True, None

    def record_pdf_export(self, session_id: str) -> None:
        self._record(session_id, "pdf_exports")

    def refund_last_pdf_export(self, session_id: str) -> bool:
        """Remove the most recent PDF export event for this session (export failure refund)."""
        with self._lock:
            bucket = self._bucket(session_id)
            events = bucket.get("pdf_exports") or []
            if not events:
                return False
            bucket["pdf_exports"] = events[:-1]
            return True

    def get_usage_snapshot(self, session_id: str, tier: PlanTier) -> dict[str, Any]:
        limits = get_limits(tier)
        if tier == "free":
            ai_used = self._count_since(session_id, "ai_questions", _utc_day_start_ts())
            pdf_used = self._count_since(session_id, "pdf_exports", _utc_day_start_ts())
            ai_remaining = max(0, FREE_AI_QUESTIONS_PER_DAY - ai_used)
            pdf_remaining = max(0, FREE_PDF_EXPORTS_PER_DAY - pdf_used)
        else:
            ai_used = self._count_since(session_id, "ai_questions", _utc_month_start_ts())
            pdf_used = self._count_since(session_id, "pdf_exports", _utc_day_start_ts())
            ai_remaining = max(0, PAID_AI_QUESTIONS_PER_MONTH - ai_used)
            pdf_remaining = None

        return {
            "ai_questions_used": ai_used,
            "ai_questions_remaining": ai_remaining,
            "pdf_exports_used": pdf_used,
            "pdf_exports_remaining": pdf_remaining,
            "limits": limits,
        }


usage_tracker = UsageTracker()
