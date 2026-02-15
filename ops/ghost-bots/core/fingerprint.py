from __future__ import annotations

import hashlib
import json
from typing import Any


def stable_fingerprint(obj: Any) -> str:
    # Stable, cross-run fingerprint for incident de-duplication.
    payload = json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=True)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()
