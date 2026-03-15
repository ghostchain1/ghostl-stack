"""DDoS / abuse rate guard for the GhostDNS AI HTTP layer.

Tracks per-IP request counts in a rolling time window and blocks IPs that
exceed a configured threshold.  Blocked IPs expire automatically after
``block_duration_s`` seconds, so the service self-heals once an attack
subsides.

The guard is applied by the FastAPI middleware in main.py for all
non-exempt paths (health, metrics).

Security notes:
  - No subprocess / shell=True.
  - IP strings are only stored and compared — never interpolated into
    commands or forwarded to external systems.
  - The block list is in-process memory only.  A restart clears it (by
    design: stateless API workers).  Persistent blocking belongs in a WAF
    or iptables layer outside this service.
"""
from __future__ import annotations

import time
import threading
from collections import defaultdict, deque
from dataclasses import dataclass
from typing import Deque

from src.metrics import GHOSTDNS_DDOS_BLOCKED_IPS, GHOSTDNS_DDOS_RATE_EXCEEDED_TOTAL

DEFAULT_WINDOW_S: int = 60       # rolling window size in seconds
DEFAULT_THRESHOLD: int = 300     # max requests allowed per window
DEFAULT_BLOCK_S: int = 600       # block duration: 10 minutes


@dataclass
class _BlockEntry:
    blocked_at: float
    reason: str


class DDoSGuard:
    """Per-IP sliding-window rate limiter with automatic block expiry.

    ``check(ip) -> bool`` returns ``True`` if the request is **allowed**
    and ``False`` if it should be rejected (caller should raise HTTP 429).
    """

    def __init__(
        self,
        window_s: int = DEFAULT_WINDOW_S,
        threshold: int = DEFAULT_THRESHOLD,
        block_duration_s: int = DEFAULT_BLOCK_S,
    ) -> None:
        self._window_s = window_s
        self._threshold = threshold
        self._block_duration_s = block_duration_s
        self._timestamps: dict[str, Deque[float]] = defaultdict(deque)
        self._blocked: dict[str, _BlockEntry] = {}
        self._lock = threading.Lock()

    # ── Public interface ──────────────────────────────────────────────────────

    def check(self, ip: str) -> bool:
        """Returns ``True`` (allow) or ``False`` (deny)."""
        now = time.monotonic()
        with self._lock:
            # Unblock expired entries first
            if ip in self._blocked:
                if now - self._blocked[ip].blocked_at >= self._block_duration_s:
                    del self._blocked[ip]
                else:
                    GHOSTDNS_DDOS_RATE_EXCEEDED_TOTAL.inc()
                    return False

            # Slide the window: drop timestamps older than window_s
            window = self._timestamps[ip]
            cutoff = now - self._window_s
            while window and window[0] < cutoff:
                window.popleft()

            window.append(now)

            if len(window) > self._threshold:
                self._blocked[ip] = _BlockEntry(blocked_at=now, reason="rate_exceeded")
                GHOSTDNS_DDOS_RATE_EXCEEDED_TOTAL.inc()
                GHOSTDNS_DDOS_BLOCKED_IPS.set(len(self._blocked))
                return False

            return True

    def block(self, ip: str, reason: str = "manual") -> None:
        """Manually block an IP (e.g. on operator request)."""
        with self._lock:
            self._blocked[ip] = _BlockEntry(blocked_at=time.monotonic(), reason=reason)
            GHOSTDNS_DDOS_BLOCKED_IPS.set(len(self._blocked))

    def unblock(self, ip: str) -> bool:
        """Manually unblock an IP.  Returns True if it was blocked."""
        with self._lock:
            removed = ip in self._blocked
            self._blocked.pop(ip, None)
            GHOSTDNS_DDOS_BLOCKED_IPS.set(len(self._blocked))
            return removed

    def prune_expired(self) -> int:
        """Remove expired block entries.  Call periodically from the loop."""
        now = time.monotonic()
        with self._lock:
            expired = [
                ip for ip, entry in self._blocked.items()
                if now - entry.blocked_at >= self._block_duration_s
            ]
            for ip in expired:
                del self._blocked[ip]
            GHOSTDNS_DDOS_BLOCKED_IPS.set(len(self._blocked))
            return len(expired)

    def status(self) -> dict:
        now = time.monotonic()
        with self._lock:
            return {
                "window_s": self._window_s,
                "threshold": self._threshold,
                "block_duration_s": self._block_duration_s,
                "tracked_ips": len(self._timestamps),
                "blocked_ips": [
                    {
                        "ip": ip,
                        "reason": entry.reason,
                        "expires_in_s": max(0.0, self._block_duration_s - (now - entry.blocked_at)),
                    }
                    for ip, entry in self._blocked.items()
                ],
            }
