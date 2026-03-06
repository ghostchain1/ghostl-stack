// SPDX-License-Identifier: MIT
// @ghostchain Part of the GhostChain protocol suite — https://ghostchain.io

pragma solidity ^0.8.24;

import "../common/Governed.sol";

/// @notice Governed registry of AI oracle signers and policy parameters.
/// @dev Ownership and governance are wired through the repo's Governed helper.
contract AIOracleRegistry is Governed {
    struct SignerInfo {
        bool allowed;
        uint32 signerType;
        string metadataURI;
        uint64 addedAt;
        uint64 disabledAt;
        uint64 updatedAt;
    }

    // Common policy keys used by PolicyGuard.
    bytes32 public constant POLICY_RISK_THRESHOLD_BPS = keccak256("ghostai.policy.risk.threshold.bps");
    bytes32 public constant POLICY_MIN_CONFIDENCE = keccak256("ghostai.policy.min.confidence");
    bytes32 public constant POLICY_MAX_ATTESTATION_AGE = keccak256("ghostai.policy.max.attestation.age");

    mapping(address => SignerInfo) private signerInfo;
    mapping(address => bool) private signerKnown;
    address[] private signerList;

    mapping(bytes32 => uint256) private policies;

    event SignerRegistered(address indexed signer, uint32 signerType, string metadataURI);
    event SignerStatusChanged(address indexed signer, bool allowed, uint32 signerType, string metadataURI);
    event SignerRotated(address indexed oldSigner, address indexed newSigner, uint32 signerType, string metadataURI);
    event PolicyUpdated(bytes32 indexed key, uint256 value);

    constructor(address governor_, address timelock_) Governed(governor_, timelock_) {}

    function registerSigner(address signer, uint32 signerType, string calldata metadataURI) external onlyGovernance {
        require(signer != address(0), "signer=0");
        if (!signerKnown[signer]) {
            signerKnown[signer] = true;
            signerList.push(signer);
        }
        SignerInfo storage info = signerInfo[signer];
        info.allowed = true;
        info.signerType = signerType;
        info.metadataURI = metadataURI;
        uint64 nowTs = uint64(block.timestamp);
        if (info.addedAt == 0) {
            info.addedAt = nowTs;
        }
        info.disabledAt = 0;
        info.updatedAt = nowTs;
        emit SignerRegistered(signer, signerType, metadataURI);
        emit SignerStatusChanged(signer, true, signerType, metadataURI);
    }

    function setSignerStatus(address signer, bool allowed, uint32 signerType, string calldata metadataURI)
        external
        onlyGovernance
    {
        require(signerKnown[signer], "signer unknown");
        SignerInfo storage info = signerInfo[signer];
        info.allowed = allowed;
        info.signerType = signerType;
        info.metadataURI = metadataURI;
        uint64 nowTs = uint64(block.timestamp);
        if (!allowed) {
            info.disabledAt = nowTs;
        } else if (info.addedAt == 0) {
            info.addedAt = nowTs;
            info.disabledAt = 0;
        } else {
            info.disabledAt = 0;
        }
        info.updatedAt = nowTs;
        emit SignerStatusChanged(signer, allowed, signerType, metadataURI);
    }

    function rotateSigner(address oldSigner, address newSigner, uint32 signerType, string calldata metadataURI)
        external
        onlyGovernance
    {
        require(oldSigner != address(0), "old=0");
        require(newSigner != address(0), "new=0");
        require(signerKnown[oldSigner], "old unknown");

        SignerInfo storage oldInfo = signerInfo[oldSigner];
        oldInfo.allowed = false;
        oldInfo.disabledAt = uint64(block.timestamp);
        oldInfo.updatedAt = uint64(block.timestamp);
        emit SignerStatusChanged(oldSigner, false, oldInfo.signerType, oldInfo.metadataURI);

        if (!signerKnown[newSigner]) {
            signerKnown[newSigner] = true;
            signerList.push(newSigner);
        }
        SignerInfo storage newInfo = signerInfo[newSigner];
        newInfo.allowed = true;
        newInfo.signerType = signerType;
        newInfo.metadataURI = metadataURI;
        uint64 nowTs = uint64(block.timestamp);
        if (newInfo.addedAt == 0) {
            newInfo.addedAt = nowTs;
        }
        newInfo.disabledAt = 0;
        newInfo.updatedAt = nowTs;

        emit SignerRotated(oldSigner, newSigner, signerType, metadataURI);
        emit SignerStatusChanged(newSigner, true, signerType, metadataURI);
    }

    function emergencyDisableSigner(address signer) external onlyGovernance {
        require(signerKnown[signer], "signer unknown");
        SignerInfo storage info = signerInfo[signer];
        info.allowed = false;
        info.disabledAt = uint64(block.timestamp);
        info.updatedAt = uint64(block.timestamp);
        emit SignerStatusChanged(signer, false, info.signerType, info.metadataURI);
    }

    function setPolicy(bytes32 key, uint256 value) external onlyGovernance {
        policies[key] = value;
        emit PolicyUpdated(key, value);
    }

    function isSignerAllowed(address signer) external view returns (bool) {
        return signerInfo[signer].allowed;
    }

    function getSignerInfo(address signer) external view returns (SignerInfo memory) {
        return signerInfo[signer];
    }

    function signerCount() external view returns (uint256) {
        return signerList.length;
    }

    function signerAt(uint256 index) external view returns (address) {
        return signerList[index];
    }

    function getPolicy(bytes32 key) external view returns (uint256) {
        return policies[key];
    }
}
