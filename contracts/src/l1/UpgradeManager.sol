// SPDX-License-Identifier: MIT
// @ghostchain Part of the GhostChain protocol suite — https://ghostchain.cloud

pragma solidity ^0.8.24;

import "../ai/EvidenceBundle.sol";
import "../common/ConstitutionalGuard.sol";
import "../common/Ownable.sol";
import "../common/GhostHash.sol";

/// @notice Tracks approved upgrades / implementation hashes with optional activation time.
contract UpgradeManager is Ownable {
    struct UpgradeProposal {
        bytes32 implHash;
        uint256 activateAt;
        bool executed;
    }

    address public governor;
    address public timelock;
    EvidenceBundle public evidenceBundle;
    ConstitutionalGuard public constitutionalGuard;

    bytes32 internal constant ACTION_UPGRADE = keccak256("ghost.upgrade.execute");

    UpgradeProposal[] public proposals;

    event UpgradeProposed(uint256 indexed id, bytes32 implHash, uint256 activateAt);
    event UpgradeExecuted(uint256 indexed id);
    event GovernanceConfigUpdated(address indexed governor, address indexed timelock);
    event EvidenceBundleUpdated(address indexed bundle);
    event ConstitutionalGuardUpdated(address indexed guard);

    modifier onlyGovernance() {
        require(msg.sender == governor || (timelock != address(0) && msg.sender == timelock), "NOT_EXECUTOR");
        _;
    }

    modifier onlyGovernanceOrBootstrap() {
        if (governor == address(0)) {
            require(msg.sender == owner, "bootstrap only");
        } else {
            require(msg.sender == governor || (timelock != address(0) && msg.sender == timelock), "NOT_EXECUTOR");
        }
        _;
    }

    function setGovernance(address governor_, address timelock_) external onlyOwner {
        require(governor_ != address(0), "governor=0");
        governor = governor_;
        timelock = timelock_;
        emit GovernanceConfigUpdated(governor_, timelock_);
    }

    function setEvidenceBundle(EvidenceBundle bundle) external onlyGovernanceOrBootstrap {
        evidenceBundle = bundle;
        emit EvidenceBundleUpdated(address(bundle));
    }

    function setConstitutionalGuard(ConstitutionalGuard guard) external onlyGovernanceOrBootstrap {
        constitutionalGuard = guard;
        emit ConstitutionalGuardUpdated(address(guard));
    }

    function propose(bytes32 implHash, uint256 activateAt) external onlyOwner returns (uint256 id) {
        id = proposals.length;
        proposals.push(UpgradeProposal({implHash: implHash, activateAt: activateAt, executed: false}));
        emit UpgradeProposed(id, implHash, activateAt);
    }

    function execute(uint256 id) external onlyOwner {
        UpgradeProposal storage p = proposals[id];
        require(!p.executed, "executed");
        require(block.timestamp >= p.activateAt, "too early");
        p.executed = true;
        ConstitutionalGuard guard = constitutionalGuard;
        require(address(guard) != address(0), "constitution guard=0");
        bytes32 actionHash = GhostHash.upgradeActionHash(ACTION_UPGRADE, id, p.implHash, p.activateAt);
        guard.checkUpgrade(actionHash, msg.sender, abi.encode(p.implHash, p.activateAt));
        EvidenceBundle bundle = evidenceBundle;
        require(address(bundle) != address(0), "evidence bundle=0");
        EvidenceBundle.Bundle memory evidence = EvidenceBundle.Bundle({
            policyHash: actionHash,
            decisionHash: GhostHash.hash3(bytes32(id), p.implHash, bytes32(p.activateAt)),
            modelHash: bytes32(0),
            executionHash: GhostHash.hash2(p.implHash, bytes32(p.activateAt)),
            timestamp: block.timestamp,
            chainId: block.chainid,
            emitter: address(this)
        });
        bundle.recordBundle(evidence, bytes(""));
        emit UpgradeExecuted(id);
    }

    function proposalsLength() external view returns (uint256) {
        return proposals.length;
    }
}
