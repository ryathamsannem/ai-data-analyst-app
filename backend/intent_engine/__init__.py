"""
Dynamic Analytics Intent Engine — Phase 1 facades (parallel to existing pipeline).
"""

from intent_engine.resolve_analysis_intent import resolve_analysis_intent
from intent_engine.attach import enrich_analysis_with_intent

__all__ = ["resolve_analysis_intent", "enrich_analysis_with_intent"]
