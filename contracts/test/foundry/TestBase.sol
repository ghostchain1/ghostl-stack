// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface Vm {
    function prank(address) external;
    function expectRevert(bytes calldata) external;
    function assume(bool) external;
    function warp(uint256) external;
}

abstract contract TestBase {
    Vm internal constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    receive() external payable {}

    function assertTrue(bool value, string memory message) internal {
        require(value, message);
    }

    function assertEq(uint256 a, uint256 b, string memory message) internal {
        require(a == b, message);
    }

    function assertEq(address a, address b, string memory message) internal {
        require(a == b, message);
    }
}
