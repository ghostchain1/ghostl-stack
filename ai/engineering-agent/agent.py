#!/usr/bin/env python3
"""
GhostStack Autonomous AI Engineering Agent — Main Loop
======================================================
Wires all modules together into a continuous autonomous engineering cycle:

  Scan → Analyze → PatchGen → TestGate → Deploy → GhostBrain report
        ↑_________________________loopback__________________________|

The loop runs on the configured scan_interval_s.  GhostBrain directives are
also pulled each cycle and acted on (advisory actions only).

Run modes
---------
  python agent.py              — foreground, Ctrl-C to stop
  python agent.py --once       — single cycle then exit (useful in CI)
  systemctl start ghost-ai-agent

Safety invariants
-----------------
  • No autonomous on-chain writes.
  • repair_mode defaults to "advisory" (see config.yaml).
  • CRITICAL findings are always escalated to GhostBrain + signing relay.
  • All patches are logged even if relay is unreachable.
"""

from __future__ import annotations

import argparse
import logging
import logging.handlers
import os
import sys
import time
from pathlib import Path
from typing import Any

import yaml

from repo_scanner          import RepoScanner
from code_analyzer         import CodeAnalyzer, Finding
from patch_generator       import PatchGenerator
from test_engine           import TestEngine
from deployment_manager    import DeploymentManager
from infrastructure_interface import InfrastructureInterface
from ghostbrain_memory     import GhostBrainMemory

# ---------------------------------------------------------------------------
# Logging setup
# ---------------------------------------------------------------------------

LOG_FORMAT = "%(asctime)s [%(levelname)s] %(name)s: %(message)s"
_DEFAULT_LOG = "/home/ghost/ghostl-stack/logs/ai-engineering-agent.log"


def _setup_logging(cfg: dict[str, Any]) -> None:
    level = getattr(logging, cfg.get("log_level", "INFO").upper(), logging.INFO)
    log_file = cfg.get("log_file", _DEFAULT_LOG)
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


# ---------------------------------------------------------------------------
# Config loader
# ---------------------------------------------------------------------------

_DEFAULT_CONFIG = Path(__file__).parent / "config.yaml"


def _load_config(path: Path | None = None) -> dict[str, Any]:
    config_path = path or _DEFAULT_CONFIG
    if not config_path.is_file():
        raise FileNotFoundError(f"Config not found: {config_path}")
    with open(config_path, encoding="utf-8") as fh:
        cfg: dict[str, Any] = yaml.safe_load(fh) or {}
    # Allow env overrides for critical values
    cfg["repo_path"]          = os.environ.get("REPO_PATH",           cfg.get("repo_path", "/home/ghost/ghostl-stack"))
    cfg["repair_mode"]        = os.environ.get("REPAIR_MODE",         cfg.get("repair_mode", "advisory"))
    cfg["ghostbrain_url"]     = os.environ.get("GHOSTBRAIN_API_URL",  cfg.get("ghostbrain_url", "http://localhost:7900"))
    cfg["gais_url"]           = os.environ.get("GAIS_URL",            cfg.get("gais_url", "http://localhost:9100"))
    cfg["signing_relay_url"]  = os.environ.get("SIGNING_RELAY_URL",   cfg.get("signing_relay_url", "http://localhost:7910"))
    cfg["gais_api_token"]     = os.environ.get("GAIS_API_TOKEN",      cfg.get("gais_api_token", ""))
    cfg["git_commit_enabled"] = os.environ.get("GIT_COMMIT_ENABLED",  str(cfg.get("git_commit_enabled", False))).lower() == "true"
    return cfg


# ---------------------------------------------------------------------------
# Core agent
# ---------------------------------------------------------------------------

logger = logging.getLogger("EngineeringAgent")


