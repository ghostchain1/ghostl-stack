// SPDX-License-Identifier: MIT
// GhostChain Contracts v5.6.1 (ghostswap/WGSTBridgeAdapter.sol)
// @ghostchain Part of the GhostChain protocol suite — https://ghostchain.cloud

pragma solidity ^0.8.24;

import { GhostBrand } from "../GhostBrand.sol";
import { ReentrancyGuard } from "../common/ReentrancyGuard.sol";
import { IXDomainMessenger } from "../common/IXDomainMessenger.sol";
import { IWGST } from "./IGhostSwap.sol";

/// @title WGSTBridgeAdapter
/// @notice Canonical bridge adapter that moves Wrapped GST (WGST) across the
///         GhostChain layer stack:
///
///           L1 ↔ L2 ↔ L3
///
///         This adapter acts as both the **local escrow** (on the source layer)
///         and the **remote minter** (on the destination layer).  It communicates
///         via the OP Stack cross-domain messenger.
///
///         === Canonical flow ===
///
///         DEPOSIT (L1 → L2):
///           1. User approves this adapter to spend their WGST on L1.
///           2. User calls `bridgeToRemote(amount, minGasLimit, to)` on L1.
///           3. Adapter `transferFrom`s WGST into its custody (escrowed).
///           4. Adapter sends a cross-domain message to the L2 counterpart.
///           5. L2 adapter receives `finalizeFromRemote` and mints WGST to `to`.
///
///         WITHDRAWAL (L2 → L1):
///           1. User calls `bridgeToRemote(amount, minGasLimit, to)` on L2.
///           2. Adapter burns the WGST on L2.
///           3. Cross-domain message sent to L1 adapter.
///           4. L1 adapter receives `finalizeFromRemote` and releases escrowed WGST.
///
///         === Canonical vs Representation ===
///
///         The adapter deployed on the canonical layer (L1, `isCanonical = true`)
///         escrows tokens; adapters on L2 / L3 (`isCanonical = false`) burn/mint
///         the bridged representation token.
///
///         Note: WGST on L2/L3 must grant MINTER_ROLE to this adapter, or the
///         WGST contract must expose `mint(address, uint256)` / `burn(address, uint256)`.
///
/// @dev All native GST handling is done via the WGST wrapper — this adapter never
///      touches native coins directly.
contract WGSTBridgeAdapter is GhostBrand, ReentrancyGuard {
    // ─────────────────────── Events ──────────────────────────────────────────

    /// @notice Emitted when a bridge deposit is initiated on this layer.
    event BridgeInitiated(
        address indexed from,
        address indexed to,
        uint256 amount,
        uint32  minGasLimit
    );

    /// @notice Emitted when a bridge transfer is finalised on this layer.
    event BridgeFinalized(
        address indexed from,
        address indexed to,
        uint256 amount
    );

    // ─────────────────────── State ───────────────────────────────────────────

    /// @notice The WGST token contract on this layer.
    address public immutable wgst;

    /// @notice The OP Stack cross-domain messenger on this layer.
    IXDomainMessenger public immutable messenger;

    /// @notice The counterpart WGSTBridgeAdapter on the adjacent layer.
    address public immutable remoteAdapter;

    /// @notice True on L1 (canonical custody); false on L2/L3 (mint-burn).
    bool    public immutable isCanonical;

    // ─────────────────────── Init ────────────────────────────────────────────

    /// @param _wgst          WGST token on this layer.
    /// @param _messenger     OP Stack cross-domain messenger on this layer.
    /// @param _remoteAdapter WGSTBridgeAdapter on the adjacent layer.
    /// @param _isCanonical   `true` for L1 (escrow model); `false` for L2/L3 (burn/mint).
    constructor(
        address _wgst,
        address _messenger,
        address _remoteAdapter,
        bool    _isCanonical
    ) {
        require(_wgst          != address(0), "WGSTBridge: zero wgst");
        require(_messenger     != address(0), "WGSTBridge: zero messenger");
        require(_remoteAdapter != address(0), "WGSTBridge: zero remoteAdapter");
        wgst          = _wgst;
        messenger     = IXDomainMessenger(_messenger);
        remoteAdapter = _remoteAdapter;
        isCanonical   = _isCanonical;
    }

    // ─────────────────────── Modifiers ───────────────────────────────────────

    /// @dev Must be called via messenger from the remote adapter only.
    modifier onlyRemote() {
        _checkRemote();
        _;
    }

    function _checkRemote() internal view {
        require(msg.sender == address(messenger),            "WGSTBridge: not messenger");
        require(messenger.xDomainMessageSender() == remoteAdapter, "WGSTBridge: not remoteAdapter");
    }

    // ─────────────────────── Bridge — outbound ───────────────────────────────

    /// @notice Initiate a cross-layer WGST transfer.
    ///
    ///         Caller must have approved this contract to spend `amount` WGST.
    ///
    /// @param amount       WGST amount to bridge (18 decimals).
    /// @param minGasLimit  Minimum gas for the remote `finalizeFromRemote` call.
    /// @param to           Recipient address on the remote layer (must not be 0).
    function bridgeToRemote(uint256 amount, uint32 minGasLimit, address to)
        external
        nonReentrant
    {
        require(amount > 0,       "WGSTBridge: zero amount");
        require(to != address(0), "WGSTBridge: zero recipient");

        if (isCanonical) {
            // ── Canonical layer (L1): escrow tokens in this contract ──
            require(
                IWGST(wgst).transferFrom(msg.sender, address(this), amount),
                "WGSTBridge: transferFrom failed"
            );
        } else {
            // ── Representation layer (L2/L3): burn tokens ──
            require(
                IWGST(wgst).transferFrom(msg.sender, address(this), amount),
                "WGSTBridge: transferFrom failed"
            );
            IBridgeableWGST(wgst).burn(address(this), amount);
        }

        // Encode the finalize call for the remote adapter.
        bytes memory message = abi.encodeCall(
            WGSTBridgeAdapter.finalizeFromRemote,
            (msg.sender, to, amount)
        );

        messenger.sendMessage(remoteAdapter, message, minGasLimit);

        emit BridgeInitiated(msg.sender, to, amount, minGasLimit);
    }

    /// @notice Wrap native GST to WGST, then initiate a cross-layer transfer.
    ///         Convenience function for users who hold native GST rather than WGST.
    ///
    /// @param minGasLimit  Minimum gas for the remote finalize call.
    /// @param to           Recipient on the remote layer.
    function bridgeGSTToRemote(uint32 minGasLimit, address to)
        external
        payable
        nonReentrant
    {
        require(msg.value > 0,    "WGSTBridge: zero value");
        require(to != address(0), "WGSTBridge: zero recipient");

        // Wrap native GST → WGST.
        IWGST(wgst).deposit{value: msg.value}();

        uint256 amount = msg.value;

        if (!isCanonical) {
            // Burn on representation layers.
            IBridgeableWGST(wgst).burn(address(this), amount);
        }
        // On canonical layer the WGST stays escrowed in this contract.

        bytes memory message = abi.encodeCall(
            WGSTBridgeAdapter.finalizeFromRemote,
            (msg.sender, to, amount)
        );

        messenger.sendMessage(remoteAdapter, message, minGasLimit);

        emit BridgeInitiated(msg.sender, to, amount, minGasLimit);
    }

    // ─────────────────────── Bridge — inbound ────────────────────────────────

    /// @notice Called by the remote adapter (via messenger) to complete a bridge transfer.
    ///
    ///         This can only be called through the cross-domain messenger from the
    ///         trusted remote adapter — direct calls will revert.
    ///
    /// @param from     Original sender on the remote layer (informational, for event).
    /// @param to       Recipient on this layer.
    /// @param amount   WGST amount to release or mint.
    function finalizeFromRemote(address from, address to, uint256 amount)
        external
        onlyRemote
        nonReentrant
    {
        require(amount > 0,       "WGSTBridge: zero amount");
        require(to != address(0), "WGSTBridge: zero recipient");

        if (isCanonical) {
            // ── Canonical layer (L1): release escrowed WGST ──
            require(
                IWGST(wgst).transfer(to, amount),
                "WGSTBridge: transfer failed"
            );
        } else {
            // ── Representation layer (L2/L3): mint WGST to recipient ──
            IBridgeableWGST(wgst).mint(to, amount);
        }

        emit BridgeFinalized(from, to, amount);
    }

    // ─────────────────────── View helpers ────────────────────────────────────

    /// @notice Amount of WGST currently escrowed in this adapter (canonical layers only).
    function escrowedBalance() external view returns (uint256) {
        return IWGST(wgst).balanceOf(address(this));
    }

    /// @notice Layer ID this adapter is deployed on (read from GhostBrand constants).
    function layerChainId() external view returns (uint256 chainId) {
        assembly {
            chainId := chainid()
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// IBridgeableWGST
// ─────────────────────────────────────────────────────────────────────────────

/// @notice Interface that WGST10 (or any bridgeable WGST variant) must implement
///         so the bridge adapter can mint/burn representation tokens on L2/L3.
///
/// @dev WGST9 does NOT implement this interface — it is canonical-only.
///      WGST10 exposes these hooks via a `BRIDGE_ROLE` access-controlled path.
interface IBridgeableWGST {
    /// @notice Mint `amount` WGST to `to`.  Caller must hold BRIDGE_ROLE.
    function mint(address to, uint256 amount) external;

    /// @notice Burn `amount` WGST from `from`.  Caller must hold BRIDGE_ROLE or `from == msg.sender`.
    function burn(address from, uint256 amount) external;
}
