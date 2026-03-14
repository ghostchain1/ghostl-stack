// SPDX-License-Identifier: MIT
// GhostChain Contracts v5.6.1 (grc/GRC4626.sol)
// @ghostchain Part of the GhostChain protocol suite — https://ghostchain.io

pragma solidity ^0.8.24;

import { GRC20 } from "../ghost/GRC20.sol";

/*
    Standard: GRC4626
    Name: Ghost Request for Comments 4626 — Tokenized Vault
    Compatible With: ERC4626
    Network: GhostChain L1 / GhostL2 / GhostL3
*/

/// @title IGRC4626
/// @notice GRC-4626 vault interface — mirrors ERC-4626 for GhostChain vaults.
interface IGRC4626 {
    // ── Events ────────────────────────────────────────────────────────────────
    event Deposit(address indexed caller, address indexed owner, uint256 assets, uint256 shares);
    event Withdraw(address indexed caller, address indexed receiver, address indexed owner, uint256 assets, uint256 shares);

    // ── Asset ─────────────────────────────────────────────────────────────────
    function asset() external view returns (address assetTokenAddress);

    // ── Accounting ────────────────────────────────────────────────────────────
    function totalAssets() external view returns (uint256 totalManagedAssets);
    function convertToShares(uint256 assets) external view returns (uint256 shares);
    function convertToAssets(uint256 shares) external view returns (uint256 assets);
    function maxDeposit(address receiver) external view returns (uint256 maxAssets);
    function previewDeposit(uint256 assets) external view returns (uint256 shares);
    function maxMint(address receiver) external view returns (uint256 maxShares);
    function previewMint(uint256 shares) external view returns (uint256 assets);
    function maxWithdraw(address owner) external view returns (uint256 maxAssets);
    function previewWithdraw(uint256 assets) external view returns (uint256 shares);
    function maxRedeem(address owner) external view returns (uint256 maxShares);
    function previewRedeem(uint256 shares) external view returns (uint256 assets);

    // ── Actions ───────────────────────────────────────────────────────────────
    function deposit(uint256 assets, address receiver) external returns (uint256 shares);
    function mint(uint256 shares, address receiver) external returns (uint256 assets);
    function withdraw(uint256 assets, address receiver, address owner) external returns (uint256 shares);
    function redeem(uint256 shares, address receiver, address owner) external returns (uint256 assets);
}

