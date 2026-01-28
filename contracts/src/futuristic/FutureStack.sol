// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../ERC20.sol";

error NotImplemented();

/// @notice Lightweight access control used across the futuristic stack.
contract AccessManaged {
    address public admin;
    mapping(bytes32 => mapping(address => bool)) internal roles;

    event AdminUpdated(address indexed admin);
    event RoleGranted(bytes32 indexed role, address indexed account, address indexed sender);
    event RoleRevoked(bytes32 indexed role, address indexed account, address indexed sender);

    modifier onlyAdmin() {
        require(msg.sender == admin, "not admin");
        _;
    }

    modifier onlyRole(bytes32 role) {
        require(hasRole(role, msg.sender), "missing role");
        _;
    }

    constructor(address admin_) {
        require(admin_ != address(0), "admin=0");
        admin = admin_;
        emit AdminUpdated(admin_);
    }

    function hasRole(bytes32 role, address account) public view returns (bool) {
        return account == admin || roles[role][account];
    }

    function grantRole(bytes32 role, address account) external onlyAdmin {
        roles[role][account] = true;
        emit RoleGranted(role, account, msg.sender);
    }

    function revokeRole(bytes32 role, address account) external onlyAdmin {
        roles[role][account] = false;
        emit RoleRevoked(role, account, msg.sender);
    }

    function transferAdmin(address newAdmin) external onlyAdmin {
        require(newAdmin != address(0), "admin=0");
        admin = newAdmin;
        emit AdminUpdated(newAdmin);
    }
}

/// @notice Pause switch used by several modules.
contract Pausable is AccessManaged {
    bool public paused;
    event Paused(address indexed by);
    event Unpaused(address indexed by);

    modifier whenNotPaused() {
        require(!paused, "paused");
        _;
    }

    constructor(address admin_) AccessManaged(admin_) {}

    function pause() external onlyAdmin {
        paused = true;
        emit Paused(msg.sender);
    }

    function unpause() external onlyAdmin {
        paused = false;
        emit Unpaused(msg.sender);
    }
}

// -------------------------------------------------------------------------
// 1. Core Chain & Consensus (V2 scaffolds avoid clashing with existing files)
// -------------------------------------------------------------------------

contract ValidatorRegistryV2 is AccessManaged {
    struct ValidatorMeta {
        uint256 stake;
        uint16 commissionBps;
        bytes metadata;
        bool active;
        bool jailed;
    }

    address[] public validators;
    mapping(address => ValidatorMeta) public validatorMeta;

    event ValidatorAdded(address indexed validator, uint256 stake, uint16 commissionBps, bytes metadata);
    event ValidatorRemoved(address indexed validator);
    event ValidatorJailed(address indexed validator, bool jailed);
    event CommissionUpdated(address indexed validator, uint16 commissionBps);

    constructor(address admin_) AccessManaged(admin_) {}

    function registerValidator(address validator, uint256 stake, uint16 commissionBps, bytes calldata metadata) external onlyAdmin {
        if (validatorMeta[validator].stake != 0) return;
        validators.push(validator);
        validatorMeta[validator] = ValidatorMeta(stake, commissionBps, metadata, true, false);
        emit ValidatorAdded(validator, stake, commissionBps, metadata);
    }

    function removeValidator(address validator) external onlyAdmin {
        if (validatorMeta[validator].stake == 0) return;
        delete validatorMeta[validator];
        emit ValidatorRemoved(validator);
    }

    function setJailed(address validator, bool jailed) external onlyAdmin {
        ValidatorMeta storage meta = validatorMeta[validator];
        meta.jailed = jailed;
        emit ValidatorJailed(validator, jailed);
    }

    function setCommission(address validator, uint16 commissionBps) external onlyAdmin {
        validatorMeta[validator].commissionBps = commissionBps;
        emit CommissionUpdated(validator, commissionBps);
    }

    function validatorCount() external view returns (uint256) {
        return validators.length;
    }
}

contract StakingManagerV2 is AccessManaged {
    struct Pool {
        uint256 totalStake; // amount of native asset backing the pool
        uint256 totalShares; // share accounting to keep slashes proportional
    }

    struct Unbonding {
        uint256 amount;
        uint64 releaseTime;
    }

    mapping(address => Pool) public pools; // validator => pool
    mapping(address => mapping(address => uint256)) public shares; // validator => staker => shares
    mapping(address => mapping(address => Unbonding[])) public unbondings; // validator => staker => unbonding entries
    mapping(address => bool) public jailed;
    uint64 public unbondingPeriod; // seconds, default 0 for dev
    uint256 public minStakeAmount;
    address public slashManager;
    address payable public treasury;

    event StakeDelegated(address indexed staker, address indexed validator, uint256 amount, uint256 mintedShares);
    event StakeWithdrawn(address indexed staker, address indexed validator, uint256 burnedShares, uint256 amountReturned);
    event UnbondingRequested(address indexed staker, address indexed validator, uint256 amount, uint64 releaseTime);
    event UnbondingClaimed(address indexed staker, address indexed validator, uint256 amount);
    event SlashManagerUpdated(address indexed slashManager);
    event Jailed(address indexed validator, bool jailed);
    event ParamsUpdated(uint64 unbondingPeriod, uint256 minStakeAmount);

    constructor(address admin_, address payable treasury_) AccessManaged(admin_) {
        treasury = treasury_;
    }

    function setSlashManager(address slashManager_) external onlyAdmin {
        slashManager = slashManager_;
        emit SlashManagerUpdated(slashManager_);
    }

    function delegateStake(address validator) external payable {
        require(msg.value > 0, "amount=0");
        require(!jailed[validator], "validator jailed");
        if (minStakeAmount > 0 && pools[validator].totalStake == 0) {
            require(msg.value >= minStakeAmount, "below min stake");
        }
        Pool storage pool = pools[validator];
        uint256 mintedShares = _previewMintedShares(pool, msg.value);
        pool.totalStake += msg.value;
        pool.totalShares += mintedShares;
        shares[validator][msg.sender] += mintedShares;
        emit StakeDelegated(msg.sender, validator, msg.value, mintedShares);
    }

    function withdrawStake(address validator, uint256 shareAmount, address payable to) external {
        if (unbondingPeriod > 0) {
            revert("use unbond");
        }
        Pool storage pool = pools[validator];
        uint256 userShares = shares[validator][msg.sender];
        require(shareAmount > 0 && shareAmount <= userShares, "invalid shares");
        uint256 amountOut = (shareAmount * pool.totalStake) / pool.totalShares;
        shares[validator][msg.sender] = userShares - shareAmount;
        pool.totalShares -= shareAmount;
        pool.totalStake -= amountOut;
        require(address(this).balance >= amountOut, "insufficient backing");
        to.transfer(amountOut);
        emit StakeWithdrawn(msg.sender, validator, shareAmount, amountOut);
    }

    function requestUnbond(address validator, uint256 shareAmount) external {
        require(unbondingPeriod > 0, "withdraw direct");
        Pool storage pool = pools[validator];
        uint256 userShares = shares[validator][msg.sender];
        require(shareAmount > 0 && shareAmount <= userShares, "invalid shares");
        uint256 amountOut = (shareAmount * pool.totalStake) / pool.totalShares;
        shares[validator][msg.sender] = userShares - shareAmount;
        pool.totalShares -= shareAmount;
        pool.totalStake -= amountOut;
        uint64 releaseTime = uint64(block.timestamp + unbondingPeriod);
        unbondings[validator][msg.sender].push(Unbonding(amountOut, releaseTime));
        emit UnbondingRequested(msg.sender, validator, amountOut, releaseTime);
    }

    function claimUnbonded(address validator, uint256 index, address payable to) external {
        Unbonding[] storage list = unbondings[validator][msg.sender];
        require(index < list.length, "bad index");
        Unbonding memory ub = list[index];
        require(block.timestamp >= ub.releaseTime, "not released");
        uint256 amount = ub.amount;
        list[index] = list[list.length - 1];
        list.pop();
        require(address(this).balance >= amount, "insufficient");
        to.transfer(amount);
        emit UnbondingClaimed(msg.sender, validator, amount);
    }

    function previewWithdraw(address validator, uint256 shareAmount) external view returns (uint256) {
        Pool memory pool = pools[validator];
        if (shareAmount == 0 || pool.totalShares == 0) return 0;
        return (shareAmount * pool.totalStake) / pool.totalShares;
    }

    function slashStake(address validator, uint256 amount, address payable recipient) external {
        require(msg.sender == slashManager || msg.sender == admin, "not slasher");
        Pool storage pool = pools[validator];
        require(pool.totalStake >= amount, "insufficient stake");
        pool.totalStake -= amount;
        if (recipient == address(0)) {
            recipient = treasury;
        }
        require(address(this).balance >= amount, "insufficient backing");
        recipient.transfer(amount);
    }

    function _previewMintedShares(Pool memory pool, uint256 amount) internal pure returns (uint256) {
        if (pool.totalShares == 0 || pool.totalStake == 0) {
            return amount;
        }
        return (amount * pool.totalShares) / pool.totalStake;
    }

    function setJail(address validator, bool jail_) external {
        require(msg.sender == slashManager || msg.sender == admin, "not allowed");
        jailed[validator] = jail_;
        emit Jailed(validator, jail_);
    }

    function setParams(uint64 unbondingPeriod_, uint256 minStakeAmount_) external onlyAdmin {
        unbondingPeriod = unbondingPeriod_;
        minStakeAmount = minStakeAmount_;
        emit ParamsUpdated(unbondingPeriod_, minStakeAmount_);
    }
}

