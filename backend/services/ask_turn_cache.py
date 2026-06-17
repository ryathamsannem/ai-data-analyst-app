"""Short-lived server-side cache for phased /ask turns (chart before narrative)."""

from __future__ import annotations

import threading
import time
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional


@dataclass
class AskTurnCacheEntry:
    """Snapshot needed to resume narrative generation for a chart turn."""

    question: str
    effective_question: str
    exact_result: str
    visualization: Optional[Dict[str, Any]]
    analysis_ctx: Dict[str, Any]
    sidecar: Optional[Dict[str, Any]]
    plan_snapshot: Dict[str, Any]
    request_snapshot: Dict[str, Any]
    dash_labs: List[str] = field(default_factory=list)
    filter_added: List[str] = field(default_factory=list)
    prev_filters: List[str] = field(default_factory=list)
    is_follow_up: bool = False
    parent_turn_id: Optional[str] = None
    analysis_profile: Optional[Dict[str, Any]] = None
    filter_breadcrumb: str = ""
    follow_chain_session: List[str] = field(default_factory=list)
    lic_id_session: Optional[str] = None
    drill_path_session: List[str] = field(default_factory=list)
    created_at: float = field(default_factory=time.time)


class AskTurnCache:
    def __init__(self, ttl_seconds: float = 300.0) -> None:
        self._ttl = ttl_seconds
        self._lock = threading.Lock()
        self._entries: dict[tuple[str, str], AskTurnCacheEntry] = {}

    def reset(self) -> None:
        with self._lock:
            self._entries.clear()

    def _prune_expired_locked(self, now: float) -> None:
        expired = [
            key
            for key, entry in self._entries.items()
            if now - entry.created_at > self._ttl
        ]
        for key in expired:
            del self._entries[key]

    def store(
        self, session_id: str, turn_id: str, entry: AskTurnCacheEntry
    ) -> None:
        sid = session_id.strip() or "anonymous"
        tid = turn_id.strip()
        if not tid:
            return
        with self._lock:
            now = time.time()
            self._prune_expired_locked(now)
            self._entries[(sid, tid)] = entry

    def get(self, session_id: str, turn_id: str) -> Optional[AskTurnCacheEntry]:
        sid = session_id.strip() or "anonymous"
        tid = turn_id.strip()
        if not tid:
            return None
        with self._lock:
            now = time.time()
            self._prune_expired_locked(now)
            entry = self._entries.get((sid, tid))
            if entry is None:
                return None
            if now - entry.created_at > self._ttl:
                del self._entries[(sid, tid)]
                return None
            return entry


ask_turn_cache = AskTurnCache()
