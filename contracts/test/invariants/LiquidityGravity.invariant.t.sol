// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "forge-std/StdInvariant.sol";

import "../../src/tokens/TestERC20.sol";
import "../../src/governance/PolicyRegistry.sol";
import "../../src/liquidity/AdapterRegistry.sol";
import "../../src/liquidity/CircuitBreaker.sol";
import "../../src/liquidity/OperatorBondVault.sol";
import "../../src/liquidity/RewardRouter.sol";
import "../../src/liquidity/SettlementOracle.sol";
import "../../src/liquidity/LoadBalancerVault.sol";

contract LiquidityGravityHandler is Test {
    TestERC20 public token;
    AdapterRegistry public adapterRegistry;
    CircuitBreaker public breaker;
    RewardRouter public rewardRouter;
    SettlementOracle public oracle;
    LoadBalancerVault public vault;

    address public depositor;
    address public operator;
    address public settler;

    uint256 public adapterId;
    bytes32 public strategyId;

    uint256 public sequence;
    uint256 public relayerPk1;
    uint256 public relayerPk2;

    constructor(
        TestERC20 token_,
        AdapterRegistry adapterRegistry_,
        CircuitBreaker breaker_,
        RewardRouter rewardRouter_,
        SettlementOracle oracle_,
        LoadBalancerVault vault_,
        address depositor_,
        address operator_,
        address settler_,
        uint256 adapterId_,
        bytes32 strategyId_,
        uint256 relayerPk1_,
        uint256 relayerPk2_
    ) {
        token = token_;
        adapterRegistry = adapterRegistry_;
        breaker = breaker_;
        rewardRouter = rewardRouter_;
        oracle = oracle_;
        vault = vault_;
        depositor = depositor_;
        operator = operator_;
        settler = settler_;
        adapterId = adapterId_;
        strategyId = strategyId_;
        relayerPk1 = relayerPk1_;
        relayerPk2 = relayerPk2_;
    }

    function act_deposit(uint256 amount) external {
        amount = bound(amount, 1e18, 25e18);
        vm.prank(depositor);
        vault.deposit(address(token), amount);
    }

    function act_withdraw(uint256 sharesIn) external {
        uint256 userShares = vault.shareBalance(address(token), depositor);
        if (userShares == 0) return;
        sharesIn = bound(sharesIn, 1, userShares);
        vm.prank(depositor);
        vault.withdraw(address(token), sharesIn, 0);
    }

    function act_deploy(uint256 amount) external {
        amount = bound(amount, 1e18, 10e18);
        vm.prank(operator);
        vault.deployToAdapter(adapterId, address(token), amount, strategyId);
    }

    function act_unwind(uint256 amount) external {
        uint256 deployed = vault.deployedByAdapterAsset(adapterId, address(token));
        if (deployed == 0) return;
        amount = bound(amount, 1e18, deployed);
        vm.prank(operator);
        vault.unwindFromAdapter(adapterId, address(token), amount, strategyId);
    }

    function act_settle(uint256 yieldAmount, uint256 feeAmount, uint64 jumpSeconds) external {
        yieldAmount = bound(yieldAmount, 0, 5e18);
        feeAmount = bound(feeAmount, 0, 1e18);
        if (yieldAmount + feeAmount == 0) return;

        jumpSeconds = uint64(bound(uint256(jumpSeconds), 0, 2 hours));
        vm.warp(block.timestamp + jumpSeconds);

        sequence += 1;
        bytes32 commitment = keccak256(abi.encodePacked(sequence, yieldAmount, feeAmount, block.timestamp));
        uint64 issuedAt = uint64(block.timestamp);
        uint64 validUntil = uint64(block.timestamp + 60);

        bytes32 digest = oracle.digestSettlement(
            adapterId,
            address(token),
            yieldAmount,
            feeAmount,
            commitment,
            sequence,
            issuedAt,
            validUntil
        );

        (uint8 v1, bytes32 r1, bytes32 s1) = vm.sign(relayerPk1, digest);
        (uint8 v2, bytes32 r2, bytes32 s2) = vm.sign(relayerPk2, digest);
        bytes[] memory sigs = new bytes[](2);
        sigs[0] = abi.encodePacked(r1, s1, v1);
        sigs[1] = abi.encodePacked(r2, s2, v2);

        vm.prank(settler);
        oracle.submitSettlement(adapterId, address(token), yieldAmount, feeAmount, commitment, sequence, issuedAt, validUntil, sigs);
    }
}

