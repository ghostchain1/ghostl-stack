// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

import {GRC20Bridgeable} from "../../token/GRC20/extensions/draft-GRC20Bridgeable.sol";

abstract contract GRC20BridgeableMock is GRC20Bridgeable {
    address private _bridge;

    error OnlyTokenBridge();
    event OnlyTokenBridgeFnCalled(address caller);

    constructor(address initialBridge) {
        _setBridge(initialBridge);
    }

    function _setBridge(address bridge) internal {
        _bridge = bridge;
    }

    function onlyTokenBridgeFn() external onlyTokenBridge {
        emit OnlyTokenBridgeFnCalled(msg.sender);
    }

    function _checkTokenBridge(address sender) internal view override {
        if (sender != _bridge) {
            revert OnlyTokenBridge();
        }
    }
}
