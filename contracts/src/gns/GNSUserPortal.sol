// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// ────────────────────────────────────────────────────────────────────────────
// GNSUserPortal — Ghost Name Service, L3 User Entry Point
//
// Routing law: L3 ↔ L2 only
//
// Gas-efficient user-facing contract on GhostL3.
// Users pay GST (on L3), name requests are queued and relayed to L2
// aggregator via the L3→L2 cross-domain messenger.
// ────────────────────────────────────────────────────────────────────────────

interface IERC20Portal {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
    function balanceOf(address who) external view returns (uint256);
}

interface IL2CrossDomainMessenger {
    function sendMessage(
        address _target,
        bytes calldata _message,
        uint32 _minGasLimit
    ) external;
}

interface IL2GNSAggregator {
    function queueRegistration(
        string calldata label,
        address registrant,
        uint64  duration,
        uint256 feePaid
    ) external returns (bytes32);
}

contract GNSUserPortal {
    // ── Config ────────────────────────────────────────────────────────────────
    IL2CrossDomainMessenger public immutable l2Messenger;
    address public immutable l2Aggregator;
    IERC20Portal public       gst;          // GST token on L3

    address public owner;
    uint256 public pricePerYear = 1 ether;  // mirrors L2 price
    uint32  public constant MIN_GAS_LIMIT = 300_000;

    // ── State ─────────────────────────────────────────────────────────────────
    struct Request {
        address registrant;
        string  label;
        uint64  duration;
        uint256 fee;
        uint64  requestedAt;
        bool    relayed;
    }

    // requestId → Request
    mapping(uint256 => Request) public requests;
    uint256 public nextId;

    // ── Events ────────────────────────────────────────────────────────────────
    event RegistrationRequested(uint256 indexed id, string label, address registrant, uint64 duration, uint256 fee);
    event RegistrationRelayed(uint256 indexed id);
    event SubnameRequested(string parent, string sublabel, address registrant, uint256 fee);
    event PriceUpdated(uint256 newPrice);

    // ── Errors ────────────────────────────────────────────────────────────────
    error NotOwner();
    error InsufficientFee();
    error AlreadyRelayed();
    error InvalidDuration();
    error EmptyLabel();

    uint64 public constant MIN_DURATION = 365 days;
    uint64 public constant MAX_DURATION = 10 * 365 days;

    constructor(address _l2Messenger, address _l2Aggregator, address _gst) {
        owner         = msg.sender;
        l2Messenger   = IL2CrossDomainMessenger(_l2Messenger);
        l2Aggregator  = _l2Aggregator;
        gst           = IERC20Portal(_gst);
    }

    modifier onlyOwner() { if (msg.sender != owner) revert NotOwner(); _; }

    // ── Registration flow ─────────────────────────────────────────────────────
    /// @notice User requests a .ghost name.  GST is collected here, relayed to L2.
    function requestRegistration(
        string calldata label,
        uint64 duration
    ) external returns (uint256 id) {
        if (bytes(label).length == 0)             revert EmptyLabel();
        if (duration < MIN_DURATION || duration > MAX_DURATION) revert InvalidDuration();

        uint256 fee = _yearCost(duration);
        if (gst.balanceOf(msg.sender) < fee)      revert InsufficientFee();
        require(gst.transferFrom(msg.sender, address(this), fee), "gst failed");

        id = nextId++;
        requests[id] = Request({
            registrant:  msg.sender,
            label:       label,
            duration:    duration,
            fee:         fee,
            requestedAt: uint64(block.timestamp),
            relayed:     false
        });

        emit RegistrationRequested(id, label, msg.sender, duration, fee);
    }

    /// @notice Relay a pending request to L2 aggregator
    function relayToL2(uint256 id) external {
        Request storage req = requests[id];
        if (req.relayed) revert AlreadyRelayed();
        req.relayed = true;

        // Approve aggregator to pull GST (bridged representation)
        gst.approve(l2Aggregator, req.fee);

        bytes memory callData = abi.encodeCall(
            IL2GNSAggregator.queueRegistration,
            (req.label, req.registrant, req.duration, req.fee)
        );

        l2Messenger.sendMessage(l2Aggregator, callData, MIN_GAS_LIMIT);
        emit RegistrationRelayed(id);
    }

    // ── Subname requests (gas-cheap L3 subname) ───────────────────────────────
    /// @notice Request a subname under an existing .ghost name (e.g. wallet.alice.ghost)
    event SubnameRegistered(string indexed parent, string indexed sub, address registrant);

    mapping(bytes32 => mapping(bytes32 => address)) public subnames;

    function requestSubname(string calldata parent, string calldata sublabel) external {
        uint256 fee = pricePerYear / 10; // subnames cost 10% of main name
        if (gst.balanceOf(msg.sender) < fee) revert InsufficientFee();
        require(gst.transferFrom(msg.sender, address(this), fee), "gst failed");

        bytes32 pk = keccak256(bytes(parent));
        bytes32 sk = keccak256(bytes(sublabel));
        subnames[pk][sk] = msg.sender;

        emit SubnameRegistered(parent, sublabel, msg.sender);
    }

    // ── Admin ─────────────────────────────────────────────────────────────────
    function setPricePerYear(uint256 price) external onlyOwner {
        pricePerYear = price;
        emit PriceUpdated(price);
    }
    function setGST(address _gst) external onlyOwner { gst = IERC20Portal(_gst); }
    function transferOwner(address newOwner) external onlyOwner { owner = newOwner; }

    // ── Internal ──────────────────────────────────────────────────────────────
    function _yearCost(uint64 duration) internal view returns (uint256) {
        return pricePerYear * duration / 365 days;
    }
}
