from __future__ import annotations

import json
import logging
import subprocess
import shlex
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import yaml

log = logging.getLogger("ghost-storage-ai")


def utc_ts() -> str:
    return datetime.now(tz=timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def ensure_dir(p: Path) -> Path:
    p.mkdir(parents=True, exist_ok=True)
    return p


def write_json(path: Path, data: Any) -> None:
    ensure_dir(path.parent)
    path.write_text(json.dumps(data, indent=2, default=str) + "\n")


def read_yaml(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    return yaml.safe_load(path.read_text()) or {}


def run_local(cmd: list[str], timeout: int = 30) -> tuple[int, str, str]:
    """Run a command on the local host (hypervisor). Returns (rc, stdout, stderr)."""
    try:
        proc = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout,
        )
        return proc.returncode, proc.stdout.strip(), proc.stderr.strip()
    except subprocess.TimeoutExpired:
        return 124, "", "timeout"
    except Exception as exc:  # noqa: BLE001
        return 1, "", str(exc)


def run_ssh(
    host: str,
    command: str,
    *,
    user: str = "ghost",
    key: str = "/run/secrets/ghost_storage_ssh_key",
    timeout: int = 20,
) -> tuple[int, str, str]:
    """Run a shell command on a remote VM via SSH. Returns (rc, stdout, stderr)."""
    ssh_cmd = [
        "ssh",
        "-o", "BatchMode=yes",
        "-o", "ConnectTimeout=10",
        "-o", "StrictHostKeyChecking=accept-new",
        "-o", "UserKnownHostsFile=/tmp/ghost-storage-ai-known-hosts",
        "-i", key,
        f"{user}@{host}",
        "bash", "-c", command,
    ]
    return run_local(ssh_cmd, timeout=timeout)


def bytes_to_mb(b: int) -> float:
    return round(b / (1024 * 1024), 2)


def safe_float(s: str) -> float:
    try:
        return float(s.replace("G", "").replace("M", "").replace("K", "").strip())
    except (ValueError, TypeError):
        return 0.0
