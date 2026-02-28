# Host↔VM AI Orchestration — Implementation Checklist

Date: 2026-02-24
Companion blueprint: `docs/ai-core/host-vm-ai-orchestration-blueprint.md`

## Phase 0 — Foundation and Inventory

### Tasks
- [ ] Confirm host inventory baseline (CPU/memory/network/storage) is captured per environment.
- [ ] Confirm hypervisor adapter choice:
  - Docker adapter (current environment)
  - libvirt/KVM adapter (future)
- [ ] Define canonical control-plane network segment and ACL boundaries.
- [ ] Establish service identity strategy (mTLS cert issuer + role naming).

### Acceptance criteria
- [ ] Host baseline report stored in ops artifacts.
- [ ] Adapter interface documented (`start/stop/restart/status/metrics`).
- [ ] Control network allows only host-agent ↔ vm-agent control endpoints.

## Phase 1 — Host Agent (Infrastructure AI)

### Tasks
- [ ] Implement `host-observer` module:
  - host metrics collection
  - VM/service health probing
- [ ] Implement `host-orchestrator` module:
  - bounded infra actions (`restart`, `scale_down_noncritical`, `throttle`)
- [ ] Implement `host-security-sentinel` module:
  - drift detection (unexpected ports/privilege changes)
  - cert/policy bundle integrity checks
- [ ] Implement `host-policy-enforcer`:
  - verifies route-law constraints in control requests
  - enforces `manual-only` and `emergency-lock`

### Acceptance criteria
- [ ] Host agent emits signed action proposals (not raw execution commands).
- [ ] All mutating actions require successful local policy gate.
- [ ] Policy denial path is auditable and deterministic.

## Phase 2 — VM Agent (Protocol AI)

### Tasks
- [ ] Implement per-layer vm-agent role bindings:
  - `vm-ai-l1`, `vm-ai-l2`, `vm-ai-l3`
- [ ] Implement governance interpreter against L1 policy/checkpoint source.
- [ ] Implement bounded optimization functions:
  - fee tuning within min/max deltas
  - loop interval adaptation for energy efficiency
- [ ] Implement evidence emitter for every accepted/rejected high-impact action.

### Acceptance criteria
- [ ] VM action execution denied when policy checkpoint is missing/stale.
- [ ] VM agent rejects direct or implied `L3 -> L1` control transitions.
- [ ] Evidence envelope generated for each action decision.

## Phase 3 — Secure Communication Plane

### Tasks
- [ ] Implement mTLS for all host↔VM control APIs.
- [ ] Enforce signed message envelope fields:
  - `request_id`, `timestamp`, `ttl_ms`, `nonce`, `policy_checkpoint_hash`, signature
- [ ] Add replay cache/nonce store with bounded TTL.
- [ ] Add RBAC authorization matrix by role and action type.

### Acceptance criteria
- [ ] Unsigned/expired/replayed messages are rejected.
- [ ] Role mismatch attempts are rejected and logged.
- [ ] Audit logs include identity, action, target layer, and policy version.

## Phase 4 — Governance Locks and Fail-safes

### Tasks
- [ ] Integrate kill switch (`global_autonomy_enabled=false`).
- [ ] Integrate manual-only mode (`manual_only=true`).
- [ ] Implement fail-closed behavior for policy unavailability.
- [ ] Implement deterministic rollback flow:
  - `policy -> telemetry -> controllers` restart order

### Acceptance criteria
- [ ] Emergency lock blocks autonomous mutate calls within one control interval.
- [ ] Manual-only preserves recommendations while blocking execution.
- [ ] Rollback restores prior known-good profile hash.

## Phase 5 — Fee Stability and Energy Efficiency

### Tasks
- [ ] Implement bounded fee control loops per layer.
- [ ] Add cooldown windows and max delta guards.
- [ ] Add adaptive sampling intervals based on volatility/load.
- [ ] Add low-demand duty cycling for non-critical analytics workers.

### Acceptance criteria
- [ ] No fee-step exceeds policy delta cap.
- [ ] Energy guardrails reduce non-critical compute during low-load periods.
- [ ] Fee variance and inclusion latency remain within SLO targets.

## Phase 6 — Validation, Chaos, and Readiness

### Tasks
- [ ] Run failure drills:
  - policy registry unavailable
  - host overload
  - VM control endpoint degraded
- [ ] Run route-law chaos matrix with explicit `L3 -> L1` bypass attempts.
- [ ] Validate evidence pipeline completeness and signature verification.
- [ ] Produce go-live packet: architecture, runbook, rollback plan, policy hashes.

### Acceptance criteria
- [ ] Bypass attempts are always denied and logged.
- [ ] System fails closed without unsafe fallback.
- [ ] Readiness packet includes reproducible evidence references.

## Minimum API Surface (Must Exist)

- Host agent:
  - `POST /v1/host/actions/propose`
  - `POST /v1/host/actions/execute`
  - `GET /v1/host/health`
  - `GET /v1/host/metrics`
- VM agent:
  - `POST /v1/vm/actions/evaluate`
  - `POST /v1/vm/actions/apply`
  - `POST /v1/vm/evidence/emit`
  - `GET /v1/vm/health`
  - `GET /v1/vm/metrics`

## Definition of Done

- [ ] Host and VM agents run with authenticated, encrypted, replay-safe communication.
- [ ] Governance constraints are enforced with fail-closed behavior.
- [ ] No direct `L3 -> L1` control or settlement bypass path exists.
- [ ] Energy and fee objectives are controlled by bounded policies with audited evidence.
