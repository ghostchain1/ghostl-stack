// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IGovernorV1 {
    function votingToken() external view returns (address);
    function proposals(uint256 id)
        external
        view
        returns (
            address target,
            uint256 value,
            bytes memory data,
            uint256 forVotes,
            uint256 againstVotes,
            uint256 start,
            uint256 end,
            bool queued,
            bool executed
        );
}

interface IGST20Supply {
    function totalSupply() external view returns (uint256);
}

/// @notice Constitutional proposal contract that locks AI to policy-proposer-only,
/// forbids fork-choice/finality control, and records a ratified constitution hash.
contract AIConstitutionalProposal {
    bytes32 public constant POLICY_NAMESPACE = keccak256("ghost.ai.policy.consensus");
    bytes32 public constant AI_ROLE_POLICY_PROPOSER_ONLY = keccak256("ghost.ai.role.policy_proposer_only");

    bytes32 public constant FORBIDDEN_FORK_CHOICE = keccak256("ghost.ai.forbidden.fork_choice");
    bytes32 public constant FORBIDDEN_BLOCK_ORDERING = keccak256("ghost.ai.forbidden.block_ordering");
    bytes32 public constant FORBIDDEN_FINALITY = keccak256("ghost.ai.forbidden.finality");

    address public immutable governor;
    address public immutable executor;
    address public immutable votingToken;

    uint16 public immutable supermajorityBps;
    uint16 public immutable quorumBps;
    uint64 public immutable activationDelaySeconds;

    uint16 public immutable maxAuthorityBps;
    bytes32 public immutable emergencyScope;
    uint64 public immutable emergencyExpirySeconds;

    bytes32 public constitutionHash;
    bool public ratified;
    uint64 public ratifiedAt;
    uint64 public activatesAt;
    uint256 public ratificationProposalId;

    mapping(bytes32 => bool) public forbiddenAction;

    event PolicyNamespaceReserved(bytes32 namespace);
    event GuardrailsConfigured(uint16 maxAuthorityBps, bytes32 emergencyScope, uint64 emergencyExpirySeconds);
    event ForbiddenActionSet(bytes32 indexed actionId, bool forbidden);
    event Ratified(
        bytes32 indexed constitutionHash,
        uint256 indexed proposalId,
        uint64 ratifiedAt,
        uint64 activatesAt,
        uint16 supermajorityBps,
        uint16 quorumBps
    );

    error NotExecutor();
    error AlreadyRatified();
    error VoteStillActive();
    error ProposalMismatch();
    error ProposalNotPassed();
    error BelowSupermajority();
    error BelowQuorum();

    constructor(
        address governor_,
        address executor_,
        uint16 supermajorityBps_,
        uint16 quorumBps_,
        uint64 activationDelaySeconds_,
        uint16 maxAuthorityBps_,
        bytes32 emergencyScope_,
        uint64 emergencyExpirySeconds_
    ) {
        require(governor_ != address(0), "governor=0");
        require(executor_ != address(0), "executor=0");
        require(supermajorityBps_ > 5000 && supermajorityBps_ <= 10_000, "bad supermajority");
        require(quorumBps_ <= 10_000, "bad quorum");
        require(activationDelaySeconds_ > 0, "delay=0");
        require(maxAuthorityBps_ > 0 && maxAuthorityBps_ <= 10_000, "bad authority");
        require(emergencyExpirySeconds_ > 0, "bad expiry");

        governor = governor_;
        executor = executor_;
        votingToken = IGovernorV1(governor_).votingToken();
        require(votingToken != address(0), "token=0");

        supermajorityBps = supermajorityBps_;
        quorumBps = quorumBps_;
        activationDelaySeconds = activationDelaySeconds_;
        maxAuthorityBps = maxAuthorityBps_;
        emergencyScope = emergencyScope_;
        emergencyExpirySeconds = emergencyExpirySeconds_;

        forbiddenAction[FORBIDDEN_FORK_CHOICE] = true;
        forbiddenAction[FORBIDDEN_BLOCK_ORDERING] = true;
        forbiddenAction[FORBIDDEN_FINALITY] = true;

        emit ForbiddenActionSet(FORBIDDEN_FORK_CHOICE, true);
        emit ForbiddenActionSet(FORBIDDEN_BLOCK_ORDERING, true);
        emit ForbiddenActionSet(FORBIDDEN_FINALITY, true);
        emit PolicyNamespaceReserved(POLICY_NAMESPACE);
        emit GuardrailsConfigured(maxAuthorityBps_, emergencyScope_, emergencyExpirySeconds_);
    }

    function isActive() external view returns (bool) {
        return ratified && block.timestamp >= activatesAt;
    }

    function ratify(uint256 proposalId, bytes32 constitutionHash_) external {
        if (msg.sender != executor) revert NotExecutor();
        if (ratified) revert AlreadyRatified();

        (
            address target,
            uint256 value,
            bytes memory data,
            uint256 forVotes,
            uint256 againstVotes,
            ,
            uint256 end,
            ,
            bool executed
        ) = IGovernorV1(governor).proposals(proposalId);

        if (target != address(this) || value != 0) revert ProposalMismatch();
        if (keccak256(data) != keccak256(msg.data)) revert ProposalMismatch();
        if (!executed) {
            if (block.timestamp <= end) revert VoteStillActive();
        }
        if (forVotes <= againstVotes) revert ProposalNotPassed();

        uint256 totalSupply = IGST20Supply(votingToken).totalSupply();
        require(totalSupply > 0, "supply=0");

        uint256 participation = forVotes + againstVotes;
        if (quorumBps > 0 && participation * 10_000 < totalSupply * quorumBps) {
            revert BelowQuorum();
        }
        if (forVotes * 10_000 < totalSupply * supermajorityBps) {
            revert BelowSupermajority();
        }

        ratified = true;
        ratificationProposalId = proposalId;
        constitutionHash = constitutionHash_;
        ratifiedAt = uint64(block.timestamp);
        activatesAt = uint64(block.timestamp + activationDelaySeconds);

        emit Ratified(constitutionHash_, proposalId, ratifiedAt, activatesAt, supermajorityBps, quorumBps);
    }
}
