// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Minimal implementation used temporarily behind an ERC1967 proxy to rewrite a storage slot.
/// @dev This contract is intended for local/dev repair operations only.
///      Typical flow:
///      1) ProxyAdmin.upgradeAndCall(proxy, setterImpl, abi.encodeCall(setAddress, (slot, value)))
///      2) ProxyAdmin.upgrade(proxy, originalImpl)
contract ProxyStorageSetter {
    /// @dev Only the ProxyAdmin (the proxy admin address) may invoke setters.
    address public immutable allowedCaller;

    error NotAllowed(address caller);

    constructor(address _allowedCaller) {
        allowedCaller = _allowedCaller;
    }

    function setAddress(bytes32 slot, address value) external {
        if (msg.sender != allowedCaller) revert NotAllowed(msg.sender);
        assembly {
            sstore(slot, value)
        }
    }
}

