# Phase 2 Wave B Preflight (Code / Contracts Debranding)

Captured at (UTC): `2026-02-06T10:19:40Z`
Branch: `brand/gst-native`
Base revision (pre-commit): `9a83b1a6a5dd086e4a6a5b70bea2375f05bef049`

This preflight accompanies the **Wave B continuation** patch set that removes ETH/Ethereum/Ether branding from first‑party code (contracts + adjacent tooling/docs).

## Scan commands (post-patch worktree)

Business-branding scan (excluding `docs/gst-migration/**` and known upstream/vendor dirs):

```bash
rg -n --hidden --glob '!.git/**' \
  --glob '!docs/gst-migration/**' \
  --glob '!**/node_modules/**' \
  --glob '!**/contracts/lib/**' \
  --glob '!**/infra/opstack/optimism-upstream/**' \
  --glob '!**/infra/opstack/op-geth/**' \
  '\\bETH\\b|Ethereum|\\bEther\\b|Ξ' .
```

Identifier scan (`_eth`, `ETH_`) under the same exclusions:

```bash
rg -n --hidden --glob '!.git/**' \
  --glob '!docs/gst-migration/**' \
  --glob '!**/node_modules/**' \
  --glob '!**/contracts/lib/**' \
  --glob '!**/infra/opstack/optimism-upstream/**' \
  --glob '!**/infra/opstack/op-geth/**' \
  '_eth\\b|\\bETH_' .
```

## Remaining high-signal hits (to be handled in Wave C/D or allowlisted later)

- **Observability dashboards** still label native balance as `(ETH)`:
  - `observability/infra/grafana/dashboards/opstack-observability.json`
  - `observability/infra/k8s/observability-stack.yaml`
- **Besu RPC module names** include `ETH` in `--rpc-http-api` lists (technical token; likely allowlist candidate):
  - `infra/ghostchain/docker-compose.ibft.yml`
  - `infra/docker/compose/docker-compose.core.yml`
- **Generated formal artifacts** contain historic strings and should be allowlisted (not hand-edited):
  - `contracts/reports/formal/scribble/scribble.json`
  - `contracts/reports/formal/slither.json`

## Next steps

- Wave C: rename env/config keys and add GST-native aliases where third-party components require legacy names.
- Wave D: update Grafana dashboards/panels to GST and avoid Grafana’s `eth` unit.
- Phase 3: add an enforcement gate (`scripts/gst-leakage-gate.sh`) with a **tiny** documented allowlist for technical/generated artifacts.
