# Econ Commit Runbook

Date: 2026-02-27
Branch: `release/testnet-audit`

This runbook uses staged helpers and commit messages aligned with `docs/econ/commit-split-plan.md`.

Optional helper (auto-select next batch, no commit):

```bash
bash scripts/econ/stage-next-batch.sh
```

Status helper (shows current staged batch + next commit command):

```bash
bash scripts/econ/batch-status.sh
```

One-command safe helper (`proceed` behavior):

```bash
bash scripts/econ/proceed.sh
```

## 1) Commit Batch 1 (already staged)

```bash
git diff --cached --name-only | sort
git commit -m "feat(econ-contracts): add sovereign routing, governance gate, risk and flywheel tests"
```

## 2) Commit Batch 2 (services)

```bash
bash scripts/econ/stage-batch2-services.sh
git commit -m "feat(econ-services): add treasury agent, risk oracle, reporting indexer and snapshotter"
```

## 3) Commit Batch 3 (infra + observability)

```bash
bash scripts/econ/stage-batch3-infra.sh
git commit -m "feat(econ-infra): add devnet/testnet/mainnet compose overlays and econ observability"
```

## 4) Commit Batch 4 (UI + API proxy)

```bash
bash scripts/econ/stage-batch4-ui.sh
git commit -m "feat(econ-ui): add control center routes and econ API proxy"
```

## 5) Commit Batch 5 (CI + scripts + package wiring)

```bash
bash scripts/econ/stage-batch5-ci.sh
git commit -m "ci(econ): add routing/governance/secret gates and econ workflow/scripts"
```

## 6) Commit Batch 6 (docs)

```bash
bash scripts/econ/stage-batch6-docs.sh
git commit -m "docs(econ): add baseline, receipts, production checklist and release handoff"
```

## 7) Final verification

```bash
git log --oneline -n 8
git status --short
```
