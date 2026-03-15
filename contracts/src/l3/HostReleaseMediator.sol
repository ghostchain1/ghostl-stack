// GhostChain Contracts v5.6.1 (contracts/src/l3/HostReleaseMediator.sol)
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {GhostBrand} from "../GhostBrand.sol";
import {GhostOwnable} from "../ghost/GhostOwnable.sol";
import {GhostECDSA} from "../ghost/GhostECDSA.sol";

interface IAgencyRecruitment {
    function leaveAgency(address host) external;
    function getAgency(address host) external view returns (bytes32);
}

/// @title HostReleaseMediator
/// @notice AI-mediated host agency release on GhostL3.
///         GhostBrain oracle signs the release verdict; this contract verifies and executes.
contract HostReleaseMediator is GhostBrand, GhostOwnable {
    using GhostECDSA for bytes32;

    error WrongChain(uint256 expected, uint256 actual);
    error InvalidSignature();
    error RequestNotFound(bytes32 requestId);
    error AlreadyProcessed(bytes32 requestId);
    error NotInAnyAgency(address host);

    enum Decision { Pending, Approved, Denied, Escalated }

    struct ReleaseRequest {
        address host;
        bytes32 agencyId;
        string  reason;
        uint256 timestamp;
        Decision decision;
    }

    event ReleaseRequested(bytes32 indexed requestId, address indexed host, bytes32 agencyId);
    event ReleaseExecuted(bytes32 indexed requestId, address indexed host, Decision decision);
    event OracleSet(address indexed oracle);

    IAgencyRecruitment public immutable RECRUITMENT;

    /// @dev GhostBrain signing oracle address
    address public ghostBrainOracle;

    mapping(bytes32 => ReleaseRequest) public requests;

    constructor(address _recruitment, address _oracle, address _owner) GhostOwnable(_owner) {
        require(_recruitment != address(0), "Zero recruitment");
        require(_oracle != address(0), "Zero oracle");
        RECRUITMENT = IAgencyRecruitment(_recruitment);
        ghostBrainOracle = _oracle;
    }

    function setOracle(address _oracle) external onlyOwner {
        require(_oracle != address(0), "Zero address");
        ghostBrainOracle = _oracle;
        emit OracleSet(_oracle);
    }

    function requestRelease(string calldata reason) external returns (bytes32 requestId) {
        if (block.chainid != L3_CHAIN_ID) revert WrongChain(L3_CHAIN_ID, block.chainid);
        bytes32 agencyId = RECRUITMENT.getAgency(msg.sender);
        if (agencyId == bytes32(0)) revert NotInAnyAgency(msg.sender);

        requestId = keccak256(abi.encodePacked(msg.sender, agencyId, block.timestamp));
        requests[requestId] = ReleaseRequest({
            host:      msg.sender,
            agencyId:  agencyId,
            reason:    reason,
            timestamp: block.timestamp,
            decision:  Decision.Pending
        });
        emit ReleaseRequested(requestId, msg.sender, agencyId);
    }

    /// @notice GhostBrain oracle submits decision + ECDSA signature over (requestId, decision).
    function executeRelease(
        bytes32 requestId,
        Decision decision,
        bytes calldata ghostBrainSignature
    ) external {
        if (block.chainid != L3_CHAIN_ID) revert WrongChain(L3_CHAIN_ID, block.chainid);
        ReleaseRequest storage req = requests[requestId];
        if (req.host == address(0)) revert RequestNotFound(requestId);
        if (req.decision != Decision.Pending) revert AlreadyProcessed(requestId);

        bytes32 msgHash;
        assembly {
            let ptr := mload(0x40)
            mstore(ptr, requestId)
            mstore8(add(ptr, 0x20), decision)
            msgHash := keccak256(ptr, 0x21)
        }
        address signer  = msgHash.toEthSignedMessageHash().recover(ghostBrainSignature);
        if (signer != ghostBrainOracle) revert InvalidSignature();

        req.decision = decision;

        if (decision == Decision.Approved) {
            RECRUITMENT.leaveAgency(req.host);
        }

        emit ReleaseExecuted(requestId, req.host, decision);
    }

    function getRequest(bytes32 requestId) external view returns (ReleaseRequest memory) {
        return requests[requestId];
    }
}
