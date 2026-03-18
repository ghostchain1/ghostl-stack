// SPDX-License-Identifier: MIT
// GhostChain Contracts v5.6.1 (script/DeployGhostOutputOracle.s.sol)
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import { GhostOutputOracle } from "../src/opstack/GhostOutputOracle.sol";

/// @notice Deploy a GhostOutputOracle instance for either:
///           - L2 → L1  (childChainId=901,  parentChainId=14000101)
///           - L3 → L2  (childChainId=903,  parentChainId=901)
///
/// Usage — L3 oracle (deployed on GhostL2, tracks L3 outputs):
///
///   forge script script/DeployGhostOutputOracle.s.sol \
///     --rpc-url $L2_RPC_URL \
///     --broadcast \
///     --sender $DEPLOYER \
///     -vvvv
///
/// Required env vars:
///   DEPLOYER_PRIVATE_KEY         – deployment key
///   ORACLE_OWNER                 – governance multisig / GhostChainGovernor address
///   ORACLE_PROPOSER              – address authorised to propose outputs (op-proposer)
///   ORACLE_CHALLENGER            – address authorised to delete outputs (op-challenger)
///   ORACLE_CHILD_CHAIN_ID        – child chain (901 → L2 oracle, 903 → L3 oracle)
///   ORACLE_PARENT_CHAIN_ID       – parent chain (14000101 for L2 oracle, 901 for L3 oracle)
///   ORACLE_SUBMISSION_INTERVAL   – output proposal interval in blocks (e.g. 120)
///   ORACLE_L2_BLOCK_TIME         – child-chain block time in seconds (e.g. 2)
///   ORACLE_STARTING_BLOCK_NUMBER – first child-chain block tracked (e.g. 0 for genesis)
///   ORACLE_STARTING_TIMESTAMP    – parent-chain UNIX timestamp at starting block
///   ORACLE_FINALIZATION_PERIOD   – seconds before an output is final (e.g. 604800 = 7 days)
///
/// After deployment, export the oracle address to infra/opstack/.env.l3:
///   L3_OUTPUT_ORACLE_ADDRESS=<address>
contract DeployGhostOutputOracle is Script {
    function run() external {
        uint256 deployerKey        = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address owner              = vm.envAddress("ORACLE_OWNER");
        address proposer           = vm.envAddress("ORACLE_PROPOSER");
        address challenger         = vm.envAddress("ORACLE_CHALLENGER");
        uint256 childChainId       = vm.envUint("ORACLE_CHILD_CHAIN_ID");
        uint256 parentChainId      = vm.envUint("ORACLE_PARENT_CHAIN_ID");
        uint256 submissionInterval = vm.envUint("ORACLE_SUBMISSION_INTERVAL");
        uint256 l2BlockTime        = vm.envUint("ORACLE_L2_BLOCK_TIME");
        uint256 startingBlockNumber= vm.envUint("ORACLE_STARTING_BLOCK_NUMBER");
        uint256 startingTimestamp  = vm.envUint("ORACLE_STARTING_TIMESTAMP");
        uint256 finalizationPeriod = vm.envUint("ORACLE_FINALIZATION_PERIOD");

        vm.startBroadcast(deployerKey);

        GhostOutputOracle oracle = new GhostOutputOracle(
            submissionInterval,
            l2BlockTime,
            startingBlockNumber,
            startingTimestamp,
            proposer,
            challenger,
            finalizationPeriod,
            childChainId,
            parentChainId,
            owner
        );

        vm.stopBroadcast();

        console.log("GhostOutputOracle deployed:");
        console.log("  address          :", address(oracle));
        console.log("  childChainId     :", childChainId);
        console.log("  parentChainId    :", parentChainId);
        console.log("  proposer         :", proposer);
        console.log("  challenger       :", challenger);
        console.log("  owner            :", owner);
        console.log("  submissionInterval:", submissionInterval);
        console.log("  l2BlockTime      :", l2BlockTime);
        console.log("  finalizationPeriod:", finalizationPeriod);
        console.log("");
        if (childChainId == 903) {
            console.log("Next step: add to infra/opstack/.env.l3:");
            console.log("  L3_OUTPUT_ORACLE_ADDRESS=", address(oracle));
        } else {
            console.log("Next step: add to infra/opstack/.env:");
            console.log("  L2_OUTPUT_ORACLE_ADDRESS=", address(oracle));
        }
    }
}