contract SlashingManagerV2 is AccessManaged {
    mapping(address => uint256) public penalties;
    StakingManagerV2 public staking;

    enum SlashType {
        DoubleSign,
        Surround,
        Downtime
    }

    uint256 public downtimeSlashBps; // relative to validator pool stake

    event ParamsSet(uint256 downtimeSlashBps);
    event Slashed(address indexed validator, uint256 amount, SlashType slashType, string reason);

    constructor(address admin_, StakingManagerV2 staking_) AccessManaged(admin_) {
        staking = staking_;
    }

    function slash(address validator, uint256 amount, string calldata reason) external onlyAdmin {
        penalties[validator] += amount;
        staking.slashStake(validator, amount, payable(address(0)));
        emit Slashed(validator, amount, SlashType.DoubleSign, reason);
    }

    function slashWithType(address validator, uint256 amount, SlashType slashType, string calldata reason) external onlyAdmin {
        penalties[validator] += amount;
        staking.slashStake(validator, amount, payable(address(0)));
        if (slashType == SlashType.Downtime) {
            staking.setJail(validator, true);
        }
        emit Slashed(validator, amount, slashType, reason);
    }

    function slashDowntime(address validator, string calldata reason) external onlyAdmin {
        (uint256 poolStake, uint256 poolShares) = staking.pools(validator);
        require(poolShares > 0, "empty pool");
        uint256 amount = (poolStake * downtimeSlashBps) / 10_000;
        penalties[validator] += amount;
        staking.slashStake(validator, amount, payable(address(0)));
        staking.setJail(validator, true);
        emit Slashed(validator, amount, SlashType.Downtime, reason);
    }

    function setParams(uint256 downtimeSlashBps_) external onlyAdmin {
        downtimeSlashBps = downtimeSlashBps_;
        emit ParamsSet(downtimeSlashBps_);
    }
}

interface ITreasuryV2 {
    function withdraw(address payable to, uint256 amount) external;
}

contract RewardDistributorV2 is AccessManaged {
    mapping(address => uint256) public accrued;
    ITreasuryV2 public treasury;

    event RewardAccrued(address indexed validator, uint256 amount);
    event RewardClaimed(address indexed validator, address indexed to, uint256 amount);

    constructor(address admin_, ITreasuryV2 treasury_) AccessManaged(admin_) {
        treasury = treasury_;
    }

    function depositReward(address validator) external payable {
        accrued[validator] += msg.value;
        emit RewardAccrued(validator, msg.value);
    }

    function pullFromTreasury(address validator, uint256 amount) external onlyAdmin {
        treasury.withdraw(payable(address(this)), amount);
        accrued[validator] += amount;
        emit RewardAccrued(validator, amount);
    }

    function claim(address validator, address payable to) external {
        uint256 amount = accrued[validator];
        require(amount > 0, "nothing to claim");
        accrued[validator] = 0;
        require(address(this).balance >= amount, "insufficient");
        to.transfer(amount);
        emit RewardClaimed(validator, to, amount);
    }
}

contract EpochManager is AccessManaged {
    uint64 public currentEpoch;
    bytes32 public lastCheckpoint;
    uint64 public epochLength;
    uint64 public slotTimeSeconds;
    uint256 public maxValidators;

    event EpochAdvanced(uint64 indexed newEpoch, bytes32 indexed checkpoint);
    event EpochParamsUpdated(uint64 epochLength, uint64 slotTimeSeconds, uint256 maxValidators);

    constructor(address admin_) AccessManaged(admin_) {}

    function advance(bytes32 checkpoint) external onlyAdmin {
        currentEpoch += 1;
        lastCheckpoint = checkpoint;
        emit EpochAdvanced(currentEpoch, checkpoint);
    }

    function setParams(uint64 epochLength_, uint64 slotTimeSeconds_, uint256 maxValidators_) external onlyAdmin {
        epochLength = epochLength_;
        slotTimeSeconds = slotTimeSeconds_;
        maxValidators = maxValidators_;
        emit EpochParamsUpdated(epochLength_, slotTimeSeconds_, maxValidators_);
    }
}

contract ConsensusParams is AccessManaged {
    mapping(bytes32 => uint256) public uintParams;
    mapping(bytes32 => bytes32) public bytesParams;

    event ConsensusParamUpdated(bytes32 indexed key, bytes32 rawValue);

    constructor(address admin_) AccessManaged(admin_) {}

    function setUint(bytes32 key, uint256 value) external onlyAdmin {
        uintParams[key] = value;
        emit ConsensusParamUpdated(key, bytes32(value));
    }

    function setBytes(bytes32 key, bytes32 value) external onlyAdmin {
        bytesParams[key] = value;
        emit ConsensusParamUpdated(key, value);
    }
}

contract GenesisConfigV2 is AccessManaged {
    bytes32 public genesisHash;
    bytes public rawConfig;

    event GenesisConfigured(bytes32 indexed hash, bytes config);

    constructor(address admin_, bytes32 genesisHash_, bytes memory config_) AccessManaged(admin_) {
        genesisHash = genesisHash_;
        rawConfig = config_;
        emit GenesisConfigured(genesisHash_, config_);
    }

    function updateConfig(bytes32 hash, bytes calldata config) external onlyAdmin {
        genesisHash = hash;
        rawConfig = config;
        emit GenesisConfigured(hash, config);
    }
}

contract ChainConfigV2 is AccessManaged {
    mapping(bytes32 => bytes) public config;
    event ChainConfigUpdated(bytes32 indexed key, bytes value);

    constructor(address admin_) AccessManaged(admin_) {}

    function setConfig(bytes32 key, bytes calldata value) external onlyAdmin {
        config[key] = value;
        emit ChainConfigUpdated(key, value);
    }
}

/// @notice Execution layer config for VM + gas model + precompile registry.
contract ExecutionConfigV2 is AccessManaged {
    uint256 public chainId;
    uint256 public blockGasLimit;
    uint256 public baseFee;
    uint256 public elasticityMultiplier;
    uint256 public baseFeeMaxChangeDenominator;
    address[] public precompiles;
    mapping(address => bool) public isPrecompile;

    event GasModelUpdated(
        uint256 chainId,
        uint256 blockGasLimit,
        uint256 baseFee,
        uint256 elasticityMultiplier,
        uint256 baseFeeMaxChangeDenominator
    );
    event PrecompilesUpdated(address[] precompiles);

    constructor(address admin_, uint256 chainId_, uint256 blockGasLimit_) AccessManaged(admin_) {
        chainId = chainId_;
        blockGasLimit = blockGasLimit_;
        emit GasModelUpdated(chainId_, blockGasLimit_, 0, 0, 0);
    }

    function setGasModel(
        uint256 chainId_,
        uint256 blockGasLimit_,
        uint256 baseFee_,
        uint256 elasticityMultiplier_,
        uint256 baseFeeMaxChangeDenominator_
    ) external onlyAdmin {
        chainId = chainId_;
        blockGasLimit = blockGasLimit_;
        baseFee = baseFee_;
        elasticityMultiplier = elasticityMultiplier_;
        baseFeeMaxChangeDenominator = baseFeeMaxChangeDenominator_;
        emit GasModelUpdated(chainId_, blockGasLimit_, baseFee_, elasticityMultiplier_, baseFeeMaxChangeDenominator_);
    }

    function setPrecompiles(address[] calldata newPrecompiles) external onlyAdmin {
        for (uint256 i = 0; i < precompiles.length; i++) {
            isPrecompile[precompiles[i]] = false;
        }
        delete precompiles;
        for (uint256 i = 0; i < newPrecompiles.length; i++) {
            address addr = newPrecompiles[i];
            precompiles.push(addr);
            isPrecompile[addr] = true;
        }
        emit PrecompilesUpdated(newPrecompiles);
    }

    function precompileCount() external view returns (uint256) {
        return precompiles.length;
    }
}

