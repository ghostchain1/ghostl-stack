// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./TestBase.sol";
import "../../src/econ/GhostEconomicEngine.sol";

contract GhostEconomicFlywheelTest is TestBase {
    address private constant GOVERNOR = address(0xA11CE);
    address private constant TIMELOCK = address(0xB0B);

    address private constant L3_APP = address(0x3101);
    address private constant L2_EXCHANGE = address(0x3201);
    address private constant INCENTIVES = address(0x3301);

    MainnetActivationGate private gate;
    SupplyAndFlowOracle private oracle;
    L1TreasuryReceiver private l1;
    L2FeeRouter private l2;
    L3FeeRouter private l3;
    RiskPolicyRegistry private risk;
    TreasuryVault private vault;
    DistributionModule private dist;
    YieldStrategyRegistry private strategies;
    AllocationScheduler private scheduler;
    MockExternalYield private mockYield;

    function setUp() public {
        gate = new MainnetActivationGate(GOVERNOR, TIMELOCK);
        oracle = new SupplyAndFlowOracle(GOVERNOR, TIMELOCK);
        l1 = new L1TreasuryReceiver(GOVERNOR, TIMELOCK, block.chainid);
        l2 = new L2FeeRouter(GOVERNOR, TIMELOCK, block.chainid, address(l1));
        l3 = new L3FeeRouter(GOVERNOR, TIMELOCK, block.chainid, address(l2));

        risk = new RiskPolicyRegistry(GOVERNOR, TIMELOCK);
        vault = new TreasuryVault(GOVERNOR, TIMELOCK);
        dist = new DistributionModule(GOVERNOR, TIMELOCK, address(vault));

        strategies = new YieldStrategyRegistry(GOVERNOR, TIMELOCK);
        scheduler = new AllocationScheduler(GOVERNOR, TIMELOCK, address(vault), address(strategies), address(gate), 1);
        mockYield = new MockExternalYield(GOVERNOR, TIMELOCK, 500);

        vm.prank(GOVERNOR);
        l1.setL2FeeRouter(address(l2));

        vm.prank(GOVERNOR);
        l2.setL3FeeRouter(address(l3));

        vm.prank(GOVERNOR);
        l2.setL2Collector(L2_EXCHANGE, true);

        vm.prank(GOVERNOR);
        l3.setL3Collector(L3_APP, true);

        vm.prank(GOVERNOR);
        l2.setSupplyAndFlowOracle(address(oracle));

        vm.prank(GOVERNOR);
        oracle.setReporter(address(l2), true);

        vm.prank(GOVERNOR);
        vault.setRiskPolicyRegistry(address(risk));

        vm.prank(GOVERNOR);
        risk.setAllocationReporter(address(vault), true);

        vm.prank(GOVERNOR);
        vault.setDistributionModule(address(dist));

        vm.prank(GOVERNOR);
        vault.setAllocationScheduler(address(scheduler));

        vm.prank(GOVERNOR);
        vault.setL1TreasuryReceiver(address(this));

        vm.prank(GOVERNOR);
        vault.setSupplyAndFlowOracle(address(oracle));

        vm.prank(GOVERNOR);
        oracle.setReporter(address(vault), true);

        vm.prank(GOVERNOR);
        risk.setStrategyPolicy(address(mockYield), true, 4_000, true, 0);

        vm.prank(GOVERNOR);
        strategies.setStrategy(address(mockYield), true, true, 8_000, keccak256("mock"), "ipfs://mock");
    }

    function testFlywheelEndToEnd() public {
        bytes32 routeRef = keccak256("route-1");

        vm.prank(L3_APP);
        l3.captureFees(700_000, keccak256("l3-fees"));

        vm.prank(L2_EXCHANGE);
        l2.recordL2Fees(300_000, keccak256("l2-fees"));

        vm.prank(GOVERNOR);
        l3.forwardToL2(700_000, routeRef);

        vm.prank(GOVERNOR);
        l2.forwardToL1(1_000_000, routeRef);

        // treasury intake (simulated receiver callback in tests)
        vault.depositFromL1Router(1_000_000, routeRef);

        vm.prank(GOVERNOR);
        gate.setMainnetExecutionEnabled(true, keccak256("gov-activate"));

        bytes32 allocationId = keccak256("alloc-1");
        vm.prank(GOVERNOR);
        scheduler.queueAllocation(allocationId, address(mockYield), 300_000, true, keccak256("gov-alloc"), 7000);

        vm.warp(block.timestamp + 2);
        scheduler.executeAllocation(allocationId);

        // mock external strategy lifecycle
        mockYield.deposit(300_000);
        (uint256 principalOut, uint256 yieldOut) = mockYield.withdraw(300_000);

        vm.prank(GOVERNOR);
        vault.reportStrategyReturn(address(mockYield), principalOut, yieldOut, keccak256("yield-return"));

        vm.prank(GOVERNOR);
        dist.distributeTo(INCENTIVES, 100_000, keccak256("gov-distribute"));

        assertEq(oracle.totalL3ToL2Wei(), 700_000, "l3->l2 mismatch");
        assertEq(oracle.totalL2ToL1Wei(), 1_000_000, "l2->l1 mismatch");
        assertEq(oracle.totalL1ExternalAllocatedWei(), 300_000, "external alloc mismatch");
        assertEq(oracle.totalL1YieldReturnedWei(), 15_000, "yield return mismatch");
        assertEq(oracle.totalL1DistributedWei(), 100_000, "distribution mismatch");
    }

    function testSchedulerBlockedWhenMainnetGateClosed() public {
        bytes32 allocationId = keccak256("alloc-closed-gate");

        vm.prank(GOVERNOR);
        scheduler.queueAllocation(allocationId, address(mockYield), 100_000, true, keccak256("gov-ref"), 6000);

        vm.warp(block.timestamp + 2);
        vm.expectRevert(bytes("mainnet_gate_closed"));
        scheduler.executeAllocation(allocationId);
    }
}
