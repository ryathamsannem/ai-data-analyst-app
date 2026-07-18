"""Tests for ALLOWED_ORIGINS parsing."""

from __future__ import annotations

import unittest

from services.cors_config import DEFAULT_ALLOWED_ORIGINS, parse_allowed_origins


class TestCorsConfig(unittest.TestCase):
    def test_default_when_unset(self) -> None:
        self.assertEqual(parse_allowed_origins(None), list(DEFAULT_ALLOWED_ORIGINS))
        self.assertEqual(parse_allowed_origins(""), list(DEFAULT_ALLOWED_ORIGINS))
        self.assertEqual(parse_allowed_origins("   "), list(DEFAULT_ALLOWED_ORIGINS))

    def test_single_origin(self) -> None:
        self.assertEqual(
            parse_allowed_origins("https://app.example.com"),
            [*DEFAULT_ALLOWED_ORIGINS, "https://app.example.com"],
        )

    def test_comma_separated_origins(self) -> None:
        raw = "https://app.example.com, https://staging.example.com"
        self.assertEqual(
            parse_allowed_origins(raw),
            [
                *DEFAULT_ALLOWED_ORIGINS,
                "https://app.example.com",
                "https://staging.example.com",
            ],
        )

    def test_ignores_empty_segments(self) -> None:
        self.assertEqual(
            parse_allowed_origins("https://a.com,,https://b.com,"),
            [*DEFAULT_ALLOWED_ORIGINS, "https://a.com", "https://b.com"],
        )

    def test_deduplicates_env_origin_matching_default(self) -> None:
        self.assertEqual(
            parse_allowed_origins("https://ai-data-analyst-app.vercel.app"),
            list(DEFAULT_ALLOWED_ORIGINS),
        )


if __name__ == "__main__":
    unittest.main()
