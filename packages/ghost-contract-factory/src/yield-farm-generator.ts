/**
 * yield-farm-generator.ts — LP token yield farming contract generator.
 *
 * Produces a Forge-lint-compliant Solidity 0.8.24 yield farm with:
 *   - `stake(uint256 amount)` — deposits LP tokens
 *   - `unstake(uint256 amount)` — withdraws LP tokens + auto-claims rewards
 *   - `claimRewards()` — manual claim of accrued reward tokens
 *   - `fundRewards(uint256 amount)` — anyone can add reward tokens to the pool
 *   - `setRewardRate(uint256)` — owner only
 *   - `pendingReward(address)` — view: accrued reward for any staker
 *   - `emergencyWithdraw()` — forfeits rewards and exits (safety hatch)
 *
 * Uses the reward-per-token accumulator pattern (Synthetix-style):
 *   rewardPerTokenStored += rewardRate * Δt / totalStaked
 *   userEarned = stakedBalance * (rewardPerToken - userPaid) + pendingCache
 *
 * Stakes: LP tokens (separate GRC-20 contract, address set at deploy time).
 * Rewards: a different GRC-20 token (e.g. GST).
 * All transfer calls are require-wrapped (Forge lint: erc20-unchecked-transfer).
 */

import {
  GHOST_SPDX_MIT,
  GHOST_PRAGMA,
  ghostContractHeader,
  inlineGRC20Interface,
  natspec,
  solidityFile,
} from "./ast-builder.js";

export interface YieldFarmOptions {
  /** Solidity contract name, e.g. "GhostYieldFarm" */
  name: string;
  /** Human-readable label used in error messages */
  label?: string;
  /**
   * Default reward rate: reward tokens per second, scaled by 1e18.
   * Default "500000000000000" (0.0005 * 1e18)
   */
  defaultRewardRate?: string;
}

/**
 * Generates a yield farming contract source string.
 */
