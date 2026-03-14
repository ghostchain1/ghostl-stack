// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.24;

/// @title  SovereignReserve
/// @notice Manages digital national reserves on GhostChain L1.
///         Reserve creation requires a 3-of-5 sovereign validator quorum.
///         Supported types: GOLD, OIL, FOREX, BONDS, GDP, ENERGY, MILITARY.
contract SovereignReserve {

    struct Reserve {
        string  name;
        string  reserveType;
        uint256 supply;
        address issuer;
        uint256 issuedAt;
        bool    active;
    }

    struct ApprovalVotes {
        uint256 count;
        bool    executed;
        mapping(address => bool) voted;
    }

    mapping(bytes32 => Reserve)       public reserves;
    mapping(bytes32 => ApprovalVotes) private votes;
    mapping(address => bool)          public sovereignValidators;
    uint256 public validatorCount;
    uint8   public constant REQUIRED_APPROVALS = 3;
    address public governance;
    bytes32[] public reserveIds;

    event ReserveProposed(bytes32 indexed id, string name, address proposer);
    event ReserveApproved(bytes32 indexed id, address validator, uint256 approvalCount);
    event ReserveCreated(bytes32 indexed id, string name, uint256 supply);
    event ReserveDeactivated(bytes32 indexed id);
    event ValidatorAdded(address indexed validator);
    event ValidatorRemoved(address indexed validator);

    modifier onlyGovernance() { require(msg.sender == governance, "SR: not governance"); _; }
    modifier onlyValidator()  { require(sovereignValidators[msg.sender], "SR: not validator"); _; }

    constructor() {
        governance = msg.sender;
        sovereignValidators[msg.sender] = true;
        validatorCount = 1;
    }

    function addValidator(address v) external onlyGovernance {
        require(!sovereignValidators[v], "SR: already validator");
        sovereignValidators[v] = true;
        validatorCount++;
        emit ValidatorAdded(v);
    }

    function removeValidator(address v) external onlyGovernance {
        require(sovereignValidators[v], "SR: not validator");
        sovereignValidators[v] = false;
        validatorCount--;
        emit ValidatorRemoved(v);
    }

    function proposeReserve(string memory name, string memory reserveType, uint256 supply)
        external returns (bytes32 id)
    {
        id = keccak256(abi.encode(name, block.timestamp, msg.sender));
        reserves[id] = Reserve({
            name:        name,
            reserveType: reserveType,
            supply:      supply,
            issuer:      msg.sender,
            issuedAt:    block.timestamp,
            active:      false
        });
        reserveIds.push(id);
        emit ReserveProposed(id, name, msg.sender);
    }

    function approveReserve(bytes32 id) external onlyValidator {
        Reserve storage r = reserves[id];
        require(!r.active, "SR: already active");
        ApprovalVotes storage v = votes[id];
        require(!v.voted[msg.sender], "SR: already voted");
        v.voted[msg.sender] = true;
        v.count++;
        emit ReserveApproved(id, msg.sender, v.count);
        if (v.count >= REQUIRED_APPROVALS && !v.executed) {
            v.executed = true;
            r.active   = true;
            emit ReserveCreated(id, r.name, r.supply);
        }
    }

    function deactivateReserve(bytes32 id) external onlyGovernance {
        reserves[id].active = false;
        emit ReserveDeactivated(id);
    }

    function reserveCount() external view returns (uint256) { return reserveIds.length; }
}
