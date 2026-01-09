// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "@eth-optimism-bedrock/src/L1/ProxyAdmin.sol";
import "@eth-optimism-bedrock/src/L1/SystemConfig.sol";
import "@eth-optimism-bedrock/src/L1/ProtocolVersions.sol";
import "@eth-optimism-bedrock/src/L1/OptimismPortal2.sol";
import "@eth-optimism-bedrock/src/L1/L1CrossDomainMessenger.sol";
import "@eth-optimism-bedrock/src/L1/L1StandardBridge.sol";
import "@eth-optimism-bedrock/src/L1/L2OutputOracle.sol";
import "@eth-optimism-bedrock/src/dispute/DisputeGameFactory.sol";
import "@eth-optimism-bedrock/src/dispute/FaultDisputeGame.sol";

/// @notice Minimal deploy script to stand up the essential OP Stack L1 suite for a devnet.
/// WARNING: This is a pared-down script; it skips advanced wiring (superchain config, interop, anchors).
/// Adjust params to your network before broadcasting.
contract DeployL1 is Script {
    struct Deployed {
        ProxyAdmin proxyAdmin;
        SystemConfig systemConfig;
        ProtocolVersions protocolVersions;
        OptimismPortal2 optimismPortal;
        L1CrossDomainMessenger messenger;
        L1StandardBridge standardBridge;
        L2OutputOracle l2OutputOracle;
        DisputeGameFactory disputeGameFactory;
        FaultDisputeGame faultGameImpl;
    }

    Deployed public deployed;

    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PK");
        address deployer = vm.addr(pk);
        vm.startBroadcast(pk);

        // --- config inputs (edit these for your devnet) ---
        uint256 l2ChainId = vm.envOr("L2_CHAIN_ID", uint256(901));
        address batcher = vm.envAddress("BATCH_SENDER_ADDRESS");
        address sequencer = vm.envAddress("SEQUENCER_ADDRESS");
        address proposer = vm.envAddress("PROPOSER_ADDRESS");
        address challenger = vm.envAddress("CHALLENGER_ADDRESS");

        // ProtocolVersions expects a superchainConfig; for devnet we pass deployer as owner.
        deployed.protocolVersions = new ProtocolVersions(deployer);

        // ProxyAdmin
        deployed.proxyAdmin = new ProxyAdmin(deployer);

        // SystemConfig params (simplified)
        SystemConfig.Addresses memory addrs = SystemConfig.Addresses({
            owner: deployer,
            superchainConfig: address(0),
            unsafeBlockSigner: sequencer,
            batchInbox: address(0),
            gasPayingToken: address(0),
            batcher: batcher
        });
        ResourceMetering.ResourceConfig memory rcfg = ResourceMetering.ResourceConfig({
            maxResourceLimit: 20_000_000,
            elasticityMultiplier: 10,
            baseFeeMaxChangeDenominator: 8,
            minimumBaseFee: 1 gwei,
            maximumBaseFee: 1_000 gwei,
            systemTxMaxGas: 200_000,
            maxResourceLimitElasticity: 2
        });
        deployed.systemConfig = new SystemConfig(l2ChainId, addrs, rcfg, false);

        // DisputeGameFactory + a simple FaultDisputeGame impl
        deployed.disputeGameFactory = new DisputeGameFactory(deployer);
        deployed.faultGameImpl = new FaultDisputeGame(
            IBigStepper(address(0)), // placeholder
            0, // maxDepth
            0, // splitDepth
            IFaultDisputeGame.TimeBounds({upper: 1 days, lower: 1 hours}),
            true,
            IPreimageOracle(address(0)),
            SequencerFeeVault(payable(address(0))),
            IFaultDisputeGame.WireParameters({
                vm: VMParameters({maxStackDepth: 0, maxMemory: 0, maxInbox: 0, zkvm: false}),
                l2ChainId: uint64(l2ChainId),
                prover: address(0),
                challenger: challenger,
                defender: proposer
            })
        );
        deployed.disputeGameFactory.setImplementation(1, address(deployed.faultGameImpl));

        // L2OutputOracle (simplified; adjust params to match your rollup config)
        deployed.l2OutputOracle = new L2OutputOracle(
            120, // submissionInterval
            0,   // l2BlockTime
            0,   // genesisL2Output
            0,   // genesisL2Timestamp
            proposer,
            challenger
        );

        // OptimismPortal2
        deployed.optimismPortal = new OptimismPortal2(
            0,   // proofMaturityDelaySeconds
            0    // disputeGameFinalityDelaySeconds
        );
        deployed.optimismPortal.initialize(
            IDisputeGameFactory(address(deployed.disputeGameFactory)),
            deployed.systemConfig,
            ISuperchainConfig(address(0)),
            1 // initial respected game type (fault)
        );

        // Messenger
        deployed.messenger = new L1CrossDomainMessenger();
        deployed.messenger.initialize(deployed.systemConfig, deployed.optimismPortal);

        // Standard Bridge
        deployed.standardBridge = new L1StandardBridge();
        deployed.standardBridge.initialize(payable(address(deployed.messenger)), payable(address(deployed.optimismPortal)));

        vm.stopBroadcast();

        // Log addresses
        console2.log("Deployer", deployer);
        console2.log("ProxyAdmin", address(deployed.proxyAdmin));
        console2.log("SystemConfig", address(deployed.systemConfig));
        console2.log("ProtocolVersions", address(deployed.protocolVersions));
        console2.log("OptimismPortal", address(deployed.optimismPortal));
        console2.log("L1CrossDomainMessenger", address(deployed.messenger));
        console2.log("L1StandardBridge", address(deployed.standardBridge));
        console2.log("L2OutputOracle", address(deployed.l2OutputOracle));
        console2.log("DisputeGameFactory", address(deployed.disputeGameFactory));
        console2.log("FaultDisputeGameImpl", address(deployed.faultGameImpl));
    }
}