export function generateYieldFarm(
  opts: YieldFarmOptions,
  outputPath: string,
): string {
  const label       = opts.label ?? opts.name;
  const defaultRate = opts.defaultRewardRate ?? "500000000000000";

  const statVars = `
    // ── GRC-20 interface ────────────────────────────────────────────────────
${inlineGRC20Interface()}

    // ── Constants ────────────────────────────────────────────────────────────
    uint256 private constant PRECISION = 1e18;

    // ── Immutable config ─────────────────────────────────────────────────────
    IGRC20 public immutable LP_TOKEN;     // token to stake
    IGRC20 public immutable REWARD_TOKEN; // token earned

    // ── Owner ────────────────────────────────────────────────────────────────
    address public owner;

    // ── Global accumulator ───────────────────────────────────────────────────
    uint256 public rewardRate          = ${defaultRate};
    uint256 public rewardPerTokenStored;
    uint256 public lastUpdateTime;
    uint256 public totalStaked;
    uint256 public rewardPool; // tokens available to distribute

    // ── Per-user state ────────────────────────────────────────────────────────
    mapping(address => uint256) public stakedBalance;
    mapping(address => uint256) public userRewardPerTokenPaid;
    mapping(address => uint256) public rewards;

    // ── Events ────────────────────────────────────────────────────────────────
    event Staked(address indexed user, uint256 amount);
    event Unstaked(address indexed user, uint256 amount);
    event RewardClaimed(address indexed user, uint256 amount);
    event RewardsFunded(address indexed funder, uint256 amount);
    event RewardRateSet(uint256 newRate);
    event OwnershipTransferred(address indexed prev, address indexed next);
    event EmergencyWithdraw(address indexed user, uint256 amount);

    // ── Custom errors ─────────────────────────────────────────────────────────
    error ZeroAmount();
    error ZeroAddress();
    error InsufficientStake();
    error InsufficientRewardPool();
    error TransferFailed();
    error NotOwner();
`;

  const constructor = `
    constructor(address lpToken_, address rewardToken_) {
        if (lpToken_     == address(0)) revert ZeroAddress();
        if (rewardToken_ == address(0)) revert ZeroAddress();
        LP_TOKEN     = IGRC20(lpToken_);
        REWARD_TOKEN = IGRC20(rewardToken_);
        owner        = msg.sender;
        lastUpdateTime = block.timestamp;
    }
`;

  const accumulatorFns = `
    // ── Reward-per-token accumulator ─────────────────────────────────────────

    function rewardPerToken() public view returns (uint256) {
        if (totalStaked == 0) return rewardPerTokenStored;
        uint256 dt      = block.timestamp - lastUpdateTime;
        uint256 earned  = rewardRate * dt * PRECISION / totalStaked;
        return rewardPerTokenStored + earned;
    }

    ${natspec({ title: "Tokens pending claim for `account`." })}
    function pendingReward(address account) public view returns (uint256) {
        uint256 rpt   = rewardPerToken();
        uint256 delta = rpt - userRewardPerTokenPaid[account];
        return rewards[account] + stakedBalance[account] * delta / PRECISION;
    }

    function _updateReward(address account) internal {
        rewardPerTokenStored         = rewardPerToken();
        lastUpdateTime               = block.timestamp;
        if (account != address(0)) {
            rewards[account]             = pendingReward(account);
            userRewardPerTokenPaid[account] = rewardPerTokenStored;
        }
    }
`;

  const stakeFn = `
    // ── Stake ─────────────────────────────────────────────────────────────────

    ${natspec({ title: "Deposit LP tokens and begin accruing rewards." })}
    function stake(uint256 amount) external {
        if (amount == 0) revert ZeroAmount();
        _updateReward(msg.sender);

        stakedBalance[msg.sender] += amount;
        totalStaked               += amount;

        (bool ok,) = address(LP_TOKEN).call(
            abi.encodeWithSignature(
                "transferFrom(address,address,uint256)",
                msg.sender, address(this), amount
            )
        );
        require(ok, "${label}: stake transferFrom failed");

        emit Staked(msg.sender, amount);
    }
`;

  const unstakeFn = `
    // ── Unstake ───────────────────────────────────────────────────────────────

    ${natspec({ title: "Withdraw LP tokens and auto-claim all pending rewards." })}
    function unstake(uint256 amount) external {
        if (amount == 0) revert ZeroAmount();
        if (stakedBalance[msg.sender] < amount) revert InsufficientStake();

        _updateReward(msg.sender);
        _claim(msg.sender);

        stakedBalance[msg.sender] -= amount;
        totalStaked               -= amount;

        (bool ok,) = address(LP_TOKEN).call(
            abi.encodeWithSignature("transfer(address,uint256)", msg.sender, amount)
        );
        require(ok, "${label}: unstake transfer failed");

        emit Unstaked(msg.sender, amount);
    }
`;

  const claimFns = `
    // ── Claim ─────────────────────────────────────────────────────────────────

    ${natspec({ title: "Claim all pending reward tokens." })}
    function claimRewards() external {
        _updateReward(msg.sender);
        _claim(msg.sender);
    }

    function _claim(address account) internal {
        uint256 amount = rewards[account];
        if (amount == 0) return;
        if (rewardPool < amount) revert InsufficientRewardPool();

        rewards[account] = 0;
        rewardPool      -= amount;

        (bool ok,) = address(REWARD_TOKEN).call(
            abi.encodeWithSignature("transfer(address,uint256)", account, amount)
        );
        require(ok, "${label}: claimRewards transfer failed");

        emit RewardClaimed(account, amount);
    }
`;

  const fundFn = `
    // ── Fund pool ─────────────────────────────────────────────────────────────

    ${natspec({ title: "Deposit additional reward tokens. Anyone can call." })}
    function fundRewards(uint256 amount) external {
        if (amount == 0) revert ZeroAmount();

        rewardPool += amount;

        (bool ok,) = address(REWARD_TOKEN).call(
            abi.encodeWithSignature(
                "transferFrom(address,address,uint256)",
                msg.sender, address(this), amount
            )
        );
        require(ok, "${label}: fundRewards transferFrom failed");

        emit RewardsFunded(msg.sender, amount);
    }
`;

  const emergencyFn = `
    // ── Emergency withdraw ────────────────────────────────────────────────────

    ${natspec({ title: "Forfeit pending rewards and withdraw all staked LP tokens immediately." })}
    function emergencyWithdraw() external {
        uint256 amount = stakedBalance[msg.sender];
        if (amount == 0) revert ZeroAmount();

        // Reset user state — forfeit rewards (do NOT call _updateReward/claim)
        stakedBalance[msg.sender]             = 0;
        rewards[msg.sender]                   = 0;
        userRewardPerTokenPaid[msg.sender]    = rewardPerTokenStored;
        totalStaked                          -= amount;

        (bool ok,) = address(LP_TOKEN).call(
            abi.encodeWithSignature("transfer(address,uint256)", msg.sender, amount)
        );
        require(ok, "${label}: emergencyWithdraw transfer failed");

        emit EmergencyWithdraw(msg.sender, amount);
    }
`;

  const adminFns = `
    // ── Admin ─────────────────────────────────────────────────────────────────

    function setRewardRate(uint256 newRate) external {
        if (msg.sender != owner) revert NotOwner();
        _updateReward(address(0));
        rewardRate = newRate;
        emit RewardRateSet(newRate);
    }

    function transferOwnership(address newOwner) external {
        if (msg.sender != owner) revert NotOwner();
        if (newOwner == address(0)) revert ZeroAddress();
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }
`;

  const body = [
    statVars,
    constructor,
    accumulatorFns,
    stakeFn,
    unstakeFn,
    claimFns,
    fundFn,
    emergencyFn,
    adminFns,
  ];

  return solidityFile([
    GHOST_SPDX_MIT,
    ghostContractHeader(outputPath),
    GHOST_PRAGMA,
    `\ncontract ${opts.name} {\n${body.join("")}}`,
  ]);
}
