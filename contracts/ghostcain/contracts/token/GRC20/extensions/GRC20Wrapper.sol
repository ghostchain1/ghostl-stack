// SPDX-License-Identifier: MIT
// GhostChain Contracts (last updated v5.6.0) (token/GRC20/extensions/GRC20Wrapper.sol)

pragma solidity ^0.8.20;

import {IGRC20, IGRC20Metadata, GRC20} from "../GRC20.sol";
import {SafeGRC20} from "../utils/SafeGRC20.sol";

/**
 * @dev Extension of the GRC-20 token contract to support token wrapping.
 *
 * Users can deposit and withdraw "underlying tokens" and receive a matching number of "wrapped tokens". This is useful
 * in conjunction with other modules. For example, combining this wrapping mechanism with {GRC20Votes} will allow the
 * wrapping of an existing "basic" GRC-20 into a governance token.
 *
 * WARNING: Any mechanism in which the underlying token changes the {balanceOf} of an account without an explicit transfer
 * may desynchronize this contract's supply and its underlying balance. Please exercise caution when wrapping tokens that
 * may undercollateralize the wrapper (i.e. wrapper's total supply is higher than its underlying balance). See {_recover}
 * for recovering value accrued to the wrapper.
 */
abstract contract GRC20Wrapper is GRC20 {
    IGRC20 private immutable _underlying;

    /**
     * @dev The underlying token couldn't be wrapped.
     */
    error GRC20InvalidUnderlying(address token);

    constructor(IGRC20 underlyingToken) {
        if (address(underlyingToken) == address(this)) {
            revert GRC20InvalidUnderlying(address(this));
        }
        _underlying = underlyingToken;
    }

    /// @inheritdoc IGRC20Metadata
    function decimals() public view virtual override returns (uint8) {
        try IGRC20Metadata(address(_underlying)).decimals() returns (uint8 value) {
            return value;
        } catch {
            return super.decimals();
        }
    }

    /**
     * @dev Returns the address of the underlying GRC-20 token that is being wrapped.
     */
    function underlying() public view returns (IGRC20) {
        return _underlying;
    }

    /**
     * @dev Allow a user to deposit underlying tokens and mint the corresponding number of wrapped tokens.
     */
    function depositFor(address account, uint256 value) public virtual returns (bool) {
        address sender = _msgSender();
        if (sender == address(this)) {
            revert GRC20InvalidSender(address(this));
        }
        if (account == address(this)) {
            revert GRC20InvalidReceiver(account);
        }
        SafeGRC20.safeTransferFrom(_underlying, sender, address(this), value);
        _mint(account, value);
        return true;
    }

    /**
     * @dev Allow a user to burn a number of wrapped tokens and withdraw the corresponding number of underlying tokens.
     */
    function withdrawTo(address account, uint256 value) public virtual returns (bool) {
        if (account == address(this)) {
            revert GRC20InvalidReceiver(account);
        }
        _burn(_msgSender(), value);
        SafeGRC20.safeTransfer(_underlying, account, value);
        return true;
    }

    /**
     * @dev Mint wrapped token to cover any underlyingTokens that would have been transferred by mistake or acquired from
     * rebasing mechanisms. Internal function that can be exposed with access control if desired.
     */
    function _recover(address account) internal virtual returns (uint256) {
        uint256 value = _underlying.balanceOf(address(this)) - totalSupply();
        _mint(account, value);
        return value;
    }
}