contract UpgradeManagerV2 is AccessManaged {
    struct UpgradePlan {
        bytes32 versionHash;
        uint64 eta;
        bool executed;
    }

    mapping(bytes32 => UpgradePlan) public upgrades;

    event UpgradeScheduled(bytes32 indexed id, bytes32 versionHash, uint64 eta);
    event UpgradeExecuted(bytes32 indexed id, bytes32 versionHash);

    constructor(address admin_) AccessManaged(admin_) {}

    function schedule(bytes32 id, bytes32 versionHash, uint64 eta) external onlyAdmin {
        upgrades[id] = UpgradePlan(versionHash, eta, false);
        emit UpgradeScheduled(id, versionHash, eta);
    }

    function markExecuted(bytes32 id) external onlyAdmin {
        UpgradePlan storage plan = upgrades[id];
        plan.executed = true;
        emit UpgradeExecuted(id, plan.versionHash);
    }
}

contract PauseGuardianV2 is Pausable {
    constructor(address admin_) Pausable(admin_) {}

    function guardedCall(address target, bytes calldata data) external onlyAdmin whenNotPaused returns (bytes memory) {
        (bool ok, bytes memory result) = target.call(data);
        require(ok, "call failed");
        return result;
    }
}

// --------------------------------------------------
// 2. Native Token & Monetary Stability (new modules)
// --------------------------------------------------

interface IMintableToken {
    function mint(address to, uint256 amount) external;
}

interface IBurnableToken {
    function burn(address from, uint256 amount) external;
}

contract NativeTokenV2 is AccessManaged, ERC20 {
    constructor(address admin_) AccessManaged(admin_) ERC20("Futuristic Native Token", "GASX", 18) {}

    function mint(address to, uint256 amount) external onlyAdmin {
        _mint(to, amount);
    }

    function burn(address from, uint256 amount) external onlyAdmin {
        _burn(from, amount);
    }
}

contract WrappedNative is ERC20 {
    event Deposited(address indexed from, uint256 amount);
    event Withdrawn(address indexed to, uint256 amount);

    constructor() ERC20("Wrapped Native Token", "WNATIVE", 18) {}

    receive() external payable {
        _mint(msg.sender, msg.value);
        emit Deposited(msg.sender, msg.value);
    }

    function deposit() external payable {
        _mint(msg.sender, msg.value);
        emit Deposited(msg.sender, msg.value);
    }

    function withdraw(uint256 amount) external {
        _burn(msg.sender, amount);
        payable(msg.sender).transfer(amount);
        emit Withdrawn(msg.sender, amount);
    }
}

contract MintController is AccessManaged {
    IMintableToken public token;
    mapping(address => bool) public minters;

    event MinterUpdated(address indexed minter, bool allowed);
    event Minted(address indexed minter, address indexed to, uint256 amount);

    constructor(address admin_, IMintableToken token_) AccessManaged(admin_) {
        token = token_;
    }

    function setMinter(address minter, bool allowed) external onlyAdmin {
        minters[minter] = allowed;
        emit MinterUpdated(minter, allowed);
    }

    function controlledMint(address to, uint256 amount) external {
        require(minters[msg.sender], "minter");
        token.mint(to, amount);
        emit Minted(msg.sender, to, amount);
    }
}

contract BurnController is AccessManaged {
    IBurnableToken public token;
    mapping(address => bool) public burners;

    event BurnerUpdated(address indexed burner, bool allowed);
    event Burned(address indexed burner, address indexed from, uint256 amount);

    constructor(address admin_, IBurnableToken token_) AccessManaged(admin_) {
        token = token_;
    }

    function setBurner(address burner, bool allowed) external onlyAdmin {
        burners[burner] = allowed;
        emit BurnerUpdated(burner, allowed);
    }

    function controlledBurn(address from, uint256 amount) external {
        require(burners[msg.sender], "burner");
        token.burn(from, amount);
        emit Burned(msg.sender, from, amount);
    }
}

contract FeeMarketV2 is AccessManaged {
    uint256 public baseFee;
    uint256 public priorityFee;
    uint256 public targetGasPerBlock;
    uint256 public adjustmentFactorBps; // bounded change per block in basis points of baseFee

    event FeeUpdated(uint256 baseFee, uint256 priorityFee);

    constructor(
        address admin_,
        uint256 baseFee_,
        uint256 priorityFee_,
        uint256 targetGasPerBlock_,
        uint256 adjustmentFactorBps_
    ) AccessManaged(admin_) {
        baseFee = baseFee_;
        priorityFee = priorityFee_;
        targetGasPerBlock = targetGasPerBlock_;
        adjustmentFactorBps = adjustmentFactorBps_;
        emit FeeUpdated(baseFee_, priorityFee_);
    }

    function setPriorityFee(uint256 newPriorityFee) external onlyAdmin {
        priorityFee = newPriorityFee;
        emit FeeUpdated(baseFee, newPriorityFee);
    }

    function updateBaseFee(uint256 gasUsed) external onlyAdmin {
        if (targetGasPerBlock == 0) return;
        int256 delta = int256(gasUsed) - int256(targetGasPerBlock);
        int256 change = (int256(baseFee) * int256(adjustmentFactorBps) * delta) /
            int256(targetGasPerBlock * 10_000);
        int256 updated = int256(baseFee) + change;
        if (updated < 0) {
            baseFee = 0;
        } else {
            baseFee = uint256(updated);
        }
        emit FeeUpdated(baseFee, priorityFee);
    }

    function quote(uint256 gasUsed) external view returns (uint256) {
        return gasUsed * (baseFee + priorityFee);
    }
}

contract BaseFeeOracle is AccessManaged {
    uint256 public latestBaseFee;
    event BaseFeeUpdated(uint256 baseFee);

    constructor(address admin_) AccessManaged(admin_) {}

    function pushBaseFee(uint256 baseFee) external onlyAdmin {
        latestBaseFee = baseFee;
        emit BaseFeeUpdated(baseFee);
    }
}

