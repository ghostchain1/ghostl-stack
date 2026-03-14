from __future__ import annotations

import ipaddress
from dataclasses import dataclass
from typing import Iterable


@dataclass(slots=True)
class RecursionPolicy:
    allowed_cidrs: tuple[str, ...]

    @classmethod
    def from_env(cls, cidrs: str) -> "RecursionPolicy":
        parsed = tuple(x.strip() for x in cidrs.split(",") if x.strip())
        for cidr in parsed:
            ipaddress.ip_network(cidr)
        return cls(allowed_cidrs=parsed)

    def is_allowed(self, ip: str) -> bool:
        try:
            addr = ipaddress.ip_address(ip)
        except ValueError:
            return False
        return any(addr in ipaddress.ip_network(cidr) for cidr in self.allowed_cidrs)


def default_static_records(hypervisor_ip: str, docker_ip: str) -> dict[str, str]:
    return {
        "l1.ghostchain.cloud": hypervisor_ip,
        "l2.ghostchain.cloud": hypervisor_ip,
        "l3.ghostchain.cloud": hypervisor_ip,
        "devnet.ghostchain.cloud": hypervisor_ip,
        "testnet.ghostchain.cloud": hypervisor_ip,
        "mainnet.ghostchain.cloud": hypervisor_ip,
        "hypervisor.ghostchain.cloud": hypervisor_ip,
        "docker.internal.ghostchain.cloud": docker_ip,
    }


def merge_records(*sources: Iterable[dict[str, str]]) -> dict[str, str]:
    merged: dict[str, str] = {}
    for source in sources:
        merged.update(source)
    return merged
