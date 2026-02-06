// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../common/Governed.sol";

interface IERC20GasToken {
    function balanceOf(address account) external view returns (uint256);
    function allowance(address owner, address spender) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

/// @notice Minimal staking manager to track GHOST-denominated bonds for validators/operators.
contract StakingManager is Governed {
    address internal constant CANONICAL_GAS_TOKEN = 0x5FbDB2315678afecb367f032d93F642f64180aa3;

    IERC20GasToken public immutable gasToken;
    mapping(address => uint256) public stakes;
    uint256 public totalStaked;
    address public slashManager;

    event SlashManagerUpdated(address indexed slashManager);
    event Staked(address indexed staker, uint256 amount);
    event Unstaked(address indexed staker, uint256 amount);
    event Slashed(address indexed staker, uint256 amount);

    constructor(address governor_, address timelock_) Governed(governor_, timelock_) {
        gasToken = IERC20GasToken(CANONICAL_GAS_TOKEN);
    }

    function setSlashManager(address manager) external onlyGovernance {
        slashManager = manager;
        emit SlashManagerUpdated(manager);
    }

    /// @notice Stakes the caller's full allowance to avoid non-canonical staking paths.
    function stake() external {
        uint256 allowance = gasToken.allowance(msg.sender, address(this));
        require(allowance > 0, "no allowance");
        _stake(msg.sender, allowance);
    }

    function stake(uint256 amount) external {
        _stake(msg.sender, amount);
    }

    function _stake(address staker, uint256 amount) internal {
        require(amount > 0, "no amount");
        require(gasToken.transferFrom(staker, address(this), amount), "transferFrom failed");
        stakes[staker] += amount;
        totalStaked += amount;
        emit Staked(staker, amount);
    }

    function unstake(uint256 amount) external {
        require(stakes[msg.sender] >= amount, "insufficient stake");
        stakes[msg.sender] -= amount;
        totalStaked -= amount;
        require(gasToken.transfer(msg.sender, amount), "transfer failed");
        emit Unstaked(msg.sender, amount);
    }

    modifier onlySlasher() {
        // Slashing can come from the slashing manager or from the proposal executor governance path.
        require(msg.sender == slashManager || msg.sender == governor || msg.sender == timelock, "NOT_SLASHER");
        _;
    }

    function slash(address staker, uint256 amount) external onlySlasher {
        uint256 bal = stakes[staker];
        if (amount > bal) amount = bal;
        stakes[staker] = bal - amount;
        totalStaked -= amount;
        emit Slashed(staker, amount);
    }

    function gasTokenAddress() external pure returns (address) {
        return CANONICAL_GAS_TOKEN;
    }
}
