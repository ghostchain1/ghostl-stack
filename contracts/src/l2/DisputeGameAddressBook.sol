// SPDX-License-Identifier: MIT
// @ghostchain Part of the GhostChain protocol suite — https://ghostchain.cloud

pragma solidity ^0.8.24;

/// @notice Optional L2 helper to publish the canonical L1 DisputeGameFactory address.
contract DisputeGameAddressBook {
    address public admin;
    address public l1DisputeGameFactory;

    event AdminChanged(address indexed oldAdmin, address indexed newAdmin);
    event FactorySet(address indexed oldFactory, address indexed newFactory);

    error Unauthorized();

    constructor(address _admin, address _l1DGF) {
        admin = _admin;
        l1DisputeGameFactory = _l1DGF;
        emit AdminChanged(address(0), _admin);
        emit FactorySet(address(0), _l1DGF);
    }

    modifier onlyAdmin() {
        if (msg.sender != admin) revert Unauthorized();
        _;
    }

    function version() external pure returns (string memory) {
        return "DGF-AddressBook/1.0.0";
    }

    function setFactory(address newFactory) external onlyAdmin {
        emit FactorySet(l1DisputeGameFactory, newFactory);
        l1DisputeGameFactory = newFactory;
    }

    function setAdmin(address newAdmin) external onlyAdmin {
        emit AdminChanged(admin, newAdmin);
        admin = newAdmin;
    }
}
