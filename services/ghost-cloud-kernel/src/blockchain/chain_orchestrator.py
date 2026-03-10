"""GhostChain L1 / L2 / L3 chain health monitoring.

Uses ghost_ RPC namespace (never eth_).  Checks:
  1. ghost_chainId   — validates chain ID matches canonical value
  2. ghost_blockNumber — reads head block to confirm liveness

Chain IDs
---------
  L1 : 14000101   (GhostChain sovereign)
  L2 : 901        (GhostL2 OP Stack)
  L3 : 903        (GhostL3 OP Stack)

RPC endpoints are configurable via env vars and default to localhost devnet ports.
"""
from __future__ import annotations

import json
import logging
import os
import time
import urllib.error
import urllib.request
from dataclasses import dataclass

logger = logging.getLogger(__name__)

# ── Canonical chain registry ──────────────────────────────────────────────────
@dataclass(frozen=True)
class ChainSpec:
    layer: str
    chain_id: int
    rpc_url: str


CHAINS: dict[str, ChainSpec] = {
    "L1": ChainSpec(
        layer="L1",
        chain_id=14000101,
        rpc_url=os.getenv("GACK_L1_RPC_URL", "http://127.0.0.1:18545"),
    ),
    "L2": ChainSpec(
        layer="L2",
        chain_id=901,
        rpc_url=os.getenv("GACK_L2_RPC_URL", "http://127.0.0.1:29545"),
    ),
    "L3": ChainSpec(
        layer="L3",
        chain_id=903,
        rpc_url=os.getenv("GACK_L3_RPC_URL", "http://127.0.0.1:39545"),
    ),
}

_RPC_TIMEOUT_S: int = min(10, max(1, int(os.getenv("GACK_RPC_TIMEOUT_S", "5"))))


@dataclass
class ChainHealth:
    layer: str
    ok: bool
    chain_id_ok: bool
    block_number: int
    latency_ms: float
    reason: str = ""


def _rpc(url: str, method: str, params: list | None = None) -> object:
    """Execute a ghost_ JSON-RPC call.  Returns the 'result' field or raises."""
    payload = json.dumps({
        "jsonrpc": "2.0",
        "id": 1,
        "method": method,
        "params": params or [],
    }).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=_RPC_TIMEOUT_S) as resp:
        body = json.loads(resp.read())
        if "error" in body:
            raise ValueError(f"RPC error: {body['error']}")
        return body["result"]


def check_chain(spec: ChainSpec) -> ChainHealth:
    """Run ghost_chainId + ghost_blockNumber health checks for one chain."""
    t0 = time.perf_counter()
    try:
        chain_id_hex: str = _rpc(spec.rpc_url, "ghost_chainId")
        reported_chain_id = int(chain_id_hex, 16)
        chain_id_ok = reported_chain_id == spec.chain_id
        if not chain_id_ok:
            logger.error(
                "Chain ID mismatch for %s: expected %d got %d",
                spec.layer, spec.chain_id, reported_chain_id,
            )

        block_hex: str = _rpc(spec.rpc_url, "ghost_blockNumber")
        block_number = int(block_hex, 16)

        latency_ms = (time.perf_counter() - t0) * 1000
        return ChainHealth(
            layer=spec.layer,
            ok=chain_id_ok,
            chain_id_ok=chain_id_ok,
            block_number=block_number,
            latency_ms=round(latency_ms, 2),
            reason="" if chain_id_ok else f"chain ID mismatch: expected {spec.chain_id} got {reported_chain_id}",
        )

    except Exception as exc:
        latency_ms = (time.perf_counter() - t0) * 1000
        logger.warning("Chain health check failed for %s: %s", spec.layer, exc)
        return ChainHealth(
            layer=spec.layer,
            ok=False,
            chain_id_ok=False,
            block_number=0,
            latency_ms=round(latency_ms, 2),
            reason=str(exc),
        )


def check_all_chains() -> list[ChainHealth]:
    """Run health checks for L1, L2, and L3 in order."""
    return [check_chain(spec) for spec in CHAINS.values()]
