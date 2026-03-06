// SPDX-License-Identifier: MIT
// @ghostchain Part of the GhostChain protocol suite — https://ghostchain.io

pragma solidity ^0.8.24;

import "../common/Governed.sol";

/// @notice Global + per-adapter pause controls and simple deploy rate limits.
contract CircuitBreaker is Governed {
    struct RateLimitConfig {
        uint64 windowSeconds;
        uint256 perWindowCap;
        bool enabled;
    }

    struct WindowUsage {
        uint64 window;
        uint256 used;
    }

    bool public paused;
    mapping(uint256 => bool) public adapterPaused;
    mapping(address => bool) public emergencyPausers;

    address public vault;

    mapping(uint256 => mapping(address => RateLimitConfig)) public rateLimits;
    mapping(uint256 => mapping(address => WindowUsage)) public windowUsage;

    event GlobalPaused(bool paused);
    event AdapterPaused(uint256 indexed adapterId, bool paused);
    event EmergencyPauserSet(address indexed account, bool allowed);
    event VaultSet(address indexed vault);
    event RateLimitSet(uint256 indexed adapterId, address indexed asset, uint64 windowSeconds, uint256 perWindowCap, bool enabled);
    event WindowConsumed(uint256 indexed adapterId, address indexed asset, uint64 indexed window, uint256 newUsed);

    error Unauthorized();
    error PausedError();
    error RateLimited();

    constructor(address governor_, address timelock_) Governed(governor_, timelock_) {}

    modifier onlyEmergencyPauserOrGovernance() {
        if (!_isGovernance(msg.sender) && !emergencyPausers[msg.sender]) revert Unauthorized();
        _;
    }

    function setVault(address vault_) external onlyGovernance {
        require(vault_ != address(0), "vault=0");
        vault = vault_;
        emit VaultSet(vault_);
    }

    function setEmergencyPauser(address account, bool allowed) external onlyGovernance {
        require(account != address(0), "account=0");
        emergencyPausers[account] = allowed;
        emit EmergencyPauserSet(account, allowed);
    }

    function pauseAll() external onlyEmergencyPauserOrGovernance {
        paused = true;
        emit GlobalPaused(true);
    }

    function unpauseAll() external onlyGovernance {
        paused = false;
        emit GlobalPaused(false);
    }

    function pauseAdapter(uint256 adapterId) external onlyEmergencyPauserOrGovernance {
        adapterPaused[adapterId] = true;
        emit AdapterPaused(adapterId, true);
    }

    function unpauseAdapter(uint256 adapterId) external onlyGovernance {
        adapterPaused[adapterId] = false;
        emit AdapterPaused(adapterId, false);
    }

    function setRateLimit(uint256 adapterId, address asset, uint64 windowSeconds, uint256 perWindowCap, bool enabled)
        external
        onlyGovernance
    {
        require(adapterId != 0, "adapterId=0");
        require(windowSeconds != 0, "window=0");
        rateLimits[adapterId][asset] = RateLimitConfig({
            windowSeconds: windowSeconds,
            perWindowCap: perWindowCap,
            enabled: enabled
        });
        emit RateLimitSet(adapterId, asset, windowSeconds, perWindowCap, enabled);
    }

    function checkDeploy(uint256 adapterId, address asset, uint256 amount) external view returns (bool allowed, bytes32 reason) {
        if (paused) return (false, keccak256("lge.cb.paused"));
        if (adapterPaused[adapterId]) return (false, keccak256("lge.cb.adapter_paused"));
        if (amount == 0) return (false, keccak256("lge.cb.amount_zero"));

        RateLimitConfig memory cfg = rateLimits[adapterId][asset];
        if (!cfg.enabled || cfg.perWindowCap == 0) return (true, bytes32(0));

        uint64 window = uint64(block.timestamp / cfg.windowSeconds);
        WindowUsage memory usage = windowUsage[adapterId][asset];
        uint256 used = usage.window != window ? 0 : usage.used;
        if (used + amount > cfg.perWindowCap) return (false, keccak256("lge.cb.rate_limited"));
        return (true, bytes32(0));
    }

    /// @notice Consume rate limit capacity for a deploy action.
    /// @dev Callable only by the configured vault or governance.
    function consumeDeploy(uint256 adapterId, address asset, uint256 amount) external {
        if (!_isGovernance(msg.sender) && msg.sender != vault) revert Unauthorized();
        if (paused || adapterPaused[adapterId]) revert PausedError();
        if (amount == 0) revert RateLimited();

        RateLimitConfig memory cfg = rateLimits[adapterId][asset];
        if (!cfg.enabled || cfg.perWindowCap == 0) {
            return;
        }

        uint64 window = uint64(block.timestamp / cfg.windowSeconds);
        WindowUsage storage usage = windowUsage[adapterId][asset];
        if (usage.window != window) {
            usage.window = window;
            usage.used = 0;
        }
        if (usage.used + amount > cfg.perWindowCap) revert RateLimited();
        usage.used += amount;
        emit WindowConsumed(adapterId, asset, window, usage.used);
    }

    function _isGovernance(address caller) internal view returns (bool) {
        return caller == governor || (timelock != address(0) && caller == timelock);
    }
}

