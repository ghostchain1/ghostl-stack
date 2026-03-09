/**
 * staking-generator.ts — GST/GRC-20 staking contract generator.
 *
 * Produces a Forge-lint-compliant Solidity 0.8.24 staking contract with:
 *   - `stake(uint256)` — deposits tokens, auto-claims pending rewards
 *   - `unstake(uint256)` — withdraws tokens, auto-claims rewards
 *   - `claimRewards()` — manual reward claim
 *   - `fundRewardPool(uint256)` — anyone can add reward tokens to the pool
 *   - `setRewardRate(uint256)` — owner sets tokens-per-token-per-second (1e18 scale)
 *
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

export interface StakingOptions {
  /** Solidity contract name, e.g. "GhostStaking" */
  name: string;
  /** Variable-name-safe label for error/event messages, e.g. "GhostStaking" */
  label?: string;
  /**
   * Reward rate: tokens earned per staked token per second, scaled by 1e18.
   * Default "1000000000000000" (0.001 tokens/token/sec = ~86.4 tokens/day at 1M staked)
   */
  defaultRewardRate?: string;
  /** Relative path from the generated file to contracts/src/ghost/ (default "../ghost") */
  ghostImportBase?: string;
}

/**
 * Generates a staking contract source string.
 *
 * @param opts       Generator options
 * @param outputPath Workspace-relative destination, used in the header comment.
 */
