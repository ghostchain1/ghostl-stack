from __future__ import annotations

import ipaddress
import socket
from collections import defaultdict
from typing import Dict, Iterable, List, Tuple


RecordMap = Dict[str, str]


def validate_zone_records(records: RecordMap) -> List[str]:
    errors: List[str] = []
    seen_hosts = set()
    ip_to_hosts: defaultdict[str, List[str]] = defaultdict(list)

    for host, ip in records.items():
        if host in seen_hosts:
            errors.append(f"duplicate_host:{host}")
        seen_hosts.add(host)
        try:
            ipaddress.ip_address(ip)
        except ValueError:
            errors.append(f"invalid_ip:{host}:{ip}")
            continue
        ip_to_hosts[ip].append(host)

    for ip, hosts in ip_to_hosts.items():
        if len(hosts) > 1 and not any(name.startswith("docker.") for name in hosts):
            errors.append(f"ip_conflict:{ip}:{','.join(sorted(hosts))}")

    return errors


def validate_reverse_lookup(records: RecordMap) -> List[str]:
    errors: List[str] = []
    for host, ip in records.items():
        try:
            socket.gethostbyaddr(ip)
        except OSError:
            errors.append(f"reverse_lookup_failed:{host}:{ip}")
    return errors


def validate_forward_resolution(records: RecordMap) -> List[str]:
    errors: List[str] = []
    for host, expected_ip in records.items():
        try:
            resolved = socket.gethostbyname(host)
            if resolved != expected_ip:
                errors.append(f"forward_mismatch:{host}:{resolved}!={expected_ip}")
        except OSError:
            errors.append(f"forward_lookup_failed:{host}")
    return errors


def detect_resolution_loops(records: RecordMap, cname_links: Iterable[Tuple[str, str]] | None = None) -> List[str]:
    if not cname_links:
        return []

    graph: Dict[str, str] = {src: dst for src, dst in cname_links}
    loops: List[str] = []

    for start in graph:
        visited = set()
        node = start
        while node in graph:
            if node in visited:
                loops.append(f"loop_detected:{start}")
                break
            visited.add(node)
            node = graph[node]

    return sorted(set(loops))
