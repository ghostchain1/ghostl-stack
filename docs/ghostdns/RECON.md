# GhostDNS Recon Report (Phase 1)

Date: 2026-02-24
Repo: `/home/ghost/ghostl-stack`

## Objective

Establish an implementation-ready baseline for GhostDNS AI inside GhostL-Stack, aligned with existing chain routing law, governance controls, and hardening constraints.

## Current Runtime Topology (Observed)

- Layered chain model is explicit and enforced:
  - L1 (GhostChain) settlement.
  - L2 (OP Stack) anchored to L1.
  - L3 (OP Stack) anchored to L2.
- High-signal runtime entry points:
  - `docker-compose.phase3.yml` (segmented internal/interchain runtime).
  - `docker-compose.autonomy.yml` (autonomy + orchestration controls).
- Core service pattern:
  - `ghost-mapper` acts as egress/RPC gateway.
  - `ghost-registry` exposes discovered health-ranked RPC endpoints at `/v1/endpoints`.
  - `ghost-guard`, `network-manager-service`, `consensus-telemetry-service` provide policy and autonomy controls.

## Existing Components Reusable for GhostDNS

1. **Routing law enforcement**
   - `packages/routing-guard/index.js` already codifies allowed transitions and external egress restrictions.
2. **Inter-layer policy enforcement**
   - `services/ghostchain-bridge-hub/src/server.ts` enforces:
     - `L3 -> L2` for L3 roots.
     - `L2 -> L1` for L2 roots.
     - external egress from `L1` only.
3. **Endpoint discovery + health**
   - `services/ghost-registry/src/server.ts` + health checker provide structured chain endpoint catalog and status.
4. **Relayer safety checks**
   - `services/ghost-relayer/src/index.ts` enforces route assumptions and endpoint allowlisting.
5. **Container hardening baseline**
   - `phase3` and `autonomy` profiles already use non-root, `cap_drop: ALL`, read-only root FS, `no-new-privileges`, and health probes.

## Governance + Security Constraints (Must Preserve)

- Routing policy from `docs/routing-policy.md`:
  - Block direct `L3 -> L1`.
  - Permit external egress from `L1` only.
- Consensus boundaries from `docs/consensus-boundaries.md`:
  - No modification of consensus-client internals; only API-level integration.
- Autonomy safety lock from hardening docs:
  - Production execution paths must remain kill-switch/prod-lock guarded.
- Existing secret handling approach:
  - Sensitive material should resolve from file-based secrets and/or Vault, not hardcoded env values.

## GhostDNS Integration Surfaces

- **On-chain**
  - New DNS registry + attestation contracts should live under `contracts/` and remain governance-controlled.
- **Off-chain services**
  - Indexer/resolver service can follow the existing `services/*` health and hardening conventions.
  - Policy evaluation can reuse `routing-guard` semantics for layer-aware resolution/egress validation.
- **Observability**
  - Emit Prometheus metrics and structured evidence artifacts compatible with current compliance/evidence patterns.

## Risk Register (Initial)

1. **Policy bypass risk**
   - Any DNS-triggered action path that enables `L3/L2 -> external` would violate routing law.
2. **Stale resolution risk**
   - Cached records can drift from on-chain state; requires TTL + finalized-block anchored reads.
3. **Control-plane abuse risk**
   - Admin mutation endpoints must require strong auth and governance gating for high-impact changes.
4. **Resolver amplification risk**
   - Public DNS/API endpoints need strict rate limits and bounded recursion/lookup depth.
5. **Secrets leakage risk**
   - Signing keys for attestations/updates must remain file/Vault sourced and rotation-ready.

## Recommended Deliverables for Next Build Step

1. Scaffold `services/ghostdns-resolver` (read-only resolve path + `/health` + `/metrics`).
2. Add `packages/ghostdns-policy` (deterministic policy evaluator for chain/layer/action decisions).
3. Add `contracts/src/ghostdns/` with governance-owned registry + resolver-attestation interfaces.
4. Add docs for rollout/rollback + threat model evidence under `docs/ghostdns/` and `artifacts/ghostdns/`.

## Recon Conclusion

GhostL-Stack already contains the core primitives GhostDNS AI needs: route-law enforcement, endpoint registry, hardened runtime profiles, and governance-aware control-plane services. The highest-leverage path is additive integration that reuses these primitives rather than introducing a parallel policy system.
