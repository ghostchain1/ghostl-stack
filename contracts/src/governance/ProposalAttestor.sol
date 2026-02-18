// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./bridge/IFederationMessageSender.sol";

/// @notice L2/L3 contract that hashes a proposal payload and submits an attestation up to GhostChain L1.
/// @dev Bridge-agnostic: depends only on a message sender that provides authenticated sender + message execution on L1.
contract ProposalAttestor {
    bytes32 public constant DEFAULT_ADMIN_ROLE = keccak256("DEFAULT_ADMIN_ROLE");
    bytes32 public constant ATTESTER_ROLE = keccak256("ATTESTER_ROLE");

    mapping(bytes32 => mapping(address => bool)) private _roles;

    uint256 public immutable sourceDomainId;
    IFederationMessageSender public immutable messageSender;
    address public immutable l1CouncilAdapterTarget;

    event RoleSet(bytes32 indexed role, address indexed account, bool allowed);
    event ProposalAttested(
        uint256 indexed sourceDomainId,
        bytes32 indexed proposalSalt,
        bytes32 indexed attestationHash,
        bytes32 finalityProofHash,
        bytes32 descriptionHash
    );

    error Unauthorized();

    constructor(
        uint256 sourceDomainId_,
        IFederationMessageSender messageSender_,
        address l1CouncilAdapterTarget_,
        address admin
    ) {
        require(sourceDomainId_ != 0, "domainId=0");
        require(address(messageSender_) != address(0), "sender=0");
        require(l1CouncilAdapterTarget_ != address(0), "l1Target=0");
        require(admin != address(0), "admin=0");
        sourceDomainId = sourceDomainId_;
        messageSender = messageSender_;
        l1CouncilAdapterTarget = l1CouncilAdapterTarget_;

        _setRole(DEFAULT_ADMIN_ROLE, admin, true);
        _setRole(ATTESTER_ROLE, admin, true);
    }

    modifier onlyRole(bytes32 role) {
        if (!_roles[role][msg.sender]) revert Unauthorized();
        _;
    }

    function hasRole(bytes32 role, address account) external view returns (bool) {
        return _roles[role][account];
    }

    function setRole(bytes32 role, address account, bool allowed) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _setRole(role, account, allowed);
    }

    /// @notice Hash the proposal payload that will be executed on this chain.
    /// @dev The attestation hash must be derivable by any auditor from the proposal payload + description + finality proof.
    function computeAttestationHash(
        bytes32 proposalSalt,
        address[] calldata targets,
        uint256[] calldata values,
        bytes[] calldata calldatas,
        bytes32 descriptionHash,
        bytes32 finalityProofHash
    ) public view returns (bytes32) {
        require(targets.length == values.length && targets.length == calldatas.length, "length mismatch");
        return keccak256(
            abi.encode(sourceDomainId, proposalSalt, targets, values, calldatas, descriptionHash, finalityProofHash)
        );
    }

    /// @notice Submit attestation up to L1.
    /// @param finalityProofHash Hash commitment to any domain-specific finality proof material (validated on L1 if configured).
    function attestProposal(
        bytes32 proposalSalt,
        address[] calldata targets,
        uint256[] calldata values,
        bytes[] calldata calldatas,
        bytes32 descriptionHash,
        bytes32 finalityProofHash,
        uint32 minGasLimit
    ) external onlyRole(ATTESTER_ROLE) returns (bytes32 attestationHash) {
        attestationHash = computeAttestationHash(
            proposalSalt, targets, values, calldatas, descriptionHash, finalityProofHash
        );
        bytes memory msgData = abi.encodeWithSignature(
            "receiveAttestation(bytes32,bytes32,bytes32)", proposalSalt, attestationHash, finalityProofHash
        );
        messageSender.sendMessage(l1CouncilAdapterTarget, msgData, minGasLimit);
        emit ProposalAttested(sourceDomainId, proposalSalt, attestationHash, finalityProofHash, descriptionHash);
    }

    function _setRole(bytes32 role, address account, bool allowed) internal {
        require(account != address(0), "account=0");
        _roles[role][account] = allowed;
        emit RoleSet(role, account, allowed);
    }
}
