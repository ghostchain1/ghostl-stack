from __future__ import annotations

from dataclasses import dataclass
from hashlib import sha256
from pathlib import Path


@dataclass(slots=True)
class GovernanceGuard:
    lock_file: Path
    token_file: Path
    action_log: Path
    production_mode: bool

    def assert_change_allowed(self, change_text: str) -> str:
        change_hash = sha256(change_text.encode("utf-8")).hexdigest()
        if self.production_mode:
            if not self.lock_file.exists():
                raise PermissionError("governance_lock_missing")
            if not self.token_file.exists():
                raise PermissionError("governance_token_missing")
            if not self.token_file.read_text(encoding="utf-8").strip():
                raise PermissionError("governance_token_empty")
        self.action_log.parent.mkdir(parents=True, exist_ok=True)
        with self.action_log.open("a", encoding="utf-8") as handle:
            handle.write(f"{change_hash}\n")
        return change_hash
