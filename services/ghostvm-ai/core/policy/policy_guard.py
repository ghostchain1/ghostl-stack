from __future__ import annotations

import ipaddress
from typing import Any


def validate_routing_law(policy: dict[str, Any]) -> tuple[bool, list[str]]:
    rules = policy.get("rules") or []
    index = {(r.get("from"), r.get("to")): r.get("action") for r in rules}
    errors: list[str] = []

    if index.get(("l3", "l2")) != "allow":
        errors.append("missing_allow_l3_to_l2")
    if index.get(("l3", "l1")) != "deny":
        errors.append("missing_deny_l3_to_l1")
    if index.get(("l3", "external")) != "deny":
        errors.append("missing_deny_l3_to_external")
    if index.get(("l2", "l1")) != "allow":
        errors.append("missing_allow_l2_to_l1")
    if index.get(("l2", "external")) != "deny":
        errors.append("missing_deny_l2_to_external")
    if index.get(("l1", "external")) != "allow":
        errors.append("missing_allow_l1_to_external")

    return len(errors) == 0, errors


def detect_subnet_overlaps(ndsm: dict[str, Any]) -> list[str]:
    segments = ndsm.get("network_segments") or {}
    parsed: list[tuple[str, ipaddress.IPv4Network]] = []
    for seg, cfg in segments.items():
        cidr = cfg.get("cidr")
        if not cidr:
            continue
        parsed.append((seg, ipaddress.ip_network(cidr, strict=False)))

    overlaps: list[str] = []
    for idx, (a_name, a_net) in enumerate(parsed):
        for b_name, b_net in parsed[idx + 1 :]:
            if a_net.overlaps(b_net):
                overlaps.append(f"{a_name}:{a_net} overlaps {b_name}:{b_net}")
    return overlaps


def validate_external_ip_allocations(ndsm: dict[str, Any]) -> tuple[bool, list[str]]:
    errors: list[str] = []
    external = (ndsm.get("network_segments") or {}).get("external") or {}
    ext_cidr = external.get("cidr")
    if not ext_cidr:
        return False, ["missing_external_cidr"]

    ext_net = ipaddress.ip_network(ext_cidr, strict=False)
    ipam = ndsm.get("ipam") or {}
    primary = ipam.get("external_primary_ip")
    reserved = ipam.get("external_reserved_ips") or []
    bindings = ipam.get("public_role_bindings") or {}

    alloc_ips = [ip for ip in [primary, *reserved] if ip]
    seen_alloc: set[str] = set()
    for ip in alloc_ips:
        try:
            addr = ipaddress.ip_address(ip)
        except ValueError:
            errors.append(f"invalid_ip:{ip}")
            continue
        if addr not in ext_net:
            errors.append(f"ip_outside_external_cidr:{ip}")
        if ip in seen_alloc:
            errors.append(f"duplicate_ip:{ip}")
        seen_alloc.add(ip)

    allowed_binding_ips = set(alloc_ips)
    for role, ip in bindings.items():
        try:
            addr = ipaddress.ip_address(ip)
        except ValueError:
            errors.append(f"invalid_ip:{role}:{ip}")
            continue
        if addr not in ext_net:
            errors.append(f"ip_outside_external_cidr:{role}:{ip}")
        if ip not in allowed_binding_ips:
            errors.append(f"binding_ip_not_allocated:{role}:{ip}")

    return len(errors) == 0, errors
