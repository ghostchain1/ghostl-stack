#!/usr/bin/env python3
"""
GhostStack Autonomous AI Engineering Agent — Repository Scanner
=================================================================
Walks the repository, classifies every file by type, and returns a
structured manifest that the CodeAnalyzer consumes.

Rules
-----
• No shell=True in any subprocess call.
• Excludes directories listed in config["scan_exclude"].
• Never modifies files — read-only scan pass.
"""

from __future__ import annotations

import hashlib
import logging
import os
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

logger = logging.getLogger("RepoScanner")

# ---------------------------------------------------------------------------
# File-type classification
# ---------------------------------------------------------------------------

_EXT_MAP: dict[str, str] = {
    ".sol":    "solidity",
    ".ts":     "typescript",
    ".tsx":    "typescript",
    ".js":     "javascript",
    ".mjs":    "javascript",
    ".cjs":    "javascript",
    ".py":     "python",
    ".sh":     "shell",
    ".bash":   "shell",
    ".yaml":   "yaml",
    ".yml":    "yaml",
    ".json":   "json",
    ".toml":   "toml",
    ".md":     "markdown",
    ".env":    "env",
}

_COMPOSE_NAMES = {
    "docker-compose.yml", "docker-compose.yaml",
    "compose.yml", "compose.yaml",
}

_DOCKERFILE_NAMES = {"Dockerfile", "dockerfile"}


@dataclass
class ScannedFile:
    path:      str           # absolute
    rel_path:  str           # relative to repo_path
    file_type: str           # solidity | typescript | python | shell | yaml | json | ...
    size:      int           # bytes
    sha256:    str           # hex digest (first 16 chars)
    modified:  float         # mtime epoch


@dataclass
class RepoManifest:
    repo_path:    str
    scanned_at:   float
    files:        list[ScannedFile] = field(default_factory=list)
    file_count:   int = 0
    by_type:      dict[str, list[ScannedFile]] = field(default_factory=dict)

    def group_by_type(self) -> None:
        self.by_type = {}
        for f in self.files:
            self.by_type.setdefault(f.file_type, []).append(f)
        self.file_count = len(self.files)


# ---------------------------------------------------------------------------
# Scanner
# ---------------------------------------------------------------------------

class RepoScanner:
    """Stateless file-system scanner for the GhostStack repository."""

    def __init__(self, config: dict[str, Any]) -> None:
        self._repo_path = Path(config["repo_path"])
        self._excludes: set[str] = set(config.get("scan_exclude", []))

    # ------------------------------------------------------------------
    def scan(self) -> RepoManifest:
        """Return a full RepoManifest for the current state of the repo."""
        manifest = RepoManifest(
            repo_path=str(self._repo_path),
            scanned_at=time.time(),
        )
        for root, dirs, files in os.walk(self._repo_path, topdown=True):
            # Prune excluded directories in-place so os.walk skips them.
            rel_root = Path(root).relative_to(self._repo_path)
            dirs[:] = [
                d for d in dirs
                if not self._is_excluded(rel_root / d)
            ]
            for name in files:
                abs_path = os.path.join(root, name)
                rel_path = str(Path(abs_path).relative_to(self._repo_path))
                if self._is_excluded(Path(rel_path)):
                    continue
                sf = self._classify(abs_path, rel_path, name)
                if sf is not None:
                    manifest.files.append(sf)

        manifest.group_by_type()
        logger.info(
            "Scan complete: %d files across %d types",
            manifest.file_count,
            len(manifest.by_type),
        )
        return manifest

    # ------------------------------------------------------------------
    def _is_excluded(self, rel: Path) -> bool:
        parts = rel.parts
        return any(excl in parts for excl in self._excludes)

    # ------------------------------------------------------------------
    def _classify(
        self, abs_path: str, rel_path: str, name: str
    ) -> ScannedFile | None:
        try:
            stat = os.stat(abs_path)
        except OSError:
            return None
        if not os.path.isfile(abs_path):
            return None

        file_type = self._file_type(name, rel_path)
        sha = self._sha256_prefix(abs_path)
        return ScannedFile(
            path=abs_path,
            rel_path=rel_path,
            file_type=file_type,
            size=stat.st_size,
            sha256=sha,
            modified=stat.st_mtime,
        )

    # ------------------------------------------------------------------
    @staticmethod
    def _file_type(name: str, rel: str) -> str:
        if name in _COMPOSE_NAMES or "docker-compose" in name:
            return "compose"
        if name in _DOCKERFILE_NAMES or name.startswith("Dockerfile."):
            return "dockerfile"
        ext = Path(name).suffix.lower()
        return _EXT_MAP.get(ext, "other")

    # ------------------------------------------------------------------
    @staticmethod
    def _sha256_prefix(path: str, block: int = 65536) -> str:
        h = hashlib.sha256()
        try:
            with open(path, "rb") as fh:
                for chunk in iter(lambda: fh.read(block), b""):
                    h.update(chunk)
        except OSError:
            return "error"
        return h.hexdigest()[:16]
