// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// ────────────────────────────────────────────────────────────────────────────
// GNS shared interfaces — imported by Resolver, Guard, Wrapper, and scripts
// ────────────────────────────────────────────────────────────────────────────

interface IGNSRegistry {
    function owner(bytes32 node) external view returns (address);
    function resolver(bytes32 node) external view returns (address);
    function expiry(bytes32 node) external view returns (uint64);
    function isExpired(bytes32 node) external view returns (bool);
    function reserved(bytes32 labelHash) external view returns (bool);
    function operators(bytes32 node, address op) external view returns (bool);
    function records(bytes32 node) external view returns (
        address owner,
        address resolver,
        address approved,
        uint64  expiry,
        bool    locked
    );
    function transfer(bytes32 node, address newOwner) external;
    function setApproval(bytes32 node, address operator, bool approved) external;
    function lockName(bytes32 node) external;
    function nodeOf(string calldata label) external view returns (bytes32);
    function GHOST_ROOT() external view returns (bytes32);
    function setResolver(bytes32 node, address resolver) external;
}
