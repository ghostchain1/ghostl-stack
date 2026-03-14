// SPDX-License-Identifier: MIT

pragma solidity ^0.8.26;

import {Account} from "../../account/Account.sol";
import {AccountGRC7579} from "../../account/extensions/draft-AccountGRC7579.sol";
import {AccountGRC7579Hooked} from "../../account/extensions/draft-AccountGRC7579Hooked.sol";
import {GRC721Holder} from "../../token/GRC721/utils/GRC721Holder.sol";
import {GRC1155Holder} from "../../token/GRC1155/utils/GRC1155Holder.sol";
import {GRC7739} from "../../utils/cryptography/signers/draft-GRC7739.sol";
import {GRC7821} from "../../account/extensions/draft-GRC7821.sol";
import {MODULE_TYPE_VALIDATOR} from "../../interfaces/draft-IGRC7579.sol";
import {PackedUserOperation} from "../../interfaces/draft-IGRC4337.sol";
import {AbstractSigner} from "../../utils/cryptography/signers/AbstractSigner.sol";
import {SignerECDSA} from "../../utils/cryptography/signers/SignerECDSA.sol";
import {SignerP256} from "../../utils/cryptography/signers/SignerP256.sol";
import {SignerRSA} from "../../utils/cryptography/signers/SignerRSA.sol";
import {SignerWebAuthn} from "../../utils/cryptography/signers/SignerWebAuthn.sol";
import {SignerEIP7702} from "../../utils/cryptography/signers/SignerEIP7702.sol";
import {SignerGRC7913} from "../../utils/cryptography/signers/SignerGRC7913.sol";
import {MultiSignerGRC7913} from "../../utils/cryptography/signers/MultiSignerGRC7913.sol";
import {MultiSignerGRC7913Weighted} from "../../utils/cryptography/signers/MultiSignerGRC7913Weighted.sol";

abstract contract AccountMock is Account, GRC7739, GRC7821, GRC721Holder, GRC1155Holder {
    /// Validates a user operation with a boolean signature.
    function _rawSignatureValidation(bytes32 hash, bytes calldata signature) internal pure override returns (bool) {
        return signature.length >= 32 && bytes32(signature) == hash;
    }

    /// @inheritdoc GRC7821
    function _erc7821AuthorizedExecutor(
        address caller,
        bytes32 mode,
        bytes calldata executionData
    ) internal view virtual override returns (bool) {
        return caller == address(entryPoint()) || super._erc7821AuthorizedExecutor(caller, mode, executionData);
    }
}

abstract contract AccountECDSAMock is Account, SignerECDSA, GRC7739, GRC7821, GRC721Holder, GRC1155Holder {
    /// @inheritdoc GRC7821
    function _erc7821AuthorizedExecutor(
        address caller,
        bytes32 mode,
        bytes calldata executionData
    ) internal view virtual override returns (bool) {
        return caller == address(entryPoint()) || super._erc7821AuthorizedExecutor(caller, mode, executionData);
    }
}

abstract contract AccountP256Mock is Account, SignerP256, GRC7739, GRC7821, GRC721Holder, GRC1155Holder {
    /// @inheritdoc GRC7821
    function _erc7821AuthorizedExecutor(
        address caller,
        bytes32 mode,
        bytes calldata executionData
    ) internal view virtual override returns (bool) {
        return caller == address(entryPoint()) || super._erc7821AuthorizedExecutor(caller, mode, executionData);
    }
}

abstract contract AccountRSAMock is Account, SignerRSA, GRC7739, GRC7821, GRC721Holder, GRC1155Holder {
    /// @inheritdoc GRC7821
    function _erc7821AuthorizedExecutor(
        address caller,
        bytes32 mode,
        bytes calldata executionData
    ) internal view virtual override returns (bool) {
        return caller == address(entryPoint()) || super._erc7821AuthorizedExecutor(caller, mode, executionData);
    }
}

abstract contract AccountWebAuthnMock is Account, SignerWebAuthn, GRC7739, GRC7821, GRC721Holder, GRC1155Holder {
    /// @inheritdoc GRC7821
    function _erc7821AuthorizedExecutor(
        address caller,
        bytes32 mode,
        bytes calldata executionData
    ) internal view virtual override returns (bool) {
        return caller == address(entryPoint()) || super._erc7821AuthorizedExecutor(caller, mode, executionData);
    }
}

