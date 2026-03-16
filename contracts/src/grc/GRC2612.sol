// SPDX-License-Identifier: MIT
// GhostChain Contracts v5.6.1 (grc/GRC2612.sol)
// @ghostchain Part of the GhostChain protocol suite — https://ghostchain.cloud

pragma solidity ^0.8.24;

import { GRC20 } from "../ghost/GRC20.sol";

/*
    Standard: GRC2612
    Name: Ghost Request for Comments 2612 — Permit
    Compatible With: ERC2612 / EIP-2612
    Network: GhostChain L1 / GhostL2 / GhostL3
*/

/// @title GRC2612
/// @notice GhostChain permit extension for GRC-20 tokens (gasless off-chain approvals).
///
///         Implements the signed approval flow from EIP-2612, rebranded for GhostChain.
///         Token holders can sign an off-chain message granting a spender an allowance;
///         the spender or any relayer submits `permit()` on-chain — no GST needed from
///         the token holder for the approval transaction.
///
///         EIP-712 domain:
///           name    = token name
///           version = "1"
///           chainId = block.chainid
///           verifyingContract = address(this)
///
///         Permit typehash (GRC2612 is wire-identical to ERC2612):
///           keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)")
///
/// @dev Inherit this contract alongside GRC20.  Call `super` constructors in order.
abstract contract GRC2612 is GRC20 {
    // ─────────────────────── EIP-712 constants ───────────────────────────────

    // keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)")
    bytes32 public constant PERMIT_TYPEHASH =
        0x6e71edae12b1b97f4d1f60370fef10105fa2faae0126114a169c64845d6126c9;

    /// @notice EIP-712 domain separator — recomputed on each call to handle forks correctly.
    bytes32 public immutable DOMAIN_SEPARATOR;

    // ─────────────────────── Nonces ──────────────────────────────────────────

    /// @notice Per-account nonce — increments with every successful `permit` call.
    ///         Prevents signature replay.
    mapping(address => uint256) public nonces;

    // ─────────────────────── Init ────────────────────────────────────────────

    constructor(string memory _name, string memory _symbol, uint8 _decimals)
        GRC20(_name, _symbol, _decimals)
    {
        DOMAIN_SEPARATOR = _computeDomainSeparator();
    }

    // ─────────────────────── Permit ──────────────────────────────────────────

    /// @notice Approve `spender` to spend `value` tokens on behalf of `owner` using
    ///         a signed EIP-712 permit message.
    ///
    /// @param owner     Token owner who signed the permit.
    /// @param spender   Address being approved.
    /// @param value     Allowance amount.
    /// @param deadline  Unix timestamp — reverts if block.timestamp > deadline.
    /// @param v         Signature component.
    /// @param r         Signature component.
    /// @param s         Signature component.
    function permit(
        address owner,
        address spender,
        uint256 value,
        uint256 deadline,
        uint8   v,
        bytes32 r,
        bytes32 s
    ) external {
        require(block.timestamp <= deadline, "GRC2612: permit expired");
        require(owner != address(0),         "GRC2612: zero owner");

        bytes32 structHash = keccak256(
            abi.encode(
                PERMIT_TYPEHASH,
                owner,
                spender,
                value,
                nonces[owner]++,
                deadline
            )
        );

        bytes32 digest = keccak256(
            abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR, structHash)
        );

        address recovered = ecrecover(digest, v, r, s);
        require(recovered != address(0) && recovered == owner, "GRC2612: invalid signature");

        // Update allowance — reuse GRC20 internal approve path.
        allowance[owner][spender] = value;
        emit Approval(owner, spender, value);
    }

    // ─────────────────────── Internal ────────────────────────────────────────

    function _computeDomainSeparator() internal view returns (bytes32) {
        return keccak256(
            abi.encode(
                // keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)")
                0x8b73c3c69bb8fe3d512ecc4cf759cc79239f7b179b0ffacaa9a75d522b39400f,
                keccak256(bytes(name)),
                keccak256(bytes("1")),
                block.chainid,
                address(this)
            )
        );
    }
}
