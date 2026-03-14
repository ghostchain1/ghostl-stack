# Dependency Exceptions Policy

`security/audit-exceptions.json` is the only allowed mechanism to bypass dependency gates.

## Required fields

Each exception must include:

- `id`
- `type` (`audit` or `outdated`)
- `package`
- `rationale`
- `compensating_controls` (array)
- `owner`
- `created_at` (YYYY-MM-DD)
- `expires_at` (YYYY-MM-DD)

For `audit` exceptions, include `advisory_id` when available (for example `GHSA-xxxx-xxxx-xxxx`).

## Enforcement behavior

`npm run security:deps` (powered by `scripts/check-deprecations.mjs`) fails when:

- `npm audit` has unallowlisted findings
- `npm outdated` has unallowlisted findings
- an exception file is malformed
- any exception is expired
- deprecation/file scan findings are detected

The script writes machine-readable artifacts to `artifacts/`:

- `deprecations.json`
- `dependency-audit.json`
- `dependency-outdated.json`
- `dependency-exceptions-eval.json`

## Rotation and ownership

Owners must either:

1. remove the exception by remediating the dependency before `expires_at`, or
2. replace it with a new exception and updated rationale before the old one expires.

Expired exceptions are treated as CI failures by design.
