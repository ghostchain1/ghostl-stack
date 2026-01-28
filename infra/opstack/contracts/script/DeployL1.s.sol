// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

import "forge-std/Script.sol";
import "@eth-optimism-bedrock/src/L1/L1CrossDomainMessenger.sol";
import "@eth-optimism-bedrock/src/L1/L1StandardBridge.sol";
import "@eth-optimism-bedrock/src/L1/L2OutputOracle.sol";
import "@eth-optimism-bedrock/src/L1/OptimismPortal2.sol";
import "@eth-optimism-bedrock/src/L1/ProtocolVersions.sol";
import "@eth-optimism-bedrock/src/L1/SuperchainConfig.sol";
import "@eth-optimism-bedrock/src/L1/SystemConfig.sol";
import "@eth-optimism-bedrock/src/L1/interfaces/IOptimismPortal.sol";
import "@eth-optimism-bedrock/src/L1/interfaces/IResourceMetering.sol";
import "@eth-optimism-bedrock/src/L1/interfaces/ISystemConfig.sol";
import "@eth-optimism-bedrock/src/L1/interfaces/ISuperchainConfig.sol";
import "@eth-optimism-bedrock/src/dispute/DisputeGameFactory.sol";
import "@eth-optimism-bedrock/src/dispute/interfaces/IDisputeGame.sol";
import "@eth-optimism-bedrock/src/dispute/interfaces/IDisputeGameFactory.sol";
import "@eth-optimism-bedrock/src/dispute/lib/Types.sol";
import "@eth-optimism-bedrock/src/universal/Proxy.sol";
import "@eth-optimism-bedrock/src/universal/ProxyAdmin.sol";
import "@eth-optimism-bedrock/src/universal/interfaces/ICrossDomainMessenger.sol";

/// @notice Minimal placeholder dispute game so the factory has code to point at.
contract DummyFaultDisputeGame is IDisputeGame {
    GameType internal immutable gameTypeValue;

    constructor(GameType _gameType) {
        gameTypeValue = _gameType;
    }

    function initialize() external payable {}

    function createdAt() external view returns (Timestamp) {
        return Timestamp.wrap(0);
    }

    function resolvedAt() external view returns (Timestamp) {
        return Timestamp.wrap(0);
    }

    function status() external view returns (GameStatus) {
        return GameStatus.IN_PROGRESS;
    }

    function gameType() external view returns (GameType gameType_) {
        return gameTypeValue;
    }

    function gameCreator() external pure returns (address creator_) {
        return address(0);
    }

    function rootClaim() external pure returns (Claim rootClaim_) {
        return Claim.wrap(bytes32(0));
    }

    function l1Head() external pure returns (Hash l1Head_) {
        return Hash.wrap(bytes32(0));
    }

    function extraData() external pure returns (bytes memory extraData_) {
        return "";
    }

    function resolve() external returns (GameStatus status_) {
        return GameStatus.IN_PROGRESS;
    }

    function gameData()
        external
        view
        returns (GameType gameType_, Claim rootClaim_, bytes memory extraData_)
    {
        return (gameTypeValue, Claim.wrap(bytes32(0)), "");
    }
}

