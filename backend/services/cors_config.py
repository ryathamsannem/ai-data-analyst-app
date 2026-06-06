"""CORS origin parsing for FastAPI."""

from __future__ import annotations

DEFAULT_ALLOWED_ORIGINS = ("http://localhost:3000",)


def parse_allowed_origins(raw: str | None) -> list[str]:
    """Parse comma-separated ALLOWED_ORIGINS; default to localhost:3000 for local dev."""
    if raw is None or not raw.strip():
        return list(DEFAULT_ALLOWED_ORIGINS)
    origins = [origin.strip() for origin in raw.split(",") if origin.strip()]
    return origins or list(DEFAULT_ALLOWED_ORIGINS)
