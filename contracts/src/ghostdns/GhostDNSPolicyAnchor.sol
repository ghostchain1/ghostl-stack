// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../common/Ownable.sol";

contract GhostDNSPolicyAnchor is Ownable {
    bytes32 public activePolicyHash;
    string public activePolicyVersion;
    bool public emergencyLock;

    mapping(address => bool) public allowedAttestors;

    event PolicyUpdated(bytes32 indexed policyHash, string version, uint64 updatedAt, address operator);
    event AttestorSet(address indexed attestor, bool allowed, uint64 updatedAt, address operator);
    event EmergencyLockSet(bool locked, uint64 updatedAt, address operator);

    function setPolicy(bytes32 policyHash, string calldata version) external onlyOwner {
        require(policyHash != bytes32(0), "policy hash required");
        require(bytes(version).length > 0, "version required");
        activePolicyHash = policyHash;
        activePolicyVersion = version;
        emit PolicyUpdated(policyHash, version, uint64(block.timestamp), msg.sender);
    }

    function setAttestor(address attestor, bool allowed) external onlyOwner {
        require(attestor != address(0), "attestor required");
        allowedAttestors[attestor] = allowed;
        emit AttestorSet(attestor, allowed, uint64(block.timestamp), msg.sender);
    }

    function setEmergencyLock(bool locked) external onlyOwner {
        emergencyLock = locked;
        emit EmergencyLockSet(locked, uint64(block.timestamp), msg.sender);
    }
}
