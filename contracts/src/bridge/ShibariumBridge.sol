// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.24;

import {Governed} from "../common/Governed.sol";
import {ReentrancyGuard} from "../common/ReentrancyGuard.sol";

// ─────────────────────────────────────────────────────────────────────────────
// External interfaces
// ─────────────────────────────────────────────────────────────────────────────

/// @dev Shibarium uses the Polygon FxPortal architecture.
///      FxERC20RootTunnel is the canonical ERC-20 bridge contract on Ethereum L1.
interface IFxERC20RootTunnel {
    /// @notice Lock `amount` of `rootToken` in the tunnel and emit a state-sync
    ///         event that Shibarium's FxChild will process to mint the child token.
    function deposit(
        address rootToken,
        address user,
        uint256 amount,
        bytes   calldata data
    ) external;

    /// @notice Register a (rootToken → childToken) mapping so the FxChild knows
    ///         which child token to mint.  Must be called once before the first deposit.
    function mapToken(address rootToken, address childToken) external;

    /// @notice Finalise a withdrawal: submit the Merkle proof of a Shibarium burn
    ///         transaction that was included in a checkpoint, releasing locked tokens.
    /// @param  inputData RLP-encoded proof bundle produced by the FxPortal SDK.
    function exit(bytes calldata inputData) external;
}

