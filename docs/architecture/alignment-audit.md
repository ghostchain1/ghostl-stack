# Alignment Audit (L1/L2/L3)

Last updated: 2026-02-18

## Inputs
- `infra/opstack/.env`
- `infra/opstack/.env.l3`
- `services/stack.env`

## Chain IDs
- L1: `14000101`
- L2: `901`
- L3: `903`

## Parent RPCs
- L2 parent (L1): `HOST_L1_RPC=http://localhost:18545`
- L3 parent (L2): `PARENT_L2_RPC=http://localhost:29547`

## Governance Addresses
- L1 Governor: `0xdbC43Ba45381e02825b14322cDdd15eC4B3164E6`
- L1 Executor: `0x7bc06c482DEAd17c0e297aFbC32f6e63d3846650`
- L2 Governor: (unset)
- L2 Executor: (unset)
- L3 Governor: (unset)
- L3 Executor: (unset)
  - TODO: populate once L2/L3 governance deployments are complete.

## Bridge / Oracle / System Contracts (from env)
- L2 Output Oracle: `0x2279B7A0a67DB372996a5FaB50D91eAA73d2eBe6`
- L1 Standard Bridge: `0xa513E6E4b8f2a923D98304ec87F64353C4D5C853`
- L1 CrossDomain Messenger: `0x0165878A594ca255338adfa4d48449f69242Eb8F`
- Bridge L2->L3: `0xDadd1125B8Df98A66Abd5EB302C0d9Ca5A061dC2`
- L1 rollup (L2->L1): `0xad32D5C2Da9f4159C4cc98686C005852b3905355`
- L1 rollup parent oracle: `0x2C001131e99c79e6dDF9f099F2101e9535172Db1`
- L2 rollup (L3->L2): `0x130A46b6E41DB6E1e18fb9c759F223c459190e90`
- L1 finality oracle on L2: `0x7B3Be2dDDdDf9A0a3fE1DC57B98980F662C3a422`
- L2 finality oracle: `0x650aEF4b63095e4EDe581BC79CdeA927e3ba553A`
- L3 finality oracle: `0x87F850cbC2cFfac086F20d0d7307E12d06fA2127`
- L3 inbox: `0x8464135c8F25Da09e49BC8782676a84730C318bC`
- L3 token factory: `0x71C95911E9a5D330f4D621842EC243EE1343292e`

## Policy Registry
- Policy registry address: `0x99bbA657f2BbC93c02D617f8bA121cB8Fc104Acf`
- Policy registry RPC: `http://localhost:18545`
- Chain policy registry address: `0x1c85638e118b37167e9298c2268758e058DdfDA0`
- Chain policy registry RPC: `http://localhost:18545`

## AI / Automation
- AI monitor health URL: `http://localhost:7577/health`
- RunLog address: `0x3155755b79aA083bd953911C92705B7aA82a18F9`

## Observations
- L2 and L3 governor/executor addresses are unset in env files.
- L2/L3 output oracle values are present but should be verified on-chain.
- L2/L3 chain IDs align with OP stack defaults in `infra/opstack/.env`.

## Follow-ups (Phase 1 gate)
- Verify on-chain bytecode for listed addresses (oracles/bridges/system config).
- Confirm L2/L3 governor/executor deployment and populate envs.
- Validate L2/L3 parent RPC reachability via doctor scripts.
