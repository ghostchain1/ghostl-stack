from __future__ import annotations

import os
from pathlib import Path
from typing import Any

from core.common import ensure_dir, run_command, utc_ts, write_json
from core.policy.policy_guard import detect_subnet_overlaps, validate_routing_law


def _select_l3_probe_source(ndsm: dict[str, Any]) -> tuple[str | None, str]:
    docker_cfg = ndsm.get("docker") or {}
    enforce_labels = docker_cfg.get("enforce_labels") or {}
    l3_label = enforce_labels.get("l3", "ghost.layer=l3")

    by_label = run_command(["docker", "ps", "--filter", f"label={l3_label}", "--format", "{{.Names}}"], timeout=5)
    if by_label.get("ok") and by_label.get("stdout"):
        first = by_label["stdout"].splitlines()[0].strip()
        if first:
            return first, "label"

    by_network = run_command(
        [
            "docker",
            "network",
            "inspect",
            "ghost_l3_net",
            "--format",
            "{{range $id, $v := .Containers}}{{println $v.Name}}{{end}}",
        ],
        timeout=5,
    )
    if by_network.get("ok") and by_network.get("stdout"):
        candidates = [line.strip() for line in by_network["stdout"].splitlines() if line.strip()]
        if candidates:
            scored = sorted(
                candidates,
                key=lambda name: (
                    0 if "l3" in name.lower() else 1,
                    0 if "op-gate" not in name.lower() else 1,
                    name,
                ),
            )
            return scored[0], "network"

    return None, "none"


def run_verification(
    ndsm: dict[str, Any],
    policy: dict[str, Any],
    evidence_dir: Path,
    discovered: dict[str, Any] | None = None,
    context: str | None = None,
    probe_source: str | None = None,
) -> dict[str, Any]:
    ts = utc_ts()
    target = ensure_dir(evidence_dir / ts)

    routing_ok, routing_errors = validate_routing_law(policy)
    overlaps = detect_subnet_overlaps(ndsm)

    verify_context = context or os.getenv("GNS_VERIFY_CONTEXT", "host")
    l3_checks_enforced = verify_context in {"l3", "l3-vm", "l3-container"}
    l2_probe_ip = os.getenv("GNS_L2_PROBE_IP", "10.30.0.10")
    l2_probe_service = os.getenv("GNS_L2_PROBE_SERVICE", "op-gate")

    selected_probe_source = probe_source
    probe_source_strategy = "explicit" if probe_source else "none"
    if l3_checks_enforced and not selected_probe_source:
        selected_probe_source, probe_source_strategy = _select_l3_probe_source(ndsm)

    if selected_probe_source:
        ping_l2_ip = run_command(
            ["docker", "exec", selected_probe_source, "sh", "-lc", f"ping -c 1 -W 1 {l2_probe_ip}"], timeout=5
        )
        ping_l2_service = run_command(
            ["docker", "exec", selected_probe_source, "sh", "-lc", f"ping -c 1 -W 1 {l2_probe_service}"], timeout=5
        )
        ping_l2 = {
            "ok": bool(ping_l2_ip.get("ok") or ping_l2_service.get("ok")),
            "stderr": " | ".join(
                [
                    f"ip:{l2_probe_ip}:{ping_l2_ip.get('stderr', '') or ('ok' if ping_l2_ip.get('ok') else 'fail')}",
                    f"svc:{l2_probe_service}:{ping_l2_service.get('stderr', '') or ('ok' if ping_l2_service.get('ok') else 'fail')}",
                ]
            ),
        }
        ping_l1 = run_command(["docker", "exec", selected_probe_source, "sh", "-lc", "ping -c 1 -W 1 10.20.0.10"], timeout=5)
        ping_ext = run_command(["docker", "exec", selected_probe_source, "sh", "-lc", "ping -c 1 -W 1 8.8.8.8"], timeout=5)
    elif l3_checks_enforced:
        ping_l2 = {"ok": False, "stderr": "no_l3_probe_source"}
        ping_l1 = {"ok": False, "stderr": "no_l3_probe_source"}
        ping_ext = {"ok": False, "stderr": "no_l3_probe_source"}
    else:
        ping_l2_ip = run_command(["bash", "-lc", f"ping -c 1 -W 1 {l2_probe_ip}"], timeout=3)
        ping_l2_service = run_command(["bash", "-lc", f"ping -c 1 -W 1 {l2_probe_service}"], timeout=3)
        ping_l2 = {
            "ok": bool(ping_l2_ip.get("ok") or ping_l2_service.get("ok")),
            "stderr": " | ".join(
                [
                    f"ip:{l2_probe_ip}:{ping_l2_ip.get('stderr', '') or ('ok' if ping_l2_ip.get('ok') else 'fail')}",
                    f"svc:{l2_probe_service}:{ping_l2_service.get('stderr', '') or ('ok' if ping_l2_service.get('ok') else 'fail')}",
                ]
            ),
        }
        ping_l1 = run_command(["bash", "-lc", "ping -c 1 -W 1 10.20.0.10"], timeout=3)
        ping_ext = run_command(["bash", "-lc", "ping -c 1 -W 1 8.8.8.8"], timeout=3)

    checks = [
        {"name": "routing_law_rules", "ok": routing_ok, "details": ",".join(routing_errors) or "ok"},
        {"name": "no_subnet_overlap", "ok": len(overlaps) == 0, "details": "; ".join(overlaps) or "ok"},
        {
            "name": "l3_to_l2_reachability_probe",
            "ok": ping_l2.get("ok", False) if l3_checks_enforced else True,
            "details": ping_l2.get("stderr", "") if l3_checks_enforced else "skipped_non_l3_context",
        },
        {
            "name": "l3_to_l1_direct_probe_expected_block",
            "ok": (not ping_l1.get("ok", False)) if l3_checks_enforced else True,
            "details": ping_l1.get("stderr", "") if l3_checks_enforced else "skipped_non_l3_context",
        },
        {
            "name": "l3_to_external_probe_expected_block",
            "ok": (not ping_ext.get("ok", False)) if l3_checks_enforced else True,
            "details": ping_ext.get("stderr", "") if l3_checks_enforced else "skipped_non_l3_context",
        },
    ]

    if discovered:
        checks.append(
            {
                "name": "docker_state_observed",
                "ok": "docker" in discovered,
                "details": f"network_count={discovered.get('docker', {}).get('network_count', 0)}",
            }
        )

    payload = {
        "timestamp": ts,
        "ok": all(c["ok"] for c in checks),
        "context": verify_context,
        "probe_source": selected_probe_source,
        "probe_source_strategy": probe_source_strategy,
        "checks": checks,
    }
    write_json(target / "network-verification.json", payload)
    return payload
