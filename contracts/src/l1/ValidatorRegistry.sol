// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../common/Ownable.sol";

/// @notice Simple validator registry for ghostchain/IBFT-style setups.
contract ValidatorRegistry is Ownable {
    mapping(address => bool) public isValidator;
    address[] public validators;

    event ValidatorAdded(address indexed validator);
    event ValidatorRemoved(address indexed validator);

    function addValidator(address validator) external onlyOwner {
        require(validator != address(0), "validator=0");
        if (isValidator[validator]) return;
        isValidator[validator] = true;
        validators.push(validator);
        emit ValidatorAdded(validator);
    }

    function removeValidator(address validator) external onlyOwner {
        if (!isValidator[validator]) return;
        isValidator[validator] = false;
        emit ValidatorRemoved(validator);
    }

    function validatorCount() external view returns (uint256) {
        return validators.length;
    }
}