/// @notice Minimal deploy script to stand up the essential OP Stack L1 suite for a devnet.
/// WARNING: This is a pared-down script; it skips advanced wiring (superchain config, interop, anchors).
/// Adjust params to your network before broadcasting.
contract DeployL1 is Script {
    address internal constant CANONICAL_GAS_TOKEN = 0x5FbDB2315678afecb367f032d93F642f64180aa3;

    struct Deployed {
        ProxyAdmin proxyAdmin;
        Proxy superchainConfigProxy;
        Proxy protocolVersionsProxy;
        Proxy systemConfigProxy;
        Proxy optimismPortalProxy;
        Proxy messengerProxy;
        Proxy standardBridgeProxy;
        Proxy l2OutputOracleProxy;
        Proxy disputeGameFactoryProxy;
        address faultGameImpl;
        address gasToken;
    }

    struct Config {
        address guardian;
        address batcher;
        address batchInbox;
        address sequencer;
        address proposer;
        address challenger;
        uint64 l2GasLimit;
        uint32 basefeeScalar;
        uint32 blobbasefeeScalar;
        uint256 l2BlockTime;
        uint256 l2GenesisTimestamp;
        uint256 l2GenesisBlockNumber;
        uint256 l2ooSubmissionInterval;
        uint256 l2ooFinalizationPeriod;
        uint256 proofMaturityDelay;
        uint256 disputeGameFinalityDelay;
        IResourceMetering.ResourceConfig resourceConfig;
        bool useCustomGasToken;
        address customGasToken;
        string gasTokenName;
        string gasTokenSymbol;
        uint8 gasTokenDecimals;
        uint256 gasTokenInitialSupply;
        address gasTokenRecipient;
    }

    Deployed public deployed;

    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PK");
        address deployer = vm.addr(pk);
        Config memory cfg = _loadConfig(deployer);

        vm.startBroadcast(pk);
        _deployAll(deployer, cfg);
        vm.stopBroadcast();

        _logDeployed(deployer);
    }

    function _loadConfig(address deployer) internal view returns (Config memory cfg) {
        cfg.guardian = vm.envOr("GUARDIAN_ADDRESS", deployer);
        cfg.batcher = vm.envAddress("BATCH_SENDER_ADDRESS");
        cfg.batchInbox = vm.envOr("BATCH_INBOX_ADDRESS", address(0x00289C189bEE4E70334629f04Cd5eD602B6600eB));
        cfg.sequencer = vm.envAddress("SEQUENCER_ADDRESS");
        cfg.proposer = vm.envAddress("PROPOSER_ADDRESS");
        cfg.challenger = vm.envAddress("CHALLENGER_ADDRESS");
        cfg.l2GasLimit = uint64(vm.envOr("L2_GAS_LIMIT", uint256(30_000_000)));
        cfg.basefeeScalar = uint32(vm.envOr("BASEFEE_SCALAR", uint256(1368)));
        cfg.blobbasefeeScalar = uint32(vm.envOr("BLOBBASEFEE_SCALAR", uint256(801949)));
        cfg.l2BlockTime = vm.envOr("L2_BLOCK_TIME", uint256(2));
        cfg.l2GenesisTimestamp = vm.envOr("L2_GENESIS_TIMESTAMP", block.timestamp);
        cfg.l2GenesisBlockNumber = vm.envOr("L2_GENESIS_BLOCK_NUMBER", uint256(0));
        cfg.l2ooSubmissionInterval = vm.envOr("L2OO_SUBMISSION_INTERVAL", uint256(120));
        cfg.l2ooFinalizationPeriod = vm.envOr("L2OO_FINALIZATION_PERIOD", uint256(2));
        cfg.proofMaturityDelay = vm.envOr("PORTAL_PROOF_MATURITY_DELAY", uint256(0));
        cfg.disputeGameFinalityDelay = vm.envOr("PORTAL_DISPUTE_GAME_FINALITY_DELAY", uint256(0));
        cfg.useCustomGasToken = vm.envOr("USE_CUSTOM_GAS_TOKEN", true);
        cfg.customGasToken = vm.envOr("CUSTOM_GAS_TOKEN_ADDRESS", CANONICAL_GAS_TOKEN);
        cfg.gasTokenName = vm.envOr("GAS_TOKEN_NAME", string("Ghost Token (L1)"));
        cfg.gasTokenSymbol = vm.envOr("GAS_TOKEN_SYMBOL", string("GHOST"));
        cfg.gasTokenDecimals = uint8(vm.envOr("GAS_TOKEN_DECIMALS", uint256(18)));
        cfg.gasTokenInitialSupply = vm.envOr("GAS_TOKEN_INITIAL_SUPPLY", uint256(1_000_000_000 ether));
        cfg.gasTokenRecipient = vm.envOr("GAS_TOKEN_RECIPIENT", deployer);
        cfg.resourceConfig = IResourceMetering.ResourceConfig({
            maxResourceLimit: uint32(vm.envOr("RESOURCE_MAX_LIMIT", uint256(20_000_000))),
            elasticityMultiplier: uint8(vm.envOr("RESOURCE_ELASTICITY_MULTIPLIER", uint256(10))),
            baseFeeMaxChangeDenominator: uint8(vm.envOr("RESOURCE_MAX_CHANGE_DENOMINATOR", uint256(8))),
            minimumBaseFee: uint32(vm.envOr("RESOURCE_MINIMUM_BASE_FEE", uint256(1 gwei))),
            systemTxMaxGas: uint32(vm.envOr("SYSTEM_TX_MAX_GAS", uint256(200_000))),
            maximumBaseFee: uint128(vm.envOr("RESOURCE_MAXIMUM_BASE_FEE", uint256(1_000 gwei)))
        });
    }

    function _deployAll(address deployer, Config memory cfg) internal {
        // Proxy admin and proxies
        deployed.proxyAdmin = new ProxyAdmin(deployer);
        deployed.superchainConfigProxy = new Proxy(address(deployed.proxyAdmin));
        deployed.protocolVersionsProxy = new Proxy(address(deployed.proxyAdmin));
        deployed.systemConfigProxy = new Proxy(address(deployed.proxyAdmin));
        deployed.optimismPortalProxy = new Proxy(address(deployed.proxyAdmin));
        deployed.messengerProxy = new Proxy(address(deployed.proxyAdmin));
        deployed.standardBridgeProxy = new Proxy(address(deployed.proxyAdmin));
        deployed.l2OutputOracleProxy = new Proxy(address(deployed.proxyAdmin));
        deployed.disputeGameFactoryProxy = new Proxy(address(deployed.proxyAdmin));

        if (!cfg.useCustomGasToken) {
            revert("canonical gas token required");
        }
        if (cfg.customGasToken != CANONICAL_GAS_TOKEN) {
            revert("non-canonical gas token");
        }
        if (keccak256(bytes(cfg.gasTokenName)) != keccak256(bytes("Ghost Token (L1)"))) {
            revert("GasToken name must be Ghost Token (L1)");
        }
        if (keccak256(bytes(cfg.gasTokenSymbol)) != keccak256(bytes("GHOST"))) {
            revert("GasToken symbol must be GHOST");
        }
        if (cfg.gasTokenDecimals != 18) {
            revert("GasToken decimals must be 18");
        }
        if (cfg.gasTokenInitialSupply != 1_000_000_000 ether) {
            revert("GasToken supply must be 1,000,000,000 GHOST");
        }
        if (cfg.gasTokenRecipient != 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266) {
            revert("GasToken recipient must be canonical deployer");
        }

        address gasTokenAddress = CANONICAL_GAS_TOKEN;
        deployed.gasToken = gasTokenAddress;

        // Initialize SuperchainConfig
        deployed.proxyAdmin.upgradeAndCall(
            payable(address(deployed.superchainConfigProxy)),
            address(new SuperchainConfig()),
            abi.encodeCall(SuperchainConfig.initialize, (cfg.guardian, false))
        );

        // Initialize ProtocolVersions
        deployed.proxyAdmin.upgradeAndCall(
            payable(address(deployed.protocolVersionsProxy)),
            address(new ProtocolVersions()),
            abi.encodeCall(
                ProtocolVersions.initialize,
                (deployer, ProtocolVersion.wrap(uint256(0)), ProtocolVersion.wrap(uint256(0)))
            )
        );

        // Initialize DisputeGameFactory
        deployed.proxyAdmin.upgradeAndCall(
            payable(address(deployed.disputeGameFactoryProxy)),
            address(new DisputeGameFactory()),
            abi.encodeCall(DisputeGameFactory.initialize, (deployer))
        );

        // Initialize OptimismPortal2
        deployed.proxyAdmin.upgradeAndCall(
            payable(address(deployed.optimismPortalProxy)),
            address(new OptimismPortal2(cfg.proofMaturityDelay, cfg.disputeGameFinalityDelay)),
            abi.encodeCall(
                OptimismPortal2.initialize,
                (
                    IDisputeGameFactory(address(deployed.disputeGameFactoryProxy)),
                    ISystemConfig(address(deployed.systemConfigProxy)),
                    ISuperchainConfig(address(deployed.superchainConfigProxy)),
                    GameType.wrap(1)
                )
            )
        );

        // Initialize SystemConfig
        bytes32 batcherHash = bytes32(uint256(uint160(cfg.batcher)));
        SystemConfig.Addresses memory addrs = SystemConfig.Addresses({
            l1CrossDomainMessenger: address(deployed.messengerProxy),
            l1ERC721Bridge: address(0),
            l1StandardBridge: address(deployed.standardBridgeProxy),
            disputeGameFactory: address(deployed.disputeGameFactoryProxy),
            optimismPortal: address(deployed.optimismPortalProxy),
            optimismMintableERC20Factory: address(0),
            gasPayingToken: gasTokenAddress
        });
        deployed.proxyAdmin.upgradeAndCall(
            payable(address(deployed.systemConfigProxy)),
            address(new SystemConfig()),
            abi.encodeCall(
                SystemConfig.initialize,
                (
                    deployer,
                    cfg.basefeeScalar,
                    cfg.blobbasefeeScalar,
                    batcherHash,
                    cfg.l2GasLimit,
                    cfg.sequencer,
                    cfg.resourceConfig,
                    cfg.batchInbox,
                    addrs
                )
            )
        );

        // Initialize L1CrossDomainMessenger
        deployed.proxyAdmin.upgradeAndCall(
            payable(address(deployed.messengerProxy)),
            address(new L1CrossDomainMessenger()),
            abi.encodeCall(
                L1CrossDomainMessenger.initialize,
                (
                    ISuperchainConfig(address(deployed.superchainConfigProxy)),
                    IOptimismPortal(payable(address(deployed.optimismPortalProxy))),
                    ISystemConfig(address(deployed.systemConfigProxy))
                )
            )
        );

        // Initialize L1StandardBridge
        deployed.proxyAdmin.upgradeAndCall(
            payable(address(deployed.standardBridgeProxy)),
            address(new L1StandardBridge()),
            abi.encodeCall(
                L1StandardBridge.initialize,
                (
                    ICrossDomainMessenger(address(deployed.messengerProxy)),
                    ISuperchainConfig(address(deployed.superchainConfigProxy)),
                    ISystemConfig(address(deployed.systemConfigProxy))
                )
            )
        );

        // Initialize L2OutputOracle
        deployed.proxyAdmin.upgradeAndCall(
            payable(address(deployed.l2OutputOracleProxy)),
            address(new L2OutputOracle()),
            abi.encodeCall(
                L2OutputOracle.initialize,
                (
                    cfg.l2ooSubmissionInterval,
                    cfg.l2BlockTime,
                    cfg.l2GenesisBlockNumber,
                    cfg.l2GenesisTimestamp,
                    cfg.proposer,
                    cfg.challenger,
                    cfg.l2ooFinalizationPeriod
                )
            )
        );

        // Install a minimal game impl for the factory.
        GameType gameType = GameType.wrap(1);
        deployed.faultGameImpl = address(new DummyFaultDisputeGame(gameType));
        DisputeGameFactory(address(deployed.disputeGameFactoryProxy)).setImplementation(
            gameType,
            IDisputeGame(deployed.faultGameImpl)
        );
        DisputeGameFactory(address(deployed.disputeGameFactoryProxy)).setInitBond(gameType, 0);
    }

    function _logDeployed(address deployer) internal view {
        console2.log("Deployer", deployer);
        console2.log("ProxyAdmin", address(deployed.proxyAdmin));
        console2.log("SuperchainConfig", address(deployed.superchainConfigProxy));
        console2.log("ProtocolVersions", address(deployed.protocolVersionsProxy));
        console2.log("SystemConfig", address(deployed.systemConfigProxy));
        console2.log("OptimismPortal", address(deployed.optimismPortalProxy));
        console2.log("L1CrossDomainMessenger", address(deployed.messengerProxy));
        console2.log("L1StandardBridge", address(deployed.standardBridgeProxy));
        console2.log("L2OutputOracle", address(deployed.l2OutputOracleProxy));
        console2.log("DisputeGameFactory", address(deployed.disputeGameFactoryProxy));
        console2.log("FaultDisputeGameImpl", deployed.faultGameImpl);
        if (deployed.gasToken != address(0)) {
            console2.log("GasToken", deployed.gasToken);
        }
    }
}
