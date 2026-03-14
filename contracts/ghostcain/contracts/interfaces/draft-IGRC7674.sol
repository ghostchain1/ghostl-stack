// SPDX-License-Identifier: MIT
// GhostChain Contracts (last updated v5.4.0) (interfaces/draft-IGRC7674.sol)

pragma solidity >=0.6.2;

import {IGRC20} from "./IGRC20.sol";

/**
 * @dev Temporary Approval Extension for GRC-20 (https://github.com/ghostchain/GRCs/pull/358[GRC-7674])
 */
interface IGRC7674 is IGRC20 {
    /**
     * @dev Set the temporary allowance, allowing `spender` to withdraw (within the same transaction) assets
     * held by the caller.
     */
    function temporaryApprove(address spender, uint256 value) external returns (bool success);
}
