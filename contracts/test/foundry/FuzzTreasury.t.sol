// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./TestBase.sol";
import "../../src/l1/NativeToken.sol";
import "../../src/l1/Treasury.sol";

contract FuzzTreasury is TestBase {
    NativeToken private token;
    Treasury private treasury;

    function setUp() public payable {
        token = new NativeToken("Ghost", "GHOST");
        treasury = new Treasury(token);
        payable(address(treasury)).transfer(10 ether);
        token.mint(address(treasury), 1000 ether);
    }

    function testFuzz_onlyOwnerWithdrawETH(uint256 amount) public {
        vm.prank(address(0xBEEF));
        vm.expectRevert(bytes("not owner"));
        treasury.withdrawETH(payable(address(0xBEEF)), amount);
    }

    function testFuzz_withdrawETHReducesBalance(uint256 amount) public {
        uint256 bal = address(treasury).balance;
        uint256 value = bal == 0 ? 0 : amount % bal;
        treasury.withdrawETH(payable(address(this)), value);
        assertEq(address(treasury).balance, bal - value, "eth balance mismatch");
    }
}
