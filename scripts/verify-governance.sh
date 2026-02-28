#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

PROPOSAL_ID=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --proposal-id)
      PROPOSAL_ID="${2:-}"
      shift 2
      ;;
    *)
      echo "unknown argument: $1" >&2
      exit 2
      ;;
  esac
done

[[ -n "$PROPOSAL_ID" ]] || {
  echo "missing --proposal-id <id>" >&2
  exit 2
}

[[ "$PROPOSAL_ID" =~ ^[A-Za-z0-9._-]+$ ]] || {
  echo "invalid proposal id format" >&2
  exit 1
}

APPROVAL_FILE="$ROOT_DIR/governance/proposals/$PROPOSAL_ID/approval.json"
[[ -f "$APPROVAL_FILE" ]] || {
  echo "governance approval missing: $APPROVAL_FILE" >&2
  exit 1
}

mkdir -p "$ROOT_DIR/artifacts"

python3 - "$PROPOSAL_ID" "$APPROVAL_FILE" "$ROOT_DIR/artifacts/governance_verification.json" <<'PY'
import datetime as dt
import json
import re
import sys
import os

proposal_id = sys.argv[1]
approval_file = sys.argv[2]
artifact_file = sys.argv[3]

with open(approval_file, "r", encoding="utf-8") as f:
    data = json.load(f)

required = [
    "proposalId",
    "network",
    "approvedBy",
    "approvalSignature",
    "approvedAt",
    "allowDeploy",
    "quorumReached",
    "timelockExpiresAt",
]
missing = [k for k in required if k not in data]
if missing:
    raise SystemExit(f"missing required fields: {','.join(missing)}")

if data["proposalId"] != proposal_id:
    raise SystemExit("proposalId mismatch")

if data["network"] != "mainnet":
    raise SystemExit("approval network must be mainnet")

if data["allowDeploy"] is not True:
    raise SystemExit("allowDeploy must be true")

if data["quorumReached"] is not True:
    raise SystemExit("quorumReached must be true")

if not isinstance(data["approvedBy"], str) or len(data["approvedBy"].strip()) < 3:
    raise SystemExit("approvedBy invalid")

sig = str(data["approvalSignature"])
if not re.fullmatch(r"0x[0-9a-fA-F]{130}|[A-Za-z0-9+/=._-]{32,}", sig):
    raise SystemExit("approvalSignature invalid format")

approved_at_raw = str(data["approvedAt"])
try:
    approved_at = dt.datetime.fromisoformat(approved_at_raw.replace("Z", "+00:00"))
except Exception as exc:
    raise SystemExit(f"approvedAt invalid: {exc}")

now = dt.datetime.now(dt.timezone.utc)
if approved_at > now + dt.timedelta(minutes=10):
    raise SystemExit("approvedAt is too far in future")
if approved_at < now - dt.timedelta(days=365):
    raise SystemExit("approvedAt too old")

timelock_raw = str(data["timelockExpiresAt"])
try:
    timelock_expires_at = dt.datetime.fromisoformat(timelock_raw.replace("Z", "+00:00"))
except Exception as exc:
    raise SystemExit(f"timelockExpiresAt invalid: {exc}")

if timelock_expires_at > now:
    raise SystemExit("timelockExpiresAt must be in the past for execution")
if timelock_expires_at < now - dt.timedelta(days=365):
    raise SystemExit("timelockExpiresAt too old")

approvers = data.get("approvers")
if approvers is not None:
    if not isinstance(approvers, list) or len(approvers) == 0:
        raise SystemExit("approvers must be a non-empty array when provided")
    for idx, approver in enumerate(approvers):
        if not isinstance(approver, dict):
            raise SystemExit(f"approvers[{idx}] must be an object")
        signer = str(approver.get("signer", "")).strip()
        signature = str(approver.get("signature", "")).strip()
        if len(signer) < 3:
            raise SystemExit(f"approvers[{idx}].signer invalid")
        if not re.fullmatch(r"0x[0-9a-fA-F]{130}|[A-Za-z0-9+/=._-]{32,}", signature):
            raise SystemExit(f"approvers[{idx}].signature invalid format")

if "approvalDigest" in data:
    digest = str(data["approvalDigest"])
    if not re.fullmatch(r"0x[0-9a-fA-F]{64}", digest):
        raise SystemExit("approvalDigest invalid format")

def _is_hash(value: str) -> bool:
    return bool(re.fullmatch(r"0x[0-9a-fA-F]{64}|sha256:[0-9a-fA-F]{64}", value))

optional_constitutional_fields = ["constitutionHash", "releaseManifestHash", "releaseAttestationHash"]
require_constitutional_fields = os.environ.get("REQUIRE_CONSTITUTIONAL_FIELDS", "0") == "1"

if require_constitutional_fields:
    missing_constitutional = [k for k in optional_constitutional_fields if k not in data]
    if missing_constitutional:
        raise SystemExit(f"missing constitutional fields: {','.join(missing_constitutional)}")

for field_name in optional_constitutional_fields:
    if field_name in data:
        field_value = str(data[field_name])
        if not _is_hash(field_value):
            raise SystemExit(f"{field_name} invalid format")

artifact = {
    "ok": True,
    "proposalId": proposal_id,
    "network": data["network"],
    "approvedBy": data["approvedBy"],
    "approvedAt": approved_at_raw,
    "quorumReached": data["quorumReached"],
    "timelockExpiresAt": timelock_raw,
    "approvalFile": approval_file,
    "validatedAt": now.isoformat().replace("+00:00", "Z"),
}
for field_name in optional_constitutional_fields:
    if field_name in data:
        artifact[field_name] = data[field_name]
with open(artifact_file, "w", encoding="utf-8") as f:
    json.dump(artifact, f, indent=2)
    f.write("\n")

print("governance_verify:PASS")
PY