interface IERC20Minimal {
    function transfer(address to, uint256 amount) external returns (bool);

    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

contract TreasuryV2 is AccessManaged {
    event Deposit(address indexed from, uint256 amount);
    event Withdraw(address indexed to, uint256 amount);
    event TokenWithdraw(address indexed token, address indexed to, uint256 amount);

    constructor(address admin_) AccessManaged(admin_) {}

    receive() external payable {
        emit Deposit(msg.sender, msg.value);
    }

    function withdraw(address payable to, uint256 amount) public onlyAdmin {
        require(address(this).balance >= amount, "insufficient");
        to.transfer(amount);
        emit Withdraw(to, amount);
    }

    function withdrawToken(address token, address to, uint256 amount) external onlyAdmin {
        require(IERC20Minimal(token).transfer(to, amount), "transfer failed");
        emit TokenWithdraw(token, to, amount);
    }
}

contract EmissionController is AccessManaged {
    uint256 public emissionRatePerEpoch;
    event EmissionRateUpdated(uint256 rate);

    constructor(address admin_, uint256 rate) AccessManaged(admin_) {
        emissionRatePerEpoch = rate;
    }

    function setEmissionRate(uint256 rate) external onlyAdmin {
        emissionRatePerEpoch = rate;
        emit EmissionRateUpdated(rate);
    }
}

// -----------------------------------------------
// 3. Stablecoin System (hybrid + AI-friendly stubs)
// -----------------------------------------------

contract Stablecoin is AccessManaged, ERC20 {
    mapping(address => bool) public minters;
    mapping(address => bool) public burners;

    event Minted(address indexed to, uint256 amount);
    event Burned(address indexed from, uint256 amount);
    event MinterUpdated(address indexed minter, bool allowed);
    event BurnerUpdated(address indexed burner, bool allowed);

    constructor(address admin_) AccessManaged(admin_) ERC20("Ghost Synthetic Dollar", "GSD", 18) {}

    function setMinter(address minter, bool allowed) external onlyAdmin {
        minters[minter] = allowed;
        emit MinterUpdated(minter, allowed);
    }

    function setBurner(address burner, bool allowed) external onlyAdmin {
        burners[burner] = allowed;
        emit BurnerUpdated(burner, allowed);
    }

    function mint(address to, uint256 amount) external {
        require(minters[msg.sender] || msg.sender == admin, "not minter");
        _mint(to, amount);
        emit Minted(to, amount);
    }

    function burn(address from, uint256 amount) external {
        require(burners[msg.sender] || msg.sender == admin, "not burner");
        _burn(from, amount);
        emit Burned(from, amount);
    }

    function burnSelf(uint256 amount) external {
        _burn(msg.sender, amount);
        emit Burned(msg.sender, amount);
    }
}

contract CollateralVault is AccessManaged {
    mapping(address => mapping(address => uint256)) public collateral; // asset => user => amount
    mapping(address => uint256) public totalCollateral;
    mapping(address => bool) public isAllowedCollateral;
    address public controller;

    event Deposited(address indexed asset, address indexed user, uint256 amount);
    event Withdrawn(address indexed asset, address indexed user, uint256 amount);
    event ControllerUpdated(address indexed controller);
    event CollateralAssetUpdated(address indexed asset, bool allowed);

    constructor(address admin_) AccessManaged(admin_) {}

    modifier onlyController() {
        require(msg.sender == controller, "not controller");
        _;
    }

    function setController(address controller_) external onlyAdmin {
        controller = controller_;
        emit ControllerUpdated(controller_);
    }

    function setCollateralAsset(address asset, bool allowed) external onlyAdmin {
        isAllowedCollateral[asset] = allowed;
        emit CollateralAssetUpdated(asset, allowed);
    }

    function deposit(address asset, uint256 amount) external {
        require(isAllowedCollateral[asset], "asset not allowed");
        require(amount > 0, "amount=0");
        require(IERC20Minimal(asset).transferFrom(msg.sender, address(this), amount), "transfer failed");
        collateral[asset][msg.sender] += amount;
        totalCollateral[asset] += amount;
        emit Deposited(asset, msg.sender, amount);
    }

    function withdraw(address asset, uint256 amount) external {
        _withdraw(asset, msg.sender, msg.sender, amount);
    }

    function consume(address asset, address owner, address recipient, uint256 amount) external onlyController {
        _withdraw(asset, owner, recipient, amount);
    }

    function moveCollateral(address asset, address from, address to, uint256 amount) external onlyController {
        require(isAllowedCollateral[asset], "asset not allowed");
        uint256 bal = collateral[asset][from];
        require(bal >= amount, "insufficient");
        collateral[asset][from] = bal - amount;
        collateral[asset][to] += amount;
    }

    function _withdraw(address asset, address owner, address recipient, uint256 amount) internal {
        require(isAllowedCollateral[asset], "asset not allowed");
        uint256 bal = collateral[asset][owner];
        require(bal >= amount, "insufficient");
        collateral[asset][owner] = bal - amount;
        totalCollateral[asset] -= amount;
        require(IERC20Minimal(asset).transfer(recipient, amount), "transfer failed");
        emit Withdrawn(asset, owner, amount);
    }
}

contract PriceOracleRouter is AccessManaged {
    mapping(bytes32 => uint256) public prices;
    event PriceUpdated(bytes32 indexed assetId, uint256 price);

    constructor(address admin_) AccessManaged(admin_) {}

    function setPrice(bytes32 assetId, uint256 price) external onlyAdmin {
        prices[assetId] = price;
        emit PriceUpdated(assetId, price);
    }
}

contract PegStabilityModule is AccessManaged {
    Stablecoin public stable;
    address public collateralAsset;
    uint256 public feeBps;

    event SwappedForStable(address indexed user, uint256 collateralIn, uint256 stableOut);
    event SwappedForCollateral(address indexed user, uint256 stableIn, uint256 collateralOut);
    event FeeUpdated(uint256 feeBps);

    constructor(address admin_, Stablecoin stable_, address collateralAsset_, uint256 feeBps_) AccessManaged(admin_) {
        stable = stable_;
        collateralAsset = collateralAsset_;
        feeBps = feeBps_;
    }

    function setFee(uint256 feeBps_) external onlyAdmin {
        feeBps = feeBps_;
        emit FeeUpdated(feeBps_);
    }

    function swapCollateralForStable(uint256 collateralIn, uint256 stableOut) external {
        require(IERC20Minimal(collateralAsset).transferFrom(msg.sender, address(this), collateralIn), "transfer failed");
        uint256 fee = (collateralIn * feeBps) / 10_000;
        uint256 netCollateral = collateralIn - fee;
        require(netCollateral >= stableOut, "slippage");
        stable.mint(msg.sender, stableOut);
        emit SwappedForStable(msg.sender, collateralIn, stableOut);
    }

    function swapStableForCollateral(uint256 stableIn, uint256 collateralOut) external {
        stable.burn(msg.sender, stableIn);
        require(IERC20Minimal(collateralAsset).transfer(msg.sender, collateralOut), "transfer failed");
        emit SwappedForCollateral(msg.sender, stableIn, collateralOut);
    }
}

contract AIMonetaryPolicy is AccessManaged {
    int256 public policySignal;
    string public modelRef;

    event PolicySignalUpdated(int256 signal, string modelRef);

    constructor(address admin_, string memory modelRef_) AccessManaged(admin_) {
        modelRef = modelRef_;
    }

    function pushSignal(int256 signal, string calldata ref) external onlyAdmin {
        policySignal = signal;
        modelRef = ref;
        emit PolicySignalUpdated(signal, ref);
    }
}

contract VolatilityController is AccessManaged {
    uint256 public maxVolatilityBps;
    event VolatilityBoundSet(uint256 bps);

    constructor(address admin_, uint256 maxVolatilityBps_) AccessManaged(admin_) {
        maxVolatilityBps = maxVolatilityBps_;
    }

    function setBound(uint256 bps) external onlyAdmin {
        maxVolatilityBps = bps;
        emit VolatilityBoundSet(bps);
    }
}

contract CircuitBreaker is Pausable {
    event CircuitTripped(address indexed by, string reason);

    constructor(address admin_) Pausable(admin_) {}

    function trip(string calldata reason) external onlyAdmin {
        paused = true;
        emit CircuitTripped(msg.sender, reason);
    }
}

contract StablecoinController is AccessManaged {
    Stablecoin public stable;
    CollateralVault public vault;
    PriceOracleRouter public oracle;
    uint256 public minCollateralRatioBps; // e.g., 15000 = 150%

    event Minted(address indexed user, address indexed collateralAsset, uint256 collateralUsed, uint256 stableMinted);
    event Repaid(address indexed user, address indexed collateralAsset, uint256 stableBurned, uint256 collateralReleased);
    event MinCollateralRatioUpdated(uint256 ratioBps);

    constructor(
        address admin_,
        Stablecoin stable_,
        CollateralVault vault_,
        PriceOracleRouter oracle_,
        uint256 minCollateralRatioBps_
    ) AccessManaged(admin_) {
        stable = stable_;
        vault = vault_;
        oracle = oracle_;
        minCollateralRatioBps = minCollateralRatioBps_;
    }

    function setMinCollateralRatio(uint256 ratioBps) external onlyAdmin {
        minCollateralRatioBps = ratioBps;
        emit MinCollateralRatioUpdated(ratioBps);
    }

    function mintAgainstCollateral(address collateralAsset, uint256 collateralAmount, uint256 stableAmount) external {
        bytes32 assetId = keccak256(abi.encodePacked(collateralAsset));
        uint256 price = oracle.prices(assetId);
        require(price > 0, "price missing");
        // collateral value scaled to basis points (1e4) to match ratio math
        uint256 collateralValueBps = (collateralAmount * price) / 1e14;
        require(collateralValueBps >= stableAmount * minCollateralRatioBps, "undercollateralized");
        vault.moveCollateral(collateralAsset, msg.sender, address(this), collateralAmount);
        stable.mint(msg.sender, stableAmount);
        emit Minted(msg.sender, collateralAsset, collateralAmount, stableAmount);
    }

    function repay(address collateralAsset, uint256 stableAmount, uint256 collateralToRelease) external {
        stable.burn(msg.sender, stableAmount);
        vault.moveCollateral(collateralAsset, address(this), msg.sender, collateralToRelease);
        emit Repaid(msg.sender, collateralAsset, stableAmount, collateralToRelease);
    }
}

// -----------------------------------
// 4. Cross-Chain & Bridge Contracts
// -----------------------------------

contract CrossChainMessenger is AccessManaged {
    uint256 public messageNonce;

    event MessageSent(uint256 indexed nonce, address indexed target, bytes data, uint256 gasLimit);
    event MessageRelayed(uint256 indexed nonce, address indexed fromChain, bool success);

    constructor(address admin_) AccessManaged(admin_) {}

    function sendMessage(address target, bytes calldata data, uint256 gasLimit) external onlyAdmin returns (uint256) {
        messageNonce += 1;
        emit MessageSent(messageNonce, target, data, gasLimit);
        return messageNonce;
    }

    function relayMessage(uint256 nonce, address fromChain, bool success) external onlyAdmin {
        emit MessageRelayed(nonce, fromChain, success);
    }
}

contract StateCommitmentChain is AccessManaged {
    struct Commitment {
        bytes32 stateRoot;
        uint256 timestamp;
    }

    Commitment[] public commitments;
    event StateCommitted(uint256 indexed index, bytes32 stateRoot, uint256 timestamp);

    constructor(address admin_) AccessManaged(admin_) {}

    function appendState(bytes32 stateRoot) external onlyAdmin {
        commitments.push(Commitment(stateRoot, block.timestamp));
        emit StateCommitted(commitments.length - 1, stateRoot, block.timestamp);
    }
}

contract BridgeRouter is AccessManaged {
    mapping(uint256 => address) public tokenBridges; // chainId => bridge
    event BridgeRegistered(uint256 indexed chainId, address bridge);

    constructor(address admin_) AccessManaged(admin_) {}

    function registerBridge(uint256 chainId, address bridge) external onlyAdmin {
        tokenBridges[chainId] = bridge;
        emit BridgeRegistered(chainId, bridge);
    }
}

// slither-disable-next-line erc20-interface
interface IERC721Minimal {
    function transferFrom(address from, address to, uint256 tokenId) external;
}

contract TokenBridge is AccessManaged {
    uint256 public lastDepositId;
    mapping(bytes32 => bool) public processedMessages;

    event DepositInitiated(
        uint256 indexed depositId,
        address indexed token,
        address indexed from,
        address to,
        uint256 amount,
        uint256 targetChainId
    );
    event WithdrawalFinalized(bytes32 indexed messageId, address indexed token, address indexed to, uint256 amount, uint256 sourceChainId);

    constructor(address admin_) AccessManaged(admin_) {}

    function deposit(address token, address to, uint256 amount, uint256 targetChainId) external {
        require(amount > 0, "amount=0");
        require(IERC20Minimal(token).transferFrom(msg.sender, address(this), amount), "transfer failed");
        lastDepositId += 1;
        emit DepositInitiated(lastDepositId, token, msg.sender, to, amount, targetChainId);
    }

    function finalizeWithdrawal(
        bytes32 messageId,
        address token,
        address to,
        uint256 amount,
        uint256 sourceChainId
    ) external onlyAdmin {
        require(!processedMessages[messageId], "processed");
        processedMessages[messageId] = true;
        require(IERC20Minimal(token).transfer(to, amount), "transfer failed");
        emit WithdrawalFinalized(messageId, token, to, amount, sourceChainId);
    }
}

contract NFTBridge is AccessManaged {
    uint256 public lastDepositId;
    mapping(bytes32 => bool) public processedMessages;

    event NFTDeposit(
        uint256 indexed depositId,
        address indexed token,
        uint256 indexed tokenId,
        address to,
        uint256 targetChainId
    );
    event NFTWithdrawal(bytes32 indexed messageId, address indexed token, uint256 indexed tokenId, address to, uint256 sourceChainId);

    constructor(address admin_) AccessManaged(admin_) {}

    function deposit(address token, uint256 tokenId, address to, uint256 targetChainId) external {
        IERC721Minimal(token).transferFrom(msg.sender, address(this), tokenId);
        lastDepositId += 1;
        emit NFTDeposit(lastDepositId, token, tokenId, to, targetChainId);
    }

    function finalizeWithdrawal(
        bytes32 messageId,
        address token,
        uint256 tokenId,
        address to,
        uint256 sourceChainId
    ) external onlyAdmin {
        require(!processedMessages[messageId], "processed");
        processedMessages[messageId] = true;
        IERC721Minimal(token).transferFrom(address(this), to, tokenId);
        emit NFTWithdrawal(messageId, token, tokenId, to, sourceChainId);
    }
}

contract MerkleProofVerifier {
    function verify(bytes32 leaf, bytes32[] calldata proof, bytes32 root) external pure returns (bool) {
        bytes32 computed = leaf;
        for (uint256 i = 0; i < proof.length; i++) {
            bytes32 sibling = proof[i];
            if (computed <= sibling) {
                computed = keccak256(abi.encodePacked(computed, sibling));
            } else {
                computed = keccak256(abi.encodePacked(sibling, computed));
            }
        }
        return computed == root;
    }
}

contract ZKProofVerifier {
    event ProofSubmitted(bytes proof);

    function verify(bytes calldata proof, bytes calldata publicInputs) external returns (bool) {
        emit ProofSubmitted(proof);
        publicInputs;
        return false;
    }
}

contract FraudProofVerifier is AccessManaged {
    event FraudProofSubmitted(address indexed challenger, bytes proofData);
    event FraudResolved(address indexed challenger, bool valid);

    constructor(address admin_) AccessManaged(admin_) {}

    function submitProof(bytes calldata proofData) external {
        emit FraudProofSubmitted(msg.sender, proofData);
    }

    function resolve(address challenger, bool valid) external onlyAdmin {
        emit FraudResolved(challenger, valid);
    }
}

// -----------------------------------
// Checkpointing (L2/L3 roots → L1 anchoring)
// -----------------------------------

contract CheckpointManager is AccessManaged {
    struct Checkpoint {
        uint256 epoch;
        bytes32 root;
        uint256 totalVotingPower;
        uint256 signedVotingPower;
        uint64 timestamp;
    }

    mapping(uint256 => Checkpoint) public checkpoints; // epoch => checkpoint
    event CheckpointSubmitted(uint256 indexed epoch, bytes32 indexed root, uint256 signedVotingPower, uint256 totalVotingPower);

    constructor(address admin_) AccessManaged(admin_) {}

    function submitCheckpoint(
        uint256 epoch,
        bytes32 root,
        uint256 signedVotingPower,
        uint256 totalVotingPower
    ) external onlyAdmin {
        require(totalVotingPower > 0, "no voting power");
        require(signedVotingPower * 3 >= totalVotingPower * 2, "below quorum");
        checkpoints[epoch] = Checkpoint(epoch, root, totalVotingPower, signedVotingPower, uint64(block.timestamp));
        emit CheckpointSubmitted(epoch, root, signedVotingPower, totalVotingPower);
    }
}

// -----------------------------------
// 5. Rollup / L2 / L3 Stack
// -----------------------------------

contract RollupManagerV2 is AccessManaged {
    struct Rollup {
        address sequencer;
        address inbox;
        bytes32 genesisHash;
        bool live;
    }

    mapping(bytes32 => Rollup) public rollups;
    event RollupRegistered(bytes32 indexed id, address sequencer, address inbox, bytes32 genesisHash);
    event RollupStatus(bytes32 indexed id, bool live);

    constructor(address admin_) AccessManaged(admin_) {}

    function registerRollup(bytes32 id, address sequencer, address inbox, bytes32 genesisHash) external onlyAdmin {
        rollups[id] = Rollup(sequencer, inbox, genesisHash, true);
        emit RollupRegistered(id, sequencer, inbox, genesisHash);
    }

    function setLive(bytes32 id, bool live) external onlyAdmin {
        rollups[id].live = live;
        emit RollupStatus(id, live);
    }
}

contract BatchInbox is AccessManaged {
    uint256 public batchCount;
    event BatchAppended(uint256 indexed batchId, bytes data, address indexed submitter);

    constructor(address admin_) AccessManaged(admin_) {}

    function appendBatch(bytes calldata data) external onlyAdmin returns (uint256) {
        batchCount += 1;
        emit BatchAppended(batchCount, data, msg.sender);
        return batchCount;
    }
}

contract SequencerRegistry is AccessManaged {
    mapping(address => bool) public isSequencer;

    event SequencerAdded(address indexed sequencer);
    event SequencerRemoved(address indexed sequencer);

    constructor(address admin_) AccessManaged(admin_) {}

    function addSequencer(address sequencer) external onlyAdmin {
        isSequencer[sequencer] = true;
        emit SequencerAdded(sequencer);
    }

    function removeSequencer(address sequencer) external onlyAdmin {
        isSequencer[sequencer] = false;
        emit SequencerRemoved(sequencer);
    }
}

// slither-disable-next-line locked-ether
contract BatcherBondManager is AccessManaged {
    mapping(address => uint256) public bonds;

    event BondPosted(address indexed batcher, uint256 amount);
    event BondSlashed(address indexed batcher, uint256 amount);

    constructor(address admin_) AccessManaged(admin_) {}

    function postBond() external payable {
        bonds[msg.sender] += msg.value;
        emit BondPosted(msg.sender, msg.value);
    }

    function slash(address batcher, uint256 amount) external onlyAdmin {
        uint256 bal = bonds[batcher];
        require(bal >= amount, "insufficient bond");
        bonds[batcher] = bal - amount;
        emit BondSlashed(batcher, amount);
    }
}

contract DisputeGameFactoryV2 is AccessManaged {
    uint256 public lastGameId;
    mapping(uint256 => address) public games;

    event GameCreated(uint256 indexed gameId, address indexed game, address indexed challenger, bytes32 outputRoot);

    constructor(address admin_) AccessManaged(admin_) {}

    function createGame(address challenger, bytes32 outputRoot) external onlyAdmin returns (uint256) {
        lastGameId += 1;
        FaultDisputeGame game = new FaultDisputeGame(admin, address(this));
        game.initiate(challenger, admin, outputRoot);
        games[lastGameId] = address(game);
        emit GameCreated(lastGameId, address(game), challenger, outputRoot);
        return lastGameId;
    }
}

contract FaultDisputeGame is AccessManaged {
    bytes32 public disputedOutputRoot;
    address public challenger;
    address public defender;
    address public factory;
    bool public resolved;
    bool public faultProven;

    event DisputeInitiated(address indexed challenger, address indexed defender, bytes32 outputRoot);
    event DisputeResolved(bool faultProven);

    constructor(address admin_, address factory_) AccessManaged(admin_) {
        factory = factory_;
    }

    function initiate(address challenger_, address defender_, bytes32 outputRoot) public {
        require(msg.sender == admin || msg.sender == factory, "not authorized");
        challenger = challenger_;
        defender = defender_;
        disputedOutputRoot = outputRoot;
        resolved = false;
        emit DisputeInitiated(challenger_, defender_, outputRoot);
    }

    function resolve(bool faultProven_) external onlyAdmin {
        resolved = true;
        faultProven = faultProven_;
        emit DisputeResolved(faultProven_);
    }
}

contract OutputOracle is AccessManaged {
    struct OutputProposal {
        bytes32 outputRoot;
        uint256 timestamp;
    }

    mapping(uint256 => OutputProposal) public proposals; // l2 block => proposal
    event OutputProposed(uint256 indexed l2Block, bytes32 outputRoot, uint256 timestamp);

    constructor(address admin_) AccessManaged(admin_) {}

    function proposeOutput(uint256 l2Block, bytes32 outputRoot) external onlyAdmin {
        proposals[l2Block] = OutputProposal(outputRoot, block.timestamp);
        emit OutputProposed(l2Block, outputRoot, block.timestamp);
    }
}

contract FinalizationManager is AccessManaged {
    mapping(uint256 => bool) public finalizedBlocks;
    mapping(uint256 => bytes32) public finalizedRoots;
    DisputeGameFactoryV2 public disputeFactory;
    OutputOracle public outputOracle;
    uint64 public challengeWindowSeconds;
    mapping(uint256 => bool) public challenged;
    event BlockFinalized(uint256 indexed l2Block, bytes32 outputRoot);

    constructor(
        address admin_,
        DisputeGameFactoryV2 disputeFactory_,
        OutputOracle outputOracle_,
        uint64 challengeWindowSeconds_
    ) AccessManaged(admin_) {
        disputeFactory = disputeFactory_;
        outputOracle = outputOracle_;
        challengeWindowSeconds = challengeWindowSeconds_;
    }

    function finalize(uint256 l2Block, bytes32 outputRoot) external onlyAdmin {
        _requireFinalizable(l2Block, outputRoot);
        _finalize(l2Block, outputRoot);
    }

    function _finalize(uint256 l2Block, bytes32 outputRoot) internal {
        finalizedBlocks[l2Block] = true;
        finalizedRoots[l2Block] = outputRoot;
        emit BlockFinalized(l2Block, outputRoot);
    }

    function finalizeWithDispute(uint256 l2Block, bytes32 outputRoot, uint256 disputeId) external onlyAdmin {
        address game = disputeFactory.games(disputeId);
        require(game != address(0), "game missing");
        FaultDisputeGame fdg = FaultDisputeGame(game);
        require(fdg.resolved(), "dispute open");
        require(!fdg.faultProven(), "fault proven");
        _requireFinalizable(l2Block, outputRoot);
        _finalize(l2Block, outputRoot);
    }

    function challenge(uint256 l2Block) external {
        challenged[l2Block] = true;
    }

    function _requireFinalizable(uint256 l2Block, bytes32 outputRoot) internal view {
        require(!challenged[l2Block], "challenged");
        (bytes32 proposedRoot, uint256 timestamp) = outputOracle.proposals(l2Block);
        if (timestamp > 0 && challengeWindowSeconds > 0) {
            require(block.timestamp >= timestamp + challengeWindowSeconds, "challenge window");
        }
        if (proposedRoot != bytes32(0)) {
            require(proposedRoot == outputRoot, "root mismatch");
        }
    }
}

// -----------------------------------
// 6. Governance & DAO Layer
// -----------------------------------

contract GovernanceToken is AccessManaged, ERC20 {
    event Minted(address indexed to, uint256 amount);
    event Burned(address indexed from, uint256 amount);

    constructor(address admin_) AccessManaged(admin_) ERC20("Ghost Governance Token", "GGOV", 18) {}

    function mint(address to, uint256 amount) external onlyAdmin {
        _mint(to, amount);
        emit Minted(to, amount);
    }

    function burn(address from, uint256 amount) external onlyAdmin {
        _burn(from, amount);
        emit Burned(from, amount);
    }
}

contract VotingEscrow is AccessManaged {
    struct Lock {
        uint256 amount;
        uint64 unlockTime;
    }

    mapping(address => Lock) public locks;
    event Locked(address indexed user, uint256 amount, uint64 unlockTime);
    event Unlocked(address indexed user, uint256 amount);

    constructor(address admin_) AccessManaged(admin_) {}

    function lock(uint256 amount, uint64 unlockTime) external {
        locks[msg.sender] = Lock(amount, unlockTime);
        emit Locked(msg.sender, amount, unlockTime);
    }

    function unlock() external {
        Lock memory l = locks[msg.sender];
        require(block.timestamp >= l.unlockTime, "locked");
        delete locks[msg.sender];
        emit Unlocked(msg.sender, l.amount);
    }

    function votingPower(address user) public view returns (uint256) {
        Lock memory l = locks[user];
        if (block.timestamp >= l.unlockTime) {
            return 0;
        }
        // Simple linear time bonus: remaining time (in seconds) / max (1 year) capped at 2x
        uint256 maxBoost = 2e18;
        uint256 remaining = l.unlockTime - block.timestamp;
        uint256 boost = (remaining * 1e18) / 365 days;
        if (boost > maxBoost) boost = maxBoost;
        return (l.amount * (1e18 + boost)) / 1e18;
    }
}

contract GovernorV2 is AccessManaged {
    struct Proposal {
        address proposer;
        address target;
        bytes data;
        uint64 eta;
        bool executed;
        uint64 startTime;
        uint64 endTime;
        uint256 forVotes;
        uint256 againstVotes;
    }

    uint256 public proposalCount;
    mapping(uint256 => Proposal) public proposals;
    mapping(uint256 => mapping(address => bool)) public hasVoted;
    VotingEscrow public votingEscrow;
    ProposalExecutorV2 public executor;
    uint256 public quorumVotes;
    uint64 public votingDelay;
    uint64 public votingPeriod;
    uint64 public timelockDelay;

    enum ProposalState {
        Pending,
        Active,
        Defeated,
        Succeeded,
        Queued,
        Executed,
        Expired
    }

    event ProposalCreated(uint256 indexed id, address indexed proposer, address indexed target, uint64 eta);
    event ProposalQueued(uint256 indexed id, uint64 eta);
    event ProposalExecuted(uint256 indexed id, address indexed target);

    constructor(
        address admin_,
        VotingEscrow votingEscrow_,
        ProposalExecutorV2 executor_,
        uint256 quorumVotes_,
        uint64 votingDelay_,
        uint64 votingPeriod_,
        uint64 timelockDelay_
    ) AccessManaged(admin_) {
        votingEscrow = votingEscrow_;
        executor = executor_;
        quorumVotes = quorumVotes_;
        votingDelay = votingDelay_;
        votingPeriod = votingPeriod_;
        timelockDelay = timelockDelay_;
    }

    function propose(address target, bytes calldata data) external returns (uint256) {
        proposalCount += 1;
        uint64 start = uint64(block.timestamp + votingDelay);
        uint64 end = uint64(start + votingPeriod);
        proposals[proposalCount] = Proposal(msg.sender, target, data, 0, false, start, end, 0, 0);
        emit ProposalCreated(proposalCount, msg.sender, target, 0);
        return proposalCount;
    }

    function castVote(uint256 id, bool support) external {
        Proposal storage p = proposals[id];
        require(state(id) == ProposalState.Active, "not active");
        require(!hasVoted[id][msg.sender], "voted");
        hasVoted[id][msg.sender] = true;
        uint256 weight = votingEscrow.votingPower(msg.sender);
        if (support) {
            p.forVotes += weight;
        } else {
            p.againstVotes += weight;
        }
    }

    function queue(uint256 id) external {
        Proposal storage p = proposals[id];
        require(state(id) == ProposalState.Succeeded, "not succeeded");
        p.eta = uint64(block.timestamp + timelockDelay);
        if (address(executor) != address(0)) {
            executor.schedule(p.target, p.data, p.eta);
        }
        emit ProposalQueued(id, p.eta);
    }

    function execute(uint256 id) external {
        Proposal storage p = proposals[id];
        require(state(id) == ProposalState.Queued, "not queued");
        require(block.timestamp >= p.eta, "eta");
        p.executed = true;
        if (address(executor) != address(0)) {
            executor.execute(p.target, p.data);
        } else {
            (bool ok, ) = p.target.call(p.data);
            require(ok, "call failed");
        }
        emit ProposalExecuted(id, p.target);
    }

    function state(uint256 id) public view returns (ProposalState) {
        Proposal memory p = proposals[id];
        if (p.executed) return ProposalState.Executed;
        // slither-disable-next-line incorrect-equality
        if (p.startTime == 0) return ProposalState.Pending;
        if (block.timestamp < p.startTime) return ProposalState.Pending;
        if (block.timestamp <= p.endTime) return ProposalState.Active;
        if (p.forVotes + p.againstVotes < quorumVotes || p.forVotes <= p.againstVotes) return ProposalState.Defeated;
        // slither-disable-next-line incorrect-equality
        if (p.eta == 0) return ProposalState.Succeeded;
        if (block.timestamp < p.eta) return ProposalState.Queued;
        if (block.timestamp >= p.eta + 30 days) return ProposalState.Expired;
        return ProposalState.Queued;
    }
}

contract ProposalExecutorV2 is AccessManaged {
    event CallScheduled(address indexed target, bytes data, uint64 eta);
    event CallExecuted(address indexed target, bytes data);

    constructor(address admin_) AccessManaged(admin_) {}

    function schedule(address target, bytes calldata data, uint64 eta) external onlyAdmin {
        target;
        data;
        eta;
        emit CallScheduled(target, data, eta);
    }

    function execute(address target, bytes calldata data) external onlyAdmin returns (bytes memory) {
        (bool ok, bytes memory result) = target.call(data);
        require(ok, "call failed");
        emit CallExecuted(target, data);
        return result;
    }
}

contract DelegationManager is AccessManaged {
    mapping(address => address) public delegates;
    event Delegated(address indexed delegator, address indexed delegatee);

    constructor(address admin_) AccessManaged(admin_) {}

    function delegate(address to) external {
        delegates[msg.sender] = to;
        emit Delegated(msg.sender, to);
    }
}

contract QuadraticVoting is AccessManaged {
    mapping(uint256 => mapping(address => uint256)) public votes; // proposalId => voter => votes
    event VoteCast(uint256 indexed proposalId, address indexed voter, uint256 weight);

    constructor(address admin_) AccessManaged(admin_) {}

    function castVote(uint256 proposalId, uint256 votingPower) external {
        uint256 weight = sqrt(votingPower);
        votes[proposalId][msg.sender] = weight;
        emit VoteCast(proposalId, msg.sender, weight);
    }

    function sqrt(uint256 x) internal pure returns (uint256 y) {
        uint256 z = (x + 1) / 2;
        y = x;
        while (z < y) {
            y = z;
            z = (x / z + z) / 2;
        }
    }
}

contract AIGovernanceAdvisor is AccessManaged {
    struct Recommendation {
        int256 score;
        string rationale;
    }

    mapping(uint256 => Recommendation) public recommendations;
    event RecommendationPushed(uint256 indexed proposalId, int256 score, string rationale);

    constructor(address admin_) AccessManaged(admin_) {}

    function pushRecommendation(uint256 proposalId, int256 score, string calldata rationale) external onlyAdmin {
        recommendations[proposalId] = Recommendation(score, rationale);
        emit RecommendationPushed(proposalId, score, rationale);
    }
}

// -----------------------------------
// 7. Identity, Compliance & Privacy
// -----------------------------------

contract DecentralizedID is AccessManaged {
    struct Identity {
        address owner;
        bytes32 metadataHash;
    }

    mapping(bytes32 => Identity) public identities;
    event IdentityIssued(bytes32 indexed id, address indexed owner, bytes32 metadataHash);
    event IdentityRevoked(bytes32 indexed id);

    constructor(address admin_) AccessManaged(admin_) {}

    function issue(bytes32 id, address owner, bytes32 metadataHash) external onlyAdmin {
        identities[id] = Identity(owner, metadataHash);
        emit IdentityIssued(id, owner, metadataHash);
    }

    function revoke(bytes32 id) external onlyAdmin {
        delete identities[id];
        emit IdentityRevoked(id);
    }
}

contract IdentityRegistry is AccessManaged {
    enum Status {
        Unknown,
        Pending,
        Verified,
        Rejected
    }

    mapping(address => Status) public statusOf;
    event StatusUpdated(address indexed user, Status status);

    constructor(address admin_) AccessManaged(admin_) {}

    function setStatus(address user, Status status) external onlyAdmin {
        statusOf[user] = status;
        emit StatusUpdated(user, status);
    }
}

contract ReputationScore is AccessManaged {
    mapping(address => int256) public scores;
    event ScoreUpdated(address indexed user, int256 score);

    constructor(address admin_) AccessManaged(admin_) {}

    function adjust(address user, int256 delta) external onlyAdmin {
        scores[user] += delta;
        emit ScoreUpdated(user, scores[user]);
    }
}

contract ZKIdentityVerifier {
    event IdentityProof(address indexed user, bytes proof);

    function verify(bytes calldata proof, bytes calldata publicInputs) external returns (bool) {
        publicInputs;
        emit IdentityProof(msg.sender, proof);
        return false;
    }
}

contract SelectiveDisclosure is AccessManaged {
    event ClaimShared(address indexed user, bytes32 indexed claimId, address indexed counterparty);

    constructor(address admin_) AccessManaged(admin_) {}

    function shareClaim(bytes32 claimId, address counterparty) external {
        emit ClaimShared(msg.sender, claimId, counterparty);
    }
}

contract ComplianceGate is AccessManaged {
    mapping(address => bool) public allowlist;
    event AllowlistUpdated(address indexed user, bool allowed);

    constructor(address admin_) AccessManaged(admin_) {}

    function setAllowed(address user, bool allowed) external onlyAdmin {
        allowlist[user] = allowed;
        emit AllowlistUpdated(user, allowed);
    }

    function check(address user) external view returns (bool) {
        return allowlist[user];
    }
}

// -----------------------------------
// 8. AI Security, Monitoring & Automation
// -----------------------------------

contract AISecurityOracle is AccessManaged {
    mapping(bytes32 => uint256) public riskScores; // txHash => score (0-10k)
    event RiskScored(bytes32 indexed txHash, uint256 score, string modelRef);

    constructor(address admin_) AccessManaged(admin_) {}

    function publishScore(bytes32 txHash, uint256 score, string calldata modelRef) external onlyAdmin {
        riskScores[txHash] = score;
        emit RiskScored(txHash, score, modelRef);
    }
}

contract AnomalyDetector is AccessManaged {
    event AnomalyDetected(address indexed actor, bytes32 indexed signal, uint256 severity);

    constructor(address admin_) AccessManaged(admin_) {}

    function flag(address actor, bytes32 signal, uint256 severity) external onlyAdmin {
        emit AnomalyDetected(actor, signal, severity);
    }
}

contract TransactionClassifier is AccessManaged {
    mapping(bytes32 => bytes32) public labels;
    event Classified(bytes32 indexed txHash, bytes32 label);

    constructor(address admin_) AccessManaged(admin_) {}

    function classify(bytes32 txHash, bytes32 label) external onlyAdmin {
        labels[txHash] = label;
        emit Classified(txHash, label);
    }
}

contract KeeperRegistry is AccessManaged {
    mapping(address => bool) public keepers;
    event KeeperAdded(address indexed keeper);
    event KeeperRemoved(address indexed keeper);

    constructor(address admin_) AccessManaged(admin_) {}

    function addKeeper(address keeper) external onlyAdmin {
        keepers[keeper] = true;
        emit KeeperAdded(keeper);
    }

    function removeKeeper(address keeper) external onlyAdmin {
        keepers[keeper] = false;
        emit KeeperRemoved(keeper);
    }
}

contract AutonomousExecutor is AccessManaged {
    event TaskScheduled(bytes32 indexed taskId, bytes callData, uint64 eta);
    event TaskExecuted(bytes32 indexed taskId, bytes result);

    constructor(address admin_) AccessManaged(admin_) {}

    function schedule(bytes32 taskId, bytes calldata callData, uint64 eta) external onlyAdmin {
        emit TaskScheduled(taskId, callData, eta);
    }

    function execute(address target, bytes calldata data, bytes32 taskId) external onlyAdmin returns (bytes memory) {
        (bool ok, bytes memory result) = target.call(data);
        require(ok, "call failed");
        emit TaskExecuted(taskId, result);
        return result;
    }
}

contract PredictiveGasManager is AccessManaged {
    uint256 public forecastedGasPrice;
    event GasPriceForecast(uint256 price);

    constructor(address admin_) AccessManaged(admin_) {}

    function publishForecast(uint256 price) external onlyAdmin {
        forecastedGasPrice = price;
        emit GasPriceForecast(price);
    }
}

// -----------------------------------
// 9. Developer & Ecosystem Contracts
// -----------------------------------

contract ContractRegistry is AccessManaged {
    mapping(bytes32 => address) public contractsById;
    event ContractRegistered(bytes32 indexed id, address indexed contractAddress);

    constructor(address admin_) AccessManaged(admin_) {}

    function register(bytes32 id, address contractAddress) external onlyAdmin {
        contractsById[id] = contractAddress;
        emit ContractRegistered(id, contractAddress);
    }
}

contract AddressBook is AccessManaged {
    mapping(bytes32 => address) public addresses;
    event AddressSet(bytes32 indexed id, address indexed target);

    constructor(address admin_) AccessManaged(admin_) {}

    function setAddress(bytes32 id, address target) external onlyAdmin {
        addresses[id] = target;
        emit AddressSet(id, target);
    }
}

contract UpgradeableProxy {
    address public implementation;
    address public admin;

    event Upgraded(address indexed newImplementation);
    event AdminTransferred(address indexed previousAdmin, address indexed newAdmin);

    modifier onlyAdmin() {
        require(msg.sender == admin, "not admin");
        _;
    }

    constructor(address implementation_) {
        require(implementation_ != address(0), "impl=0");
        implementation = implementation_;
        admin = msg.sender;
    }

    function upgradeTo(address implementation_) external onlyAdmin {
        require(implementation_ != address(0), "impl=0");
        implementation = implementation_;
        emit Upgraded(implementation_);
    }

    function transferAdmin(address newAdmin) external onlyAdmin {
        require(newAdmin != address(0), "admin=0");
        address prev = admin;
        admin = newAdmin;
        emit AdminTransferred(prev, newAdmin);
    }

    fallback() external payable {
        address impl = implementation;
        require(impl != address(0), "impl=0");
        // slither-disable-next-line controlled-delegatecall
        (bool ok, bytes memory data) = impl.delegatecall(msg.data);
        if (!ok) {
            assembly {
                revert(add(data, 0x20), mload(data))
            }
        }
        assembly {
            return(add(data, 0x20), mload(data))
        }
    }

    receive() external payable {}
}

contract Multicall {
    function multicall(bytes[] calldata data) external returns (bytes[] memory results) {
        results = new bytes[](data.length);
        for (uint256 i = 0; i < data.length; i++) {
            (bool ok, bytes memory result) = address(this).delegatecall(data[i]);
            require(ok, "call failed");
            results[i] = result;
        }
    }
}

contract MetaTxForwarder is AccessManaged {
    event MetaTransactionExecuted(address indexed user, address indexed target, bytes data);

    constructor(address admin_) AccessManaged(admin_) {}

    function execute(address target, bytes calldata data, address user) external onlyAdmin returns (bytes memory) {
        (bool ok, bytes memory result) = target.call(data);
        require(ok, "call failed");
        emit MetaTransactionExecuted(user, target, data);
        return result;
    }
}

contract AccountAbstraction is AccessManaged {
    struct UserOperation {
        address sender;
        bytes callData;
        uint256 nonce;
        uint256 gasLimit;
    }

    mapping(address => uint256) public nonces;
    event UserOperationHandled(address indexed sender, uint256 nonce, bool success);

    constructor(address admin_) AccessManaged(admin_) {}

    function handleOp(UserOperation calldata op) external onlyAdmin {
        require(op.nonce == nonces[op.sender]++, "bad nonce");
        (bool ok, ) = op.sender.call{gas: op.gasLimit}(op.callData);
        emit UserOperationHandled(op.sender, op.nonce, ok);
    }
}

// -----------------------------------
// 10. NFT, DeFi & App-Layer Primitives
// -----------------------------------

contract NFTCore is AccessManaged {
    string public name = "Ghost NFT";
    string public symbol = "GNFT";
    mapping(uint256 => address) public ownerOf;

    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);

