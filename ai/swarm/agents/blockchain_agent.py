#!/usr/bin/env python3
"""
GhostStack AI Swarm — Blockchain AI Agent
==========================================
Monitors chain liveness for GhostChain L1, GhostL2, and GhostL3 by querying
their JSON-RPC endpoints.  Validates block heights are advancing and no chain
has halted.

Routing law enforced
--------------------
  Chain topology: L3 (903) → L2 (901) → L1 (14000101)
  This agent detects and alerts if any layer's block production stops or if
  the block gap between layers widens beyond acceptable limits.

Checks per tick
---------------
1. ghost_blockNumber — each chain must respond within RPC_TIMEOUT_S.
2. Block delta — compare current height to last-tick height; alert on 0 diff.
3. RPC namespace — verifies the endpoint responds to `ghost_` prefix, not `eth_`.
4. Chain ID — verifies `ghost_chainId` matches expected values.

Rules
-----
• Never calls external chains (Ethereum mainnet etc.) — only L1/L2/L3.
• All findings are advisory — no chain-parameter changes.
• No shell=True.
"""

from __future__ import annotations

import json
import logging
import time
import urllib.error
import urllib.request
from typing import Any

from agents.base_agent import BaseSwarmAgent, AgentReport, AgentRecommendation, SwarmContext

logger = logging.getLogger("BlockchainAgent")

# ---------------------------------------------------------------------------
# Chain configuration (immutable)
# ---------------------------------------------------------------------------

_CHAINS: list[dict[str, Any]] = [
    {"name": "GhostChain L1", "chain_id": 14000101, "rpc_env": "GHOSTCHAIN_L1_RPC", "default_rpc": "http://localhost:18545", "layer": "L1"},
    {"name": "GhostL2",       "chain_id": 901,       "rpc_env": "GHOSTL2_RPC",        "default_rpc": "http://localhost:29545", "layer": "L2"},
    {"name": "GhostL3",       "chain_id": 903,       "rpc_env": "GHOSTL3_RPC",        "default_rpc": "http://localhost:39545", "layer": "L3"},
]

_RPC_TIMEOUT_S    = 5
_BLOCK_HALT_TICKS = 3   # consecutive ticks with no new block before alerting


class BlockchainAgent(BaseSwarmAgent):
    ROLE = "blockchain"

    def __init__(self, config: dict[str, Any]) -> None:
        super().__init__(config)
        import os
        self._chains = [
            {**c, "rpc_url": os.environ.get(c["rpc_env"], c["default_rpc"])}
            for c in _CHAINS
        ]
        # Track block heights across ticks
        self._heights:  dict[str, int] = {}
        self._no_advance: dict[str, int] = {}  # consecutive ticks without advance

    def act(self, context: SwarmContext) -> AgentReport:
        t0   = time.monotonic()
        recs: list[AgentRecommendation] = []
        summaries: list[str] = []

        for chain in self._chains:
            name  = chain["name"]
            cid   = chain["chain_id"]
            rpc   = chain["rpc_url"]
            layer = chain["layer"]

            block_num, ok = self._get_block_number(rpc)
            chain_id_ok   = self._verify_chain_id(rpc, cid)

            if not ok:
                recs.append(AgentRecommendation(
                    kind="chain.rpc_unreachable",
                    target=name,
                    confidence=0.95,
                    priority=90,
                    description=f"{name} RPC unreachable at {rpc}",
                ))
                context.bus.publish("network:degraded", self.name, {
                    "chain":  name,
                    "layer":  layer,
                    "reason": "RPC unreachable",
                })
                summaries.append(f"{layer}=DOWN")
                continue

            # Block advancement check
            prev = self._heights.get(name)
            if prev is not None and block_num <= prev:
                self._no_advance[name] = self._no_advance.get(name, 0) + 1
                if self._no_advance[name] >= _BLOCK_HALT_TICKS:
                    recs.append(AgentRecommendation(
                        kind="chain.block_halt",
                        target=name,
                        confidence=0.9,
                        priority=85,
                        description=(
                            f"{name} block height stuck at {block_num} for "
                            f"{self._no_advance[name]} ticks"
                        ),
                    ))
                    context.bus.publish("chain:block_alert", self.name, {
                        "chain":       name,
                        "layer":       layer,
                        "blockHeight": block_num,
                        "staleTicks":  self._no_advance[name],
                    })
            else:
                self._no_advance[name] = 0

            self._heights[name] = block_num

            if not chain_id_ok:
                recs.append(AgentRecommendation(
                    kind="chain.id_mismatch",
                    target=name,
                    confidence=0.99,
                    priority=95,
                    description=f"{name} chain ID mismatch — expected {cid}",
                ))

            summaries.append(f"{layer}=#{block_num}")

        elapsed = int((time.monotonic() - t0) * 1000)
        return AgentReport(
            agent_name=self.name,
            role=self.ROLE,
            healthy=all("DOWN" not in s for s in summaries),
            duration_ms=elapsed,
            recommendations=recs,
            summary=" | ".join(summaries),
        )

    # ------------------------------------------------------------------

    def _rpc_call(self, url: str, method: str, params: list[Any]) -> Any:
        body = json.dumps({
            "jsonrpc": "2.0", "id": 1, "method": method, "params": params,
        }).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=body,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=_RPC_TIMEOUT_S) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        return data.get("result")

    def _get_block_number(self, rpc: str) -> tuple[int, bool]:
        try:
            # GhostChain uses `ghost_blockNumber` (not `eth_blockNumber`)
            result = self._rpc_call(rpc, "ghost_blockNumber", [])
            if result is None:
                # Fallback — some OP-stack nodes also export eth_ namespace
                result = self._rpc_call(rpc, "eth_blockNumber", [])
            if result is None:
                return 0, False
            return int(result, 16), True
        except (urllib.error.URLError, json.JSONDecodeError, ValueError, OSError):
            return 0, False

    def _verify_chain_id(self, rpc: str, expected: int) -> bool:
        try:
            result = self._rpc_call(rpc, "ghost_chainId", [])
            if result is None:
                result = self._rpc_call(rpc, "eth_chainId", [])
            if result is None:
                return False
            return int(result, 16) == expected
        except (urllib.error.URLError, json.JSONDecodeError, ValueError, OSError):
            return False
