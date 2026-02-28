from __future__ import annotations

import hashlib
import hmac
import json
import time
from dataclasses import dataclass
from pathlib import Path


@dataclass(slots=True)
class GovernanceVerifier:
    shared_secret: str
    mode: str
    nonce_file: Path
    skew_seconds: int = 300

    def _load_nonces(self) -> set[str]:
        if not self.nonce_file.exists():
            return set()
        try:
            data = json.loads(self.nonce_file.read_text(encoding="utf-8"))
            return set(data if isinstance(data, list) else [])
        except Exception:
            return set()

    def _save_nonces(self, nonces: set[str]) -> None:
        self.nonce_file.parent.mkdir(parents=True, exist_ok=True)
        self.nonce_file.write_text(json.dumps(sorted(list(nonces))[-500:]), encoding="utf-8")

    def verify(self, approval: str, nonce: str, timestamp: str, body: str) -> None:
        if self.mode != "prod":
            return
        if not approval or not nonce or not timestamp:
            raise PermissionError("governance_headers_required")

        ts = int(timestamp)
        now = int(time.time())
        if abs(now - ts) > self.skew_seconds:
            raise PermissionError("approval_timestamp_skew")

        nonces = self._load_nonces()
        if nonce in nonces:
            raise PermissionError("nonce_replay")

        message = f"{nonce}:{timestamp}:{body}".encode("utf-8")
        expected = hmac.new(self.shared_secret.encode("utf-8"), message, hashlib.sha256).hexdigest()
        if not hmac.compare_digest(expected, approval):
            raise PermissionError("invalid_approval_signature")

        nonces.add(nonce)
        self._save_nonces(nonces)