    constructor(address admin_) AccessManaged(admin_) {}

    function mint(address to, uint256 tokenId) external onlyAdmin {
        require(ownerOf[tokenId] == address(0), "minted");
        ownerOf[tokenId] = to;
        emit Transfer(address(0), to, tokenId);
    }

    function burn(uint256 tokenId) external onlyAdmin {
        address owner = ownerOf[tokenId];
        require(owner != address(0), "missing");
        delete ownerOf[tokenId];
        emit Transfer(owner, address(0), tokenId);
    }

    function transferFrom(address from, address to, uint256 tokenId) external {
        require(ownerOf[tokenId] == from, "owner");
        require(msg.sender == from, "not owner");
        ownerOf[tokenId] = to;
        emit Transfer(from, to, tokenId);
    }
}

contract RoyaltyManager is AccessManaged {
    struct RoyaltyInfo {
        address receiver;
        uint96 bps;
    }

    mapping(address => RoyaltyInfo) public royalties; // token => info
    event RoyaltySet(address indexed token, address indexed receiver, uint96 bps);

    constructor(address admin_) AccessManaged(admin_) {}

    function setRoyalty(address token, address receiver, uint96 bps) external onlyAdmin {
        royalties[token] = RoyaltyInfo(receiver, bps);
        emit RoyaltySet(token, receiver, bps);
    }
}

