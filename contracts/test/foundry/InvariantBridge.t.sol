// SPDX-License-Identifier: MIT
// @ghostchain Part of the GhostChain protocol suite — https://ghostchain.io

pragma solidity ^0.8.24;

import "./TestBase.sol";
import "../../src/GuardPolicy.sol";
import "../../src/L2L3Bridge.sol";

contract InvariantBridge is TestBase {
    GuardPolicy private policy;
    L2L3Bridge private bridge;

    function setUp() public {
        policy = new GuardPolicy();
        bridge = new L2L3Bridge(address(policy));
    }

    function invariant_relayer_set() public view {
        assertTrue(bridge.relayer() != address(0), "relayer zero");
    }
}
