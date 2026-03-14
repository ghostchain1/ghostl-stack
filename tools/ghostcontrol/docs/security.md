# Security model (skeleton)

Key properties:

- Planner cannot execute actions: it only proposes and signs bundles.
- Runner is the only component that can touch Docker / workspace (and only via allowlisted actions + Policy evaluation).
- Docker API is exposed to Runner only through `docker-socket-proxy` (no direct `/var/run/docker.sock` mount).

Risk tiers (intended):

- Tier 0 (**SAFE**) – automatic: restart allowlisted services, probe RPC endpoints, collect evidence.
- Tier 1 (**GATED**) – automatic only if gates pass: run allowlisted build/test commands, rebuild a single service.
- Tier 2 (**APPROVAL**) – requires explicit human approval token.
- Tier 3 (**GOVERNANCE**) – requires on-chain governance.

What is **blocked by default**:

- Deleting volumes / chain state.
- Key rotation.
- Contract redeployments / genesis changes.

Secrets:

- Dev signing keys live in `tools/ghostcontrol/secrets` and should be generated locally.
- Do not commit real secrets; keep prod keys in your secret manager and mount via runtime secrets.

