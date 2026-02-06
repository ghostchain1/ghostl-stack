# Final Evolution Codex Prompt (GhostControl)

Use this as a single prompt to regenerate/extend the GhostControl skeleton in this repo.

```
You are Codex operating inside /home/ghost/ghostl-stack. Your task is to generate a production-grade skeleton for "GhostControl" under /home/ghost/ghostl-stack/tools/ghostcontrol.

HARD RULES
- DIFF-ONLY once files exist: create minimal diffs; do not rewrite whole files.
- Keep changes reversible: add docs and scripts; do not delete existing repo content.
- Least privilege: containers run non-root, read-only where possible, cap_drop ALL, no-new-privileges.
- Planner cannot execute. Only Runner can execute.
- Runner must not access /var/run/docker.sock directly; use docker-socket-proxy.
- Add health endpoints for every HTTP service and docker healthchecks where relevant.

MISSION
1) Keep the multi-service architecture:
   - ghostcontrol-ui (Next.js)
   - ghostcontrol-api (Fastify)
   - ghostcontrol-policy (Fastify)
   - ghostcontrol-planner (BullMQ worker)
   - ghostcontrol-ingest (RPC probes + incidents)
   - ghostcontrol-runner (executes signed bundles)
2) Implement signed action bundles (Ed25519) + policy evaluation gates.
3) Keep least-privilege compose in tools/ghostcontrol/infra/compose/docker-compose.yml.

PHASES
0) Repo intelligence (read-only): map compose + services and write docs.
1) Expand Policy: tier model + allowlist updates.
2) Expand Runner: gates, safe patches (diff-only), reversible rollback hooks.
3) Add Watchdog: safe autopilot loop container (Tier-0 only).
4) Add Evidence Packs: bundle diff, logs, gate outputs, attestations.

END CONDITION
- `cd tools/ghostcontrol && pnpm i && pnpm -r build` succeeds
- `bash tools/ghostcontrol/infra/compose/up.sh` launches services
- UI at :7400 and API at :7401 are reachable
```

