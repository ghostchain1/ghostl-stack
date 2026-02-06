# Formal Verification Tooling

This folder provides runnable scaffolding for Slither, Scribble, Echidna, and optional Certora.

## Slither (static analysis)

- Run: `npm run formal:slither`
- Output: `contracts/reports/formal/slither.json`
- Requires a working Docker daemon. If Docker is unavailable, the script will **skip** in non-CI mode.
  - Force strict behavior: `SLITHER_STRICT=1 npm run formal:slither`

## Scribble (instrumentation)

- Run: `npm run formal:scribble`
- Output: `contracts/reports/formal/scribble/scribble.json`
- Uses annotations embedded in core contracts.

## Echidna (property fuzzing)

- Run: `npm run formal:echidna`
- Output: `contracts/reports/formal/echidna.json`
- Harnesses live in `contracts/formal/echidna`.

## Certora (optional)

- Run: `npm run formal:certora`
- Requires `CERTORAKEY` and access to the prover.
- Config: `contracts/formal/certora/certora.conf`

## CI

CI runs Slither, Scribble instrumentation, and Echidna. Certora is gated by secrets.
