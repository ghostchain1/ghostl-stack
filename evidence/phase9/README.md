# Phase 9 Evidence Index

Generated: 2026-02-21

## Files
- `bridge-e2e-l2l3-rerun.txt` — pre-remediation L2<->L3 bridge E2E failure (relay timeout).
- `l2l3-rerun-status.txt` — pre-remediation L2<->L3 exit code.
- `bridge-e2e-l1l2-rerun.txt` — pre-remediation L1<->L2 failure with surfaced ensure-script revert.
- `l1l2-rerun-status.txt` — pre-remediation L1<->L2 exit code.
- `smoke-consensus-autonomy.txt` — initial consensus autonomy smoke output.
- `smoke-consensus-autonomy-status.txt` — initial consensus smoke exit code.
- `l1l2-script-syntax.txt` — syntax validation output for `infra/scripts/demo-deposit-l1l2-erc20.sh`.
- `log-line-counts.txt` — quick line-count snapshot of initial phase9 bridge logs.
- `relayer-logs-now.json` — relayer logs showing rollup-finality blocking (`L2 block not finalized on L1 rollup`).
- `relayer-health-now.json` — relayer health before remediation.
- `rollup-batches-snapshot.json` — root-cause snapshot (`batchesLength=0`) for L2-on-L1 rollup.
- `relayer-env-after-remediation.json` — live relayer env confirming remediated gating flags.
- `relayer-health-after-remediation.json` — relayer health after remediation.
- `bridge-e2e-l2l3-remediated.txt` — remediated L2<->L3 bridge E2E PASS run.
- `l2l3-remediated-status.txt` — remediated L2<->L3 exit code.
- `bridge-e2e-l1l2-remediated.txt` — remediated L1<->L2 bridge E2E PASS run.
- `l1l2-remediated-status.txt` — remediated L1<->L2 exit code.
- `smoke-consensus-autonomy-remediated.txt` — post-remediation consensus smoke output.
- `smoke-consensus-autonomy-remediated-status.txt` — post-remediation consensus smoke exit code.
- `gate-status.txt` — compact Phase 9 gate marker.

## Gate-relevant pointers
- Pre-remediation: strict rollup gating blocked L2<->L3 finalization while rollup batches were absent in this runtime (`rollup-batches-snapshot.json`).
- Pre-remediation: L1<->L2 ensure path surfaced `ProviderError: execution reverted`.
- Post-remediation: L2<->L3, L1<->L2, and consensus smoke all return `exit_code=0`.
- Gate status is now `Gate9=PASS`.
