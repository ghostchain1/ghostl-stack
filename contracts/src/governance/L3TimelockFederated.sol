// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./FederatedTimelock.sol";

contract L3TimelockFederated is FederatedTimelock {
    constructor(address admin, address clearanceAdapter) FederatedTimelock(admin, clearanceAdapter) {}
}
