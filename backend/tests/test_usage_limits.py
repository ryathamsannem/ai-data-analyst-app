"""Tests for V1 SaaS plan limits and usage tracking."""

from __future__ import annotations

import unittest

from services.plan_limits import (
    FREE_MAX_FILE_BYTES,
    FREE_MAX_PREVIEW_ROWS,
    PAID_MAX_DATASET_ROWS,
    PAID_MAX_FILE_BYTES,
    file_size_limit_message,
    get_limits,
    normalize_plan_tier,
)
from services.usage_tracker import UsageTracker


class TestPlanLimits(unittest.TestCase):
    def test_normalize_plan_tier(self) -> None:
        self.assertEqual(normalize_plan_tier(None), "free")
        self.assertEqual(normalize_plan_tier("free"), "free")
        self.assertEqual(normalize_plan_tier("PAID"), "paid")
        self.assertEqual(normalize_plan_tier("unknown"), "free")

    def test_free_file_size_limit(self) -> None:
        limits = get_limits("free")
        self.assertEqual(limits["max_file_bytes"], FREE_MAX_FILE_BYTES)
        self.assertEqual(limits["max_preview_rows"], FREE_MAX_PREVIEW_ROWS)
        self.assertFalse(limits["full_dataset_analysis"])

    def test_paid_file_size_and_rows(self) -> None:
        limits = get_limits("paid")
        self.assertEqual(limits["max_file_bytes"], PAID_MAX_FILE_BYTES)
        self.assertEqual(limits["max_dataset_rows"], PAID_MAX_DATASET_ROWS)
        self.assertTrue(limits["full_dataset_analysis"])

    def test_file_size_limit_message_free(self) -> None:
        msg = file_size_limit_message("free", FREE_MAX_FILE_BYTES + 1)
        self.assertIn("100 KB", msg)
        self.assertIn("Upgrade", msg)


class TestUsageTracker(unittest.TestCase):
    def setUp(self) -> None:
        self.tracker = UsageTracker()

    def test_free_ai_question_daily_limit(self) -> None:
        session_id = "test-ai-free"
        for _ in range(10):
            ok, msg = self.tracker.check_ai_question(session_id, "free")
            self.assertTrue(ok, msg)
            self.tracker.record_ai_question(session_id)
        ok, msg = self.tracker.check_ai_question(session_id, "free")
        self.assertFalse(ok)
        self.assertIsNotNone(msg)
        self.assertIn("today", msg.lower())

    def test_free_pdf_export_daily_limit(self) -> None:
        session_id = "test-pdf-free"
        ok, msg = self.tracker.check_pdf_export(session_id, "free")
        self.assertTrue(ok, msg)
        self.tracker.record_pdf_export(session_id)
        ok, msg = self.tracker.check_pdf_export(session_id, "free")
        self.assertFalse(ok)
        self.assertIsNotNone(msg)
        self.assertIn("PDF", msg)

    def test_paid_pdf_export_unlimited(self) -> None:
        session_id = "test-pdf-paid"
        for _ in range(5):
            ok, msg = self.tracker.check_pdf_export(session_id, "paid")
            self.assertTrue(ok, msg)
            self.tracker.record_pdf_export(session_id)

    def test_refund_last_pdf_export_restores_quota(self) -> None:
        session_id = "test-pdf-refund"
        self.tracker.record_pdf_export(session_id)
        ok, _ = self.tracker.check_pdf_export(session_id, "free")
        self.assertFalse(ok)
        refunded = self.tracker.refund_last_pdf_export(session_id)
        self.assertTrue(refunded)
        ok, _ = self.tracker.check_pdf_export(session_id, "free")
        self.assertTrue(ok)

    def test_refund_without_record_is_noop(self) -> None:
        session_id = "test-pdf-refund-empty"
        self.assertFalse(self.tracker.refund_last_pdf_export(session_id))


if __name__ == "__main__":
    unittest.main()
