// GhostChain Contracts v5.6.1 (depin/GhostDePIN.sol)
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { GhostBrand } from "../GhostBrand.sol";
import { ReentrancyGuard } from "../common/ReentrancyGuard.sol";

/// @title GhostDePIN
/// @notice Decentralized Physical Infrastructure Network (DePIN) marketplace
///         for GhostChain. Enables permissionless markets for physical resources:
///         GPU compute, decentralized storage, and bandwidth.
///
///         Architecture:
///           • Providers list resources with a GST price per unit per epoch.
///           • Consumers reserve resources by depositing GST into escrow.
///           • A GhostBrain oracle validates proof-of-delivery and releases payment.
///           • Uptime SLA: providers must submit heartbeats each epoch or face slashing.
///           • Provider reputation is tracked on-chain for market discovery.
///
///         Resource types (extensible):
///           0 = GPU_COMPUTE  (unit: TFLOP-hours)
///           1 = STORAGE      (unit: GB-months)
///           2 = BANDWIDTH    (unit: GB-transferred)
contract GhostDePIN is GhostBrand, ReentrancyGuard {
    // ─── Constants ───────────────────────────────────────────────────────────
    uint8  public constant RESOURCE_GPU       = 0;
    uint8  public constant RESOURCE_STORAGE   = 1;
    uint8  public constant RESOURCE_BANDWIDTH = 2;
    uint256 public constant EPOCH_DURATION    = 1 days;
    uint256 public constant MIN_STAKE         = 10 * GST_UNIT;    // Provider stake
    uint256 public constant SLASH_RATE_BPS    = 500;              // 5% per missed SLA
    uint256 public constant PROTOCOL_FEE_BPS  = 200;             // 2% to treasury
    uint256 public constant MAX_SLA_MISSES    = 3;               // before kicked

    // ─── Types ───────────────────────────────────────────────────────────────
    struct Provider {
        address addr;
        uint8   resourceType;
        uint256 capacity;        // total available units
        uint256 pricePerUnit;    // GST per unit per epoch (18-decimal)
        uint256 stakedGST;       // slashable bond
        uint256 reputation;      // 0–1000
        uint64  lastHeartbeat;   // epoch of last heartbeat
        uint64  slaMisses;
        bool    active;
    }

    struct Reservation {
        address consumer;
        address provider;
        uint256 units;
        uint256 depositedGST;    // consumer escrow
        uint64  startEpoch;
        uint64  endEpoch;
        bool    settled;
        bool    disputed;
    }

    // ─── Storage ─────────────────────────────────────────────────────────────
    address public immutable TREASURY;
    address public           ORACLE;          // GhostBrain delivery oracle
    address public           GOVERNANCE;

    mapping(uint256 => Provider)    public providers;
    mapping(uint256 => Reservation) public reservations;

    uint256 public providerCount;
    uint256 public reservationCount;
    uint64  public currentEpoch;

    /// provider GST stake balance
    mapping(uint256 => uint256) public providerStake;

    // ─── Events ──────────────────────────────────────────────────────────────
    event ProviderRegistered(uint256 indexed id, address indexed addr, uint8 resourceType, uint256 capacity, uint256 pricePerUnit);
    event ProviderStaked(uint256 indexed providerId, uint256 amount);
    event ProviderSlashed(uint256 indexed providerId, uint256 slashedAmount);
    event ProviderDeactivated(uint256 indexed providerId);
    event ResourceReserved(uint256 indexed reservationId, address indexed consumer, uint256 indexed providerId, uint256 units, uint256 deposit);
    event ReservationSettled(uint256 indexed reservationId, uint256 providerPaid, uint256 consumerRefund);
    event ReservationDisputed(uint256 indexed reservationId);
    event HeartbeatReceived(uint256 indexed providerId, uint64 epoch);
    event EpochAdvanced(uint64 epoch);

    // ─── Errors ──────────────────────────────────────────────────────────────
    error NotOracle();
    error NotGovernance();
    error NotProvider();
    error NotConsumer();
    error ProviderInactive();
    error InsufficientCapacity();
    error InsufficientStake();
    error AlreadySettled();
    error InvalidEpochRange();

    // ─── Modifiers ───────────────────────────────────────────────────────────
    modifier onlyOracle() {
        _onlyOracle();
        _;
    }
    modifier onlyGovernance() {
        _onlyGovernance();
        _;
    }

    function _onlyOracle()     internal view { if (msg.sender != ORACLE)     revert NotOracle();     }
    function _onlyGovernance() internal view { if (msg.sender != GOVERNANCE) revert NotGovernance(); }

    // ─── Constructor ─────────────────────────────────────────────────────────
    constructor(address treasury_, address oracle_, address governance_) {
        require(treasury_   != address(0), "treasury=0");
        require(oracle_     != address(0), "oracle=0");
        require(governance_ != address(0), "gov=0");
        TREASURY   = treasury_;
        ORACLE     = oracle_;
        GOVERNANCE = governance_;
    }

    // ─── Provider: register + stake ───────────────────────────────────────────
    /// @notice Register as a DePIN resource provider.
    function registerProvider(
        uint8   resourceType,
        uint256 capacity,
        uint256 pricePerUnit
    ) external payable nonReentrant returns (uint256 id) {
        require(resourceType <= RESOURCE_BANDWIDTH, "GhostDePIN: unknown resource");
        require(capacity > 0,      "GhostDePIN: capacity=0");
        require(pricePerUnit > 0,  "GhostDePIN: price=0");
        if (msg.value < MIN_STAKE) revert InsufficientStake();

        id = ++providerCount;
        require(block.timestamp <= type(uint64).max, "ts overflow");
        providers[id] = Provider({
            addr:          msg.sender,
            resourceType:  resourceType,
            capacity:      capacity,
            pricePerUnit:  pricePerUnit,
            stakedGST:     msg.value,
            reputation:    500,
            lastHeartbeat: currentEpoch,
            slaMisses:     0,
            active:        true
        });
        providerStake[id] = msg.value;
        emit ProviderRegistered(id, msg.sender, resourceType, capacity, pricePerUnit);
        emit ProviderStaked(id, msg.value);
    }

    /// @notice Provider deposits additional stake bond.
    function addStake(uint256 providerId) external payable {
        Provider storage p = providers[providerId];
        if (p.addr != msg.sender)  revert NotProvider();
        p.stakedGST      += msg.value;
        providerStake[providerId] += msg.value;
        emit ProviderStaked(providerId, msg.value);
    }

    // ─── Provider: heartbeat ──────────────────────────────────────────────────
    /// @notice Provider submits an liveness heartbeat each epoch.
    function heartbeat(uint256 providerId) external {
        Provider storage p = providers[providerId];
        if (p.addr != msg.sender) revert NotProvider();
        p.lastHeartbeat = currentEpoch;
        emit HeartbeatReceived(providerId, currentEpoch);
    }

    // ─── Consumer: reserve resources ─────────────────────────────────────────
    /// @notice Reserve `units` of a provider's resource for [startEpoch, endEpoch].
    function reserve(
        uint256 providerId,
        uint256 units,
        uint64  startEpoch,
        uint64  endEpoch
    ) external payable nonReentrant returns (uint256 resId) {
        Provider storage p = providers[providerId];
        if (!p.active)             revert ProviderInactive();
        if (units > p.capacity)    revert InsufficientCapacity();
        if (endEpoch <= startEpoch) revert InvalidEpochRange();

        uint256 epochCount = uint256(endEpoch - startEpoch);
        uint256 required   = (units * p.pricePerUnit * epochCount) / GST_UNIT;
        require(msg.value >= required, "GhostDePIN: insufficient deposit");

        resId = ++reservationCount;
        require(block.timestamp <= type(uint64).max, "ts overflow");
        reservations[resId] = Reservation({
            consumer:     msg.sender,
            provider:     p.addr,
            units:        units,
            depositedGST: msg.value,
            startEpoch:   startEpoch,
            endEpoch:     endEpoch,
            settled:      false,
            disputed:     false
        });

        emit ResourceReserved(resId, msg.sender, providerId, units, msg.value);
    }

    // ─── Oracle: settle + dispute ─────────────────────────────────────────────
    /// @notice GhostBrain oracle settles a reservation after delivery verification.
    /// @param resId           Reservation to settle.
    /// @param deliveredUnits  Actual units delivered (may be less than reserved).
    function settle(uint256 resId, uint256 deliveredUnits) external onlyOracle nonReentrant {
        Reservation storage r = reservations[resId];
        if (r.settled)   revert AlreadySettled();
        r.settled = true;

        uint256 epochCount      = uint256(r.endEpoch - r.startEpoch);
        // Find provider for price lookup — simplified: store price in reservation or look up
        uint256 earnedGST       = (deliveredUnits > r.units ? r.units : deliveredUnits);
        // This contract uses deposited value as proportional payment basis
        uint256 providerPayment = deliveredUnits >= r.units
            ? r.depositedGST
            : (r.depositedGST * deliveredUnits) / (r.units == 0 ? 1 : r.units);
        uint256 consumerRefund  = r.depositedGST - providerPayment;
        uint256 protocolFee     = (providerPayment * PROTOCOL_FEE_BPS) / 10_000;
        uint256 providerNet     = providerPayment - protocolFee;

        if (protocolFee > 0) {
            (bool okT,) = TREASURY.call{value: protocolFee}("");
            require(okT, "GhostDePIN: treasury fee failed");
        }
        if (providerNet > 0) {
            (bool okP,) = r.provider.call{value: providerNet}("");
            require(okP, "GhostDePIN: provider payment failed");
        }
        if (consumerRefund > 0) {
            (bool okC,) = r.consumer.call{value: consumerRefund}("");
            require(okC, "GhostDePIN: consumer refund failed");
        }

        emit ReservationSettled(resId, providerNet, consumerRefund);
        // Suppress unused variable warning
        epochCount = epochCount;
        earnedGST  = earnedGST;
    }

    /// @notice Flag a reservation as disputed (consumer or oracle).
    function dispute(uint256 resId) external onlyOracle {
        Reservation storage r = reservations[resId];
        if (r.settled) revert AlreadySettled();
        r.disputed = true;
        emit ReservationDisputed(resId);
    }

    // ─── Oracle: SLA enforcement ──────────────────────────────────────────────
    /// @notice Record a missed SLA heartbeat and slash provider if needed.
    function recordSlaMiss(uint256 providerId) external onlyOracle {
        Provider storage p = providers[providerId];
        p.slaMisses++;
        uint256 slashAmount = (p.stakedGST * SLASH_RATE_BPS) / 10_000;
        if (p.stakedGST >= slashAmount) {
            p.stakedGST -= slashAmount;
            providerStake[providerId] -= slashAmount;
            (bool ok,) = TREASURY.call{value: slashAmount}("");
            require(ok, "GhostDePIN: slash transfer failed");
            emit ProviderSlashed(providerId, slashAmount);
        }
        if (p.slaMisses >= MAX_SLA_MISSES) {
            p.active = false;
            emit ProviderDeactivated(providerId);
        }
        // Adjust reputation
        if (p.reputation >= 50) p.reputation -= 50;
        else p.reputation = 0;
    }

    // ─── Governance: epoch advance + oracle update ────────────────────────────
    function advanceEpoch() external onlyGovernance {
        currentEpoch++;
        emit EpochAdvanced(currentEpoch);
    }

    function setOracle(address oracle_) external onlyGovernance {
        require(oracle_ != address(0), "oracle=0");
        ORACLE = oracle_;
    }

    receive() external payable {}
}
