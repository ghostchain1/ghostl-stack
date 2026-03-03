// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./TestBase.sol";
import "../../src/GhostTokenL2.sol";

contract FuzzGhostToken is TestBase {
    GhostTokenL2 private token;
    address private constant CANONICAL_GAS_TOKEN = 0x5FbDB2315678afecb367f032d93F642f64180aa3;

    function setUp() public {
        vm.prank(CANONICAL_GAS_TOKEN);
        token = new GhostTokenL2(0);
    }

    function testFuzz_transferPreservesSupply(address to, uint256 amount) public {
        if (to == address(0) || to == address(this)) return;
        uint256 balanceBefore = token.balanceOf(address(this));
        uint256 value = balanceBefore == 0 ? 0 : amount % balanceBefore;
        uint256 toBefore = token.balanceOf(to);
        token.transfer(to, value);
        assert(token.totalSupply() == 0);
        assert(token.balanceOf(address(this)) == balanceBefore - value);
        assert(token.balanceOf(to) == toBefore + value);
    }

    function testFuzz_transferZeroAmount(address to) public {
        if (to == address(0)) return;
        uint256 balanceBefore = token.balanceOf(address(this));
        token.transfer(to, 0);
        assert(token.balanceOf(address(this)) == balanceBefore);
        assert(token.totalSupply() == 0);
    }
}
