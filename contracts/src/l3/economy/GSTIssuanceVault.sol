// GhostChain Contracts v5.6.1 (contracts/src/l3/economy/GSTIssuanceVault.sol)
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {GhostBrand} from "../../GhostBrand.sol";
import {GhostOwnable} from "../../ghost/GhostOwnable.sol";
import {GhostReentrancyGuard} from "../../ghost/GhostReentrancyGuard.sol";
import {IGRC20} from "../../ghost/IGRC20.sol";

/// @title  GSTIssuanceVault
/// @notice Issues GST tokens to users after confirmed fiat payments processed by
///         the GhostChain Global Payment Gateway. Holds a GST reserve funded by
///         the platform treasury; issues from the reserve per confirmed payment.
///
///         Deployed on GhostL3 (chain_id 903). Settlement is authorised by the
///         off-chain Payment Gateway (`payment_gateway.ts`) which calls
///         `issueGST()` after provider confirmation and GhostBrain fraud scoring.
///
///         Key invariants:
///           • Each payment tx_id can only be issued once (`_fulfilled` guard).
///           • Amount must be > 0 and ≤ current reserve.
///           • Only the contract owner (GhostChain Payment Gateway key) may call
///             `issueGST()`.
///           • Reentrancy is prevented on every state-changing public function.
contract GSTIssuanceVault is GhostBrand, GhostOwnable, GhostReentrancyGuard {

    // ── Errors ────────────────────────────────────────────────────────────────

    error Payment__WrongChain(uint256 got, uint256 want);
    error Payment__ZeroAddress();
    error Payment__ZeroAmount();
    error Payment__InsufficientReserve(uint256 requested, uint256 available);
    error Payment__AlreadyIssued(bytes32 txId);
    error Payment__TransferFailed();

    // ── Events ────────────────────────────────────────────────────────────────

    /// @dev Emitted each time GST is issued to a user (single payment).
    event GSTIssued(
        bytes32 indexed txId,
        address indexed recipient,
        uint256 amount
    );

    /// @dev Emitted when an admin funds the reserve.
    event ReserveFunded(address indexed funder, uint256 amount);

    /// @dev Emitted when the owner withdraws excess reserve back to treasury.
    event ReserveWithdrawn(address indexed treasury, uint256 amount);

    // ── State ─────────────────────────────────────────────────────────────────

    /// @notice The GRC-20 GST token on GhostL3.
    IGRC20 public immutable GST_TOKEN;

    /// @notice Total GST issued across all payments (informational).
    uint256 public totalIssued;

    /// @notice Amount issued per payment tx_id.
    mapping(bytes32 => uint256) public issued;

    /// @notice Idempotency guard — prevents double-issuing per payment.
    mapping(bytes32 => bool) private _fulfilled;

    // ── Constructor ───────────────────────────────────────────────────────────

    /// @param _gstToken  GRC-20 GST contract address on GhostL3.
    /// @param _admin     Owner (Payment Gateway signing key / multisig).
    constructor(address _gstToken, address _admin) GhostOwnable(_admin) {
        if (_gstToken == address(0) || _admin == address(0)) {
            revert Payment__ZeroAddress();
        }
        // Enforce GhostL3 deployment — prevents accidental L1/L2 deploys.
        if (block.chainid != L3_CHAIN_ID) {
            revert Payment__WrongChain(block.chainid, L3_CHAIN_ID);
        }
        GST_TOKEN = IGRC20(_gstToken);
    }

    // ── Admin: fund reserve ───────────────────────────────────────────────────

    /// @notice Transfer GST from caller into this vault's reserve.
    ///         Caller must have approved this contract for `amount` GST.
    /// @param  amount  GST amount in wei (18 decimals).
    function fundReserve(uint256 amount) external onlyOwner nonReentrant {
        if (amount == 0) revert Payment__ZeroAmount();
        bool ok = GST_TOKEN.transferFrom(msg.sender, address(this), amount);
        if (!ok) revert Payment__TransferFailed();
        emit ReserveFunded(msg.sender, amount);
    }

    /// @notice Withdraw excess reserve back to a treasury address.
    /// @param  treasury  Destination address.
    /// @param  amount    GST amount in wei to withdraw.
    function withdrawReserve(
        address treasury,
        uint256 amount
    ) external onlyOwner nonReentrant {
        if (treasury == address(0)) revert Payment__ZeroAddress();
        if (amount == 0) revert Payment__ZeroAmount();
        uint256 bal = reserve();
        if (amount > bal) revert Payment__InsufficientReserve(amount, bal);
        bool ok = GST_TOKEN.transfer(treasury, amount);
        if (!ok) revert Payment__TransferFailed();
        emit ReserveWithdrawn(treasury, amount);
    }

    // ── Issue GST ─────────────────────────────────────────────────────────────

    /// @notice Issue GST to `recipient` for a confirmed fiat payment.
    ///         Idempotent: reverts if `txId` was already fulfilled.
    ///
    /// @param  txId       Off-chain payment ID (keccak256 of UUID bytes).
    /// @param  recipient  GhostL3 wallet address to receive GST.
    /// @param  amount     GST amount in wei (18 decimals).
    function issueGST(
        bytes32 txId,
        address recipient,
        uint256 amount
    ) external onlyOwner nonReentrant {
        if (recipient == address(0)) revert Payment__ZeroAddress();
        if (amount   == 0)           revert Payment__ZeroAmount();
        if (_fulfilled[txId])        revert Payment__AlreadyIssued(txId);

        uint256 bal = reserve();
        if (amount > bal) revert Payment__InsufficientReserve(amount, bal);

        _fulfilled[txId] = true;
        issued[txId]     = amount;
        totalIssued     += amount;

        bool ok = GST_TOKEN.transfer(recipient, amount);
        if (!ok) revert Payment__TransferFailed();

        emit GSTIssued(txId, recipient, amount);
    }

    // ── Views ─────────────────────────────────────────────────────────────────

    /// @notice Current GST balance held as issuable reserve.
    function reserve() public view returns (uint256) {
        return GST_TOKEN.balanceOf(address(this));
    }

    /// @notice Check whether a payment has already been fulfilled.
    /// @param  txId  Off-chain payment ID.
    function isFulfilled(bytes32 txId) external view returns (bool) {
        return _fulfilled[txId];
    }
}
