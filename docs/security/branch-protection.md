# Branch Protection: Required Security Gates

This document defines mandatory branch protection for `main`.

## Required status checks

Set these checks to **required** before merge:

- `rpc-namespace`
- `shellcheck`
- `routing-governance-gates`
- `node-lint-build`
- `repo-security`

`routing-governance-gates` is the minimum policy check for:

- routing law verification (`scripts/verify-routing.sh`)
- governance approval verification (`scripts/verify-governance.sh`)
- compose hardening baseline (`scripts/security/compose-hardening-audit.sh`)

## Required branch rules

Enable on `main`:

- Require a pull request before merging
- Require status checks to pass before merging
- Require branches to be up to date before merging
- Require conversation resolution before merging
- Disable force pushes
- Disable branch deletion

## Optional but recommended

- Require signed commits
- Require linear history
- Restrict who can push to matching branches
- Require merge queue

## Verification

After configuring branch protection, confirm by opening a test PR and verifying merge is blocked until all required checks are green.
