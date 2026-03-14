# Phase 13 Evidence — Release Workflow Governance Controls

This folder contains execution evidence for Phase 13.

## Files
- `release-workflow-governance-gate.txt`: machine-readable gate summary with per-check exit codes.
- `runner-output.txt`: full validator execution stream.
- `gate-exit.txt`: gate process exit code.
- `gate-status.txt`: compact gate marker (`Gate13=PASS` / `Gate13=FAIL`).
- `script-syntax.txt`: `bash -n` output for validator syntax check.
- `script-syntax-phase13-validator.txt`: self-syntax check output captured by validator.
- `docker-publish-main-only.txt`: proof that docker publish workflow is main-only.
- `security-preflight-main-only.txt`: proof security preflight is main-only.
- `ai-governance-tag-scoped.txt`: proof AI governance workflow is tag-scoped.
- `contracts-cascading-main-and-paths.txt`: proof contracts cascading workflow is path-filtered + main-scoped.
- `checklist-main-tags-governance.txt`: proof checklist retains release scope governance requirement.
