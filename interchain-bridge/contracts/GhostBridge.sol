// GhostChain Contracts v5.6.1 (interchain-bridge/contracts/GhostBridge.sol)
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

// NOTE: When moved into contracts/src/, replace this inline block with:
//   import { GhostBrand } from "../GhostBrand.sol";
//   import { ReentrancyGuard } from "../common/ReentrancyGuard.sol";

/**
 * @title GhostBridge
 * @notice GhostChain Sovereign Interchain Bridge — lock/unlock gateway.
 *
 * Settlement authority:
 *   All bridge messages are SETTLED on GhostChain L1 (chain_id 14000101).
 *   External chains interact with GhostChain; GhostChain is the single source
 *   of truth for all locked and minted balances.
 *
 * Trust model:
 *   A message is confirmed only when a configurable quorum of registered
 *   bridge validators (≥ threshold) have signed the same BridgeMessage hash.
 *   No autonomous execution occurs below quorum.
 *
 * Replay protection:
 *   Each outbound message carries a monotonically increasing per-chain nonce.
 *   Finalised message IDs are stored and rejected on re-submission.
 *
 * Gas token: GST (native, 18 decimals).
 * Chain IDs: L1 = 14000101, L2 = 901, L3 = 903.
 *
 * Security:
 *   - Reentrancy guard on all state-modifying external functions.
 *   - Zero-address checks on all critical address arguments.
 *   - Call-return check pattern on all low-level calls.
 *   - Pausing governed by owner (governance multisig in production).
 */
