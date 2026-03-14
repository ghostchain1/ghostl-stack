"""
Container Manager — Docker integration.

Uses subprocess with argument lists (never shell=True) to prevent
command injection. Container names are validated before use.
"""

from __future__ import annotations

import logging
import re
import subprocess
from typing import NamedTuple

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Safety
# ---------------------------------------------------------------------------

# Docker container / image names: alphanumeric, dash, underscore, dot, slash, colon.
_SAFE_NAME_RE  = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9_.\-]{0,127}$")
_SAFE_IMAGE_RE = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9_.\/:\-]{0,255}$")

DOCKER_BIN = "/usr/bin/docker"
TIMEOUT    = 60  # seconds


def _validate_container_name(name: str) -> None:
    if not _SAFE_NAME_RE.match(name):
        raise ValueError(f"Unsafe container name: {name!r}")


def _validate_image(image: str) -> None:
    if not _SAFE_IMAGE_RE.match(image):
        raise ValueError(f"Unsafe image name: {image!r}")


# ---------------------------------------------------------------------------
# Types
# ---------------------------------------------------------------------------

class ContainerStatus(NamedTuple):
    name:   str
    status: str   # e.g. "Up 2 hours"
    health: str   # healthy | unhealthy | starting | (empty)


# ---------------------------------------------------------------------------
# ContainerManager
# ---------------------------------------------------------------------------

class ContainerManager:
    """Manages Docker containers via the Docker CLI."""

    def list(self) -> list[ContainerStatus]:
        """Return all containers (running and stopped)."""
        result = subprocess.run(
            [DOCKER_BIN, "ps", "-a", "--format", "{{.Names}}\t{{.Status}}\t{{.Health}}"],
            capture_output=True,
            text=True,
            timeout=TIMEOUT,
        )
        containers = []
        for line in result.stdout.splitlines():
            parts = line.strip().split("\t")
            name   = parts[0] if len(parts) > 0 else ""
            status = parts[1] if len(parts) > 1 else ""
            health = parts[2] if len(parts) > 2 else ""
            if name and _SAFE_NAME_RE.match(name):
                containers.append(ContainerStatus(name=name, status=status, health=health))
        return containers

    def restart(self, name: str) -> None:
        """Restart a container by name."""
        _validate_container_name(name)
        logger.info("Restarting container: %s", name)
        subprocess.run(
            [DOCKER_BIN, "restart", name],
            check=True,
            timeout=TIMEOUT,
        )

    def stop(self, name: str) -> None:
        """Stop a container."""
        _validate_container_name(name)
        subprocess.run(
            [DOCKER_BIN, "stop", name],
            check=True,
            timeout=TIMEOUT,
        )

    def start(self, name: str) -> None:
        """Start a stopped container."""
        _validate_container_name(name)
        subprocess.run(
            [DOCKER_BIN, "start", name],
            check=True,
            timeout=TIMEOUT,
        )

    def pull(self, image: str) -> None:
        """Pull an image."""
        _validate_image(image)
        logger.info("Pulling image: %s", image)
        subprocess.run(
            [DOCKER_BIN, "pull", image],
            check=True,
            timeout=120,
        )

    def unhealthy(self) -> list[str]:
        """Return names of containers reporting (unhealthy) status."""
        return [
            c.name for c in self.list()
            if "unhealthy" in c.health.lower()
        ]
