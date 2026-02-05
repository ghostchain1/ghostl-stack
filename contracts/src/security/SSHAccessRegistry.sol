// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../common/Governed.sol";

/// @notice Governance-locked SSH access registry with on-chain receipts.
contract SSHAccessRegistry is Governed {
    struct Grant {
        uint64 grantedAt;
        uint64 expiresAt;
        bytes32 role;
        bytes32 policyHash;
        address grantedBy;
        bool revoked;
        bytes32 revokeReasonHash;
    }

    // serverId => principalHash => pubkeyHash => Grant
    mapping(bytes32 => mapping(bytes32 => mapping(bytes32 => Grant))) public grants;

    // serverId => attestor => allowed
    mapping(bytes32 => mapping(address => bool)) public attestors;

    // serverId => policyHash
    mapping(bytes32 => bytes32) public serverPolicyHash;

    event AccessGranted(
        bytes32 indexed serverId,
        bytes32 indexed principalHash,
        bytes32 indexed pubkeyHash,
        uint64 expiresAt,
        bytes32 role,
        bytes32 policyHash,
        address grantedBy
    );
    event AccessRevoked(
        bytes32 indexed serverId,
        bytes32 indexed principalHash,
        bytes32 indexed pubkeyHash,
        bytes32 reasonHash,
        address revokedBy
    );
    event LoginReceipt(
        bytes32 indexed serverId,
        bytes32 indexed principalHash,
        bytes32 indexed pubkeyHash,
        bytes32 sessionHash,
        uint64 ts,
        address attestor,
        bytes signature
    );
    event AttestorRegistered(bytes32 indexed serverId, address indexed attestor, bool allowed);
    event PolicyUpdated(bytes32 indexed serverId, bytes32 indexed policyHash);

    error InvalidHash();
    error GrantMissing();
    error NotAttestor();
    error NotAuthorized();

    constructor(address governor_, address timelock_) Governed(governor_, timelock_) {}

    function setPolicyHash(bytes32 serverId, bytes32 policyHash) external onlyGovernance {
        if (serverId == bytes32(0) || policyHash == bytes32(0)) revert InvalidHash();
        serverPolicyHash[serverId] = policyHash;
        emit PolicyUpdated(serverId, policyHash);
    }

    function setAttestor(bytes32 serverId, address attestor, bool allowed) external onlyGovernance {
        if (serverId == bytes32(0)) revert InvalidHash();
        require(attestor != address(0), "attestor=0");
        attestors[serverId][attestor] = allowed;
        emit AttestorRegistered(serverId, attestor, allowed);
    }

    function grantAccess(
        bytes32 serverId,
        bytes32 principalHash,
        bytes32 pubkeyHash,
        uint64 expiresAt,
        bytes32 role,
        bytes32 policyHash
    ) external onlyGovernance {
        if (serverId == bytes32(0) || principalHash == bytes32(0) || pubkeyHash == bytes32(0)) revert InvalidHash();
        Grant storage g = grants[serverId][principalHash][pubkeyHash];
        g.grantedAt = uint64(block.timestamp);
        g.expiresAt = expiresAt;
        g.role = role;
        g.policyHash = policyHash;
        g.grantedBy = msg.sender;
        g.revoked = false;
        g.revokeReasonHash = bytes32(0);

        emit AccessGranted(serverId, principalHash, pubkeyHash, expiresAt, role, policyHash, msg.sender);
    }

    function revokeAccess(bytes32 serverId, bytes32 principalHash, bytes32 pubkeyHash, bytes32 reasonHash)
        external
        onlyGovernance
    {
        Grant storage g = grants[serverId][principalHash][pubkeyHash];
        // slither-disable-next-line incorrect-equality
        if (g.grantedAt == 0) revert GrantMissing();
        g.revoked = true;
        g.revokeReasonHash = reasonHash;
        emit AccessRevoked(serverId, principalHash, pubkeyHash, reasonHash, msg.sender);
    }

    function isAuthorized(bytes32 serverId, bytes32 principalHash, bytes32 pubkeyHash) public view returns (bool) {
        Grant memory g = grants[serverId][principalHash][pubkeyHash];
        // slither-disable-next-line incorrect-equality
        if (g.grantedAt == 0) return false;
        if (g.revoked) return false;
        if (g.expiresAt != 0 && block.timestamp > g.expiresAt) return false;
        return true;
    }

    function submitLoginReceipt(
        bytes32 serverId,
        bytes32 principalHash,
        bytes32 pubkeyHash,
        bytes32 sessionHash,
        uint64 ts,
        bytes calldata signature
    ) external {
        if (!attestors[serverId][msg.sender]) revert NotAttestor();
        if (!isAuthorized(serverId, principalHash, pubkeyHash)) revert NotAuthorized();
        emit LoginReceipt(serverId, principalHash, pubkeyHash, sessionHash, ts, msg.sender, signature);
    }
}