class EngineeringAgent:
    """Top-level coordinator for the autonomous engineering loop."""

    def __init__(self, config: dict[str, Any]) -> None:
        self._cfg      = config
        self._interval = int(config.get("scan_interval_s", 300))

        self.scanner  = RepoScanner(config)
        self.analyzer = CodeAnalyzer(config)
        self.patcher  = PatchGenerator(config)
        self.tester   = TestEngine(config)
        self.deployer = DeploymentManager(config)
        self.infra    = InfrastructureInterface(config)
        self.memory   = GhostBrainMemory(config)

    # ------------------------------------------------------------------
    def run(self, once: bool = False) -> None:
        logger.info(
            "GhostStack AI Engineering Agent starting — mode=%s interval=%ds",
            self._cfg["repair_mode"], self._interval,
        )
        while True:
            try:
                self._cycle()
            except Exception as exc:  # noqa: BLE001
                logger.error("Cycle error: %s", exc, exc_info=True)

            if once:
                break
            logger.info("Sleeping %ds until next cycle …", self._interval)
            time.sleep(self._interval)

    # ------------------------------------------------------------------
    def _cycle(self) -> None:
        t0 = time.monotonic()
        logger.info("=== Cycle start ===")

        # 1. Flush any spooled GhostBrain signals from previous cycle
        self.memory.flush_spool()

        # 2. Scan repository
        manifest = self.scanner.scan()
        self.memory.report_scan({
            "file_count": manifest.file_count,
            "types": {t: len(fs) for t, fs in manifest.by_type.items()},
        })

        # 3. Static analysis
        findings = self.analyzer.analyze(manifest)
        by_sev = self._count_by_severity(findings)
        self.memory.report_findings(len(findings), by_sev)
        self._log_findings(findings)

        # 4. Generate patches
        patches = self.patcher.generate(findings)

        # 5. Test gate (no-op for advisory/dry_run modes)
        approved = self.tester.validate(patches)

        # 6. Deploy / relay
        deploy_result = self.deployer.deploy(approved)
        self.memory.report_deploy(deploy_result)

        # 7. Infrastructure heartbeat
        infra_summary = self.infra.health_summary()
        self.memory.report_infra(infra_summary)
        self._log_infra(infra_summary)

        # 8. Process GhostBrain directives
        directives = self.memory.pull_directives()
        self._process_directives(directives)

        elapsed = time.monotonic() - t0
        logger.info(
            "=== Cycle complete in %.1fs | findings=%d patches=%d deployed=%s ===",
            elapsed, len(findings), len(patches), deploy_result,
        )

    # ------------------------------------------------------------------
    def _process_directives(self, directives: list[dict[str, Any]]) -> None:
        """
        Act on GhostBrain directives.
        Supported:  vm.restart, healer.reset, escalation.clear
        All actions are forwarded to GAIS (advisory) — never executed inline.
        """
        for d in directives:
            dtype = d.get("type", "")
            target = d.get("target", "")
            logger.info("Processing directive: type=%s target=%s", dtype, target)
            if dtype == "vm.restart" and target:
                self.infra.restart_vm(target)
            elif dtype == "healer.reset" and target:
                self.infra.reset_healer(target)
            elif dtype == "escalation.clear" and target:
                self.infra.clear_escalation(target)
            else:
                logger.warning("Unknown or incomplete directive: %s", d)

    # ------------------------------------------------------------------
    def _log_findings(self, findings: list[Finding]) -> None:
        if not findings:
            logger.info("No findings this cycle.")
            return
        for f in findings:
            log_fn = logger.error if f.severity in ("CRITICAL", "HIGH") else logger.warning
            log_fn("[%s] %s %s:%d — %s", f.severity, f.category, f.file, f.line, f.message)

    # ------------------------------------------------------------------
    def _log_infra(self, summary: dict[str, Any]) -> None:
        gais_ok = summary.get("gais_reachable", False)
        vms_up  = summary.get("vm_count_up", "?")
        total   = summary.get("vm_count_total", "?")
        logger.info("Infrastructure: GAIS=%s VMs=%s/%s proposals_pending=%s",
                    "UP" if gais_ok else "DOWN", vms_up, total,
                    summary.get("proposals_pending", 0))

    # ------------------------------------------------------------------
    @staticmethod
    def _count_by_severity(findings: list[Finding]) -> dict[str, int]:
        result: dict[str, int] = {}
        for f in findings:
            result[f.severity] = result.get(f.severity, 0) + 1
        return result


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(description="GhostStack AI Engineering Agent")
    parser.add_argument("--config", type=Path, default=None, help="Path to config.yaml")
    parser.add_argument("--once",   action="store_true",   help="Run a single cycle then exit")
    args = parser.parse_args()

    config = _load_config(args.config)
    _setup_logging(config)

    agent = EngineeringAgent(config)
    agent.run(once=args.once)


if __name__ == "__main__":
    main()
