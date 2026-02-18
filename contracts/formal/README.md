# Formal Verification Tooling

This folder provides runnable scaffolding for Slither, Scribble, Echidna, and optional Certora.

## Slither (static analysis)

- Run: `npm run formal:slither`
- Output: `contracts/reports/formal/slither.json`
- By default (`SLITHER_RUNNER=auto`), the runner prefers Docker but will fall back to a local `slither` binary if Docker is unavailable.
  - Force Docker only: `SLITHER_RUNNER=docker npm run formal:slither`
  - Force local only: `SLITHER_RUNNER=local npm run formal:slither`
  - Force strict behavior: `SLITHER_STRICT=1 npm run formal:slither` (CI does this implicitly)

## Scribble (instrumentation)

- Run: `npm run formal:scribble`
- Output: `contracts/reports/formal/scribble/scribble.json`
- Uses annotations embedded in core contracts.

## Echidna (property fuzzing)

- Run: `npm run formal:echidna`
- Output: `contracts/reports/formal/echidna.json`
- Requires a working Docker daemon by default. If Docker is unavailable, the script will **skip** in non-CI mode.
  - Force strict behavior: `ECHIDNA_STRICT=1 npm run formal:echidna`
- Harnesses live in `contracts/formal/echidna`.

## Certora (optional)

- Run: `npm run formal:certora`
- Requires `CERTORAKEY` and access to the prover.
- Config: `contracts/formal/certora/certora.conf`

## CI

CI runs Slither, Scribble instrumentation, and Echidna. Certora is gated by secrets.
