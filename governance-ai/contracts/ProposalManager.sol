// GhostChain Contracts v5.6.1 (governance-ai/contracts/ProposalManager.sol)
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

// NOTE: When moved into contracts/src/, replace this inline block with:
//   import { GhostBrand } from "../GhostBrand.sol";

/**
 * @title ProposalManager
 * @notice Entry-point for submitting governance proposals to GhostChain.
 *
 * Proposal submission model:
 *   Any GST-holding address with enough stake deposit (MIN_DEPOSIT) may submit
 *   a proposal.  Off-chain verification (GhostBrain analysis + GID identity)
 *   happens before submission, but this contract enforces on-chain minimums.
 *
 *   On submission:
 *     1. Proposer sends MIN_DEPOSIT GST (held in escrow until proposal closes).
 *     2. ProposalManager calls GovernanceCore.openProposal().
 *     3. A `ProposalCreated` event is emitted with the GovernanceCore id.
 *     4. Deposit is returned if the proposal passes, slashed (to treasury) if defeated.
 *
 * Layer routing:
 *   Proposals targeting L2 / L3 are opened on L1 and relayed by the off-chain
 *   Execution Engine.  This contract records the target layer for routing.
 *
 * Security:
 *   - MIN_DEPOSIT prevents spam submissions.
 *   - Reentrancy guard on `submit()`.
 *   - GST deposit handled via low-level call with return check.
 *   - Admin = GhostChainGovernor (set post-deploy).
 *
 * Chain: GhostChain L1 (chain_id 14000101).
 * Gas token: GST (native, deposited as ETH-equivalent value).
 */
interface IGovernanceCore {
    enum ProposalLayer { L1, L2, L3 }
    function openProposal(
        address proposer,
        string calldata description,
        ProposalLayer layer,
        uint64 votingPeriodSecs,
        uint256 totalVotingPower
    ) external returns (uint256 id);
}

