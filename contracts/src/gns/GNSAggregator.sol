// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// ────────────────────────────────────────────────────────────────────────────
// GNSAggregator — Ghost Name Service, L2 Registration Aggregator
//
// Routing law: L3 → L2 only, L2 → L1 only
//
// Batches name registration requests from L3 (via cross-domain messenger),
// collects GST fees, applies the tokenomics split, and forwards canonical
// proofs to the L1 GNSRegistry via the OP-Stack CrossDomainMessenger.
//
// GST Fee split:
//   10% burn
//   40% L1 Treasury
//   30% L2 Sequencer
//   20% L3 Infrastructure (held, relayed back)
// ────────────────────────────────────────────────────────────────────────────

interface IGST20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function burn(uint256 amount) external;
    function balanceOf(address who) external view returns (uint256);
}

interface ICrossDomainMessenger {
    function sendMessage(
        address _target,
        bytes calldata _message,
        uint32 _minGasLimit
    ) external;
    function xDomainMessageSender() external view returns (address);
}

interface IL1GNSRegistry {
    function bridgeRegister(
        bytes32 node,
        string calldata label,
        address owner,
        uint64  expiry
    ) external;
}

library GNSAggLib {
    bytes32 internal constant ROOT_NODE = bytes32(0);

    function namehash(bytes32 parent, string memory label) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(parent, keccak256(bytes(label))));
    }
}

