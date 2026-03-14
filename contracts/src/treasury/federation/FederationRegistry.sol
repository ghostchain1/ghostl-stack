// SPDX-License-Identifier: MIT
// @ghostchain Part of the GhostChain protocol suite — https://ghostchain.io

pragma solidity ^0.8.24;

import "../../common/Governed.sol";
import "../../treasury/TreasuryInvariants.sol";

/// @notice Registry of federated treasury partners and treaty contracts.
contract FederationRegistry is Governed {
    enum MemberStatus {
        NONE,
        ACTIVE,
        SUSPENDED,
        REMOVED
    }

    struct Partner {
        uint256 chainId;
        address treasury;
        bytes32 policyHash;
        string metadataURI;
        bool active;
        uint256 registeredAt;
    }

    struct TreatyInfo {
        bytes32 treatyId;
        address treaty;
        uint256 partnerChainId;
        bool active;
        uint256 registeredAt;
    }

    struct Member {
        bytes32 memberId;
        address controller;
        bytes32 metadataHash;
        uint16 riskCapBps;
        uint16 maxExposureBps;
        uint16 revenueShareBps;
        MemberStatus status;
        uint256 updatedAt;
    }

    mapping(uint256 => Partner) public partners;
    mapping(bytes32 => TreatyInfo) public treaties;
    mapping(bytes32 => Member) public members;
    mapping(bytes32 => mapping(uint256 => bool)) public memberAllowedChains;

    event PartnerRegistered(uint256 indexed chainId, address indexed treasury, bytes32 policyHash);
    event PartnerDeactivated(uint256 indexed chainId);
    event TreatyRegistered(bytes32 indexed treatyId, address indexed treaty, uint256 indexed partnerChainId);
    event TreatyDeactivated(bytes32 indexed treatyId);
    event MemberUpserted(
        bytes32 indexed memberId,
        address indexed controller,
        uint16 riskCapBps,
        uint16 maxExposureBps,
        uint16 revenueShareBps,
        MemberStatus status
    );
    event MemberStatusUpdated(bytes32 indexed memberId, MemberStatus status);
    event MemberAllowedChainUpdated(bytes32 indexed memberId, uint256 indexed chainId, bool allowed);

    constructor(address governor_, address timelock_) Governed(governor_, timelock_) {
        if (governor_ != address(0)) {
            owner = governor_;
            emit OwnershipTransferred(msg.sender, governor_);
        }
    }

    function registerPartner(uint256 chainId, address treasury, bytes32 policyHash, string calldata metadataURI)
        external
        onlyGovernance
    {
        require(chainId != 0, "chainId=0");
        require(treasury != address(0), "treasury=0");
        TreasuryInvariants.requireContract(treasury);
        partners[chainId] = Partner({
            chainId: chainId,
            treasury: treasury,
            policyHash: policyHash,
            metadataURI: metadataURI,
            active: true,
            registeredAt: block.timestamp
        });
        emit PartnerRegistered(chainId, treasury, policyHash);
    }

    function deactivatePartner(uint256 chainId) external onlyGovernance {
        Partner storage partner = partners[chainId];
        partner.active = false;
        emit PartnerDeactivated(chainId);
    }

    function registerTreaty(bytes32 treatyId, address treaty, uint256 partnerChainId) external onlyGovernance {
        require(treatyId != bytes32(0), "treatyId=0");
        require(treaty != address(0), "treaty=0");
        require(partnerChainId != 0, "chainId=0");
        TreasuryInvariants.requireContract(treaty);
        treaties[treatyId] = TreatyInfo({
            treatyId: treatyId,
            treaty: treaty,
            partnerChainId: partnerChainId,
            active: true,
            registeredAt: block.timestamp
        });
        emit TreatyRegistered(treatyId, treaty, partnerChainId);
    }

    function deactivateTreaty(bytes32 treatyId) external onlyGovernance {
        treaties[treatyId].active = false;
        emit TreatyDeactivated(treatyId);
    }

    function upsertMember(
        bytes32 memberId,
        address controller,
        bytes32 metadataHash,
        uint16 riskCapBps,
        uint16 maxExposureBps,
        uint16 revenueShareBps
    ) external onlyGovernance {
        require(memberId != bytes32(0), "memberId=0");
        require(controller != address(0), "controller=0");
        require(riskCapBps <= 10_000, "risk>10000");
        require(maxExposureBps <= 10_000, "exposure>10000");
        require(revenueShareBps <= 10_000, "share>10000");

        Member storage member = members[memberId];
        member.memberId = memberId;
        member.controller = controller;
        member.metadataHash = metadataHash;
        member.riskCapBps = riskCapBps;
        member.maxExposureBps = maxExposureBps;
        member.revenueShareBps = revenueShareBps;
        if (member.status == MemberStatus.NONE || member.status == MemberStatus.REMOVED) {
            member.status = MemberStatus.ACTIVE;
        }
        member.updatedAt = block.timestamp;

        emit MemberUpserted(
            memberId,
            controller,
            riskCapBps,
            maxExposureBps,
            revenueShareBps,
            member.status
        );
    }

    function setMemberStatus(bytes32 memberId, MemberStatus status) external onlyGovernance {
        require(memberId != bytes32(0), "memberId=0");
        Member storage member = members[memberId];
        require(member.memberId != bytes32(0), "member_not_found");
        member.status = status;
        member.updatedAt = block.timestamp;
        emit MemberStatusUpdated(memberId, status);
    }

    function setMemberAllowedChain(bytes32 memberId, uint256 chainId, bool allowed) external onlyGovernance {
        require(memberId != bytes32(0), "memberId=0");
        require(chainId != 0, "chainId=0");
        Member storage member = members[memberId];
        require(member.memberId != bytes32(0), "member_not_found");
        memberAllowedChains[memberId][chainId] = allowed;
        member.updatedAt = block.timestamp;
        emit MemberAllowedChainUpdated(memberId, chainId, allowed);
    }

    function isMemberCompliant(bytes32 memberId, uint256 destinationChainId, uint16 exposureBps, uint16 riskBps)
        external
        view
        returns (bool)
    {
        Member storage member = members[memberId];
        if (member.status != MemberStatus.ACTIVE) return false;
        if (!memberAllowedChains[memberId][destinationChainId]) return false;
        if (exposureBps > member.maxExposureBps) return false;
        if (riskBps > member.riskCapBps) return false;
        return true;
    }
}
