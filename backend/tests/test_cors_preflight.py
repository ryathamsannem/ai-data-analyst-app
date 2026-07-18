"""HTTP CORS preflight tests for browser-facing API routes."""

from __future__ import annotations

import os
import unittest

from fastapi.testclient import TestClient


def _client() -> TestClient:
    os.environ["APP_ENV"] = "development"
    os.environ["ANTHROPIC_API_KEY"] = "sk-test"
    import main

    return TestClient(main.app)


class TestCorsPreflight(unittest.TestCase):
    def _preflight(self, path: str, origin: str, method: str):
        return _client().options(
            path,
            headers={
                "Origin": origin,
                "Access-Control-Request-Method": method,
                "Access-Control-Request-Headers": "content-type",
            },
        )

    def test_upload_preflight_allows_localhost(self) -> None:
        response = self._preflight("/upload", "http://localhost:3000", "POST")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.headers.get("access-control-allow-origin"),
            "http://localhost:3000",
        )

    def test_usage_preflight_allows_vercel_production_origin(self) -> None:
        origin = "https://ai-data-analyst-app.vercel.app"
        response = self._preflight("/usage", origin, "GET")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers.get("access-control-allow-origin"), origin)

    def test_upload_preflight_allows_loopback_localhost(self) -> None:
        origin = "http://127.0.0.1:3000"
        response = self._preflight("/upload", origin, "POST")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers.get("access-control-allow-origin"), origin)


if __name__ == "__main__":
    unittest.main()
