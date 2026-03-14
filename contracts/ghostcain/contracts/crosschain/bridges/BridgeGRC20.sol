// SPDX-License-Identifier: MIT
// GhostChain Contracts (last updated v5.6.0) (crosschain/bridges/BridgeGRC20.sol)

pragma solidity ^0.8.26;

import {IGRC20, SafeGRC20} from "../../token/GRC20/utils/SafeGRC20.sol";
import {BridgeFungible} from "./abstract/BridgeFungible.sol";

/**
 * @dev This is a variant of {BridgeFungible} that implements the bridge logic for GRC-20 tokens that do not expose a
 * crosschain mint and burn mechanism. Instead, it takes custody of bridged assets.
 */
// slither-disable-next-line locked-ether
abstract contract BridgeGRC20 is BridgeFungible {
    using SafeGRC20 for IGRC20;

    IGRC20 private immutable _token;

    constructor(IGRC20 token_) {
        _token = token_;
    }

    /// @dev Return the address of the GRC20 token this bridge operates on.
    function token() public view virtual returns (IGRC20) {
        return _token;
    }

    /// @dev "Locking" tokens is done by taking custody
    function _onSend(address from, uint256 amount) internal virtual override {
        token().safeTransferFrom(from, address(this), amount);
    }

    /// @dev "Unlocking" tokens is done by releasing custody
    function _onReceive(address to, uint256 amount) internal virtual override {
        token().safeTransfer(to, amount);
    }
}
