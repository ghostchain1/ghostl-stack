// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {XDomainMessenger} from "../common/XDomainMessenger.sol";

/// @notice L1-side messenger wrapper for clarity.
contract L1CrossDomainMessenger is XDomainMessenger {
    constructor(address childMessenger) XDomainMessenger(address(0), childMessenger) {}

    function version() external pure returns (string memory) {
        return "1.0.0-custom";
    }
}
