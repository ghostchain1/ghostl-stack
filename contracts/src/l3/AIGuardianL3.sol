// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AILayerGuardian} from "../ai/AILayerGuardian.sol";

/// @notice AI guardian for Ghost L3.
contract AIGuardianL3 is AILayerGuardian {
    constructor() AILayerGuardian(L3) {}
}
