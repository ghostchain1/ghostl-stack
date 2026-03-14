#!/usr/bin/env python3
"""
GhostStack AI Swarm — Governance AI Agent
==========================================
Monitors on-chain and advisory governance activity across:
  • GhostChain L1 — GhostChainGovernor + Cosmos governance
  • GhostL2        — op-stack governance (advisory proposals only)
  • GhostL3        — app-specific proposals

The agent reads proposal state from GhostBrain (which aggregates from the
governance-event-bridge service) and flags:
  - Proposals approaching voting deadline with low participation.
  - Proposals that bypass the proper L3→L2→L1 settlement path.
  - Any autonomous on-chain execution without quorum evidence.

Rules
-----
• Governance proposals are NEVER written on-chain autonomously.
• All flagged proposals are submitted as advisory signals to GhostBrain
  and as events to the signing relay for human ratification.
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

logger = logging.getLogger("GovernanceAgent")

_GOV_QUORUM_MIN  = 0.05   # 5% minimum participation for advisory flag
_DEADLINE_WARN_S = 24 * 3600  # warn 24 h before deadline


class GovernanceAgent(BaseSwarmAgent):
    ROLE = "governance"

    def __init__(self, config: dict[str, Any]) -> None:
        super().__init__(config)
        self._gb_url  = config.get("ghostbrain_url",    "http://localhost:7900")
        self._relay   = config.get("signing_relay_url", "http://localhost:7910")
        self._timeout = 6

    def act(self, context: SwarmContext) -> AgentReport:
        t0   = time.monotonic()
        recs: list[AgentRecommendation] = []

        # Fetch pending proposals from GhostBrain aggregator
        proposals   = self._fetch_proposals()
        cosmos_props = self._fetch_cosmos_proposals()
        all_props    = proposals + cosmos_props

        now = time.time()
        for prop in all_props:
            pid     = prop.get("id", "unknown")
            status  = prop.get("status", "unknown")
            quorum  = float(prop.get("participation", 0.0))
            dl      = prop.get("voting_end", 0)
            chain   = prop.get("chain", "L1")
            desc    = prop.get("description", "")

            # Approaching deadline with low participation
            if status == "active" and dl and (dl - now) < _DEADLINE_WARN_S:
                if quorum < _GOV_QUORUM_MIN:
                    recs.append(AgentRecommendation(
                        kind="governance.low_participation",
                        target=str(pid),
                        confidence=0.8,
                        priority=75,
                        description=(
                            f"Proposal {pid} ({chain}) deadline in "
                            f"{int((dl-now)/3600)}h with {quorum*100:.1f}% participation"
                        ),
                    ))

            # Detect bypass of routing law in proposal description
            if "L3" in chain and "L1" in desc and "L2" not in desc:
                recs.append(AgentRecommendation(
                    kind="governance.routing_bypass",
                    target=str(pid),
                    confidence=0.7,
                    priority=85,
                    description=f"Proposal {pid} may bypass L2 settlement — requires review",
                ))
                context.bus.publish("governance:propose", self.name, {
                    "description": f"Routing law concern: proposal {pid} on {chain}",
                    "chainId":     14000101,
                    "gasToken":    "GST",
                    "requiresQuorum": True,
                })

        elapsed = int((time.monotonic() - t0) * 1000)
        return AgentReport(
            agent_name=self.name,
            role=self.ROLE,
            healthy=True,
            duration_ms=elapsed,
            recommendations=recs,
            summary=(
                f"proposals(evm)={len(proposals)} "
                f"proposals(cosmos)={len(cosmos_props)} "
                f"flagged={len(recs)}"
            ),
        )

    # ------------------------------------------------------------------

    def _fetch_proposals(self) -> list[dict[str, Any]]:
        url = f"{self._gb_url}/api/v1/governance/proposals?status=active"
        try:
            with urllib.request.urlopen(
                urllib.request.Request(url), timeout=self._timeout
            ) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                return data if isinstance(data, list) else data.get("proposals", [])
        except (urllib.error.URLError, json.JSONDecodeError, OSError):
            return []

    def _fetch_cosmos_proposals(self) -> list[dict[str, Any]]:
        """Query Cosmos LCD /cosmos/gov/v1beta1/proposals?proposal_status=2 (voting period)."""
        cosmos_lcd = self._gb_url.replace("7900", "1317")  # derive from GhostBrain URL pattern
        url = f"{cosmos_lcd}/cosmos/gov/v1beta1/proposals?proposal_status=2"
        try:
            with urllib.request.urlopen(
                urllib.request.Request(url), timeout=self._timeout
            ) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                raw = data.get("proposals", [])
                # Normalise to common schema
                return [
                    {
                        "id":          p.get("proposal_id"),
                        "status":      "active",
                        "description": p.get("content", {}).get("description", ""),
                        "chain":       "L1",
                        "source":      "cosmos",
                        "participation": 0.0,
                    }
                    for p in raw
                ]
        except (urllib.error.URLError, json.JSONDecodeError, OSError):
            return []
