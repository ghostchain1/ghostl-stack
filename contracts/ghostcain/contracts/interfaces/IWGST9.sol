// SPDX-License-Identifier: MIT
// GhostChain Contracts (last updated v5.6.0) (interfaces/IWGST9.sol)

pragma solidity ^0.8.24;

import {IGRC20} from "./IGRC20.sol";

/**
 * @dev Interface for {WGST9} — the Wrapped GST (GhostChain native gas token) contract.
 *
 * Extends {IGRC20} with `deposit()` and `withdraw(uint256)` to wrap/unwrap GST on a 1:1 basis.
 *
 * See {WGST9} for the canonical implementation.
 */
interface IWGST9 is IGRC20 {
    /**
     * @dev Emitted when GST is deposited and WGST is minted to `dst`.
     */
    event Deposit(address indexed dst, uint256 wad);

    /**
     * @dev Emitted when WGST is burned and GST is withdrawn to `src`.
     */
    event Withdrawal(address indexed src, uint256 wad);

    /**
     * @dev Deposit `msg.value` GST; mints an equal amount of WGST to the caller.
     */
    function deposit() external payable;

    /**
     * @dev Burn `wad` WGST from the caller and return an equal amount of GST.
     */
    function withdraw(uint256 wad) external;
}
