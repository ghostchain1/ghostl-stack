// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title InfrastructureFund — sovereign infrastructure project tokenisation & funding
contract InfrastructureFund {

    struct Project {
        string  name;           // e.g. "INFRA-HIGHWAY-101"
        address nation;
        uint256 targetFunding;  // in wei
        uint256 raised;
        uint256 completionDate; // unix timestamp target
        bool    active;
        bool    completed;
    }

    struct Bond {
        uint256 projectId;
        address holder;
        uint256 principal;
        uint256 couponBps;      // annual coupon in basis points
        uint256 issuedAt;
        bool    redeemed;
    }

    uint256 public nextProjectId;
    uint256 public nextBondId;

    mapping(uint256 => Project) public projects;
    mapping(uint256 => Bond)    public bonds;
    mapping(address => uint256[]) public holderBonds;

    address public governance;

    event ProjectCreated(uint256 indexed id, string name, uint256 target);
    event BondIssued(uint256 indexed bondId, uint256 indexed projectId, address holder, uint256 principal);
    event BondRedeemed(uint256 indexed bondId, address holder, uint256 payout);
    event ProjectCompleted(uint256 indexed id);

    modifier onlyGovernance() {
        require(msg.sender == governance, "InfrastructureFund: not governance");
        _;
    }

    constructor(address _gov) {
        governance = _gov;
    }

    function createProject(
        string calldata name,
        address nation,
        uint256 targetFunding,
        uint256 completionDate
    ) external onlyGovernance returns (uint256 id) {
        id = nextProjectId++;
        projects[id] = Project(name, nation, targetFunding, 0, completionDate, true, false);
        emit ProjectCreated(id, name, targetFunding);
    }

    function issueBond(
        uint256 projectId,
        address holder,
        uint256 couponBps
    ) external payable onlyGovernance returns (uint256 bondId) {
        Project storage p = projects[projectId];
        require(p.active && !p.completed, "InfrastructureFund: project not open");
        require(msg.value > 0, "InfrastructureFund: zero principal");
        p.raised += msg.value;
        bondId = nextBondId++;
        bonds[bondId] = Bond(projectId, holder, msg.value, couponBps, block.timestamp, false);
        holderBonds[holder].push(bondId);
        emit BondIssued(bondId, projectId, holder, msg.value);
    }

    function redeemBond(uint256 bondId) external {
        Bond storage b = bonds[bondId];
        require(!b.redeemed, "InfrastructureFund: already redeemed");
        require(b.holder == msg.sender, "InfrastructureFund: not holder");
        b.redeemed = true;
        // simple: return principal (coupon paid off-chain via budget)
        uint256 payout = b.principal;
        (bool ok,) = payable(msg.sender).call{value: payout}("");
        require(ok, "InfrastructureFund: transfer failed");
        emit BondRedeemed(bondId, msg.sender, payout);
    }

    function markComplete(uint256 projectId) external onlyGovernance {
        projects[projectId].completed = true;
        emit ProjectCompleted(projectId);
    }

    receive() external payable {}
}
