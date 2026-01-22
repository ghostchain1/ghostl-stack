# Security Hardening Pass

Applied (in unified compose files only):

- Added `security_opt: ["no-new-privileges:true"]` to all services to prevent privilege escalation.

Skipped (to avoid breaking running services or chain data):

- `read_only: true` (unknown write paths for many services).
- `cap_drop: ["ALL"]` (some services may require NET_ADMIN or IPC capabilities).
- Non-root user enforcement (volume ownership constraints unknown).
- Aggressive resource limits (need per-service tuning).

Notes:

- Hardening was applied only to the new unified compose files under `infra/docker/compose/`.
- Original compose files were not modified.
