// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AILayerGuardian} from "../ai/AILayerGuardian.sol";

/// @notice AI guardian for GhostChain L1.
contract AIGuardianL1 is AILayerGuardian {
    constructor() AILayerGuardian(L1) {}
}
