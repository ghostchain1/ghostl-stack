// SPDX-License-Identifier: MIT
// @ghostchain Part of the GhostChain protocol suite — https://ghostchain.cloud

pragma solidity ^0.8.24;

/// @dev Minimal guard policy stub for dev/test. Not for production use.
///      Ported from infra/opstack/contracts/GuardPolicyStub.sol for a single canonical source.
contract GuardPolicyStub {
    uint8 private _mode; // 0=open, 1=delay, 2=pause
    uint256 private _delaySeconds;
    uint256 private _riskThreshold = 70;
    mapping(address => uint256) private _riskScores;

    event ModeSet(uint8 mode);
    event DelaySecondsSet(uint256 delaySeconds);
    event RiskThresholdSet(uint256 riskThreshold);
    event RiskScoreSet(address indexed account, uint256 risk);

    function mode() external view returns (uint8) {
        return _mode;
    }

    function setMode(uint8 m) external {
        _mode = m;
        emit ModeSet(m);
    }

    function delaySeconds() external view returns (uint256) {
        return _delaySeconds;
    }

    function setDelaySeconds(uint256 d) external {
        _delaySeconds = d;
        emit DelaySecondsSet(d);
    }

    function riskThreshold() external view returns (uint256) {
        return _riskThreshold;
    }

    function setRiskThreshold(uint256 t) external {
        _riskThreshold = t;
        emit RiskThresholdSet(t);
    }

    function riskScore(address who) external view returns (uint256) {
        return _riskScores[who];
    }

    function setRiskScore(address who, uint256 r) external {
        _riskScores[who] = r;
        emit RiskScoreSet(who, r);
    }
}
