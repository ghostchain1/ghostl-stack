from __future__ import annotations

import os
from pathlib import Path

from core.models import Paths


def load_paths() -> Paths:
    root = Path(os.getenv("GNS_ROOT", Path(__file__).resolve().parents[1]))
    config_dir = Path(os.getenv("GNS_CONFIG_DIR", root / "config"))
    state_dir = Path(os.getenv("GNS_STATE_DIR", root / "state"))
    plans_dir = Path(os.getenv("GNS_PLANS_DIR", root / "plans"))
    evidence_dir = Path(os.getenv("GNS_EVIDENCE_DIR", root / "evidence"))
    governance_dir = Path(os.getenv("GNS_GOVERNANCE_DIR", root / "governance" / "approvals"))
    return Paths(
        root=root,
        config_dir=config_dir,
        state_dir=state_dir,
        plans_dir=plans_dir,
        evidence_dir=evidence_dir,
        governance_dir=governance_dir,
    )


def apply_enabled() -> bool:
    return os.getenv("GNS_APPLY_ENABLED", "false").lower() == "true"


def reconcile_interval_seconds() -> int:
    return max(30, int(os.getenv("GNS_RECONCILE_INTERVAL_SECONDS", "60")))


def ghostbrain_url() -> str:
    return os.getenv("GHOSTBRAIN_URL", "http://ghostbrain-core:7900")


def ghostbrain_enabled() -> bool:
    return os.getenv("GHOSTBRAIN_ENABLED", "true").lower() == "true"
