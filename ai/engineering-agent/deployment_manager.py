#!/usr/bin/env python3
"""
GhostStack Autonomous AI Engineering Agent — Deployment Manager
===============================================================
Applies approved patches and, when repair_mode=automatic, commits them via git.

Repair modes
-----------
dry_run   — display what would happen; write nothing.
advisory  — submit patch metadata to the signing relay; no file writes.
automatic — write diff patches to disk, run git commit after test gate.

Safety invariants
-----------------
• Governance-proposal patches are NEVER written to disk — always relay-only.
• Advisory patches are forwarded to the signing relay, not applied.
• Automatic patches are capped by max_patch_lines (enforced by PatchGenerator).
• git commit only happens when repair_mode=automatic AND git_commit_enabled=true.
• No shell=True anywhere.
• Rollback: if git commit fails, git checkout HEAD reverts the file.
"""

from __future__ import annotations

import json
import logging
import os
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

from patch_generator import Patch

logger = logging.getLogger("DeploymentManager")


class DeploymentManager:

    def __init__(self, config: dict[str, Any]) -> None:
        self._cfg              = config
        self._repo             = Path(config["repo_path"])
        self._mode             = config.get("repair_mode", "advisory")
        self._git_enabled      = config.get("git_commit_enabled", False)
        self._git_author_name  = config.get("git_author_name", "GhostStack AI Agent")
        self._git_author_email = config.get("git_author_email", "ai-agent@ghostchain.local")
        self._relay_url        = config.get("signing_relay_url", "http://localhost:7910")

    # ------------------------------------------------------------------
    def deploy(self, patches: list[Patch]) -> dict[str, int]:
        """
        Deploy all approved patches according to repair mode.
        Returns a summary dict: {"applied": N, "advisory": N, "skipped": N}.
        """
        applied = 0
        advisory = 0
        skipped = 0

        for patch in patches:
            result = self._dispatch(patch)
            if result == "applied":
                applied += 1
            elif result == "advisory":
                advisory += 1
            else:
                skipped += 1

        logger.info(
            "Deploy complete: applied=%d advisory=%d skipped=%d",
            applied, advisory, skipped,
        )
        return {"applied": applied, "advisory": advisory, "skipped": skipped}

    # ------------------------------------------------------------------
    def _dispatch(self, patch: Patch) -> str:
        if patch.patch_type in ("governance_proposal", "advisory"):
            self._submit_to_relay(patch)
            return "advisory"

        # diff patch
        if self._mode == "dry_run":
            logger.info("[DRY RUN] Would apply patch: %s", patch.description)
            return "skipped"

        if self._mode == "advisory":
            self._submit_to_relay(patch)
            return "advisory"

        # automatic
        if patch.patch_type == "diff":
            ok = self._apply_diff_patch(patch)
            if ok:
                self._git_commit(patch)
                return "applied"
            return "skipped"

        return "skipped"

    # ------------------------------------------------------------------
    def _apply_diff_patch(self, patch: Patch) -> bool:
        patch_bin = shutil.which("patch")
        if not patch_bin:
            logger.warning("patch binary not found; cannot apply diff patch")
            return False

        abs_path = self._repo / patch.finding.file
        if not abs_path.is_file():
            logger.warning("Target file does not exist: %s", abs_path)
            return False

        backup = abs_path.read_bytes()
        result = subprocess.run(
            [patch_bin, "--backup", str(abs_path)],
            input=patch.diff,
            capture_output=True,
            text=True,
            cwd=str(self._repo),
        )
        if result.returncode != 0:
            logger.error("patch failed: %s", result.stderr.strip())
            abs_path.write_bytes(backup)
            return False

        logger.info("Patch applied: %s", patch.finding.file)
        return True

    # ------------------------------------------------------------------
    def _git_commit(self, patch: Patch) -> None:
        if not self._git_enabled:
            logger.info("git commits disabled (git_commit_enabled=false)")
            return
        git = shutil.which("git")
        if not git:
            logger.warning("git not found; skipping commit")
            return

        env = {
            **os.environ,
            "GIT_AUTHOR_NAME":     self._git_author_name,
            "GIT_AUTHOR_EMAIL":    self._git_author_email,
            "GIT_COMMITTER_NAME":  self._git_author_name,
            "GIT_COMMITTER_EMAIL": self._git_author_email,
        }
        msg = f"AI auto-fix [{patch.finding.severity}]: {patch.description[:120]}"

        # Add the single file and commit
        add = subprocess.run(
            [git, "add", str(self._repo / patch.finding.file)],
            capture_output=True, cwd=str(self._repo), env=env,
        )
        if add.returncode != 0:
            logger.error("git add failed: %s", add.stderr)
            return

        commit = subprocess.run(
            [git, "commit", "-m", msg],
            capture_output=True, cwd=str(self._repo), env=env,
        )
        if commit.returncode != 0:
            logger.error("git commit failed: %s — reverting file", commit.stderr)
            subprocess.run(
                [git, "checkout", "HEAD", "--", str(self._repo / patch.finding.file)],
                cwd=str(self._repo), env=env,
            )
        else:
            logger.info("Committed: %s", msg)

    # ------------------------------------------------------------------
    def _submit_to_relay(self, patch: Patch) -> None:
        """POST patch proposal to the signing relay (advisory queue)."""
        payload = {
            "source":     "ai-engineering-agent",
            "timestamp":  int(time.time()),
            "patch_type": patch.patch_type,
            "description": patch.description,
            "proposal":   patch.proposal,
            "finding":    patch.finding.as_dict(),
        }
        body = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            url=f"{self._relay_url}/proposals",
            data=body,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=5) as resp:
                logger.info(
                    "Relay: submitted %s patch for %s (HTTP %s)",
                    patch.patch_type, patch.finding.file, resp.status,
                )
        except urllib.error.URLError as exc:
            logger.warning("Relay unreachable (%s) — patch logged locally", exc)
            self._log_locally(payload)

    # ------------------------------------------------------------------
    def _log_locally(self, payload: dict[str, Any]) -> None:
        log_dir = self._repo / "logs" / "ai-patches"
        log_dir.mkdir(parents=True, exist_ok=True)
        fname = log_dir / f"patch-{int(time.time())}.json"
        fname.write_text(json.dumps(payload, indent=2), encoding="utf-8")
        logger.info("Patch logged locally: %s", fname)
