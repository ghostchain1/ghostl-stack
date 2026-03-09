// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./TestBase.sol";
import "../../src/l1/NativeToken.sol";
import "../../src/common/Ownable.sol";

contract FuzzNativeToken is TestBase {
    NativeToken private token;

    function setUp() public {
        token = new NativeToken("Ghost", "GST");
    }

    function testFuzz_transferPreservesSupply(address to, uint256 amount) public {
        vm.assume(to != address(0));
        uint256 supplyBefore = token.totalSupply();
        uint256 balanceBefore = token.balanceOf(address(this));
        uint256 value = balanceBefore == 0 ? 0 : amount % balanceBefore;
        require(token.transfer(to, value), "GST: transfer failed");
        assertEq(token.totalSupply(), supplyBefore, "supply changed");
    }

    function testFuzz_ownerMintBurn(uint256 amount) public {
        uint256 supplyBefore = token.totalSupply();
        token.mint(address(this), amount);
        assertEq(token.totalSupply(), supplyBefore + amount, "mint supply");
        token.burn(address(this), amount);
        assertEq(token.totalSupply(), supplyBefore, "burn supply");
    }

    function testFuzz_nonOwnerCannotMint(address to, uint256 amount) public {
        vm.assume(to != address(0));
        vm.prank(address(0xBEEF));
        vm.expectRevert(abi.encodeWithSelector(Ownable.NotOwner.selector));
        token.mint(to, amount);
    }
}
