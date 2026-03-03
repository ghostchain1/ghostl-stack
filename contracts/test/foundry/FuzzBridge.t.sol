// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./TestBase.sol";
import "../../src/GuardPolicy.sol";
import "../../src/L2L3Bridge.sol";
import "../../src/GhostTokenL2.sol";

contract FuzzBridge is TestBase {
    GuardPolicy private policy;
    L2L3Bridge private bridge;
    GhostTokenL2 private token;

    address private relayer = address(0xB0B);
    address private constant CANONICAL_GAS_TOKEN = 0x5FbDB2315678afecb367f032d93F642f64180aa3;

    function setUp() public {
        policy = new GuardPolicy();
        bridge = new L2L3Bridge(address(policy));
        bridge.setRelayer(relayer);
        bridge.setRequireComplianceRoot(false);
        vm.prank(CANONICAL_GAS_TOKEN);
        token = new GhostTokenL2(0);
        token.approve(address(bridge), type(uint256).max);
    }

    function testFuzz_finalizeRequiresRelayer(address to, uint256 amount, uint256 nonce) public {
        vm.assume(to != address(0));
        bridge.depositToL3(to, amount, nonce);
        vm.prank(address(0xCAFE));
        vm.expectRevert(bytes("not relayer"));
        bridge.finalizeToL3(address(this), to, amount, nonce);
    }

    function testFuzz_replayProtection(address to, uint256 amount, uint256 nonce) public {
        vm.assume(to != address(0));
        bridge.depositToL3(to, amount, nonce);
        vm.prank(relayer);
        bridge.finalizeToL3(address(this), to, amount, nonce);
        vm.prank(relayer);
        vm.expectRevert(bytes("no deposit"));
        bridge.finalizeToL3(address(this), to, amount, nonce);
    }

    function testFuzz_policyPauseBlocks(address to, uint256 amount, uint256 nonce) public {
        vm.assume(to != address(0));
        policy.setMode(GuardPolicy.Mode.PAUSE);
        bridge.depositToL3(to, amount, nonce);
        vm.prank(relayer);
        vm.expectRevert(bytes("blocked by policy"));
        bridge.finalizeToL3(address(this), to, amount, nonce);
    }

    function testFuzz_erc20ReleaseMarksWithdraw(address to, uint256 amount, uint256 nonce) public {
        vm.assume(to != address(0));
        uint256 balance = token.balanceOf(address(this));
        uint256 value = balance == 0 ? 0 : amount % balance;
        token.approve(address(bridge), value);
        bridge.depositERC20ToL3(address(token), to, value, nonce);
        vm.prank(relayer);
        bridge.finalizeERC20ToL3(address(token), address(this), to, value, nonce);
        vm.prank(relayer);
        bridge.releaseERC20FromL3(address(token), address(this), to, value, nonce);
        vm.prank(relayer);
        vm.expectRevert(bytes("already"));
        bridge.releaseERC20FromL3(address(token), address(this), to, value, nonce);
    }
}
