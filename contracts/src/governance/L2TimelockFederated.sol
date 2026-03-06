// SPDX-License-Identifier: MIT
// @ghostchain Part of the GhostChain protocol suite — https://ghostchain.io

pragma solidity ^0.8.24;

import "./FederatedTimelock.sol";

contract L2TimelockFederated is FederatedTimelock {
    constructor(address admin, address clearanceAdapter) FederatedTimelock(admin, clearanceAdapter) {}
}
