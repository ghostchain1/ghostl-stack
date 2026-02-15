from __future__ import annotations

import json
import shlex
import subprocess
from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class CheckResult:
    ok: bool
    kind: str
    title: str
    summary: str
    subsystem: str
    chain_layer: str
    service: str
    payload: dict[str, Any]


def _run_hg_docker(repo_root: str, args: list[str]) -> subprocess.CompletedProcess[str]:
    # Use the repo's docker wrapper (supports sudo -n docker on hosts where the user
    # is not in the docker group).
    joined = " ".join(shlex.quote(a) for a in args)
    cmd = (
        f"set -euo pipefail; "
        f"source {shlex.quote(repo_root)}/scripts/lib/docker.sh; "
        f"hg_docker_init >/dev/null; "
        f"hg_docker {joined}"
    )
    return subprocess.run(["bash", "-lc", cmd], cwd=repo_root, capture_output=True, text=True)


def check_docker_health(repo_root: str) -> CheckResult:
    # Collect a lightweight health snapshot.
    proc = _run_hg_docker(repo_root, ["ps", "--format", "{{json .}}"])
    if proc.returncode != 0:
        return CheckResult(
            ok=False,
            kind="docker_ps_failed",
            title="Docker daemon not reachable",
            summary=proc.stderr.strip() or "docker ps failed",
            subsystem="runtime",
            chain_layer="",
            service="docker",
            payload={"exitCode": proc.returncode, "stderr": proc.stderr.strip()},
        )

    unhealthy: list[dict[str, str]] = []
    for line in (proc.stdout or "").splitlines():
        try:
            obj = json.loads(line)
        except Exception:
            continue

        name = str(obj.get("Names") or "").strip()
        status = str(obj.get("Status") or "").strip()
        lowered = status.lower()
        if "(unhealthy)" in lowered or lowered.startswith("restarting") or lowered.startswith("exited"):
            unhealthy.append({"name": name, "status": status})

    ok = len(unhealthy) == 0
    return CheckResult(
        ok=ok,
        kind="docker_health",
        title="Docker container health",
        summary="all containers healthy" if ok else f"unhealthy containers: {len(unhealthy)}",
        subsystem="runtime",
        chain_layer="",
        service="docker",
        payload={"unhealthy": unhealthy},
    )


def _jsonrpc(url: str, method: str, params: list[Any] | None = None) -> dict[str, Any]:
    payload = {"jsonrpc": "2.0", "id": 1, "method": method, "params": params or []}
    proc = subprocess.run(
        ["curl", "-fsS", url, "-H", "content-type: application/json", "--data", json.dumps(payload)],
        capture_output=True,
        text=True,
        timeout=5,
    )
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr.strip() or proc.stdout.strip() or "curl failed")
    return json.loads(proc.stdout)


def check_rpc(url: str, *, layer: str, expected_chain_id: int | None = None) -> CheckResult:
    try:
        chain_id_hex = _jsonrpc(url, "eth_chainId").get("result")
        block_hex = _jsonrpc(url, "eth_blockNumber").get("result")
        chain_id = int(chain_id_hex, 16) if isinstance(chain_id_hex, str) else None
        block = int(block_hex, 16) if isinstance(block_hex, str) else None

        ok = chain_id is not None and block is not None
        if expected_chain_id is not None and chain_id != expected_chain_id:
            ok = False

        summary = f"chainId={chain_id} block={block}" if ok else f"unexpected response: chainId={chain_id} block={block}"
        return CheckResult(
            ok=ok,
            kind="rpc_health",
            title=f"{layer} RPC health",
            summary=summary,
            subsystem="rpc",
            chain_layer=layer,
            service="rpc",
            payload={"url": url, "chainId": chain_id, "block": block, "expectedChainId": expected_chain_id},
        )
    except Exception as e:
        return CheckResult(
            ok=False,
            kind="rpc_down",
            title=f"{layer} RPC down",
            summary=str(e),
            subsystem="rpc",
            chain_layer=layer,
            service="rpc",
            payload={"url": url, "error": str(e)},
        )
