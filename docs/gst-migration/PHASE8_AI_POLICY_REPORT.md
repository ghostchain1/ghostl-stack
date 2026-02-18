# Phase 8 (AI GST Policy Enforcement) Report

Date (UTC): 2026-02-16

## 1. What Was Scanned (Paths)

- `services/hyper-ghost-supervisor/src/exec/preflight.ts`
- `tools/ghostcontrol/apps/policy/src/index.ts`
- `scripts/preflight.sh`
- `ops/scripts/preflight.sh`
- `infra/scripts/gates/ai-go-no-go.sh`
- `scripts/gst-ai-policy-gate.sh`

## 2. What Changed (Minimal Diffs)

- Added canonical AI policy module:
  - `services/ai-policy/gst_policy.ts`
  - `services/ai-policy/gst_policy.cjs`
  - Enforces legacy branding bans, with RPC namespace exceptions only when context is tagged `rpc_method_only`.
- Wired Hyper Ghost AI Host Agent preflight:
  - `services/hyper-ghost-supervisor/src/exec/preflight.ts`
  - Fix metadata (`description`, `diff_summary`, rollback/verification payloads) is now policy-checked before execution.
- Wired GhostControl policy service:
  - `tools/ghostcontrol/apps/policy/src/index.ts`
  - Action/gate payloads now run through GST policy evaluation and are denied on violation.
- Wired Codex preflight pipeline:
  - `scripts/gst-ai-policy-gate.sh` (new)
  - `scripts/preflight.sh` now runs the AI policy gate.
  - `ops/scripts/preflight.sh` records `gate:gst-ai-policy`.
  - `infra/scripts/gates/ai-go-no-go.sh` now includes the AI policy gate.

## 3. Commands Run

```bash
bash scripts/gst-leakage-gate.sh
bash scripts/gst-symbol-gate.sh
bash scripts/gst-ai-policy-gate.sh
bash scripts/preflight.sh
bash ops/scripts/preflight.sh --dry-run --json >/tmp/ops-preflight.json
npm --prefix services/hyper-ghost-supervisor run build
npm --prefix tools/ghostcontrol/apps/policy run build
```

## 4. Expected Output

- GST gates and AI policy gate pass:
  - `[gst-policy] OK: codex_preflight_diff`
  - `[gst-ai-policy-gate] OK: diff passed AI GST policy.`
- Hyper Ghost Supervisor TypeScript build passes.
- GhostControl policy build in this environment reports missing workspace dependencies (`@ghostcontrol/shared`, `fastify`) because `pnpm` workspace tooling is not installed in this shell.

## 5. Rollback Plan (Git-Based)

```bash
# Safe rollback in shared history:
git revert <phase8-commit-sha>

# If local-only and you want to keep edits but remove the commit:
git reset --mixed HEAD~1
```
