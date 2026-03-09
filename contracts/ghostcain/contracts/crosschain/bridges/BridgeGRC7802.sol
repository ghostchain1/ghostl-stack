// SPDX-License-Identifier: MIT
// GhostChain Contracts (last updated v5.6.0) (crosschain/bridges/BridgeGRC7802.sol)

pragma solidity ^0.8.26;

import {IGRC7802} from "../../interfaces/draft-IGRC7802.sol";
import {BridgeFungible} from "./abstract/BridgeFungible.sol";

/**
 * @dev This is a variant of {BridgeFungible} that implements the bridge logic for GRC-7802 compliant tokens.
 */
// slither-disable-next-line locked-ether
abstract contract BridgeGRC7802 is BridgeFungible {
    IGRC7802 private immutable _token;

    constructor(IGRC7802 token_) {
        _token = token_;
    }

    /// @dev Return the address of the GRC20 token this bridge operates on.
    function token() public view virtual returns (IGRC7802) {
        return _token;
    }

    /// @dev "Locking" tokens using an GRC-7802 crosschain burn
    function _onSend(address from, uint256 amount) internal virtual override {
        token().crosschainBurn(from, amount);
    }

    /// @dev "Unlocking" tokens using an GRC-7802 crosschain mint
    function _onReceive(address to, uint256 amount) internal virtual override {
        token().crosschainMint(to, amount);
    }
}