contract LiquidityGravityInvariantTest is StdInvariant, Test {
    address private constant GOVERNOR = address(0xB0B);
    address private constant TIMELOCK = address(0xBEEF);

    uint256 private constant ADAPTER_ID = 1;
    uint256 private constant EXT_CHAIN_ID = 137;

    address private constant OPERATOR = address(0x1111);
    address private constant DEPOSITOR = address(0x2222);
    address private constant SETTLER = address(0x7777);

    address private constant POL_RECEIVER = address(0x3333);
    address private constant BURN_RECEIVER = address(0x4444);
    address private constant VALIDATOR_RECEIVER = address(0x5555);
    address private constant FEE_RECEIVER = address(0x6666);

    bytes32 private constant STRATEGY_ID = keccak256("lge.strategy.mock");

    TestERC20 private token;
    AdapterRegistry private adapterRegistry;
    CircuitBreaker private breaker;
    OperatorBondVault private bondVault;
    RewardRouter private rewardRouter;
    SettlementOracle private oracle;
    LoadBalancerVault private vault;

    LiquidityGravityHandler private handler;

    function setUp() public {
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
                settlementInterval: 1 days,
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

        vm.prank(GOVERNOR);
        rewardRouter.setSplitDelaySeconds(1);
        vm.prank(GOVERNOR);
        rewardRouter.queueConfig(POL_RECEIVER, BURN_RECEIVER, VALIDATOR_RECEIVER, 5000, 3000, 2000);
        vm.warp(block.timestamp + 1);
        vm.prank(GOVERNOR);
        rewardRouter.activateConfig();

        // Relayers for settlement proofs.
        uint256 pk1 = 0xA11CE;
        uint256 pk2 = 0xB0B0;
        vm.prank(GOVERNOR);
        oracle.setRelayer(vm.addr(pk1), true);
        vm.prank(GOVERNOR);
        oracle.setRelayer(vm.addr(pk2), true);
        vm.prank(GOVERNOR);
        oracle.setMinRelayers(2);

        token.mint(DEPOSITOR, 1_000e18);
        token.mint(SETTLER, 1_000e18);

        vm.prank(DEPOSITOR);
        token.approve(address(vault), type(uint256).max);
        vm.prank(SETTLER);
        token.approve(address(oracle), type(uint256).max);

        handler = new LiquidityGravityHandler(
            token,
            adapterRegistry,
            breaker,
            rewardRouter,
            oracle,
            vault,
            DEPOSITOR,
            OPERATOR,
            SETTLER,
            ADAPTER_ID,
            STRATEGY_ID,
            pk1,
            pk2
        );

        targetContract(address(handler));
    }

    function invariant_rewardRouterSplitsSumToBpsDenom() public view {
        uint256 sum = uint256(rewardRouter.polBps()) + uint256(rewardRouter.burnBps()) + uint256(rewardRouter.validatorBps());
        assertEq(sum, rewardRouter.BPS_DENOM(), "bps sum");
    }

    function invariant_oraclePrincipalMatchesVaultDeployed() public view {
        uint256 v = vault.deployedByAdapterAsset(ADAPTER_ID, address(token));
        uint256 o = oracle.principalDeployed(ADAPTER_ID, address(token));
        assertEq(o, v, "oracle principal != vault deployed");
    }
}