contract SoulboundToken is AccessManaged {
    string public name = "Ghost Soulbound";
    string public symbol = "GSBT";
    mapping(address => bool) public minted;

    event Minted(address indexed to);
    event Burned(address indexed from);

    constructor(address admin_) AccessManaged(admin_) {}

    function mint(address to) external onlyAdmin {
        require(!minted[to], "minted");
        minted[to] = true;
        emit Minted(to);
    }

    function burn(address from) external onlyAdmin {
        require(minted[from], "missing");
        minted[from] = false;
        emit Burned(from);
    }
}

contract DEXRouter is AccessManaged {
    event SwapExecuted(address indexed user, address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 minOut);

    constructor(address admin_) AccessManaged(admin_) {}

    function swap(address tokenIn, address tokenOut, uint256 amountIn, uint256 minOut) external {
        emit SwapExecuted(msg.sender, tokenIn, tokenOut, amountIn, minOut);
    }
}

contract LiquidityPool is AccessManaged {
    uint256 public reserve0;
    uint256 public reserve1;
    event LiquidityAdded(address indexed provider, uint256 amount0, uint256 amount1);
    event LiquidityRemoved(address indexed provider, uint256 amount0, uint256 amount1);

    constructor(address admin_) AccessManaged(admin_) {}

    function addLiquidity(uint256 amount0, uint256 amount1) external {
        reserve0 += amount0;
        reserve1 += amount1;
        emit LiquidityAdded(msg.sender, amount0, amount1);
    }

    function removeLiquidity(uint256 amount0, uint256 amount1) external {
        require(reserve0 >= amount0 && reserve1 >= amount1, "insufficient");
        reserve0 -= amount0;
        reserve1 -= amount1;
        emit LiquidityRemoved(msg.sender, amount0, amount1);
    }
}

