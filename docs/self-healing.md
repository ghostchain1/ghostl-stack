# Hyper Ghost AI Self-Healing Architecture

## Overview

The Hyper Ghost AI supervisor provides **role-based, allowlist-constrained autonomous remediation**
for GhostChain infrastructure. It is designed to be safe-by-default: every action that has
infrastructure side effects requires explicit allowlist authorization.

---

## Role Hierarchy

```
GOVERNOR  (human approval required)
    ↑
AUDITOR   (veto authority over Executor)
    ↑
EXECUTOR  (allowlist-gated side effects)
    ↑
PLANNER   (generates plans, no side effects)
    ↑
DIAGNOSTICIAN (classifies anomalies, no side effects)
    ↑
OBSERVER  (read-only metrics & logs)
```

Each role has **no inherited permissions** from higher-privilege roles — strict separation.

---

## Self-Healing Pipeline

```
1. OBSERVER      → collect metrics from all services
2. DIAGNOSTICIAN → correlate alerts, classify anomaly (LOW/MEDIUM/HIGH)
3. PLANNER       → generate remediation plan (ordered action steps)
4. AUDITOR       → review plan, optionally VETO before execution
5. EXECUTOR      → execute each step (allowlist-gated, rate-limited)
6. AUDITOR       → emit audit record for each executor action
7. GOVERNOR      → escalate to governance if human decision required
```

---

## Allowlist

The file `infra/safeops/allowlist.yml` controls:

| Field | Purpose |
|-------|---------|
| `allowed_actions` | Which `Action` enum values the Executor may dispatch |
| `allowed_services` | Which service names may be targeted by Executor actions |
| `allowed_governors` | Which key IDs may submit Governor-level escalations |
| `pq_signing_keys` | Public key IDs authorized for hybrid PQ governance bundle signing |
| `dtn_bundle_signers` | Key IDs authorized in DTN relay bundles |
| `rate_limits` | Soft limits (documented; enforced in supervisor.js) |
| `emergency_halt` | Global kill switch for all autonomous actions |

**Modifying `allowlist.yml` requires a governance proposal.**  
All PRs touching `infra/safeops/allowlist.yml` are auto-flagged for mandatory security review in CI.

---

## API Reference

### `POST /action`

Dispatch a role-based action.

```json
{
  "role": "EXECUTOR",
  "action": "FLUSH_CACHE",
  "params": { "target": "redis" },
  "requestId": "req-20260101-001"
}
```

Headers:
- `X-Role: EXECUTOR` (can also be in body)
- `X-Governor-Token: <token>` (required for `GOVERNOR` role)

### `POST /veto/:requestId`

Header: `X-Role: AUDITOR`

```json
{ "auditorId": "auditor-1", "reason": "Insufficient evidence for restart" }
```

### `GET /audit?limit=50`

Returns the last N audit records (default 50, max 10000).

### `GET /roles`

Returns the role → allowed actions mapping.

---

## Safety Properties

| Property | Mechanism |
|----------|-----------|
| Role separation | Strict, no inheritance |
| Side-effect gating | Allowlist checked before every Executor/Governor action |
| Service targeting | `allowed_services` list prevents unrestricted targeting |
| Rate limiting | N executor actions per minute (default 10) |
| Veto authority | AUDITOR can cancel any requestId before execution |
| Human override | GOVERNOR actions require `GOVERNOR_APPROVAL_TOKEN` (fail-closed if unset) |
| Audit trail | All side-effect actions produce immutable audit records |
| Emergency stop | `emergency_halt: true` in allowlist.yml suspends all autonomous actions |

---

## Integration with Governance Bundle / DTN

When the GOVERNOR role escalates an issue to governance:

1. `ESCALATE_TO_GOVERNANCE` action fires
2. Supervisor calls `@ghostchain/governance-bundle.createBundle()` with the anomaly evidence
3. Bundle is signed with the governor key from `infra/safeops/allowlist.yml#pq_signing_keys`
4. Bundle is pushed to the DTN relay (`services/dtn-relay`) for distribution
5. Human governance committee retrieves, verifies, and votes on the bundle

---

## Configuration

| Env var | Default | Description |
|---------|---------|-------------|
| `HYPER_GHOST_PORT` | `7741` | HTTP listen port |
| `HYPER_GHOST_BIND` | `127.0.0.1` | Bind address |
| `SAFEOPS_ALLOWLIST_PATH` | `infra/safeops/allowlist.yml` | Allowlist file path |
| `EXECUTOR_RATE_LIMIT` | `10` | Max executor actions per minute |
| `GOVERNOR_APPROVAL_TOKEN` | *(unset)* | Fail-closed; required for Governor actions |

---

## Running

```bash
cd services/hyper-ghost-ai
SAFEOPS_ALLOWLIST_PATH=../../infra/safeops/allowlist.yml node src/index.js
```
