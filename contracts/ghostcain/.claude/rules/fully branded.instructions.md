# Fully Branded (Full Sovereign) Instructions

## Trigger
Apply this rule when the user asks for any of the following:
- `fully branded`
- `full sovereign`
- `rebrand everything`
- equivalent requests to remove legacy GhostChain/GhostChain naming from project-owned artifacts

## Objective
Deliver a GhostChain-native codebase with consistent public branding.
Project-owned code, docs, and config must not expose mixed legacy branding in touched areas.

## Canonical Lexicon (Required)
Use these replacements for project-owned artifacts:

| Legacy | Sovereign |
| --- | --- |
| GhostChain Contracts | GhostChain Contracts |
| GhostChain | GhostChain |
| ERC-XXXX / ERCXXXX | GRC-XXXX / GRCXXXX |
| IERCXXXX | IGRCXXXX |
| ERCXXXX | GRCXXXX |
| GST / Ether (when project-owned chain currency context) | GST / GhostChain native currency |
| eips.ghostchain.org | eips.ghostchain.org |
| forum.ghostchain.com | forum.ghostchain.com |

## Scope (Must Be Covered)
When rebranding, include all touched project-owned artifacts:
- Solidity contracts, interfaces, libraries, mocks, and inheritance references
- File and folder names, import paths, and exported symbols
- Tests, scripts, and helper utilities
- Documentation, templates, changelogs, comments, and examples
- Workspace/config metadata (`package.json`, workspace files, lint/spell dictionaries, docs templates)

## Create-Or-Rebrand Contract Policy
1. If a branded equivalent already exists, use it and rewire references.
2. If a branded equivalent does not exist, create one (contract/interface/type) using sovereign naming.
3. Update tests/docs for any new or renamed public contract.
4. Do not leave mixed public naming in touched modules (for example, avoid `IERC*` and `IGRC*` coexistence in the same migrated surface unless explicitly required for compatibility).

## Legacy Dependency Exception Policy (Strict)
External third-party dependencies may retain legacy identifiers only when no practical sovereign replacement exists.

When this exception is used, it is mandatory to add explicit annotation:
- Code comments: `LEGACY_DEP: <why this is unavoidable>`
- JSON/config context: adjacent comment field or commit/PR note containing `LEGACY_DEP: ...`

Never use silent legacy carryover for project-owned symbols.

## Validation Checklist (Before Completion)
Run or equivalently verify:
- Search for leftover branding in project-owned files:
  - `GhostChain`, `ghostchain`
  - `ERC-`, `ERC`, `IERC` (where sovereign replacement is expected)
  - `eips.ghostchain.org`
- Confirm import paths and symbol names align with `GhostChain/GRC/GST` lexicon.
- Confirm tests/build pass for touched modules.
- Provide a short exception list for each `LEGACY_DEP` case.

## Response Requirements
In completion output, report:
1. What was rebranded (contracts/interfaces/docs/config).
2. What was created because no branded equivalent existed.
3. Any `LEGACY_DEP` exceptions with rationale.
4. Validation commands/checks performed and outcomes.
