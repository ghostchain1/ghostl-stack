// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../../common/Governed.sol";
import "../../treasury/TreasuryInvariants.sol";

/// @notice Registry of federated treasury partners and treaty contracts.
contract FederationRegistry is Governed {
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

    mapping(uint256 => Partner) public partners;
    mapping(bytes32 => TreatyInfo) public treaties;

    event PartnerRegistered(uint256 indexed chainId, address indexed treasury, bytes32 policyHash);
    event PartnerDeactivated(uint256 indexed chainId);
    event TreatyRegistered(bytes32 indexed treatyId, address indexed treaty, uint256 indexed partnerChainId);
    event TreatyDeactivated(bytes32 indexed treatyId);

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
}
