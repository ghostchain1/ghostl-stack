// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../common/Governed.sol";

/// @notice Policy constraints for federated treasury allocations.
/// @dev This contract does not move funds; it only validates policy context.
contract FederationPolicy is Governed {
    enum ViolationCode {
        NONE,
        MEMBER_INACTIVE,
        CHAIN_NOT_ALLOWED,
        PROTOCOL_NOT_ALLOWED,
        RISK_CAP_EXCEEDED,
        EXPOSURE_CAP_EXCEEDED
    }

    struct MemberPolicy {
        bytes32 memberId;
        bytes32 metadataHash;
        uint16 riskCapBps;
        uint16 maxExposureBps;
        uint16 revenueShareBps;
        bool active;
        uint64 updatedAt;
    }

    mapping(bytes32 => MemberPolicy) public memberPolicies;
    mapping(bytes32 => mapping(uint256 => bool)) public allowedChains;
    mapping(bytes32 => mapping(bytes32 => bool)) public allowedProtocols;

    event MemberPolicyUpserted(
        bytes32 indexed memberId,
        bytes32 metadataHash,
        uint16 riskCapBps,
        uint16 maxExposureBps,
        uint16 revenueShareBps,
        bool active
    );
    event MemberPolicyStatus(bytes32 indexed memberId, bool active);
    event MemberChainPermission(bytes32 indexed memberId, uint256 indexed chainId, bool allowed);
    event MemberProtocolPermission(bytes32 indexed memberId, bytes32 indexed protocolId, bool allowed);

    constructor(address governor_, address timelock_) Governed(governor_, timelock_) {}

    function upsertMemberPolicy(
        bytes32 memberId,
        bytes32 metadataHash,
        uint16 riskCapBps,
        uint16 maxExposureBps,
        uint16 revenueShareBps,
        bool active
    ) external onlyGovernance {
        require(memberId != bytes32(0), "memberId=0");
        require(riskCapBps <= 10_000, "risk>10000");
        require(maxExposureBps <= 10_000, "exposure>10000");
        require(revenueShareBps <= 10_000, "share>10000");

        memberPolicies[memberId] = MemberPolicy({
            memberId: memberId,
            metadataHash: metadataHash,
            riskCapBps: riskCapBps,
            maxExposureBps: maxExposureBps,
            revenueShareBps: revenueShareBps,
            active: active,
            updatedAt: uint64(block.timestamp)
        });

        emit MemberPolicyUpserted(memberId, metadataHash, riskCapBps, maxExposureBps, revenueShareBps, active);
    }

    function setMemberStatus(bytes32 memberId, bool active) external onlyGovernance {
        MemberPolicy storage policy = memberPolicies[memberId];
        require(policy.memberId != bytes32(0), "member_not_found");
        policy.active = active;
        policy.updatedAt = uint64(block.timestamp);
        emit MemberPolicyStatus(memberId, active);
    }

    function setAllowedChain(bytes32 memberId, uint256 chainId, bool allowed) external onlyGovernance {
        require(memberPolicies[memberId].memberId != bytes32(0), "member_not_found");
        require(chainId != 0, "chainId=0");
        allowedChains[memberId][chainId] = allowed;
        emit MemberChainPermission(memberId, chainId, allowed);
    }

    function setAllowedProtocol(bytes32 memberId, bytes32 protocolId, bool allowed) external onlyGovernance {
        require(memberPolicies[memberId].memberId != bytes32(0), "member_not_found");
        require(protocolId != bytes32(0), "protocol=0");
        allowedProtocols[memberId][protocolId] = allowed;
        emit MemberProtocolPermission(memberId, protocolId, allowed);
    }

    function checkAllocation(bytes32 memberId, uint256 chainId, bytes32 protocolId, uint16 riskScoreBps, uint16 exposureBps)
        external
        view
        returns (bool ok, ViolationCode code)
    {
        MemberPolicy storage policy = memberPolicies[memberId];
        if (!policy.active) return (false, ViolationCode.MEMBER_INACTIVE);
        if (!allowedChains[memberId][chainId]) return (false, ViolationCode.CHAIN_NOT_ALLOWED);
        if (!allowedProtocols[memberId][protocolId]) return (false, ViolationCode.PROTOCOL_NOT_ALLOWED);
        if (riskScoreBps > policy.riskCapBps) return (false, ViolationCode.RISK_CAP_EXCEEDED);
        if (exposureBps > policy.maxExposureBps) return (false, ViolationCode.EXPOSURE_CAP_EXCEEDED);
        return (true, ViolationCode.NONE);
    }
}
