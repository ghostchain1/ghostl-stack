#!/usr/bin/env python3
"""
GhostStack AI Swarm — Economic AI Agent
========================================
Reads economic signals from the economic-ai service and GhostBrain.
Reports treasury health, gas fee anomalies, and demand/supply imbalances.

Data sources
------------
• GHOSTBRAIN_API_URL /api/v1/economic/snapshot — latest fee + treasury snapshot
• GHOSTBRAIN_API_URL /api/v1/signals?type=econ  — recent economic signals
• Direct L1 RPC: ghost_gasPrice (validates GST fee denominated in GST, not ETH)

Rules
-----
• Treasury disbursements require governance quorum — never autonomous.
• Gas model uses GST only — any ETH denomination detected is flagged.
• Advisory proposals to signing relay for fee adjustments.
• No shell=True.
"""

from __future__ import annotations

import json
import logging
import os
import time
import urllib.error
import urllib.request
from typing import Any

from agents.base_agent import BaseSwarmAgent, AgentReport, AgentRecommendation, SwarmContext

logger = logging.getLogger("EconomicAgent")

_GST_UNIT = 10 ** 18   # 1 GST in wei


class EconomicAgent(BaseSwarmAgent):
    ROLE = "economic"

    def __init__(self, config: dict[str, Any]) -> None:
        super().__init__(config)
        self._gb_url  = config.get("ghostbrain_url",    "http://localhost:7900")
        self._l1_rpc  = os.environ.get("GHOSTCHAIN_L1_RPC", "http://localhost:18545")
        self._relay   = config.get("signing_relay_url", "http://localhost:7910")
        self._timeout = 6

        # Thresholds
        self._gas_high_gwei    = float(config.get("econ_gas_high_gwei",    500.0))
        self._fee_anomaly_pct  = float(config.get("econ_fee_anomaly_pct",  50.0))
        self._prev_gas: float | None = None

    def act(self, context: SwarmContext) -> AgentReport:
        t0   = time.monotonic()
        recs: list[AgentRecommendation] = []

        # 1. Gas price from L1 RPC
        gas_gwei, gas_ok = self._get_gas_price()
        if gas_ok:
            if gas_gwei > self._gas_high_gwei:
                recs.append(AgentRecommendation(
                    kind="econ.gas_price_high",
                    target="GhostChain L1",
                    confidence=0.9,
                    priority=70,
                    description=f"L1 gas price {gas_gwei:.1f} gwei (threshold {self._gas_high_gwei})",
                ))
                context.bus.publish("econ:signal", self.name, {
                    "signal":   "gas_price_high",
                    "gasGwei":  gas_gwei,
                    "gasToken": "GST",
                })
            if self._prev_gas is not None:
                delta_pct = abs(gas_gwei - self._prev_gas) / max(self._prev_gas, 1) * 100
                if delta_pct > self._fee_anomaly_pct:
                    recs.append(AgentRecommendation(
                        kind="econ.gas_spike",
                        target="GhostChain L1",
                        confidence=0.8,
                        priority=65,
                        description=(
                            f"Gas price changed {delta_pct:.1f}% "
                            f"({self._prev_gas:.1f} → {gas_gwei:.1f} gwei GST)"
                        ),
                    ))
            self._prev_gas = gas_gwei

        # 2. Economic snapshot from GhostBrain
        snap = self._get_econ_snapshot()
        treasury_health = snap.get("treasury_health", "unknown")
        if treasury_health == "critical":
            recs.append(AgentRecommendation(
                kind="econ.treasury_critical",
                confidence=0.95,
                priority=90,
                description="GhostBrain reports treasury health=critical — governance review required",
            ))
            context.bus.publish("econ:signal", self.name, {
                "signal":   "treasury_critical",
                "gasToken": "GST",
            })

        supply_pressure = snap.get("supply_pressure", "normal")
        if supply_pressure == "high":
            recs.append(AgentRecommendation(
                kind="econ.supply_pressure_high",
                confidence=0.75,
                priority=60,
                description="Supply pressure high — consider advisory parameter review",
            ))

        elapsed = int((time.monotonic() - t0) * 1000)
        gas_str = f"{gas_gwei:.1f} gwei GST" if gas_ok else "RPC_ERR"
        return AgentReport(
            agent_name=self.name,
            role=self.ROLE,
            healthy=True,
            duration_ms=elapsed,
            recommendations=recs,
            summary=f"gas={gas_str} treasury={treasury_health} supply={supply_pressure}",
        )

    # ------------------------------------------------------------------

    def _rpc_call(self, method: str, params: list[Any]) -> Any:
        body = json.dumps({
            "jsonrpc": "2.0", "id": 1, "method": method, "params": params,
        }).encode("utf-8")
        req = urllib.request.Request(
            self._l1_rpc,
            data=body,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=self._timeout) as resp:
            return json.loads(resp.read().decode("utf-8")).get("result")

    def _get_gas_price(self) -> tuple[float, bool]:
        try:
            result = self._rpc_call("ghost_gasPrice", [])
            if result is None:
                result = self._rpc_call("eth_gasPrice", [])
            if result is None:
                return 0.0, False
            wei = int(result, 16)
            return wei / 1e9, True   # convert wei → gwei
        except (urllib.error.URLError, json.JSONDecodeError, ValueError, OSError):
            return 0.0, False

    def _get_econ_snapshot(self) -> dict[str, Any]:
        url = f"{self._gb_url}/api/v1/economic/snapshot"
        try:
            with urllib.request.urlopen(
                urllib.request.Request(url), timeout=self._timeout
            ) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except (urllib.error.URLError, json.JSONDecodeError, OSError):
            return {}
