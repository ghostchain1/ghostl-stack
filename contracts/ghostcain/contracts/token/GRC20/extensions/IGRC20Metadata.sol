// SPDX-License-Identifier: MIT
// GhostChain Contracts (last updated v5.4.0) (token/GRC20/extensions/IGRC20Metadata.sol)

pragma solidity >=0.6.2;

import {IGRC20} from "../IGRC20.sol";

/**
 * @dev Interface for the optional metadata functions from the GRC-20 standard.
 */
interface IGRC20Metadata is IGRC20 {
    /**
     * @dev Returns the name of the token.
     */
    function name() external view returns (string memory);

    /**
     * @dev Returns the symbol of the token.
     */
    function symbol() external view returns (string memory);

    /**
     * @dev Returns the decimals places of the token.
     */
    function decimals() external view returns (uint8);
}
