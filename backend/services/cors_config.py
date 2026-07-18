"""CORS origin parsing for FastAPI."""

from __future__ import annotations

DEFAULT_ALLOWED_ORIGINS = (
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "https://ai-data-analyst-app.vercel.app",
)


def parse_allowed_origins(raw: str | None) -> list[str]:
    """Parse comma-separated ALLOWED_ORIGINS and include safe built-in origins."""
    origins = list(DEFAULT_ALLOWED_ORIGINS)
    if raw and raw.strip():
        origins.extend(origin.strip() for origin in raw.split(",") if origin.strip())
    return list(dict.fromkeys(origins))
