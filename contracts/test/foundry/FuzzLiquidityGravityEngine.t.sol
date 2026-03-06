// SPDX-License-Identifier: MIT
// @ghostchain Part of the GhostChain protocol suite — https://ghostchain.io

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

contract FuzzLiquidityGravityEngine is TestBase {
    address private constant GOVERNOR = address(0xB0B);
    address private constant TIMELOCK = address(0xBEEF);
    address private constant OPERATOR = address(0x1111);
    address private constant DEPOSITOR = address(0x2222);
    address private constant FEE_RECEIVER = address(0x6666);

    uint256 private constant ADAPTER_ID = 1;
    uint256 private constant EXT_CHAIN_ID = 137;
    bytes32 private constant STRATEGY_ID = keccak256("lge.strategy.mock");

    function testFuzz_DeployRespectsCaps(uint256 amount) public {
        vm.assume(amount > 0);
        vm.assume(amount <= 100e18);

        TestERC20 token = new TestERC20("USD Stable", "USD", 18);
        PolicyRegistry policyRegistry = new PolicyRegistry(GOVERNOR, TIMELOCK, keccak256("constitution"));
        AdapterRegistry adapterRegistry = new AdapterRegistry(GOVERNOR, TIMELOCK);
        CircuitBreaker breaker = new CircuitBreaker(GOVERNOR, TIMELOCK);
        OperatorBondVault bondVault = new OperatorBondVault(GOVERNOR, TIMELOCK);
        RewardRouter rewardRouter = new RewardRouter(GOVERNOR, TIMELOCK);
        SettlementOracle oracle = new SettlementOracle(GOVERNOR, TIMELOCK, adapterRegistry, breaker, rewardRouter, bondVault);
        LoadBalancerVault vault = new LoadBalancerVault(GOVERNOR, TIMELOCK, adapterRegistry, oracle, breaker, policyRegistry);

        vm.prank(GOVERNOR);
        rewardRouter.setSettlementOracle(address(oracle));

        vm.prank(GOVERNOR);
        breaker.setVault(address(vault));
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

        token.mint(DEPOSITOR, 200e18);
        vm.prank(DEPOSITOR);
        token.approve(address(vault), type(uint256).max);
        vm.prank(DEPOSITOR);
        vault.deposit(address(token), 200e18);

        vm.prank(OPERATOR);
        vault.deployToAdapter(ADAPTER_ID, address(token), amount, STRATEGY_ID);

        assertEq(vault.deployedByAdapterAsset(ADAPTER_ID, address(token)), amount, "deployed recorded");
        assertEq(oracle.principalDeployed(ADAPTER_ID, address(token)), amount, "oracle principal");
    }
}

