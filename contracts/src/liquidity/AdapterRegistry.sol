// SPDX-License-Identifier: MIT
// @ghostchain Part of the GhostChain protocol suite — https://ghostchain.io

pragma solidity ^0.8.24;

import "../common/Governed.sol";

/// @notice Governance registry for external execution venue adapters.
contract AdapterRegistry is Governed {
    enum ProofType {
        NONE,
        ECDSA_ATTESTATION,
        ZK_PROOF
    }

    struct AdapterConfig {
        uint256 externalChainId;
        uint8 riskTier;
        uint256 maxDeployCap;
        uint64 settlementInterval;
        ProofType proofType;
        address operator;
        bool paused;
        bool enabled;
        uint64 updatedAt;
    }

    mapping(uint256 => AdapterConfig) public adapters;
    uint256[] private adapterIds;
    mapping(uint256 => bool) private knownAdapter;

    event AdapterConfigured(
        uint256 indexed adapterId,
        uint256 externalChainId,
        uint8 riskTier,
        uint256 maxDeployCap,
        uint64 settlementInterval,
        ProofType proofType,
        address operator,
        bool paused,
        bool enabled
    );
    event AdapterPaused(uint256 indexed adapterId, bool paused);
    event AdapterMaxDeployCapSet(uint256 indexed adapterId, uint256 maxDeployCap);
    event AdapterSettlementIntervalSet(uint256 indexed adapterId, uint64 settlementInterval);
    event AdapterOperatorSet(uint256 indexed adapterId, address indexed operator);
    event AdapterEnabledSet(uint256 indexed adapterId, bool enabled);

    error AdapterMissing(uint256 adapterId);

    constructor(address governor_, address timelock_) Governed(governor_, timelock_) {}

    function configureAdapter(uint256 adapterId, AdapterConfig calldata config) external onlyGovernance {
        require(adapterId != 0, "adapterId=0");
        require(config.externalChainId != 0, "chainId=0");
        require(config.operator != address(0), "operator=0");
        require(config.settlementInterval != 0, "interval=0");
        require(config.proofType != ProofType.NONE, "proof=none");

        AdapterConfig storage a = adapters[adapterId];
        a.externalChainId = config.externalChainId;
        a.riskTier = config.riskTier;
        a.maxDeployCap = config.maxDeployCap;
        a.settlementInterval = config.settlementInterval;
        a.proofType = config.proofType;
        a.operator = config.operator;
        a.paused = config.paused;
        a.enabled = config.enabled;
        a.updatedAt = uint64(block.timestamp);

        if (!knownAdapter[adapterId]) {
            knownAdapter[adapterId] = true;
            adapterIds.push(adapterId);
        }

        emit AdapterConfigured(
            adapterId,
            config.externalChainId,
            config.riskTier,
            config.maxDeployCap,
            config.settlementInterval,
            config.proofType,
            config.operator,
            config.paused,
            config.enabled
        );
    }

    function setAdapterPaused(uint256 adapterId, bool paused) external onlyGovernance {
        if (!knownAdapter[adapterId]) revert AdapterMissing(adapterId);
        adapters[adapterId].paused = paused;
        adapters[adapterId].updatedAt = uint64(block.timestamp);
        emit AdapterPaused(adapterId, paused);
    }

    function setMaxDeployCap(uint256 adapterId, uint256 maxDeployCap) external onlyGovernance {
        if (!knownAdapter[adapterId]) revert AdapterMissing(adapterId);
        adapters[adapterId].maxDeployCap = maxDeployCap;
        adapters[adapterId].updatedAt = uint64(block.timestamp);
        emit AdapterMaxDeployCapSet(adapterId, maxDeployCap);
    }

    function setSettlementInterval(uint256 adapterId, uint64 settlementInterval) external onlyGovernance {
        if (!knownAdapter[adapterId]) revert AdapterMissing(adapterId);
        require(settlementInterval != 0, "interval=0");
        adapters[adapterId].settlementInterval = settlementInterval;
        adapters[adapterId].updatedAt = uint64(block.timestamp);
        emit AdapterSettlementIntervalSet(adapterId, settlementInterval);
    }

    function setOperator(uint256 adapterId, address operator) external onlyGovernance {
        if (!knownAdapter[adapterId]) revert AdapterMissing(adapterId);
        require(operator != address(0), "operator=0");
        adapters[adapterId].operator = operator;
        adapters[adapterId].updatedAt = uint64(block.timestamp);
        emit AdapterOperatorSet(adapterId, operator);
    }

    function setEnabled(uint256 adapterId, bool enabled) external onlyGovernance {
        if (!knownAdapter[adapterId]) revert AdapterMissing(adapterId);
        adapters[adapterId].enabled = enabled;
        adapters[adapterId].updatedAt = uint64(block.timestamp);
        emit AdapterEnabledSet(adapterId, enabled);
    }

    function adapterCount() external view returns (uint256) {
        return adapterIds.length;
    }

    function adapterIdAt(uint256 index) external view returns (uint256) {
        return adapterIds[index];
    }

    function isAdapterKnown(uint256 adapterId) external view returns (bool) {
        return knownAdapter[adapterId];
    }

    function getAdapter(uint256 adapterId) external view returns (AdapterConfig memory config) {
        if (!knownAdapter[adapterId]) revert AdapterMissing(adapterId);
        return adapters[adapterId];
    }

    function requireAdapterActive(uint256 adapterId) external view returns (AdapterConfig memory config) {
        if (!knownAdapter[adapterId]) revert AdapterMissing(adapterId);
        config = adapters[adapterId];
        require(config.enabled, "adapter disabled");
        require(!config.paused, "adapter paused");
    }
}
