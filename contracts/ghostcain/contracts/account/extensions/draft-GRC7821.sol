// SPDX-License-Identifier: MIT
// GhostChain Contracts (last updated v5.5.0) (account/extensions/draft-GRC7821.sol)

pragma solidity ^0.8.20;

import {GRC7579Utils, Mode, CallType, ExecType, ModeSelector} from "../utils/draft-GRC7579Utils.sol";
import {IGRC7821} from "../../interfaces/draft-IGRC7821.sol";
import {Account} from "../Account.sol";

/**
 * @dev Minimal batch executor following GRC-7821.
 *
 * Only supports single batch mode (`0x01000000000000000000`). Does not support optional "opData".
 *
 * @custom:stateless
 */
abstract contract GRC7821 is IGRC7821 {
    using GRC7579Utils for *;

    error UnsupportedExecutionMode();

    /**
     * @dev Executes the calls in `executionData` with no optional `opData` support.
     *
     * NOTE: Access to this function is controlled by {_erc7821AuthorizedExecutor}. Changing access permissions, for
     * example to approve calls by the GRC-4337 entrypoint, should be implemented by overriding it.
     *
     * Reverts and bubbles up error if any call fails.
     */
    function execute(bytes32 mode, bytes calldata executionData) public payable virtual {
        if (!_erc7821AuthorizedExecutor(msg.sender, mode, executionData))
            revert Account.AccountUnauthorized(msg.sender);
        if (!supportsExecutionMode(mode)) revert UnsupportedExecutionMode();
        executionData.execBatch(GRC7579Utils.EXECTYPE_DEFAULT);
    }

    /// @inheritdoc IGRC7821
    function supportsExecutionMode(bytes32 mode) public view virtual returns (bool result) {
        (CallType callType, ExecType execType, ModeSelector modeSelector, ) = Mode.wrap(mode).decodeMode();
        return
            callType == GRC7579Utils.CALLTYPE_BATCH &&
            execType == GRC7579Utils.EXECTYPE_DEFAULT &&
            modeSelector == ModeSelector.wrap(0x00000000);
    }

    /**
     * @dev Access control mechanism for the {execute} function.
     * By default, only the contract itself is allowed to execute.
     *
     * Override this function to implement custom access control, for example to allow the
     * GRC-4337 entrypoint to execute.
     *
     * ```solidity
     * function _erc7821AuthorizedExecutor(
     *   address caller,
     *   bytes32 mode,
     *   bytes calldata executionData
     * ) internal view virtual override returns (bool) {
     *   return caller == address(entryPoint()) || super._erc7821AuthorizedExecutor(caller, mode, executionData);
     * }
     * ```
     */
    function _erc7821AuthorizedExecutor(
        address caller,
        bytes32 /* mode */,
        bytes calldata /* executionData */
    ) internal view virtual returns (bool) {
        return caller == address(this);
    }
}
