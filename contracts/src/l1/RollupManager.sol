// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../common/Ownable.sol";
import "./L2OutputOracle.sol";
import "./Portal.sol";
import "./Messenger.sol";
import "./SystemConfig.sol";

/// @notice Thin facade to keep core rollup contract addresses in one place.
contract RollupManager is Ownable {
    L2OutputOracle public l2oo;
    Portal public portal;
    Messenger public messenger;
    SystemConfig public systemConfig;

    event RollupSet(address l2oo, address portal, address messenger, address systemConfig);

    constructor(L2OutputOracle _l2oo, Portal _portal, Messenger _messenger, SystemConfig _systemConfig) {
        l2oo = _l2oo;
        portal = _portal;
        messenger = _messenger;
        systemConfig = _systemConfig;
        emit RollupSet(address(_l2oo), address(_portal), address(_messenger), address(_systemConfig));
    }

    function setAddresses(L2OutputOracle _l2oo, Portal _portal, Messenger _messenger, SystemConfig _systemConfig)
        external
        onlyOwner
    {
        l2oo = _l2oo;
        portal = _portal;
        messenger = _messenger;
        systemConfig = _systemConfig;
        emit RollupSet(address(_l2oo), address(_portal), address(_messenger), address(_systemConfig));
    }
}
