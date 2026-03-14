// GhostChain Contracts v5.6.1 (tokens/GhostRWA.sol)
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { GhostBrand } from "../GhostBrand.sol";
import { ReentrancyGuard } from "../common/ReentrancyGuard.sol";

/// @title GhostRWA
/// @notice Real World Asset (RWA) token standard for GhostChain.
///
///         GhostRWA tokenizes off-chain assets (real estate, bonds, commodities, invoices)
///         as on-chain GRC-20 compatible tokens with built-in compliance hooks.
///
///         Compliance architecture:
///           • KYC gate: transfers require both parties to hold a valid GhostIdentitySBT.
///           • Transfer restrictions: whitelist, holding period, max position size.
///           • Dividend distribution: NAV-adjusted yield payments in GST.
///           • Redemption: token holders can redeem for off-chain asset value via custodian.
///           • Regulatory pause: compliance officer can halt all transfers.
///
///         The RWA issuer (e.g. asset manager) deploys one instance per real-world asset.

interface IIdentitySBT {
    function isValid(uint256 tokenId) external view returns (bool);
    function tokenForCategory(address holder, bytes32 category) external view returns (uint256);
}

contract GhostRWA is GhostBrand, ReentrancyGuard {

    // ─── Constants ───────────────────────────────────────────────────────────
    bytes32 public constant CATEGORY_KYC = keccak256("GHOSTCHAIN_KYC");

    // ─── Storage ─────────────────────────────────────────────────────────────
    string  public name;
    string  public symbol;
    uint8   public constant decimals = 18;
    uint256 public totalSupply;

    address public immutable ISSUER;      // Asset manager / issuer
    address public immutable COMPLIANCE;  // Compliance officer (can pause/whitelist)
    IIdentitySBT public immutable IDENTITY_SBT;

    /// Net Asset Value per token (18-decimal GST equivalent, updated by oracle)
    uint256 public navPerToken;

    /// Minimum holding period in seconds before transfer allowed
    uint256 public holdingPeriod;

    /// Maximum token position per address (0 = unlimited)
    uint256 public maxPositionSize;

    bool public transfersPaused;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    mapping(address => bool) public whitelist;
    mapping(address => uint256) public firstAcquiredAt;

    // Dividend tracking
    uint256 public cumulativeDividendPerToken;
    mapping(address => uint256) public dividendDebt;
    mapping(address => uint256) public pendingDividends;

    // ─── Events ──────────────────────────────────────────────────────────────
    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    event WhitelistUpdated(address indexed account, bool status);
    event NAVUpdated(uint256 newNav);
    event DividendDistributed(uint256 totalAmount, uint256 perToken);
    event DividendClaimed(address indexed holder, uint256 amount);
    event TransfersPaused(bool paused);
    event Redeemed(address indexed holder, uint256 tokens, uint256 gstValue);

    // ─── Errors ──────────────────────────────────────────────────────────────
    error NotIssuer();
    error NotCompliance();
    error TransfersPaused_();
    error NotWhitelisted();
    error KYCRequired();
    error HoldingPeriodNotMet();
    error MaxPositionExceeded();
    error InsufficientBalance();

    // ─── Modifiers ───────────────────────────────────────────────────────────
    modifier onlyIssuer() {
        _onlyIssuer();
        _;
    }
    modifier onlyCompliance() {
        _onlyCompliance();
        _;
    }

    function _onlyIssuer() internal view {
        if (msg.sender != ISSUER) revert NotIssuer();
    }
    function _onlyCompliance() internal view {
        if (msg.sender != COMPLIANCE && msg.sender != ISSUER) revert NotCompliance();
    }

    // ─── Constructor ─────────────────────────────────────────────────────────
    constructor(
        string memory name_,
        string memory symbol_,
        address issuer_,
        address compliance_,
        address identitySbt_,
        uint256 holdingPeriod_,
        uint256 maxPositionSize_,
        uint256 initialNav_
    ) {
        require(issuer_      != address(0), "issuer=0");
        require(compliance_  != address(0), "compliance=0");
        require(identitySbt_ != address(0), "sbt=0");
        name            = name_;
        symbol          = symbol_;
        ISSUER          = issuer_;
        COMPLIANCE      = compliance_;
        IDENTITY_SBT    = IIdentitySBT(identitySbt_);
        holdingPeriod   = holdingPeriod_;
        maxPositionSize = maxPositionSize_;
        navPerToken     = initialNav_;
    }

    // ─── Issuer: mint / burn ──────────────────────────────────────────────────
    function mint(address to, uint256 amount) external onlyIssuer {
        _checkCompliance(to);
        _settleDividend(to);
        balanceOf[to] += amount;
        totalSupply   += amount;
        if (firstAcquiredAt[to] == 0) firstAcquiredAt[to] = block.timestamp;
        emit Transfer(address(0), to, amount);
    }

    function burn(address from, uint256 amount) external onlyIssuer {
        if (balanceOf[from] < amount) revert InsufficientBalance();
        _settleDividend(from);
        balanceOf[from] -= amount;
        totalSupply     -= amount;
        emit Transfer(from, address(0), amount);
    }

    // ─── GRC-20 transfer ─────────────────────────────────────────────────────
    function transfer(address to, uint256 amount) external returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        require(allowed >= amount, "GhostRWA: insufficient allowance");
        allowance[from][msg.sender] = allowed - amount;
        _transfer(from, to, amount);
        return true;
    }

    // ─── Compliance: NAV + whitelist + pause ──────────────────────────────────
    function updateNAV(uint256 newNav) external onlyIssuer {
        navPerToken = newNav;
        emit NAVUpdated(newNav);
    }

    function setWhitelist(address account, bool status) external onlyCompliance {
        whitelist[account] = status;
        emit WhitelistUpdated(account, status);
    }

    function setTransfersPaused(bool paused) external onlyCompliance {
        transfersPaused = paused;
        emit TransfersPaused(paused);
    }

    // ─── Dividends ───────────────────────────────────────────────────────────
    /// @notice Distribute GST dividends to all RWA token holders proportionally.
    function distributeDividend() external payable onlyIssuer {
        require(totalSupply > 0, "GhostRWA: no supply");
        require(msg.value > 0,   "GhostRWA: zero dividend");
        uint256 increment = (msg.value * GST_UNIT) / totalSupply;
        cumulativeDividendPerToken += increment;
        emit DividendDistributed(msg.value, increment);
    }

    /// @notice Claim accumulated dividends.
    function claimDividend() external nonReentrant {
        _settleDividend(msg.sender);
        uint256 pending = pendingDividends[msg.sender];
        require(pending > 0, "GhostRWA: nothing to claim");
        pendingDividends[msg.sender] = 0;
        (bool ok,) = msg.sender.call{value: pending}("");
        require(ok, "GhostRWA: GST transfer failed");
        emit DividendClaimed(msg.sender, pending);
    }

    /// @notice View accrued dividends for a holder.
    function dividendsOf(address holder) external view returns (uint256) {
        uint256 owed = (balanceOf[holder] * (cumulativeDividendPerToken - dividendDebt[holder])) / GST_UNIT;
        return pendingDividends[holder] + owed;
    }

    // ─── Redemption ───────────────────────────────────────────────────────────
    /// @notice Holder redeems tokens for GST at current NAV (issuer must pre-fund).
    function redeem(uint256 amount) external nonReentrant {
        if (balanceOf[msg.sender] < amount) revert InsufficientBalance();
        uint256 gstValue = (amount * navPerToken) / GST_UNIT;
        _settleDividend(msg.sender);
        balanceOf[msg.sender] -= amount;
        totalSupply           -= amount;
        emit Transfer(msg.sender, address(0), amount);
        (bool ok,) = msg.sender.call{value: gstValue}("");
        require(ok, "GhostRWA: GST transfer failed");
        emit Redeemed(msg.sender, amount, gstValue);
    }

    // ─── Internal ─────────────────────────────────────────────────────────────
    function _transfer(address from, address to, uint256 amount) internal {
        if (transfersPaused) revert TransfersPaused_();
        _checkCompliance(from);
        _checkCompliance(to);
        if (firstAcquiredAt[from] != 0 && holdingPeriod > 0) {
            require(
                block.timestamp >= firstAcquiredAt[from] + holdingPeriod,
                "GhostRWA: holding period"
            );
        }
        if (balanceOf[from] < amount) revert InsufficientBalance();
        if (maxPositionSize > 0) {
            require(balanceOf[to] + amount <= maxPositionSize, "GhostRWA: max position");
        }
        _settleDividend(from);
        _settleDividend(to);
        balanceOf[from] -= amount;
        balanceOf[to]   += amount;
        if (firstAcquiredAt[to] == 0) firstAcquiredAt[to] = block.timestamp;
        emit Transfer(from, to, amount);
    }

    function _checkCompliance(address account) internal view {
        if (!whitelist[account]) revert NotWhitelisted();
        uint256 sbtId = IDENTITY_SBT.tokenForCategory(account, CATEGORY_KYC);
        if (sbtId == 0 || !IDENTITY_SBT.isValid(sbtId)) revert KYCRequired();
    }

    function _settleDividend(address holder) internal {
        uint256 owed = (balanceOf[holder] * (cumulativeDividendPerToken - dividendDebt[holder])) / GST_UNIT;
        if (owed > 0) pendingDividends[holder] += owed;
        dividendDebt[holder] = cumulativeDividendPerToken;
    }

    receive() external payable {}
}
