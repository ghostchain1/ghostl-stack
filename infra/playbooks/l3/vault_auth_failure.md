# L3 Vault Auth Failure

## Detection signals
- Vault agent errors or missing secrets for batcher/proposer/challenger.
- AI monitor incidents for stalled batcher/proposer alongside missing keys.
- `infra/scripts/doctor-l3.sh` warns about missing secrets when `ALLOW_DEV_SECRETS=0`.

## Immediate mitigation
1. Check Vault status:
   - `vault status`
2. Validate AppRole or agent template health.
3. Confirm secrets path and permissions for L3 roles.

## Permanent fix
- Rotate AppRole credentials and update Vault policy.
- Ensure `infra/vault/` bootstrap steps completed.
- For dev mode only: set `ALLOW_DEV_SECRETS=1` and provide `.env.secrets` (never in prod).

## Verification
- `bash infra/scripts/doctor-l3.sh`
- Restart batcher/proposer after secrets are restored.