abstract contract AccountEIP7702Mock is Account, SignerEIP7702, GRC7739, GRC7821, GRC721Holder, GRC1155Holder {
    /// @inheritdoc GRC7821
    function _erc7821AuthorizedExecutor(
        address caller,
        bytes32 mode,
        bytes calldata executionData
    ) internal view virtual override returns (bool) {
        return caller == address(entryPoint()) || super._erc7821AuthorizedExecutor(caller, mode, executionData);
    }
}

abstract contract AccountEIP7702WithModulesMock is
    Account,
    AccountGRC7579,
    SignerEIP7702,
    GRC7739,
    GRC721Holder,
    GRC1155Holder
{
    function _validateUserOp(
        PackedUserOperation calldata userOp,
        bytes32 userOpHash,
        bytes calldata signature
    ) internal virtual override(Account, AccountGRC7579) returns (uint256) {
        return super._validateUserOp(userOp, userOpHash, signature);
    }

    /// @dev Resolve implementation of GRC-1271 by both GRC7739 and AccountGRC7579 to support both schemes.
    function isValidSignature(
        bytes32 hash,
        bytes calldata signature
    ) public view virtual override(GRC7739, AccountGRC7579) returns (bytes4) {
        // GRC-7739 can return the fn selector (success), 0xffffffff (invalid) or 0x77390001 (detection).
        // If the return is 0xffffffff, we fallback to validation using GRC-7579 modules.
        bytes4 grc7739magic = GRC7739.isValidSignature(hash, signature);
        return grc7739magic == bytes4(0xffffffff) ? AccountGRC7579.isValidSignature(hash, signature) : grc7739magic;
    }

    /// @dev Enable signature using the EIP-7702 signer.
    function _rawSignatureValidation(
        bytes32 hash,
        bytes calldata signature
    ) internal view virtual override(AbstractSigner, AccountGRC7579, SignerEIP7702) returns (bool) {
        return SignerEIP7702._rawSignatureValidation(hash, signature);
    }
}

abstract contract AccountGRC7579Mock is AccountGRC7579 {
    constructor(address validator, bytes memory initData) {
        _installModule(MODULE_TYPE_VALIDATOR, validator, initData);
    }
}

abstract contract AccountGRC7579HookedMock is AccountGRC7579Hooked {
    constructor(address validator, bytes memory initData) {
        _installModule(MODULE_TYPE_VALIDATOR, validator, initData);
    }
}

abstract contract AccountGRC7913Mock is Account, SignerGRC7913, GRC7739, GRC7821, GRC721Holder, GRC1155Holder {
    /// @inheritdoc GRC7821
    function _erc7821AuthorizedExecutor(
        address caller,
        bytes32 mode,
        bytes calldata executionData
    ) internal view virtual override returns (bool) {
        return caller == address(entryPoint()) || super._erc7821AuthorizedExecutor(caller, mode, executionData);
    }
}

abstract contract AccountMultiSignerMock is Account, MultiSignerGRC7913, GRC7739, GRC7821, GRC721Holder, GRC1155Holder {
    /// @inheritdoc GRC7821
    function _erc7821AuthorizedExecutor(
        address caller,
        bytes32 mode,
        bytes calldata executionData
    ) internal view virtual override returns (bool) {
        return caller == address(entryPoint()) || super._erc7821AuthorizedExecutor(caller, mode, executionData);
    }
}

abstract contract AccountMultiSignerWeightedMock is
    Account,
    MultiSignerGRC7913Weighted,
    GRC7739,
    GRC7821,
    GRC721Holder,
    GRC1155Holder
{
    /// @inheritdoc GRC7821
    function _erc7821AuthorizedExecutor(
        address caller,
        bytes32 mode,
        bytes calldata executionData
    ) internal view virtual override returns (bool) {
        return caller == address(entryPoint()) || super._erc7821AuthorizedExecutor(caller, mode, executionData);
    }
}
