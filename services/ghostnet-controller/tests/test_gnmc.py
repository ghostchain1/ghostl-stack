"""GNMC unit tests — all pure-function, no network or daemon required."""
from __future__ import annotations

import os
import sys
from unittest.mock import MagicMock, patch

import pytest

# Ensure the service root is on the path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


# ── System health ─────────────────────────────────────────────────────────────
def test_system_health_returns_valid_struct():
    from src.monitoring.system_health import SystemHealth, get_system_health

    h = get_system_health()
    assert isinstance(h, SystemHealth)
    assert h.cpu_load_1m >= 0.0
    assert h.memory_free_bytes >= 0
    assert h.memory_total_bytes >= 0
    assert isinstance(h.hostname, str)


# ── AI analysis ───────────────────────────────────────────────────────────────
def _make_health(cpu: float = 0.5, mem_free: int = 8 * 1024 ** 3):
    from src.monitoring.system_health import SystemHealth

    return SystemHealth(
        cpu_load_1m=cpu,
        memory_free_bytes=mem_free,
        memory_total_bytes=16 * 1024 ** 3,
        uptime_seconds=3600.0,
        hostname="test-host",
    )


def test_analyze_no_pressure():
    from src.ai.infra_ai import analyze_infrastructure

    a = analyze_infrastructure(_make_health())
    assert not a.memory_pressure
    assert not a.cpu_pressure
    assert a.recommendations == []
    assert a.health_score == 100.0


def test_analyze_memory_pressure():
    from src.ai.infra_ai import analyze_infrastructure

    a = analyze_infrastructure(_make_health(mem_free=100 * 1024 * 1024))  # 100 MiB
    assert a.memory_pressure
    assert not a.cpu_pressure
    assert a.health_score == 70.0
    assert any("memory_pressure" in r for r in a.recommendations)


def test_analyze_cpu_pressure():
    from src.ai.infra_ai import analyze_infrastructure

    a = analyze_infrastructure(_make_health(cpu=10.0))
    assert not a.memory_pressure
    assert a.cpu_pressure
    assert a.health_score == 70.0


def test_analyze_dual_pressure():
    from src.ai.infra_ai import analyze_infrastructure

    a = analyze_infrastructure(_make_health(cpu=10.0, mem_free=100 * 1024 * 1024))
    assert a.memory_pressure
    assert a.cpu_pressure
    assert a.health_score == 40.0


# ── VM manager — allowlist enforcement ───────────────────────────────────────
def test_vm_start_rejects_non_allowlisted():
    from src.infra import vm_manager

    # Default allowlist is empty → every name is rejected
    result = vm_manager.start_vm("ghostchain-mainnet-l1")
    assert result["ok"] is False
    assert "allowlist" in result["reason"]


def test_vm_shutdown_rejects_non_allowlisted():
    from src.infra import vm_manager

    result = vm_manager.shutdown_vm("ghostl2-mainnet")
    assert result["ok"] is False
    assert "allowlist" in result["reason"]


def test_vm_propose_provision_rejects_invalid_name():
    from src.infra import vm_manager

    result = vm_manager.propose_vm_provision("test reason for scaling", "invalid name!")
    assert result["ok"] is False
    assert "invalid" in result["reason"]


def test_vm_propose_provision_rejects_long_reason():
    from src.infra import vm_manager

    result = vm_manager.propose_vm_provision("x" * 501, "valid-name")
    assert result["ok"] is False
    assert "reason" in result["reason"]


# ── VM manager — rate limiter ─────────────────────────────────────────────────
def test_vm_rate_check_fresh_entry_allowed():
    from src.infra import vm_manager

    # Fresh entry with empty allowlist won't reach rate check, but we can
    # test _check_rate directly to verify it returns True for new names.
    allowed, _ = vm_manager._check_rate("brand-new-vm")
    assert allowed is True


# ── Container manager ─────────────────────────────────────────────────────────
def test_container_list_handles_docker_unavailable():
    from src.containers import docker_manager

    with patch.dict(sys.modules, {"docker": None}):
        # Importing docker inside the function will fail; should return []
        result = docker_manager.list_containers()
        assert isinstance(result, list)


def test_container_restart_dry_run():
    """In dry-run mode (default) restart must succeed without touching Docker."""
    from src.containers import docker_manager

    # Verify DRY_RUN is active by default in the test environment
    assert docker_manager._DRY_RUN is True
    result = docker_manager.restart_container("ghost-test-container")
    # Dry run should not fail — returns ok: True with dry_run flag
    assert result.get("ok") is True
    assert result.get("dry_run") is True


# ── DNS sync validation ───────────────────────────────────────────────────────
def test_dns_record_validates_bad_ip():
    from src.network.dns_sync import DnsRecord, _validate_record

    rec = DnsRecord(name="ghost.internal", ip="999.0.0.1")
    err = _validate_record(rec)
    assert err is not None
    assert "IPv4" in err


def test_dns_record_validates_good_record():
    from src.network.dns_sync import DnsRecord, _validate_record

    rec = DnsRecord(name="ghost.internal", ip="192.168.1.10")
    err = _validate_record(rec)
    assert err is None


def test_dns_record_validates_bad_name():
    from src.network.dns_sync import DnsRecord, _validate_record

    rec = DnsRecord(name="../etc/passwd", ip="10.0.0.1")
    err = _validate_record(rec)
    assert err is not None
