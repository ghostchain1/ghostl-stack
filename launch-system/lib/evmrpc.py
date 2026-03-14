#!/usr/bin/env python3
"""
Tiny JSON-RPC helper for EVM-compatible chains.

No external deps.

Supports:
- eth_call
- MainnetLaunchGate.isLaunchAuthorized(bytes32,bytes32) view(bool)
- ReleaseGate.isMainnetLaunchAllowed() view(bool)
"""

from __future__ import annotations

import argparse
import json
import sys
import urllib.error
import urllib.request
from dataclasses import dataclass
from pathlib import Path


LIB_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(LIB_DIR))

from hashutil import keccak256  # noqa: E402


def _hex0x(b: bytes) -> str:
    return "0x" + b.hex()


def _strip_0x(value: str) -> str:
    return value[2:] if value.startswith("0x") else value


def _parse_hex_bytes(value: str) -> bytes:
    raw = _strip_0x(value)
    if len(raw) % 2 != 0:
        raw = "0" + raw
    return bytes.fromhex(raw)


def _bytes32(value: str) -> bytes:
    raw = _parse_hex_bytes(value)
    if len(raw) != 32:
        raise ValueError(f"expected_bytes32_got_{len(raw)}")
    return raw


def _abi_encode_bytes32(value: bytes) -> bytes:
    if len(value) != 32:
        raise ValueError("bytes32_length")
    return value


def _abi_encode_bool_from_32bytes(word: bytes) -> bool:
    if len(word) != 32:
        raise ValueError("word_length")
    return int.from_bytes(word, "big") != 0


def _selector(signature: str) -> bytes:
    return keccak256(signature.encode("utf-8"))[:4]


@dataclass(frozen=True)
class RpcConfig:
    url: str
    timeout_sec: float = 8.0


def rpc_call(cfg: RpcConfig, method: str, params: list[object]) -> object:
    payload = {"jsonrpc": "2.0", "id": 1, "method": method, "params": params}
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(cfg.url, data=data, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=cfg.timeout_sec) as resp:
            body = resp.read().decode("utf-8", "ignore")
    except urllib.error.HTTPError as exc:
        raise RuntimeError(f"http_error:{exc.code}:{exc.read().decode('utf-8','ignore')}")
    except Exception as exc:
        raise RuntimeError(f"rpc_error:{exc!r}")

    parsed = json.loads(body)
    if "error" in parsed:
        raise RuntimeError(f"rpc_error:{parsed['error']}")
    return parsed.get("result")


def eth_call(cfg: RpcConfig, to_addr: str, data_hex: str, block: str = "latest") -> str:
    if not to_addr.startswith("0x") or len(to_addr) != 42:
        raise ValueError("to_addr_must_be_0x20bytes")
    if not data_hex.startswith("0x"):
        raise ValueError("data_must_be_0x")
    result = rpc_call(cfg, "eth_call", [{"to": to_addr, "data": data_hex}, block])
    if not isinstance(result, str) or not result.startswith("0x"):
        raise RuntimeError("unexpected_rpc_call_result")
    return result


def is_launch_authorized(cfg: RpcConfig, gate_addr: str, release_id: bytes, manifest_hash: bytes) -> bool:
    sel = _selector("isLaunchAuthorized(bytes32,bytes32)")
    data = sel + _abi_encode_bytes32(release_id) + _abi_encode_bytes32(manifest_hash)
    out_hex = eth_call(cfg, gate_addr, _hex0x(data))
    out = _parse_hex_bytes(out_hex)
    if len(out) < 32:
        out = out.rjust(32, b"\x00")
    return _abi_encode_bool_from_32bytes(out[:32])


def is_mainnet_launch_allowed(cfg: RpcConfig, release_gate_addr: str) -> bool:
    sel = _selector("isMainnetLaunchAllowed()")
    out_hex = eth_call(cfg, release_gate_addr, _hex0x(sel))
    out = _parse_hex_bytes(out_hex)
    if len(out) < 32:
        out = out.rjust(32, b"\x00")
    return _abi_encode_bool_from_32bytes(out[:32])


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="cmd", required=True)

    call = sub.add_parser("eth-call")
    call.add_argument("--rpc", required=True)
    call.add_argument("--to", required=True)
    call.add_argument("--data", required=True)
    call.add_argument("--block", default="latest")

    auth = sub.add_parser("is-launch-authorized")
    auth.add_argument("--rpc", required=True)
    auth.add_argument("--gate", required=True)
    auth.add_argument("--release-id-bytes32", required=True)
    auth.add_argument("--manifest-hash-bytes32", required=True)

    release_gate = sub.add_parser("is-mainnet-launch-allowed")
    release_gate.add_argument("--rpc", required=True)
    release_gate.add_argument("--release-gate", required=True)

    args = parser.parse_args(argv)
    if args.cmd == "eth-call":
        cfg = RpcConfig(url=args.rpc)
        sys.stdout.write(eth_call(cfg, args.to, args.data, block=args.block) + "\n")
        return 0

    if args.cmd == "is-launch-authorized":
        cfg = RpcConfig(url=args.rpc)
        ok = is_launch_authorized(
            cfg,
            args.gate,
            _bytes32(args.release_id_bytes32),
            _bytes32(args.manifest_hash_bytes32),
        )
        sys.stdout.write(("true" if ok else "false") + "\n")
        return 0

    if args.cmd == "is-mainnet-launch-allowed":
        cfg = RpcConfig(url=args.rpc)
        ok = is_mainnet_launch_allowed(cfg, args.release_gate)
        sys.stdout.write(("true" if ok else "false") + "\n")
        return 0

    raise RuntimeError(f"unhandled_cmd:{args.cmd}")


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
