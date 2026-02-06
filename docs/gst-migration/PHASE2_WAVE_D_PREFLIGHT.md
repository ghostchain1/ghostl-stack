# Phase 2 Wave D Preflight (Observability)

Captured at (UTC): `2026-02-06T10:27:05Z`
Branch: `brand/gst-native`
Base revision (pre-commit): `c933489575479c38b5e2758161c2f95f06d66ea9`

Wave D updates first-party observability assets to remove ETH branding from Grafana dashboards and embedded dashboard JSON.

## Changes in scope

- Update panel title(s) from `(ETH)` → `(GST)`.
- Avoid Grafana’s `eth` unit to prevent ETH-branded UI; set unit to `none` and rely on panel text/legend for semantics.

## Scan command (post-patch worktree)

```bash
rg -n --hidden --glob '!.git/**' --glob '!docs/gst-migration/**' --glob '!**/node_modules/**' \\
  '\\bETH\\b|Ethereum|\\bEther\\b|Ξ' observability/infra
```

## Expected remaining hits (out of scope for Wave D)

- Besu RPC module token `ETH` in `--rpc-http-api` lists (technical token).
- Generated formal reports under `contracts/reports/**` which must be allowlisted (not hand-edited).