/// @dev Minimal ERC-20 surface needed by the root bridge.
interface IERC20Root {
    function approve(address spender, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

// ─────────────────────────────────────────────────────────────────────────────
// ShibariumBridge (L1 / Ethereum root)
// ─────────────────────────────────────────────────────────────────────────────

/// @title  ShibariumBridge
/// @notice Ethereum-side bridge adapter connecting GhostChain's GST liquidity to
///         Shibarium (chainId 109) via the Polygon FxPortal mechanism.
///
///         Architecture overview
///         ─────────────────────
///         Ethereum L1                         Shibarium (chainId 109)
///         ──────────────────────────────────  ─────────────────────────────────
///         ShibariumBridge                     ShibariumBridgeChild
///             │                                   │
///             ├─ deposit() ──► FxERC20RootTunnel  │
///             │      (locks GST on L1)             │
///             │                    ──── state sync ──► FxChild ──► mint GST-S
///             │                                   │
///             ├─ exit()    ◄── checkpoint proof ◄──┤ burn GST-S
///             │      (releases locked GST)         │
///             └────────────────────────────────────┘
///
///         Integration with GSTCrossChainAdapter
///         ───────────────────────────────────────
///         This contract exposes `bridgeERC20To()` — the same interface used by
///         `GSTCrossChainAdapter` — so it can be registered simply via `addChain()`
///         with this contract's address as the `bridge` parameter.
///
///         Token mapping
///         ─────────────
///         Before the first deposit the operator must call `mapToken()` to register
///         the GST ↔ GST-S (Shibarium) token pair in the FxPortal.  This mapping is
///         stored permanently in the FxERC20RootTunnel and only needs to happen once.
///
///         Withdrawals
///         ───────────
///         Withdrawal proofs are generated off-chain using the Polygon FxPortal SDK
///         and submitted via `finaliseWithdrawal(proof)`.  The bridge verifies the
///         checkpoint inclusion and releases the locked GST to the specified receiver.
///
///         Routing law: L1-only.  Never deploy or call this from L2/L3.
contract ShibariumBridge is Governed, ReentrancyGuard {

    // ──────────────────────────────────────────────────────────────────────────
    // Constants
    // ──────────────────────────────────────────────────────────────────────────

    /// @notice Shibarium mainnet EIP-155 chain ID.
    uint256 public constant SHIBARIUM_CHAIN_ID = 109;

    /// @notice Shibarium Puppynet (testnet) chain ID.
    uint256 public constant SHIBARIUM_TESTNET_CHAIN_ID = 157;

    // ──────────────────────────────────────────────────────────────────────────
    // State
    // ──────────────────────────────────────────────────────────────────────────

    /// @notice GST token contract on Ethereum L1.
    IERC20Root public immutable gst;

    /// @notice FxERC20RootTunnel deployed by Shibarium/Polygon on Ethereum.
    IFxERC20RootTunnel public fxRootTunnel;

    /// @notice GST-S token address on Shibarium (child chain representation).
    address public childGST;

    /// @notice Whether the GST ↔ GST-S token mapping has been registered in the tunnel.
    bool public tokenMapped;

    /// @notice Trusted callers that may initiate deposits (GSTCrossChainAdapter, FeeInvestmentManager).
    mapping(address => bool) public operators;

    /// @notice Whether the bridge is accepting new deposits.
    bool public paused;

    // Accounting
    uint256 public totalDeposited;
    uint256 public totalWithdrawn;

    // ──────────────────────────────────────────────────────────────────────────
    // Pending withdrawal tracking
    // ──────────────────────────────────────────────────────────────────────────

    struct PendingWithdrawal {
        address receiver;
        uint256 amount;
        uint256 requestedAt;
        bool    finalised;
    }

    uint256 public withdrawalNonce;
    mapping(uint256 => PendingWithdrawal) public pendingWithdrawals;

    // ──────────────────────────────────────────────────────────────────────────
    // Events
    // ──────────────────────────────────────────────────────────────────────────

    event TokenMapped(address indexed rootToken, address indexed childToken);
    event Deposited(
        address indexed sender,
        address indexed recipient,
        uint256 amount,
        bytes   extraData
    );
    event WithdrawalRequested(uint256 indexed nonce, address indexed receiver, uint256 amount);
    event WithdrawalFinalised(uint256 indexed nonce, address indexed receiver, uint256 amount);

    event FxRootTunnelSet(address indexed tunnel);
    event ChildGSTSet(address indexed childGST);
    event OperatorSet(address indexed operator, bool allowed);
    event PausedSet(bool paused);

    // ──────────────────────────────────────────────────────────────────────────
    // Errors
    // ──────────────────────────────────────────────────────────────────────────

    error Halted();
    error NotOperator(address caller);
    error TokenNotMapped();
    error AlreadyMapped();
    error ZeroAddress();
    error ZeroAmount();
    error WithdrawalAlreadyFinalised(uint256 nonce);

    // ──────────────────────────────────────────────────────────────────────────
    // Constructor
    // ──────────────────────────────────────────────────────────────────────────

    /// @param gst_          GST ERC-20 address on Ethereum (canonical gas token).
    /// @param fxRootTunnel_ FxERC20RootTunnel deployed for Shibarium on Ethereum.
    /// @param childGST_     GST-S token address on Shibarium (may be zero before mapping).
    /// @param governor_     Governance / timelock address.
    /// @param timelock_     Secondary executor (optional, pass address(0) to skip).
    constructor(
        address gst_,
        address fxRootTunnel_,
        address childGST_,
        address governor_,
        address timelock_
    ) Governed(governor_, timelock_) {
        if (gst_ == address(0)) revert ZeroAddress();
        if (fxRootTunnel_ == address(0)) revert ZeroAddress();
        gst          = IERC20Root(gst_);
        fxRootTunnel = IFxERC20RootTunnel(fxRootTunnel_);
        childGST     = childGST_;
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Modifiers
    // ──────────────────────────────────────────────────────────────────────────

    modifier notPaused() {
        if (paused) revert Halted();
        _;
    }

    modifier onlyOperator() {
        if (!operators[msg.sender] && msg.sender != governor && msg.sender != timelock) {
            revert NotOperator(msg.sender);
        }
        _;
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Token mapping
    // ──────────────────────────────────────────────────────────────────────────

    /// @notice Register the GST ↔ GST-S token pair in the FxPortal root tunnel.
    ///         Must be called once before the first deposit.  Requires `childGST` to
    ///         be set.  This call is permissioned to governance so the mapping cannot
    ///         be poisoned by an arbitrary caller.
    function mapToken() external onlyGovernance {
        if (tokenMapped) revert AlreadyMapped();
        if (childGST == address(0)) revert ZeroAddress();
        fxRootTunnel.mapToken(address(gst), childGST);
        tokenMapped = true;
        emit TokenMapped(address(gst), childGST);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Deposit (L1 → Shibarium)
    // ──────────────────────────────────────────────────────────────────────────

    /// @notice ICrossDomainBridge-compatible entry point used by GSTCrossChainAdapter.
    ///         Locks `amount` of GST in the FxERC20RootTunnel, which triggers on
    ///         Shibarium a mint of the equivalent GST-S to `to`.
    ///
    /// @param localToken   Must equal address(gst); validated to guard mis-routing.
    /// @param remoteToken  Must equal childGST; validated against the registered mapping.
    /// @param to           Recipient address on Shibarium.
    /// @param amount       Amount of GST to bridge.
    /// @param minGasLimit  Unused (FxPortal manages gas internally); kept for interface compat.
    /// @param extraData    Arbitrary bytes forwarded to the FxPortal deposit call.
    function bridgeERC20To(
        address localToken,
        address remoteToken,
        address to,
        uint256 amount,
        uint32  minGasLimit,
        bytes   calldata extraData
    ) external onlyOperator notPaused nonReentrant {
        if (!tokenMapped) revert TokenNotMapped();
        if (amount == 0) revert ZeroAmount();
        if (to == address(0)) revert ZeroAddress();

        require(localToken  == address(gst), "ShibariumBridge: wrong local token");
        require(remoteToken == childGST,     "ShibariumBridge: wrong remote token");

        // Suppress unused-local warning while keeping the interface signature.
        minGasLimit;

        // Pull GST from caller and approve the root tunnel to spend it.
        require(gst.transferFrom(msg.sender, address(this), amount), "ShibariumBridge: pull failed");
        require(gst.approve(address(fxRootTunnel), amount),          "ShibariumBridge: approve failed");

        // Initiate cross-chain deposit via FxPortal.
        fxRootTunnel.deposit(address(gst), to, amount, extraData);

        totalDeposited += amount;
        emit Deposited(msg.sender, to, amount, extraData);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Withdrawal (Shibarium → L1)
    // ──────────────────────────────────────────────────────────────────────────

    /// @notice Register a pending withdrawal.  Called by operators when a burn on
    ///         Shibarium has been detected and a Merkle proof is being assembled.
    ///         The nonce returned should be matched with the corresponding
    ///         `finaliseWithdrawal()` call once the checkpoint is available.
    ///
    /// @param  receiver  L1 address that will receive the unlocked GST.
    /// @param  amount    Amount of GST to release.
    /// @return nonce     Identifier for this withdrawal request.
    function requestWithdrawal(address receiver, uint256 amount)
        external
        onlyOperator
        returns (uint256 nonce)
    {
        if (receiver == address(0)) revert ZeroAddress();
        if (amount   == 0)          revert ZeroAmount();

        nonce = ++withdrawalNonce;
        pendingWithdrawals[nonce] = PendingWithdrawal({
            receiver:    receiver,
            amount:      amount,
            requestedAt: block.timestamp,
            finalised:   false
        });
        emit WithdrawalRequested(nonce, receiver, amount);
    }

    /// @notice Finalise a withdrawal by submitting the FxPortal checkpoint proof.
    ///         Calls `fxRootTunnel.exit(inputData)` which verifies the checkpoint
    ///         inclusion proof and transfers the locked GST back to `receiver`.
    ///
    /// @param  nonce      Withdrawal nonce from `requestWithdrawal()`.
    /// @param  inputData  RLP-encoded proof produced by the FxPortal JS SDK.
    function finaliseWithdrawal(uint256 nonce, bytes calldata inputData)
        external
        onlyOperator
        nonReentrant
    {
        PendingWithdrawal storage w = pendingWithdrawals[nonce];
        if (w.finalised) revert WithdrawalAlreadyFinalised(nonce);

        w.finalised = true;

        // Delegate proof verification and token release to the FxPortal root tunnel.
        // The root tunnel will call gst.transfer(receiver, amount) internally upon
        // successful proof verification.
        fxRootTunnel.exit(inputData);

        totalWithdrawn += w.amount;
        emit WithdrawalFinalised(nonce, w.receiver, w.amount);
    }

    /// @notice Emergency direct withdrawal of GST held by this contract to governance.
    ///         Only callable when paused and only by governance.
    function emergencyWithdraw(address to, uint256 amount) external onlyGovernance {
        require(paused, "ShibariumBridge: not paused");
        require(to != address(0), "ShibariumBridge: zero to");
        require(gst.transfer(to, amount), "ShibariumBridge: transfer failed");
    }

    // ──────────────────────────────────────────────────────────────────────────
    // View helpers
    // ──────────────────────────────────────────────────────────────────────────

    /// @notice Net GST currently in transit (deposited but not yet withdrawn).
    function inTransit() external view returns (uint256) {
        return totalDeposited - totalWithdrawn;
    }

    /// @notice Returns the pending withdrawal record for a given nonce.
    function getWithdrawal(uint256 nonce)
        external
        view
        returns (address receiver, uint256 amount, uint256 requestedAt, bool finalised)
    {
        PendingWithdrawal storage w = pendingWithdrawals[nonce];
        return (w.receiver, w.amount, w.requestedAt, w.finalised);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Governance setters
    // ──────────────────────────────────────────────────────────────────────────

    /// @notice Update the FxERC20RootTunnel address (e.g. after Shibarium upgrades).
    function setFxRootTunnel(address tunnel) external onlyGovernance {
        if (tunnel == address(0)) revert ZeroAddress();
        fxRootTunnel = IFxERC20RootTunnel(tunnel);
        emit FxRootTunnelSet(tunnel);
    }

    /// @notice Set or update the Shibarium GST-S child token address.
    ///         Can only be changed before the first token mapping.
    function setChildGST(address childGST_) external onlyGovernance {
        if (tokenMapped) revert AlreadyMapped();
        if (childGST_ == address(0)) revert ZeroAddress();
        childGST = childGST_;
        emit ChildGSTSet(childGST_);
    }

    function setOperator(address operator, bool allowed) external onlyGovernance {
        operators[operator] = allowed;
        emit OperatorSet(operator, allowed);
    }

    function setPaused(bool paused_) external onlyGovernance {
        paused = paused_;
        emit PausedSet(paused_);
    }
}
