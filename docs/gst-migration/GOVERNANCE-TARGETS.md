# GST Governance Targets (Phase 5)

Date (UTC): 2026-02-16

## Source of truth

- `services/stack.env`
- `infra/opstack/.env`
- `contracts/reports/policy_primitives_status.json`
- `contracts/scripts/build-gst-constitution-proposal.ts`

## L1 governance control plane

- Governor (`GOVERNOR_ADDRESS_L1`): `0xdbC43Ba45381e02825b14322cDdd15eC4B3164E6`
- Executor/Timelock (`EXECUTOR_ADDRESS_L1`): `0x7bc06c482DEAd17c0e297aFbC32f6e63d3846650`
- Policy Registry (`POLICY_REGISTRY_ADDRESS`): `0x99bbA657f2BbC93c02D617f8bA121cB8Fc104Acf`
- Chain Policy Registry (`CHAIN_POLICY_REGISTRY_ADDRESS`): `0x1c85638e118b37167e9298c2268758e058DdfDA0`
- AI Proposal Executor: `0x367761085BF3C12e5DA2Df99AC6E1a824612b8fb`
- Constitutional Guard: `0x2B0d36FACD61B71CC05ab8F3D2355ec3631C0dd5`
- Constitution contract: `0xD84379CEae14AA33C123Af12424A37803F885889`
- Evidence Vault: `0xC9a43158891282A2B1475592D5719c001986Aaec`

## L2/L3 governance placeholders

- L2 Governor (`GOVERNOR_ADDRESS_L2`): unset
- L2 Executor (`EXECUTOR_ADDRESS_L2`): unset
- L3 Governor (`GOVERNOR_ADDRESS_L3`): unset
- L3 Executor (`EXECUTOR_ADDRESS_L3`): unset

## GST constitutional proposal targets

- Primary target contract for all `setPolicySetting/applyPolicy` calls:
  - `0x99bbA657f2BbC93c02D617f8bA121cB8Fc104Acf` (`PolicyRegistry`)
- Optional batch executor target:
  - `0x7bc06c482DEAd17c0e297aFbC32f6e63d3846650`
- Deterministic output artifact:
  - `docs/gst-migration/PROPOSAL-CALLDATA.json`
