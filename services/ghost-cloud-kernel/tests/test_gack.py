"""GACK unit tests — no network, no libvirt, no Docker daemon required."""
from __future__ import annotations

import os
import sys
from unittest.mock import MagicMock, patch

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


# ══════════════════════════════════════════════════════════════════════════════
# Routing engine — the core architecture invariant
# ══════════════════════════════════════════════════════════════════════════════
class TestRoutingEngine:
    def test_l3_routes_to_l2(self):
        from src.networking.routing_engine import route
        r = route("L3")
        assert r.ok
        assert r.next_hop == "L2"
        assert not r.violation

    def test_l2_routes_to_l1(self):
        from src.networking.routing_engine import route
        r = route("L2")
        assert r.ok
        assert r.next_hop == "L1"

    def test_l1_is_terminus(self):
        from src.networking.routing_engine import route
        r = route("L1")
        assert r.ok
        assert r.next_hop is None

    def test_unknown_layer_returns_error(self):
        from src.networking.routing_engine import route
        r = route("L9")
        assert not r.ok
        assert "unknown layer" in r.reason

    def test_check_route_l3_to_l2_valid(self):
        from src.networking.routing_engine import check_route
        r = check_route("L3", "L2")
        assert r.ok
        assert not r.violation

    def test_check_route_l3_to_l1_VIOLATION(self):
        """Core invariant: L3→L1 direct routing MUST be rejected."""
        from src.networking.routing_engine import check_route
        r = check_route("L3", "L1")
        assert not r.ok
        assert r.violation
        assert "L3" in r.reason
        assert "L1" in r.reason

    def test_check_route_l2_to_l1_valid(self):
        from src.networking.routing_engine import check_route
        r = check_route("L2", "L1")
        assert r.ok
        assert not r.violation

    def test_check_route_l2_to_l3_VIOLATION(self):
        """L2 cannot route backwards to L3."""
        from src.networking.routing_engine import check_route
        r = check_route("L2", "L3")
        assert not r.ok
        assert r.violation

    def test_routing_table_contains_all_layers(self):
        from src.networking.routing_engine import routing_table
        table = routing_table()
        layers = {row["source"] for row in table}
        assert {"L1", "L2", "L3"} == layers


# ══════════════════════════════════════════════════════════════════════════════
# TX router
# ══════════════════════════════════════════════════════════════════════════════
class TestTxRouter:
    def test_l3_auto_routes_to_l2(self):
        from src.blockchain.tx_router import route_transaction
        tx = route_transaction("L3")
        assert tx.ok
        assert tx.next_hop == "L2"
        assert not tx.violation

    def test_l3_to_l1_explicitly_blocked(self):
        from src.blockchain.tx_router import route_transaction
        tx = route_transaction("L3", "L1")
        assert not tx.ok
        assert tx.violation

    def test_l2_to_l1_allowed(self):
        from src.blockchain.tx_router import route_transaction
        tx = route_transaction("L2", "L1")
        assert tx.ok
        assert not tx.violation

    def test_next_hop_rpc_populated(self):
        from src.blockchain.tx_router import route_transaction
        tx = route_transaction("L3")
        assert tx.next_hop_rpc is not None
        assert "29547" in tx.next_hop_rpc  # L2 default RPC port


# ══════════════════════════════════════════════════════════════════════════════
# AI Decision engine
# ══════════════════════════════════════════════════════════════════════════════
class TestDecisionEngine:
    def _snap(self, cpu=0.5, mem=8 * 1024 ** 3, vms=4, chains=None, containers=0):
        from src.ai.decision_engine import InfraSnapshot
        return InfraSnapshot(
            cpu_load_1m=cpu,
            memory_free_bytes=mem,
            running_vms=vms,
            chains_unhealthy=chains or [],
            containers_unhealthy=containers,
        )

    def test_stable_when_all_good(self):
        from src.ai.decision_engine import decide
        d = decide(self._snap())
        assert d.outcome == "stable"
        assert d.health_score == 100.0

    def test_scale_out_when_vms_low(self):
        from src.ai.decision_engine import decide
        d = decide(self._snap(vms=1))
        assert d.outcome == "scale_out"
        assert d.health_score < 100.0

    def test_investigate_when_chain_unhealthy(self):
        from src.ai.decision_engine import decide
        d = decide(self._snap(chains=["L2"]))
        assert d.outcome == "investigate"
        assert d.health_score < 100.0

    def test_scale_out_when_cpu_high(self):
        from src.ai.decision_engine import decide
        d = decide(self._snap(cpu=10.0))
        assert d.outcome == "scale_out"

    def test_memory_pressure_reduces_score(self):
        from src.ai.decision_engine import decide
        d = decide(self._snap(mem=50 * 1024 * 1024))  # 50 MiB
        assert d.health_score < 100.0
        assert any("memory" in r for r in d.reasons)

    def test_dual_chain_failure_drops_score_further(self):
        from src.ai.decision_engine import decide
        d_one = decide(self._snap(chains=["L2"]))
        d_two = decide(self._snap(chains=["L2", "L3"]))
        assert d_two.health_score < d_one.health_score


