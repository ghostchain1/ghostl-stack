// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AILayerGuardian} from "../ai/AILayerGuardian.sol";

/// @notice AI guardian for Ghost L2.
contract AIGuardianL2 is AILayerGuardian {
    constructor() AILayerGuardian(L2) {}
}
