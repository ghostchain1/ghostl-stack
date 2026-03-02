from __future__ import annotations

import os
from pathlib import Path

from core.models import Paths


def load_paths() -> Paths:
    root = Path(os.getenv("GSA_ROOT", Path(__file__).resolve().parents[1]))
    return Paths(
        root=root,
        config_dir=Path(os.getenv("GSA_CONFIG_DIR", root / "config")),
        state_dir=Path(os.getenv("GSA_STATE_DIR", root / "state")),
        plans_dir=Path(os.getenv("GSA_PLANS_DIR", root / "plans")),
        evidence_dir=Path(os.getenv("GSA_EVIDENCE_DIR", root / "evidence")),
    )


def apply_enabled() -> bool:
    return os.getenv("GSA_APPLY_ENABLED", "false").lower() == "true"


def reconcile_interval_seconds() -> int:
    return max(60, int(os.getenv("GSA_RECONCILE_INTERVAL_SECONDS", "300")))


def ssh_key_path() -> str:
    """Private key used to SSH from the storage-ai container into VMs."""
    return os.getenv("GSA_SSH_KEY", "/run/secrets/ghost_storage_ssh_key")


def ssh_user() -> str:
    return os.getenv("GSA_SSH_USER", "ghost")


def ssh_timeout() -> int:
    return int(os.getenv("GSA_SSH_TIMEOUT", "15"))


# Thresholds (can be overridden via env for alerting without config file change)
def disk_warn_pct() -> int:
    return int(os.getenv("GSA_DISK_WARN_PCT", "75"))


def disk_crit_pct() -> int:
    return int(os.getenv("GSA_DISK_CRIT_PCT", "88"))


def journal_warn_mb() -> int:
    return int(os.getenv("GSA_JOURNAL_WARN_MB", "200"))


def apt_cache_warn_mb() -> int:
    return int(os.getenv("GSA_APT_CACHE_WARN_MB", "150"))


def tmp_warn_mb() -> int:
    return int(os.getenv("GSA_TMP_WARN_MB", "500"))


def qcow_sparse_warn_pct() -> int:
    """Warn when actual disk usage of a qcow2 exceeds this % of its virtual size."""
    return int(os.getenv("GSA_QCOW_SPARSE_WARN_PCT", "80"))


def port() -> int:
    return int(os.getenv("GSA_PORT", "7630"))
