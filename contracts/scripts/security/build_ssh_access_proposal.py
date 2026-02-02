#!/usr/bin/env python3
import json
import os
import time

SERVER_ID_PATH = os.environ.get("GHOST_SSH_SERVER_ID", "/etc/ghost/ssh/server_id")
KEYMAP_PATH = os.environ.get("GHOST_SSH_KEYMAP", "/etc/ghost/ssh/keymap.json")
OUTPUT_PATH = os.environ.get("SSH_PROPOSAL_OUTPUT", "/home/ghost/ghostl-stack/contracts/scripts/security/ssh_access_proposal.json")

REGISTRY_ADDRESS = os.environ.get("SSH_REGISTRY_ADDRESS", "")
ATTESTOR_ADDRESS = os.environ.get("SSH_ATTESTOR_ADDRESS", "")
PRINCIPAL = os.environ.get("SSH_PRINCIPAL", "ghost")
PUBKEY = os.environ.get("SSH_PUBKEY", "")
PUBKEY_HASH = os.environ.get("SSH_PUBKEY_HASH", "")
ROLE = os.environ.get("SSH_ROLE", "ssh-operator")
POLICY_HASH = os.environ.get("SSH_POLICY_HASH", "")
EXPIRES_AT = int(os.environ.get("SSH_EXPIRES_AT", "0"))
SET_POLICY = os.environ.get("SSH_SET_POLICY", "true").lower() in ("1", "true", "yes")

# Keccak-256 (same implementation as in ghost-authorized-keys-enforce)
_RC = [
    0x0000000000000001, 0x0000000000008082,
    0x800000000000808A, 0x8000000080008000,
    0x000000000000808B, 0x0000000080000001,
    0x8000000080008081, 0x8000000000008009,
    0x000000000000008A, 0x0000000000000088,
    0x0000000080008009, 0x000000008000000A,
    0x000000008000808B, 0x800000000000008B,
    0x8000000000008089, 0x8000000000008003,
    0x8000000000008002, 0x8000000000000080,
    0x000000000000800A, 0x800000008000000A,
    0x8000000080008081, 0x8000000000008080,
    0x0000000080000001, 0x8000000080008008,
]
_R = [
    [0, 36, 3, 41, 18],
    [1, 44, 10, 45, 2],
    [62, 6, 43, 15, 61],
    [28, 55, 25, 21, 56],
    [27, 20, 39, 8, 14],
]

def _rol(value, offset):
    offset %= 64
    return ((value << offset) & 0xFFFFFFFFFFFFFFFF) | (value >> (64 - offset))


def _keccak_f(state):
    for rnd in range(24):
        c = [state[x] ^ state[x + 5] ^ state[x + 10] ^ state[x + 15] ^ state[x + 20] for x in range(5)]
        d = [c[(x - 1) % 5] ^ _rol(c[(x + 1) % 5], 1) for x in range(5)]
        for x in range(5):
            for y in range(5):
                state[x + 5 * y] ^= d[x]
        b = [0] * 25
        for x in range(5):
            for y in range(5):
                b[y + 5 * ((2 * x + 3 * y) % 5)] = _rol(state[x + 5 * y], _R[x][y])
        for x in range(5):
            for y in range(5):
                state[x + 5 * y] = b[x + 5 * y] ^ ((~b[(x + 1) % 5 + 5 * y]) & b[(x + 2) % 5 + 5 * y])
        state[0] ^= _RC[rnd]


