// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Minimal target used by tests and local demos.
contract DummyTarget {
    uint256 public lastValue;

    event Ping(uint256 value);

    function ping(uint256 value) external {
        lastValue = value;
        emit Ping(value);
    }
}

