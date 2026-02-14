// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../common/Governed.sol";
import "../bridge/StandardBridge.sol";

interface IERC20Escrow {
    function approve(address spender, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
}

interface ILoadBalancerVaultEscrowReceiver {
    function unwindFromEscrow(uint256 adapterId, address asset, uint256 amount, bytes32 strategyId) external payable;
}

interface IWrappedNative {
    function deposit() external payable;
    function withdraw(uint256 amount) external;
}

/// @notice Governance-controlled bridge escrow integration for LGE.
/// @dev This contract never allows arbitrary withdrawals: it only (1) bridges funds out via a configured
///      StandardBridge instance, and (2) forwards returned funds back into the canonical L1 vault.
contract BridgeEscrow is Governed {
    struct BridgeConfig {
        address bridge;
        address remoteTo;
        uint32 minGasLimit;
        bool enabled;
    }

    address public vault;
    address public wrappedNative;

    mapping(uint256 => BridgeConfig) public bridgeConfigs; // adapterId => cfg
    mapping(uint256 => mapping(address => address)) public remoteToken; // adapterId => localAsset => remoteAsset

    event VaultSet(address indexed vault);
    event WrappedNativeSet(address indexed token);
    event BridgeConfigured(uint256 indexed adapterId, address indexed bridge, address indexed remoteTo, uint32 minGasLimit, bool enabled);
    event RemoteTokenSet(uint256 indexed adapterId, address indexed localAsset, address indexed remoteAsset);
    event BridgedOut(uint256 indexed adapterId, address indexed asset, uint256 amount, address indexed bridge, address remoteTo, address remoteAsset);
    event BridgedOutNative(
        uint256 indexed adapterId,
        uint256 amount,
        address indexed bridge,
        address remoteTo,
        address remoteAsset,
        address indexed wrappedNative
    );
    event UnwindFinalized(uint256 indexed adapterId, address indexed asset, uint256 amount, address indexed caller);

    error Unauthorized();
    error BridgeNotConfigured(uint256 adapterId);
    error RemoteTokenMissing(uint256 adapterId, address asset);
    error WrappedNativeNotSet();

    constructor(address governor_, address timelock_) Governed(governor_, timelock_) {}

    modifier onlyVaultOrGovernance() {
        if (!_isGovernance(msg.sender) && msg.sender != vault) revert Unauthorized();
        _;
    }

    function setVault(address vault_) external onlyGovernance {
        require(vault_ != address(0), "vault=0");
        vault = vault_;
        emit VaultSet(vault_);
    }

    function setWrappedNative(address token) external onlyGovernance {
        require(token != address(0), "token=0");
        wrappedNative = token;
        emit WrappedNativeSet(token);
    }

    function configureBridge(uint256 adapterId, BridgeConfig calldata config) external onlyGovernance {
        require(adapterId != 0, "adapterId=0");
        require(config.bridge != address(0), "bridge=0");
        require(config.remoteTo != address(0), "remoteTo=0");
        require(config.minGasLimit != 0, "minGas=0");
        bridgeConfigs[adapterId] = config;
        emit BridgeConfigured(adapterId, config.bridge, config.remoteTo, config.minGasLimit, config.enabled);
    }

    function setRemoteToken(uint256 adapterId, address localAsset, address remoteAsset) external onlyGovernance {
        require(adapterId != 0, "adapterId=0");
        require(localAsset != address(0), "asset=0");
        require(remoteAsset != address(0), "remote=0");
        remoteToken[adapterId][localAsset] = remoteAsset;
        emit RemoteTokenSet(adapterId, localAsset, remoteAsset);
    }

    /// @notice Bridge funds out of L1 via a configured StandardBridge.
    /// @dev Caller (vault) MUST transfer `amount` of `asset` to this escrow before calling.
    function bridgeOut(uint256 adapterId, address asset, uint256 amount, bytes calldata data) external onlyVaultOrGovernance {
        require(asset != address(0), "asset=0");
        require(amount != 0, "amount=0");

        BridgeConfig memory cfg = bridgeConfigs[adapterId];
        if (!cfg.enabled || cfg.bridge == address(0)) revert BridgeNotConfigured(adapterId);

        address remoteAsset = remoteToken[adapterId][asset];
        if (remoteAsset == address(0)) revert RemoteTokenMissing(adapterId, asset);

        require(IERC20Escrow(asset).approve(cfg.bridge, 0), "approve0");
        require(IERC20Escrow(asset).approve(cfg.bridge, amount), "approve");

        StandardBridge(payable(cfg.bridge)).bridgeERC20(asset, remoteAsset, cfg.remoteTo, amount, cfg.minGasLimit, data, false);

        emit BridgedOut(adapterId, asset, amount, cfg.bridge, cfg.remoteTo, remoteAsset);
    }

    /// @notice Bridge native gas token out of L1 by wrapping it into `wrappedNative` then bridging as an ERC20.
    /// @dev Caller MUST pass `msg.value == amount`.
    function bridgeOutNative(uint256 adapterId, uint256 amount, bytes calldata data) external payable onlyVaultOrGovernance {
        require(amount != 0, "amount=0");
        require(msg.value == amount, "value");

        address wn = wrappedNative;
        if (wn == address(0)) revert WrappedNativeNotSet();

        BridgeConfig memory cfg = bridgeConfigs[adapterId];
        if (!cfg.enabled || cfg.bridge == address(0)) revert BridgeNotConfigured(adapterId);

        address remoteAsset = remoteToken[adapterId][wn];
        if (remoteAsset == address(0)) revert RemoteTokenMissing(adapterId, wn);

        IWrappedNative(wn).deposit{value: amount}();

        require(IERC20Escrow(wn).approve(cfg.bridge, 0), "approve0");
        require(IERC20Escrow(wn).approve(cfg.bridge, amount), "approve");

        StandardBridge(payable(cfg.bridge)).bridgeERC20(wn, remoteAsset, cfg.remoteTo, amount, cfg.minGasLimit, data, false);

        emit BridgedOutNative(adapterId, amount, cfg.bridge, cfg.remoteTo, remoteAsset, wn);
    }

    /// @notice Forward returned funds to the vault and finalize unwind accounting.
    /// @dev This is safe to call by anyone; it only moves funds to the canonical L1 vault.
    function finalizeUnwind(uint256 adapterId, address asset, uint256 amount, bytes32 strategyId) external {
        address vaultRef = vault;
        require(vaultRef != address(0), "vault=0");
        require(asset != address(0), "asset=0");
        require(amount != 0, "amount=0");

        require(IERC20Escrow(asset).transfer(vaultRef, amount), "transfer");
        ILoadBalancerVaultEscrowReceiver(vaultRef).unwindFromEscrow(adapterId, asset, amount, strategyId);

        emit UnwindFinalized(adapterId, asset, amount, msg.sender);
    }

    /// @notice Unwrap returned native principal and finalize unwind accounting.
    /// @dev The bridge must have finalized ERC20 (wrapped-native) back to this escrow before calling.
    function finalizeUnwindNative(uint256 adapterId, uint256 amount, bytes32 strategyId) external {
        address vaultRef = vault;
        require(vaultRef != address(0), "vault=0");
        require(amount != 0, "amount=0");

        address wn = wrappedNative;
        if (wn == address(0)) revert WrappedNativeNotSet();

        // Avoid forwarding native value directly (Slither: arbitrary-send-eth). Instead, forward wrapped native to the vault and let the
        // vault unwrap as part of unwind accounting for asset==address(0).
        require(IERC20Escrow(wn).transfer(vaultRef, amount), "transfer");
        ILoadBalancerVaultEscrowReceiver(vaultRef).unwindFromEscrow(adapterId, address(0), amount, strategyId);

        emit UnwindFinalized(adapterId, address(0), amount, msg.sender);
    }

    function _isGovernance(address caller) internal view returns (bool) {
        return caller == governor || (timelock != address(0) && caller == timelock);
    }

    receive() external payable {}
}
