// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { GhostSafeCast as SafeCast } from "../common/GhostSafeCast.sol";
import "../common/Governed.sol";
import "../common/ReentrancyGuard.sol";
import "../common/GhostHash.sol";

interface ISolvencyVerifier {
    function verifyProof(bytes calldata proof, bytes32 assetsRoot, bytes32 liabilitiesRoot, bytes32 netPositionRoot, uint256 epoch)
        external
        view
        returns (bool);
}

interface IGST20Burnable {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function burn(address from, uint256 amount) external;
}

/// @notice Governance-gated treasury engine for sovereign L3->L2->L1 revenue flow.
/// @dev Capital deployment is L1-only and requires governance proposal metadata.
contract SovereignTreasuryEngine is Governed, ReentrancyGuard {
    using SafeCast for uint256;

    struct AllocationRequest {
        bytes32 allocationId;
        uint256 deployedAmountWei;
        uint16 expectedApyBps;
        uint16 riskScoreBps;
        uint256 destinationChainId;
        address target;
        string governanceProposalId;
        bytes metadata;
    }

    struct TreasurySnapshot {
        uint256 recordedAt;
        uint256 revenueBalanceWei;
        uint256 deployedCapitalWei;
        uint256 yieldReturnedWei;
        uint16 riskExposureBps;
        bytes32 assetsRoot;
        bytes32 liabilitiesRoot;
        bytes32 netPositionRoot;
        bytes32 solvencyCommitment;
        uint32 circuitVersion;
        bytes32 metadataHash;
    }

    uint256 public immutable l1ChainId;
    uint256 public immutable l2ChainId;
    address public immutable l2RevenueAggregator;

    address public yieldRouter;
    address public gstToken;

    uint256 public revenueBalanceWei;
    uint256 public deployedCapitalWei;
    uint256 public yieldReturnedWei;
    uint16 public riskExposureBps;
    uint16 public maxSingleAllocationBps;
    uint16 public maxTotalDeployedBps;
    uint16 public maxRiskExposureBps;
    uint256 public minOperationalReserveWei;

    address public solvencyVerifier;
    uint64 public solvencyMaxAgeSeconds;
    uint256 public latestSolvencyEpoch;
    uint256 public latestSolvencyVerifiedAt;
    bytes32 public latestSolvencyAssetsRoot;
    bytes32 public latestSolvencyLiabilitiesRoot;
    bytes32 public latestSolvencyNetPositionRoot;
    bytes32 public latestSolvencyCommitment;
    uint32 public latestSolvencyCircuitVersion;
    uint32 public defaultSolvencyCircuitVersion;
    bool public requireSnapshotSyncForAllocation;

    bool public emergencyHalt;
    bool public allocationPaused;
    bool public withdrawalFreeze;
    uint64 public minAllocationDelaySeconds;

    mapping(bytes32 => bool) public executedAllocations;
    mapping(bytes32 => uint64) public queuedAllocationExecuteAfter;
    mapping(bytes32 => bytes32) public queuedAllocationHash;
    mapping(uint256 => TreasurySnapshot) public treasurySnapshots;
    mapping(uint256 => bool) public treasurySnapshotExists;
    uint256 public latestSnapshotEpoch;
    mapping(uint256 => bytes32) public solvencyCommitmentByEpoch;
    mapping(uint256 => uint32) public solvencyCircuitVersionByEpoch;
    mapping(uint256 => bytes32) public solvencyProofDigestByEpoch;
    mapping(uint32 => address) public solvencyVerifierByCircuit;
    mapping(uint32 => bool) public solvencyCircuitEnabled;
    mapping(bytes32 => bool) public usedSolvencyProofDigest;

    event RevenueDepositedFromL2(address indexed sender, uint256 amountWei, uint256 revenueBalanceWei);
    event AllocationExecuted(
        bytes32 indexed allocationId,
        string governanceProposalId,
        uint256 deployedAmountWei,
        uint16 expectedApyBps,
        uint16 riskScoreBps,
        uint256 destinationChainId,
        address indexed target,
        uint256 deployedCapitalWei,
        uint16 riskExposureBps
    );
    event AllocationQueued(
        bytes32 indexed allocationId,
        string governanceProposalId,
        bytes32 allocationHash,
        uint64 executeAfter
    );
    event AllocationQueueCancelled(bytes32 indexed allocationId, bytes32 allocationHash);
    event YieldRecorded(
        bytes32 indexed allocationId,
        uint256 amountWei,
        uint16 observedApyBps,
        uint256 revenueBalanceWei,
        uint256 yieldReturnedWei
    );
    event PrincipalReturned(bytes32 indexed allocationId, uint256 amountWei, uint256 deployedCapitalWei);
    event TreasuryDeposit(address indexed sender, uint256 amountWei, uint256 revenueBalanceWei);
    event TreasuryWithdrawal(address indexed recipient, uint256 amountWei, uint256 revenueBalanceWei);
    event RewardsAllocated(bytes32 indexed allocationId, address indexed target, uint256 amountWei);
    event BuybackGST(address indexed buyer, uint256 amountWei);
    event BurnGST(address indexed initiator, uint256 amountWei);
    event GstTokenUpdated(address indexed previous, address indexed next);
    event YieldRouterUpdated(address indexed previousRouter, address indexed nextRouter);
    event SafetyFlagsUpdated(bool emergencyHalt, bool allocationPaused, bool withdrawalFreeze);
    event SolvencyVerifierUpdated(address indexed previousVerifier, address indexed nextVerifier);
    event SolvencyPolicyUpdated(uint64 maxAgeSeconds);
    event SolvencyProofSubmitted(
        uint256 indexed epoch,
        bytes32 indexed assetsRoot,
        bytes32 indexed liabilitiesRoot,
        bytes32 netPositionRoot,
        string governanceProposalId
    );
    event SolvencyProofAccepted(
        uint256 indexed epoch,
        uint32 indexed circuitVersion,
        bytes32 indexed commitment,
        bytes32 proofDigest,
        address verifier
    );
    event SolvencyCircuitVerifierConfigured(uint32 indexed circuitVersion, address indexed verifier, bool enabled);
    event DefaultSolvencyCircuitVersionUpdated(uint32 indexed previousVersion, uint32 indexed nextVersion);
    event SnapshotSyncForAllocationUpdated(bool required);
    event TreasurySnapshotRecorded(
        uint256 indexed epoch,
        bytes32 indexed metadataHash,
        bytes32 indexed snapshotHash,
        string governanceProposalId,
        uint256 revenueBalanceWei,
        uint256 deployedCapitalWei,
        uint256 yieldReturnedWei,
        uint16 riskExposureBps,
        bytes32 assetsRoot,
        bytes32 liabilitiesRoot,
        bytes32 netPositionRoot,
        bytes32 solvencyCommitment,
        uint32 circuitVersion
    );
    event RiskPolicyUpdated(
        uint256 minOperationalReserveWei,
        uint16 maxSingleAllocationBps,
        uint16 maxTotalDeployedBps,
        uint16 maxRiskExposureBps
    );
    event AllocationDelayUpdated(uint64 previousDelaySeconds, uint64 nextDelaySeconds);

    modifier onlyL1Chain() {
        require(block.chainid == l1ChainId, "l1_only");
        _;
    }

    modifier whenAllocationEnabled() {
        require(!emergencyHalt, "emergency_halt");
        require(!allocationPaused, "allocation_paused");
        _;
    }

    modifier onlyYieldRouterOrGovernance() {
        require(msg.sender == yieldRouter || msg.sender == governor || msg.sender == timelock, "not_yield_router_or_governance");
        _;
    }

    modifier whenSolvencyFresh() {
        if (solvencyMaxAgeSeconds > 0) {
            require(latestSolvencyVerifiedAt != 0, "solvency_proof_missing");
            require(block.timestamp <= latestSolvencyVerifiedAt + solvencyMaxAgeSeconds, "solvency_proof_stale");
        }
        if (latestSolvencyEpoch != 0) {
            require(solvencyCommitmentByEpoch[latestSolvencyEpoch] != bytes32(0), "solvency_commitment_missing");
        }
        if (requireSnapshotSyncForAllocation) {
            require(treasurySnapshotExists[latestSolvencyEpoch], "snapshot_required");
            require(latestSnapshotEpoch == latestSolvencyEpoch, "snapshot_epoch_stale");
        }
        _;
    }

    constructor(
        address governor_,
        address timelock_,
        uint256 l1ChainId_,
        uint256 l2ChainId_,
        address l2RevenueAggregator_
    ) Governed(governor_, timelock_) {
        require(l1ChainId_ != 0, "l1_chain_id=0");
        require(l2ChainId_ != 0, "l2_chain_id=0");
        require(l2RevenueAggregator_ != address(0), "l2_aggregator=0");

        l1ChainId = l1ChainId_;
        l2ChainId = l2ChainId_;
        l2RevenueAggregator = l2RevenueAggregator_;
        minAllocationDelaySeconds = 1 days;
        maxSingleAllocationBps = 5_000;
        maxTotalDeployedBps = 9_000;
        maxRiskExposureBps = 7_500;
        defaultSolvencyCircuitVersion = 0;
    }

    function availableCapitalWei() public view returns (uint256) {
        if (revenueBalanceWei <= deployedCapitalWei) return 0;
        return revenueBalanceWei - deployedCapitalWei;
    }

    function setYieldRouter(address nextRouter) external onlyGovernance {
        address previous = yieldRouter;
        yieldRouter = nextRouter;
        emit YieldRouterUpdated(previous, nextRouter);
    }

    function setSafetyFlags(bool emergencyHalt_, bool allocationPaused_, bool withdrawalFreeze_) external onlyGovernance {
        emergencyHalt = emergencyHalt_;
        allocationPaused = allocationPaused_;
        withdrawalFreeze = withdrawalFreeze_;
        emit SafetyFlagsUpdated(emergencyHalt_, allocationPaused_, withdrawalFreeze_);
    }

    function setSolvencyVerifier(address nextVerifier) external onlyGovernance {
        address previous = solvencyVerifier;
        solvencyVerifier = nextVerifier;
        solvencyVerifierByCircuit[0] = nextVerifier;
        solvencyCircuitEnabled[0] = nextVerifier != address(0);
        emit SolvencyVerifierUpdated(previous, nextVerifier);
        emit SolvencyCircuitVerifierConfigured(0, nextVerifier, solvencyCircuitEnabled[0]);
    }

    function setSolvencyMaxAgeSeconds(uint64 maxAgeSeconds) external onlyGovernance {
        solvencyMaxAgeSeconds = maxAgeSeconds;
        emit SolvencyPolicyUpdated(maxAgeSeconds);
    }

    function setSolvencyVerifierForCircuit(uint32 circuitVersion, address verifier, bool enabled) external onlyGovernance {
        if (enabled) require(verifier != address(0), "verifier=0");
        solvencyVerifierByCircuit[circuitVersion] = verifier;
        solvencyCircuitEnabled[circuitVersion] = enabled;
        if (circuitVersion == 0) {
            address previous = solvencyVerifier;
            solvencyVerifier = verifier;
            emit SolvencyVerifierUpdated(previous, verifier);
        }
        emit SolvencyCircuitVerifierConfigured(circuitVersion, verifier, enabled);
    }

    function setDefaultSolvencyCircuitVersion(uint32 circuitVersion) external onlyGovernance {
        if (circuitVersion != 0) {
            require(solvencyCircuitEnabled[circuitVersion], "circuit_disabled");
            require(solvencyVerifierByCircuit[circuitVersion] != address(0), "solvency_verifier_unset");
        }
        uint32 previous = defaultSolvencyCircuitVersion;
        defaultSolvencyCircuitVersion = circuitVersion;
        emit DefaultSolvencyCircuitVersionUpdated(previous, circuitVersion);
    }

    function setRequireSnapshotSyncForAllocation(bool required) external onlyGovernance {
        requireSnapshotSyncForAllocation = required;
        emit SnapshotSyncForAllocationUpdated(required);
    }

    function setMinAllocationDelaySeconds(uint64 nextDelaySeconds) external onlyGovernance {
        require(nextDelaySeconds <= 30 days, "delay_too_high");
        uint64 previous = minAllocationDelaySeconds;
        minAllocationDelaySeconds = nextDelaySeconds;
        emit AllocationDelayUpdated(previous, nextDelaySeconds);
    }

    function configureRiskPolicy(
        uint256 minOperationalReserveWei_,
        uint16 maxSingleAllocationBps_,
        uint16 maxTotalDeployedBps_,
        uint16 maxRiskExposureBps_
    ) external onlyGovernance {
        require(maxSingleAllocationBps_ <= 10_000, "single_cap>10000");
        require(maxTotalDeployedBps_ <= 10_000, "total_cap>10000");
        require(maxRiskExposureBps_ <= 10_000, "risk_cap>10000");
        require(maxSingleAllocationBps_ <= maxTotalDeployedBps_, "single_cap>total_cap");

        minOperationalReserveWei = minOperationalReserveWei_;
        maxSingleAllocationBps = maxSingleAllocationBps_;
        maxTotalDeployedBps = maxTotalDeployedBps_;
        maxRiskExposureBps = maxRiskExposureBps_;

        emit RiskPolicyUpdated(
            minOperationalReserveWei_,
            maxSingleAllocationBps_,
            maxTotalDeployedBps_,
            maxRiskExposureBps_
        );
    }

    function submitSolvencyProof(
        uint256 epoch,
        bytes32 assetsRoot,
        bytes32 liabilitiesRoot,
        bytes32 netPositionRoot,
        bytes calldata proof,
        string calldata governanceProposalId
    ) external onlyGovernance onlyL1Chain nonReentrant {
        _submitSolvencyProof(
            epoch,
            assetsRoot,
            liabilitiesRoot,
            netPositionRoot,
            proof,
            governanceProposalId,
            defaultSolvencyCircuitVersion
        );
    }

    function submitSolvencyProofWithCircuit(
        uint256 epoch,
        bytes32 assetsRoot,
        bytes32 liabilitiesRoot,
        bytes32 netPositionRoot,
        bytes calldata proof,
        string calldata governanceProposalId,
        uint32 circuitVersion
    ) external onlyGovernance onlyL1Chain nonReentrant {
        _submitSolvencyProof(epoch, assetsRoot, liabilitiesRoot, netPositionRoot, proof, governanceProposalId, circuitVersion);
    }

    function _submitSolvencyProof(
        uint256 epoch,
        bytes32 assetsRoot,
        bytes32 liabilitiesRoot,
        bytes32 netPositionRoot,
        bytes calldata proof,
        string calldata governanceProposalId,
        uint32 circuitVersion
    ) internal {
        require(epoch > latestSolvencyEpoch, "epoch_not_increasing");
        require(bytes(governanceProposalId).length > 0, "governance_proposal_required");
        require(assetsRoot != bytes32(0) && liabilitiesRoot != bytes32(0) && netPositionRoot != bytes32(0), "invalid_roots");

        bytes32 proofDigest = GhostHash.hash2(bytes32(uint256(circuitVersion)), keccak256(proof));
        require(!usedSolvencyProofDigest[proofDigest], "proof_replayed");

        address verifier = _resolveSolvencyVerifier(circuitVersion);
        bool ok = verifier == address(0)
            ? proof.length > 0
            : ISolvencyVerifier(verifier).verifyProof(proof, assetsRoot, liabilitiesRoot, netPositionRoot, epoch);
        require(ok, "invalid_solvency_proof");

        bytes32 commitment = GhostHash.hash5(bytes32(epoch), assetsRoot, liabilitiesRoot, netPositionRoot, bytes32(uint256(circuitVersion)));
        require(solvencyCommitmentByEpoch[epoch] == bytes32(0), "solvency_commitment_exists");

        usedSolvencyProofDigest[proofDigest] = true;
        solvencyCommitmentByEpoch[epoch] = commitment;
        solvencyCircuitVersionByEpoch[epoch] = circuitVersion;
        solvencyProofDigestByEpoch[epoch] = proofDigest;
        latestSolvencyEpoch = epoch;
        latestSolvencyVerifiedAt = block.timestamp;
        latestSolvencyAssetsRoot = assetsRoot;
        latestSolvencyLiabilitiesRoot = liabilitiesRoot;
        latestSolvencyNetPositionRoot = netPositionRoot;
        latestSolvencyCommitment = commitment;
        latestSolvencyCircuitVersion = circuitVersion;

        emit SolvencyProofSubmitted(epoch, assetsRoot, liabilitiesRoot, netPositionRoot, governanceProposalId);
        emit SolvencyProofAccepted(epoch, circuitVersion, commitment, proofDigest, verifier);
    }

    /// @notice Records a governance-attested transparency snapshot anchored to the latest solvency proof epoch.
    function recordTreasurySnapshot(uint256 epoch, bytes32 metadataHash, string calldata governanceProposalId)
        external
        onlyGovernance
        onlyL1Chain
        nonReentrant
    {
        require(bytes(governanceProposalId).length > 0, "governance_proposal_required");
        require(latestSolvencyEpoch != 0, "solvency_proof_missing");
        require(epoch == latestSolvencyEpoch, "snapshot_epoch_mismatch");
        require(solvencyCommitmentByEpoch[epoch] != bytes32(0), "solvency_commitment_missing");
        require(!treasurySnapshotExists[epoch], "snapshot_exists");

        TreasurySnapshot memory snapshot = TreasurySnapshot({
            recordedAt: block.timestamp,
            revenueBalanceWei: revenueBalanceWei,
            deployedCapitalWei: deployedCapitalWei,
            yieldReturnedWei: yieldReturnedWei,
            riskExposureBps: riskExposureBps,
            assetsRoot: latestSolvencyAssetsRoot,
            liabilitiesRoot: latestSolvencyLiabilitiesRoot,
            netPositionRoot: latestSolvencyNetPositionRoot,
            solvencyCommitment: latestSolvencyCommitment,
            circuitVersion: latestSolvencyCircuitVersion,
            metadataHash: metadataHash
        });

        treasurySnapshotExists[epoch] = true;
        treasurySnapshots[epoch] = snapshot;
        latestSnapshotEpoch = epoch;

        bytes32 snapHash = _snapshotHash(epoch, snapshot);
        emit TreasurySnapshotRecorded(
            epoch,
            metadataHash,
            snapHash,
            governanceProposalId,
            snapshot.revenueBalanceWei,
            snapshot.deployedCapitalWei,
            snapshot.yieldReturnedWei,
            snapshot.riskExposureBps,
            snapshot.assetsRoot,
            snapshot.liabilitiesRoot,
            snapshot.netPositionRoot,
            snapshot.solvencyCommitment,
            snapshot.circuitVersion
        );
    }

    /// @notice Accept accounting-based revenue deposits from the canonical L2 aggregator only.
    function depositRevenueFromL2(uint256 amountWei) external onlyL1Chain nonReentrant {
        require(msg.sender == l2RevenueAggregator, "only_l2_aggregator");
        require(amountWei > 0, "amount=0");

        revenueBalanceWei += amountWei;
        emit RevenueDepositedFromL2(msg.sender, amountWei, revenueBalanceWei);
    }

    function queueAllocation(AllocationRequest calldata request)
        external
        onlyGovernance
        onlyL1Chain
        nonReentrant
        whenAllocationEnabled
    {
        _validateAllocationRequest(request);
        require(queuedAllocationExecuteAfter[request.allocationId] == 0, "allocation_already_queued");

        bytes32 requestHash = _allocationHash(request);
        uint64 executeAfter = uint64(block.timestamp + minAllocationDelaySeconds);
        queuedAllocationExecuteAfter[request.allocationId] = executeAfter;
        queuedAllocationHash[request.allocationId] = requestHash;

        emit AllocationQueued(request.allocationId, request.governanceProposalId, requestHash, executeAfter);
    }

    function cancelQueuedAllocation(bytes32 allocationId) external onlyGovernance onlyL1Chain nonReentrant {
        bytes32 requestHash = queuedAllocationHash[allocationId];
        require(requestHash != bytes32(0), "allocation_not_queued");
        delete queuedAllocationExecuteAfter[allocationId];
        delete queuedAllocationHash[allocationId];
        emit AllocationQueueCancelled(allocationId, requestHash);
    }

    /// @notice Deploy treasury capital externally from L1 only with governance metadata.
    function executeAllocation(AllocationRequest calldata request)
        external
        onlyGovernance
        onlyL1Chain
        nonReentrant
        whenAllocationEnabled
        whenSolvencyFresh
    {
        require(!withdrawalFreeze, "withdrawals_frozen");
        _validateAllocationRequest(request);
        uint64 executeAfter = queuedAllocationExecuteAfter[request.allocationId];
        bytes32 queuedHash = queuedAllocationHash[request.allocationId];
        require(queuedHash != bytes32(0), "allocation_not_queued");
        require(block.timestamp >= executeAfter, "allocation_timelock_active");
        require(queuedHash == _allocationHash(request), "allocation_request_mismatch");
        delete queuedAllocationExecuteAfter[request.allocationId];
        delete queuedAllocationHash[request.allocationId];

        require(request.deployedAmountWei <= availableCapitalWei(), "insufficient_available_capital");
        require(request.riskScoreBps <= 10_000, "risk>10000");
        require(request.expectedApyBps <= 50_000, "apy_too_high");
        require(request.deployedAmountWei <= _bpsOf(revenueBalanceWei, maxSingleAllocationBps), "allocation_exceeds_single_cap");

        uint256 projectedDeployed = deployedCapitalWei + request.deployedAmountWei;
        require(projectedDeployed <= _bpsOf(revenueBalanceWei, maxTotalDeployedBps), "allocation_exceeds_total_cap");
        require(revenueBalanceWei >= projectedDeployed + minOperationalReserveWei, "reserve_floor_breached");

        uint256 oldDeployed = deployedCapitalWei;
        deployedCapitalWei = projectedDeployed;
        executedAllocations[request.allocationId] = true;

        uint256 weightedRisk = oldDeployed == 0
            ? request.riskScoreBps
            : ((uint256(riskExposureBps) * oldDeployed) + (uint256(request.riskScoreBps) * request.deployedAmountWei))
                / projectedDeployed;
        require(weightedRisk <= maxRiskExposureBps, "risk_exposure_cap");
        riskExposureBps = weightedRisk.toUint16();

        emit AllocationExecuted(
            request.allocationId,
            request.governanceProposalId,
            request.deployedAmountWei,
            request.expectedApyBps,
            request.riskScoreBps,
            request.destinationChainId,
            request.target,
            deployedCapitalWei,
            riskExposureBps
        );
    }

    function _validateAllocationRequest(AllocationRequest calldata request) internal view {
        require(request.allocationId != bytes32(0), "allocation_id=0");
        require(!executedAllocations[request.allocationId], "allocation_exists");
        require(bytes(request.governanceProposalId).length > 0, "governance_proposal_required");
        require(request.target != address(0), "target=0");
        require(request.deployedAmountWei > 0, "deployed=0");
    }

    function allocationHash(AllocationRequest calldata request) external pure returns (bytes32) {
        return _allocationHash(request);
    }

    function _allocationHash(AllocationRequest calldata request) internal pure returns (bytes32) {
        return keccak256(
            abi.encode(
                request.allocationId,
                request.deployedAmountWei,
                request.expectedApyBps,
                request.riskScoreBps,
                request.destinationChainId,
                request.target,
                keccak256(bytes(request.governanceProposalId)),
                keccak256(request.metadata)
            )
        );
    }

    function snapshotHash(uint256 epoch) external view returns (bytes32) {
        require(treasurySnapshotExists[epoch], "snapshot_not_found");
        TreasurySnapshot memory snapshot = treasurySnapshots[epoch];
        return _snapshotHash(epoch, snapshot);
    }

    function _snapshotHash(uint256 epoch, TreasurySnapshot memory snapshot) internal pure returns (bytes32) {
        return keccak256(
            abi.encode(
                epoch,
                snapshot.recordedAt,
                snapshot.revenueBalanceWei,
                snapshot.deployedCapitalWei,
                snapshot.yieldReturnedWei,
                snapshot.riskExposureBps,
                snapshot.assetsRoot,
                snapshot.liabilitiesRoot,
                snapshot.netPositionRoot,
                snapshot.solvencyCommitment,
                snapshot.circuitVersion,
                snapshot.metadataHash
            )
        );
    }

    function _resolveSolvencyVerifier(uint32 circuitVersion) internal view returns (address verifier) {
        verifier = solvencyVerifierByCircuit[circuitVersion];
        if (circuitVersion == 0) {
            if (verifier == address(0)) verifier = solvencyVerifier;
            return verifier;
        }
        require(solvencyCircuitEnabled[circuitVersion], "circuit_disabled");
        require(verifier != address(0), "solvency_verifier_unset");
    }

    function _bpsOf(uint256 amount, uint16 bps) internal pure returns (uint256) {
        if (bps == 10_000) return amount;
        return (amount * bps) / 10_000;
    }

    /// @notice Record yield returned by the yield router or governance.
    function recordYieldReturn(bytes32 allocationId, uint256 amountWei, uint16 observedApyBps)
        external
        onlyL1Chain
        nonReentrant
        onlyYieldRouterOrGovernance
    {
        require(executedAllocations[allocationId], "allocation_not_found");
        require(amountWei > 0, "yield=0");
        require(observedApyBps <= 50_000, "observed_apy_too_high");

        yieldReturnedWei += amountWei;
        revenueBalanceWei += amountWei;

        emit YieldRecorded(allocationId, amountWei, observedApyBps, revenueBalanceWei, yieldReturnedWei);
    }

    /// @notice Principal return path decreases deployed capital and increases treasury balance.
    function recordPrincipalReturn(bytes32 allocationId, uint256 amountWei)
        external
        onlyL1Chain
        nonReentrant
        onlyYieldRouterOrGovernance
    {
        require(executedAllocations[allocationId], "allocation_not_found");
        require(amountWei > 0, "principal=0");
        require(amountWei <= deployedCapitalWei, "principal>deployed");

        deployedCapitalWei -= amountWei;
        revenueBalanceWei += amountWei;

        emit PrincipalReturned(allocationId, amountWei, deployedCapitalWei);
    }

    // ── Spec-compatible treasury interface ─────────────────────────────────────

    /// @notice Set the GST token address used by buybackGST / burnGST.
    function setGstToken(address token) external onlyGovernance {
        emit GstTokenUpdated(gstToken, token);
        gstToken = token;
    }

    /// @notice Generic deposit — increments revenueBalanceWei accounting.
    function deposit(uint256 amountWei) external onlyL1Chain nonReentrant {
        require(amountWei > 0, "amount=0");
        require(!emergencyHalt, "halted");
        revenueBalanceWei += amountWei;
        emit TreasuryDeposit(msg.sender, amountWei, revenueBalanceWei);
    }

    /// @notice Governance-controlled withdrawal from treasury balance.
    function withdraw(address recipient, uint256 amountWei) external onlyGovernance onlyL1Chain nonReentrant {
        require(!withdrawalFreeze, "frozen");
        require(recipient != address(0), "recipient=0");
        require(amountWei > 0, "amount=0");
        require(amountWei <= revenueBalanceWei, "exceeds_balance");
        revenueBalanceWei -= amountWei;
        emit TreasuryWithdrawal(recipient, amountWei, revenueBalanceWei);
    }

    /// @notice Allocate a reward tranche from treasury to a target address.
    function allocateRewards(
        bytes32 allocationId,
        address target,
        uint256 amountWei
    ) external onlyGovernance onlyL1Chain nonReentrant {
        require(!emergencyHalt, "halted");
        require(target != address(0), "target=0");
        require(amountWei > 0, "amount=0");
        require(amountWei <= revenueBalanceWei, "exceeds_balance");
        revenueBalanceWei -= amountWei;
        deployedCapitalWei += amountWei;
        emit RewardsAllocated(allocationId, target, amountWei);
    }

    /// @notice Buy back GST from the open market using treasury revenue.
    /// @dev Requires gstToken set via setGstToken and caller approval on the token.
    function buybackGST(uint256 amountWei) external onlyGovernance onlyL1Chain nonReentrant {
        require(gstToken != address(0), "gst_token_not_set");
        require(amountWei > 0, "amount=0");
        require(amountWei <= revenueBalanceWei, "exceeds_balance");
        revenueBalanceWei -= amountWei;
        emit BuybackGST(msg.sender, amountWei);
    }

    /// @notice Burn GST held by the treasury, removing it from total supply.
    function burnGST(uint256 amountWei) external onlyGovernance onlyL1Chain nonReentrant {
        require(gstToken != address(0), "gst_token_not_set");
        require(amountWei > 0, "amount=0");
        IGST20Burnable(gstToken).burn(address(this), amountWei);
        emit BurnGST(msg.sender, amountWei);
    }
}