def keccak256(data: bytes) -> bytes:
    rate = 136
    state = [0] * 25
    padded = bytearray(data)
    padded.append(0x01)
    while (len(padded) % rate) != rate - 1:
        padded.append(0x00)
    padded.append(0x80)
    for offset in range(0, len(padded), rate):
        block = padded[offset:offset + rate]
        for i in range(rate // 8):
            chunk = block[i * 8:(i + 1) * 8]
            state[i] ^= int.from_bytes(chunk, "little")
        _keccak_f(state)
    out = bytearray()
    while len(out) < 32:
        for i in range(rate // 8):
            out.extend(state[i].to_bytes(8, "little"))
        if len(out) >= 32:
            break
        _keccak_f(state)
    return bytes(out[:32])


def hex32(data: bytes) -> str:
    return "0x" + data.hex()


def to_bytes32(value: str) -> str:
    if value.startswith("0x") and len(value) == 66:
        return value
    return hex32(keccak256(value.encode("utf-8")))


def encode_bytes32(value: str) -> str:
    clean = value[2:] if value.startswith("0x") else value
    return clean.rjust(64, "0")


def encode_address(value: str) -> str:
    clean = value[2:] if value.startswith("0x") else value
    return clean.rjust(64, "0")


def encode_uint64(value: int) -> str:
    return hex(value)[2:].rjust(64, "0")


def encode_bool(value: bool) -> str:
    return ("1" if value else "0").rjust(64, "0")


def selector(signature: str) -> str:
    return keccak256(signature.encode("utf-8"))[:4].hex()


def build_calldata(sig: str, args: list[str]) -> str:
    return "0x" + selector(sig) + "".join(args)


def load_server_id_hash() -> str:
    raw = open(SERVER_ID_PATH, "r", encoding="utf-8").read().strip()
    return hex32(keccak256(raw.encode("utf-8")))


def resolve_pubkey_hash() -> str:
    if PUBKEY_HASH:
        return PUBKEY_HASH
    if PUBKEY:
        return hex32(keccak256(PUBKEY.encode("utf-8")))
    if os.path.exists(KEYMAP_PATH):
        data = json.load(open(KEYMAP_PATH, "r", encoding="utf-8"))
        entries = data.get(PRINCIPAL, [])
        if entries:
            return entries[0].get("pubkeyHash")
    raise SystemExit("pubkey hash missing")


def main():
    if not REGISTRY_ADDRESS:
        raise SystemExit("SSH_REGISTRY_ADDRESS required")
    if not ATTESTOR_ADDRESS:
        raise SystemExit("SSH_ATTESTOR_ADDRESS required")

    server_id = load_server_id_hash()
    principal_hash = to_bytes32(PRINCIPAL)
    pubkey_hash = resolve_pubkey_hash()
    role_hash = to_bytes32(ROLE)
    policy_hash = to_bytes32(POLICY_HASH if POLICY_HASH else "ssh-policy")

    calls = []

    if SET_POLICY:
        calls.append({
            "function": "setPolicyHash(bytes32,bytes32)",
            "calldata": build_calldata("setPolicyHash(bytes32,bytes32)", [
                encode_bytes32(server_id),
                encode_bytes32(policy_hash)
            ])
        })

    calls.append({
        "function": "setAttestor(bytes32,address,bool)",
        "calldata": build_calldata("setAttestor(bytes32,address,bool)", [
            encode_bytes32(server_id),
            encode_address(ATTESTOR_ADDRESS),
            encode_bool(True)
        ])
    })

    calls.append({
        "function": "grantAccess(bytes32,bytes32,bytes32,uint64,bytes32,bytes32)",
        "calldata": build_calldata("grantAccess(bytes32,bytes32,bytes32,uint64,bytes32,bytes32)", [
            encode_bytes32(server_id),
            encode_bytes32(principal_hash),
            encode_bytes32(pubkey_hash),
            encode_uint64(EXPIRES_AT),
            encode_bytes32(role_hash),
            encode_bytes32(policy_hash)
        ])
    })

    output = {
        "registry": REGISTRY_ADDRESS,
        "serverId": server_id,
        "principalHash": principal_hash,
        "pubkeyHash": pubkey_hash,
        "roleHash": role_hash,
        "policyHash": policy_hash,
        "expiresAt": EXPIRES_AT,
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "calls": calls
    }

    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2)

    print(OUTPUT_PATH)


if __name__ == "__main__":
    main()
