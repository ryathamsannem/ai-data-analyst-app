"""Tests for phased /ask (chart-first latency path)."""

from __future__ import annotations

import unittest
from unittest.mock import patch

import pandas as pd
from fastapi.testclient import TestClient

import main as m
from services.ask_turn_cache import ask_turn_cache
from services.usage_tracker import UsageTracker


class TestAskPhaseChart(unittest.TestCase):
    def setUp(self) -> None:
        self._orig_tracker = m.usage_tracker
        ask_turn_cache.reset()
        m.usage_tracker.reset()
        m.df = pd.DataFrame(
            {
                "city": ["A", "B", "C", "A", "B"],
                "revenue": [100, 200, 150, 120, 180],
            }
        )
        m.dataset_profile = m.build_profile(m.df)

    def tearDown(self) -> None:
        m.usage_tracker = self._orig_tracker
        ask_turn_cache.reset()
        m.usage_tracker.reset()

    def test_phase_chart_skips_narrative_and_caches_turn(self) -> None:
        client = TestClient(m.app)
        headers = {"X-Session-Id": "phase-chart-session", "X-Plan-Tier": "paid"}

        with patch.object(m, "_generate_insight_narrative") as mock_narr:
            resp = client.post(
                "/ask",
                json={"question": "Which city has the highest revenue?", "phase": "chart"},
                headers=headers,
            )

        self.assertEqual(resp.status_code, 200)
        body = resp.json()
        self.assertEqual(body.get("narrative_status"), "pending")
        self.assertTrue(body.get("turn_id"))
        self.assertEqual(body.get("answer"), "")
        self.assertIsNotNone(body.get("visualization"))
        self.assertIsNotNone(body.get("analysis"))
        mock_narr.assert_not_called()

        cached = ask_turn_cache.get("phase-chart-session", body["turn_id"])
        self.assertIsNotNone(cached)
        assert cached is not None
        self.assertEqual(cached.question, "Which city has the highest revenue?")
        self.assertTrue(cached.filter_breadcrumb)
        self.assertIsNotNone(cached.analysis_profile)

    def test_phase_full_still_calls_narrative(self) -> None:
        client = TestClient(m.app)
        headers = {"X-Session-Id": "phase-full-session", "X-Plan-Tier": "paid"}

        with patch.object(
            m, "_generate_insight_narrative", return_value="Revenue is highest in B."
        ) as mock_narr:
            resp = client.post(
                "/ask",
                json={"question": "Which city has the highest revenue?", "phase": "full"},
                headers=headers,
            )

        self.assertEqual(resp.status_code, 200)
        body = resp.json()
        self.assertEqual(body.get("answer"), "Revenue is highest in B.")
        self.assertNotIn("narrative_status", body)
        mock_narr.assert_called_once()

    def test_phase_chart_debits_only_on_success(self) -> None:
        tracker = UsageTracker()
        m.usage_tracker = tracker
        client = TestClient(m.app)
        headers = {"X-Session-Id": "phase-chart-quota", "X-Plan-Tier": "free"}

        with patch.object(m, "_generate_insight_narrative") as mock_narr:
            resp = client.post(
                "/ask",
                json={"question": "Which city has the highest revenue?", "phase": "chart"},
                headers=headers,
            )
        self.assertEqual(resp.status_code, 200)
        mock_narr.assert_not_called()
        snap = tracker.get_usage_snapshot("phase-chart-quota", "free")
        self.assertEqual(snap["ai_questions_used"], 1)

        with patch.object(m, "_generate_insight_narrative"):
            resp_empty = client.post(
                "/ask",
                json={
                    "question": "Which city has the highest revenue?",
                    "phase": "chart",
                    "dashboard_filters": [
                        {"column": "city", "value": "NoSuchCity", "label": "City"}
                    ],
                },
                headers=headers,
            )
        self.assertEqual(resp_empty.status_code, 200)
        snap2 = tracker.get_usage_snapshot("phase-chart-quota", "free")
        self.assertEqual(snap2["ai_questions_used"], 1)

    def test_phase_narrative_requires_turn_id(self) -> None:
        client = TestClient(m.app)
        headers = {"X-Session-Id": "narrative-no-turn", "X-Plan-Tier": "paid"}
        resp = client.post(
            "/ask",
            json={"question": "ignored", "phase": "narrative"},
            headers=headers,
        )
        self.assertEqual(resp.status_code, 422)
        detail = resp.json().get("detail")
        if isinstance(detail, dict):
            self.assertEqual(detail.get("code"), "turn_id_required")

    def test_phase_narrative_cache_miss_returns_410(self) -> None:
        client = TestClient(m.app)
        headers = {"X-Session-Id": "narrative-miss", "X-Plan-Tier": "paid"}
        resp = client.post(
            "/ask",
            json={
                "question": "ignored",
                "phase": "narrative",
                "turn_id": "00000000-0000-0000-0000-000000000000",
            },
            headers=headers,
        )
        self.assertEqual(resp.status_code, 410)
        detail = resp.json().get("detail")
        if isinstance(detail, dict):
            self.assertEqual(detail.get("code"), "ask_turn_not_found")

    def test_chart_then_narrative_returns_answer(self) -> None:
        client = TestClient(m.app)
        headers = {"X-Session-Id": "chart-then-narrative", "X-Plan-Tier": "paid"}

        with patch.object(m, "_generate_insight_narrative") as mock_narr:
            chart_resp = client.post(
                "/ask",
                json={"question": "Which city has the highest revenue?", "phase": "chart"},
                headers=headers,
            )
            self.assertEqual(chart_resp.status_code, 200)
            turn_id = chart_resp.json().get("turn_id")
            self.assertTrue(turn_id)
            mock_narr.assert_not_called()

            mock_narr.return_value = "City B leads on total revenue."
            narr_resp = client.post(
                "/ask",
                json={
                    "question": "Which city has the highest revenue?",
                    "phase": "narrative",
                    "turn_id": turn_id,
                },
                headers=headers,
            )

        self.assertEqual(narr_resp.status_code, 200)
        narr_body = narr_resp.json()
        self.assertEqual(narr_body.get("narrative_status"), "complete")
        self.assertEqual(narr_body.get("turn_id"), turn_id)
        self.assertEqual(narr_body.get("answer"), "City B leads on total revenue.")
        self.assertIn("conversation_context", narr_body)
        mock_narr.assert_called_once()

    def test_narrative_phase_does_not_double_debit_quota(self) -> None:
        tracker = UsageTracker()
        m.usage_tracker = tracker
        client = TestClient(m.app)
        headers = {"X-Session-Id": "narrative-no-double", "X-Plan-Tier": "free"}

        with patch.object(
            m, "_generate_insight_narrative", return_value="Answer text."
        ):
            chart_resp = client.post(
                "/ask",
                json={"question": "Which city has the highest revenue?", "phase": "chart"},
                headers=headers,
            )
            turn_id = chart_resp.json()["turn_id"]
            snap_after_chart = tracker.get_usage_snapshot("narrative-no-double", "free")
            self.assertEqual(snap_after_chart["ai_questions_used"], 1)

            narr_resp = client.post(
                "/ask",
                json={
                    "question": "Which city has the highest revenue?",
                    "phase": "narrative",
                    "turn_id": turn_id,
                },
                headers=headers,
            )
            self.assertEqual(narr_resp.status_code, 200)

        snap_after_narrative = tracker.get_usage_snapshot("narrative-no-double", "free")
        self.assertEqual(snap_after_narrative["ai_questions_used"], 1)


if __name__ == "__main__":
    unittest.main()
