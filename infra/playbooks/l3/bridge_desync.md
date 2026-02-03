# L3 Bridge Desync

## Detection signals
- Bridge E2E tests fail (L2↔L3).
- Mismatched token balances or pending messages on either side.
- AI monitor reports parent or op-node instability during bridge operations.

## Immediate mitigation
1. Check bridge contract addresses in `infra/opstack/.env.l3`.
2. Verify RPC health for L2 and L3:
   - `curl -fsS http://localhost:9545 | head -n 5`
   - `curl -fsS http://localhost:39545 | head -n 5`
3. Restart op-node and batcher if message queue is stalled.

## Permanent fix
- Reconcile L2/L3 SystemConfig and portal addresses.
- Ensure gas token policy matches L2 (GHOST if enforced).
- Re-run bridge tests after any config change.

## Verification
- `bash infra/scripts/doctor-l3.sh`
- Run bridge E2E tests (if present) and confirm receipts.
