// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../common/Governed.sol";
import "../common/IXDomainMessenger.sol";
import "./TreasuryTypes.sol";
import "./TreasuryInvariants.sol";

/// @notice Cross-chain aware router for treasury actions. Messages are recorded and must be locally ratified.
contract TreasuryRouter is Governed {
    IXDomainMessenger public messenger;
    address public controller;

    struct RemoteRouter {
        address router;
        uint32 minGasLimit;
        bool enabled;
    }

    struct RoutedMessage {
        uint256 sourceChainId;
        address sourceRouter;
        TreasuryTypes.Action action;
        bool executed;
    }

    mapping(uint256 => RemoteRouter) public remoteRouters;
    mapping(address => bool) public trustedRemote;
    mapping(bytes32 => RoutedMessage) public routedMessages;

    event MessengerUpdated(address indexed messenger);
    event ControllerUpdated(address indexed controller);
    event RemoteRouterUpdated(uint256 indexed chainId, address router, uint32 minGasLimit, bool enabled);
    event Routed(bytes32 indexed routeId, uint256 indexed destinationChainId, address indexed remoteRouter);
    event RouteReceived(bytes32 indexed routeId, uint256 indexed sourceChainId, address indexed sourceRouter);

    error NotController();
    error MessengerUnset();
    error RemoteRouterUnset();

    constructor(address governor_, address timelock_, IXDomainMessenger messenger_) Governed(governor_, timelock_) {
        messenger = messenger_;
        emit MessengerUpdated(address(messenger_));
        if (governor_ != address(0)) {
            owner = governor_;
            emit OwnershipTransferred(msg.sender, governor_);
        }
    }

    modifier onlyController() {
        if (msg.sender != controller) revert NotController();
        _;
    }

    function setController(address controller_) external onlyGovernance {
        require(controller_ != address(0), "controller=0");
        TreasuryInvariants.requireContract(controller_);
        controller = controller_;
        emit ControllerUpdated(controller_);
    }

    function setMessenger(IXDomainMessenger messenger_) external onlyGovernance {
        messenger = messenger_;
        emit MessengerUpdated(address(messenger_));
    }

    function setRemoteRouter(uint256 chainId, address router, uint32 minGasLimit, bool enabled) external onlyGovernance {
        require(chainId != 0, "chainId=0");
        require(router != address(0), "router=0");
        remoteRouters[chainId] = RemoteRouter({router: router, minGasLimit: minGasLimit, enabled: enabled});
        trustedRemote[router] = enabled;
        emit RemoteRouterUpdated(chainId, router, minGasLimit, enabled);
    }

    function route(TreasuryTypes.Action calldata action) external onlyController returns (bytes32 routeId) {
        IXDomainMessenger messengerRef = messenger;
        if (address(messengerRef) == address(0)) revert MessengerUnset();
        RemoteRouter memory remote = remoteRouters[action.destinationChainId];
        if (!remote.enabled) revert RemoteRouterUnset();

        routeId = keccak256(
            abi.encode(
                block.chainid,
                action.destinationChainId,
                remote.router,
                action.actionType,
                action.asset,
                action.target,
                action.amount,
                action.value,
                keccak256(action.data),
                action.metadataHash,
                action.aiProposalHash,
                action.aiRiskScoreBps,
                action.treatyId
            )
        );

        bytes memory payload = abi.encodeWithSelector(
            TreasuryRouter.receiveRoute.selector,
            block.chainid,
            address(this),
            action
        );
        messengerRef.sendMessage(remote.router, payload, remote.minGasLimit);
        emit Routed(routeId, action.destinationChainId, remote.router);
    }

    function receiveRoute(uint256 sourceChainId, address sourceRouter, TreasuryTypes.Action calldata action) external {
        IXDomainMessenger messengerRef = messenger;
        require(msg.sender == address(messengerRef), "not messenger");
        require(trustedRemote[sourceRouter], "untrusted remote");
        require(messengerRef.xDomainMessageSender() == sourceRouter, "sender mismatch");

        bytes32 routeId = keccak256(
            abi.encode(
                sourceChainId,
                action.destinationChainId,
                sourceRouter,
                action.actionType,
                action.asset,
                action.target,
                action.amount,
                action.value,
                keccak256(action.data),
                action.metadataHash,
                action.aiProposalHash,
                action.aiRiskScoreBps,
                action.treatyId
            )
        );

        routedMessages[routeId] = RoutedMessage({
            sourceChainId: sourceChainId,
            sourceRouter: sourceRouter,
            action: action,
            executed: false
        });

        emit RouteReceived(routeId, sourceChainId, sourceRouter);
    }
}
