# HGOP Protocol

HGOP v1.0 implements a **proposal-first** orchestration loop:

1. **Probe**
   - Periodic L1/L2/L3 RPC probes and optional HTTP probes.
2. **Record**
   - Operators can create incidents and attach evidence metadata.
3. **Propose**
   - Generate a proposal with a deterministic ranked list of fixes (no RNG).
4. **Attest (dev/test only)**
   - Optional local signing of a proposal snapshot (`/proposals/:id/attest`).
5. **Bundle**
   - Generate a Change Manifest (CMF) + governance calldata templates (`/proposals/:id/submit-governance`).
6. **Execute**
   - **Mainnet:** forbidden (proposal-only).
   - **Testnet:** requires approval token and exec flag.
   - **Devnet:** allowed only if exec flag enabled.
   - v1 executor is intentionally **non-destructive** and records executions as `blocked` unless a dedicated executor plugin is added.

## Deterministic Ranking

HGOP generates common fix patterns and ranks them deterministically.

Score formula:

`score = expected_benefit - risk_score - blastRadiusPenalty - uncertainty`

Tie-breakers (strict):

1. lower `risk_score`
2. lower blast radius (`low < med < high`)
3. smaller `diff_summary` length
4. lexicographic `fix_id`

## CMF (Change Manifest) Bundle

HGOP writes artifacts under:

`/var/lib/ghost/hgop/CMF/<proposal_id>/`

Files:

- `change-manifest.json`: the human and machine-readable change manifest
- `evidence-bundle.json`: evidence references only (no secret material)
- `governance/*.json`: calldata templates and unresolved field notes

CMF hash:

- `governance/manifest_hash.json` contains `sha256(change-manifest.json)`

