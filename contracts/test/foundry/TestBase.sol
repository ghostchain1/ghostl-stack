// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface Vm {
    function prank(address) external;
    function expectRevert() external;
    function expectRevert(bytes4) external;
    function expectRevert(bytes calldata) external;
    function assume(bool) external;
    function warp(uint256) external;
    function sign(uint256, bytes32) external returns (uint8, bytes32, bytes32);
    function addr(uint256) external returns (address);
    function store(address target, bytes32 slot, bytes32 value) external;
    function readFile(string calldata path) external view returns (string memory);
    function mockCall(address target, bytes calldata data, bytes calldata returnData) external;
    function ffi(string[] calldata) external returns (bytes memory);
}

abstract contract TestBase {
    Vm internal constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    receive() external payable {}

    struct FuzzSelector {
        address addr;
        bytes4[] selectors;
    }

    function assertTrue(bool value, string memory message) internal {
        require(value, message);
    }

    function assertEq(uint256 a, uint256 b, string memory message) internal {
        require(a == b, message);
    }

    function assertEq(address a, address b, string memory message) internal {
        require(a == b, message);
    }

    function assertEq(bytes32 a, bytes32 b, string memory message) internal {
        require(a == b, message);
    }

    // Forge invariant hooks (return empty to silence warnings).
    function targetArtifacts() public pure returns (string[] memory) {
        return new string[](0);
    }

    function targetArtifactSelectors() public pure returns (FuzzSelector[] memory) {
        return new FuzzSelector[](0);
    }

    function excludeArtifacts() public pure returns (string[] memory) {
        return new string[](0);
    }

    function targetSenders() public pure returns (address[] memory) {
        return new address[](0);
    }

    function excludeSenders() public pure returns (address[] memory) {
        return new address[](0);
    }

    function targetContracts() public pure returns (address[] memory) {
        return new address[](0);
    }

    function excludeContracts() public pure returns (address[] memory) {
        return new address[](0);
    }

    function targetInterfaces() public pure returns (bytes4[] memory) {
        return new bytes4[](0);
    }

    function targetSelectors() public pure returns (FuzzSelector[] memory) {
        return new FuzzSelector[](0);
    }

    function excludeSelectors() public pure returns (FuzzSelector[] memory) {
        return new FuzzSelector[](0);
    }
}
