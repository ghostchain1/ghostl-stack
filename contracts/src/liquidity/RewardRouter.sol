// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../common/Governed.sol";
import "../common/ReentrancyGuard.sol";
import "./IDexAdapter.sol";

interface IERC20Rewards {
    function transfer(address to, uint256 amount) external returns (bool);
}

interface IERC20Approve {
    function approve(address spender, uint256 amount) external returns (bool);
}

interface IBurnableERC20 {
    function burn(uint256 amount) external;
}

/// @notice Routes settled yield to POL, buyback+burn, and validator reward receivers.
contract RewardRouter is Governed, ReentrancyGuard {
    uint16 public constant BPS_DENOM = 10_000;
    address public constant DEAD = 0x000000000000000000000000000000000000dEaD;

    address public settlementOracle;
    address public gasToken;
    bool public paused;

    IDexAdapter public dexAdapter;
    bool public dexEnabled;
    uint16 public dexMaxSlippageBps = 300; // 3%

    address public polReceiver;
    address public burnReceiver;
    address public validatorReceiver;

    uint16 public polBps;
    uint16 public burnBps;
    uint16 public validatorBps;

    uint64 public splitDelaySeconds = 1 days;

    struct PendingConfig {
        address polReceiver;
        address burnReceiver;
        address validatorReceiver;
        uint16 polBps;
        uint16 burnBps;
        uint16 validatorBps;
        uint64 eta;
        bool exists;
    }

    PendingConfig public pending;

    struct PendingDexConfig {
        address adapter;
        bool enabled;
        uint16 maxSlippageBps;
        uint64 eta;
        bool exists;
    }

    PendingDexConfig public pendingDex;

    event OracleSet(address indexed oracle);
    event GasTokenSet(address indexed gasToken);
    event PausedSet(bool paused);
    event SplitDelaySet(uint64 delaySeconds);
    event ConfigQueued(
        address polReceiver,
        address burnReceiver,
        address validatorReceiver,
        uint16 polBps,
        uint16 burnBps,
        uint16 validatorBps,
        uint64 eta
    );
    event ConfigActivated(
        address polReceiver,
        address burnReceiver,
        address validatorReceiver,
        uint16 polBps,
        uint16 burnBps,
        uint16 validatorBps
    );
    event DexConfigQueued(address indexed adapter, bool enabled, uint16 maxSlippageBps, uint64 eta);
    event DexConfigActivated(address indexed adapter, bool enabled, uint16 maxSlippageBps);
    event YieldDistributed(address indexed asset, uint256 amount, uint256 polAmount, uint256 burnAmount, uint256 validatorAmount);
    event DexExecuted(address indexed assetIn, uint256 amountIn, uint256 polLpMinted, uint256 buybackGasOut);

    error Unauthorized();

    constructor(address governor_, address timelock_) Governed(governor_, timelock_) {}

    modifier onlyOracle() {
        if (msg.sender != settlementOracle) revert Unauthorized();
        _;
    }

    function setSettlementOracle(address oracle) external onlyGovernance {
        require(oracle != address(0), "oracle=0");
        settlementOracle = oracle;
        emit OracleSet(oracle);
    }

    function setGasToken(address gasToken_) external onlyGovernance {
        require(gasToken_ != address(0), "gasToken=0");
        gasToken = gasToken_;
        emit GasTokenSet(gasToken_);
    }

    function queueDexConfig(address adapter, bool enabled, uint16 maxSlippageBps) external onlyGovernance returns (uint64 eta) {
        if (enabled) {
            require(adapter != address(0), "adapter=0");
            require(maxSlippageBps <= BPS_DENOM, "slippage");
        }
        eta = uint64(block.timestamp + splitDelaySeconds);
        pendingDex = PendingDexConfig({
            adapter: adapter,
            enabled: enabled,
            maxSlippageBps: maxSlippageBps,
            eta: eta,
            exists: true
        });
        emit DexConfigQueued(adapter, enabled, maxSlippageBps, eta);
    }

    function activateDexConfig() external onlyGovernance {
        require(pendingDex.exists, "no pending");
        require(block.timestamp >= pendingDex.eta, "not ready");
        dexAdapter = IDexAdapter(pendingDex.adapter);
        dexEnabled = pendingDex.enabled;
        dexMaxSlippageBps = pendingDex.maxSlippageBps;
        delete pendingDex;
        emit DexConfigActivated(address(dexAdapter), dexEnabled, dexMaxSlippageBps);
    }

    function setPaused(bool paused_) external onlyGovernance {
        paused = paused_;
        emit PausedSet(paused_);
    }

    function setSplitDelaySeconds(uint64 delaySeconds) external onlyGovernance {
        require(delaySeconds != 0, "delay=0");
        splitDelaySeconds = delaySeconds;
        emit SplitDelaySet(delaySeconds);
    }

    /// #if_succeeds uint256(polBps_) + uint256(burnBps_) + uint256(validatorBps_) == BPS_DENOM;
    function queueConfig(
        address polReceiver_,
        address burnReceiver_,
        address validatorReceiver_,
        uint16 polBps_,
        uint16 burnBps_,
        uint16 validatorBps_
    ) external onlyGovernance returns (uint64 eta) {
        _validateConfig(polReceiver_, burnReceiver_, validatorReceiver_, polBps_, burnBps_, validatorBps_);
        eta = uint64(block.timestamp + splitDelaySeconds);
        pending = PendingConfig({
            polReceiver: polReceiver_,
            burnReceiver: burnReceiver_,
            validatorReceiver: validatorReceiver_,
            polBps: polBps_,
            burnBps: burnBps_,
            validatorBps: validatorBps_,
            eta: eta,
            exists: true
        });
        emit ConfigQueued(polReceiver_, burnReceiver_, validatorReceiver_, polBps_, burnBps_, validatorBps_, eta);
    }

    function activateConfig() external onlyGovernance {
        require(pending.exists, "no pending");
        require(block.timestamp >= pending.eta, "not ready");

        polReceiver = pending.polReceiver;
        burnReceiver = pending.burnReceiver;
        validatorReceiver = pending.validatorReceiver;
        polBps = pending.polBps;
        burnBps = pending.burnBps;
        validatorBps = pending.validatorBps;

        delete pending;
        emit ConfigActivated(polReceiver, burnReceiver, validatorReceiver, polBps, burnBps, validatorBps);
    }

    function distribute(address asset, uint256 amount) external payable onlyOracle nonReentrant {
        require(!paused, "paused");
        require(amount != 0, "amount=0");
        require(polReceiver != address(0), "polReceiver=0");
        require(validatorReceiver != address(0), "validatorReceiver=0");

        uint256 polAmount = (amount * polBps) / BPS_DENOM;
        uint256 burnAmount = (amount * burnBps) / BPS_DENOM;
        uint256 validatorAmount = amount - polAmount - burnAmount;

        if (asset == address(0)) {
            require(msg.value == amount, "value");
            _sendETH(polReceiver, polAmount);
            _sendETH(burnReceiver == address(0) ? DEAD : burnReceiver, burnAmount);
            _sendETH(validatorReceiver, validatorAmount);
        } else {
            require(msg.value == 0, "no value");
            uint256 lpMinted = 0;
            uint256 buybackGasOut = 0;

            if (dexEnabled && address(dexAdapter) != address(0) && gasToken != address(0) && asset != gasToken) {
                if (burnAmount != 0) {
                    _approve(asset, address(dexAdapter), burnAmount);
                    address burnDst = burnReceiver;
                    if (burnDst != address(0)) {
                        buybackGasOut = dexAdapter.swapExactIn(asset, gasToken, burnAmount, dexMaxSlippageBps, burnDst);
                    } else {
                        buybackGasOut = dexAdapter.swapExactIn(asset, gasToken, burnAmount, dexMaxSlippageBps, address(this));
                        _burnGasToken(buybackGasOut);
                    }
                }

                if (polAmount != 0) {
                    _approve(asset, address(dexAdapter), polAmount);
                    lpMinted = dexAdapter.provideLiquidityOneSided(asset, gasToken, polAmount, dexMaxSlippageBps, polReceiver);
                }
            } else {
                // Non-DEX path: forward assets directly.
                require(IERC20Rewards(asset).transfer(polReceiver, polAmount), "transfer pol");
                if (burnAmount != 0) {
                    address burnDst = burnReceiver;
                    if (burnDst != address(0)) {
                        require(IERC20Rewards(asset).transfer(burnDst, burnAmount), "transfer burn");
                    } else if (asset == gasToken) {
                        _burnGasToken(burnAmount);
                    } else {
                        require(IERC20Rewards(asset).transfer(DEAD, burnAmount), "transfer dead");
                    }
                }
            }

            require(IERC20Rewards(asset).transfer(validatorReceiver, validatorAmount), "transfer val");

            if (lpMinted != 0 || buybackGasOut != 0) {
                emit DexExecuted(asset, amount, lpMinted, buybackGasOut);
            }
        }

        emit YieldDistributed(asset, amount, polAmount, burnAmount, validatorAmount);
    }

    function _sendETH(address to, uint256 amount) internal {
        if (amount == 0) return;
        (bool ok, ) = payable(to).call{value: amount}("");
        require(ok, "eth send");
    }

    function _approve(address token, address spender, uint256 amount) internal {
        require(IERC20Approve(token).approve(spender, 0), "approve0");
        require(IERC20Approve(token).approve(spender, amount), "approve");
    }

    function _burnGasToken(uint256 amount) internal {
        if (amount == 0) return;
        address gas = gasToken;
        require(gas != address(0), "gasToken=0");
        // Try to burn gas token supply; fallback to dead address if token is not burnable.
        try IBurnableERC20(gas).burn(amount) {
            // burned
        } catch {
            require(IERC20Rewards(gas).transfer(DEAD, amount), "burn dead");
        }
    }

    function _validateConfig(
        address polReceiver_,
        address burnReceiver_,
        address validatorReceiver_,
        uint16 polBps_,
        uint16 burnBps_,
        uint16 validatorBps_
    ) internal pure {
        require(polReceiver_ != address(0), "polReceiver=0");
        burnReceiver_;
        require(validatorReceiver_ != address(0), "validatorReceiver=0");
        require(uint256(polBps_) + uint256(burnBps_) + uint256(validatorBps_) == BPS_DENOM, "bps sum");
    }

}
