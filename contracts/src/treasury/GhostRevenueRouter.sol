// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.24;

import "../common/Governed.sol";
import "./TreasuryVault.sol";
import "./TreasuryInvariants.sol";

/// @title GhostRevenueRouter
/// @notice Routes inbound protocol revenue (L2→L1 messages, bridge fees,
///         sequencer fees, DEX fees, validator yields) into governance-defined
///         allocation buckets.
///
///         Buckets (immutable enum, configurable weights):
///           OPS          – L2/L3 infra expenses
///           VALIDATORS   – validator rewards / staking incentives
///           BUYBACK_BURN – market-cap support (GST buyback + burn)
///           PAYROLL      – employee + contributor payroll
///           GRANTS       – ecosystem grants + liquidity programs
///           RESERVES     – emergency stable reserve top-up
///
///         Routing law preserved:
///           Revenue flows into this contract exclusively via L1 messages
///           originating from the canonical L2→L1 bridge.
///           This contract NEVER sends funds to L2 or L3 directly.
contract GhostRevenueRouter is Governed {
    using TreasuryInvariants for uint256;

    // ─── Types ────────────────────────────────────────────────────────────────

    uint8 public constant BUCKET_COUNT = 6;

    enum Bucket {
        OPS,
        VALIDATORS,
        BUYBACK_BURN,
        PAYROLL,
        GRANTS,
        RESERVES
    }

    struct BucketConfig {
        /// @dev allocation weight in bps (total across all buckets must == 10_000)
        uint16  bps;
        /// @dev recipient address for this bucket
        address recipient;
        /// @dev human-readable label
        bytes32 label;
    }

    // ─── State ────────────────────────────────────────────────────────────────

    TreasuryVault public vault;

    BucketConfig[BUCKET_COUNT] private _buckets;

    /// @dev cumulative revenue received per token
    mapping(address => uint256) public totalReceived;
    /// @dev cumulative revenue routed per bucket per token
    mapping(Bucket => mapping(address => uint256)) public bucketAllocated;

    /// @dev whitelisted L2 bridge / revenue reporter contracts (source of inbound revenue)
    mapping(address => bool) public approvedSources;

    // ─── Events ───────────────────────────────────────────────────────────────

    event RevenueReceived(address indexed token, uint256 amount, address indexed source);
    event RevenueRouted(Bucket indexed bucket, address indexed token, address indexed recipient, uint256 amount);
    event BucketConfigured(Bucket indexed bucket, uint16 bps, address recipient, bytes32 label);
    event SourceApproved(address indexed source, bool enabled);

    // ─── Errors ───────────────────────────────────────────────────────────────

    error NotApprovedSource();
    error InvalidBucketWeights(uint256 total);
    error ZeroRecipient(Bucket bucket);
    error InvalidToken();

    // ─── Constructor ──────────────────────────────────────────────────────────

    constructor(
        address       governor_,
        address       timelock_,
        TreasuryVault vault_
    ) Governed(governor_, timelock_) {
        if (governor_ != address(0)) {
            owner = governor_;
            emit OwnershipTransferred(msg.sender, governor_);
        }
        TreasuryInvariants.requireContract(address(vault_));
        vault = vault_;
    }

    // ─── Source management ────────────────────────────────────────────────────

    function setApprovedSource(address source, bool enabled) external onlyGovernance {
        approvedSources[source] = enabled;
        emit SourceApproved(source, enabled);
    }

    // ─── Bucket configuration ─────────────────────────────────────────────────

    /// @notice Configure all six buckets in one transaction.
    ///         bps values must sum to exactly 10_000.
    function configureBuckets(BucketConfig[BUCKET_COUNT] calldata configs) external onlyGovernance {
        uint256 total = 0;
        for (uint8 i = 0; i < BUCKET_COUNT; i++) {
            if (configs[i].recipient == address(0)) revert ZeroRecipient(Bucket(i));
            total += configs[i].bps;
        }
        if (total != 10_000) revert InvalidBucketWeights(total);

        for (uint8 i = 0; i < BUCKET_COUNT; i++) {
            _buckets[i] = configs[i];
            emit BucketConfigured(Bucket(i), configs[i].bps, configs[i].recipient, configs[i].label);
        }
    }

    /// @notice Update a single bucket's configuration.
    ///         Caller must ensure the total bps sum remains 10_000.
    function updateBucket(
        Bucket   bucket,
        uint16   bps,
        address  recipient,
        bytes32  label
    ) external onlyGovernance {
        require(recipient != address(0), "recipient=0");
        _buckets[uint8(bucket)] = BucketConfig({ bps: bps, recipient: recipient, label: label });
        emit BucketConfigured(bucket, bps, recipient, label);
    }

    // ─── Revenue ingestion ────────────────────────────────────────────────────

    /// @notice Accept ERC-20 revenue from an approved L2 bridge or revenue aggregator.
    ///         Immediately distributes to bucket recipients according to weights.
    function routeERC20(address token, uint256 amount) external {
        if (!approvedSources[msg.sender] && msg.sender != owner) revert NotApprovedSource();
        if (token == address(0)) revert InvalidToken();
        require(amount > 0, "amount=0");

        totalReceived[token] += amount;
        emit RevenueReceived(token, amount, msg.sender);

        _distribute(token, amount, false);
    }

    /// @notice Accept native ETH/GST revenue.
    function routeNative() external payable {
        if (!approvedSources[msg.sender] && msg.sender != owner) revert NotApprovedSource();
        require(msg.value > 0, "value=0");

        totalReceived[address(0)] += msg.value;
        emit RevenueReceived(address(0), msg.value, msg.sender);

        _distribute(address(0), msg.value, true);
    }

    // ─── View helpers ─────────────────────────────────────────────────────────

    function getBucket(Bucket bucket) external view returns (BucketConfig memory) {
        return _buckets[uint8(bucket)];
    }

    function getAllBuckets() external view returns (BucketConfig[BUCKET_COUNT] memory) {
        return _buckets;
    }

    // ─── Internal ─────────────────────────────────────────────────────────────

    interface IERC20Min {
        function transferFrom(address from, address to, uint256 amount) external returns (bool);
        function transfer(address to, uint256 amount) external returns (bool);
    }

    function _distribute(address token, uint256 totalAmount, bool isNative) internal {
        uint256 remaining = totalAmount;
        for (uint8 i = 0; i < BUCKET_COUNT; i++) {
            BucketConfig storage bc = _buckets[i];
            if (bc.recipient == address(0)) continue;

            uint256 share;
            if (i == BUCKET_COUNT - 1) {
                // Last bucket gets the dust to avoid rounding loss
                share = remaining;
            } else {
                share = (totalAmount * bc.bps) / 10_000;
            }
            if (share == 0) continue;
            remaining -= share;

            bucketAllocated[Bucket(i)][token] += share;

            if (isNative) {
                (bool ok,) = payable(bc.recipient).call{value: share}("");
                require(ok, "native transfer failed");
            } else {
                require(IERC20Min(token).transfer(bc.recipient, share), "erc20 transfer failed");
            }

            emit RevenueRouted(Bucket(i), token, bc.recipient, share);
        }
    }

    receive() external payable {}
}
