from __future__ import annotations

import threading
import time
from typing import Any, Callable


class Reconciler:
    def __init__(self, interval_seconds: int, tick: Callable[[], dict[str, Any]]) -> None:
        self.interval_seconds = interval_seconds
        self.tick = tick
        self._thread: threading.Thread | None = None
        self._stop = threading.Event()
        self.last_result: dict[str, Any] | None = None

    def _loop(self) -> None:
        while not self._stop.is_set():
            try:
                self.last_result = self.tick()
            except Exception as exc:
                self.last_result = {"ok": False, "error": str(exc)}
            self._stop.wait(self.interval_seconds)

    def start(self) -> None:
        if self._thread and self._thread.is_alive():
            return
        self._thread = threading.Thread(target=self._loop, daemon=True, name="ghostnetsync-reconciler")
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