/// @title GRC4626
/// @notice GhostChain tokenized vault standard (GRC-4626).
///
///         Wraps any GRC-20 `_asset` token and issues **shares** (vault GRC-20 tokens)
///         that represent a proportional claim on the vault's total managed assets.
///
///         Use cases in GhostStack:
///           • GST yield vaults (staking, LP fee compounding)
///           • LGE LoadBalancerVault shares
///           • Protocol reserve management
///
///         The rounding convention follows ERC-4626:
///           - deposit / mint  → round down in favour of vault (more shares cost more assets)
///           - withdraw / redeem → round up in favour of vault (fewer shares return fewer assets)
///
/// @dev Inherits GRC-20 (share token).  Child contracts must override `totalAssets()`
///      to account for any strategy-specific yield.  The base implementation reports
///      the raw GRC-20 balance of the vault.
abstract contract GRC4626 is GRC20, IGRC4626 {
    // ─────────────────────── Immutables ──────────────────────────────────────

    /// @notice The underlying GRC-20 asset token.
    address private immutable _asset;

    // ─────────────────────── Init ────────────────────────────────────────────

    /// @param assetToken   The underlying GRC-20 token this vault manages.
    /// @param shareName    Name of the issued share token (e.g. "Ghost GST Vault").
    /// @param shareSymbol  Symbol of the issued share token (e.g. "gGST").
    constructor(address assetToken, string memory shareName, string memory shareSymbol)
        GRC20(shareName, shareSymbol, 18)
    {
        require(assetToken != address(0), "GRC4626: zero asset");
        _asset = assetToken;
    }

    // ─────────────────────── Asset ───────────────────────────────────────────

    /// @inheritdoc IGRC4626
    function asset() public view override returns (address) {
        return _asset;
    }

    // ─────────────────────── Accounting ──────────────────────────────────────

    /// @notice Total managed assets.  Overrideable by strategies.
    /// @inheritdoc IGRC4626
    function totalAssets() public view virtual override returns (uint256) {
        return _assetBalance();
    }

    /// @inheritdoc IGRC4626
    function convertToShares(uint256 assets) public view override returns (uint256) {
        uint256 supply = totalSupply;
        return supply == 0
            ? assets
            : assets * supply / totalAssets();
    }

    /// @inheritdoc IGRC4626
    function convertToAssets(uint256 shares) public view override returns (uint256) {
        uint256 supply = totalSupply;
        return supply == 0
            ? shares
            : shares * totalAssets() / supply;
    }

    // ── Deposit ───────────────────────────────────────────────────────────────

    /// @inheritdoc IGRC4626
    function maxDeposit(address) public view virtual override returns (uint256) {
        return type(uint256).max;
    }

    /// @inheritdoc IGRC4626
    function previewDeposit(uint256 assets) public view override returns (uint256) {
        return convertToShares(assets);
    }

    /// @inheritdoc IGRC4626
    function deposit(uint256 assets, address receiver) public virtual override returns (uint256 shares) {
        require(assets <= maxDeposit(receiver), "GRC4626: maxDeposit exceeded");
        shares = previewDeposit(assets);
        _deposit(msg.sender, receiver, assets, shares);
    }

    // ── Mint ──────────────────────────────────────────────────────────────────

    /// @inheritdoc IGRC4626
    function maxMint(address) public view virtual override returns (uint256) {
        return type(uint256).max;
    }

    /// @inheritdoc IGRC4626
    function previewMint(uint256 shares) public view override returns (uint256) {
        uint256 supply = totalSupply;
        return supply == 0
            ? shares
            : _divRoundUp(shares * totalAssets(), supply);
    }

    /// @inheritdoc IGRC4626
    function mint(uint256 shares, address receiver) public virtual override returns (uint256 assets) {
        require(shares <= maxMint(receiver), "GRC4626: maxMint exceeded");
        assets = previewMint(shares);
        _deposit(msg.sender, receiver, assets, shares);
    }

    // ── Withdraw ─────────────────────────────────────────────────────────────

    /// @inheritdoc IGRC4626
    function maxWithdraw(address owner) public view virtual override returns (uint256) {
        return convertToAssets(balanceOf[owner]);
    }

    /// @inheritdoc IGRC4626
    function previewWithdraw(uint256 assets) public view override returns (uint256) {
        uint256 supply = totalSupply;
        return supply == 0
            ? assets
            : _divRoundUp(assets * supply, totalAssets());
    }

    /// @inheritdoc IGRC4626
    function withdraw(uint256 assets, address receiver, address owner)
        public
        virtual
        override
        returns (uint256 shares)
    {
        require(assets <= maxWithdraw(owner), "GRC4626: maxWithdraw exceeded");
        shares = previewWithdraw(assets);
        _withdraw(msg.sender, receiver, owner, assets, shares);
    }

    // ── Redeem ────────────────────────────────────────────────────────────────

    /// @inheritdoc IGRC4626
    function maxRedeem(address owner) public view virtual override returns (uint256) {
        return balanceOf[owner];
    }

    /// @inheritdoc IGRC4626
    function previewRedeem(uint256 shares) public view override returns (uint256) {
        return convertToAssets(shares);
    }

    /// @inheritdoc IGRC4626
    function redeem(uint256 shares, address receiver, address owner)
        public
        virtual
        override
        returns (uint256 assets)
    {
        require(shares <= maxRedeem(owner), "GRC4626: maxRedeem exceeded");
        assets = previewRedeem(shares);
        _withdraw(msg.sender, receiver, owner, assets, shares);
    }

    // ─────────────────────── Internal ────────────────────────────────────────

    /// @dev Pull `assets` from `caller`, credit `shares` to `receiver`.
    function _deposit(address caller, address receiver, uint256 assets, uint256 shares) internal virtual {
        // Pull asset from caller.
        _safeTransferFrom(_asset, caller, address(this), assets);
        // Mint shares to receiver.
        _mint(receiver, shares);
        emit Deposit(caller, receiver, assets, shares);
    }

    /// @dev Burn `shares` from `owner`, send `assets` to `receiver`.
    function _withdraw(address caller, address receiver, address owner, uint256 assets, uint256 shares)
        internal
        virtual
    {
        // If caller is not the owner, consume allowance.
        if (caller != owner) {
            uint256 allowed = allowance[owner][caller];
            require(allowed >= shares, "GRC4626: allowance exceeded");
            if (allowed != type(uint256).max) {
                allowance[owner][caller] = allowed - shares;
            }
        }
        // Burn shares.
        _burn(owner, shares);
        // Send assets to receiver.
        _safeTransfer(_asset, receiver, assets);
        emit Withdraw(caller, receiver, owner, assets, shares);
    }

    /// @dev Raw GRC-20 balance of this vault.
    function _assetBalance() internal view returns (uint256) {
        (bool ok, bytes memory data) = _asset.staticcall(
            abi.encodeWithSelector(0x70a08231, address(this)) // balanceOf(address)
        );
        require(ok && data.length >= 32, "GRC4626: balanceOf failed");
        return abi.decode(data, (uint256));
    }

    /// @dev Safe transferFrom — reverts on failure.
    function _safeTransferFrom(address token, address from, address to, uint256 amount) internal {
        (bool ok, bytes memory data) = token.call(
            abi.encodeWithSelector(0x23b872dd, from, to, amount) // transferFrom(address,address,uint256)
        );
        require(ok && (data.length == 0 || abi.decode(data, (bool))), "GRC4626: transferFrom failed");
    }

    /// @dev Safe transfer — reverts on failure.
    function _safeTransfer(address token, address to, uint256 amount) internal {
        (bool ok, bytes memory data) = token.call(
            abi.encodeWithSelector(0xa9059cbb, to, amount) // transfer(address,uint256)
        );
        require(ok && (data.length == 0 || abi.decode(data, (bool))), "GRC4626: transfer failed");
    }

    /// @dev Integer division rounding up: ceil(a/b).
    function _divRoundUp(uint256 a, uint256 b) internal pure returns (uint256) {
        return (a + b - 1) / b;
    }
}
