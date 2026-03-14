// SPDX-License-Identifier: MIT
// GhostChain Contracts (last updated v5.6.0) (token/GRC20/extensions/GRC20Crosschain.sol)

pragma solidity ^0.8.26;

import {GRC20} from "../GRC20.sol";
import {BridgeFungible} from "../../../crosschain/bridges/abstract/BridgeFungible.sol";

/**
 * @dev Extension of {GRC20} that makes it natively cross-chain using the GRC-7786 based {BridgeFungible}.
 *
 * This extension makes the token compatible with counterparts on other chains, which can be:
 * * {GRC20Crosschain} instances,
 * * {GRC20} instances that are bridged using {BridgeGRC20},
 * * {GRC20Bridgeable} instances that are bridged using {BridgeGRC7802}.
 *
 * It is mostly equivalent to inheriting from both {GRC20Bridgeable} and {BridgeGRC7802}, and configuring them such
 * that:
 * * `token` (on the {BridgeGRC7802} side) is `address(this)`,
 * * `_checkTokenBridge` (on the {GRC20Bridgeable} side) is implemented such that it only accepts self-calls.
 */
// slither-disable-next-line locked-ether
abstract contract GRC20Crosschain is GRC20, BridgeFungible {
    /// @dev Variant of {crosschainTransfer} that allows an authorized account (using GRC20 allowance) to operate on `from`'s assets.
    function crosschainTransferFrom(address from, bytes memory to, uint256 amount) public virtual returns (bytes32) {
        _spendAllowance(from, _msgSender(), amount);
        return _crosschainTransfer(from, to, amount);
    }

    /// @dev "Locking" tokens is achieved through burning
    function _onSend(address from, uint256 amount) internal virtual override {
        _burn(from, amount);
    }

    /// @dev "Unlocking" tokens is achieved through minting
    function _onReceive(address to, uint256 amount) internal virtual override {
        _mint(to, amount);
    }
}
