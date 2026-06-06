"""Extract mock plan tier and session identity from request headers."""

from __future__ import annotations

from fastapi import Request

from services.plan_limits import PlanTier, normalize_plan_tier

SESSION_HEADER = "X-Session-Id"
PLAN_HEADER = "X-Plan-Tier"
DEFAULT_SESSION = "anonymous"


def resolve_session_id(request: Request) -> str:
    sid = (request.headers.get(SESSION_HEADER) or "").strip()
    return sid or DEFAULT_SESSION


def resolve_plan_tier(request: Request) -> PlanTier:
    return normalize_plan_tier(request.headers.get(PLAN_HEADER))


def limit_error_detail(limit: str, message: str) -> dict[str, object]:
    return {
        "code": "limit_exceeded",
        "limit": limit,
        "message": message,
        "upgrade_required": True,
    }
