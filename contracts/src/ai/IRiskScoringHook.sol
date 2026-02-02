// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Standardized read interface for risk scoring lookups.
interface IRiskScoringHook {
    function getLatestRisk(address subject, uint8 layer)
        external
        view
        returns (uint16 riskScoreBps, uint8 confidence, bytes32 attestationId, uint256 issuedAt, uint256 expiresAt);
}
