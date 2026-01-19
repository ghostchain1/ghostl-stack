// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../../src/GuardPolicy.sol";
import "../../src/L2L3Bridge.sol";
import "../../src/GhostTokenL2.sol";

contract BridgeEchidna {
    GuardPolicy private policy;
    L2L3Bridge private bridge;
    GhostTokenL2 private token;

    constructor() {
        policy = new GuardPolicy();
        bridge = new L2L3Bridge(address(policy));
        token = new GhostTokenL2();
        token.approve(address(bridge), type(uint256).max);
    }

    function echidna_replay_protection() public returns (bool) {
        bridge.depositToL3(address(this), 1 ether, 1);
        bridge.finalizeToL3(address(this), address(this), 1 ether, 1);
        try bridge.finalizeToL3(address(this), address(this), 1 ether, 1) {
            return false;
        } catch {
            return true;
        }
    }
}