# ══════════════════════════════════════════════════════════════════════════════
# VM scaler — allowlist + proposal safety
# ══════════════════════════════════════════════════════════════════════════════
class TestVmScaler:
    def test_no_proposal_when_vms_sufficient(self):
        from src.infrastructure.vm_scaler import maybe_propose_scale_out
        result = maybe_propose_scale_out({"ok": True, "running": 10, "total": 10, "vms": []})
        assert result is None

    def test_dry_run_proposal_when_vms_low(self):
        from src.infrastructure import vm_scaler
        from src.infrastructure.vm_scaler import maybe_propose_scale_out
        assert vm_scaler._DRY_RUN is True  # default must be True in tests
        result = maybe_propose_scale_out({"ok": True, "running": 1, "total": 2, "vms": []})
        assert result is not None
        assert result.get("dry_run") is True

    def test_no_proposal_when_scan_failed(self):
        from src.infrastructure.vm_scaler import maybe_propose_scale_out
        result = maybe_propose_scale_out({"ok": False, "reason": "libvirt unavailable"})
        assert result is None


# ══════════════════════════════════════════════════════════════════════════════
# Container healer — DRY_RUN + naming filter
# ══════════════════════════════════════════════════════════════════════════════
class TestContainerHealer:
    def test_dry_run_is_on_by_default(self):
        from src.infrastructure import container_healer
        assert container_healer._DRY_RUN is True

    def test_heal_returns_list(self):
        """When Docker is unavailable, heal() must return a list (not raise)."""
        import sys
        from unittest.mock import MagicMock, patch

        mock_docker = MagicMock()
        mock_docker.from_env.side_effect = Exception("daemon not running")
        with patch.dict(sys.modules, {"docker": mock_docker}):
            from src.infrastructure import container_healer
            result = container_healer.heal_containers()
        assert isinstance(result, list)


# ══════════════════════════════════════════════════════════════════════════════
# Chain orchestrator — chain ID validation
# ══════════════════════════════════════════════════════════════════════════════
class TestChainOrchestrator:
    def test_canonical_chain_ids(self):
        from src.blockchain.chain_orchestrator import CHAINS
        assert CHAINS["L1"].chain_id == 14000101
        assert CHAINS["L2"].chain_id == 901
        assert CHAINS["L3"].chain_id == 903

    def test_rpc_urls_use_ghost_ports(self):
        from src.blockchain.chain_orchestrator import CHAINS
        assert "18545" in CHAINS["L1"].rpc_url
        assert "29547" in CHAINS["L2"].rpc_url
        assert "39545" in CHAINS["L3"].rpc_url

    def test_check_chain_graceful_on_connect_failure(self):
        """RPC unreachable → ChainHealth.ok=False, no exception raised."""
        from src.blockchain.chain_orchestrator import ChainSpec, check_chain
        spec = ChainSpec(layer="L1", chain_id=14000101, rpc_url="http://127.0.0.1:1")
        health = check_chain(spec)
        assert not health.ok
        assert isinstance(health.reason, str)
        assert health.block_number == 0


# ══════════════════════════════════════════════════════════════════════════════
# Telemetry — basic structure
# ══════════════════════════════════════════════════════════════════════════════
class TestTelemetry:
    def test_collect_returns_snapshot(self):
        from src.monitoring.telemetry import TelemetrySnapshot, collect
        snap = collect()
        assert isinstance(snap, TelemetrySnapshot)
        assert snap.cpu_load_1m >= 0.0
        assert snap.memory_free_bytes >= 0
        assert isinstance(snap.hostname, str)
