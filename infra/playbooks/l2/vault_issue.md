# Vault Secrets Issue (L2)

## Detection signals
- `doctor-l2.sh` fails in Vault mode (missing secret files).
- Services crash due to missing keys/JWT secret.

## Immediate mitigation
1. Confirm Vault health and auth:
   - `vault status`
2. Verify secrets rendered to `L2_SECRETS_DIR`:
   - `ls -la ${L2_SECRETS_DIR:-infra/opstack/secrets}`
3. Restart L2 services after secrets appear:
   - `docker compose -f infra/opstack/docker-compose.yml up -d op-node op-sequencer op-batcher op-proposer`

## Permanent fix
- Validate Vault Agent template paths and AppRole permissions.
- Ensure `L2_SECRETS_DIR` is mounted read-only where possible.
- Rotate compromised keys and update audit trail.

## Verification
- `bash infra/scripts/doctor-l2.sh`
- `docker compose -f infra/opstack/docker-compose.yml ps`
