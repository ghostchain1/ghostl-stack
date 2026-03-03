// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

// ─────────────────────────────────────────────────────────────────────────────
// External interfaces (Shibarium / Polygon FxPortal child-side)
// ─────────────────────────────────────────────────────────────────────────────

/// @dev FxChild lives on Shibarium and delivers state-sync messages from L1.
///      Every contract that wants to receive these messages must implement
///      `processMessageFromRoot(stateId, rootMessageSender, data)`.
interface IFxChild {
    function onStateReceive(uint256 stateId, bytes calldata data) external;
}

// ─────────────────────────────────────────────────────────────────────────────
// Minimal ERC-20 interface for GST-S (child token)
// ─────────────────────────────────────────────────────────────────────────────

interface IGSTS {
    function mint(address to, uint256 amount) external;
    function burn(address from, uint256 amount) external;
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool);
}

// ─────────────────────────────────────────────────────────────────────────────
// ShibariumBridgeChild
// ─────────────────────────────────────────────────────────────────────────────

/// @title  ShibariumBridgeChild
/// @notice Shibarium-side (chainId 109) bridge contract for GST-S — the Shibarium
///         representation of GhostChain's canonical gas token.
///
///         Lifecycle
///         ─────────
///         Deposit (L1 → Shibarium)
///           1. User calls ShibariumBridge.bridgeERC20To() on L1 (locks GST).
///           2. FxERC20RootTunnel emits a state-sync event captured by Shibarium validators.
///           3. Shibarium's FxChild calls this contract's `processMessageFromRoot()`.
///           4. This contract mints GST-S to the recipient.
///
///         Withdrawal (Shibarium → L1)
///           1. User calls `withdraw()` here — burns their GST-S on Shibarium.
///           2. The burn transaction is included in a Shibarium checkpoint anchored to L1.
///           3. User (or relayer) constructs a Merkle proof and calls
///              ShibariumBridge.finaliseWithdrawal(nonce, proof) on L1.
///           4. FxERC20RootTunnel releases the locked GST to the L1 recipient.
///
///         Routing law: deploy this contract on Shibarium only (chainId 109 / 157).
///         Never deploy on L1 / L2 / L3.
contract ShibariumBridgeChild {

    // ──────────────────────────────────────────────────────────────────────────
    // Constants
    // ──────────────────────────────────────────────────────────────────────────

    uint256 public constant SHIBARIUM_CHAIN_ID         = 109;
    uint256 public constant SHIBARIUM_TESTNET_CHAIN_ID = 157;

    // ──────────────────────────────────────────────────────────────────────────
    // State
    // ──────────────────────────────────────────────────────────────────────────

    /// @notice GST-S child token contract on Shibarium.
    IGSTS public immutable gstS;

    /// @notice FxChild system contract on Shibarium that delivers L1 messages.
    address public immutable fxChild;

    /// @notice L1 ShibariumBridge (root tunnel) — only messages from this address
    ///         (delivered via fxChild) are accepted.
    address public rootTunnel;

    address public owner;

    bool public paused;

    // Accounting
    uint256 public totalMinted;
    uint256 public totalBurned;

    // Withdrawal nonce — mirrors the L1 side for off-chain matching.
    uint256 public withdrawalNonce;

    // ──────────────────────────────────────────────────────────────────────────
    // Events
    // ──────────────────────────────────────────────────────────────────────────

    event Minted(address indexed to, uint256 amount, uint256 stateId);
    event Withdrawn(uint256 indexed nonce, address indexed from, address indexed l1Recipient, uint256 amount);
    event RootTunnelSet(address indexed rootTunnel);
    event PausedSet(bool paused);

    // ──────────────────────────────────────────────────────────────────────────
    // Errors
    // ──────────────────────────────────────────────────────────────────────────

    error NotFxChild(address caller);
    error NotRootTunnel(address sender);
    error Halted();
    error ZeroAddress();
    error ZeroAmount();
    error NotOwner(address caller);

    // ──────────────────────────────────────────────────────────────────────────
    // Constructor
    // ──────────────────────────────────────────────────────────────────────────

    /// @param gstS_       GST-S token on Shibarium (must have mint/burn managed by this contract).
    /// @param fxChild_    FxChild system address on Shibarium (immutable Polygon contract).
    /// @param rootTunnel_ ShibariumBridge (L1 FxERC20RootTunnel) address.
    constructor(address gstS_, address fxChild_, address rootTunnel_) {
        if (gstS_       == address(0)) revert ZeroAddress();
        if (fxChild_    == address(0)) revert ZeroAddress();
        if (rootTunnel_ == address(0)) revert ZeroAddress();
        gstS       = IGSTS(gstS_);
        fxChild    = fxChild_;
        rootTunnel = rootTunnel_;
        owner      = msg.sender;
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Modifiers
    // ──────────────────────────────────────────────────────────────────────────

    modifier notPaused() {
        if (paused) revert Halted();
        _;
    }

    modifier onlyOwner_() {
        if (msg.sender != owner) revert NotOwner(msg.sender);
        _;
    }

    // ──────────────────────────────────────────────────────────────────────────
    // FxPortal message receiver (Deposit path)
    // ──────────────────────────────────────────────────────────────────────────

    /// @notice Called by Shibarium's FxChild system contract when a state-sync
    ///         message from L1 arrives.  Decodes the deposit payload and mints
    ///         GST-S to the recipient.
    ///
    /// @param stateId          Unique ID assigned by the state-sync mechanism.
    /// @param rootMessageSender The L1 address that initiated the message (must be rootTunnel).
    /// @param data             ABI-encoded deposit payload: (address recipient, uint256 amount, bytes extraData).
    function processMessageFromRoot(
        uint256 stateId,
        address rootMessageSender,
        bytes   calldata data
    ) external notPaused {
        if (msg.sender != fxChild)          revert NotFxChild(msg.sender);
        if (rootMessageSender != rootTunnel) revert NotRootTunnel(rootMessageSender);

        (address recipient, uint256 amount,) = abi.decode(data, (address, uint256, bytes));

        if (recipient == address(0)) revert ZeroAddress();
        if (amount    == 0)          revert ZeroAmount();

        gstS.mint(recipient, amount);
        totalMinted += amount;
        emit Minted(recipient, amount, stateId);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Withdrawal (Shibarium → L1)
    // ──────────────────────────────────────────────────────────────────────────

    /// @notice Burn GST-S on Shibarium to initiate a withdrawal back to Ethereum L1.
    ///         The caller must specify the L1 address that will receive the unlocked GST.
    ///         After this call, the burn transaction must be checkpointed and a Merkle
    ///         proof submitted to ShibariumBridge.finaliseWithdrawal() on L1.
    ///
    /// @param  amount      GST-S to burn.
    /// @param  l1Recipient Ethereum address to receive the released GST.
    /// @return nonce       Withdrawal identifier (matches L1 side nonce for off-chain tracking).
    function withdraw(uint256 amount, address l1Recipient)
        external
        notPaused
        returns (uint256 nonce)
    {
        if (amount      == 0)          revert ZeroAmount();
        if (l1Recipient == address(0)) revert ZeroAddress();

        // Burn the caller's GST-S; the L1 root tunnel will release the locked GST.
        require(
            gstS.transferFrom(msg.sender, address(this), amount),
            "ShibariumBridgeChild: pull failed"
        );
        gstS.burn(address(this), amount);

        nonce = ++withdrawalNonce;
        totalBurned += amount;
        emit Withdrawn(nonce, msg.sender, l1Recipient, amount);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // View helpers
    // ──────────────────────────────────────────────────────────────────────────

    /// @notice GST-S currently circulating on Shibarium (minted minus burned).
    function circulatingSupply() external view returns (uint256) {
        return totalMinted - totalBurned;
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Owner setters
    // ──────────────────────────────────────────────────────────────────────────

    function setRootTunnel(address rootTunnel_) external onlyOwner_ {
        if (rootTunnel_ == address(0)) revert ZeroAddress();
        rootTunnel = rootTunnel_;
        emit RootTunnelSet(rootTunnel_);
    }

    function setPaused(bool paused_) external onlyOwner_ {
        paused = paused_;
        emit PausedSet(paused_);
    }

    function transferOwnership(address newOwner) external onlyOwner_ {
        if (newOwner == address(0)) revert ZeroAddress();
        owner = newOwner;
    }
}
