# Host↔VM AI Message Contracts

Date: 2026-02-24
Companion docs:
- `docs/ai-core/host-vm-ai-orchestration-blueprint.md`
- `docs/ai-core/host-vm-ai-implementation-checklist.md`

## 1) Envelope (Required for All Mutating Calls)

```json
{
  "request_id": "req-01J...",
  "timestamp": "2026-02-24T16:30:00.000Z",
  "ttl_ms": 15000,
  "nonce": "7f9b1e7d-8f1c-4af4-8f9b-d57f8a5d1c09",
  "sender": {
    "id": "host-orchestrator",
    "role": "host_infra_ai",
    "layer_scope": "L0"
  },
  "policy": {
    "policy_version": "v1",
    "policy_checkpoint_hash": "0x...",
    "manual_only": false,
    "emergency_lock": false
  },
  "payload": {},
  "signature": {
    "alg": "Ed25519",
    "kid": "host-orchestrator-2026-02",
    "value": "base64-signature"
  }
}
```

Validation rules:
- `timestamp + ttl_ms` must be fresh.
- `nonce` must be unseen in replay window.
- `sender.role` must authorize requested action.
- `policy_checkpoint_hash` required when action is governance-bound.
- `signature` must verify against sender identity.

## 2) Host -> VM Contracts

### `POST /v1/vm/actions/evaluate`

Purpose: ask VM AI if a proposed action is policy-safe.

`payload`:

```json
{
  "target_layer": "L2",
  "action_type": "fee_tune",
  "action_params": {
    "delta_bps": 25,
    "cooldown_seconds": 60
  },
  "reason": "host_congestion_forecast",
  "evidence_ref": "sha256:..."
}
```

Response:

```json
{
  "ok": true,
  "decision": {
    "allow": true,
    "reason": "within_policy_bounds",
    "risk_score": 0.31,
    "required_approvals": 0,
    "requires_governance": false
  }
}
```

### `POST /v1/vm/actions/apply`

Purpose: execute only actions previously evaluated as allowed.

`payload`:

```json
{
  "target_layer": "L2",
  "action_id": "act-01J...",
  "action_type": "fee_tune",
  "approved_by": ["host-orchestrator"],
  "action_params": {
    "delta_bps": 25,
    "cooldown_seconds": 60
  },
  "policy_checkpoint_hash": "0x..."
}
```

Response:

```json
{
  "ok": true,
  "status": "applied",
  "applied_at": "2026-02-24T16:30:03.000Z",
  "evidence_id": "ev-01J..."
}
```

## 3) VM -> Host Contracts

### `POST /v1/host/telemetry/report`

Purpose: periodic health/efficiency report from VM AI.

`payload`:

```json
{
  "layer": "L3",
  "health": {
    "rpc_latency_ms_p95": 184,
    "queue_depth": 212,
    "error_rate": 0.003
  },
  "efficiency": {
    "cpu_utilization_pct": 41,
    "energy_mode": "balanced",
    "loop_interval_ms": 5000
  },
  "fees": {
    "base_fee_gwei": 0.0011,
    "variance_5m": 0.07
  }
}
```

### `POST /v1/host/evidence/submit`

Purpose: submit signed evidence envelope for decisions/actions.

`payload`:

```json
{
  "evidence_id": "ev-01J...",
  "layer": "L2",
  "action_id": "act-01J...",
  "decision_hash": "0x...",
  "artifact_uri": "vault://ghost/evidence/ev-01J...",
  "signature": {
    "alg": "Ed25519",
    "kid": "vm-ai-l2-2026-02",
    "value": "base64-signature"
  }
}
```

## 4) Hard Governance Rules in Contract Layer

Rules to enforce in both host and VM handlers:
- Reject any payload implying direct `L3 -> L1` transition.
- Reject any external egress action where `target_layer != L1`.
- Reject mutate/execute actions if `manual_only=true` or `emergency_lock=true`.
- Reject governance-bound actions without valid `policy_checkpoint_hash`.

## 5) Route-Law Guard Snippet (Pseudo-code)

```ts
function assertLayerLaw(source: 'L1'|'L2'|'L3', target: 'L1'|'L2'|'L3', external = false) {
  if (external && source !== 'L1') throw new Error('external_egress_blocked');
  if (source === 'L3' && target === 'L1') throw new Error('l3_l1_bypass_blocked');
  if (source === target) throw new Error('same_layer_transition_blocked');
}
```

## 6) Error Model (Deterministic)

Standard error envelope:

```json
{
  "ok": false,
  "error": {
    "code": "POLICY_DENIED",
    "message": "manual_only_enabled",
    "request_id": "req-01J...",
    "retryable": false
  }
}
```

Reserved error codes:
- `AUTH_INVALID_SIGNATURE`
- `AUTH_REPLAY_NONCE`
- `AUTH_EXPIRED_REQUEST`
- `POLICY_DENIED`
- `POLICY_CHECKPOINT_MISSING`
- `ROUTE_LAW_VIOLATION`
- `EMERGENCY_LOCK_ACTIVE`
- `MANUAL_ONLY_ACTIVE`

## 7) Minimal OpenAPI Surface (Suggested)

- Host agent
  - `GET /v1/host/health`
  - `GET /v1/host/metrics`
  - `POST /v1/host/telemetry/report`
  - `POST /v1/host/evidence/submit`
- VM agent
  - `GET /v1/vm/health`
  - `GET /v1/vm/metrics`
  - `POST /v1/vm/actions/evaluate`
  - `POST /v1/vm/actions/apply`

## 8) Compatibility Notes

- Message layer is transport-agnostic (HTTPS/mTLS now, gRPC optional later).
- Host adapter can target Docker today and libvirt later without changing payload contracts.
- Governance fields map to existing GhostStack policy checkpoint and evidence flows.
