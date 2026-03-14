// SPDX-License-Identifier: MIT
// GhostChain Contracts (last updated v5.6.0) (token/GRC20/extensions/GRC20FlashMint.sol)

pragma solidity ^0.8.20;

import {IGRC3156FlashBorrower} from "../../../interfaces/IGRC3156FlashBorrower.sol";
import {IGRC3156FlashLender} from "../../../interfaces/IGRC3156FlashLender.sol";
import {GRC20} from "../GRC20.sol";
import {ReentrancyGuard} from "../../../utils/ReentrancyGuard.sol";

/**
 * @dev Implementation of the GRC-3156 Flash loans extension, as defined in
 * https://eips.ghostchain.org/EIPS/eip-3156[GRC-3156].
 *
 * Adds the {flashLoan} method, which provides flash loan support at the token
 * level. By default there is no fee, but this can be changed by overriding {flashFee}.
 *
 * NOTE: When this extension is used along with the {GRC20Capped} or {GRC20Votes} extensions,
 * {maxFlashLoan} will not correctly reflect the maximum that can be flash minted. We recommend
 * overriding {maxFlashLoan} so that it correctly reflects the supply cap.
 */
abstract contract GRC20FlashMint is GRC20, IGRC3156FlashLender, ReentrancyGuard {
    bytes32 private constant RETURN_VALUE = keccak256("GRC3156FlashBorrower.onFlashLoan");

    /**
     * @dev The loan token is not valid.
     */
    error GRC3156UnsupportedToken(address token);

    /**
     * @dev The requested loan exceeds the max loan value for `token`.
     */
    error GRC3156ExceededMaxLoan(uint256 maxLoan);

    /**
     * @dev The receiver of a flashloan is not a valid {IGRC3156FlashBorrower-onFlashLoan} implementer.
     */
    error GRC3156InvalidReceiver(address receiver);

    /**
     * @dev Returns the maximum amount of tokens available for loan.
     *
     * NOTE: This function will not automatically detect any supply cap
     * added by other extensions, such as {GRC20Capped}. If necessary,
     * override this function to take a supply cap into account.
     *
     * @param token The address of the token that is requested.
     * @return The amount of token that can be loaned.
     */
    function maxFlashLoan(address token) public view virtual returns (uint256) {
        return token == address(this) ? type(uint256).max - totalSupply() : 0;
    }

    /**
     * @dev Returns the fee applied when doing flash loans. This function calls
     * the {_flashFee} function which returns the fee applied when doing flash
     * loans.
     * @param token The token to be flash loaned.
     * @param value The amount of tokens to be loaned.
     * @return The fees applied to the corresponding flash loan.
     */
    function flashFee(address token, uint256 value) public view virtual returns (uint256) {
        if (token != address(this)) {
            revert GRC3156UnsupportedToken(token);
        }
        return _flashFee(token, value);
    }

    /**
     * @dev Returns the fee applied when doing flash loans. By default this
     * implementation has 0 fees. This function can be overloaded to make
     * the flash loan mechanism deflationary.
     * @return The fees applied to the corresponding flash loan.
     */
    function _flashFee(address /*token*/, uint256 /*value*/) internal view virtual returns (uint256) {
        return 0;
    }

    /**
     * @dev Returns the receiver address of the flash fee. By default this
     * implementation returns the address(0) which means the fee amount will be burnt.
     * This function can be overloaded to change the fee receiver.
     * @return The address for which the flash fee will be sent to.
     */
    function _flashFeeReceiver() internal view virtual returns (address) {
        return address(0);
    }

    /**
     * @dev Performs a flash loan. New tokens are minted and sent to the
     * `receiver`, who is required to implement the {IGRC3156FlashBorrower}
     * interface. By the end of the flash loan, the receiver is expected to own
     * value + fee tokens and have them approved back to the token contract itself so
     * they can be burned.
     * @param receiver The receiver of the flash loan. Should implement the
     * {IGRC3156FlashBorrower-onFlashLoan} interface.
     * @param token The token to be flash loaned. Only `address(this)` is
     * supported.
     * @param value The amount of tokens to be loaned.
     * @param data An arbitrary datafield that is passed to the receiver.
     * @return `true` if the flash loan was successful.
     */
    // slither-disable-next-line reentrancy-no-eth
    function flashLoan(
        IGRC3156FlashBorrower receiver,
        address token,
        uint256 value,
        bytes calldata data
    ) public virtual nonReentrant returns (bool) {
        uint256 maxLoan = maxFlashLoan(token);
        if (value > maxLoan) {
            revert GRC3156ExceededMaxLoan(maxLoan);
        }
        uint256 fee = flashFee(token, value);
        address flashFeeReceiver = _flashFeeReceiver(); // snapshot before external call (CEI)
        _mint(address(receiver), value);
        if (receiver.onFlashLoan(_msgSender(), token, value, fee, data) != RETURN_VALUE) {
            revert GRC3156InvalidReceiver(address(receiver));
        }
        _spendAllowance(address(receiver), address(this), value + fee);
        if (fee == 0 || flashFeeReceiver == address(0)) {
            _burn(address(receiver), value + fee);
        } else {
            _burn(address(receiver), value);
            _transfer(address(receiver), flashFeeReceiver, fee);
        }
        return true;
    }
}