export function generateStaking(
  opts: StakingOptions,
  outputPath: string,
): string {
  const label           = opts.label ?? opts.name;
  const defaultRate     = opts.defaultRewardRate ?? "1000000000000000"; // 0.001 * 1e18

  // ── state ──
  const stateBlock = `\
    address public immutable STAKING_TOKEN;
    address public immutable REWARD_TOKEN;

    address public owner;
    uint256 public rewardRate; // reward tokens per staked token per second, scaled 1e18

    mapping(address => uint256) public stakedBalance;
    mapping(address => uint256) public lastClaimAt;
    uint256 public totalStaked;
    uint256 public rewardPool;`;

  // ── events ──
  const eventsBlock = `\
    event Staked(address indexed staker, uint256 amount);
    event Unstaked(address indexed staker, uint256 amount);
    event RewardsClaimed(address indexed staker, uint256 amount);
    event RewardPoolFunded(address indexed funder, uint256 amount);
    event RewardRateUpdated(uint256 from, uint256 to);
    event OwnershipTransferred(address indexed from, address indexed to);`;

  // ── errors ──
  const errorsBlock = `\
    error NotOwner();
    error InsufficientStake();
    error ZeroAmount();`;

  // ── modifier ──
  const modBlock = `\
    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }`;

  // ── constructor ──
  const ctorBlock = `\
    constructor(
        address stakingToken,
        address rewardToken,
        address initialOwner,
        uint256 initialRewardRate
    ) {
        require(stakingToken != address(0), "${label}: zero staking token");
        require(rewardToken  != address(0), "${label}: zero reward token");
        require(initialOwner != address(0), "${label}: zero owner");
        STAKING_TOKEN = stakingToken;
        REWARD_TOKEN  = rewardToken;
        owner         = initialOwner;
        rewardRate    = initialRewardRate == 0 ? ${defaultRate} : initialRewardRate;
    }`;

  // ── pendingRewards ──
  const pendingFn = `\
    /// @notice Returns accumulated reward tokens for \`staker\` since last claim.
    function pendingRewards(address staker) public view returns (uint256) {
        uint256 elapsed = block.timestamp - lastClaimAt[staker];
        return (stakedBalance[staker] * rewardRate * elapsed) / 1e18;
    }`;

  // ── stake ──
  const stakeFn = `\
    /// @notice Stakes \`amount\` tokens. Auto-claims any pending rewards first.
    function stake(uint256 amount) external {
        if (amount == 0) revert ZeroAmount();
        _claimRewards(msg.sender);
        bool ok = IGRC20(STAKING_TOKEN).transferFrom(msg.sender, address(this), amount);
        require(ok, "${label}: transferFrom failed");
        stakedBalance[msg.sender] += amount;
        totalStaked               += amount;
        emit Staked(msg.sender, amount);
    }`;

  // ── unstake ──
  const unstakeFn = `\
    /// @notice Withdraws \`amount\` staked tokens. Auto-claims pending rewards.
    function unstake(uint256 amount) external {
        if (amount == 0) revert ZeroAmount();
        if (stakedBalance[msg.sender] < amount) revert InsufficientStake();
        _claimRewards(msg.sender);
        stakedBalance[msg.sender] -= amount;
        totalStaked               -= amount;
        bool ok = IGRC20(STAKING_TOKEN).transfer(msg.sender, amount);
        require(ok, "${label}: transfer failed");
        emit Unstaked(msg.sender, amount);
    }`;

  // ── claimRewards ──
  const claimFn = `\
    /// @notice Manually claims all pending reward tokens for the caller.
    function claimRewards() external {
        _claimRewards(msg.sender);
    }`;

  // ── fundRewardPool ──
  const fundFn = `\
    /// @notice Transfers \`amount\` reward tokens from caller into the reward pool.
    function fundRewardPool(uint256 amount) external {
        if (amount == 0) revert ZeroAmount();
        bool ok = IGRC20(REWARD_TOKEN).transferFrom(msg.sender, address(this), amount);
        require(ok, "${label}: fund failed");
        rewardPool += amount;
        emit RewardPoolFunded(msg.sender, amount);
    }`;

  // ── setRewardRate ──
  const setRateFn = `\
    /// @notice Updates the reward rate. Only callable by the owner.
    function setRewardRate(uint256 rate) external onlyOwner {
        emit RewardRateUpdated(rewardRate, rate);
        rewardRate = rate;
    }`;

  // ── transferOwnership ──
  const ownerFn = `\
    function transferOwnership(address to) external onlyOwner {
        require(to != address(0), "${label}: zero address");
        emit OwnershipTransferred(owner, to);
        owner = to;
    }`;

  // ── _claimRewards (internal) ──
  const internalClaimFn = `\
    function _claimRewards(address staker) internal {
        uint256 rewards = pendingRewards(staker);
        lastClaimAt[staker] = block.timestamp;
        if (rewards == 0 || rewards > rewardPool) return;
        rewardPool -= rewards;
        bool ok = IGRC20(REWARD_TOKEN).transfer(staker, rewards);
        require(ok, "${label}: reward transfer failed");
        emit RewardsClaimed(staker, rewards);
    }`;

  const contractBody = [
    `    ${stateBlock}`,
    `    // ── Events ────────────────────────────────────────────────────────────────\n\n    ${eventsBlock}`,
    `    // ── Errors ────────────────────────────────────────────────────────────────\n\n    ${errorsBlock}`,
    `    // ── Modifier ─────────────────────────────────────────────────────────────\n\n    ${modBlock}`,
    `    // ── Constructor ──────────────────────────────────────────────────────────\n\n    ${ctorBlock}`,
    `    // ── External / Public ─────────────────────────────────────────────────────\n\n    ${[pendingFn, stakeFn, unstakeFn, claimFn, fundFn, setRateFn, ownerFn].join("\n\n    ")}`,
    `    // ── Internal ─────────────────────────────────────────────────────────────\n\n    ${internalClaimFn}`,
  ].join("\n\n");

  const doc = natspec({
    title: `${opts.name} — GhostChain GRC-20 Staking`,
    notice: "Stake any GRC-20 token and earn GRC-20 reward tokens over time.",
    dev: "All token calls are require-wrapped for Forge lint compliance. Reward rate is scaled by 1e18.",
  });

  const contractDecl = `${doc}\ncontract ${opts.name} {\n${contractBody}\n}`;

  return solidityFile([
    GHOST_SPDX_MIT,
    GHOST_PRAGMA,
    ghostContractHeader(outputPath),
    inlineGRC20Interface(),
    contractDecl,
  ]);
}
