"""Tests for readiness and startup validation."""

from __future__ import annotations

import os
import unittest
from unittest.mock import patch

from services.readiness import (
    anthropic_api_key_present,
    get_ready_payload,
    validate_startup_config,
)


class TestReadiness(unittest.TestCase):
    def test_dev_ready_with_missing_key_and_warning(self) -> None:
        with patch.dict(
            os.environ,
            {"APP_ENV": "development", "ANTHROPIC_API_KEY": "", "AI_NARRATIVE_ENABLED": "true"},
            clear=False,
        ):
            payload = get_ready_payload()
        self.assertTrue(payload["ready"])
        self.assertFalse(payload["checks"]["anthropic_api_key_present"])
        self.assertTrue(any("ANTHROPIC_API_KEY" in w for w in payload["warnings"]))

    def test_production_not_ready_without_key(self) -> None:
        with patch.dict(
            os.environ,
            {"APP_ENV": "production", "ANTHROPIC_API_KEY": "", "AI_NARRATIVE_ENABLED": "true"},
            clear=False,
        ):
            payload = get_ready_payload()
        self.assertFalse(payload["ready"])
        self.assertEqual(payload["checks"]["environment"], "production")

    def test_production_ready_with_key(self) -> None:
        with patch.dict(
            os.environ,
            {
                "APP_ENV": "production",
                "ANTHROPIC_API_KEY": "sk-test",
                "AI_NARRATIVE_ENABLED": "true",
            },
            clear=False,
        ):
            payload = get_ready_payload()
            self.assertTrue(payload["ready"])
            self.assertTrue(anthropic_api_key_present())

    def test_validate_startup_fails_in_production_without_key(self) -> None:
        with patch.dict(
            os.environ,
            {"APP_ENV": "production", "ANTHROPIC_API_KEY": "", "AI_NARRATIVE_ENABLED": "true"},
            clear=False,
        ):
            with self.assertRaises(RuntimeError):
                validate_startup_config()

    def test_validate_startup_allows_dev_without_key(self) -> None:
        with patch.dict(
            os.environ,
            {"APP_ENV": "development", "ANTHROPIC_API_KEY": "", "AI_NARRATIVE_ENABLED": "true"},
            clear=False,
        ):
            validate_startup_config()


if __name__ == "__main__":
    unittest.main()
