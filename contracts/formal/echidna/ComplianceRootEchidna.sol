// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../../src/compliance/ComplianceRootMirror.sol";

contract ComplianceRootEchidna {
    ComplianceRootMirror private mirror;
    uint256 private lastEpoch;

    constructor() {
        mirror = new ComplianceRootMirror(address(this), address(0));
    }

    function update(uint256 bump) external {
        uint256 nextEpoch = mirror.latestRootEpoch() + (bump % 5) + 1;
        bytes32 rootHash = keccak256(abi.encodePacked(nextEpoch));
        mirror.updateRoot(rootHash, nextEpoch, bytes32(0));
    }

    function echidna_root_epoch_monotonic() public returns (bool) {
        uint256 current = mirror.latestRootEpoch();
        if (current < lastEpoch) {
            return false;
        }
        lastEpoch = current;
        return true;
    }
}
