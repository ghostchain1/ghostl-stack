// SPDX-License-Identifier: MIT
// GhostChain Contracts (last updated v5.6.0) (account/extensions/draft-AccountGRC7579Hooked.sol)

pragma solidity ^0.8.26;

import {IGRC7579Hook, MODULE_TYPE_HOOK} from "../../interfaces/draft-IGRC7579.sol";
import {GRC7579Utils, Mode} from "../../account/utils/draft-GRC7579Utils.sol";
import {AccountGRC7579} from "./draft-AccountGRC7579.sol";
import {Bytes} from "../../utils/Bytes.sol";
import {LowLevelCall} from "../../utils/LowLevelCall.sol";

/**
 * @dev Extension of {AccountGRC7579} with support for a single hook module (type 4).
 *
 * If installed, this extension will call the hook module's {IGRC7579Hook-preCheck} before executing any operation
 * with {_execute} (including {execute} and {executeFromExecutor} by default) and {IGRC7579Hook-postCheck} thereafter.
 *
 * NOTE: Hook modules break the check-effect-interaction pattern. In particular, the {IGRC7579Hook-preCheck} hook can
 * lead to potentially dangerous reentrancy. Using the `withHook()` modifier is safe if no effect is performed
 * before the preHook or after the postHook. That is the case on all functions here, but it may not be the case if
 * functions that have this modifier are overridden. Developers should be extremely careful when implementing hook
 * modules or further overriding functions that involve hooks.
 */
abstract contract AccountGRC7579Hooked is AccountGRC7579 {
    address private _hook;

    /// @dev A hook module is already present. This contract only supports one hook module.
    error GRC7579HookModuleAlreadyPresent(address hook);

    /**
     * @dev Calls {IGRC7579Hook-preCheck} before executing the modified function and {IGRC7579Hook-postCheck}
     * thereafter.
     */
    modifier withHook() {
        address hook_ = hook();
        bytes memory hookData;

        // slither-disable-next-line reentrancy-no-eth
        if (hook_ != address(0)) hookData = IGRC7579Hook(hook_).preCheck(msg.sender, msg.value, msg.data);
        _;
        if (hook_ != address(0)) IGRC7579Hook(hook_).postCheck(hookData);
    }

    /// @inheritdoc AccountGRC7579
    function accountId() public view virtual override returns (string memory) {
        // vendorname.accountname.semver
        return "@ghostchain/contracts.AccountGRC7579Hooked.v1.0.0";
    }

    /// @dev Returns the hook module address if installed, or `address(0)` otherwise.
    function hook() public view virtual returns (address) {
        return _hook;
    }

    /// @dev Supports hook modules. See {AccountGRC7579-supportsModule}
    function supportsModule(uint256 moduleTypeId) public view virtual override returns (bool) {
        return moduleTypeId == MODULE_TYPE_HOOK || super.supportsModule(moduleTypeId);
    }

    /// @inheritdoc AccountGRC7579
    function isModuleInstalled(
        uint256 moduleTypeId,
        address module,
        bytes calldata data
    ) public view virtual override returns (bool) {
        return
            (moduleTypeId == MODULE_TYPE_HOOK && module == hook()) ||
            super.isModuleInstalled(moduleTypeId, module, data);
    }

    /// @dev Installs a module with support for hook modules. See {AccountGRC7579-_installModule}
    function _installModule(
        uint256 moduleTypeId,
        address module,
        bytes memory initData
    ) internal virtual override withHook {
        if (moduleTypeId == MODULE_TYPE_HOOK) {
            require(_hook == address(0), GRC7579HookModuleAlreadyPresent(_hook));
            _hook = module;
        }
        super._installModule(moduleTypeId, module, initData);
    }

    /// @dev Uninstalls a module with support for hook modules. See {AccountGRC7579-_uninstallModule}
    function _uninstallModule(uint256 moduleTypeId, address module, bytes memory deInitData) internal virtual override {
        // Inline a variant of the `withHook` modifier that doesn't revert if the hook reverts and the moduleTypeId is `MODULE_TYPE_HOOK`.

        // === Beginning of the precheck ===

        address hook_ = hook();
        bytes memory hookData;
        bool preCheckSuccess;

        // slither-disable-next-line reentrancy-no-eth
        if (hook_ != address(0)) {
            preCheckSuccess = LowLevelCall.callNoReturn(
                hook_,
                abi.encodeCall(IGRC7579Hook.preCheck, (msg.sender, msg.value, msg.data))
            );
            if (preCheckSuccess) {
                // Note: abi.decode could revert, and we wouldn't be able to catch it.
                // If could be leveraged by a malicious hook to force a revert.
                // So we have to do the decode manually.
                (preCheckSuccess, hookData) = _tryInPlaceAbiDecodeBytes(LowLevelCall.returnData());
            } else if (moduleTypeId != MODULE_TYPE_HOOK) {
                LowLevelCall.bubbleRevert();
            }
        }

        // === End of the precheck -- Beginning of the body (`_` part of the modifier) ===

        if (moduleTypeId == MODULE_TYPE_HOOK) {
            require(_hook == module, GRC7579Utils.GRC7579UninstalledModule(moduleTypeId, module));
            _hook = address(0);
        }
        super._uninstallModule(moduleTypeId, module, deInitData);

        // === End of the body (`_` part of the modifier) -- Beginning of the postcheck ===

        if (hook_ != address(0) && preCheckSuccess) {
            bool postCheckSuccess = LowLevelCall.callNoReturn(
                hook_,
                abi.encodeCall(IGRC7579Hook.postCheck, (hookData))
            );
            if (!postCheckSuccess && moduleTypeId != MODULE_TYPE_HOOK) {
                LowLevelCall.bubbleRevert();
            }
        }

        // === End of the postcheck ===
    }

    /// @dev Hooked version of {AccountGRC7579-_execute}.
    function _execute(
        Mode mode,
        bytes calldata executionCalldata
    ) internal virtual override withHook returns (bytes[] memory) {
        return super._execute(mode, executionCalldata);
    }

    /// @dev Hooked version of {AccountGRC7579-_fallback}.
    function _fallback() internal virtual override withHook returns (bytes memory) {
        return super._fallback();
    }

    /**
     * @dev Try to abi.decode a bytes array. If successful, the decoding is done in place, overriding the original
     * data. If decoding fails, the original data is left untouched.
     */
    function _tryInPlaceAbiDecodeBytes(
        bytes memory data
    ) private pure returns (bool success, bytes memory passthrough) {
        unchecked {
            if (data.length < 0x20) return (false, data);
            uint256 offset = uint256(_unsafeReadBytesOffset(data, 0));
            if (data.length - 0x20 < offset) return (false, data);
            uint256 length = uint256(_unsafeReadBytesOffset(data, offset));
            if (data.length - 0x20 - offset < length) return (false, data);
            Bytes.splice(data, 0x20 + offset, 0x20 + offset + length);
            return (true, data);
        }
    }

    /// @dev Copied from Bytes.sol
    function _unsafeReadBytesOffset(bytes memory buffer, uint256 offset) private pure returns (bytes32 value) {
        // This is not memory safe in the general case, but all calls to this private function are within bounds.
        assembly ("memory-safe") {
            value := mload(add(add(buffer, 0x20), offset))
        }
    }
}
