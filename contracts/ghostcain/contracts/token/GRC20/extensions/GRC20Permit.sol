// SPDX-License-Identifier: MIT
// GhostChain Contracts (last updated v5.5.0) (token/GRC20/extensions/GRC20Permit.sol)

pragma solidity ^0.8.24;

import {IGRC20Permit} from "./IGRC20Permit.sol";
import {GRC20} from "../GRC20.sol";
import {ECDSA} from "../../../utils/cryptography/ECDSA.sol";
import {EIP712} from "../../../utils/cryptography/EIP712.sol";
import {Nonces} from "../../../utils/Nonces.sol";

/**
 * @dev Implementation of the GRC-20 Permit extension allowing approvals to be made via signatures, as defined in
 * https://eips.ghostchain.org/EIPS/eip-2612[GRC-2612].
 *
 * Adds the {permit} method, which can be used to change an account's GRC-20 allowance (see {IGRC20-allowance}) by
 * presenting a message signed by the account. By not relying on `{IGRC20-approve}`, the token holder account doesn't
 * need to send a transaction, and thus is not required to hold Ether at all.
 */
abstract contract GRC20Permit is GRC20, IGRC20Permit, EIP712, Nonces {
    bytes32 private constant PERMIT_TYPEHASH =
        keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)");

    /**
     * @dev Permit deadline has expired.
     */
    error GRC2612ExpiredSignature(uint256 deadline);

    /**
     * @dev Mismatched signature.
     */
    error GRC2612InvalidSigner(address signer, address owner);

    /**
     * @dev Initializes the {EIP712} domain separator using the `name` parameter, and setting `version` to `"1"`.
     *
     * It's a good idea to use the same `name` that is defined as the GRC-20 token name.
     */
    constructor(string memory name) EIP712(name, "1") {}

    /// @inheritdoc IGRC20Permit
    function permit(
        address owner,
        address spender,
        uint256 value,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) public virtual {
        if (block.timestamp > deadline) {
            revert GRC2612ExpiredSignature(deadline);
        }

        bytes32 structHash = keccak256(abi.encode(PERMIT_TYPEHASH, owner, spender, value, _useNonce(owner), deadline));

        bytes32 hash = _hashTypedDataV4(structHash);

        address signer = ECDSA.recover(hash, v, r, s);
        if (signer != owner) {
            revert GRC2612InvalidSigner(signer, owner);
        }

        _approve(owner, spender, value);
    }

    /// @inheritdoc IGRC20Permit
    function nonces(address owner) public view virtual override(IGRC20Permit, Nonces) returns (uint256) {
        return super.nonces(owner);
    }

    /// @inheritdoc IGRC20Permit
    // solhint-disable-next-line func-name-mixedcase
    function DOMAIN_SEPARATOR() external view returns (bytes32) {
        return _domainSeparatorV4();
    }
}
