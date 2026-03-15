// GhostChain Contracts v5.6.1 (contracts/src/l3/AgencyRecruitment.sol)
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {GhostBrand} from "../GhostBrand.sol";
import {GhostOwnable} from "../ghost/GhostOwnable.sol";

/// @title AgencyRecruitment
/// @notice On-chain agency membership registry for GhostL3 hosts.
contract AgencyRecruitment is GhostBrand, GhostOwnable {
    error WrongChain(uint256 expected, uint256 actual);
    error AlreadyInAgency(address host, bytes32 agencyId);
    error NotInAgency(address host);
    error Unauthorized();

    event HostJoined(bytes32 indexed agencyId, address indexed host);
    event HostLeft(bytes32 indexed agencyId, address indexed host);
    event MediatorSet(address indexed mediator);

    /// @dev mediator is the HostReleaseMediator contract
    address public mediator;

    mapping(address => bytes32) public hostToAgency;
    mapping(bytes32 => uint256) public agencyHostCount;

    constructor(address _owner) GhostOwnable(_owner) {}

    function setMediator(address _mediator) external onlyOwner {
        require(_mediator != address(0), "Zero address");
        mediator = _mediator;
        emit MediatorSet(_mediator);
    }

    function joinAgency(bytes32 agencyId) external {
        if (block.chainid != L3_CHAIN_ID) revert WrongChain(L3_CHAIN_ID, block.chainid);
        if (hostToAgency[msg.sender] != bytes32(0)) {
            revert AlreadyInAgency(msg.sender, hostToAgency[msg.sender]);
        }
        hostToAgency[msg.sender] = agencyId;
        agencyHostCount[agencyId] += 1;
        emit HostJoined(agencyId, msg.sender);
    }

    /// @notice Only callable by HostReleaseMediator or owner.
    function leaveAgency(address host) external {
        if (block.chainid != L3_CHAIN_ID) revert WrongChain(L3_CHAIN_ID, block.chainid);
        if (msg.sender != mediator && msg.sender != owner()) revert Unauthorized();
        bytes32 agencyId = hostToAgency[host];
        if (agencyId == bytes32(0)) revert NotInAgency(host);
        agencyHostCount[agencyId] -= 1;
        delete hostToAgency[host];
        emit HostLeft(agencyId, host);
    }

    function getAgency(address host) external view returns (bytes32) {
        return hostToAgency[host];
    }

    function getHostCount(bytes32 agencyId) external view returns (uint256) {
        return agencyHostCount[agencyId];
    }
}
