// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./TestBase.sol";
import "../../src/l1/NativeToken.sol";
import "../../src/l1/Treasury.sol";

contract FuzzTreasury is TestBase {
    NativeToken private token;
    Treasury private treasury;
    address private executor = address(0xB0B);
    address private executorV2 = address(0xC0DE);

    function setUp() public payable {
        token = new NativeToken("Ghost", "GST");
        treasury = new Treasury(IGST20Balance(address(token)), executor, executorV2);
        token.mint(address(treasury), 1000e18);
    }

    function test_withdrawLegacyValueDisabled(uint256 amount) public {
        vm.expectRevert(bytes("legacy withdrawal disabled; use withdrawNative"));
        treasury.withdrawLegacyValue(address(this), amount);
    }

    function testFuzz_withdrawNativeReducesBalance(uint256 amount) public {
        uint256 bal = token.balanceOf(address(treasury));
        uint256 value = bal == 0 ? 0 : amount % bal;
        vm.prank(executor);
        treasury.withdrawNative(address(this), value);
        assertEq(token.balanceOf(address(treasury)), bal - value, "native balance mismatch");
    }
}
