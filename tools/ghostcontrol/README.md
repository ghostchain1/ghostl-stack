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

Docs:
- `docs/architecture.mmd`
- `docs/security.md`
- `docs/runbooks.md`

