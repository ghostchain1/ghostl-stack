#!/usr/bin/env python3
"""
GhostStack AI Swarm — Agent Registry
=====================================
Instantiates and returns all Python swarm agents.  The SwarmController calls
get_agents() once at startup; agents are singletons for the controller's life.

To disable an agent set the corresponding env var:
  SWARM_DISABLE_SECURITY=1
  SWARM_DISABLE_INFRASTRUCTURE=1
  SWARM_DISABLE_BLOCKCHAIN=1
  SWARM_DISABLE_ECONOMIC=1
  SWARM_DISABLE_GOVERNANCE=1
  SWARM_DISABLE_ENGINEERING=1
"""

from __future__ import annotations

import logging
import os
from typing import Any

from agents.base_agent         import BaseSwarmAgent
from agents.security_agent     import SecurityAgent
from agents.infrastructure_agent import InfrastructureAgent
from agents.blockchain_agent   import BlockchainAgent
from agents.economic_agent     import EconomicAgent
from agents.governance_agent   import GovernanceAgent
from agents.engineering_agent  import EngineeringAgent

logger = logging.getLogger("AgentRegistry")

# ---------------------------------------------------------------------------
# Registry
# ---------------------------------------------------------------------------

_AGENT_MAP: dict[str, type[BaseSwarmAgent]] = {
    "security":       SecurityAgent,
    "infrastructure": InfrastructureAgent,
    "blockchain":     BlockchainAgent,
    "economic":       EconomicAgent,
    "governance":     GovernanceAgent,
    "engineering":    EngineeringAgent,
}


class AgentRegistry:
    """Reads env flags and instantiates the active agent set."""

    def __init__(self, config: dict[str, Any]) -> None:
        self._config = config

    def get_agents(self) -> list[BaseSwarmAgent]:
        agents: list[BaseSwarmAgent] = []
        for key, cls in _AGENT_MAP.items():
            env_key = f"SWARM_DISABLE_{key.upper()}"
            if os.environ.get(env_key, "0") == "1":
                logger.info("Agent disabled via env: %s", cls.__name__)
                continue
            try:
                agent = cls(self._config)
                agents.append(agent)
                logger.info("Registered agent: %s (role=%s)", cls.__name__, cls.ROLE)
            except Exception as exc:  # noqa: BLE001
                logger.error("Failed to instantiate %s: %s", cls.__name__, exc)
        return agents
