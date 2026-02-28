# Hyper Ghost Governor Threat Model

## Scope

Service: `services/hyper-ghost-governor`  
Purpose: deterministic proposal drafting and ranking for treasury allocations.  
Out of scope: direct fund execution (explicitly disallowed).

## Security Objectives

1. AI governor cannot execute capital movement.
2. Proposal generation is deterministic for identical input.
3. Evidence bundles are auditable and immutable once exported.
4. Secrets are never persisted in governor SQLite state.

## Trust Boundaries

- Inputs:
  - Treasury status endpoint (`/v1/treasury/status`)
  - Operator proposal request payloads
- Outputs:
  - Drafted strategy rankings
  - Evidence packs in `artifacts/governor/<proposal_id>/`

## Key Threats

1. Unauthorized proposal drafting  
   Mitigation: optional `x-admin-token` gate (`GOVERNOR_ADMIN_TOKEN`).

2. Policy bypass in ranking logic  
   Mitigation: deterministic risk + concentration checks with explicit violation codes.

3. Hidden execution path  
   Mitigation: service has no execution endpoint and emits proposal-only execution plans.

4. Evidence tampering  
   Mitigation: proposals and evidence paths recorded in SQLite; artifacts persisted under immutable proposal IDs.

5. Secret leakage via persistence  
   Mitigation: no private key fields in schema; config secrets loaded via env only.

## Residual Risks

- If upstream treasury status feed is compromised, rankings may be skewed.
- If admin token is unset in production, drafting is unauthenticated.
- Artifact integrity is filesystem-dependent unless signed externally.

## Operational Controls

- Enforce non-empty `GOVERNOR_ADMIN_TOKEN` for testnet/mainnet.
- Restrict service network to internal-only.
- Enable Prometheus alerts for:
  - `up{job="hyper-ghost-governor"} == 0`
  - increase in `hg_policy_violation_total`.