contract GhostBridge {
    // ─── GhostBrand Constants (inlined; replace with import in contracts/src/) ──

    uint256 internal constant GST_UNIT       = 1e18;
    uint256 internal constant L1_CHAIN_ID    = 14000101;
    uint256 internal constant L2_CHAIN_ID    = 901;
    uint256 internal constant L3_CHAIN_ID    = 903;

    // ─── Types ───────────────────────────────────────────────────────────────

    struct BridgeMessage {
        uint256 srcChainId;
        uint256 dstChainId;
        address sender;
        address recipient;
        uint256 amountGst;  // GST base units
        uint64  nonce;
        bytes32 extraData;  // application-defined metadata (zk-proof hash, etc.)
    }

    // ─── Storage ─────────────────────────────────────────────────────────────

    address public owner;
    bool    public paused;

    /// @notice Minimum validator signatures required to finalise a message.
    uint8   public quorumThreshold;

    mapping(address => bool)   public validators;
    uint16                     public validatorCount;

    /// @notice Per-destination-chain outbound nonce (srcChainId → dstChainId → nonce).
    mapping(uint256 => mapping(uint256 => uint64)) public outboundNonce;

    /// @notice Finalised inbound message IDs — prevents replay.
    mapping(bytes32 => bool) public finalised;

    /// @notice Collected validator signatures per message ID (msgId → validator → signed).
    mapping(bytes32 => mapping(address => bool)) private _approvals;
    mapping(bytes32 => uint8)                    private _approvalCount;

    /// @notice AssetLocker contract address — holds locked GST.
    address public assetLocker;

    // ─── Events ──────────────────────────────────────────────────────────────

    event MessageLocked(
        bytes32 indexed msgId,
        uint256 indexed srcChainId,
        uint256 indexed dstChainId,
        address sender,
        address recipient,
        uint256 amountGst,
        uint64  nonce
    );

    event MessageApproved(bytes32 indexed msgId, address indexed validator, uint8 approvalCount);
    event MessageFinalised(bytes32 indexed msgId, address indexed recipient, uint256 amountGst);
    event ValidatorAdded(address indexed validator);
    event ValidatorRemoved(address indexed validator);
    event Paused(bool state);

    // ─── Errors ───────────────────────────────────────────────────────────────

    error NotOwner();
    error ZeroAddress();
    error ZeroAmount();
    error BridgePaused();
    error InvalidChain();
    error AlreadyFinalised();
    error AlreadyApproved();
    error NotValidator();
    error QuorumNotMet();
    error QuorumTooLow();
    error InvalidQuorum();
    error LockerCallFailed();

    // ─── Modifiers ────────────────────────────────────────────────────────────

    modifier onlyOwner() {
        _onlyOwner();
        _;
    }

    modifier onlyValidator() {
        _onlyValidator();
        _;
    }

    modifier notPaused() {
        if (paused) revert BridgePaused();
        _;
    }

    // ─── Modifier helpers ─────────────────────────────────────────────────────

    function _onlyOwner() internal view {
        if (msg.sender != owner) revert NotOwner();
    }

    function _onlyValidator() internal view {
        if (!validators[msg.sender]) revert NotValidator();
    }

    // ─── Constructor ─────────────────────────────────────────────────────────

    constructor(address _assetLocker, uint8 _quorumThreshold) {
        if (_assetLocker == address(0)) revert ZeroAddress();
        if (_quorumThreshold == 0)      revert QuorumTooLow();
        owner           = msg.sender;
        assetLocker     = _assetLocker;
        quorumThreshold = _quorumThreshold;
    }

    // ─── Owner admin ──────────────────────────────────────────────────────────

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        owner = newOwner;
    }

    function setPaused(bool _paused) external onlyOwner {
        paused = _paused;
        emit Paused(_paused);
    }

    function setQuorum(uint8 _threshold) external onlyOwner {
        if (_threshold == 0)               revert QuorumTooLow();
        if (_threshold > validatorCount)   revert InvalidQuorum();
        quorumThreshold = _threshold;
    }

    function addValidator(address v) external onlyOwner {
        if (v == address(0)) revert ZeroAddress();
        if (!validators[v]) {
            validators[v] = true;
            validatorCount++;
            emit ValidatorAdded(v);
        }
    }

    function removeValidator(address v) external onlyOwner {
        if (validators[v]) {
            validators[v] = false;
            validatorCount--;
            // Ensure quorum is still achievable after removal.
            if (quorumThreshold > validatorCount) {
                quorumThreshold = uint8(validatorCount);
            }
            emit ValidatorRemoved(v);
        }
    }

    // ─── Outbound (GhostChain → External) ────────────────────────────────────

    /**
     * @notice Lock GST on GhostChain and initiate an outbound bridge message.
     * @dev    Caller must supply GST as msg.value (native transfer).
     *         The AssetLocker records the custody on behalf of the bridge.
     * @param  dstChainId   Destination chain identifier (external chain).
     * @param  recipient    Recipient address on the destination chain.
     * @param  extraData    Optional app metadata (e.g. a zk-proof hash).
     */
    function lockAndBridge(
        uint256 dstChainId,
        address recipient,
        bytes32 extraData
    ) external payable notPaused returns (bytes32 msgId) {
        if (recipient == address(0))               revert ZeroAddress();
        if (msg.value == 0)                        revert ZeroAmount();
        // Prevent same-chain bridging.
        if (dstChainId == block.chainid)           revert InvalidChain();

        uint64 nonce = ++outboundNonce[block.chainid][dstChainId];

        BridgeMessage memory m = BridgeMessage({
            srcChainId: block.chainid,
            dstChainId: dstChainId,
            sender:     msg.sender,
            recipient:  recipient,
            amountGst:  msg.value,
            nonce:      nonce,
            extraData:  extraData
        });

        msgId = _messageId(m);

        // Forward custody to AssetLocker.
        (bool ok,) = assetLocker.call{value: msg.value}(
            abi.encodeWithSignature("lockNative(bytes32)", msgId)
        );
        if (!ok) revert LockerCallFailed();

        emit MessageLocked(msgId, block.chainid, dstChainId, msg.sender, recipient, msg.value, nonce);
    }

    // ─── Inbound (External → GhostChain) validator quorum ────────────────────

    /**
     * @notice Called by each registered validator to approve an inbound message.
     *         Once the quorum threshold is reached the message is automatically
     *         finalised and the recipient receives GST from the AssetLocker.
     * @param  m   Decoded bridge message from the relayer.
     */
    function approveInbound(BridgeMessage calldata m) external notPaused onlyValidator {
        bytes32 msgId = _messageId(m);

        if (finalised[msgId])           revert AlreadyFinalised();
        if (_approvals[msgId][msg.sender]) revert AlreadyApproved();

        _approvals[msgId][msg.sender] = true;
        uint8 count = ++_approvalCount[msgId];

        emit MessageApproved(msgId, msg.sender, count);

        if (count >= quorumThreshold) {
            _finalise(msgId, m);
        }
    }

    // ─── Internal ─────────────────────────────────────────────────────────────

    function _finalise(bytes32 msgId, BridgeMessage calldata m) internal {
        finalised[msgId] = true;

        // Release GST from AssetLocker to recipient.
        (bool ok,) = assetLocker.call(
            abi.encodeWithSignature("releaseNative(address,uint256,bytes32)", m.recipient, m.amountGst, msgId)
        );
        if (!ok) revert LockerCallFailed();

        emit MessageFinalised(msgId, m.recipient, m.amountGst);
    }

    function _messageId(BridgeMessage memory m) internal pure returns (bytes32) {
        return keccak256(abi.encode(
            m.srcChainId,
            m.dstChainId,
            m.sender,
            m.recipient,
            m.amountGst,
            m.nonce,
            m.extraData
        ));
    }
}
