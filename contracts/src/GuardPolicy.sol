// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract GuardPolicy {
    enum Mode { ALLOW, DELAY, PAUSE }

    address public owner;
    Mode public mode;
    uint256 public delaySeconds;
    uint256 public riskThreshold; // 0-100
    mapping(address => uint256) public riskScore;

    event OwnerChanged(address indexed owner);
    event ModeChanged(Mode mode);
    event DelayChanged(uint256 secondsDelay);
    event RiskThresholdChanged(uint256 threshold);
    event RiskScoreSet(address indexed who, uint256 score);

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    constructor() {
        owner = msg.sender;
        mode = Mode.ALLOW;
        delaySeconds = 0;
        riskThreshold = 80;
    }

    function setOwner(address newOwner) external onlyOwner {
        owner = newOwner;
        emit OwnerChanged(newOwner);
    }

    function setMode(Mode m) external onlyOwner {
        mode = m;
        emit ModeChanged(m);
    }

    function setDelaySeconds(uint256 s) external onlyOwner {
        delaySeconds = s;
        emit DelayChanged(s);
    }

    function setRiskThreshold(uint256 t) external onlyOwner {
        require(t <= 100, "bad threshold");
        riskThreshold = t;
        emit RiskThresholdChanged(t);
    }

    function setRiskScore(address who, uint256 score) external onlyOwner {
        require(score <= 100, "bad score");
        riskScore[who] = score;
        emit RiskScoreSet(who, score);
    }

    /// Bridge calls this to decide if finalize is allowed right now.
    function check(address actor, uint256 amount) external view returns (bool allowed, uint256 waitSeconds) {
        if (mode == Mode.PAUSE) return (false, 0);

        uint256 r = riskScore[actor];
        // simple severity bump for big amounts (tune later)
        if (amount >= 100 ether && r < 100) r += 15;
        if (r > 100) r = 100;

        if (r >= riskThreshold) {
            // high-risk => require manual intervention (treat as paused for now)
            return (false, 0);
        }

        if (mode == Mode.DELAY && delaySeconds > 0) {
            return (true, delaySeconds);
        }

        return (true, 0);
    }
}
