// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../common/Governed.sol";

interface IERC20Bond {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
}

/// @notice Holds operator bonds used for slashing/penalties.
contract OperatorBondVault is Governed {
    mapping(address => bool) public bondAssetAllowed;
    mapping(address => mapping(address => uint256)) public bondBalance; // asset => operator => balance
    mapping(address => bool) public operatorLocked;
    mapping(address => bool) public slashers;

    event BondAssetAllowed(address indexed asset, bool allowed);
    event SlasherSet(address indexed slasher, bool allowed);
    event OperatorLockedSet(address indexed operator, bool locked);
    event BondDeposited(address indexed operator, address indexed asset, uint256 amount);
    event BondWithdrawn(address indexed operator, address indexed asset, uint256 amount);
    event Slashed(address indexed operator, address indexed asset, uint256 amount, address indexed to, bytes32 evidenceHash);

    error Unauthorized();

    constructor(address governor_, address timelock_) Governed(governor_, timelock_) {}

    modifier onlySlasherOrGovernance() {
        if (!_isGovernance(msg.sender) && !slashers[msg.sender]) revert Unauthorized();
        _;
    }

    function setBondAssetAllowed(address asset, bool allowed) external onlyGovernance {
        require(asset != address(0), "asset=0");
        bondAssetAllowed[asset] = allowed;
        emit BondAssetAllowed(asset, allowed);
    }

    function setSlasher(address slasher, bool allowed) external onlyGovernance {
        require(slasher != address(0), "slasher=0");
        slashers[slasher] = allowed;
        emit SlasherSet(slasher, allowed);
    }

    function setOperatorLocked(address operator, bool locked) external onlySlasherOrGovernance {
        require(operator != address(0), "operator=0");
        operatorLocked[operator] = locked;
        emit OperatorLockedSet(operator, locked);
    }

    function depositBond(address asset, uint256 amount) external {
        require(bondAssetAllowed[asset], "asset not allowed");
        require(amount != 0, "amount=0");
        require(IERC20Bond(asset).transferFrom(msg.sender, address(this), amount), "transferFrom");
        bondBalance[asset][msg.sender] += amount;
        emit BondDeposited(msg.sender, asset, amount);
    }

    function withdrawBond(address asset, uint256 amount) external {
        require(!operatorLocked[msg.sender], "locked");
        uint256 bal = bondBalance[asset][msg.sender];
        require(bal >= amount, "balance");
        unchecked {
            bondBalance[asset][msg.sender] = bal - amount;
        }
        require(IERC20Bond(asset).transfer(msg.sender, amount), "transfer");
        emit BondWithdrawn(msg.sender, asset, amount);
    }

    function slash(address asset, address operator, uint256 amount, address to, bytes32 evidenceHash)
        external
        onlySlasherOrGovernance
    {
        require(to != address(0), "to=0");
        uint256 bal = bondBalance[asset][operator];
        require(bal >= amount, "balance");
        unchecked {
            bondBalance[asset][operator] = bal - amount;
        }
        require(IERC20Bond(asset).transfer(to, amount), "transfer");
        emit Slashed(operator, asset, amount, to, evidenceHash);
    }

    function _isGovernance(address caller) internal view returns (bool) {
        return caller == governor || (timelock != address(0) && caller == timelock);
    }
}

