# Branch Protection Security Checklist

Use this checklist to harden `main` branch merge policy for production safety.

## 1) Enable branch protection on `main`

- Require pull request before merging.
- Require at least 1 approving review (recommend 2 for production-sensitive changes).
- Dismiss stale reviews when new commits are pushed.
- Require conversation resolution before merge.
- Require signed commits (recommended for governance/security repos).
- Include administrators in restrictions.

## 2) Require status checks to pass

Mark these GitHub Actions checks as **required**:

- `rpc-namespace`
- `shellcheck`
- `node-lint-build`
- `contracts-hardhat-compile`
- `contracts-gst-invariant`
- `contracts-lge-tests`
- `contracts-cascading-finality`
- `secure-preflight`

Pin these checks to the **GitHub Actions** app when configuring via API/CLI.

Recommended additional required checks:

- `CI / repo-security`
- `CI / ghost-helper`

## 3) Restrict force-push and deletion

- Disable force pushes to `main`.
- Disable branch deletion for `main`.

## 4) Restrict who can push/merge

- Allow merge only through pull requests.
- Restrict direct push access to an admin/security group only.

## 5) Enforce deployment governance

- If using environments, require reviewers for production environment.
- Require deployment checks to pass before merge (if configured).
- Keep production release workflows scoped to `main` + tags only.

## 6) Operational verification

After applying protection:

- Open a test PR that touches `contracts/src/governance/bridge/**` and confirm:
  - `Contracts Cascading Finality (Fast)` runs.
  - required checks above are reported on the PR head commit and gate merge.
- Open a test PR with non-contract docs-only changes and confirm expected workflow scope behavior.

## 7) Maintenance cadence

- Re-review required checks quarterly.
- Add newly critical workflows to required checks when introduced.
- Remove deprecated checks only after replacement checks are enforced.

## 8) One-command apply (GitHub CLI)

From repo root, authenticated as an admin/maintainer:

```bash
bash scripts/github/apply-branch-protection.sh ghostchain1/ghostl-stack main
```

Preview only (no API writes):

```bash
bash scripts/github/apply-branch-protection.sh ghostchain1/ghostl-stack main --dry-run
```

This applies:

- required status checks listed above,
- PR review requirements,
- force-push/delete protection,
- required signed commits.
