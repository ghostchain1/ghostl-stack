// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.24;

/// @title  SovereignBond
/// @notice On-chain sovereign bond issuance with real-time settlement.
///         Supports: US10Y, US30Y, EU10Y, JGB10Y, UK10Y, etc.
contract SovereignBond {

    struct Bond {
        string  identifier;   // e.g. "US10Y"
        address issuer;
        uint256 faceValue;    // denomination in wei units
        uint256 couponBps;    // annual coupon in basis points (350 = 3.50%)
        uint256 maturity;     // unix timestamp of maturity
        uint256 issued;       // total bonds issued
        uint256 outstanding;  // bonds not yet redeemed
        bool    active;
    }

    mapping(bytes32 => Bond)                        public bonds;
    mapping(address => mapping(bytes32 => uint256)) public holdings;
    mapping(address => bool)                        public authorizedIssuers;
    bytes32[] public bondIds;
    address   public admin;

    event BondIssued(bytes32 indexed id, string identifier, uint256 faceValue, uint256 couponBps, uint256 maturity);
    event BondPurchased(bytes32 indexed id, address indexed buyer, uint256 amount);
    event CouponPaid(bytes32 indexed id, address indexed holder, uint256 couponAmount);
    event BondRedeemed(bytes32 indexed id, address indexed holder, uint256 amount);

    modifier onlyAdmin()  { require(msg.sender == admin, "Bond: not admin"); _; }
    modifier onlyIssuer() { require(authorizedIssuers[msg.sender], "Bond: not authorized issuer"); _; }

    constructor() { admin = msg.sender; authorizedIssuers[msg.sender] = true; }

    function authorizeIssuer(address issuer, bool auth) external onlyAdmin {
        authorizedIssuers[issuer] = auth;
    }

    function issueBond(
        string memory identifier,
        uint256 faceValue,
        uint256 couponBps,
        uint256 maturityDuration,
        uint256 supply
    ) external onlyIssuer returns (bytes32 id) {
        id = keccak256(abi.encode(identifier, block.timestamp));
        bonds[id] = Bond({
            identifier:  identifier,
            issuer:      msg.sender,
            faceValue:   faceValue,
            couponBps:   couponBps,
            maturity:    block.timestamp + maturityDuration,
            issued:      supply,
            outstanding: supply,
            active:      true
        });
        bondIds.push(id);
        emit BondIssued(id, identifier, faceValue, couponBps, block.timestamp + maturityDuration);
    }

    function purchaseBond(bytes32 id, uint256 amount) external {
        Bond storage b = bonds[id];
        require(b.active, "Bond: inactive");
        require(b.outstanding >= amount, "Bond: insufficient supply");
        b.outstanding          -= amount;
        holdings[msg.sender][id] += amount;
        emit BondPurchased(id, msg.sender, amount);
    }

    function payCoupon(bytes32 id, address holder) external onlyIssuer {
        Bond storage b = bonds[id];
        uint256 holding = holdings[holder][id];
        require(holding > 0, "Bond: no holding");
        // Annual coupon = faceValue * holding * couponBps / 10000
        uint256 coupon = (b.faceValue * holding * b.couponBps) / 10_000;
        emit CouponPaid(id, holder, coupon);
    }

    function redeemBond(bytes32 id, uint256 amount) external {
        Bond storage b = bonds[id];
        require(block.timestamp >= b.maturity, "Bond: not matured");
        require(holdings[msg.sender][id] >= amount, "Bond: insufficient holding");
        holdings[msg.sender][id] -= amount;
        emit BondRedeemed(id, msg.sender, amount);
    }

    function bondCount() external view returns (uint256) { return bondIds.length; }
}
