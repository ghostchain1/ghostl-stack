// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { GhostSafeCast as SafeCast } from "../common/GhostSafeCast.sol";
import "../common/Governed.sol";
import "../common/ConstitutionalGuard.sol";
import "./PolicyRegistry.sol";
import "./EvidenceVault.sol";
import "../common/GhostHash.sol";

/// @notice Governance-locked executor for AI policy proposals with quorum signatures.
contract AIProposalExecutor is Governed {
    using SafeCast for uint256;

    bytes32 private constant DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 private constant UPDATE_TYPEHASH =
        keccak256(
            "PolicyUpdate(bytes32 policyKey,uint256 value,bytes32 evidenceHash,bytes32 metadataHash,uint256 nonce,uint64 issuedAt,uint64 validUntil,bool emergency)"
        );
    uint256 private constant SECP256K1N_HALF =
        0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0;

    struct PolicyUpdate {
        bytes32 policyKey;
        uint256 value;
        bytes32 evidenceHash;
        bytes32 metadataHash;
        uint256 nonce;
        uint64 issuedAt;
        uint64 validUntil;
        bool emergency;
    }

    bytes32 public immutable constitutionHash;
    PolicyRegistry public policyRegistry;
    EvidenceVault public evidenceVault;
    ConstitutionalGuard public constitutionalGuard;

    mapping(address => bool) public approvers;
    uint256 public minApprovals = 1;
    bytes32 public signerSetHash;
    uint64 public maxUpdateAge = 30 minutes;

    mapping(bytes32 => bool) public usedUpdates;

    uint256 private immutable cachedChainId;
    bytes32 private immutable cachedDomainSeparator;

    event PolicyRegistryUpdated(address indexed registry);
    event EvidenceVaultUpdated(address indexed vault);
    event ConstitutionalGuardUpdated(address indexed guard);
    event ApproverUpdated(address indexed approver, bool allowed);
    event MinApprovalsUpdated(uint256 minApprovals);
    event SignerSetHashUpdated(bytes32 signerSetHash);
    event MaxUpdateAgeUpdated(uint64 maxAge);
    event PolicyUpdateExecuted(bytes32 indexed updateHash, bytes32 indexed policyKey, uint256 value, bool emergency);
    event EvidenceRecorded(bytes32 indexed recordId, bytes32 indexed evidenceHash, bytes32 indexed policyKey);

    error InvalidUpdate();
    error UpdateExpired();
    error UpdateStale();
    error QuorumNotMet();
    error DuplicateSigner();

    constructor(address governor_, address timelock_, bytes32 constitutionHash_) Governed(governor_, timelock_) {
        require(constitutionHash_ != bytes32(0), "constitution=0");
        constitutionHash = constitutionHash_;
        cachedChainId = block.chainid;
        cachedDomainSeparator = _buildDomainSeparator();
    }

    function setPolicyRegistry(PolicyRegistry registry) external onlyGovernance {
        policyRegistry = registry;
        emit PolicyRegistryUpdated(address(registry));
    }

    function setEvidenceVault(EvidenceVault vault) external onlyGovernance {
        evidenceVault = vault;
        emit EvidenceVaultUpdated(address(vault));
    }

    function setConstitutionalGuard(ConstitutionalGuard guard) external onlyGovernance {
        constitutionalGuard = guard;
        emit ConstitutionalGuardUpdated(address(guard));
    }

    function setApprover(address approver, bool allowed) external onlyGovernance {
        approvers[approver] = allowed;
        emit ApproverUpdated(approver, allowed);
    }

    function setMinApprovals(uint256 minApprovals_) external onlyGovernance {
        require(minApprovals_ > 0, "minApprovals=0");
        minApprovals = minApprovals_;
        emit MinApprovalsUpdated(minApprovals_);
    }

    function setSignerSetHash(bytes32 signerSetHash_) external onlyGovernance {
        signerSetHash = signerSetHash_;
        emit SignerSetHashUpdated(signerSetHash_);
    }

    function setMaxUpdateAge(uint64 maxAge) external onlyGovernance {
        maxUpdateAge = maxAge;
        emit MaxUpdateAgeUpdated(maxAge);
    }

    function hashUpdate(PolicyUpdate calldata update) external pure returns (bytes32) {
        return _hashUpdate(update);
    }

    function digestUpdate(PolicyUpdate calldata update) external view returns (bytes32) {
        bytes32 structHash = _hashUpdate(update);
        return GhostHash.eip712Digest(_domainSeparator(), structHash);
    }

    function executePolicyUpdate(
        PolicyUpdate calldata update,
        bytes[] calldata signatures,
        bytes32 evidenceKind,
        uint256 proposalId
    ) external returns (bytes32 updateHash) {
        _validateUpdate(update);
        updateHash = _hashUpdate(update);
        if (usedUpdates[updateHash]) revert InvalidUpdate();

        if (!_isGovernanceCaller()) {
            _validateSignatures(updateHash, signatures);
        }

        usedUpdates[updateHash] = true;

        PolicyRegistry registry = policyRegistry;
        require(address(registry) != address(0), "registry=0");
        (PolicyRegistry.PolicyValue memory current, , ) = registry.getPolicy(update.policyKey);
        uint32 targetVersion = update.emergency ? current.version : current.version + 1;

        EvidenceVault vault = evidenceVault;
        require(address(vault) != address(0), "vault=0");
        bytes32 recordId = vault.recordEvidence(
            evidenceKind,
            update.evidenceHash,
            update.policyKey,
            targetVersion,
            proposalId,
            signerSetHash,
            minApprovals.toUint16(),
            update.metadataHash
        );
        emit EvidenceRecorded(recordId, update.evidenceHash, update.policyKey);

        if (update.emergency) {
            registry.setEmergencyPolicy(update.policyKey, update.value, update.evidenceHash);
        } else {
            registry.applyPolicy(update.policyKey, update.value, update.evidenceHash);
        }

        ConstitutionalGuard guard = constitutionalGuard;
        if (address(guard) != address(0)) {
            bytes32 actionHash = keccak256(
                abi.encode(updateHash, update.policyKey, update.value, update.evidenceHash, update.emergency)
            );
            guard.checkGovernance(actionHash, msg.sender, abi.encode(update.policyKey, update.value, update.emergency));
        }

        emit PolicyUpdateExecuted(updateHash, update.policyKey, update.value, update.emergency);
    }

    function _validateUpdate(PolicyUpdate calldata update) internal view {
        if (update.policyKey == bytes32(0)) revert InvalidUpdate();
        if (update.evidenceHash == bytes32(0)) revert InvalidUpdate();
        if (update.issuedAt > block.timestamp) revert InvalidUpdate();
        if (update.validUntil < block.timestamp) revert UpdateExpired();
        if (block.timestamp - update.issuedAt > maxUpdateAge) revert UpdateStale();

        PolicyRegistry registry = policyRegistry;
        require(address(registry) != address(0), "registry=0");
        if (!registry.validatePolicy(update.policyKey, update.value)) revert InvalidUpdate();
    }

    function _validateSignatures(bytes32 updateHash, bytes[] calldata signatures) internal view {
        if (signatures.length < minApprovals) revert QuorumNotMet();
        address[] memory seen = new address[](signatures.length);
        uint256 valid = 0;
        bytes32 digest = GhostHash.eip712Digest(_domainSeparator(), updateHash);
        for (uint256 i = 0; i < signatures.length; i++) {
            address signer = _recoverSigner(digest, signatures[i]);
            if (!approvers[signer]) {
                continue;
            }
            for (uint256 j = 0; j < valid; j++) {
                if (seen[j] == signer) {
                    revert DuplicateSigner();
                }
            }
            seen[valid] = signer;
            valid++;
            if (valid >= minApprovals) {
                return;
            }
        }
        revert QuorumNotMet();
    }

    function _recoverSigner(bytes32 digest, bytes calldata signature) internal pure returns (address) {
        require(signature.length == 65, "sig length");
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := calldataload(signature.offset)
            s := calldataload(add(signature.offset, 32))
            v := byte(0, calldataload(add(signature.offset, 64)))
        }
        if (v < 27) v += 27;
        require(v == 27 || v == 28, "sig v");
        require(uint256(s) <= SECP256K1N_HALF, "sig s");
        address signer = ecrecover(digest, v, r, s);
        require(signer != address(0), "sig");
        return signer;
    }

    function _hashUpdate(PolicyUpdate calldata update) internal pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    UPDATE_TYPEHASH,
                    update.policyKey,
                    update.value,
                    update.evidenceHash,
                    update.metadataHash,
                    update.nonce,
                    update.issuedAt,
                    update.validUntil,
                    update.emergency
                )
            );
    }

    function _domainSeparator() internal view returns (bytes32) {
        if (block.chainid == cachedChainId) {
            return cachedDomainSeparator;
        }
        return _buildDomainSeparator();
    }

    function _buildDomainSeparator() internal view returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    DOMAIN_TYPEHASH,
                    keccak256(bytes("GhostAIProposalExecutor")),
                    keccak256(bytes("1")),
                    block.chainid,
                    address(this)
                )
            );
    }

    function _isGovernanceCaller() internal view returns (bool) {
        return msg.sender == governor || (timelock != address(0) && msg.sender == timelock);
    }
}
