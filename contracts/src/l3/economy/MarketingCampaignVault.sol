// GhostChain Contracts v5.6.1 (contracts/src/l3/economy/MarketingCampaignVault.sol)
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {GhostBrand}           from "../../GhostBrand.sol";
import {GhostOwnable}         from "../../ghost/GhostOwnable.sol";
import {GhostReentrancyGuard} from "../../ghost/GhostReentrancyGuard.sol";
import {IGRC20}               from "../../ghost/IGRC20.sol";

/**
 * @title  MarketingCampaignVault
 * @notice Holds GST budgets for GhostBrain marketing campaigns on GhostL3.
 *
 * Flow:
 *  1. Owner calls `createCampaignVault(id, budget)` – pulls GST from the
 *     admin wallet via `transferFrom`.
 *  2. Owner calls `spendBudget(id, recipient, amount)` per channel distribution
 *     cost (social API fees, creator incentives, etc.).
 *  3. When a campaign ends, Owner calls `refundCampaign(id, treasury)` –
 *     returns any unspent GST to the platform treasury.
 *
 * All ids are keccak256 of the off-chain UUID campaign_id string, cast to
 * bytes32 for efficient storage.
 */
contract MarketingCampaignVault is GhostBrand, GhostOwnable, GhostReentrancyGuard {
    // ── Errors ────────────────────────────────────────────────────────────────

    error Marketing__WrongChain(uint256 got, uint256 want);
    error Marketing__VaultExists(bytes32 id);
    error Marketing__VaultNotFound(bytes32 id);
    error Marketing__OverBudget(bytes32 id, uint256 requested, uint256 remaining);
    error Marketing__ZeroAddress();
    error Marketing__ZeroAmount();

    // ── State ─────────────────────────────────────────────────────────────────

    IGRC20 public immutable GST_TOKEN;

    /// @dev Allocated budget per campaign vault.
    mapping(bytes32 => uint256) public budgets;

    /// @dev Amount already spent per campaign vault.
    mapping(bytes32 => uint256) public spent;

    /// @dev Whether a vault has been created for a given id.
    mapping(bytes32 => bool) private _exists;

    // ── Events ────────────────────────────────────────────────────────────────

    event VaultCreated(bytes32 indexed id, uint256 budgetGst);
    event BudgetSpent(bytes32 indexed id, address indexed recipient, uint256 amount);
    event CampaignRefunded(bytes32 indexed id, address indexed treasury, uint256 amount);

    // ── Constructor ───────────────────────────────────────────────────────────

    /**
     * @param gstToken  Address of the GST GRC20 token on GhostL3.
     */
    constructor(address gstToken) GhostOwnable(msg.sender) {
        if (block.chainid != L3_CHAIN_ID) {
            revert Marketing__WrongChain(block.chainid, L3_CHAIN_ID);
        }
        if (gstToken == address(0)) revert Marketing__ZeroAddress();
        GST_TOKEN = IGRC20(gstToken);
    }

    // ── Vault lifecycle ───────────────────────────────────────────────────────

    /**
     * @notice Create a vault for campaign `id` with the given GST budget.
     * @dev    Pulls `budgetGst` GST from msg.sender via `transferFrom`.
     *         The caller (marketing admin) must have approved this contract.
     * @param id        keccak256(campaignUUID)
     * @param budgetGst Amount of GST (in wei, 1 GST = 1e18) to allocate.
     */
    function createCampaignVault(bytes32 id, uint256 budgetGst)
        external
        onlyOwner
    {
        if (budgetGst == 0)  revert Marketing__ZeroAmount();
        if (_exists[id])     revert Marketing__VaultExists(id);

        _exists[id]  = true;
        budgets[id]  = budgetGst;

        require(
            GST_TOKEN.transferFrom(msg.sender, address(this), budgetGst),
            "MarketingVault: transferFrom failed"
        );

        emit VaultCreated(id, budgetGst);
    }

    /**
     * @notice Pay `amount` GST from campaign `id`'s budget to `recipient`.
     * @param id        keccak256(campaignUUID)
     * @param recipient Destination (e.g. a creator's wallet or fee collector).
     * @param amount    Amount of GST (in wei) to pay.
     */
    function spendBudget(bytes32 id, address recipient, uint256 amount)
        external
        onlyOwner
        nonReentrant
    {
        if (!_exists[id])        revert Marketing__VaultNotFound(id);
        if (recipient == address(0)) revert Marketing__ZeroAddress();
        if (amount == 0)             revert Marketing__ZeroAmount();

        uint256 remaining = budgets[id] - spent[id];
        if (amount > remaining) revert Marketing__OverBudget(id, amount, remaining);

        spent[id] += amount;

        require(
            GST_TOKEN.transfer(recipient, amount),
            "MarketingVault: transfer failed"
        );

        emit BudgetSpent(id, recipient, amount);
    }

    /**
     * @notice Refund unspent GST from campaign `id` back to `treasury`.
     * @dev    Sets the budget to 0 so the vault is permanently drained.
     * @param id       keccak256(campaignUUID)
     * @param treasury Destination address (platform treasury).
     */
    function refundCampaign(bytes32 id, address treasury)
        external
        onlyOwner
        nonReentrant
    {
        if (!_exists[id])          revert Marketing__VaultNotFound(id);
        if (treasury == address(0)) revert Marketing__ZeroAddress();

        uint256 remaining = budgets[id] - spent[id];
        if (remaining == 0) { emit CampaignRefunded(id, treasury, 0); return; }

        // Drain: mark all as spent before external call (CEI pattern)
        spent[id] = budgets[id];

        require(
            GST_TOKEN.transfer(treasury, remaining),
            "MarketingVault: refund transfer failed"
        );

        emit CampaignRefunded(id, treasury, remaining);
    }

    // ── Views ─────────────────────────────────────────────────────────────────

    /// @notice Returns unspent GST remaining in campaign `id`'s vault.
    function remainingBudget(bytes32 id) external view returns (uint256) {
        if (!_exists[id]) return 0;
        return budgets[id] - spent[id];
    }

    /// @notice Returns whether a vault exists for `id`.
    function vaultExists(bytes32 id) external view returns (bool) {
        return _exists[id];
    }
}
