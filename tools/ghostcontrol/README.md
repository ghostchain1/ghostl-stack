# GhostControl

Central autonomous control plane for the Ghost stack (L1/L2/L3 + services).

This is a **skeleton**: least-privilege Docker Compose, signed action bundles, and a minimal API/ingest/planner/policy/runner/UI layout.

Quick start:

1) Generate dev signing keys:
   - `bash infra/compose/gen-dev-keys.sh`
2) Start the stack:
   - `bash infra/compose/up.sh`
3) Open:
   - UI: `http://localhost:7400`
   - API: `http://localhost:7401/health`
4) Optional continuous event loop:
   - `pnpm ghostloop:watch`
5) Optional persistent host service:
   - `pnpm ghostloop:watch:install-systemd`
6) Optional manual failure remediation probe:
   - `pnpm ghostloop:watch:recover`
7) Optional live-fire resilience drill:
   - `pnpm ghostloop:watch:drill`

Docs:
- `docs/architecture.mmd`
- `docs/security.md`
- `docs/runbooks.md`
