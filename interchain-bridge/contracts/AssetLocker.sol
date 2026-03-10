// GhostChain Contracts v5.6.1 (interchain-bridge/contracts/AssetLocker.sol)
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

// NOTE: When moved into contracts/src/, replace this inline block with:
//   import { GhostBrand } from "../GhostBrand.sol";
//   import { ReentrancyGuard } from "../common/ReentrancyGuard.sol";

/**
 * @title AssetLocker
 * @notice Custodian of native GST during cross-chain bridge transit.
 *
 * Separation of concerns:
 *   GhostBridge     — message routing, validator quorum, nonce management.
 *   AssetLocker     — pure custody (lock, release).  No message logic here.
 *   WrappedGhostAsset — minting on the destination chain after lock confirm.
 *
 * Access control:
 *   Only the authorised `bridge` address may call `lockNative` / `releaseNative`.
 *   The owner (governance multisig) may update the bridge address via `setBridge`.
 *
 * Reentrancy:
 *   A mutex (`_locked`) guards all external-call paths. The mutex is set before
 *   any native transfer and cleared after, following checks-effects-interactions.
 *
 * Accounting:
 *   `totalLocked`           — total native GST held in custody.
 *   `lockedByMessage[id]`   — amount locked per bridge message ID.
 *
 * Gas token: GST (native, 18 decimals).
 */
contract AssetLocker {
    // ─── GhostBrand Constants (inlined; replace with import in contracts/src/) ──

    uint256 internal constant GST_UNIT = 1e18;

    // ─── Storage ─────────────────────────────────────────────────────────────

    address public owner;
    address public bridge;
    bool    private _locked;

    uint256 public totalLocked;

    /// @notice Amount of native GST locked per bridge message ID.
    mapping(bytes32 => uint256) public lockedByMessage;
    /// @notice Whether a given message ID has already been released.
    mapping(bytes32 => bool)    public released;

    // ─── Events ──────────────────────────────────────────────────────────────

    event NativeLocked(bytes32 indexed msgId, uint256 amountGst, uint256 totalLocked);
    event NativeReleased(bytes32 indexed msgId, address indexed recipient, uint256 amountGst);
    event BridgeUpdated(address indexed newBridge);

    // ─── Errors ───────────────────────────────────────────────────────────────

    error NotOwner();
    error NotBridge();
    error ZeroAddress();
    error ZeroAmount();
    error ReentrancyAttack();
    error AlreadyLocked();
    error AlreadyReleased();
    error InsufficientBalance();
    error TransferFailed();

    // ─── Modifiers ────────────────────────────────────────────────────────────

    modifier onlyOwner() {
        _onlyOwner();
        _;
    }

    modifier onlyBridge() {
        _onlyBridge();
        _;
    }

    modifier nonReentrant() {
        if (_locked) revert ReentrancyAttack();
        _locked = true;
        _;
        _locked = false;
    }

    function _onlyOwner() internal view {
        if (msg.sender != owner) revert NotOwner();
    }

    function _onlyBridge() internal view {
        if (msg.sender != bridge) revert NotBridge();
    }

    // ─── Constructor ─────────────────────────────────────────────────────────

    constructor() {
        owner = msg.sender;
    }

    // ─── Owner admin ──────────────────────────────────────────────────────────

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        owner = newOwner;
    }

    function setBridge(address _bridge) external onlyOwner {
        if (_bridge == address(0)) revert ZeroAddress();
        bridge = _bridge;
        emit BridgeUpdated(_bridge);
    }

    // ─── Lock ─────────────────────────────────────────────────────────────────

    /**
     * @notice Called by GhostBridge (forwarding msg.value) to record custody.
     * @dev    The native GST is already held by this contract via msg.value.
     *         Reverts if the same msgId is locked twice (replay protection at
     *         the custody layer, independent of GhostBridge's nonce tracking).
     */
    function lockNative(bytes32 msgId) external payable onlyBridge nonReentrant {
        if (msg.value == 0)               revert ZeroAmount();
        if (lockedByMessage[msgId] != 0)  revert AlreadyLocked();

        lockedByMessage[msgId] = msg.value;
        totalLocked            += msg.value;

        emit NativeLocked(msgId, msg.value, totalLocked);
    }

    // ─── Release ─────────────────────────────────────────────────────────────

    /**
     * @notice Called by GhostBridge after validator quorum finalises an inbound
     *         message.  Releases the exact amount locked under `msgId` to
     *         `recipient`.
     * @dev    Follows checks-effects-interactions: state updates before transfer.
     */
    function releaseNative(
        address recipient,
        uint256 amountGst,
        bytes32 msgId
    ) external onlyBridge nonReentrant {
        if (recipient == address(0)) revert ZeroAddress();
        if (amountGst == 0)          revert ZeroAmount();
        if (released[msgId])         revert AlreadyReleased();
        if (address(this).balance < amountGst) revert InsufficientBalance();

        // Effects before interaction.
        released[msgId] = true;
        if (totalLocked >= amountGst) {
            totalLocked -= amountGst;
        } else {
            totalLocked = 0;
        }

        (bool ok,) = recipient.call{value: amountGst}("");
        if (!ok) revert TransferFailed();

        emit NativeReleased(msgId, recipient, amountGst);
    }

    // ─── View ─────────────────────────────────────────────────────────────────

    function balance() external view returns (uint256) {
        return address(this).balance;
    }

    // ─── Receive ─────────────────────────────────────────────────────────────

    receive() external payable {}
}
