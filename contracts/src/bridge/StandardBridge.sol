// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IXDomainMessenger} from "../common/IXDomainMessenger.sol";
import {LibErrors} from "../common/LibErrors.sol";

interface IERC20Like {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
}

interface IBridgeMintableGST20 {
    function mint(address to, uint256 amount) external;
    function burn(address from, uint256 amount) external;
}

/// @notice Minimal bridge:
/// - On "source" chain: escrow canonical token OR burn representation token.
/// - On "dest" chain: mint representation token OR release escrowed canonical token.
/// This requires you to choose which side holds canonical custody vs representation.
// slither-disable-next-line locked-ether
contract StandardBridge {
    event BridgeInitiated(
        address indexed localToken,
        address indexed remoteToken,
        address indexed from,
        address to,
        uint256 amount,
        bytes data
    );
    event BridgeFinalized(
        address indexed localToken,
        address indexed remoteToken,
        address indexed from,
        address to,
        uint256 amount,
        bytes data
    );

    address public owner;

    /// @notice Local messenger on this chain.
    IXDomainMessenger public messenger;

    /// @notice Bridge contract on the remote chain (parent or child, depending on deployment).
    address public remoteBridge;

    modifier onlyOwner() {
        if (msg.sender != owner) revert LibErrors.NotOwner();
        _;
    }

    modifier onlyRemoteBridge() {
        // Must be called by messenger, and xDomain sender must be remoteBridge.
        if (msg.sender != address(messenger)) revert LibErrors.NotAuthorized();
        if (messenger.xDomainMessageSender() != remoteBridge) revert LibErrors.NotAuthorized();
        _;
    }

    constructor(address _messenger, address _remoteBridge) {
        if (_messenger == address(0) || _remoteBridge == address(0)) revert LibErrors.ZeroAddress();
        owner = msg.sender;
        messenger = IXDomainMessenger(_messenger);
        remoteBridge = _remoteBridge;
    }

    function setRemoteBridge(address _remoteBridge) external onlyOwner {
        if (_remoteBridge == address(0)) revert LibErrors.ZeroAddress();
        remoteBridge = _remoteBridge;
    }

    /// @notice Bridge ERC20 from this chain to remote chain.
    /// @dev If localToken is canonical here: escrow via transferFrom to this contract.
    ///      If localToken is representation here: burn via BridgeMintableGST20.
    function bridgeGST20(
        address localToken,
        address remoteToken,
        address to,
        uint256 amount,
        uint32 minGasLimit,
        bytes calldata data,
        bool localIsRepresentation
    ) external {
        if (to == address(0)) revert LibErrors.ZeroAddress();
        if (amount == 0) revert LibErrors.InvalidValue();

        if (localIsRepresentation) {
            IBridgeMintableGST20(localToken).burn(msg.sender, amount);
        } else {
            require(IERC20Like(localToken).transferFrom(msg.sender, address(this), amount), "escrow fail");
        }

        emit BridgeInitiated(localToken, remoteToken, msg.sender, to, amount, data);

        bytes memory message = abi.encodeCall(
            StandardBridge.finalizeBridgeERC20,
            (remoteToken, localToken, msg.sender, to, amount, data, !localIsRepresentation)
        );

        messenger.sendMessage(remoteBridge, message, minGasLimit);
    }

    /// @notice Called on destination chain by messenger as a relayed message.
    function finalizeBridgeERC20(
        address localToken,
        address remoteToken,
        address from,
        address to,
        uint256 amount,
        bytes calldata data,
        bool localIsRepresentation
    ) external onlyRemoteBridge {
        if (to == address(0)) revert LibErrors.ZeroAddress();
        if (amount == 0) revert LibErrors.InvalidValue();

        if (localIsRepresentation) {
            IBridgeMintableGST20(localToken).mint(to, amount);
        } else {
            require(IERC20Like(localToken).transfer(to, amount), "release fail");
        }

        emit BridgeFinalized(localToken, remoteToken, from, to, amount, data);
    }

    receive() external payable {}
}
