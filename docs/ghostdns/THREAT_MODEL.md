# GhostDNS Threat Model (Operational)

## Assets

- Domain record integrity (`GhostDNSRegistry` events + indexer state)
- Policy correctness (`ghostdns-ai-policy` decisions)
- Evidence integrity (`ghostdns-attestor` envelopes/signatures)
- Admin control plane secrets (`GHOSTDNS_ADMIN_TOKEN`, `GHOSTDNS_ATTESTOR_SECRET`)

## Trust Boundaries

1. Public caller -> resolver API.
2. Internal service mesh -> policy/indexer/attestor APIs.
3. On-chain event stream -> indexer state materialization.
4. Evidence storage -> external audit consumers.

## Key Threats & Mitigations

1. **Unauthorized mutation**
   - Mitigation: mutation paths restricted to L1 policy and governance-owned contracts.
2. **Policy bypass**
   - Mitigation: `GHOSTDNS_POLICY_REQUIRED=1` in production; resolver fails closed on policy outages.
3. **Tampered evidence**
   - Mitigation: decision hash + HMAC signature + immutable file naming by evidence id.
4. **Replay/spam attacks**
   - Mitigation: admin token auth on mutation/attest endpoints and strict rate controls at ingress.
5. **Emergency response lag**
   - Mitigation: `GHOSTDNS_EMERGENCY_LOCK=1` immediate deny mode in policy service.

## Residual Risks

- HMAC signatures are operator-keyed and not yet on-chain verified.
- Indexer currently supports manual record ingest for bootstrap; production should prefer contract-event only ingest.

## Hardening TODOs

- Replace HMAC evidence signatures with ECDSA/attestor key registered on `GhostDNSPolicyAnchor`.
- Add replay nonce and short-lived authorization windows for admin endpoints.
- Add load/chaos tests for policy/indexer failure cascades.