contract GNSAggregator {
    using GNSAggLib for bytes32;

    /// @dev Canonical GST denomination — 1 GST = 1e18 base units
    uint256 public constant GST_UNIT = 1e18;

    // ── Config ────────────────────────────────────────────────────────────────
    ICrossDomainMessenger public immutable messenger;
    address public immutable l1Registry;   // L1 GNSRegistry address
    IGST20  public           gst;          // GST token on L2

    address public owner;
    address public l1Treasury;
    address public l2Sequencer;
    address public l3Infrastructure;
    address public l3Portal;        // authorised L3 relayer

    /// Base price per year in GST (18 decimals)
    uint256 public pricePerYear = GST_UNIT;  // configurable

    bytes32 public immutable GHOST_ROOT;
    uint32  public constant  MIN_GAS_LIMIT = 500_000;

    // ── State ─────────────────────────────────────────────────────────────────
    struct PendingRegistration {
        bytes32 node;
        string  label;
        address registrant;
        uint64  expiry;
        bool    forwarded;
    }

    mapping(bytes32 => PendingRegistration) public pending;
    mapping(bytes32 => bool) public reserved;

    // ── Events ────────────────────────────────────────────────────────────────
    event RegistrationQueued(bytes32 indexed node, string label, address registrant, uint64 expiry);
    event RegistrationForwarded(bytes32 indexed node);
    event FeeDistributed(uint256 burn, uint256 treasury, uint256 sequencer, uint256 infra);
    event PriceUpdated(uint256 newPrice);

    // ── Errors ────────────────────────────────────────────────────────────────
    error NotOwner();
    error NotPortalOrOwner();
    error AlreadyPending();
    error ReservedLabel();
    error AlreadyForwarded();
    error InsufficientFee();
    error InvalidDuration();

    uint64 public constant MIN_DURATION = 365 days;
    uint64 public constant MAX_DURATION = 10 * 365 days;

    // ── Constructor ───────────────────────────────────────────────────────────
    constructor(
        address _messenger,
        address _l1Registry,
        address _gst,
        address _l1Treasury,
        address _l2Sequencer,
        address _l3Infrastructure
    ) {
        owner          = msg.sender;
        messenger      = ICrossDomainMessenger(_messenger);
        l1Registry     = _l1Registry;
        gst            = IGST20(_gst);
        l1Treasury     = _l1Treasury;
        l2Sequencer    = _l2Sequencer;
        l3Infrastructure = _l3Infrastructure;

        GHOST_ROOT = keccak256(abi.encodePacked(bytes32(0), keccak256(bytes("ghost"))));

        // Constitutional reserves
        _addReserved("validator");
        _addReserved("dao");
        _addReserved("treasury");
        _addReserved("core");
    }

    // ── Modifiers ─────────────────────────────────────────────────────────────
    modifier onlyOwner() { if (msg.sender != owner) revert NotOwner(); _; }
    modifier onlyPortalOrOwner() {
        if (msg.sender != l3Portal && msg.sender != owner) revert NotPortalOrOwner();
        _;
    }

    // ── External: Register via L3 Portal relay ────────────────────────────────
    /// @notice Called by L3 portal (cross-domain) or owner
    function queueRegistration(
        string calldata label,
        address registrant,
        uint64  duration,
        uint256 feePaid    // GST amount pulled from registrant
    ) external returns (bytes32 node) {
        if (duration < MIN_DURATION || duration > MAX_DURATION) revert InvalidDuration();

        bytes32 lh = keccak256(bytes(label));
        if (reserved[lh]) revert ReservedLabel();

        node = keccak256(abi.encodePacked(GHOST_ROOT, lh));
        if (pending[node].expiry != 0) revert AlreadyPending();

        // Pull GST fee
        uint256 required = _yearCost(duration);
        if (feePaid < required) revert InsufficientFee();
        require(gst.transferFrom(msg.sender, address(this), feePaid), "gst transfer failed");

        // Distribute fee
        _distributeFee(feePaid);

        uint64 exp = uint64(block.timestamp) + duration;

        pending[node] = PendingRegistration({
            node:       node,
            label:      label,
            registrant: registrant,
            expiry:     exp,
            forwarded:  false
        });

        emit RegistrationQueued(node, label, registrant, exp);
    }

    /// @notice Forward a queued registration to L1 via OP messenger
    function forwardToL1(bytes32 node) external {
        PendingRegistration storage reg = pending[node];
        if (reg.expiry == 0) revert AlreadyPending();
        if (reg.forwarded)   revert AlreadyForwarded();

        reg.forwarded = true;

        bytes memory callData = abi.encodeCall(
            IL1GNSRegistry.bridgeRegister,
            (reg.node, reg.label, reg.registrant, reg.expiry)
        );

        messenger.sendMessage(l1Registry, callData, MIN_GAS_LIMIT);
        emit RegistrationForwarded(node);
    }

    // ── Fee distribution ──────────────────────────────────────────────────────
    function _distributeFee(uint256 total) internal {
        uint256 burnAmt  = total * 10 / 100;
        uint256 trsryAmt = total * 40 / 100;
        uint256 seqAmt   = total * 30 / 100;
        uint256 infraAmt = total - burnAmt - trsryAmt - seqAmt; // 20%

        gst.burn(burnAmt);
        gst.transfer(l1Treasury,     trsryAmt);
        gst.transfer(l2Sequencer,    seqAmt);
        gst.transfer(l3Infrastructure, infraAmt);

        emit FeeDistributed(burnAmt, trsryAmt, seqAmt, infraAmt);
    }

    function _yearCost(uint64 duration) internal view returns (uint256) {
        return pricePerYear * duration / 365 days;
    }

    // ── Admin ─────────────────────────────────────────────────────────────────
    function setPortal(address portal)         external onlyOwner { l3Portal = portal; }
    function setPricePerYear(uint256 price)    external onlyOwner { pricePerYear = price; emit PriceUpdated(price); }
    function setGST(address _gst)              external onlyOwner { gst = IGST20(_gst); }
    function setL1Treasury(address addr)       external onlyOwner { l1Treasury = addr; }
    function setL2Sequencer(address addr)      external onlyOwner { l2Sequencer = addr; }
    function setL3Infrastructure(address addr) external onlyOwner { l3Infrastructure = addr; }
    function transferOwner(address newOwner)   external onlyOwner { owner = newOwner; }

    function _addReserved(string memory label) internal {
        reserved[keccak256(bytes(label))] = true;
    }
}
