// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../GhostBrand.sol";
import "./AgentRegistry.sol";

/// @title GhostBrainIntegration
/// @notice On-chain anchor for the GhostBrain Sovereign Autonomous Agent (GSA).
///         Records findings, plans, patches and policy decisions produced by the
///         off-chain GSA service, binding them to canonical GhostBrand constants
///         and enforcing routing-law + brand-law invariants immutably in Solidity.
///
/// @dev Routing Law (non-overridable):
///        L3 (903) → L2 (901) → L1 (14000101) only.
///        No L3→L1 shortcut. No reverse. External egress only from L1.
///      Brand Law (non-overridable):
///        name=Ghost, symbol=GST, decimals=18.
///
///      The contract is deliberately minimal: no ERC standards, no upgradability,
///      no token transfers. It is pure audit log + constitutional enforcement.
contract GhostBrainIntegration is GhostBrand {

    // ──────────────────────────────────────────────────────────────────────────
    //  Constants
    // ──────────────────────────────────────────────────────────────────────────

    bytes32 public constant ROLE_GSA_AUDITOR  = keccak256("ghostbrain.gsa.auditor");
    bytes32 public constant ROLE_GSA_GOVERNOR = keccak256("ghostbrain.gsa.governor");

    // Severity levels (mirrors off-chain diagnostician.js)
    uint64 public constant SEV_INFO     = 0;
    uint64 public constant SEV_LOW      = 1;
    uint64 public constant SEV_MEDIUM   = 2;
    uint64 public constant SEV_HIGH     = 3;
    uint64 public constant SEV_CRITICAL = 4;

    // ──────────────────────────────────────────────────────────────────────────
    //  Structs
    // ──────────────────────────────────────────────────────────────────────────

    struct Finding {
        bytes32 scanHash;       // CAS sha256 of the full scan result object
        bytes32 correlationId;  // Correlation tag shared across scan→plan→patch
        uint64  severity;       // SEV_* constant above
        uint64  timestamp;
        address reporter;
    }

    struct Plan {
        bytes32 findingHash;    // keccak256 of the Finding that triggered this plan
        bytes32 planHash;       // CAS sha256 of the plan artifact
        uint64  stepCount;
        uint64  timestamp;
        address planner;
    }

    struct PatchRecord {
        bytes32 planHash;       // Which plan this patch belongs to
        bytes32 bundleHash;     // OGB bundle hash (must be registered first)
        bytes32 patchHash;      // sha256 of the git diff / patch content
        bool    applied;        // true = patch was applied in-repo; false = dry-run
        uint64  timestamp;
        address executor;
    }

    // ──────────────────────────────────────────────────────────────────────────
    //  State
    // ──────────────────────────────────────────────────────────────────────────

    address public operator;
    AgentRegistry public agentRegistry;

    // Storage
    bytes32[] private _findingIds;
    bytes32[] private _planIds;
    bytes32[] private _patchIds;

    mapping(bytes32 => Finding)     private _findings;
    mapping(bytes32 => Plan)        private _plans;
    mapping(bytes32 => PatchRecord) private _patches;

    /// @notice OGB bundle hashes that have passed off-chain verification.
    mapping(bytes32 => bool) private _verifiedBundles;

    // ──────────────────────────────────────────────────────────────────────────
    //  Events
    // ──────────────────────────────────────────────────────────────────────────

    event FindingAnchored(
        bytes32 indexed findingId,
        bytes32 indexed scanHash,
        uint64          severity,
        address indexed reporter
    );
    event PlanAnchored(
        bytes32 indexed planId,
        bytes32 indexed planHash,
        uint64          stepCount,
        address indexed planner
    );
    event PatchAnchored(
        bytes32 indexed patchId,
        bytes32 indexed bundleHash,
        bytes32         patchHash,
        bool            applied,
        address indexed executor
    );
    event BundleRegistered(bytes32 indexed bundleHash, address indexed registrant);
    event OperatorUpdated(address indexed oldOp, address indexed newOp);

    // ──────────────────────────────────────────────────────────────────────────
    //  Errors
    // ──────────────────────────────────────────────────────────────────────────

    error Unauthorized();
    error RoutingLawViolation(uint256 src, uint256 dst);
    error ExternalEgressViolation(uint256 src);
    error BrandLawViolation(string field);
    error BundleNotVerified(bytes32 bundleHash);
    error DuplicateRecord(bytes32 id);
    error ZeroHash();
    error ZeroAddress();

    // ──────────────────────────────────────────────────────────────────────────
    //  Internal: Constitutional invariants (pure — no state)
    // ──────────────────────────────────────────────────────────────────────────

    /// @dev Routing law: only L3→L2 and L2→L1 are valid cross-layer paths.
    function _assertRoutingLaw(uint256 src, uint256 dst) internal pure {
        bool valid = (src == L3_CHAIN_ID && dst == L2_CHAIN_ID) ||
                     (src == L2_CHAIN_ID && dst == L1_CHAIN_ID);
        if (!valid) revert RoutingLawViolation(src, dst);
    }

    /// @dev External traffic may only originate from L1.
    function _assertExternalEgress(uint256 src) internal pure {
        if (src != L1_CHAIN_ID) revert ExternalEgressViolation(src);
    }

    /// @dev Brand law: name must match canonical "Ghost".
    function _assertBrandName(bytes memory name) internal pure {
        if (keccak256(name) != keccak256(bytes(GHOST_NAME)))
            revert BrandLawViolation("name");
    }

    /// @dev Brand law: symbol must match canonical "GST".
    function _assertBrandSymbol(bytes memory symbol) internal pure {
        if (keccak256(symbol) != keccak256(bytes(GHOST_SYMBOL)))
            revert BrandLawViolation("symbol");
    }

    /// @dev Brand law: decimals must be 18.
    function _assertBrandDecimals(uint8 decimals) internal pure {
        if (decimals != GHOST_DECIMALS) revert BrandLawViolation("decimals");
    }

    // ──────────────────────────────────────────────────────────────────────────
    //  Modifiers
    // ──────────────────────────────────────────────────────────────────────────

    modifier onlyOperator() {
        if (msg.sender != operator) revert Unauthorized();
        _;
    }

    // ──────────────────────────────────────────────────────────────────────────
    //  Constructor
    // ──────────────────────────────────────────────────────────────────────────

    constructor(address _operator, address _registry) {
        if (_operator == address(0)) revert ZeroAddress();
        operator      = _operator;
        agentRegistry = AgentRegistry(_registry);
        emit OperatorUpdated(address(0), _operator);
    }

    // ──────────────────────────────────────────────────────────────────────────
    //  Operator management
    // ──────────────────────────────────────────────────────────────────────────

    function setOperator(address newOp) external onlyOperator {
        if (newOp == address(0)) revert ZeroAddress();
        address old = operator;
        operator = newOp;
        emit OperatorUpdated(old, newOp);
    }

    // ──────────────────────────────────────────────────────────────────────────
    //  OGB bundle registration
    // ──────────────────────────────────────────────────────────────────────────

    /// @notice Register an OGB bundle hash as on-chain verified.
    ///         Must be called by the GSA operator after the off-chain
    ///         `ogb-verifier.js` returns `{ok: true, hash}`.
    ///         Required before `anchorPatch` can reference this bundle.
    function registerVerifiedBundle(bytes32 bundleHash) external onlyOperator {
        if (bundleHash == bytes32(0)) revert ZeroHash();
        _verifiedBundles[bundleHash] = true;
        emit BundleRegistered(bundleHash, msg.sender);
    }

    /// @notice Check whether a bundle has been registered as verified.
    function isBundleVerified(bytes32 bundleHash) external view returns (bool) {
        return _verifiedBundles[bundleHash];
    }

    // ──────────────────────────────────────────────────────────────────────────
    //  Finding anchoring
    // ──────────────────────────────────────────────────────────────────────────

    /// @notice Anchor a GSA scan finding on-chain.
    /// @param scanHash      CAS sha256 of the full scan result
    /// @param correlationId Shared ID linking this finding to future plan/patch
    /// @param severity      SEV_INFO / SEV_LOW / SEV_MEDIUM / SEV_HIGH / SEV_CRITICAL
    /// @return findingId    Deterministic ID for this finding record
    function anchorFinding(
        bytes32 scanHash,
        bytes32 correlationId,
        uint64  severity
    ) external onlyOperator returns (bytes32 findingId) {
        if (scanHash == bytes32(0)) revert ZeroHash();

        findingId = keccak256(abi.encode(scanHash, correlationId, severity, block.timestamp, msg.sender));
        if (_findings[findingId].timestamp != 0) revert DuplicateRecord(findingId);

        _findings[findingId] = Finding({
            scanHash:      scanHash,
            correlationId: correlationId,
            severity:      severity,
            timestamp:     uint64(block.timestamp),
            reporter:      msg.sender
        });
        _findingIds.push(findingId);
        emit FindingAnchored(findingId, scanHash, severity, msg.sender);
    }

    function getFinding(bytes32 findingId) external view returns (Finding memory) {
        return _findings[findingId];
    }

    function findingCount() external view returns (uint256) {
        return _findingIds.length;
    }

    // ──────────────────────────────────────────────────────────────────────────
    //  Plan anchoring
    // ──────────────────────────────────────────────────────────────────────────

    /// @notice Anchor a GSA remediation plan on-chain.
    /// @param findingHash  keccak256 of the Finding that triggered this plan
    /// @param planHash     CAS sha256 of the plan artifact (steps + rollbacks)
    /// @param stepCount    Number of steps in the plan
    /// @return planId      Deterministic ID for this plan record
    function anchorPlan(
        bytes32 findingHash,
        bytes32 planHash,
        uint64  stepCount
    ) external onlyOperator returns (bytes32 planId) {
        if (planHash == bytes32(0)) revert ZeroHash();

        planId = keccak256(abi.encode(findingHash, planHash, stepCount, block.timestamp, msg.sender));
        if (_plans[planId].timestamp != 0) revert DuplicateRecord(planId);

        _plans[planId] = Plan({
            findingHash: findingHash,
            planHash:    planHash,
            stepCount:   stepCount,
            timestamp:   uint64(block.timestamp),
            planner:     msg.sender
        });
        _planIds.push(planId);
        emit PlanAnchored(planId, planHash, stepCount, msg.sender);
    }

    function getPlan(bytes32 planId) external view returns (Plan memory) {
        return _plans[planId];
    }

    function planCount() external view returns (uint256) {
        return _planIds.length;
    }

    // ──────────────────────────────────────────────────────────────────────────
    //  Patch anchoring
    // ──────────────────────────────────────────────────────────────────────────

    /// @notice Anchor a verified patch application event on-chain.
    ///         `bundleHash` MUST be a previously registered verified bundle —
    ///         this enforces the OGB governance gate on-chain.
    /// @param planHash    Which plan this patch implements
    /// @param bundleHash  Governance bundle that authorised this patch
    /// @param patchHash   sha256 of the git diff / patch content
    /// @param applied     true = patch was applied; false = dry-run record
    /// @return patchId    Deterministic ID for this patch record
    function anchorPatch(
        bytes32 planHash,
        bytes32 bundleHash,
        bytes32 patchHash,
        bool    applied
    ) external onlyOperator returns (bytes32 patchId) {
        if (patchHash == bytes32(0)) revert ZeroHash();
        if (!_verifiedBundles[bundleHash]) revert BundleNotVerified(bundleHash);

        patchId = keccak256(abi.encode(planHash, bundleHash, patchHash, applied, block.timestamp, msg.sender));
        if (_patches[patchId].timestamp != 0) revert DuplicateRecord(patchId);

        _patches[patchId] = PatchRecord({
            planHash:   planHash,
            bundleHash: bundleHash,
            patchHash:  patchHash,
            applied:    applied,
            timestamp:  uint64(block.timestamp),
            executor:   msg.sender
        });
        _patchIds.push(patchId);
        emit PatchAnchored(patchId, bundleHash, patchHash, applied, msg.sender);
    }

    function getPatch(bytes32 patchId) external view returns (PatchRecord memory) {
        return _patches[patchId];
    }

    function patchCount() external view returns (uint256) {
        return _patchIds.length;
    }

    // ──────────────────────────────────────────────────────────────────────────
    //  Public view: routing-law checker (pure, callable by off-chain dry-run)
    // ──────────────────────────────────────────────────────────────────────────

    /// @notice Reverts with RoutingLawViolation if the src→dst path is illegal.
    function checkRoutingLaw(uint256 src, uint256 dst) external pure {
        _assertRoutingLaw(src, dst);
    }

    /// @notice Reverts with ExternalEgressViolation if src is not L1.
    function checkExternalEgress(uint256 src) external pure {
        _assertExternalEgress(src);
    }

    // ──────────────────────────────────────────────────────────────────────────
    //  Public view: brand-law checker (pure, callable by off-chain dry-run)
    // ──────────────────────────────────────────────────────────────────────────

    /// @notice Reverts with BrandLawViolation("name") if name ≠ "Ghost".
    function checkBrandName(string calldata name) external pure {
        _assertBrandName(bytes(name));
    }

    /// @notice Reverts with BrandLawViolation("symbol") if symbol ≠ "GST".
    function checkBrandSymbol(string calldata symbol) external pure {
        _assertBrandSymbol(bytes(symbol));
    }

    /// @notice Reverts with BrandLawViolation("decimals") if decimals ≠ 18.
    function checkBrandDecimals(uint8 decimals) external pure {
        _assertBrandDecimals(decimals);
    }

    // ──────────────────────────────────────────────────────────────────────────
    //  Convenience: canonical constants exposed for off-chain readers
    // ──────────────────────────────────────────────────────────────────────────

    function brandName()    external pure returns (string memory) { return GHOST_NAME;    }
    function brandSymbol()  external pure returns (string memory) { return GHOST_SYMBOL;  }
    function brandDecimals() external pure returns (uint8)        { return GHOST_DECIMALS; }
    function l1ChainId()    external pure returns (uint256)       { return L1_CHAIN_ID;   }
    function l2ChainId()    external pure returns (uint256)       { return L2_CHAIN_ID;   }
    function l3ChainId()    external pure returns (uint256)       { return L3_CHAIN_ID;   }
}
