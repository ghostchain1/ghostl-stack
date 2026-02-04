# Alignment Audit (L1/L2/L3)

Last updated: 2026-02-04

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
- L2 Output Oracle: `0x1275D096B9DBf2347bD2a131Fb6BDaB0B4882487`
- L3 L2OO (L3 output oracle on L2): `0x1275D096B9DBf2347bD2a131Fb6BDaB0B4882487`
- L1 Standard Bridge: `0xC6bA8C3233eCF65B761049ef63466945c362EdD2`
- L1 CrossDomain Messenger: `0x59F2f1fCfE2474fD5F0b9BA1E73ca90b143Eb8d0`
- L3 Portal: `0xbCF26943C0197d2eE0E5D05c716Be60cc2761508`
- L3 SystemConfig: `0x712516e61C8B383dF4A63CFe83d7701Bce54B03e`
- L3 DisputeGameFactory: `0x05Aa229Aec102f78CE0E852A812a388F076Aa555`
- Bridge L2->L3 (services env): `0x15375553c3ea219810bf52f3f9a6df5facc75a37`

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
