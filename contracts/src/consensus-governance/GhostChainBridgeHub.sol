// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../common/Governed.sol";
import "../governance/InterchainAuthorization.sol";

/// @notice Canonical GhostChain hub: L2/L3 can post roots to L1; only L1 can trigger external-chain egress.
contract GhostChainBridgeHub is Governed {
    uint8 public constant LAYER_L1 = 1;
    uint8 public constant LAYER_L2 = 2;
    uint8 public constant LAYER_L3 = 3;

    struct LayerRootRecord {
        bytes32 root;
        uint64 sourceBlockNumber;
        uint64 recordedAt;
        bytes32 evidenceHash;
        address recorder;
    }

    struct OutboundMessage {
        uint256 nonce;
        uint8 sourceLayer;
        uint256 destinationChainId;
        address asset;
        uint256 amount;
        bytes32 payloadHash;
        uint64 queuedAt;
        uint64 executedAt;
        address sender;
        bool executed;
        bytes32 externalTxHash;
    }

    InterchainAuthorization public authorization;

    mapping(address => bool) public operators;
    mapping(uint8 => bool) public layerRootPostingEnabled;
    mapping(uint256 => bool) public externalChainAllowed;
    mapping(bytes32 => LayerRootRecord) public layerRootRecords;
    mapping(bytes32 => OutboundMessage) public outboundMessages;

    uint256 public outboundNonce;

    event OperatorUpdated(address indexed operator, bool allowed);
    event AuthorizationUpdated(address indexed authorization);
    event LayerRootPostingUpdated(uint8 indexed layer, bool enabled);
    event ExternalChainAllowedUpdated(uint256 indexed chainId, bool allowed);
    event LayerRootRecorded(uint8 indexed layer, bytes32 indexed root, uint64 sourceBlockNumber, bytes32 evidenceHash, address recorder);
    event OutboundQueued(
        bytes32 indexed messageId,
        uint256 indexed nonce,
        uint256 indexed destinationChainId,
        uint8 sourceLayer,
        address asset,
        uint256 amount,
        bytes32 payloadHash,
        address sender
    );
    event OutboundExecuted(bytes32 indexed messageId, bytes32 indexed externalTxHash, address executor);

    error NotOperator();
    error InvalidLayer(uint8 layer);
    error PostingDisabled(uint8 layer);
    error InvalidRoot();
    error OnlyGhostChainEgress(uint8 sourceLayer);
    error ExternalChainNotAllowed(uint256 chainId);
    error OutboundAlreadyExecuted(bytes32 messageId);
    error OutboundMissing(bytes32 messageId);

    constructor(address governor_, address timelock_, InterchainAuthorization authorization_)
        Governed(governor_, timelock_)
    {
        authorization = authorization_;
        emit AuthorizationUpdated(address(authorization_));
    }

    modifier onlyOperatorOrGovernance() {
        if (msg.sender != governor && msg.sender != timelock && !operators[msg.sender]) revert NotOperator();
        _;
    }

    function setAuthorization(InterchainAuthorization authorization_) external onlyGovernance {
        authorization = authorization_;
        emit AuthorizationUpdated(address(authorization_));
    }

    function setOperator(address operator, bool allowed) external onlyGovernance {
        operators[operator] = allowed;
        emit OperatorUpdated(operator, allowed);
    }

    function setLayerRootPostingEnabled(uint8 layer, bool enabled) external onlyGovernance {
        if (layer != LAYER_L2 && layer != LAYER_L3) revert InvalidLayer(layer);
        layerRootPostingEnabled[layer] = enabled;
        emit LayerRootPostingUpdated(layer, enabled);
    }

    function setExternalChainAllowed(uint256 chainId, bool allowed) external onlyGovernance {
        require(chainId != 0, "chain=0");
        externalChainAllowed[chainId] = allowed;
        emit ExternalChainAllowedUpdated(chainId, allowed);
    }

    function recordLayerRoot(uint8 layer, bytes32 root, uint64 sourceBlockNumber, bytes32 evidenceHash)
        external
        onlyOperatorOrGovernance
    {
        if (layer != LAYER_L2 && layer != LAYER_L3) revert InvalidLayer(layer);
        if (!layerRootPostingEnabled[layer]) revert PostingDisabled(layer);
        if (root == bytes32(0)) revert InvalidRoot();

        bytes32 rootId = computeLayerRootId(layer, root);
        layerRootRecords[rootId] = LayerRootRecord({
            root: root,
            sourceBlockNumber: sourceBlockNumber,
            recordedAt: uint64(block.timestamp),
            evidenceHash: evidenceHash,
            recorder: msg.sender
        });

        emit LayerRootRecorded(layer, root, sourceBlockNumber, evidenceHash, msg.sender);
    }

    function queueOutboundMessage(uint8 sourceLayer, uint256 destinationChainId, address asset, uint256 amount, bytes32 payloadHash)
        external
        onlyOperatorOrGovernance
        returns (bytes32 messageId)
    {
        if (sourceLayer != LAYER_L1) revert OnlyGhostChainEgress(sourceLayer);
        if (!externalChainAllowed[destinationChainId]) revert ExternalChainNotAllowed(destinationChainId);
        require(amount > 0, "amount=0");
        require(payloadHash != bytes32(0), "payload=0");

        InterchainAuthorization auth = authorization;
        if (address(auth) != address(0)) {
            auth.consumeEgress(destinationChainId, asset, address(this), amount);
        }

        uint256 nonce = ++outboundNonce;
        messageId = keccak256(
            abi.encode(
                address(this),
                block.chainid,
                nonce,
                sourceLayer,
                destinationChainId,
                asset,
                amount,
                payloadHash,
                msg.sender
            )
        );

        outboundMessages[messageId] = OutboundMessage({
            nonce: nonce,
            sourceLayer: sourceLayer,
            destinationChainId: destinationChainId,
            asset: asset,
            amount: amount,
            payloadHash: payloadHash,
            queuedAt: uint64(block.timestamp),
            executedAt: 0,
            sender: msg.sender,
            executed: false,
            externalTxHash: bytes32(0)
        });

        emit OutboundQueued(messageId, nonce, destinationChainId, sourceLayer, asset, amount, payloadHash, msg.sender);
    }

    function markOutboundExecuted(bytes32 messageId, bytes32 externalTxHash) external onlyOperatorOrGovernance {
        OutboundMessage storage message = outboundMessages[messageId];
        if (message.queuedAt == 0) revert OutboundMissing(messageId);
        if (message.executed) revert OutboundAlreadyExecuted(messageId);

        message.executed = true;
        message.executedAt = uint64(block.timestamp);
        message.externalTxHash = externalTxHash;

        emit OutboundExecuted(messageId, externalTxHash, msg.sender);
    }

    function hasLayerRoot(uint8 layer, bytes32 root) external view returns (bool) {
        bytes32 rootId = computeLayerRootId(layer, root);
        return layerRootRecords[rootId].recordedAt != 0;
    }

    function computeLayerRootId(uint8 layer, bytes32 root) public pure returns (bytes32) {
        return keccak256(abi.encode(layer, root));
    }
}
