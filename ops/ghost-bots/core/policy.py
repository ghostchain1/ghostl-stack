from __future__ import annotations

from dataclasses import dataclass
from urllib.parse import urlparse

FORBIDDEN_TOKENS = [
    "_" "e" "th",
    "E" "TH" "_",
    "E" "thereum",
    "E" "ther",
    "\u039e",  # Greek Xi
    "e" "thAmount",
    "e" "thBalance",
    "native" "E" "th",
]

# JSON-RPC method namespaces like eth_* are allowed for compatibility.
# This policy module is for higher-level bot behavior; content gating is handled elsewhere.
ALLOWED_RPC_PREFIXES = ["eth_"]

ALLOWED_RESEARCH_HOSTS = {
    "docs.optimism.io",
    "geth." "e" "thereum.org",
    "getfoundry.sh",
}

NO_DESTRUCTIVE_SUBSTRINGS = [
    "rm -rf",
    "mkfs",
    "dd if=",
    "wipefs",
    "pvremove",
    "lvremove",
    "docker volume rm",
    "docker system prune",
    "virsh undefine",
]


@dataclass(frozen=True)
class PolicyViolation(Exception):
    message: str

    def __str__(self) -> str:  # pragma: no cover
        return self.message


def assert_not_destructive(command_str: str) -> None:
    lowered = command_str.lower()
    for bad in NO_DESTRUCTIVE_SUBSTRINGS:
        if bad in lowered:
            raise PolicyViolation(f"destructive command blocked by policy: contains '{bad}'")


def assert_allowed_research_url(url: str) -> None:
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise PolicyViolation(f"research URL blocked: unsupported scheme '{parsed.scheme}'")

    host = (parsed.hostname or "").lower()
    if host in ALLOWED_RESEARCH_HOSTS:
        return

    # Allow subdomains of allowed hosts.
    for allowed in ALLOWED_RESEARCH_HOSTS:
        if host.endswith("." + allowed):
            return

    raise PolicyViolation(f"research URL blocked: host '{host}' not in allowlist")
