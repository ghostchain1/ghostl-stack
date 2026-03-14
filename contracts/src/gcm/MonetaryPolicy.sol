// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.24;

/// @title  MonetaryPolicy
/// @notice Programmable global monetary policy engine for GCM.
///         Controls interest rates, reserve ratios, and liquidity expansion/contraction.
contract MonetaryPolicy {

    struct PolicyParameters {
        uint256 interestRateBps;    // global benchmark rate in basis points
        uint256 reserveRatioBps;    // required reserve ratio for banks
        uint256 liquidityCap;       // global CBDC supply cap
        uint256 velocityLimitBps;   // max daily transfer as % of supply
        uint256 updatedAt;
    }

    PolicyParameters public policy;
    address          public council;   // CentralBankGovernance contract

    event InterestRateChanged(uint256 oldRate, uint256 newRate, uint256 timestamp);
    event ReserveRatioChanged(uint256 oldRatio, uint256 newRatio, uint256 timestamp);
    event LiquidityCapChanged(uint256 oldCap, uint256 newCap, uint256 timestamp);
    event VelocityLimitChanged(uint256 oldLimit, uint256 newLimit, uint256 timestamp);
    event PolicySnapshot(PolicyParameters params, uint256 timestamp);

    modifier onlyCouncil() { require(msg.sender == council, "Policy: not council"); _; }

    constructor(address _council) {
        council = _council;
        policy  = PolicyParameters({
            interestRateBps:  350,    // 3.50%
            reserveRatioBps:  1200,   // 12.00%
            liquidityCap:     0,      // unlimited initially
            velocityLimitBps: 1000,   // 10% daily velocity cap
            updatedAt:        block.timestamp
        });
    }

    function setInterestRate(uint256 bps) external onlyCouncil {
        emit InterestRateChanged(policy.interestRateBps, bps, block.timestamp);
        policy.interestRateBps = bps;
        policy.updatedAt       = block.timestamp;
    }

    function setReserveRatio(uint256 bps) external onlyCouncil {
        emit ReserveRatioChanged(policy.reserveRatioBps, bps, block.timestamp);
        policy.reserveRatioBps = bps;
        policy.updatedAt       = block.timestamp;
    }

    function setLiquidityCap(uint256 cap) external onlyCouncil {
        emit LiquidityCapChanged(policy.liquidityCap, cap, block.timestamp);
        policy.liquidityCap = cap;
        policy.updatedAt    = block.timestamp;
    }

    function setVelocityLimit(uint256 bps) external onlyCouncil {
        emit VelocityLimitChanged(policy.velocityLimitBps, bps, block.timestamp);
        policy.velocityLimitBps = bps;
        policy.updatedAt        = block.timestamp;
    }

    function expandLiquidity(uint256 amount) external onlyCouncil {
        if (policy.liquidityCap > 0) {
            policy.liquidityCap += amount;
        }
        emit LiquidityCapChanged(policy.liquidityCap - amount, policy.liquidityCap, block.timestamp);
    }

    function contractLiquidity(uint256 amount) external onlyCouncil {
        require(policy.liquidityCap >= amount, "Policy: cap underflow");
        policy.liquidityCap -= amount;
        emit LiquidityCapChanged(policy.liquidityCap + amount, policy.liquidityCap, block.timestamp);
    }

    function snapshot() external {
        emit PolicySnapshot(policy, block.timestamp);
    }
}
