# Rollup templates (mainnet & sepolia)

Files:
- `rollup.mainnet.template.json`
- `rollup.sepolia.template.json`
- `rollup.l3.template.json` (L3 on L2)

Replace the placeholders before use:
- `l1.hash` / `l2.hash` / `l2_time`: from your deployment outputs (op-chain-ops).
- `l2_chain_id`: your chain ID.
- `batcherAddr` and `batch_inbox_address`: from deploy artifacts.
- `protocol_versions_address`: use DisputeGameFactory when fault proofs are enabled, otherwise set `0x0`.
- Keep `deposit_contract_address` and `l1_system_config_address` set to the published Optimism addresses for the chosen network (or parent L2 for L3).

After filling, copy to `infra/opstack/config/rollup.json` for the target environment. Verify `eth_getCode` on `deposit_contract_address` and L2OO before starting proposer.***
