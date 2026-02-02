# L1 Playbook: Vault Sealed / Secrets Unavailable

## Detection signals
- `doctor-l1.sh` fails secret checks in Vault mode
- Services fail to mount `jwtsecret` or validator keys

## Immediate mitigation
1. Check Vault status: `vault status`
2. Unseal Vault (per operator runbook) and re-render secrets:
   - `bash infra/vault/render-l1-secrets.sh`

## Permanent fix
- Configure Vault auto-unseal or operator rotation process.
- Ensure Vault agent templates render to `infra/ghostchain/secrets`.

## Verification
- `bash infra/scripts/doctor-l1.sh`
