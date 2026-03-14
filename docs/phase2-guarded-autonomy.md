# Phase 2 Guarded Autonomy (Safe Actuation)

This phase extends the existing **network-manager-service** to support guarded, governance-anchored remediation actions. The service remains **read-only by default** and only executes actions when all safety gates are satisfied.

## Safety gates (all required)
1. **Runtime kill switch**: `AUTONOMY_KILL_SWITCH=true` blocks all actions.
2. **On-chain kill switch**: `PAUSE_GUARDIAN_ADDRESS` must be configured and its `paused()` flag must be `false`.
3. **Governance anchor**: The action plan hash must be anchored in `EvidenceAnchor` by the timelock executor.
4. **Timelock delay**: The executor delay is enforced against the plan creation time.
5. **Multisig approvals**: Minimum N valid signatures over the plan hash.
6. **Dry-run freshness**: Execute only if the plan’s dry-run is recent.

## Service endpoints
- `POST /remediate/dry-run` → builds a plan and checks telemetry (no mutations)
- `POST /remediate/execute` → executes only when all gates pass
- `GET /policy` / `POST /policy` → view/update the action policy DSL

## Action Policy DSL (JSON)
Stored at `ACTION_POLICY_PATH` (default `/data/action-policy.json`).

Example:
```json
{
  "version": 1,
  "approvals": {
    "threshold": 2,
    "signers": ["0xabc...", "0xdef..."]
  },
  "preconditions": {
    "requireTelemetry": true,
    "denyIncidents": ["reorg_risk", "rpc_error", "portal_lag", "finalized_lag"],
    "requireNoSyncing": true
  },
  "postconditions": {
    "requireTelemetryAfter": true
  },
  "rollback": {
    "enabled": false,
    "steps": []
  },
  "actions": {
    "op_gate_mode": {
      "enabled": true,
      "allowedModes": ["allow", "pause", "delay", "block"],
      "maxDelaySeconds": 120,
      "targets": ["l2", "l3"]
    },
    "restart_service": {
      "enabled": false,
      "allowedContainers": ["ghost-relayer", "ghostscout-l2"],
      "cooldownSeconds": 300
    }
  }
}
```

## Governance anchoring (required)
- The plan hash must be anchored in `EvidenceAnchor`.
- The `anchoredBy` address must match the Governor’s timelock executor.
- This gives the on-chain governance authorization + timelock guarantee.

## Multisig approval flow
1. Call `POST /remediate/dry-run` to get a plan.
2. Sign `plan.signatureMessage` with all required signers.
3. Set `plan.approvals = [{ signer, signature }, ...]`.
4. Include `plan.governance.anchorIndex` (the EvidenceAnchor index of the plan hash). Note: the anchor index is part of the plan hash, so set it before anchoring/signing.
5. Call `POST /remediate/execute` with `{ plan }`.

## Evidence bundle
Execution evidence is stored under `EVIDENCE_DIR` (default `/data/evidence`).
Each run writes:
- `action-<planHash>-<timestamp>.json`
- `actions.jsonl` (append-only)

If `postconditions.requireTelemetryAfter` is true, `/remediate/execute` returns `ok: false` when post-telemetry checks fail (actions are still recorded in evidence).

## Key environment variables
- `AUTONOMY_EXECUTION_ENABLED` (default false)
- `AUTONOMY_KILL_SWITCH` (default false)
- `PAUSE_GUARDIAN_ADDRESS` (required)
- `EVIDENCE_ANCHOR_ADDRESS` (required)
- `GOVERNANCE_RPC_L1`, `GOVERNOR_ADDRESS_L1`
- `ACTION_APPROVER_ADDRESSES`, `ACTION_APPROVAL_THRESHOLD`
- `OP_GATE_URL`, `OP_GATE_ADMIN_TOKEN`
- `OP_GATE_ADMIN_TOKEN` must match `GATE_ADMIN_TOKEN` used by `infra/opstack/gate`.
- `DOCKER_ACTIONS_ENABLED`, `DOCKER_SOCKET_PATH`

## Supported action types
- `op_gate_mode`: pause/resume/delay OP Stack batch/proposer flow via `op-gate`.
- `restart_service`: optional, requires Docker socket access and allowlist.

## Smoke test (dry-run only)
```bash
curl -s -X POST http://localhost:7766/remediate/dry-run \
  -H 'content-type: application/json' \
  -d '{"actions":[{"type":"op_gate_mode","target":"l2","mode":"pause"}]}'
```

## Docker hosting (local / single box)

This repo includes a convenience compose file that brings up the autonomy control-plane services together:

```bash
docker compose -f docker-compose.autonomy.yml up -d --build
```

Services exposed on the host:
- `ghost-registry`: `http://localhost:18088/health` (registry API: `/v1/endpoints`)
- `network-context-service`: `http://localhost:7633/health` (`/context`)
- `consensus-telemetry-service`: `http://localhost:7635/health` (`/consensus`, `/metrics`)
- `network-manager-service`: `http://localhost:7766/health` (`/status`, `/policy`, `/remediate/*`)

Defaults assume your L1/L2/L3 and `op-gate` are reachable via `host.docker.internal` (override as needed):
- `RPC_L1`, `RPC_L2`, `RPC_L3`
- `OP_NODE_L2_RPC`, `OP_NODE_L3_RPC`
- `OP_GATE_URL`

Execution remains **disabled by default**. To enable actuation, provide (names only):
- `AUTONOMY_EXECUTION_ENABLED=true`, `EXECUTION_APPROVAL_TOKEN`
- `OP_GATE_ADMIN_TOKEN`
- `GOVERNANCE_RPC_L1`, `GOVERNOR_ADDRESS_L1`, `EVIDENCE_ANCHOR_ADDRESS`, `PAUSE_GUARDIAN_ADDRESS`
- `ACTION_APPROVER_ADDRESSES`, `ACTION_APPROVAL_THRESHOLD`

Docker restart actions also require socket access:
- `DOCKER_ACTIONS_ENABLED=true` and `DOCKER_GROUP_ID` matching your host Docker socket group.

## Notes
- Execution is **disabled by default** and fails closed if governance or pause guardian is not configured.
- Docker restart actions are blocked unless explicitly enabled and allowlisted.
