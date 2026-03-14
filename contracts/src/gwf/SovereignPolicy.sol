// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.24;

/// @title  SovereignPolicy
/// @notice Global sovereign policy coordination engine for GWF.
///         Coordinates economic policies across central banks and treasuries.
contract SovereignPolicy {

    struct PolicyDirective {
        string   title;
        string   description;
        bytes    parameters;     // ABI-encoded policy parameters
        address  issuer;
        uint256  issuedAt;
        uint256  effectiveAt;
        uint256  expiresAt;      // 0 = indefinite
        bool     active;
    }

    mapping(bytes32 => PolicyDirective) public directives;
    bytes32[]                           public directiveIds;
    mapping(address => bool)            public policyMakers;
    address public admin;

    event DirectiveIssued(bytes32 indexed id, string title, uint256 effectiveAt);
    event DirectiveRevoked(bytes32 indexed id);
    event PolicyMakerAdded(address indexed maker);

    modifier onlyAdmin()       { require(msg.sender == admin, "SovPolicy: not admin"); _; }
    modifier onlyPolicyMaker() {
        require(policyMakers[msg.sender] || msg.sender == admin, "SovPolicy: not policy maker");
        _;
    }

    constructor() {
        admin = msg.sender;
        policyMakers[msg.sender] = true;
    }

    function addPolicyMaker(address m) external onlyAdmin {
        policyMakers[m] = true;
        emit PolicyMakerAdded(m);
    }

    function issueDirective(
        string memory title,
        string memory description,
        bytes memory  parameters,
        uint256       effectiveDelay,
        uint256       duration
    ) external onlyPolicyMaker returns (bytes32 id) {
        id = keccak256(abi.encode(title, msg.sender, block.timestamp));
        uint256 effectiveAt = block.timestamp + effectiveDelay;
        uint256 expiresAt   = duration > 0 ? effectiveAt + duration : 0;
        directives[id] = PolicyDirective({
            title:       title,
            description: description,
            parameters:  parameters,
            issuer:      msg.sender,
            issuedAt:    block.timestamp,
            effectiveAt: effectiveAt,
            expiresAt:   expiresAt,
            active:      true
        });
        directiveIds.push(id);
        emit DirectiveIssued(id, title, effectiveAt);
    }

    function revokeDirective(bytes32 id) external onlyPolicyMaker {
        directives[id].active = false;
        emit DirectiveRevoked(id);
    }

    function isEffective(bytes32 id) external view returns (bool) {
        PolicyDirective storage d = directives[id];
        if (!d.active) return false;
        if (block.timestamp < d.effectiveAt) return false;
        if (d.expiresAt > 0 && block.timestamp > d.expiresAt) return false;
        return true;
    }

    function directiveCount() external view returns (uint256) { return directiveIds.length; }
}
