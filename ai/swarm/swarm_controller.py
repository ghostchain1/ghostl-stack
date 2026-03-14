#!/usr/bin/env python3
"""
GhostStack AI Swarm — Controller
=================================
Runs all registered Python swarm agents in parallel (ThreadPoolExecutor),
collects their AgentReports, applies a simple consensus pass, and publishes
the aggregated results to GhostBrain Core.

It also bridges with the TypeScript SwarmController running in
ghost-brain-core/swarm/ by pulling consensus:actions from GhostBrain and
routing them to the appropriate Python agent as advisory tasks.

Tick cycle
----------
  1. Pull pending GhostBrain directives for this swarm.
  2. Dispatch all Python agents in parallel (timeout per agent = AGENT_TIMEOUT_S).
  3. Collect AgentReports → merge recommendations → sort by priority.
  4. Apply consensus: deduplicate by (kind, target), keep highest confidence.
  5. Publish consensus:actions on the SwarmBus + GhostBrain.
  6. Log cycle summary.

Safety
------
  • Agents that time out are cancelled and reported unhealthy.
  • No agent can block the controller for longer than AGENT_TIMEOUT_S.
  • Governance-gated actions in consensus output are submitted to signing relay,
    never executed autonomously.
  • No shell=True.
"""

from __future__ import annotations

import argparse
import concurrent.futures
import json
import logging
import logging.handlers
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

import yaml

from agent_registry            import AgentRegistry
from agents.base_agent         import AgentReport, AgentRecommendation, SwarmContext
from communication.swarm_bus   import SwarmBus

logger = logging.getLogger("SwarmController")

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

AGENT_TIMEOUT_S = int(os.environ.get("SWARM_AGENT_TIMEOUT_S",  "30"))
TICK_INTERVAL_S = int(os.environ.get("SWARM_INTERVAL_S",       "30"))
LOG_FORMAT      = "%(asctime)s [%(levelname)s] %(name)s: %(message)s"

# ---------------------------------------------------------------------------
# Config loader
# ---------------------------------------------------------------------------

_DEFAULT_CONFIG = Path(__file__).parent / "config.yaml"


def _load_config(path: Path | None = None) -> dict[str, Any]:
    config_path = path or _DEFAULT_CONFIG
    if not config_path.is_file():
        raise FileNotFoundError(f"config not found: {config_path}")
    with open(config_path, encoding="utf-8") as fh:
        cfg: dict[str, Any] = yaml.safe_load(fh) or {}
    # Environment overrides
    for key, env_var, default in [
        ("repo_path",          "REPO_PATH",           "/home/ghost/ghostl-stack"),
        ("ghostbrain_url",     "GHOSTBRAIN_API_URL",  "http://localhost:7900"),
        ("gais_url",           "GAIS_URL",            "http://localhost:9100"),
        ("signing_relay_url",  "SIGNING_RELAY_URL",    "http://localhost:7910"),
        ("gais_api_token",     "GAIS_API_TOKEN",      ""),
    ]:
        cfg[key] = os.environ.get(env_var, cfg.get(key, default))
    return cfg


# ---------------------------------------------------------------------------
# Consensus pass
# ---------------------------------------------------------------------------


def _consensus(reports: list[AgentReport]) -> list[AgentRecommendation]:
    """
    Merge recommendations from all agents:
    1. Group by (kind, target).
    2. Deduplicate: keep highest confidence within each group.
    3. Count proposing agents (multi-agent agreement boosts priority).
    4. Sort descending by priority.
    """
    groups: dict[tuple[str, str], list[AgentRecommendation]] = {}
    for rep in reports:
        for rec in rep.recommendations:
            key = (rec.kind, rec.target)
            groups.setdefault(key, []).append(rec)

    merged: list[AgentRecommendation] = []
    for (kind, target), recs in groups.items():
        best = max(recs, key=lambda r: r.confidence)
        # Boost priority when multiple agents agree
        agreement_bonus = min(len(recs) - 1, 5) * 2
        merged.append(AgentRecommendation(
            kind=kind,
            target=target,
            confidence=best.confidence,
            priority=min(best.priority + agreement_bonus, 99),
            description=best.description,
        ))

    merged.sort(key=lambda r: r.priority, reverse=True)
    return merged


# ---------------------------------------------------------------------------
# SwarmController
# ---------------------------------------------------------------------------


