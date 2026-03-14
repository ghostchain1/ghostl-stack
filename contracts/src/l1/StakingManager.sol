// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { GhostSafeCast as SafeCast } from "../common/GhostSafeCast.sol";
import "../common/Governed.sol";
import "../governance/IVotingPower.sol";

interface IGST20GasToken {
    function balanceOf(address account) external view returns (uint256);
    function allowance(address owner, address spender) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

/// @notice Minimal staking manager to track GST-denominated bonds for validators/operators.
contract StakingManager is Governed, IVotingPower {
    using SafeCast for uint256;

    address internal constant CANONICAL_GAS_TOKEN = 0x5FbDB2315678afecb367f032d93F642f64180aa3;

    IGST20GasToken public immutable gasToken;
    mapping(address => uint256) public stakes;
    uint256 public totalStaked;
    address public slashManager;

    struct Checkpoint {
        uint48 timepoint;
        uint208 votes;
    }

    mapping(address => Checkpoint[]) private _checkpoints;
    Checkpoint[] private _totalCheckpoints;

    event SlashManagerUpdated(address indexed slashManager);
    event Staked(address indexed staker, uint256 amount);
    event Unstaked(address indexed staker, uint256 amount);
    event Slashed(address indexed staker, uint256 amount);

    constructor(address governor_, address timelock_) Governed(governor_, timelock_) {
        gasToken = IGST20GasToken(CANONICAL_GAS_TOKEN);
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
        _writeCheckpoint(_checkpoints[staker], stakes[staker].toUint208());
        _writeCheckpoint(_totalCheckpoints, totalStaked.toUint208());
        emit Staked(staker, amount);
    }

    function unstake(uint256 amount) external {
        require(stakes[msg.sender] >= amount, "insufficient stake");
        stakes[msg.sender] -= amount;
        totalStaked -= amount;
        require(gasToken.transfer(msg.sender, amount), "transfer failed");
        _writeCheckpoint(_checkpoints[msg.sender], stakes[msg.sender].toUint208());
        _writeCheckpoint(_totalCheckpoints, totalStaked.toUint208());
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
        _writeCheckpoint(_checkpoints[staker], stakes[staker].toUint208());
        _writeCheckpoint(_totalCheckpoints, totalStaked.toUint208());
        emit Slashed(staker, amount);
    }

    function gasTokenAddress() external pure returns (address) {
        return CANONICAL_GAS_TOKEN;
    }

    // ---------------------------------------------------------------------
    // IVotingPower (snapshot-based voting power derived from stake checkpoints)
    // ---------------------------------------------------------------------

    function clock() external view returns (uint48) {
        return uint48(block.timestamp);
    }

    function CLOCK_MODE() external pure returns (string memory) {
        return "mode=timestamp";
    }

    function getVotes(address account, uint256 timepoint) external view returns (uint256) {
        return _getVotesAt(_checkpoints[account], timepoint.toUint48());
    }

    function getTotalVotes(uint256 timepoint) external view returns (uint256) {
        return _getVotesAt(_totalCheckpoints, timepoint.toUint48());
    }

    function _writeCheckpoint(Checkpoint[] storage cps, uint208 newVotes) internal {
        uint48 tp = uint48(block.timestamp);
        uint256 n = cps.length;
        if (n != 0 && cps[n - 1].timepoint >= tp) {
            cps[n - 1].votes = newVotes;
        } else {
            cps.push(Checkpoint({timepoint: tp, votes: newVotes}));
        }
    }

    function _getVotesAt(Checkpoint[] storage cps, uint48 timepoint) internal view returns (uint256) {
        uint256 n = cps.length;
        if (n == 0) return 0;

        // If the first checkpoint is after timepoint, zero.
        if (cps[0].timepoint > timepoint) return 0;
        // If last checkpoint is <= timepoint, return last.
        if (cps[n - 1].timepoint <= timepoint) return cps[n - 1].votes;

        // Binary search for highest checkpoint <= timepoint.
        uint256 lo = 0;
        uint256 hi = n - 1;
        while (lo < hi) {
            uint256 mid = (lo + hi + 1) / 2;
            if (cps[mid].timepoint <= timepoint) {
                lo = mid;
            } else {
                hi = mid - 1;
            }
        }
        return cps[lo].votes;
    }
}