contract YieldVault is AccessManaged {
    mapping(address => uint256) public balances;
    uint256 public totalAssets;
    event Deposited(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, uint256 amount);

    constructor(address admin_) AccessManaged(admin_) {}

    function deposit(uint256 amount) external {
        balances[msg.sender] += amount;
        totalAssets += amount;
        emit Deposited(msg.sender, amount);
    }

    function withdraw(uint256 amount) external {
        uint256 bal = balances[msg.sender];
        require(bal >= amount, "insufficient");
        balances[msg.sender] = bal - amount;
        totalAssets -= amount;
        emit Withdrawn(msg.sender, amount);
    }
}

contract InsuranceFund is AccessManaged {
    uint256 public reserves;
    event Contribution(address indexed contributor, uint256 amount);
    event Payout(address indexed to, uint256 amount, string reason);

    constructor(address admin_) AccessManaged(admin_) {}

    receive() external payable {
        reserves += msg.value;
        emit Contribution(msg.sender, msg.value);
    }

    function payout(address payable to, uint256 amount, string calldata reason) external onlyAdmin {
        require(reserves >= amount, "insufficient");
        reserves -= amount;
        to.transfer(amount);
        emit Payout(to, amount, reason);
    }
}

// -----------------------------------
// 11. Emergency, Recovery & Resilience
// -----------------------------------

