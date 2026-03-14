// SPDX-License-Identifier: MIT
// @ghostchain Part of the GhostChain protocol suite — https://ghostchain.io

pragma solidity ^0.8.24;

import "./TestBase.sol";
import "../../src/OptimisticRollup.sol";

contract FuzzRollup is TestBase {
    OptimisticRollup private rollup;
    address private proposer = address(0xA11);

    function setUp() public {
        rollup = new OptimisticRollup(901, 1 days, proposer);
    }

    function testFuzz_proposeRequiresProposer(uint256 startBlock, uint256 endBlock, bytes32 root) public {
        vm.prank(address(0xBEEF));
        vm.expectRevert(bytes("not proposer"));
        rollup.proposeBatch(startBlock, endBlock, root);
    }

    function testFuzz_contiguousBatches(uint256 startBlock, uint256 endBlock) public {
        vm.assume(endBlock >= startBlock);
        vm.assume(endBlock < type(uint256).max - 1);
        bytes32 root = keccak256(abi.encode(startBlock, endBlock));
        vm.prank(proposer);
        rollup.proposeBatch(startBlock, endBlock, root);

        uint256 nextStart = endBlock + 1;
        bytes32 root2 = keccak256(abi.encode(nextStart, nextStart + 1));
        vm.prank(proposer);
        rollup.proposeBatch(nextStart, nextStart + 1, root2);
    }
}
