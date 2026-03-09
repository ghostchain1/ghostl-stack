// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../foundry/TestBase.sol";
import { GhostSafeCast as SafeCast } from "../../src/common/GhostSafeCast.sol";
import "../../src/GST20.sol";
import "../../src/treasury/TreasuryVault.sol";
import "../../src/treasury/TreasuryPolicy.sol";
import "../../src/treasury/TreasuryReceipts.sol";
import "../../src/treasury/PolicyViolationGuard.sol";
import "../../src/treasury/TreasuryController.sol";
import "../../src/treasury/TreasuryTypes.sol";
import "../../src/treasury/TreasuryRouter.sol";
import "../../src/treasury/federation/FederationRouter.sol";

interface VmExt {
    function getNonce(address) external returns (uint256);
    function createSelectFork(string calldata) external returns (uint256);
    function ffi(string[] calldata) external returns (bytes memory);
}

contract MockToken is GST20 {
    constructor() GST20("Mock", "MOCK", 18) {}
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract TreasuryInvariantTest is TestBase {
    using SafeCast for uint256;

    MockToken private token;
    TreasuryVault private vault;
    TreasuryPolicy private policy;
    TreasuryReceipts private receipts;
    PolicyViolationGuard private guard;
    TreasuryController private controller;

    address private constant GOVERNOR = address(0xA11CE);
    address private constant recipient = address(0xBEEF);

    function setUp() public {
        VmExt vmExt = VmExt(address(vm));
        uint256 nonce = vmExt.getNonce(address(this));
        address payable predictedVault = payable(_computeCreateAddress(address(this), nonce + 1));

        controller = new TreasuryController(GOVERNOR, address(0), TreasuryVault(predictedVault));
        vault = new TreasuryVault(address(controller));
        policy = new TreasuryPolicy(GOVERNOR, address(0));
        receipts = new TreasuryReceipts(GOVERNOR, address(0));
        guard = new PolicyViolationGuard(GOVERNOR, address(0));

        vm.prank(GOVERNOR);
        policy.configurePolicy(1_000 ether, 5_000 ether, 1 days, 7_500, true);
        vm.prank(GOVERNOR);
        policy.setController(address(controller), true);
        vm.prank(GOVERNOR);
        receipts.setController(address(controller), true);
        vm.prank(GOVERNOR);
        guard.setPolicy(policy);
        vm.prank(GOVERNOR);
        guard.setReceipts(receipts);
        vm.prank(GOVERNOR);
        guard.setController(address(controller));
        vm.prank(GOVERNOR);
        controller.setComponents(policy, guard, receipts, TreasuryRouter(address(0)), FederationRouter(address(0)));

        token = new MockToken();
        token.mint(address(vault), 20_000 ether);
    }

    function targetSenders() public pure override returns (address[] memory senders) {
        // Prevent invariant fuzzing from exercising governance-only setters (which would trivialize invariants).
        senders = new address[](2);
        senders[0] = address(0xB0B);
        senders[1] = address(0xCAFE);
    }

    function invariant_reserve_floor() public view {
        uint256 balance = vault.balanceOf(address(token));
        assertTrue(balance >= policy.minReserve(), "reserve breached");
    }

    function invariant_epoch_budget() public view {
        assertTrue(policy.epochSpent() <= policy.epochBudget(), "budget breached");
    }

    function invariant_no_eoa_control() public view {
        assertTrue(address(controller).code.length > 0, "controller code missing");
        assertTrue(address(policy).code.length > 0, "policy code missing");
        assertTrue(address(guard).code.length > 0, "guard code missing");
        assertTrue(address(receipts).code.length > 0, "receipts code missing");
    }

    function testFuzz_spendWithinBudget(uint256 amount) public {
        uint256 balance = vault.balanceOf(address(token));
        uint256 minReserve = policy.minReserve();
        uint256 available = balance > minReserve ? balance - minReserve : 0;
        uint256 remainingBudget = policy.epochBudget() - policy.epochSpent();

        vm.assume(amount > 0 && amount <= available && amount <= remainingBudget);

        TreasuryTypes.Action memory action = TreasuryTypes.Action({
            actionType: TreasuryTypes.ActionType.TRANSFER,
            asset: address(token),
            target: recipient,
            amount: amount,
            value: 0,
            destinationChainId: block.chainid,
            data: bytes(""),
            metadataHash: keccak256("fuzz"),
            aiProposalHash: bytes32(0),
            aiRiskScoreBps: 0,
            treatyId: bytes32(0)
        });

        vm.prank(GOVERNOR);
        controller.execute(action);
        assertTrue(policy.epochSpent() <= policy.epochBudget(), "budget exceeded");
        assertTrue(vault.balanceOf(address(token)) >= policy.minReserve(), "reserve breached");
    }

    function testFuzz_revertWhenOverBudget(uint256 amount) public {
        uint256 balance = vault.balanceOf(address(token));
        uint256 minReserve = policy.minReserve();
        uint256 available = balance > minReserve ? balance - minReserve : 0;
        uint256 remainingBudget = policy.epochBudget() - policy.epochSpent();
        vm.assume(available > 0 && amount > remainingBudget);

        TreasuryTypes.Action memory action = TreasuryTypes.Action({
            actionType: TreasuryTypes.ActionType.TRANSFER,
            asset: address(token),
            target: recipient,
            amount: amount,
            value: 0,
            destinationChainId: block.chainid,
            data: bytes(""),
            metadataHash: keccak256("fuzz"),
            aiProposalHash: bytes32(0),
            aiRiskScoreBps: 0,
            treatyId: bytes32(0)
        });

        vm.expectRevert();
        vm.prank(GOVERNOR);
        controller.execute(action);
    }

    function testFork_optional() public {
        string memory url = _env("TREASURY_FORK_URL");
        if (bytes(url).length == 0) {
            return;
        }
        VmExt(address(vm)).createSelectFork(url);
        assertTrue(block.number > 0, "fork failed");
    }

    function _env(string memory key) internal returns (string memory) {
        string[] memory cmd = new string[](3);
        cmd[0] = "bash";
        cmd[1] = "-lc";
        cmd[2] = string(abi.encodePacked("echo -n $", key));
        bytes memory out = VmExt(address(vm)).ffi(cmd);
        return string(out);
    }

    function _computeCreateAddress(address deployer, uint256 nonce) internal pure returns (address) {
        if (nonce == 0x00) {
            return address(uint160(uint256(keccak256(abi.encodePacked(hex"d694", deployer, hex"80")))));
        }
        if (nonce <= 0x7f) {
            return address(uint160(uint256(keccak256(abi.encodePacked(hex"d694", deployer, nonce.toUint8())))));
        }
        if (nonce <= 0xff) {
            return address(uint160(uint256(keccak256(abi.encodePacked(hex"d794", deployer, hex"81", nonce.toUint8())))));
        }
        return address(uint160(uint256(keccak256(abi.encodePacked(hex"d894", deployer, hex"82", nonce.toUint16())))));
    }
}
