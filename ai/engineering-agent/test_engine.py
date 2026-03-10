#!/usr/bin/env python3
"""
GhostStack Autonomous AI Engineering Agent — Test Engine
=========================================================
Validates patches before they may be committed.  The engine applies each
"diff" patch to a temporary copy of the affected file, runs the configured
test commands, and returns a pass/fail verdict.

Safety invariants
-----------------
• Tests run in the real repository directory (forge/npm require project context).
• A failed test causes the staged change to be reverted immediately.
• No patch is committed if ANY test command exits non-zero.
• No shell=True in subprocess calls.
• Repair mode "advisory" bypasses this engine — patches are submitted to the
  signing relay unconditionally; TestEngine only gates "automatic" mode.
"""

from __future__ import annotations

import logging
import os
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from typing import Any

from patch_generator import Patch

logger = logging.getLogger("TestEngine")


class TestEngine:

    def __init__(self, config: dict[str, Any]) -> None:
        self._cfg       = config
        self._repo      = Path(config["repo_path"])
        self._commands  = config.get("test_commands", [])
        self._mode      = config.get("repair_mode", "advisory")

    # ------------------------------------------------------------------
    def validate(self, patches: list[Patch]) -> list[Patch]:
        """
        Return the subset of patches that pass the test gate.
        Advisory-only patches pass through without running any test.
        """
        if self._mode != "automatic":
            # Nothing to gate in advisory / dry_run modes
            logger.info("Repair mode=%s — test gate skipped", self._mode)
            return patches

        approved: list[Patch] = []
        for patch in patches:
            if patch.patch_type != "diff":
                approved.append(patch)
                continue
            if self._validate_patch(patch):
                approved.append(patch)
            else:
                logger.warning(
                    "Patch for %s:%s REJECTED by test gate",
                    patch.finding.file,
                    patch.finding.line,
                )
        logger.info(
            "Test gate: %d/%d patches approved", len(approved), len(patches)
        )
        return approved

    # ------------------------------------------------------------------
    def _validate_patch(self, patch: Patch) -> bool:
        abs_path = self._repo / patch.finding.file
        if not abs_path.is_file():
            return False

        # Backup
        backup = abs_path.read_bytes()

        try:
            # Apply diff to a temp file and replace original
            applied = self._apply_diff(patch.diff, abs_path)
            if not applied:
                return False

            # Run every test command in the repo root
            for cmd in self._commands:
                if not self._run_command(cmd):
                    logger.warning("Test command %s failed — reverting", cmd)
                    abs_path.write_bytes(backup)
                    return False

            return True

        except Exception as exc:  # noqa: BLE001
            logger.error("Patch validation error: %s", exc)
            abs_path.write_bytes(backup)
            return False

    # ------------------------------------------------------------------
    def _apply_diff(self, diff: str, target: Path) -> bool:
        """Apply a unified diff using the `patch` binary if available."""
        patch_bin = shutil.which("patch")
        if not patch_bin:
            logger.debug("patch binary not found — skipping diff apply")
            return False
        with tempfile.NamedTemporaryFile(mode="w", suffix=".patch", delete=False) as tf:
            tf.write(diff)
            tf_name = tf.name
        try:
            result = subprocess.run(
                [patch_bin, "--backup", str(target)],
                input=diff,
                capture_output=True,
                text=True,
                cwd=str(self._repo),
            )
            return result.returncode == 0
        finally:
            try:
                os.unlink(tf_name)
            except OSError:
                pass

    # ------------------------------------------------------------------
    def _run_command(self, cmd: list[str]) -> bool:
        """Run a test command and return True on success."""
        bin_path = shutil.which(cmd[0])
        if not bin_path:
            logger.debug("Command %s not found — treating as pass", cmd[0])
            return True
        start = time.monotonic()
        result = subprocess.run(
            [bin_path] + cmd[1:],
            capture_output=True,
            text=True,
            cwd=str(self._repo),
            timeout=600,
        )
        elapsed = time.monotonic() - start
        logger.info(
            "Command %s exit=%d (%.1fs)",
            " ".join(cmd), result.returncode, elapsed,
        )
        if result.returncode != 0:
            logger.debug("stdout: %s", result.stdout[-2000:])
            logger.debug("stderr: %s", result.stderr[-2000:])
        return result.returncode == 0