contract ProposalManager {

    // ─── GhostBrand Constants (inlined) ──────────────────────────────────────

    uint256 internal constant L1_CHAIN_ID = 14000101;
    uint256 internal constant L2_CHAIN_ID = 901;
    uint256 internal constant L3_CHAIN_ID = 903;
    uint256 internal constant GST_UNIT    = 1e18;

    // ─── Config ───────────────────────────────────────────────────────────────

    /// @notice Minimum GST deposit required to submit a proposal (100 GST).
    uint256 public constant MIN_DEPOSIT = 100 * GST_UNIT;

    /// @notice Default voting period: 3 days in seconds.
    uint64 public constant DEFAULT_VOTING_PERIOD = 3 * 86_400;

    // ─── Types ────────────────────────────────────────────────────────────────

    enum TargetLayer { L1, L2, L3 }

    struct SubmissionRecord {
        uint256 coreId;          // Corresponding id in GovernanceCore
        address proposer;
        uint256 deposit;         // GST (in wei) held in escrow
        bool    depositReturned;
    }

    // ─── Storage ──────────────────────────────────────────────────────────────

    address public admin;
    address public treasury;
    IGovernanceCore public governanceCore;

    /// @notice Spam-prevention: minimum blocks between proposals per address.
    uint256 public cooldownBlocks = 1000; // ~3 hours at 12s/block

    mapping(address => uint256) public lastProposalBlock;

    /// @notice local submission id (1-indexed) → submission record
    mapping(uint256 => SubmissionRecord) private _submissions;
    uint256 public submissionCount;

    /// @notice Reentrancy guard.
    bool private _locked;

    // ─── Events ───────────────────────────────────────────────────────────────

    event ProposalCreated(
        uint256 indexed submissionId,
        uint256 indexed coreId,
        address indexed proposer,
        TargetLayer     layer,
        string          description,
        uint256         deposit
    );
    event DepositReturned(uint256 indexed submissionId, address indexed proposer, uint256 amount);
    event DepositSlashed(uint256 indexed submissionId, address indexed treasury, uint256 amount);

    // ─── Errors ───────────────────────────────────────────────────────────────

    error NotAdmin();
    error ZeroAddress();
    error DepositTooLow(uint256 sent, uint256 required);
    error CooldownActive(uint256 blocksRemaining);
    error InvalidSubmissionId(uint256 id);
    error DepositAlreadySettled(uint256 id);
    error TransferFailed();
    error Reentrancy();
    error CoreNotSet();

    // ─── Modifiers ────────────────────────────────────────────────────────────

    modifier onlyAdmin() {
        _onlyAdmin();
        _;
    }

    modifier nonReentrant() {
        if (_locked) revert Reentrancy();
        _locked = true;
        _;
        _locked = false;
    }

    function _onlyAdmin() internal view {
        if (msg.sender != admin) revert NotAdmin();
    }

    // ─── Constructor ──────────────────────────────────────────────────────────

    constructor(address treasury_, address governanceCore_) {
        if (treasury_       == address(0)) revert ZeroAddress();
        if (governanceCore_ == address(0)) revert ZeroAddress();
        admin          = msg.sender;
        treasury       = treasury_;
        governanceCore = IGovernanceCore(governanceCore_);
    }

    // ─── Admin ────────────────────────────────────────────────────────────────

    function setTreasury(address t) external onlyAdmin {
        if (t == address(0)) revert ZeroAddress();
        treasury = t;
    }

    function setGovernanceCore(address c) external onlyAdmin {
        if (c == address(0)) revert ZeroAddress();
        governanceCore = IGovernanceCore(c);
    }

    function setCooldown(uint256 blocks) external onlyAdmin {
        cooldownBlocks = blocks;
    }

    function transferAdmin(address newAdmin) external onlyAdmin {
        if (newAdmin == address(0)) revert ZeroAddress();
        admin = newAdmin;
    }

    // ─── Submission ───────────────────────────────────────────────────────────

    /**
     * @notice Submit a governance proposal.
     * @param description       Short title or IPFS CID of the full proposal document.
     * @param layer             Target layer (L1, L2, or L3).
     * @param totalVotingPower  GST snapshot supplied by off-chain indexer at time of submit.
     * @dev  Caller must send exactly MIN_DEPOSIT GST as msg.value (native token).
     */
    function submit(
        string calldata description,
        TargetLayer     layer,
        uint256         totalVotingPower
    )
        external payable nonReentrant
        returns (uint256 submissionId, uint256 coreId)
    {
        if (address(governanceCore) == address(0)) revert CoreNotSet();
        if (msg.value < MIN_DEPOSIT)
            revert DepositTooLow(msg.value, MIN_DEPOSIT);

        uint256 lastBlock = lastProposalBlock[msg.sender];
        if (lastBlock > 0 && block.number - lastBlock < cooldownBlocks) {
            revert CooldownActive(cooldownBlocks - (block.number - lastBlock));
        }

        lastProposalBlock[msg.sender] = block.number;
        unchecked { submissionId = ++submissionCount; }

        coreId = governanceCore.openProposal(
            msg.sender,
            description,
            _toCoreLyer(layer),
            DEFAULT_VOTING_PERIOD,
            totalVotingPower
        );

        _submissions[submissionId] = SubmissionRecord({
            coreId:          coreId,
            proposer:        msg.sender,
            deposit:         msg.value,
            depositReturned: false
        });

        emit ProposalCreated(submissionId, coreId, msg.sender, layer, description, msg.value);
    }

    /**
     * @notice Return deposit to proposer after a passed + executed proposal.
     */
    function returnDeposit(uint256 submissionId) external nonReentrant {
        SubmissionRecord storage rec = _getSubmission(submissionId);
        if (rec.depositReturned) revert DepositAlreadySettled(submissionId);
        rec.depositReturned = true;

        address proposer = rec.proposer;
        uint256 amount   = rec.deposit;

        (bool ok,) = proposer.call{value: amount}("");
        if (!ok) revert TransferFailed();

        emit DepositReturned(submissionId, proposer, amount);
    }

    /**
     * @notice Slash deposit to treasury after a defeated proposal.
     */
    function slashDeposit(uint256 submissionId) external onlyAdmin nonReentrant {
        SubmissionRecord storage rec = _getSubmission(submissionId);
        if (rec.depositReturned) revert DepositAlreadySettled(submissionId);
        rec.depositReturned = true;

        uint256 amount = rec.deposit;
        (bool ok,) = treasury.call{value: amount}("");
        if (!ok) revert TransferFailed();

        emit DepositSlashed(submissionId, treasury, amount);
    }

    // ─── Views ────────────────────────────────────────────────────────────────

    function getSubmission(uint256 id) external view returns (SubmissionRecord memory) {
        return _getSubmission(id);
    }

    // ─── Internal ─────────────────────────────────────────────────────────────

    function _getSubmission(uint256 id) internal view returns (SubmissionRecord storage rec) {
        rec = _submissions[id];
        if (rec.coreId == 0) revert InvalidSubmissionId(id);
    }

    function _toCoreLyer(TargetLayer tl) internal pure returns (IGovernanceCore.ProposalLayer) {
        if (tl == TargetLayer.L2) return IGovernanceCore.ProposalLayer.L2;
        if (tl == TargetLayer.L3) return IGovernanceCore.ProposalLayer.L3;
        return IGovernanceCore.ProposalLayer.L1;
    }

    /// @notice Accept native GST deposits (for treasury refunds, etc.).
    receive() external payable {}
}
