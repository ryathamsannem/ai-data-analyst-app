"""Health/readiness checks and production startup validation."""

from __future__ import annotations

import os
from typing import Any


def is_production() -> bool:
    env = (os.getenv("APP_ENV") or os.getenv("ENVIRONMENT") or "").strip().lower()
    return env in ("production", "prod")


def ai_narrative_enabled() -> bool:
    flag = (os.getenv("AI_NARRATIVE_ENABLED") or "true").strip().lower()
    return flag not in ("0", "false", "no", "off")


def anthropic_api_key_present() -> bool:
    return bool((os.getenv("ANTHROPIC_API_KEY") or "").strip())


def validate_startup_config() -> None:
    """Fail fast in production when AI narrative is enabled without an API key."""
    if is_production() and ai_narrative_enabled() and not anthropic_api_key_present():
        raise RuntimeError(
            "ANTHROPIC_API_KEY is required when APP_ENV=production and AI narrative is enabled."
        )


def get_health_payload() -> dict[str, str]:
    return {"status": "ok", "service": "ai-data-analyst-backend"}


def get_ready_payload() -> dict[str, Any]:
    key_required = ai_narrative_enabled()
    key_present = anthropic_api_key_present()
    prod = is_production()

    checks: dict[str, Any] = {
        "app": True,
        "environment": "production" if prod else "development",
        "ai_narrative_enabled": key_required,
        "anthropic_api_key_present": key_present,
    }

    warnings: list[str] = []
    if key_required and not key_present and not prod:
        warnings.append(
            "ANTHROPIC_API_KEY is missing; AI narrative will use fallback text in development."
        )

    ready = checks["app"]
    if key_required and prod:
        ready = ready and key_present

    return {
        "ready": ready,
        "checks": checks,
        "warnings": warnings,
    }
