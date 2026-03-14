// SPDX-License-Identifier: MIT
// @ghostchain Part of the GhostChain protocol suite — https://ghostchain.io

pragma solidity ^0.8.24;

import "../common/Governed.sol";

/// @notice Stores the active constitution hash + amendment rule thresholds.
/// @dev Governed by the ProposalExecutor (governor/timelock) just like other system modules.
contract ConstitutionRegistry is Governed {
    bytes32 public constitutionHash;

    struct AmendmentRules {
        uint256 standardQuorum;
        uint256 constitutionalQuorum;
        uint16 constitutionalSupermajorityBps; // 0..10_000
        uint256 standardMinDelay;
        uint256 constitutionalMinDelay;
        bool ratchetOnly; // if true: non-amendment updates may only tighten rules
    }

    AmendmentRules public rules;
    uint256 public immutable minStandardQuorum;
    uint256 public immutable minConstitutionalQuorum;
    uint16 public immutable minConstitutionalSupermajorityBps;
    uint256 public immutable minStandardMinDelay;
    uint256 public immutable minConstitutionalMinDelay;

    event ConstitutionUpdated(bytes32 indexed oldHash, bytes32 indexed newHash);
    event RulesUpdated(AmendmentRules rules, bool isAmendment);

    constructor(
        address governor_,
        address timelock_,
        bytes32 initialConstitutionHash,
        AmendmentRules memory initialRules,
        AmendmentRules memory minRules
    ) Governed(governor_, timelock_) {
        require(initialConstitutionHash != bytes32(0), "hash=0");
        _validateRules(initialRules);
        _validateRules(minRules);
        _enforceMinimumPair(initialRules, minRules);

        constitutionHash = initialConstitutionHash;
        rules = initialRules;
        minStandardQuorum = minRules.standardQuorum;
        minConstitutionalQuorum = minRules.constitutionalQuorum;
        minConstitutionalSupermajorityBps = minRules.constitutionalSupermajorityBps;
        minStandardMinDelay = minRules.standardMinDelay;
        minConstitutionalMinDelay = minRules.constitutionalMinDelay;

        emit ConstitutionUpdated(bytes32(0), initialConstitutionHash);
        emit RulesUpdated(initialRules, false);
    }

    function setConstitutionHash(bytes32 newHash) external onlyGovernance {
        require(newHash != bytes32(0), "hash=0");
        bytes32 old = constitutionHash;
        constitutionHash = newHash;
        emit ConstitutionUpdated(old, newHash);
    }

    /// @notice Update amendment rules.
    /// @param isAmendment When true, allows loosening within immutable minimum bounds.
    function setRules(AmendmentRules calldata r, bool isAmendment) external onlyGovernance {
        AmendmentRules memory current = rules;

        _validateRules(r);
        _enforceMinimums(r);

        if (current.ratchetOnly && !isAmendment) {
            require(r.standardQuorum >= current.standardQuorum, "loosen standard quorum");
            require(r.constitutionalQuorum >= current.constitutionalQuorum, "loosen const quorum");
            require(r.constitutionalSupermajorityBps >= current.constitutionalSupermajorityBps, "loosen supermajority");
            require(r.standardMinDelay >= current.standardMinDelay, "loosen delay");
            require(r.constitutionalMinDelay >= current.constitutionalMinDelay, "loosen const delay");
        }

        rules = r;
        emit RulesUpdated(r, isAmendment);
    }

    function _validateRules(AmendmentRules memory r) internal pure {
        require(r.constitutionalSupermajorityBps <= 10_000, "bps");
        require(r.constitutionalSupermajorityBps >= 5_001, "supermajority");
        require(r.constitutionalMinDelay >= r.standardMinDelay, "const delay < std");
    }

    function _enforceMinimumPair(AmendmentRules memory candidate, AmendmentRules memory minRules) internal pure {
        require(candidate.standardQuorum >= minRules.standardQuorum, "below min std quorum");
        require(candidate.constitutionalQuorum >= minRules.constitutionalQuorum, "below min const quorum");
        require(
            candidate.constitutionalSupermajorityBps >= minRules.constitutionalSupermajorityBps,
            "below min supermajority"
        );
        require(candidate.standardMinDelay >= minRules.standardMinDelay, "below min std delay");
        require(candidate.constitutionalMinDelay >= minRules.constitutionalMinDelay, "below min const delay");
    }

    function _enforceMinimums(AmendmentRules memory candidate) internal view {
        require(candidate.standardQuorum >= minStandardQuorum, "below min std quorum");
        require(candidate.constitutionalQuorum >= minConstitutionalQuorum, "below min const quorum");
        require(candidate.constitutionalSupermajorityBps >= minConstitutionalSupermajorityBps, "below min supermajority");
        require(candidate.standardMinDelay >= minStandardMinDelay, "below min std delay");
        require(candidate.constitutionalMinDelay >= minConstitutionalMinDelay, "below min const delay");
    }
}
