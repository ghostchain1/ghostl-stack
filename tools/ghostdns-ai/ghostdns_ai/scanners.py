from __future__ import annotations

import json
import re
import shlex
import subprocess
from typing import Dict


def _run(command: str) -> str:
    result = subprocess.run(shlex.split(command), check=False, capture_output=True, text=True)
    if result.returncode != 0:
        return ""
    return result.stdout.strip()


def _sanitize(label: str) -> str:
    return re.sub(r"[^a-z0-9-]", "-", label.lower()).strip("-") or "service"


def scan_docker_records(domain_suffix: str) -> Dict[str, str]:
    records: Dict[str, str] = {}
    names = _run("docker ps --format {{.Names}}")
    if not names:
        return records

    for container_name in names.splitlines():
        inspect = _run(f"docker inspect {container_name}")
        if not inspect:
            continue
        payload = json.loads(inspect)
        networks = payload[0].get("NetworkSettings", {}).get("Networks", {})
        for network_info in networks.values():
            ip = str(network_info.get("IPAddress") or "").strip()
            if not ip:
                continue
            fqdn = f"{_sanitize(container_name)}.{domain_suffix}"
            records[fqdn] = ip
            break
    return records


def scan_vm_records(domain_suffix: str) -> Dict[str, str]:
    records: Dict[str, str] = {}
    vms = _run("virsh list --name")
    if not vms:
        return records

    for vm_name in [line.strip() for line in vms.splitlines() if line.strip()]:
        output = _run(f"virsh domifaddr {vm_name} --source lease")
        if not output:
            continue
        for line in output.splitlines():
            if "ipv4" not in line:
                continue
            tokens = [part for part in line.split(" ") if part]
            cidr = tokens[-1]
            ip = cidr.split("/")[0]
            fqdn = f"{_sanitize(vm_name)}.{domain_suffix}"
            records[fqdn] = ip
            break
    return records
