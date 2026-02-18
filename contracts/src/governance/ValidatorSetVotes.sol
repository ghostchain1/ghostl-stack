// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../common/Governed.sol";
import "./IValidatorSetVotes.sol";

/// @notice Governance-managed validator voting weights with timestamp checkpoints.
/// @dev Designed to plug into GhostChain governor voting power calculations.
contract ValidatorSetVotes is Governed, IValidatorSetVotes {
    struct Checkpoint {
        uint48 timepoint;
        uint208 votes;
    }

    mapping(address => Checkpoint[]) private _checkpoints;
    mapping(address => uint256) public currentVotes;

    uint256 public totalValidatorVotes;
    Checkpoint[] private _totalCheckpoints;

    event ValidatorVotesSet(address indexed operator, uint256 votes);
    event ValidatorVotesBatch(uint256 count);

    constructor(address governor_, address timelock_) Governed(governor_, timelock_) {}

    function setValidatorVotes(address operator, uint256 votes) external onlyGovernance {
        require(operator != address(0), "operator=0");
        _set(operator, votes);
    }

    function setValidatorVotesBatch(address[] calldata operators, uint256[] calldata votes) external onlyGovernance {
        require(operators.length == votes.length, "length mismatch");
        for (uint256 i = 0; i < operators.length; i++) {
            _set(operators[i], votes[i]);
        }
        emit ValidatorVotesBatch(operators.length);
    }

    function getValidatorVotes(address operator, uint256 timepoint) external view returns (uint256) {
        return _getVotesAt(_checkpoints[operator], uint48(timepoint));
    }

    function getTotalValidatorVotes(uint256 timepoint) external view returns (uint256) {
        return _getVotesAt(_totalCheckpoints, uint48(timepoint));
    }

    function _set(address operator, uint256 votes) internal {
        uint256 prev = currentVotes[operator];
        currentVotes[operator] = votes;

        if (votes >= prev) {
            totalValidatorVotes += (votes - prev);
        } else {
            totalValidatorVotes -= (prev - votes);
        }

        _writeCheckpoint(_checkpoints[operator], uint208(votes));
        _writeCheckpoint(_totalCheckpoints, uint208(totalValidatorVotes));

        emit ValidatorVotesSet(operator, votes);
    }

    function _writeCheckpoint(Checkpoint[] storage cps, uint208 newVotes) internal {
        uint48 tp = uint48(block.timestamp);
        uint256 n = cps.length;
        if (n != 0 && cps[n - 1].timepoint >= tp) {
            cps[n - 1].votes = newVotes;
        } else {
            cps.push(Checkpoint({timepoint: tp, votes: newVotes}));
        }
    }

    function _getVotesAt(Checkpoint[] storage cps, uint48 timepoint) internal view returns (uint256) {
        uint256 n = cps.length;
        if (n == 0) return 0;
        if (cps[0].timepoint > timepoint) return 0;
        if (cps[n - 1].timepoint <= timepoint) return cps[n - 1].votes;

        uint256 lo = 0;
        uint256 hi = n - 1;
        while (lo < hi) {
            uint256 mid = (lo + hi + 1) / 2;
            if (cps[mid].timepoint <= timepoint) lo = mid;
            else hi = mid - 1;
        }
        return cps[lo].votes;
    }
}
