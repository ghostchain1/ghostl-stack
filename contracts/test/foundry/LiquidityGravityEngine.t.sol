// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./TestBase.sol";
import "../../src/tokens/TestERC20.sol";
import "../../src/governance/PolicyRegistry.sol";
import "../../src/liquidity/AdapterRegistry.sol";
import "../../src/liquidity/CircuitBreaker.sol";
import "../../src/liquidity/OperatorBondVault.sol";
import "../../src/liquidity/RewardRouter.sol";
import "../../src/liquidity/SettlementOracle.sol";
import "../../src/liquidity/LoadBalancerVault.sol";
import "../../src/liquidity/BridgeEscrow.sol";
import "../../src/liquidity/IZkSettlementVerifier.sol";
import "../../src/amm/MinimalAMM.sol";
import "../../src/liquidity/MinimalAmmDexAdapter.sol";
import "../../src/tokens/WrappedNativeToken.sol";
import "../../src/common/XDomainMessenger.sol";
import "../../src/bridge/StandardBridge.sol";

contract LiquidityGravityEngineTest is TestBase {
    address private constant GOVERNOR = address(0xB0B);
    address private constant TIMELOCK = address(0xBEEF);

    uint256 private constant ADAPTER_ID = 1;
    uint256 private constant EXT_CHAIN_ID = 137;
    address private constant OPERATOR = address(0x1111);

    address private constant DEPOSITOR = address(0x2222);
    address private constant POL_RECEIVER = address(0x3333);
    address private constant BURN_RECEIVER = address(0x4444);
    address private constant VALIDATOR_RECEIVER = address(0x5555);
    address private constant FEE_RECEIVER = address(0x6666);
    address private constant SETTLER = address(0x7777);

    bytes32 private constant STRATEGY_ID = keccak256("lge.strategy.mock");

    function _sig(uint256 privKey, bytes32 digest) internal returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(privKey, digest);
        return abi.encodePacked(r, s, v);
    }

    function _deployStack(uint64 settlementInterval)
        internal
        returns (
            TestERC20 token,
            AdapterRegistry adapterRegistry,
            CircuitBreaker breaker,
            OperatorBondVault bondVault,
            RewardRouter rewardRouter,
            SettlementOracle oracle,
            LoadBalancerVault vault
        )
    {
        token = new TestERC20("USD Stable", "USD", 18);

        PolicyRegistry policyRegistry = new PolicyRegistry(GOVERNOR, TIMELOCK, keccak256("constitution"));
        adapterRegistry = new AdapterRegistry(GOVERNOR, TIMELOCK);
        breaker = new CircuitBreaker(GOVERNOR, TIMELOCK);
        bondVault = new OperatorBondVault(GOVERNOR, TIMELOCK);
        rewardRouter = new RewardRouter(GOVERNOR, TIMELOCK);
        oracle = new SettlementOracle(GOVERNOR, TIMELOCK, adapterRegistry, breaker, rewardRouter, bondVault);
        vault = new LoadBalancerVault(GOVERNOR, TIMELOCK, adapterRegistry, oracle, breaker, policyRegistry);

        vm.prank(GOVERNOR);
        rewardRouter.setSettlementOracle(address(oracle));

        vm.prank(GOVERNOR);
        breaker.setVault(address(vault));
        vm.prank(GOVERNOR);
        breaker.setEmergencyPauser(address(oracle), true);

        vm.prank(GOVERNOR);
        oracle.setVault(address(vault));
        vm.prank(GOVERNOR);
        oracle.setFeeReceiver(FEE_RECEIVER);

        vm.prank(GOVERNOR);
        adapterRegistry.configureAdapter(
            ADAPTER_ID,
            AdapterRegistry.AdapterConfig({
                externalChainId: EXT_CHAIN_ID,
                riskTier: 1,
                maxDeployCap: 100e18,
                settlementInterval: settlementInterval,
                proofType: AdapterRegistry.ProofType.ECDSA_ATTESTATION,
                operator: OPERATOR,
                paused: false,
                enabled: true,
                updatedAt: 0
            })
        );

        vm.prank(GOVERNOR);
        vault.configureAsset(
            address(token),
            LoadBalancerVault.AssetConfig({
                supported: true,
                maxTotalDeployed: 200e18,
                depositsEnabled: true,
                withdrawalsEnabled: true
            })
        );
        vm.prank(GOVERNOR);
        vault.setGlobalStrategyAllowed(STRATEGY_ID, true);
    }

    function testDeployCapAndOverdueSettlementBlocksContinuation() public {
        (
            TestERC20 token,
            AdapterRegistry _adapterRegistry,
            CircuitBreaker breaker,
            OperatorBondVault _bondVault,
            RewardRouter _rewardRouter,
            SettlementOracle oracle,
            LoadBalancerVault vault
        ) = _deployStack(1 days);
        _adapterRegistry;
        _bondVault;
        _rewardRouter;

        vm.prank(address(this));
        token.mint(DEPOSITOR, 150e18);
        vm.prank(DEPOSITOR);
        token.approve(address(vault), type(uint256).max);
        vm.prank(DEPOSITOR);
        vault.deposit(address(token), 150e18);

        // Over adapter cap.
        vm.prank(OPERATOR);
        vm.expectRevert(bytes("adapter cap"));
        vault.deployToAdapter(ADAPTER_ID, address(token), 120e18, STRATEGY_ID);

        // Consume within cap.
        vm.prank(OPERATOR);
        vault.deployToAdapter(ADAPTER_ID, address(token), 80e18, STRATEGY_ID);

        (, uint64 dueAt) = oracle.canContinue(ADAPTER_ID);

        assertTrue(breaker.adapterPaused(ADAPTER_ID) == false, "adapter not paused");

        // Warp beyond settlement interval.
        vm.warp(block.timestamp + 1 days + 1);

        vm.prank(OPERATOR);
        vm.expectRevert(abi.encodeWithSelector(SettlementOracle.SettlementOverdueError.selector, ADAPTER_ID, dueAt));
        vault.deployToAdapter(ADAPTER_ID, address(token), 1e18, STRATEGY_ID);

        // Anyone can enforce overdue -> pause adapter.
        oracle.enforceSettlementWindow(ADAPTER_ID);
        assertTrue(breaker.adapterPaused(ADAPTER_ID), "adapter paused on overdue");
    }

    function testBridgeEscrowCustodyLocksPrincipalAndUnwindRequiresFundsReturn() public {
        (
            TestERC20 token,
            AdapterRegistry adapterRegistry,
            CircuitBreaker breaker,
            OperatorBondVault bondVault,
            RewardRouter rewardRouter,
            SettlementOracle oracle,
            LoadBalancerVault vault
        ) = _deployStack(1 days);

        // Bridge escrow + StandardBridge wiring (dev/test).
        BridgeEscrow escrow = new BridgeEscrow(GOVERNOR, TIMELOCK);
        MockParentMessenger parent = new MockParentMessenger();
        XDomainMessenger messenger = new XDomainMessenger(address(parent), address(0));
        address remoteBridge = address(0xAAAA);
        StandardBridge l1Bridge = new StandardBridge(address(messenger), remoteBridge);

        vm.prank(GOVERNOR);
        escrow.setVault(address(vault));
        vm.prank(GOVERNOR);
        escrow.configureBridge(
            ADAPTER_ID,
            BridgeEscrow.BridgeConfig({ bridge: address(l1Bridge), remoteTo: address(0xBBBB), minGasLimit: 150_000, enabled: true })
        );
        vm.prank(GOVERNOR);
        escrow.setRemoteToken(ADAPTER_ID, address(token), address(0xCCCC));

        vm.prank(GOVERNOR);
        vault.setBridgeEscrow(escrow);
        vm.prank(GOVERNOR);
        vault.setAdapterBridgeCustody(ADAPTER_ID, true);

        // Deposit.
        token.mint(DEPOSITOR, 100e18);
        vm.prank(DEPOSITOR);
        token.approve(address(vault), type(uint256).max);
        vm.prank(DEPOSITOR);
        vault.deposit(address(token), 100e18);

        // Deploy using bridge escrow custody. Principal should be escrowed in StandardBridge, not held by operator.
        vm.prank(OPERATOR);
        vault.deployToAdapter(ADAPTER_ID, address(token), 40e18, STRATEGY_ID);

        assertEq(token.balanceOf(OPERATOR), 0, "operator holds no principal");
        assertEq(token.balanceOf(address(escrow)), 0, "escrow has no principal after bridgeOut");
        assertEq(token.balanceOf(address(l1Bridge)), 40e18, "bridge escrow holds principal");

        // Can't use operator unwind when bridge custody is enabled.
        vm.prank(OPERATOR);
        vm.expectRevert(bytes("bridge custody"));
        vault.unwindFromAdapter(ADAPTER_ID, address(token), 10e18, STRATEGY_ID);

        // Simulate bridge finalization sending principal back to escrow, then finalize unwind.
        bytes memory msgData = abi.encodeCall(
            StandardBridge.finalizeBridgeERC20,
            (address(token), address(0xCCCC), address(0xD00D), address(escrow), 15e18, bytes(""), false)
        );
        vm.prank(address(parent));
        messenger.relayMessage(1, remoteBridge, address(l1Bridge), 0, 150_000, msgData);

        assertEq(token.balanceOf(address(escrow)), 15e18, "escrow received returned principal");

        escrow.finalizeUnwind(ADAPTER_ID, address(token), 15e18, STRATEGY_ID);

        (uint256 totalShares, uint256 idle, uint256 deployed) = vault.assetTotals(address(token));
        totalShares;
        assertEq(idle, 75e18, "idle restored after unwind");
        assertEq(deployed, 25e18, "deployed reduced after unwind");
        assertEq(vault.deployedByAdapterAsset(ADAPTER_ID, address(token)), 25e18, "adapter deployed reduced");
        assertEq(oracle.principalDeployed(ADAPTER_ID, address(token)), 25e18, "oracle principal reduced");

        // Still escrowed balance matches remaining deployed.
        assertEq(token.balanceOf(address(l1Bridge)), 25e18, "bridge escrow retains remaining principal");

        breaker;
        bondVault;
        rewardRouter;
        adapterRegistry;
    }

    function testBridgeEscrowCustodySupportsNativeViaWrappedToken() public {
        (
            TestERC20 _token,
            AdapterRegistry adapterRegistry,
            CircuitBreaker breaker,
            OperatorBondVault bondVault,
            RewardRouter rewardRouter,
            SettlementOracle oracle,
            LoadBalancerVault vault
        ) = _deployStack(1 days);
        _token;

        // Enable native asset support.
        vm.prank(GOVERNOR);
        vault.configureAsset(
            address(0),
            LoadBalancerVault.AssetConfig({
                supported: true,
                maxTotalDeployed: 200e18,
                depositsEnabled: true,
                withdrawalsEnabled: true
            })
        );

        // Bridge escrow + StandardBridge wiring (dev/test).
        BridgeEscrow escrow = new BridgeEscrow(GOVERNOR, TIMELOCK);
        WrappedNativeToken wn = new WrappedNativeToken("Wrapped Native", "WNATIVE");
        MockParentMessenger parent = new MockParentMessenger();
        XDomainMessenger messenger = new XDomainMessenger(address(parent), address(0));
        address remoteBridge = address(0xAAAA);
        StandardBridge l1Bridge = new StandardBridge(address(messenger), remoteBridge);

        vm.prank(GOVERNOR);
        escrow.setVault(address(vault));
        vm.prank(GOVERNOR);
        escrow.setWrappedNative(address(wn));
        vm.prank(GOVERNOR);
        escrow.configureBridge(
            ADAPTER_ID,
            BridgeEscrow.BridgeConfig({ bridge: address(l1Bridge), remoteTo: address(0xBBBB), minGasLimit: 150_000, enabled: true })
        );
        vm.prank(GOVERNOR);
        escrow.setRemoteToken(ADAPTER_ID, address(wn), address(0xCCCC));

        vm.prank(GOVERNOR);
        vault.setBridgeEscrow(escrow);
        vm.prank(GOVERNOR);
        vault.setAdapterBridgeCustody(ADAPTER_ID, true);

        // Deposit native.
        vm.deal(DEPOSITOR, 100e18);
        vm.prank(DEPOSITOR);
        vault.deposit{value: 100e18}(address(0), 100e18);

        // Deploy using bridge escrow custody.
        vm.deal(OPERATOR, 0);
        vm.prank(OPERATOR);
        vault.deployToAdapter(ADAPTER_ID, address(0), 40e18, STRATEGY_ID);

        assertEq(OPERATOR.balance, 0, "operator holds no native principal");
        assertEq(address(escrow).balance, 0, "escrow holds no native after wrap");
        assertEq(wn.balanceOf(address(escrow)), 0, "escrow holds no wrapped after bridgeOut");
        assertEq(wn.balanceOf(address(l1Bridge)), 40e18, "bridge escrow holds wrapped principal");

        // Can't use operator unwind when bridge custody is enabled.
        vm.prank(OPERATOR);
        vm.expectRevert(bytes("bridge custody"));
        vault.unwindFromAdapter(ADAPTER_ID, address(0), 10e18, STRATEGY_ID);

        // Simulate bridge finalization sending wrapped principal back to escrow.
        bytes memory msgData = abi.encodeCall(
            StandardBridge.finalizeBridgeERC20,
            (address(wn), address(0xCCCC), address(0xD00D), address(escrow), 15e18, bytes(""), false)
        );
        vm.prank(address(parent));
        messenger.relayMessage(1, remoteBridge, address(l1Bridge), 0, 150_000, msgData);

        assertEq(wn.balanceOf(address(escrow)), 15e18, "escrow received wrapped principal");

        escrow.finalizeUnwindNative(ADAPTER_ID, 15e18, STRATEGY_ID);

        (uint256 totalShares, uint256 idle, uint256 deployed) = vault.assetTotals(address(0));
        totalShares;
        assertEq(idle, 75e18, "idle restored after unwind");
        assertEq(deployed, 25e18, "deployed reduced after unwind");
        assertEq(vault.deployedByAdapterAsset(ADAPTER_ID, address(0)), 25e18, "adapter deployed reduced");
        assertEq(oracle.principalDeployed(ADAPTER_ID, address(0)), 25e18, "oracle principal reduced");

        // Still escrowed wrapped balance matches remaining deployed.
        assertEq(wn.balanceOf(address(l1Bridge)), 25e18, "bridge escrow retains remaining principal");

        breaker;
        bondVault;
        rewardRouter;
        adapterRegistry;
    }

    function testRewardsOnlyEnterViaSettlementOracleAndRewardSplitsTimelocked() public {
        (
            TestERC20 token,
            AdapterRegistry _adapterRegistry,
            CircuitBreaker _breaker,
            OperatorBondVault _bondVault,
            RewardRouter rewardRouter,
            SettlementOracle oracle,
            LoadBalancerVault vault
        ) = _deployStack(1 days);
        _adapterRegistry;
        _breaker;
        _bondVault;

        // RewardRouter cannot be called by non-oracle.
        vm.expectRevert(RewardRouter.Unauthorized.selector);
        rewardRouter.distribute(address(token), 1);

        // Configure reward splits with a timelock.
        vm.prank(GOVERNOR);
        rewardRouter.setSplitDelaySeconds(10);

        vm.prank(GOVERNOR);
        rewardRouter.queueConfig(POL_RECEIVER, BURN_RECEIVER, VALIDATOR_RECEIVER, 5000, 3000, 2000);

        vm.prank(GOVERNOR);
        vm.expectRevert(bytes("not ready"));
        rewardRouter.activateConfig();

        vm.warp(block.timestamp + 10);
        vm.prank(GOVERNOR);
        rewardRouter.activateConfig();

        // Deposit and deploy so settlement gating is in effect.
        vm.prank(address(this));
        token.mint(DEPOSITOR, 100e18);
        vm.prank(DEPOSITOR);
        token.approve(address(vault), type(uint256).max);
        vm.prank(DEPOSITOR);
        vault.deposit(address(token), 100e18);

        vm.prank(OPERATOR);
        vault.deployToAdapter(ADAPTER_ID, address(token), 50e18, STRATEGY_ID);

        // Configure relayers and signatures.
        uint256 pk1 = 0xA11CE;
        uint256 pk2 = 0xB0B0;
        address r1 = vm.addr(pk1);
        address r2 = vm.addr(pk2);

        vm.prank(GOVERNOR);
        oracle.setRelayer(r1, true);
        vm.prank(GOVERNOR);
        oracle.setRelayer(r2, true);
        vm.prank(GOVERNOR);
        oracle.setMinRelayers(2);

        // Settlement funds come from SETTLER; proves no minting occurs in Oracle.
        vm.prank(address(this));
        token.mint(SETTLER, 110e18);
        vm.prank(SETTLER);
        token.approve(address(oracle), type(uint256).max);

        uint256 yieldAmount = 100e18;
        uint256 feeAmount = 10e18;
        bytes32 commitment = keccak256("commitment");
        uint256 sequence = 1;
        uint64 issuedAt = uint64(block.timestamp);
        uint64 validUntil = uint64(block.timestamp + 60);

        bytes32 digest = oracle.digestSettlement(
            ADAPTER_ID,
            address(token),
            yieldAmount,
            feeAmount,
            commitment,
            sequence,
            issuedAt,
            validUntil
        );

        bytes[] memory sigs = new bytes[](2);
        sigs[0] = _sig(pk1, digest);
        sigs[1] = _sig(pk2, digest);

        vm.prank(SETTLER);
        oracle.submitSettlement(
            ADAPTER_ID,
            address(token),
            yieldAmount,
            feeAmount,
            commitment,
            sequence,
            issuedAt,
            validUntil,
            sigs
        );

        assertEq(token.balanceOf(POL_RECEIVER), 50e18, "pol");
        assertEq(token.balanceOf(BURN_RECEIVER), 30e18, "burn");
        assertEq(token.balanceOf(VALIDATOR_RECEIVER), 20e18, "validator");
        assertEq(token.balanceOf(FEE_RECEIVER), 10e18, "fee");
        assertEq(oracle.yieldSettled(ADAPTER_ID, address(token)), yieldAmount, "yield settled recorded");
    }

    function testZkSettlementVerifierModuleAcceptsProofsAndDistributes() public {
        (
            TestERC20 token,
            AdapterRegistry adapterRegistry,
            CircuitBreaker _breaker,
            OperatorBondVault _bondVault,
            RewardRouter rewardRouter,
            SettlementOracle oracle,
            LoadBalancerVault _vault
        ) = _deployStack(1 days);
        _breaker;
        _bondVault;
        _vault;

        // Switch adapter to ZK proof mode.
        vm.prank(GOVERNOR);
        adapterRegistry.configureAdapter(
            ADAPTER_ID,
            AdapterRegistry.AdapterConfig({
                externalChainId: EXT_CHAIN_ID,
                riskTier: 1,
                maxDeployCap: 100e18,
                settlementInterval: 1 days,
                proofType: AdapterRegistry.ProofType.ZK_PROOF,
                operator: OPERATOR,
                paused: false,
                enabled: true,
                updatedAt: 0
            })
        );

        vm.prank(GOVERNOR);
        rewardRouter.setSplitDelaySeconds(1);
        vm.prank(GOVERNOR);
        rewardRouter.queueConfig(POL_RECEIVER, BURN_RECEIVER, VALIDATOR_RECEIVER, 5000, 3000, 2000);
        vm.warp(block.timestamp + 1);
        vm.prank(GOVERNOR);
        rewardRouter.activateConfig();

        MockZkSettlementVerifier verifier = new MockZkSettlementVerifier();
        vm.prank(GOVERNOR);
        oracle.setZkVerifier(ADAPTER_ID, address(verifier));

        token.mint(SETTLER, 110e18);
        vm.prank(SETTLER);
        token.approve(address(oracle), type(uint256).max);

        uint256 yieldAmount = 100e18;
        uint256 feeAmount = 10e18;
        bytes32 commitment = keccak256("commitment");
        uint256 sequence = 1;
        uint64 issuedAt = uint64(block.timestamp);
        uint64 validUntil = uint64(block.timestamp + 60);

        bytes32 digest = oracle.digestSettlement(
            ADAPTER_ID,
            address(token),
            yieldAmount,
            feeAmount,
            commitment,
            sequence,
            issuedAt,
            validUntil
        );
        verifier.allowDigest(digest);

        vm.prank(SETTLER);
        oracle.submitSettlementZk(
            ADAPTER_ID,
            address(token),
            yieldAmount,
            feeAmount,
            commitment,
            sequence,
            issuedAt,
            validUntil,
            hex"01"
        );

        assertEq(token.balanceOf(POL_RECEIVER), 50e18, "pol");
        assertEq(token.balanceOf(BURN_RECEIVER), 30e18, "burn");
        assertEq(token.balanceOf(VALIDATOR_RECEIVER), 20e18, "validator");
        assertEq(token.balanceOf(FEE_RECEIVER), 10e18, "fee");
        assertEq(oracle.yieldSettled(ADAPTER_ID, address(token)), yieldAmount, "yield settled recorded");
    }

    function testDexBuybackAndPolProvisioningExecutesOnChain() public {
        (
            TestERC20 stable,
            AdapterRegistry adapterRegistry,
            CircuitBreaker _breaker,
            OperatorBondVault _bondVault,
            RewardRouter rewardRouter,
            SettlementOracle oracle,
            LoadBalancerVault _vault
        ) = _deployStack(1 days);
        adapterRegistry;
        _breaker;
        _bondVault;
        _vault;

        TestERC20 gas = new TestERC20("Gas Token", "GST", 18);
        MinimalAMM amm = new MinimalAMM(IERC20Minimal(address(stable)), IERC20Minimal(address(gas)));
        MinimalAmmDexAdapter dex = new MinimalAmmDexAdapter(amm);

        // Seed AMM liquidity.
        stable.mint(address(this), 1000e18);
        gas.mint(address(this), 1000e18);
        stable.approve(address(amm), type(uint256).max);
        gas.approve(address(amm), type(uint256).max);
        amm.addLiquidity(1000e18, 1000e18);

        // Configure rewards + DEX module.
        vm.prank(GOVERNOR);
        rewardRouter.setGasToken(address(gas));
        vm.prank(GOVERNOR);
        rewardRouter.setSplitDelaySeconds(1);
        vm.prank(GOVERNOR);
        rewardRouter.queueConfig(POL_RECEIVER, address(0), VALIDATOR_RECEIVER, 5000, 3000, 2000);
        vm.prank(GOVERNOR);
        rewardRouter.queueDexConfig(address(dex), true, 500);

        vm.warp(block.timestamp + 1);
        vm.prank(GOVERNOR);
        rewardRouter.activateConfig();
        vm.prank(GOVERNOR);
        rewardRouter.activateDexConfig();

        // Configure a single relayer for dev settlement.
        uint256 pk1 = 0xA11CE;
        address r1 = vm.addr(pk1);
        vm.prank(GOVERNOR);
        oracle.setRelayer(r1, true);
        vm.prank(GOVERNOR);
        oracle.setMinRelayers(1);

        // Fund SETTLER and submit settlement in `stable`.
        stable.mint(SETTLER, 110e18);
        vm.prank(SETTLER);
        stable.approve(address(oracle), type(uint256).max);

        uint256 yieldAmount = 100e18;
        uint256 feeAmount = 10e18;
        bytes32 commitment = keccak256("commitment");
        uint256 sequence = 1;
        uint64 issuedAt = uint64(block.timestamp);
        uint64 validUntil = uint64(block.timestamp + 60);

        bytes32 digest = oracle.digestSettlement(
            ADAPTER_ID,
            address(stable),
            yieldAmount,
            feeAmount,
            commitment,
            sequence,
            issuedAt,
            validUntil
        );

        bytes[] memory sigs = new bytes[](1);
        sigs[0] = _sig(pk1, digest);

        vm.prank(SETTLER);
        oracle.submitSettlement(
            ADAPTER_ID,
            address(stable),
            yieldAmount,
            feeAmount,
            commitment,
            sequence,
            issuedAt,
            validUntil,
            sigs
        );

        assertEq(stable.balanceOf(VALIDATOR_RECEIVER), 20e18, "validator");
        assertTrue(amm.balanceOf(POL_RECEIVER) > 0, "pol lp minted");
        assertTrue(gas.balanceOf(0x000000000000000000000000000000000000dEaD) > 0, "buyback burned to dead");
        assertEq(stable.balanceOf(FEE_RECEIVER), 10e18, "fee");
    }
}

contract MockParentMessenger is IXDomainMessenger {
    function xDomainMessageSender() external pure returns (address) {
        return address(0);
    }

    function sendMessage(address, bytes calldata, uint32) external pure {}

    function relayMessage(uint256, address, address, uint256, uint32, bytes calldata) external pure {}
}

contract MockZkSettlementVerifier is IZkSettlementVerifier {
    mapping(bytes32 => bool) public allowed;

    function allowDigest(bytes32 digest) external {
        allowed[digest] = true;
    }

    function verifySettlement(bytes32 digest, bytes calldata proof) external view returns (bool) {
        return allowed[digest] && proof.length > 0;
    }
}
