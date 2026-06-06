#!/usr/bin/env python3
"""
Run the full backend unit test suite (intent_engine tests).

Usage (from backend/):
  python run_tests.py
  python run_tests.py -v

Do not use ``unittest discover -s tests`` alone — the ``tests/intent_engine``
folder name can shadow the real ``intent_engine`` package on sys.path.
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parent
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

TEST_DIR = BACKEND_ROOT / "tests" / "intent_engine"
USAGE_TEST_DIR = BACKEND_ROOT / "tests"


PRODUCTION_TEST_FILES = (
    "test_usage_limits.py",
    "test_cors_config.py",
    "test_readiness.py",
    "test_health_endpoints.py",
)


def main() -> int:
    loader = unittest.TestLoader()
    suite = loader.discover(str(TEST_DIR), pattern="test_*.py")
    for name in PRODUCTION_TEST_FILES:
        suite.addTests(loader.discover(str(USAGE_TEST_DIR), pattern=name))
    runner = unittest.TextTestRunner(verbosity=2 if "-v" in sys.argv else 1)
    result = runner.run(suite)
    return 0 if result.wasSuccessful() else 1


if __name__ == "__main__":
    raise SystemExit(main())
