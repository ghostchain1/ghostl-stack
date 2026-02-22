# Phase 12 Evidence Index

Generated: 2026-02-21

## Files
- `script-syntax.txt` — syntax check output for `infra/opstack/scripts/validate-branch-protection-controls.sh`.
- `runner-output.txt` — runner output stream from Phase 12 gate execution.
- `branch-protection-gate.txt` — structured JSON gate output.
- `gate-exit.txt` — exit code for gate execution.
- `gate-status.txt` — compact gate marker.
- `script-syntax-apply-branch-protection.txt` — syntax check for `scripts/github/apply-branch-protection.sh`.
- `script-syntax-phase12-validator.txt` — syntax check for Phase 12 validator.
- `required-contexts-in-script.txt` — required GitHub status check context verification output.
- `required-workflow-jobs.txt` — workflow/job coverage verification output.
- `checklist-contains-required-checks.txt` — branch protection checklist required checks verification output.
- `apply-branch-protection-dry-run.txt` — dry-run output from branch protection apply script.

## Gate-relevant pointers
- Branch protection apply script dry-run is now non-mutating (labels are previewed, not written).
- Required status checks in branch protection script match required workflow jobs.
- Required checks listed in checklist are aligned with automation script and workflow definitions.
- Phase 12 gate status: `Gate12=PASS`.
