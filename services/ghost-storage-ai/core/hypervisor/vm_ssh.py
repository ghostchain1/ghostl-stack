from __future__ import annotations

import logging
from typing import Any

from core.common import run_ssh
from core.models import AptCacheInfo, JournalInfo, MountInfo, TmpInfo, VMDiskSnapshot

log = logging.getLogger("ghost-storage-ai.vm_ssh")


def _parse_df(raw: str) -> list[MountInfo]:
    """Parse `df -k --output=source,target,size,used,avail,pcent` output."""
    mounts: list[MountInfo] = []
    for line in raw.splitlines():
        line = line.strip()
        if not line or line.startswith("Filesystem") or line.startswith("source"):
            continue
        parts = line.split()
        if len(parts) < 6:
            continue
        try:
            device, mount, total_kb, used_kb, avail_kb, pct_str = (
                parts[0], parts[1], int(parts[2]), int(parts[3]), int(parts[4]),
                int(parts[5].rstrip("%")),
            )
            mounts.append(MountInfo(
                device=device,
                mount=mount,
                total_kb=total_kb,
                used_kb=used_kb,
                avail_kb=avail_kb,
                use_pct=pct_str,
            ))
        except (ValueError, IndexError):
            continue
    return mounts


def _parse_journal_mb(raw: str) -> float:
    """
    Parse `journalctl --disk-usage` output:
    Archived and active journals take up X.XG (or M/K) on disk.
    """
    for line in raw.splitlines():
        line = line.strip()
        if "take up" not in line:
            continue
        parts = line.split()
        for i, p in enumerate(parts):
            if p in ("take", "takes"):
                # next token is 'up', then the size
                try:
                    size_str = parts[i + 2]
                except IndexError:
                    continue
                if size_str.endswith("G"):
                    return float(size_str[:-1]) * 1024
                if size_str.endswith("M"):
                    return float(size_str[:-1])
                if size_str.endswith("K"):
                    return float(size_str[:-1]) / 1024
    return 0.0


def _parse_du_mb(raw: str) -> float:
    """Parse first token of `du -sm <path>` output (size in MB)."""
    line = raw.strip().splitlines()
    if not line:
        return 0.0
    try:
        return float(line[0].split()[0])
    except (ValueError, IndexError):
        return 0.0


_DISK_PROBE = r"""
set -e
df -k --output=source,target,size,used,avail,pcent 2>/dev/null | grep -v '^tmpfs\|^udev\|^none\|^Filesystem' || true
echo ---JOURNAL---
journalctl --disk-usage 2>/dev/null || true
echo ---APT---
du -sm /var/cache/apt/archives 2>/dev/null || echo "0 /var/cache/apt/archives"
echo ---TMP---
du -sm /tmp 2>/dev/null || echo "0 /tmp"
"""


def get_vm_disk_snapshot(
    vm_name: str,
    host: str,
    *,
    user: str,
    key: str,
    timeout: int,
) -> VMDiskSnapshot:
    rc, stdout, stderr = run_ssh(host, _DISK_PROBE, user=user, key=key, timeout=timeout)
    if rc != 0:
        log.warning("SSH probe failed for %s (%s): %s", vm_name, host, stderr)
        return VMDiskSnapshot(vm=vm_name, host=host, error=stderr or f"rc={rc}")

    sections = stdout.split("---JOURNAL---")
    df_raw = sections[0] if sections else ""
    rest = sections[1] if len(sections) > 1 else ""

    apt_tmp = rest.split("---APT---")
    journal_raw = apt_tmp[0]
    rest2 = apt_tmp[1] if len(apt_tmp) > 1 else ""

    tmp_parts = rest2.split("---TMP---")
    apt_raw = tmp_parts[0]
    tmp_raw = tmp_parts[1] if len(tmp_parts) > 1 else ""

    mounts = _parse_df(df_raw)
    journal_mb = _parse_journal_mb(journal_raw)
    apt_mb = _parse_du_mb(apt_raw)
    tmp_mb = _parse_du_mb(tmp_raw)

    return VMDiskSnapshot(
        vm=vm_name,
        host=host,
        mounts=mounts,
        journal=JournalInfo(disk_usage_mb=journal_mb),
        apt_cache=AptCacheInfo(cache_size_mb=apt_mb),
        tmp=TmpInfo(tmp_size_mb=tmp_mb),
    )
