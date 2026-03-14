// SPDX-License-Identifier: MIT
// GhostChain Contracts (last updated v5.0.0) (token/GRC20/extensions/GRC20Burnable.sol)

pragma solidity ^0.8.20;

import {GRC20} from "../GRC20.sol";
import {Context} from "../../../utils/Context.sol";

/**
 * @dev Extension of {GRC20} that allows token holders to destroy both their own
 * tokens and those that they have an allowance for, in a way that can be
 * recognized off-chain (via event analysis).
 */
abstract contract GRC20Burnable is Context, GRC20 {
    /**
     * @dev Destroys a `value` amount of tokens from the caller.
     *
     * See {GRC20-_burn}.
     */
    function burn(uint256 value) public virtual {
        _burn(_msgSender(), value);
    }

    /**
     * @dev Destroys a `value` amount of tokens from `account`, deducting from
     * the caller's allowance.
     *
     * See {GRC20-_burn} and {GRC20-allowance}.
     *
     * Requirements:
     *
     * - the caller must have allowance for ``accounts``'s tokens of at least
     * `value`.
     */
    function burnFrom(address account, uint256 value) public virtual {
        _spendAllowance(account, _msgSender(), value);
        _burn(account, value);
    }
}