contract EmergencyShutdownV2 is Pausable {
    event ShutdownTriggered(address indexed by, string reason);

    constructor(address admin_) Pausable(admin_) {}

    function shutdown(string calldata reason) external onlyAdmin {
        paused = true;
        emit ShutdownTriggered(msg.sender, reason);
    }
}

contract ValidatorRecovery is AccessManaged {
    mapping(address => address) public recoveryAddress;
    event RecoverySet(address indexed validator, address indexed recovery);

    constructor(address admin_) AccessManaged(admin_) {}

    function setRecovery(address validator, address recovery) external onlyAdmin {
        recoveryAddress[validator] = recovery;
        emit RecoverySet(validator, recovery);
    }
}

contract TreasuryBackstop is AccessManaged {
    event BackstopProvided(address indexed to, uint256 amount);

    constructor(address admin_) AccessManaged(admin_) {}

    function backstop(address payable to) external payable onlyAdmin {
        to.transfer(msg.value);
        emit BackstopProvided(to, msg.value);
    }
}

contract ForkRecoveryManager is AccessManaged {
    bytes32 public preferredFork;
    event ForkSelected(bytes32 indexed forkId);

    constructor(address admin_) AccessManaged(admin_) {}

    function selectFork(bytes32 forkId) external onlyAdmin {
        preferredFork = forkId;
        emit ForkSelected(forkId);
    }
}
