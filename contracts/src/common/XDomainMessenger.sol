// SPDX-License-Identifier: MIT
// @ghostchain Part of the GhostChain protocol suite — https://ghostchain.io

pragma solidity ^0.8.24;

import {IXDomainMessenger} from "./IXDomainMessenger.sol";
import {LibErrors} from "./LibErrors.sol";
import {LibAddress} from "./LibAddress.sol";
import {GhostHash} from "./GhostHash.sol";

/// @notice Minimal hierarchical messenger.
/// - "parentMessenger" is the ONLY entity allowed to relay messages "down" into this chain.
/// - Messages "up" are sent to parentMessenger.
/// - Replay protection via (nonce,sender,target,value,message) hash.
contract XDomainMessenger is IXDomainMessenger {
    using LibAddress for address;

    event SentMessage(
        address indexed target,
        address indexed sender,
        uint256 indexed nonce,
        uint256 value,
        uint32 minGasLimit,
        bytes message
    );
    event RelayedMessage(bytes32 indexed msgHash);
    event FailedRelayedMessage(bytes32 indexed msgHash, bytes revertData);
    event SetParentMessenger(address indexed parent);
    event SetChildMessenger(address indexed child);

    address public owner;

    /// @notice Messenger of the parent chain (e.g., L2's parent is L1 messenger).
    address public parentMessenger;

    /// @notice Messenger of the child chain (optional; helpful for tooling).
    address public childMessenger;

    /// @notice Current xDomain sender (set only during relay execution).
    address internal _xDomainSender;

    /// @notice monotonically increasing nonce for messages sent "up".
    uint256 public nextNonce;

    mapping(bytes32 => bool) public relayed;

    modifier onlyOwner() {
        if (msg.sender != owner) revert LibErrors.NotOwner();
        _;
    }

    modifier onlyParentMessenger() {
        if (msg.sender != parentMessenger) revert LibErrors.NotAuthorized();
        _;
    }

    constructor(address _parentMessenger, address _childMessenger) {
        owner = msg.sender;
        parentMessenger = _parentMessenger;
        childMessenger = _childMessenger;
        emit SetParentMessenger(_parentMessenger);
        emit SetChildMessenger(_childMessenger);
    }

    function setParentMessenger(address _parent) external onlyOwner {
        parentMessenger = _parent;
        emit SetParentMessenger(_parent);
    }

    function setChildMessenger(address _child) external onlyOwner {
        childMessenger = _child;
        emit SetChildMessenger(_child);
    }

    function xDomainMessageSender() external view returns (address) {
        return _xDomainSender;
    }

    /// @notice Send message "up" to parent chain messenger.
    /// In a real rollup you’d emit logs and have a relayer/prover pick them up.
    function sendMessage(address target, bytes calldata message, uint32 minGasLimit) external {
        if (target == address(0)) revert LibErrors.ZeroAddress();
        // For "up" messaging we require a parent messenger configured.
        if (parentMessenger == address(0)) revert LibErrors.NotAuthorized();

        uint256 nonce = nextNonce++;
        emit SentMessage(target, msg.sender, nonce, 0, minGasLimit, message);

        // Call parent messenger to enqueue/record the message.
        // In real deployments, this "send" may be async; here it's a direct call for testnet/dev simplicity.
        IXDomainMessenger(parentMessenger).relayMessage(nonce, msg.sender, target, 0, minGasLimit, message);
    }

    /// @notice Relay message "down" into this chain.
    /// Only parentMessenger can call this in the hierarchical trust model.
    function relayMessage(
        uint256 nonce,
        address sender,
        address target,
        uint256 value,
        uint32 /*minGasLimit*/,
        bytes calldata message
    ) external onlyParentMessenger {
        if (target == address(0)) revert LibErrors.ZeroAddress();
        if (value != 0) revert LibErrors.InvalidValue();

        bytes32 msgHash = GhostHash.xMessageKey(nonce, sender, target, value, keccak256(message));
        if (relayed[msgHash]) revert LibErrors.AlreadyRelayed();
        relayed[msgHash] = true;

        // Uncomment for stricter behavior: require(target.isContract(), "target not contract");
        _xDomainSender = sender;
        (bool ok, bytes memory ret) = target.call(message);
        _xDomainSender = address(0);

        if (ok) {
            emit RelayedMessage(msgHash);
        } else {
            emit FailedRelayedMessage(msgHash, ret);
            // We do NOT revert (so message is marked relayed and can't be replayed).
            // For production you may want a retry/failure queue design.
        }
    }

}
