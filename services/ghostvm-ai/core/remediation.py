from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from core.common import ensure_dir, run_command, utc_ts, write_json, write_md


def _docker_bridge_for_network(network_name: str) -> tuple[str | None, str | None]:
    result = run_command(["docker", "network", "inspect", network_name, "--format", "{{.Id}}"], timeout=5)
    if not result.get("ok"):
        return None, f"network_lookup_failed:{network_name}:{result.get('stderr', '')}"
    net_id = (result.get("stdout") or "").strip()
    if not net_id:
        return None, f"network_id_empty:{network_name}"
    return f"br-{net_id[:12]}", None


def _default_uplink_iface() -> str | None:
    result = run_command(["bash", "-lc", "ip route show default | awk '/default/ {print $5; exit}'"], timeout=5)
    if not result.get("ok"):
        return None
    iface = (result.get("stdout") or "").strip()
    return iface or None


def _render_nft_rules(l1: str, l2: str, l3: str, uplink: str) -> str:
    return f"""
table inet ghostnetsync_runtime {{
  chain forward {{
    type filter hook forward priority 0;
    policy accept;

    ct state established,related accept

    iifname \"{l3}\" oifname \"{l2}\" accept
    iifname \"{l2}\" oifname \"{l1}\" accept

    iifname \"{l3}\" oifname \"{l1}\" drop
    iifname \"{l3}\" oifname \"{uplink}\" drop

    iifname \"{l2}\" oifname \"{uplink}\" drop
  }}
}}
""".strip()


def create_nft_remediation_plan(plans_dir: Path, apply: bool = False) -> dict[str, Any]:
    ts = utc_ts()
    plan_dir = ensure_dir(plans_dir / ts)

    l1_bridge, l1_err = _docker_bridge_for_network("ghost_l1_net")
    l2_bridge, l2_err = _docker_bridge_for_network("ghost_l2_net")
    l3_bridge, l3_err = _docker_bridge_for_network("ghost_l3_net")
    uplink = _default_uplink_iface()

    errors = [e for e in [l1_err, l2_err, l3_err] if e]
    if not uplink:
        errors.append("uplink_iface_not_detected")

    if errors:
        payload = {"ok": False, "id": ts, "errors": errors}
        write_json(plan_dir / "nft-remediation.json", payload)
        return payload

    ruleset = _render_nft_rules(l1_bridge or "", l2_bridge or "", l3_bridge or "", uplink or "")
    rules_file = plan_dir / "nftables-remediation.conf"
    rules_file.write_text(ruleset + "\n", encoding="utf-8")

    apply_cmds = [
        "sudo nft list ruleset > /tmp/ghostnetsync-ruleset-pre-remediation.nft",
        f"sudo nft -f {rules_file}",
    ]
    rollback_cmds = [
        "sudo nft -f /tmp/ghostnetsync-ruleset-pre-remediation.nft",
    ]

    executed: list[dict[str, Any]] = []
    if apply:
        for command in apply_cmds:
            out = run_command(["bash", "-lc", command], timeout=10)
            executed.append({"cmd": command, **out})
            if not out.get("ok"):
                break

    md = [
        f"# NFT Remediation Plan {ts}",
        "",
        "## Scope",
        f"- l1 bridge: `{l1_bridge}`",
        f"- l2 bridge: `{l2_bridge}`",
        f"- l3 bridge: `{l3_bridge}`",
        f"- uplink iface: `{uplink}`",
        "",
        "## Apply Commands",
    ]
    for c in apply_cmds:
        md.append(f"- `{c}`")
    md += ["", "## Rollback Commands"]
    for c in rollback_cmds:
        md.append(f"- `{c}`")
    write_md(plan_dir / "nft-remediation.md", "\n".join(md) + "\n")

    payload = {
        "ok": True,
        "id": ts,
        "path": str(plan_dir),
        "dry_run": not apply,
        "bridges": {"l1": l1_bridge, "l2": l2_bridge, "l3": l3_bridge, "uplink": uplink},
        "apply_commands": apply_cmds,
        "rollback_commands": rollback_cmds,
        "rules_file": str(rules_file),
        "executed": executed,
    }
    write_json(plan_dir / "nft-remediation.json", payload)
    return payload
