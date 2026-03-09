// GhostChain Contracts v5.6.1 (l2/GhostStateChannel.sol)
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { GhostBrand } from "../GhostBrand.sol";
import { ReentrancyGuard } from "../common/ReentrancyGuard.sol";

/// @title GhostStateChannel
/// @notice Bidirectional payment and state channels for GhostL2 instant finality.
///
///         Enables two parties to transact off-chain at unlimited speed with
///         on-chain settlement only at open/close. All intermediate states are
///         signed by both parties and only the latest countersigned state sets
///         the final balance at closure.
///
///         Channel lifecycle:
///           1. `openChannel(counterparty)` — A deposits GST to open.
///           2. `joinChannel(channelId)` — B deposits GST to join.
///           3. Off-chain: parties exchange signed state updates.
///           4. `closeChannel(channelId, state, signatures)` — cooperative close.
///           5. OR: `initiateDispute(channelId, state, signatures)` → `finalizeDispute`.
///
///         Security:
///           • ECDSA signature verification for all state transitions.
///           • Dispute period prevents stale-state attacks.
///           • Nonce-based replay protection.
contract GhostStateChannel is GhostBrand, ReentrancyGuard {
    // ─── Constants ───────────────────────────────────────────────────────────
    uint256 public constant DISPUTE_PERIOD   = 1 days;
    uint256 public constant MIN_DEPOSIT      = 0.001 ether;

    // ─── Types ───────────────────────────────────────────────────────────────
    enum ChannelStatus { Open, Disputed, Closed }

    struct Channel {
        address  partyA;
        address  partyB;
        uint256  depositA;  // GST deposited by A
        uint256  depositB;  // GST deposited by B
        uint64   nonce;     // latest settled nonce
        uint256  balanceA;  // latest A balance
        uint256  balanceB;  // latest B balance
        ChannelStatus status;
        uint64   disputeDeadline; // 0 if not in dispute
    }

    // ─── Storage ─────────────────────────────────────────────────────────────
    mapping(bytes32 => Channel) public channels;
    uint256 public channelNonce;

    // ─── Events ──────────────────────────────────────────────────────────────
    event ChannelOpened(bytes32 indexed channelId, address indexed partyA, address indexed partyB, uint256 depositA);
    event ChannelJoined(bytes32 indexed channelId, address indexed partyB, uint256 depositB);
    event ChannelClosed(bytes32 indexed channelId, uint256 paidA, uint256 paidB);
    event DisputeInitiated(bytes32 indexed channelId, uint64 nonce, uint64 deadline);
    event DisputeFinalized(bytes32 indexed channelId, uint256 paidA, uint256 paidB);

    // ─── Errors ──────────────────────────────────────────────────────────────
    error ChannelNotFound();
    error NotParticipant();
    error AlreadyJoined();
    error InvalidSignature();
    error StaleState();
    error NotInDispute();
    error DisputeActive();
    error DisputeNotExpired();
    error ChannelAlreadyClosed();
    error BelowMinDeposit();
    error BalanceMismatch();

    // ─── Open a channel ───────────────────────────────────────────────────────
    /// @notice Party A opens a channel by depositing GST.
    /// @param counterparty  Address of party B.
    /// @return channelId    Unique channel identifier.
    function openChannel(address counterparty) external payable nonReentrant returns (bytes32 channelId) {
        require(counterparty != address(0) && counterparty != msg.sender, "invalid counterparty");
        if (msg.value < MIN_DEPOSIT) revert BelowMinDeposit();

        channelNonce++;
        require(block.timestamp <= type(uint64).max, "ts overflow");
        channelId = keccak256(abi.encode(msg.sender, counterparty, channelNonce, block.timestamp));
        channels[channelId] = Channel({
            partyA:          msg.sender,
            partyB:          counterparty,
            depositA:        msg.value,
            depositB:        0,
            nonce:           0,
            balanceA:        msg.value,
            balanceB:        0,
            status:          ChannelStatus.Open,
            disputeDeadline: 0
        });
        emit ChannelOpened(channelId, msg.sender, counterparty, msg.value);
    }

    /// @notice Party B joins and funds the channel.
    function joinChannel(bytes32 channelId) external payable nonReentrant {
        Channel storage ch = channels[channelId];
        if (ch.partyA == address(0))         revert ChannelNotFound();
        if (msg.sender != ch.partyB)         revert NotParticipant();
        if (ch.depositB > 0)                 revert AlreadyJoined();
        if (msg.value < MIN_DEPOSIT)         revert BelowMinDeposit();
        if (ch.status != ChannelStatus.Open) revert ChannelAlreadyClosed();

        ch.depositB = msg.value;
        ch.balanceB = msg.value;
        emit ChannelJoined(channelId, msg.sender, msg.value);
    }

    // ─── Cooperative close ────────────────────────────────────────────────────
    /// @notice Both parties sign the final state and close cooperatively.
    /// @param channelId   Target channel.
    /// @param balanceA    Final balance of party A.
    /// @param balanceB    Final balance of party B.
    /// @param nonce       State nonce (must be > current channel nonce).
    /// @param sigA        ECDSA signature by party A over the state hash.
    /// @param sigB        ECDSA signature by party B over the state hash.
    function closeChannel(
        bytes32 channelId,
        uint256 balanceA,
        uint256 balanceB,
        uint64  nonce,
        bytes calldata sigA,
        bytes calldata sigB
    ) external nonReentrant {
        Channel storage ch = _requireOpen(channelId);
        require(
            msg.sender == ch.partyA || msg.sender == ch.partyB,
            "GhostStateChannel: not participant"
        );

        bytes32 stateHash = _stateHash(channelId, balanceA, balanceB, nonce);
        if (_recover(stateHash, sigA) != ch.partyA) revert InvalidSignature();
        if (_recover(stateHash, sigB) != ch.partyB) revert InvalidSignature();
        if (nonce <= ch.nonce)                       revert StaleState();
        if (balanceA + balanceB != ch.depositA + ch.depositB) revert BalanceMismatch();

        ch.status = ChannelStatus.Closed;
        _settle(ch, balanceA, balanceB, channelId);
    }

    // ─── Dispute resolution ───────────────────────────────────────────────────
    /// @notice Initiate a dispute with the latest known signed state.
    function initiateDispute(
        bytes32 channelId,
        uint256 balanceA,
        uint256 balanceB,
        uint64  nonce,
        bytes calldata sigA,
        bytes calldata sigB
    ) external nonReentrant {
        Channel storage ch = _requireOpen(channelId);
        require(
            msg.sender == ch.partyA || msg.sender == ch.partyB,
            "GhostStateChannel: not participant"
        );

        bytes32 stateHash = _stateHash(channelId, balanceA, balanceB, nonce);
        if (_recover(stateHash, sigA) != ch.partyA) revert InvalidSignature();
        if (_recover(stateHash, sigB) != ch.partyB) revert InvalidSignature();
        if (nonce <= ch.nonce)                       revert StaleState();
        if (balanceA + balanceB != ch.depositA + ch.depositB) revert BalanceMismatch();

        ch.nonce    = nonce;
        ch.balanceA = balanceA;
        ch.balanceB = balanceB;
        ch.status   = ChannelStatus.Disputed;
        require(block.timestamp + DISPUTE_PERIOD <= type(uint64).max, "ts overflow");
        ch.disputeDeadline = uint64(block.timestamp + DISPUTE_PERIOD);

        emit DisputeInitiated(channelId, nonce, ch.disputeDeadline);
    }

    /// @notice Counter a dispute with a more recent signed state during the dispute window.
    function counterDispute(
        bytes32 channelId,
        uint256 balanceA,
        uint256 balanceB,
        uint64  nonce,
        bytes calldata sigA,
        bytes calldata sigB
    ) external nonReentrant {
        Channel storage ch = channels[channelId];
        if (ch.status != ChannelStatus.Disputed) revert NotInDispute();
        if (block.timestamp > ch.disputeDeadline) revert DisputeNotExpired();

        bytes32 stateHash = _stateHash(channelId, balanceA, balanceB, nonce);
        if (_recover(stateHash, sigA) != ch.partyA) revert InvalidSignature();
        if (_recover(stateHash, sigB) != ch.partyB) revert InvalidSignature();
        if (nonce <= ch.nonce)                       revert StaleState();
        if (balanceA + balanceB != ch.depositA + ch.depositB) revert BalanceMismatch();

        ch.nonce    = nonce;
        ch.balanceA = balanceA;
        ch.balanceB = balanceB;
        // Reset dispute window
        ch.disputeDeadline = uint64(block.timestamp + DISPUTE_PERIOD);
        emit DisputeInitiated(channelId, nonce, ch.disputeDeadline);
    }

    /// @notice Finalize a dispute after the dispute period expires.
    function finalizeDispute(bytes32 channelId) external nonReentrant {
        Channel storage ch = channels[channelId];
        if (ch.status != ChannelStatus.Disputed) revert NotInDispute();
        if (block.timestamp < ch.disputeDeadline) revert DisputeActive();

        ch.status = ChannelStatus.Closed;
        emit DisputeFinalized(channelId, ch.balanceA, ch.balanceB);
        _settle(ch, ch.balanceA, ch.balanceB, channelId);
    }

    // ─── View ─────────────────────────────────────────────────────────────────
    function getChannel(bytes32 channelId) external view returns (Channel memory) {
        return channels[channelId];
    }

    // ─── Internal ─────────────────────────────────────────────────────────────
    function _requireOpen(bytes32 channelId) internal view returns (Channel storage ch) {
        ch = channels[channelId];
        if (ch.partyA == address(0))          revert ChannelNotFound();
        if (ch.status != ChannelStatus.Open)  revert ChannelAlreadyClosed();
    }

    function _settle(Channel storage ch, uint256 balA, uint256 balB, bytes32 channelId) internal {
        address a = ch.partyA;
        address b = ch.partyB;
        if (balA > 0) {
            (bool okA,) = a.call{value: balA}("");
            require(okA, "GhostStateChannel: A payment failed");
        }
        if (balB > 0) {
            (bool okB,) = b.call{value: balB}("");
            require(okB, "GhostStateChannel: B payment failed");
        }
        emit ChannelClosed(channelId, balA, balB);
    }

    function _stateHash(bytes32 channelId, uint256 balA, uint256 balB, uint64 nonce)
        internal
        pure
        returns (bytes32)
    {
        return keccak256(abi.encode(
            "\x19GhostStateChannel\x00",
            channelId,
            balA,
            balB,
            nonce
        ));
    }

    function _recover(bytes32 hash, bytes calldata sig) internal pure returns (address) {
        require(sig.length == 65, "GhostStateChannel: invalid sig length");
        bytes32 r;
        bytes32 s;
        uint8   v;
        assembly {
            r := calldataload(sig.offset)
            s := calldataload(add(sig.offset, 0x20))
            v := byte(0, calldataload(add(sig.offset, 0x40)))
        }
        return ecrecover(hash, v, r, s);
    }
}
