// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../common/Governed.sol";
import "../common/ReentrancyGuard.sol";
import "../governance/PolicyRegistry.sol";
import "./AdapterRegistry.sol";
import "./CircuitBreaker.sol";
import "./SettlementOracle.sol";
import "./BridgeEscrow.sol";

interface IGST20Vault {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
}

interface IWrappedNativeVault {
    function withdraw(uint256 amount) external;
}

/// @notice Liquidity vault for governance-locked external deployment with share accounting.
contract LoadBalancerVault is Governed, ReentrancyGuard {
    struct AssetConfig {
        bool supported;
        uint256 maxTotalDeployed;
        bool depositsEnabled;
        bool withdrawalsEnabled;
    }

    struct AssetTotals {
        uint256 totalShares;
        uint256 idle;
        uint256 deployed;
    }

    AdapterRegistry public adapterRegistry;
    SettlementOracle public settlementOracle;
    CircuitBreaker public circuitBreaker;
    PolicyRegistry public policyRegistry;
    BridgeEscrow public bridgeEscrow;

    bool public paused;

    mapping(address => AssetConfig) public assetConfigs;
    mapping(address => AssetTotals) public assetTotals;
    mapping(address => mapping(address => uint256)) public shareBalance; // asset => user => shares

    mapping(uint256 => mapping(address => uint256)) public deployedByAdapterAsset; // adapterId => asset => amount
    mapping(uint256 => mapping(address => uint64)) public lastDeployAt; // adapterId => asset => ts
    mapping(uint256 => uint64) public adapterCooldownSeconds;
    mapping(uint256 => bool) public adapterUsesBridgeEscrow;

    mapping(bytes32 => bool) public globalStrategyAllowed;
    mapping(uint256 => mapping(bytes32 => bool)) public adapterStrategyAllowed;

    event PausedSet(bool paused);
    event AssetConfigured(address indexed asset, bool supported, uint256 maxTotalDeployed, bool depositsEnabled, bool withdrawalsEnabled);
    event AdapterCooldownSet(uint256 indexed adapterId, uint64 cooldownSeconds);
    event StrategyAllowed(bytes32 indexed strategyId, bool allowed);
    event AdapterStrategyAllowed(uint256 indexed adapterId, bytes32 indexed strategyId, bool allowed);
    event PolicyRegistrySet(address indexed policyRegistry);
    event BridgeEscrowSet(address indexed escrow);
    event AdapterBridgeCustodySet(uint256 indexed adapterId, bool enabled);

    event Deposited(address indexed user, address indexed asset, uint256 amount, uint256 sharesMinted);
    event Withdrawn(address indexed user, address indexed asset, uint256 amount, uint256 sharesBurned);

    event Deployed(
        uint256 indexed adapterId,
        address indexed asset,
        uint256 amount,
        bytes32 indexed strategyId,
        address operator
    );
    event Unwound(uint256 indexed adapterId, address indexed asset, uint256 amount, bytes32 indexed strategyId, address operator);

    error UnsupportedAsset(address asset);
    error NotOperator(address caller);
    error NotBridgeEscrow(address caller);

    constructor(
        address governor_,
        address timelock_,
        AdapterRegistry adapterRegistry_,
        SettlementOracle settlementOracle_,
        CircuitBreaker circuitBreaker_,
        PolicyRegistry policyRegistry_
    ) Governed(governor_, timelock_) {
        adapterRegistry = adapterRegistry_;
        settlementOracle = settlementOracle_;
        circuitBreaker = circuitBreaker_;
        policyRegistry = policyRegistry_;
    }

    modifier notPaused() {
        require(!paused, "paused");
        _;
    }

    function setPaused(bool paused_) external onlyGovernance {
        paused = paused_;
        emit PausedSet(paused_);
    }

    function setPolicyRegistry(PolicyRegistry registry) external onlyGovernance {
        policyRegistry = registry;
        emit PolicyRegistrySet(address(registry));
    }

    function setBridgeEscrow(BridgeEscrow escrow) external onlyGovernance {
        bridgeEscrow = escrow;
        emit BridgeEscrowSet(address(escrow));
    }

    function setAdapterBridgeCustody(uint256 adapterId, bool enabled) external onlyGovernance {
        require(adapterId != 0, "adapterId=0");
        adapterUsesBridgeEscrow[adapterId] = enabled;
        emit AdapterBridgeCustodySet(adapterId, enabled);
    }

    function configureAsset(address asset, AssetConfig calldata config) external onlyGovernance {
        assetConfigs[asset] = config;
        emit AssetConfigured(asset, config.supported, config.maxTotalDeployed, config.depositsEnabled, config.withdrawalsEnabled);
    }

    function setAdapterCooldown(uint256 adapterId, uint64 cooldownSeconds) external onlyGovernance {
        adapterCooldownSeconds[adapterId] = cooldownSeconds;
        emit AdapterCooldownSet(adapterId, cooldownSeconds);
    }

    function setGlobalStrategyAllowed(bytes32 strategyId, bool allowed) external onlyGovernance {
        require(strategyId != bytes32(0), "strategy=0");
        globalStrategyAllowed[strategyId] = allowed;
        emit StrategyAllowed(strategyId, allowed);
    }

    function setAdapterStrategyAllowed(uint256 adapterId, bytes32 strategyId, bool allowed) external onlyGovernance {
        require(adapterId != 0, "adapterId=0");
        require(strategyId != bytes32(0), "strategy=0");
        adapterStrategyAllowed[adapterId][strategyId] = allowed;
        emit AdapterStrategyAllowed(adapterId, strategyId, allowed);
    }

    function previewDeposit(address asset, uint256 amount) public view returns (uint256 sharesOut) {
        AssetTotals memory totals = assetTotals[asset];
        uint256 totalAssets = totals.idle + totals.deployed;
        if (totals.totalShares == 0 || totalAssets == 0) {
            return amount;
        }
        return (amount * totals.totalShares) / totalAssets;
    }

    function previewRedeem(address asset, uint256 sharesIn) public view returns (uint256 amountOut) {
        AssetTotals memory totals = assetTotals[asset];
        if (totals.totalShares == 0) return 0;
        uint256 totalAssets = totals.idle + totals.deployed;
        return (sharesIn * totalAssets) / totals.totalShares;
    }

    function deposit(address asset, uint256 amount) external payable nonReentrant notPaused returns (uint256 sharesMinted) {
        AssetConfig memory cfg = assetConfigs[asset];
        if (!cfg.supported) revert UnsupportedAsset(asset);
        require(cfg.depositsEnabled, "deposits disabled");
        require(amount != 0, "amount=0");

        sharesMinted = previewDeposit(asset, amount);
        require(sharesMinted != 0, "shares=0");

        AssetTotals storage totals = assetTotals[asset];
        totals.totalShares += sharesMinted;
        shareBalance[asset][msg.sender] += sharesMinted;

        if (asset == address(0)) {
            require(msg.value == amount, "value");
            totals.idle += amount;
        } else {
            require(msg.value == 0, "no value");
            totals.idle += amount;
            require(IGST20Vault(asset).transferFrom(msg.sender, address(this), amount), "transferFrom");
        }

        emit Deposited(msg.sender, asset, amount, sharesMinted);
    }

    function withdraw(address asset, uint256 sharesIn, uint256 minAmountOut) external nonReentrant notPaused returns (uint256 amountOut) {
        AssetConfig memory cfg = assetConfigs[asset];
        if (!cfg.supported) revert UnsupportedAsset(asset);
        require(cfg.withdrawalsEnabled, "withdrawals disabled");
        require(sharesIn != 0, "shares=0");

        uint256 userShares = shareBalance[asset][msg.sender];
        require(userShares >= sharesIn, "shares");

        amountOut = previewRedeem(asset, sharesIn);
        require(amountOut >= minAmountOut, "slippage");

        AssetTotals storage totals = assetTotals[asset];
        require(totals.idle >= amountOut, "insufficient idle");

        unchecked {
            shareBalance[asset][msg.sender] = userShares - sharesIn;
            totals.totalShares -= sharesIn;
            totals.idle -= amountOut;
        }

        if (asset == address(0)) {
            (bool ok, ) = payable(msg.sender).call{value: amountOut}("");
            require(ok, "eth send");
        } else {
            require(IGST20Vault(asset).transfer(msg.sender, amountOut), "transfer");
        }

        emit Withdrawn(msg.sender, asset, amountOut, sharesIn);
    }

    function deployToAdapter(uint256 adapterId, address asset, uint256 amount, bytes32 strategyId) external nonReentrant notPaused {
        AssetConfig memory cfg = assetConfigs[asset];
        if (!cfg.supported) revert UnsupportedAsset(asset);
        require(amount != 0, "amount=0");

        AdapterRegistry.AdapterConfig memory adapter = adapterRegistry.getAdapter(adapterId);
        require(adapter.enabled, "adapter disabled");
        require(!adapter.paused, "adapter paused");
        require(adapter.operator != address(0), "operator=0");

        // Enforce caller is the configured operator (or governance).
        if (!_isGovernance(msg.sender) && msg.sender != adapter.operator) revert NotOperator(msg.sender);

        // Strategy allowlist (global OR per-adapter).
        require(strategyId != bytes32(0), "strategy=0");
        require(globalStrategyAllowed[strategyId] || adapterStrategyAllowed[adapterId][strategyId], "strategy not allowed");

        // Settlement gating: no settlement -> no continuation.
        settlementOracle.requireCanContinue(adapterId);

        // Circuit breaker + rate limits.
        circuitBreaker.consumeDeploy(adapterId, asset, amount);

        // Cooldown.
        uint64 cd = adapterCooldownSeconds[adapterId];
        uint64 last = lastDeployAt[adapterId][asset];
        if (cd != 0 && last != 0) {
            require(block.timestamp >= uint256(last) + uint256(cd), "cooldown");
        }

        // Caps.
        uint256 cap = adapter.maxDeployCap;
        uint256 policyCap = _policyAdapterCap(adapterId, asset);
        if (policyCap != 0 && (cap == 0 || policyCap < cap)) {
            cap = policyCap;
        }
        if (cap != 0) {
            require(deployedByAdapterAsset[adapterId][asset] + amount <= cap, "adapter cap");
        }

        uint256 maxTotal = cfg.maxTotalDeployed;
        uint256 policyMax = _policyMaxTotalDeployed(asset);
        if (policyMax != 0 && (maxTotal == 0 || policyMax < maxTotal)) {
            maxTotal = policyMax;
        }
        if (maxTotal != 0) {
            require(assetTotals[asset].deployed + amount <= maxTotal, "total cap");
        }

        // Liquidity check.
        AssetTotals storage totals = assetTotals[asset];
        require(totals.idle >= amount, "idle");

        totals.idle -= amount;
        totals.deployed += amount;
        deployedByAdapterAsset[adapterId][asset] += amount;
        lastDeployAt[adapterId][asset] = uint64(block.timestamp);

        if (adapterUsesBridgeEscrow[adapterId]) {
            BridgeEscrow escrow = bridgeEscrow;
            require(address(escrow) != address(0), "escrow=0");
            if (asset == address(0)) {
                escrow.bridgeOutNative{value: amount}(adapterId, amount, abi.encode(strategyId));
            } else {
                require(IGST20Vault(asset).transfer(address(escrow), amount), "to escrow");
                escrow.bridgeOut(adapterId, asset, amount, abi.encode(strategyId));
            }
        } else {
            if (asset == address(0)) {
                (bool ok, ) = payable(adapter.operator).call{value: amount}("");
                require(ok, "eth send");
            } else {
                require(IGST20Vault(asset).transfer(adapter.operator, amount), "transfer");
            }
        }

        settlementOracle.recordDeploy(adapterId, asset, amount, adapter.operator);
        emit Deployed(adapterId, asset, amount, strategyId, adapter.operator);
    }

    /// @notice Operator returns funds back to the vault (MVP) and records an unwind.
    function unwindFromAdapter(uint256 adapterId, address asset, uint256 amount, bytes32 strategyId) external payable nonReentrant notPaused {
        AssetConfig memory cfg = assetConfigs[asset];
        if (!cfg.supported) revert UnsupportedAsset(asset);
        require(amount != 0, "amount=0");

        AdapterRegistry.AdapterConfig memory adapter = adapterRegistry.getAdapter(adapterId);
        require(adapter.enabled, "adapter disabled");
        require(adapter.operator != address(0), "operator=0");

        require(!adapterUsesBridgeEscrow[adapterId], "bridge custody");
        if (!_isGovernance(msg.sender) && msg.sender != adapter.operator) revert NotOperator(msg.sender);

        uint256 deployed = deployedByAdapterAsset[adapterId][asset];
        require(deployed >= amount, "deployed");

        assetTotals[asset].idle += amount;
        assetTotals[asset].deployed -= amount;
        deployedByAdapterAsset[adapterId][asset] = deployed - amount;

        if (asset == address(0)) {
            require(msg.value == amount, "value");
        } else {
            require(msg.value == 0, "no value");
            require(IGST20Vault(asset).transferFrom(msg.sender, address(this), amount), "transferFrom");
        }

        settlementOracle.recordUnwind(adapterId, asset, amount, adapter.operator);
        emit Unwound(adapterId, asset, amount, strategyId, adapter.operator);
    }

    /// @notice Bridge escrow finalizes an unwind after canonical funds return to L1.
    /// @dev The escrow transfers `amount` of `asset` to the vault before calling this function.
    function unwindFromEscrow(uint256 adapterId, address asset, uint256 amount, bytes32 strategyId) external payable nonReentrant notPaused {
        if (msg.sender != address(bridgeEscrow)) revert NotBridgeEscrow(msg.sender);
        AssetConfig memory cfg = assetConfigs[asset];
        if (!cfg.supported) revert UnsupportedAsset(asset);
        require(amount != 0, "amount=0");

        AdapterRegistry.AdapterConfig memory adapter = adapterRegistry.getAdapter(adapterId);
        require(adapter.enabled, "adapter disabled");
        require(adapter.operator != address(0), "operator=0");

        uint256 deployed = deployedByAdapterAsset[adapterId][asset];
        require(deployed >= amount, "deployed");

        if (asset == address(0)) {
            // Two safe paths:
            // - msg.value == amount: escrow forwarded native token
            // - msg.value == 0: escrow forwarded wrapped native; unwrap it here so the canonical asset is native
            assetTotals[asset].idle += amount;
        } else {
            require(msg.value == 0, "no value");
            assetTotals[asset].idle += amount;
        }
        assetTotals[asset].deployed -= amount;
        deployedByAdapterAsset[adapterId][asset] = deployed - amount;

        if (asset == address(0) && msg.value == 0) {
            address wn = address(bridgeEscrow.wrappedNative());
            require(wn != address(0), "wrappedNative=0");
            IWrappedNativeVault(wn).withdraw(amount);
        } else if (asset == address(0)) {
            require(msg.value == amount, "value");
        }

        settlementOracle.recordUnwind(adapterId, asset, amount, adapter.operator);
        emit Unwound(adapterId, asset, amount, strategyId, adapter.operator);
    }

    /// @notice Emergency rescue for stuck funds, only when paused.
    function emergencyWithdraw(address asset, address to, uint256 amount) external onlyGovernance {
        require(paused, "not paused");
        require(to != address(0), "to=0");
        if (asset == address(0)) {
            (bool ok, ) = payable(to).call{value: amount}("");
            require(ok, "native send");
        } else {
            require(IGST20Vault(asset).transfer(to, amount), "transfer");
        }
    }

    function _policyMaxTotalDeployed(address asset) internal view returns (uint256) {
        PolicyRegistry registry = policyRegistry;
        if (address(registry) == address(0)) return 0;
        bytes32 key = keccak256(abi.encode("ghost.lge.maxTotalDeployed", asset));
        (
            uint256 min,
            uint256 max,
            uint64 activationDelay,
            uint64 emergencyExpiry,
            uint64 rollbackWindow,
            bool hasBounds,
            bool enabled
        ) = registry.policySettings(key);
        min;
        max;
        activationDelay;
        emergencyExpiry;
        rollbackWindow;
        hasBounds;
        if (!enabled) return 0;
        (uint256 value, , , , ) = registry.effectivePolicy(key);
        return value;
    }

    function _policyAdapterCap(uint256 adapterId, address asset) internal view returns (uint256) {
        PolicyRegistry registry = policyRegistry;
        if (address(registry) == address(0)) return 0;
        bytes32 key = keccak256(abi.encode("ghost.lge.adapterCap", adapterId, asset));
        (
            uint256 min,
            uint256 max,
            uint64 activationDelay,
            uint64 emergencyExpiry,
            uint64 rollbackWindow,
            bool hasBounds,
            bool enabled
        ) = registry.policySettings(key);
        min;
        max;
        activationDelay;
        emergencyExpiry;
        rollbackWindow;
        hasBounds;
        if (!enabled) return 0;
        (uint256 value, , , , ) = registry.effectivePolicy(key);
        return value;
    }

    function _isGovernance(address caller) internal view returns (bool) {
        return caller == governor || (timelock != address(0) && caller == timelock);
    }

    receive() external payable {}
}
