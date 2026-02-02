// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../common/Governed.sol";
import "./ComplianceRootMirror.sol";

/// @notice Guards actions by requiring a recent compliance root.
contract ComplianceProofGuard is Governed {
    ComplianceRootMirror public rootMirror;
    uint256 public allowedRootEpochWindow;
    uint256 public requiredRootEpoch;
    bytes32 public requiredRootHash;
    bool public enabled = true;

    event RootMirrorUpdated(address indexed mirror);
    event RootWindowUpdated(uint256 window);
    event RequiredRootUpdated(uint256 indexed epoch, bytes32 indexed rootHash);
    event GuardEnabled(bool enabled);

    constructor(address governor_, address timelock_, ComplianceRootMirror mirror) Governed(governor_, timelock_) {
        rootMirror = mirror;
        emit RootMirrorUpdated(address(mirror));
    }

    function setRootMirror(ComplianceRootMirror mirror) external onlyGovernance {
        rootMirror = mirror;
        emit RootMirrorUpdated(address(mirror));
    }

    function setAllowedRootEpochWindow(uint256 window) external onlyGovernance {
        allowedRootEpochWindow = window;
        emit RootWindowUpdated(window);
    }

    function setRequiredRoot(uint256 epoch, bytes32 rootHash) external onlyGovernance {
        require(epoch != 0, "epoch=0");
        require(rootHash != bytes32(0), "root=0");
        requiredRootEpoch = epoch;
        requiredRootHash = rootHash;
        emit RequiredRootUpdated(epoch, rootHash);
    }

    function setEnabled(bool enabled_) external onlyGovernance {
        enabled = enabled_;
        emit GuardEnabled(enabled_);
    }

    function enforceLatestRoot() external view returns (bool) {
        if (!enabled) return true;
        ComplianceRootMirror mirror = rootMirror;
        require(address(mirror) != address(0), "mirror=0");
        uint256 latestEpoch = mirror.latestRootEpoch();
        require(latestEpoch != 0, "root missing");
        require(requiredRootEpoch != 0, "required root unset");
        bytes32 expected = mirror.rootByEpoch(requiredRootEpoch);
        require(expected == requiredRootHash, "root mismatch");
        if (allowedRootEpochWindow == 0) {
            require(requiredRootEpoch == latestEpoch, "root stale");
        } else {
            require(latestEpoch >= requiredRootEpoch, "root future");
            require(latestEpoch - requiredRootEpoch <= allowedRootEpochWindow, "root window");
        }
        return true;
    }
}
