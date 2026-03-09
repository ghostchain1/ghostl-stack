// GhostChain Contracts v5.6.1 (ghostcain/extensions/GRC20Ghost.sol)
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { GRC20 } from "@ghostchain/contracts/token/GRC20/GRC20.sol";
import { GhostBrand } from "../../src/ghost/GhostBrand.sol";

/// @title GRC20Ghost
/// @notice GhostChain-branded GST token wrapper over the ghostcain GRC20 base.
///         Inherits GhostBrand for canonical GST_UNIT, CANONICAL_GST, and
///         chain-ID constants enforced across GhostStack contracts.
/// @dev Deployed via scripts/deploy_ghostcain.ts on L1 (chain 14000101),
///      L2 (chain 901), or L3 (chain 903) as appropriate.
contract GRC20Ghost is GRC20, GhostBrand {
    constructor(uint256 initialSupply)
        GRC20("Ghost", "GST")
    {
        _mint(msg.sender, initialSupply);
    }
}