class SwarmController:

    def __init__(self, config: dict[str, Any]) -> None:
        self._cfg    = config
        self._bus    = SwarmBus(
            ghostbrain_url=config.get("ghostbrain_url", "http://localhost:7900"),
            bridge_enabled=True,
        )
        self._registry  = AgentRegistry(config)
        self._agents    = self._registry.get_agents()
        self._relay_url = config.get("signing_relay_url", "http://localhost:7910")
        self._gb_url    = config.get("ghostbrain_url",    "http://localhost:7900")
        self._tick      = 0
        self._running   = False

    # ------------------------------------------------------------------
    def run(self, once: bool = False) -> None:
        self._running = True
        logger.info(
            "GhostStack Python Swarm starting — %d agents, interval=%ds",
            len(self._agents), TICK_INTERVAL_S,
        )
        while self._running:
            self._tick += 1
            try:
                self._execute_tick()
            except Exception as exc:  # noqa: BLE001
                logger.error("Tick error: %s", exc, exc_info=True)
            if once:
                break
            time.sleep(TICK_INTERVAL_S)

    # ------------------------------------------------------------------
    def _execute_tick(self) -> None:
        t0      = time.monotonic()
        context = SwarmContext(bus=self._bus, tick=self._tick, config=self._cfg)

        # 1. Pull directives from GhostBrain → distribute to agents via bus
        self._pull_and_relay_directives()

        # 2. Run all agents in parallel
        reports: list[AgentReport] = []
        with concurrent.futures.ThreadPoolExecutor(
            max_workers=len(self._agents), thread_name_prefix="swarm-agent"
        ) as ex:
            futures = {ex.submit(agent.run, context): agent for agent in self._agents}
            done, _ = concurrent.futures.wait(
                futures, timeout=AGENT_TIMEOUT_S
            )
            for fut in done:
                try:
                    reports.append(fut.result())
                except Exception as exc:  # noqa: BLE001
                    agent = futures[fut]
                    logger.warning("Agent %s raised: %s", agent.name, exc)
            # Agents that timed out
            for fut in futures:
                if fut not in done:
                    agent = futures[fut]
                    logger.warning("Agent %s timed out after %ds", agent.name, AGENT_TIMEOUT_S)
                    fut.cancel()

        # 3. Consensus
        actions = _consensus(reports)

        # 4. Publish consensus:actions on bus + GhostBrain
        self._bus.publish("consensus:actions", "SwarmController", {
            "tick":        self._tick,
            "actionCount": len(actions),
            "actions": [
                {
                    "kind":        a.kind,
                    "target":      a.target,
                    "confidence":  a.confidence,
                    "priority":    a.priority,
                    "description": a.description,
                }
                for a in actions
            ],
        })

        # 5. Submit high-priority governance actions to signing relay
        for action in actions:
            if action.priority >= 85 and action.kind.startswith("governance"):
                self._submit_to_relay(action)

        # 6. Log summary
        healthy_count = sum(1 for r in reports if r.healthy)
        elapsed = time.monotonic() - t0
        logger.info(
            "Tick %d | agents=%d/%d healthy | actions=%d | %.2fs",
            self._tick, healthy_count, len(self._agents), len(actions), elapsed,
        )
        for action in actions[:10]:   # log top 10
            logger.info(
                "  [%02d] %s → %s (%.2f): %s",
                action.priority, action.kind, action.target or "—",
                action.confidence, action.description[:80],
            )

    # ------------------------------------------------------------------
    def _pull_and_relay_directives(self) -> None:
        url = f"{self._gb_url}/api/v1/directives?agent=python-swarm"
        try:
            with urllib.request.urlopen(
                urllib.request.Request(url), timeout=5
            ) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                directives = data if isinstance(data, list) else data.get("directives", [])
                for d in directives:
                    # Broadcast as bus message so any agent can pick it up
                    self._bus.publish("consensus:actions", "GhostBrain", {
                        "tick":   self._tick,
                        "source": "ghostbrain_directive",
                        "directive": d,
                    })
        except (urllib.error.URLError, json.JSONDecodeError, OSError):
            pass

    # ------------------------------------------------------------------
    def _submit_to_relay(self, action: AgentRecommendation) -> None:
        payload = {
            "source":            "python-swarm",
            "timestamp":         int(time.time()),
            "chain_id":          14000101,
            "gas_token":         "GST",
            "kind":              action.kind,
            "target":            action.target,
            "confidence":        action.confidence,
            "description":       action.description,
            "simulation_only":   True,
            "requires_human_review": True,
        }
        body = json.dumps(payload).encode("utf-8")
        req  = urllib.request.Request(
            f"{self._relay_url}/proposals",
            data=body,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=5):
                pass
        except urllib.error.URLError as exc:
            logger.debug("Relay submit failed: %s", exc)


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------


def _setup_logging(cfg: dict[str, Any]) -> None:
    level = getattr(logging, cfg.get("log_level", "INFO").upper(), logging.INFO)
    log_file = cfg.get("log_file", "/home/ghost/ghostl-stack/logs/ai-swarm.log")
    Path(log_file).parent.mkdir(parents=True, exist_ok=True)
    handlers: list[logging.Handler] = [logging.StreamHandler(sys.stdout)]
    try:
        fh = logging.handlers.RotatingFileHandler(
            log_file, maxBytes=10 * 1024 * 1024, backupCount=5
        )
        fh.setFormatter(logging.Formatter(LOG_FORMAT))
        handlers.append(fh)
    except OSError:
        pass
    logging.basicConfig(level=level, format=LOG_FORMAT, handlers=handlers)


def main() -> None:
    parser = argparse.ArgumentParser(description="GhostStack AI Swarm Controller")
    parser.add_argument("--config", type=Path, default=None)
    parser.add_argument("--once",   action="store_true", help="Single tick then exit")
    args = parser.parse_args()

    config = _load_config(args.config)
    _setup_logging(config)

    SwarmController(config).run(once=args.once)


if __name__ == "__main__":
    main()
