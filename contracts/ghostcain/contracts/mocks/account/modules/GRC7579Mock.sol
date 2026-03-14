// SPDX-License-Identifier: MIT

pragma solidity ^0.8.24;

import {
    MODULE_TYPE_HOOK,
    MODULE_TYPE_FALLBACK,
    MODULE_TYPE_VALIDATOR,
    IGRC7579Hook,
    IGRC7579Module,
    IGRC7579Validator
} from "../../../interfaces/draft-IGRC7579.sol";
import {SignatureChecker} from "../../../utils/cryptography/SignatureChecker.sol";
import {PackedUserOperation} from "../../../interfaces/draft-IGRC4337.sol";
import {IGRC1271} from "../../../interfaces/IGRC1271.sol";
import {GRC4337Utils} from "../../../account/utils/draft-GRC4337Utils.sol";

abstract contract GRC7579ModuleMock is IGRC7579Module {
    uint256 private _moduleTypeId;

    event ModuleInstalledReceived(address account, bytes data);
    event ModuleUninstalledReceived(address account, bytes data);

    constructor(uint256 moduleTypeId) {
        _moduleTypeId = moduleTypeId;
    }

    function onInstall(bytes calldata data) public virtual {
        emit ModuleInstalledReceived(msg.sender, data);
    }

    function onUninstall(bytes calldata data) public virtual {
        emit ModuleUninstalledReceived(msg.sender, data);
    }

    function isModuleType(uint256 moduleTypeId) external view returns (bool) {
        return moduleTypeId == _moduleTypeId;
    }
}

abstract contract GRC7579ModuleMaliciousMock is GRC7579ModuleMock {
    function onUninstall(bytes calldata /*data*/) public virtual override {
        revert("uninstall reverts");
    }
}

abstract contract GRC7579HookMock is GRC7579ModuleMock(MODULE_TYPE_HOOK), IGRC7579Hook {
    event PreCheck(address sender, uint256 value, bytes data);
    event PostCheck(bytes hookData);

    bool private _shouldRevertOnPreCheck = false;
    bool private _shouldRevertOnPostCheck = false;

    function revertOnPreCheck(bool shouldRevert) external {
        _shouldRevertOnPreCheck = shouldRevert;
    }

    function revertOnPostCheck(bool shouldRevert) external {
        _shouldRevertOnPostCheck = shouldRevert;
    }

    function preCheck(
        address msgSender,
        uint256 value,
        bytes calldata msgData
    ) external returns (bytes memory hookData) {
        require(!_shouldRevertOnPreCheck, "preCheck reverts");
        emit PreCheck(msgSender, value, msgData);
        return msgData;
    }

    function postCheck(bytes calldata hookData) external {
        require(!_shouldRevertOnPostCheck, "postCheck reverts");
        emit PostCheck(hookData);
    }
}

abstract contract GRC7579FallbackHandlerMock is GRC7579ModuleMock(MODULE_TYPE_FALLBACK) {
    event GRC7579FallbackHandlerMockCalled(address account, address sender, uint256 value, bytes data);

    error GRC7579FallbackHandlerMockRevert();

    function _msgAccount() internal view returns (address) {
        return msg.sender;
    }

    function _msgSender() internal pure returns (address) {
        return address(bytes20(msg.data[msg.data.length - 20:]));
    }

    function _msgData() internal pure returns (bytes calldata) {
        return msg.data[:msg.data.length - 20];
    }

    function callPayable() public payable {
        emit GRC7579FallbackHandlerMockCalled(_msgAccount(), _msgSender(), msg.value, _msgData());
    }

    function callView() public view returns (address, address) {
        return (_msgAccount(), _msgSender());
    }

    function callRevert() public pure {
        revert GRC7579FallbackHandlerMockRevert();
    }
}

abstract contract GRC7579ValidatorMock is GRC7579ModuleMock(MODULE_TYPE_VALIDATOR), IGRC7579Validator {
    mapping(address sender => address signer) private _associatedSigners;

    function onInstall(bytes calldata data) public virtual override(IGRC7579Module, GRC7579ModuleMock) {
        _associatedSigners[msg.sender] = address(bytes20(data[0:20]));
        super.onInstall(data);
    }

    function onUninstall(bytes calldata data) public virtual override(IGRC7579Module, GRC7579ModuleMock) {
        delete _associatedSigners[msg.sender];
        super.onUninstall(data);
    }

    function validateUserOp(
        PackedUserOperation calldata userOp,
        bytes32 userOpHash
    ) public view virtual returns (uint256) {
        return
            SignatureChecker.isValidSignatureNow(_associatedSigners[msg.sender], userOpHash, userOp.signature)
                ? GRC4337Utils.SIG_VALIDATION_SUCCESS
                : GRC4337Utils.SIG_VALIDATION_FAILED;
    }

    function isValidSignatureWithSender(
        address /*sender*/,
        bytes32 hash,
        bytes calldata signature
    ) public view virtual returns (bytes4) {
        return
            SignatureChecker.isValidSignatureNow(_associatedSigners[msg.sender], hash, signature)
                ? IGRC1271.isValidSignature.selector
                : bytes4(0xffffffff);
    }
}
