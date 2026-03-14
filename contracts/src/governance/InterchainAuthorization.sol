// SPDX-License-Identifier: MIT
// @ghostchain Part of the GhostChain protocol suite — https://ghostchain.io

pragma solidity ^0.8.24;

import "../common/Governed.sol";
import "../common/GhostHash.sol";

/// @notice Governance-locked allowlists + caps for interchain egress.
/// @dev Designed to be read by off-chain routers and (later) enforced by an on-chain LowBalancerRouter.
contract InterchainAuthorization is Governed {
    uint64 public constant WINDOW_SECONDS = 1 days;

    bytes32 internal constant REASON_OK = keccak256("ghost.interchain.reason.ok");
    bytes32 internal constant REASON_DISABLED = keccak256("ghost.interchain.reason.disabled");
    bytes32 internal constant REASON_PAUSED = keccak256("ghost.interchain.reason.paused");
    bytes32 internal constant REASON_AMOUNT_ZERO = keccak256("ghost.interchain.reason.amount_zero");
    bytes32 internal constant REASON_CHAIN_NOT_ALLOWED = keccak256("ghost.interchain.reason.chain_not_allowed");
    bytes32 internal constant REASON_CHAIN_PAUSED = keccak256("ghost.interchain.reason.chain_paused");
    bytes32 internal constant REASON_ADAPTER_NOT_ALLOWED = keccak256("ghost.interchain.reason.adapter_not_allowed");
    bytes32 internal constant REASON_ADAPTER_PAUSED = keccak256("ghost.interchain.reason.adapter_paused");
    bytes32 internal constant REASON_ASSET_NOT_ALLOWED = keccak256("ghost.interchain.reason.asset_not_allowed");
    bytes32 internal constant REASON_ASSET_PAUSED = keccak256("ghost.interchain.reason.asset_paused");
    bytes32 internal constant REASON_PER_TX_CAP = keccak256("ghost.interchain.reason.cap.per_tx");
    bytes32 internal constant REASON_PER_WINDOW_CAP = keccak256("ghost.interchain.reason.cap.per_window");

    struct CapConfig {
        uint256 perTxCap;
        uint256 perWindowCap;
        bool enabled;
        uint64 updatedAt;
    }

    struct WindowUsage {
        uint64 window;
        uint256 used;
    }

    struct EgressDecision {
        bool allowed;
        bytes32 reason;
        bytes32 capKey;
        uint256 perTxCap;
        uint256 perWindowCap;
        uint256 windowUsed;
        uint256 windowRemaining;
        uint64 window;
    }

    bool public enabled;
    bool public paused;

    mapping(uint256 => bool) public chainAllowed;
    mapping(uint256 => bool) public chainPaused;

    mapping(address => bool) public adapterAllowed;
    mapping(address => bool) public adapterPaused;

    mapping(address => bool) public assetAllowed;
    mapping(address => bool) public assetPaused;

    mapping(address => bool) public operators;

    mapping(bytes32 => CapConfig) private capConfigs;
    mapping(bytes32 => WindowUsage) private windowUsage;

    event EnabledUpdated(bool enabled);
    event PausedUpdated(bool paused);
    event ChainAllowedUpdated(uint256 indexed chainId, bool allowed);
    event ChainPausedUpdated(uint256 indexed chainId, bool paused);
    event AdapterAllowedUpdated(address indexed adapter, bool allowed);
    event AdapterPausedUpdated(address indexed adapter, bool paused);
    event AssetAllowedUpdated(address indexed asset, bool allowed);
    event AssetPausedUpdated(address indexed asset, bool paused);
    event OperatorUpdated(address indexed operator, bool allowed);
    event CapConfigUpdated(bytes32 indexed capKey, uint256 perTxCap, uint256 perWindowCap, bool enabled);
    event WindowConsumed(bytes32 indexed capKey, uint64 indexed window, uint256 newUsed);

    error Unauthorized();
    error EgressDenied(bytes32 reason);

    constructor(address governor_, address timelock_, bool enabled_) Governed(governor_, timelock_) {
        enabled = enabled_;
        emit EnabledUpdated(enabled_);
        emit PausedUpdated(false);
    }

    function setEnabled(bool enabled_) external onlyGovernance {
        enabled = enabled_;
        emit EnabledUpdated(enabled_);
    }

    function setPaused(bool paused_) external onlyGovernance {
        paused = paused_;
        emit PausedUpdated(paused_);
    }

    function setChainAllowed(uint256 chainId, bool allowed) external onlyGovernance {
        require(chainId != 0, "chainId=0");
        chainAllowed[chainId] = allowed;
        emit ChainAllowedUpdated(chainId, allowed);
    }

    function setChainPaused(uint256 chainId, bool paused_) external onlyGovernance {
        require(chainId != 0, "chainId=0");
        chainPaused[chainId] = paused_;
        emit ChainPausedUpdated(chainId, paused_);
    }

    function setAdapterAllowed(address adapter, bool allowed) external onlyGovernance {
        require(adapter != address(0), "adapter=0");
        adapterAllowed[adapter] = allowed;
        emit AdapterAllowedUpdated(adapter, allowed);
    }

    function setAdapterPaused(address adapter, bool paused_) external onlyGovernance {
        require(adapter != address(0), "adapter=0");
        adapterPaused[adapter] = paused_;
        emit AdapterPausedUpdated(adapter, paused_);
    }

    function setAssetAllowed(address asset, bool allowed) external onlyGovernance {
        require(asset != address(0), "asset=0");
        assetAllowed[asset] = allowed;
        emit AssetAllowedUpdated(asset, allowed);
    }

    function setAssetPaused(address asset, bool paused_) external onlyGovernance {
        require(asset != address(0), "asset=0");
        assetPaused[asset] = paused_;
        emit AssetPausedUpdated(asset, paused_);
    }

    function setOperator(address operator, bool allowed) external onlyGovernance {
        require(operator != address(0), "operator=0");
        operators[operator] = allowed;
        emit OperatorUpdated(operator, allowed);
    }

    /// @notice Configure caps; keys are derived from (dstChainId, asset) with optional 0-values for fallbacks:
    ///         - (chainId, asset) exact
    ///         - (chainId, 0) per-chain default
    ///         - (0, asset) per-asset default
    ///         - (0, 0) global default
    function setCapConfig(uint256 dstChainId, address asset, uint256 perTxCap, uint256 perWindowCap, bool enabled_)
        external
        onlyGovernance
    {
        bytes32 key = capKey(dstChainId, asset);
        capConfigs[key] = CapConfig({
            perTxCap: perTxCap,
            perWindowCap: perWindowCap,
            enabled: enabled_,
            updatedAt: uint64(block.timestamp)
        });
        emit CapConfigUpdated(key, perTxCap, perWindowCap, enabled_);
    }

    function getCapConfig(uint256 dstChainId, address asset) external view returns (CapConfig memory config, bytes32 key) {
        (config, key) = _resolveCap(dstChainId, asset);
    }

    function getWindowUsage(bytes32 capKey_) external view returns (WindowUsage memory usage) {
        return windowUsage[capKey_];
    }

    function capKey(uint256 dstChainId, address asset) public pure returns (bytes32) {
        return GhostHash.interchainAssetKey(dstChainId, asset);
    }

    function checkEgress(uint256 dstChainId, address asset, address adapter, uint256 amount)
        external
        view
        returns (EgressDecision memory decision)
    {
        return _checkEgress(dstChainId, asset, adapter, amount);
    }

    /// @notice Atomically consume window capacity for an egress action (for on-chain enforcement).
    /// @dev Caller must be an operator (router/executor) or governance.
    function consumeEgress(uint256 dstChainId, address asset, address adapter, uint256 amount)
        external
        returns (EgressDecision memory decision)
    {
        if (!_isOperatorOrGovernance(msg.sender)) revert Unauthorized();
        decision = _checkEgress(dstChainId, asset, adapter, amount);
        if (!decision.allowed) revert EgressDenied(decision.reason);

        if (decision.perWindowCap != 0) {
            WindowUsage storage usage = windowUsage[decision.capKey];
            if (usage.window != decision.window) {
                usage.window = decision.window;
                usage.used = 0;
            }
            usage.used += amount;
            emit WindowConsumed(decision.capKey, decision.window, usage.used);
        }
    }

    function _checkEgress(uint256 dstChainId, address asset, address adapter, uint256 amount)
        internal
        view
        returns (EgressDecision memory decision)
    {
        if (!enabled) {
            decision.reason = REASON_DISABLED;
            return decision;
        }
        if (paused) {
            decision.reason = REASON_PAUSED;
            return decision;
        }
        if (amount == 0) {
            decision.reason = REASON_AMOUNT_ZERO;
            return decision;
        }
        if (!chainAllowed[dstChainId]) {
            decision.reason = REASON_CHAIN_NOT_ALLOWED;
            return decision;
        }
        if (chainPaused[dstChainId]) {
            decision.reason = REASON_CHAIN_PAUSED;
            return decision;
        }
        if (!adapterAllowed[adapter]) {
            decision.reason = REASON_ADAPTER_NOT_ALLOWED;
            return decision;
        }
        if (adapterPaused[adapter]) {
            decision.reason = REASON_ADAPTER_PAUSED;
            return decision;
        }
        if (!assetAllowed[asset]) {
            decision.reason = REASON_ASSET_NOT_ALLOWED;
            return decision;
        }
        if (assetPaused[asset]) {
            decision.reason = REASON_ASSET_PAUSED;
            return decision;
        }

        (CapConfig memory cap, bytes32 key) = _resolveCap(dstChainId, asset);
        decision.capKey = key;
        decision.perTxCap = cap.perTxCap;
        decision.perWindowCap = cap.perWindowCap;

        if (cap.enabled) {
            if (cap.perTxCap != 0 && amount > cap.perTxCap) {
                decision.reason = REASON_PER_TX_CAP;
                return decision;
            }

            if (cap.perWindowCap != 0) {
                uint64 window = uint64(block.timestamp / WINDOW_SECONDS);
                WindowUsage memory usage = windowUsage[key];
                uint256 used = usage.window != window ? 0 : usage.used;
                if (used + amount > cap.perWindowCap) {
                    decision.window = window;
                    decision.windowUsed = used;
                    decision.windowRemaining = cap.perWindowCap > used ? cap.perWindowCap - used : 0;
                    decision.reason = REASON_PER_WINDOW_CAP;
                    return decision;
                }
                decision.window = window;
                decision.windowUsed = used;
                decision.windowRemaining = cap.perWindowCap - used;
            }
        }

        decision.allowed = true;
        decision.reason = REASON_OK;
    }

    function _resolveCap(uint256 dstChainId, address asset) internal view returns (CapConfig memory config, bytes32 key) {
        bytes32 exact = capKey(dstChainId, asset);
        config = capConfigs[exact];
        if (config.enabled) return (config, exact);

        bytes32 chainDefault = capKey(dstChainId, address(0));
        config = capConfigs[chainDefault];
        if (config.enabled) return (config, chainDefault);

        bytes32 assetDefault = capKey(0, asset);
        config = capConfigs[assetDefault];
        if (config.enabled) return (config, assetDefault);

        bytes32 globalDefault = capKey(0, address(0));
        config = capConfigs[globalDefault];
        if (config.enabled) return (config, globalDefault);

        return (CapConfig({perTxCap: 0, perWindowCap: 0, enabled: false, updatedAt: 0}), exact);
    }

    function _isOperatorOrGovernance(address caller) internal view returns (bool) {
        if (operators[caller]) return true;
        if (caller == governor) return true;
        if (timelock != address(0) && caller == timelock) return true;
        return false;
    }
}
