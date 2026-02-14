#!/usr/bin/env python3
"""
Minimal hashing utilities for GhostStack release sealing.

Goals:
- No external Python deps.
- Provide Keccak-256 and SHA-256 for files/strings.
"""

from __future__ import annotations

import argparse
import hashlib
import sys
from pathlib import Path


MASK64 = (1 << 64) - 1

# Rotation offsets (Rho step), indexed by x,y.
ROT = [
    [0, 36, 3, 41, 18],
    [1, 44, 10, 45, 2],
    [62, 6, 43, 15, 61],
    [28, 55, 25, 21, 56],
    [27, 20, 39, 8, 14],
]

# Round constants (Iota step).
RC = [
    0x0000000000000001,
    0x0000000000008082,
    0x800000000000808A,
    0x8000000080008000,
    0x000000000000808B,
    0x0000000080000001,
    0x8000000080008081,
    0x8000000000008009,
    0x000000000000008A,
    0x0000000000000088,
    0x0000000080008009,
    0x000000008000000A,
    0x000000008000808B,
    0x800000000000008B,
    0x8000000000008089,
    0x8000000000008003,
    0x8000000000008002,
    0x8000000000000080,
    0x000000000000800A,
    0x800000008000000A,
    0x8000000080008081,
    0x8000000000008080,
    0x0000000080000001,
    0x8000000080008008,
]


def _rol(value: int, shift: int) -> int:
    shift %= 64
    return ((value << shift) | (value >> (64 - shift))) & MASK64


def _keccak_f1600(state: list[int]) -> None:
    assert len(state) == 25
    for rc in RC:
        # Theta
        c = [state[x] ^ state[x + 5] ^ state[x + 10] ^ state[x + 15] ^ state[x + 20] for x in range(5)]
        d = [c[(x - 1) % 5] ^ _rol(c[(x + 1) % 5], 1) for x in range(5)]
        for x in range(5):
            for y in range(5):
                state[x + 5 * y] ^= d[x]

        # Rho + Pi
        b = [0] * 25
        for x in range(5):
            for y in range(5):
                b[y + 5 * ((2 * x + 3 * y) % 5)] = _rol(state[x + 5 * y], ROT[x][y])

        # Chi
        for x in range(5):
            for y in range(5):
                state[x + 5 * y] = b[x + 5 * y] ^ ((~b[((x + 1) % 5) + 5 * y]) & b[((x + 2) % 5) + 5 * y])
                state[x + 5 * y] &= MASK64

        # Iota
        state[0] ^= rc


def keccak256(data: bytes) -> bytes:
    # Keccak-256: rate=1088 bits (136 bytes), capacity=512 bits.
    rate = 136
    state = [0] * 25

    padded = bytearray(data)
    padded.append(0x01)
    while (len(padded) % rate) != (rate - 1):
        padded.append(0x00)
    padded.append(0x80)

    for offset in range(0, len(padded), rate):
        block = padded[offset : offset + rate]
        for i in range(rate // 8):
            word = int.from_bytes(block[i * 8 : (i + 1) * 8], "little")
            state[i] ^= word
        _keccak_f1600(state)

    out = bytearray()
    while len(out) < 32:
        for i in range(rate // 8):
            out.extend(state[i].to_bytes(8, "little"))
        if len(out) >= 32:
            break
        _keccak_f1600(state)

    return bytes(out[:32])


def sha256(data: bytes) -> bytes:
    return hashlib.sha256(data).digest()


def _read_file(path: Path) -> bytes:
    return path.read_bytes()


def _hex(b: bytes, prefix_0x: bool) -> str:
    h = b.hex()
    return f"0x{h}" if prefix_0x else h


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="cmd", required=True)

    file_sha = sub.add_parser("sha256-file")
    file_sha.add_argument("path")
    file_sha.add_argument("--0x", dest="prefix_0x", action="store_true")

    file_k = sub.add_parser("keccak256-file")
    file_k.add_argument("path")
    file_k.add_argument("--0x", dest="prefix_0x", action="store_true")

    str_k = sub.add_parser("keccak256-str")
    str_k.add_argument("text")
    str_k.add_argument("--0x", dest="prefix_0x", action="store_true")

    args = parser.parse_args(argv)

    if args.cmd == "sha256-file":
        digest = sha256(_read_file(Path(args.path)))
        sys.stdout.write(_hex(digest, args.prefix_0x) + "\n")
        return 0

    if args.cmd == "keccak256-file":
        digest = keccak256(_read_file(Path(args.path)))
        sys.stdout.write(_hex(digest, args.prefix_0x) + "\n")
        return 0

    if args.cmd == "keccak256-str":
        digest = keccak256(args.text.encode("utf-8"))
        sys.stdout.write(_hex(digest, args.prefix_0x) + "\n")
        return 0

    raise RuntimeError(f"unhandled_cmd:{args.cmd}")


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
