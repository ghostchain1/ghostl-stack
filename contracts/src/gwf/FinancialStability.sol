// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.24;

/// @title  FinancialStability
/// @notice Global financial stability monitoring and automated stabilization for GWF.
///         Tracks systemic risk indicators and triggers circuit breakers when required.
contract FinancialStability {

    enum RiskLevel { Normal, Elevated, High, Critical, Crisis }

    struct RiskIndicator {
        string    name;
        uint256   value;       // current reading (scaled 1e4)
        uint256   threshold;   // threshold for level escalation
        RiskLevel level;
        uint256   updatedAt;
    }

    struct CircuitBreaker {
        string  name;
        bool    triggered;
        uint256 triggeredAt;
        address triggeredBy;
        string  reason;
    }

    mapping(bytes32 => RiskIndicator)  public indicators;
    mapping(bytes32 => CircuitBreaker) public breakers;
    bytes32[]                          public indicatorIds;
    bytes32[]                          public breakerIds;
    mapping(address => bool)           public monitors;
    RiskLevel public globalRiskLevel;
    address public admin;

    event RiskLevelChanged(bytes32 indexed indicatorId, RiskLevel from, RiskLevel to, uint256 value);
    event GlobalRiskLevelChanged(RiskLevel from, RiskLevel to);
    event CircuitBreakerTriggered(bytes32 indexed breakerId, string reason, address by);
    event CircuitBreakerReset(bytes32 indexed breakerId);
    event MonitorAdded(address indexed monitor);

    modifier onlyAdmin()   { require(msg.sender == admin, "Stability: not admin"); _; }
    modifier onlyMonitor() { require(monitors[msg.sender] || msg.sender == admin, "Stability: not monitor"); _; }

    constructor() {
        admin = msg.sender;
        monitors[msg.sender] = true;
        globalRiskLevel = RiskLevel.Normal;
    }

    function addMonitor(address m) external onlyAdmin {
        monitors[m] = true;
        emit MonitorAdded(m);
    }

    function registerIndicator(bytes32 id, string memory name, uint256 threshold) external onlyAdmin {
        indicators[id] = RiskIndicator({
            name:      name,
            value:     0,
            threshold: threshold,
            level:     RiskLevel.Normal,
            updatedAt: block.timestamp
        });
        indicatorIds.push(id);
    }

    function updateIndicator(bytes32 id, uint256 value) external onlyMonitor {
        RiskIndicator storage ind = indicators[id];
        RiskLevel oldLevel = ind.level;
        ind.value     = value;
        ind.updatedAt = block.timestamp;

        // Simple threshold-based level calculation
        if      (value >= ind.threshold * 4) ind.level = RiskLevel.Crisis;
        else if (value >= ind.threshold * 2) ind.level = RiskLevel.Critical;
        else if (value >= ind.threshold)     ind.level = RiskLevel.High;
        else if (value >= ind.threshold / 2) ind.level = RiskLevel.Elevated;
        else                                 ind.level = RiskLevel.Normal;

        if (ind.level != oldLevel) {
            emit RiskLevelChanged(id, oldLevel, ind.level, value);
        }
    }

    function setGlobalRiskLevel(RiskLevel level) external onlyAdmin {
        RiskLevel old = globalRiskLevel;
        globalRiskLevel = level;
        emit GlobalRiskLevelChanged(old, level);
    }

    function registerBreaker(bytes32 id, string memory name) external onlyAdmin {
        breakers[id].name = name;
        breakerIds.push(id);
    }

    function triggerBreaker(bytes32 id, string memory reason) external onlyAdmin {
        CircuitBreaker storage b = breakers[id];
        require(!b.triggered, "Stability: already triggered");
        b.triggered   = true;
        b.triggeredAt = block.timestamp;
        b.triggeredBy = msg.sender;
        b.reason      = reason;
        emit CircuitBreakerTriggered(id, reason, msg.sender);
    }

    function resetBreaker(bytes32 id) external onlyAdmin {
        breakers[id].triggered = false;
        emit CircuitBreakerReset(id);
    }
}
