from core.policy.policy_guard import detect_subnet_overlaps, validate_external_ip_allocations, validate_routing_law


def test_validate_routing_law_ok() -> None:
    policy = {
        "rules": [
            {"from": "l3", "to": "l2", "action": "allow"},
            {"from": "l3", "to": "l1", "action": "deny"},
            {"from": "l3", "to": "external", "action": "deny"},
            {"from": "l2", "to": "l1", "action": "allow"},
            {"from": "l2", "to": "external", "action": "deny"},
            {"from": "l1", "to": "external", "action": "allow"},
        ]
    }
    ok, errors = validate_routing_law(policy)
    assert ok
    assert errors == []


def test_overlap_detection() -> None:
    ndsm = {
        "network_segments": {
            "a": {"cidr": "10.0.0.0/24"},
            "b": {"cidr": "10.0.0.0/25"},
        }
    }
    overlaps = detect_subnet_overlaps(ndsm)
    assert overlaps


def test_external_ip_allocations_valid() -> None:
    ndsm = {
        "network_segments": {
            "external": {"cidr": "208.110.71.128/26"},
        },
        "ipam": {
            "external_primary_ip": "208.110.71.164",
            "external_reserved_ips": [
                "208.110.71.171",
                "208.110.71.172",
                "208.110.71.173",
                "208.110.71.174",
                "208.110.71.175",
                "208.110.71.176",
                "208.110.71.177",
            ],
            "public_role_bindings": {
                "l1": "208.110.71.171",
                "l2": "208.110.71.172",
            },
        },
    }
    ok, errors = validate_external_ip_allocations(ndsm)
    assert ok, errors
    assert errors == []


def test_external_ip_allocations_outside_cidr() -> None:
    ndsm = {
        "network_segments": {
            "external": {"cidr": "208.110.71.128/26"},
        },
        "ipam": {
            "external_primary_ip": "208.110.71.200",
            "external_reserved_ips": [],
            "public_role_bindings": {},
        },
    }
    ok, errors = validate_external_ip_allocations(ndsm)
    assert not ok
    assert any("ip_outside_external_cidr" in e for e in errors)
