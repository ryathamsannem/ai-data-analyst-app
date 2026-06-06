"""HTTP tests for /health and /ready endpoints."""

from __future__ import annotations

import os
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient


def _dev_client() -> TestClient:
    os.environ["APP_ENV"] = "development"
    os.environ["ANTHROPIC_API_KEY"] = "sk-test"
    import main

    return TestClient(main.app)


class TestHealthEndpoints(unittest.TestCase):
    def test_health_returns_ok(self) -> None:
        client = _dev_client()
        response = client.get("/health")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "ok")

    def test_ready_dev_missing_key_returns_200_with_warning(self) -> None:
        payload = {
            "ready": True,
            "checks": {
                "app": True,
                "environment": "development",
                "ai_narrative_enabled": True,
                "anthropic_api_key_present": False,
            },
            "warnings": ["ANTHROPIC_API_KEY is missing; AI narrative will use fallback text in development."],
        }
        client = _dev_client()
        with patch("main.get_ready_payload", return_value=payload):
            response = client.get("/ready")
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertTrue(body["ready"])
        self.assertTrue(body["warnings"])

    def test_ready_production_not_ready_returns_503(self) -> None:
        payload = {
            "ready": False,
            "checks": {
                "app": True,
                "environment": "production",
                "ai_narrative_enabled": True,
                "anthropic_api_key_present": False,
            },
            "warnings": [],
        }
        client = _dev_client()
        with patch("main.get_ready_payload", return_value=payload):
            response = client.get("/ready")
        self.assertEqual(response.status_code, 503)
        self.assertFalse(response.json()["ready"])


if __name__ == "__main__":
    unittest.main()
