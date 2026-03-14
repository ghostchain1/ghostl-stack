# Ghost L3 <-> Ghost L2 Alignment Audit

This audit is derived from current configs under `infra/opstack/l3/ghostl3/config` and `infra/opstack/.env.l3`.

## Chain IDs

- Parent (L2) chain ID: `901`
  - Source: `infra/opstack/l3/ghostl3/config/rollup.json` (`l1_chain_id`)
  - Source: `infra/opstack/l3/ghostl3/config/l1-chain.json` (`config.chainId`)
  - Source: `infra/opstack/.env.l3` (`PARENT_L2_CHAIN_ID=901`)
- Child (L3) chain ID: `903`
  - Source: `infra/opstack/l3/ghostl3/config/rollup.json` (`l2_chain_id`)
  - Source: `infra/opstack/l3/ghostl3/config/genesis.json` (`config.chainId`)
  - Source: `infra/opstack/.env.l3` (`L3_CHAIN_ID=903`)

## Parent RPC wiring

- L3 op-node parent RPC: `L3_L1_RPC` (default `http://l2-geth:8545`)
- L3 batcher/proposer parent RPC: `L3_L1_RPC` (default `http://op-gate:8545`)
- Host-facing parent RPC in local dev: `PARENT_L2_RPC=http://localhost:29547`

## L3 rollup config references

From `infra/opstack/l3/ghostl3/config/rollup.json`:

- `genesis.l1.number`: `56` (parent L2 block number at L3 genesis)
- `genesis.l1.hash`: `0x710ece4f93b537b9f78d5fe121e2135e5f27914624fb451466552c933dabaf6a`
- `batch_inbox_address`: `0x21b6ffeecf77ac42acc5b30b515b50be293f5ddb`
- `deposit_contract_address`: `0xbCF26943C0197d2eE0E5D05c716Be60cc2761508`
- `l1_system_config_address`: `0x712516e61C8B383dF4A63CFe83d7701Bce54B03e`
- `protocol_versions_address`: `0x948B3c65b89DF0B4894ABE91E6D02FE579834F8F`

## L2 contracts required by L3

From `infra/opstack/.env.l3`:

- `L3_PORTAL_ADDRESS=0xbCF26943C0197d2eE0E5D05c716Be60cc2761508`
- `L3_L2OO_ADDRESS=0x1275D096B9DBf2347bD2a131Fb6BDaB0B4882487`
- `L3_SYSTEM_CONFIG_ADDRESS=0x712516e61C8B383dF4A63CFe83d7701Bce54B03e`
- `L3_DISPUTE_GAME_FACTORY_ADDRESS=0x05Aa229Aec102f78CE0E852A812a388F076Aa555`
- `L3_GAME_FACTORY_ADDRESS=0x05Aa229Aec102f78CE0E852A812a388F076Aa555`
- `BATCH_INBOX_ADDRESS=0x21b6ffeecf77ac42acc5b30b515b50be293f5ddb`

Bridge helpers (parent L2):

- `L3_PARENT_STANDARD_BRIDGE_ADDRESS=0xC6bA8C3233eCF65B761049ef63466945c362EdD2`
- `L3_PARENT_CROSS_DOMAIN_MESSENGER_ADDRESS=0x59F2f1fCfE2474fD5F0b9BA1E73ca90b143Eb8d0`

## Genesis consistency

- L3 genesis chain ID `903` matches rollup `l2_chain_id` and env `L3_CHAIN_ID`.
- Parent (L2) chain ID `901` matches rollup `l1_chain_id`, l1-chain.json, and env `PARENT_L2_CHAIN_ID`.
- `l1-chain.json` mirrors the parent L2 genesis data but omits `gasToken` for op-node compatibility; rollup validation keys off `genesis.l1.number` + `genesis.l1.hash`.

## Gaps / validations to enforce

- Contract bytecode checks on parent L2 for the addresses above (doctor script will enforce).
- L3 gas token policy is not declared in `genesis.json`; enforce via SystemConfig in L2 or deployment tooling.
- Parent L2 RPC health and rollup RPC availability must be validated at boot and in `doctor-l3.sh`.
