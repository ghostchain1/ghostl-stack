// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../common/Governed.sol";
import "../governance/InterchainAuthorization.sol";

interface IFinalityHaltOracle {
    function isFinalityHalted() external view returns (bool);
}

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
    IFinalityHaltOracle public l1FinalityOracle;
    bool public manualReadOnlyMode;
    bytes32 public readOnlyReasonHash;

    mapping(address => bool) public operators;
    mapping(uint8 => bool) public layerRootPostingEnabled;
    mapping(uint256 => bool) public externalChainAllowed;
    mapping(bytes32 => LayerRootRecord) public layerRootRecords;
    mapping(bytes32 => bytes32) public l3ParentL2Roots;
    mapping(bytes32 => OutboundMessage) public outboundMessages;

    uint256 public outboundNonce;

    event OperatorUpdated(address indexed operator, bool allowed);
    event AuthorizationUpdated(address indexed authorization);
    event L1FinalityOracleUpdated(address indexed oracle);
    event ReadOnlyModeUpdated(bool enabled, bytes32 reasonHash, address indexed executor);
    event LayerRootPostingUpdated(uint8 indexed layer, bool enabled);
    event ExternalChainAllowedUpdated(uint256 indexed chainId, bool allowed);
    event LayerRootRecorded(uint8 indexed layer, bytes32 indexed root, uint64 sourceBlockNumber, bytes32 evidenceHash, address recorder);
    event L3RootLinkedToL2(bytes32 indexed l3Root, bytes32 indexed parentL2Root);
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
    error L3RequiresParentL2Root();
    error L2ParentRootNotRecorded(bytes32 parentL2Root);
    error RootAlreadyRecorded(bytes32 root);
    error ReadOnlyModeActive();
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

    function setL1FinalityOracle(IFinalityHaltOracle l1FinalityOracle_) external onlyGovernance {
        l1FinalityOracle = l1FinalityOracle_;
        emit L1FinalityOracleUpdated(address(l1FinalityOracle_));
    }

    function setReadOnlyMode(bool enabled, bytes32 reasonHash) external onlyGovernance {
        manualReadOnlyMode = enabled;
        readOnlyReasonHash = reasonHash;
        emit ReadOnlyModeUpdated(enabled, reasonHash, msg.sender);
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

    function isReadOnlyMode() public view returns (bool) {
        if (manualReadOnlyMode) return true;
        IFinalityHaltOracle oracle = l1FinalityOracle;
        if (address(oracle) == address(0)) return false;
        return oracle.isFinalityHalted();
    }

    function recordLayerRoot(uint8 layer, bytes32 root, uint64 sourceBlockNumber, bytes32 evidenceHash)
        external
        onlyOperatorOrGovernance
    {
        _enforceWritableMode();
        if (layer != LAYER_L2 && layer != LAYER_L3) revert InvalidLayer(layer);
        if (layer == LAYER_L3) revert L3RequiresParentL2Root();
        if (!layerRootPostingEnabled[layer]) revert PostingDisabled(layer);
        if (root == bytes32(0)) revert InvalidRoot();

        bytes32 rootId = computeLayerRootId(layer, root);
        if (layerRootRecords[rootId].recordedAt != 0) revert RootAlreadyRecorded(root);
        layerRootRecords[rootId] = LayerRootRecord({
            root: root,
            sourceBlockNumber: sourceBlockNumber,
            recordedAt: uint64(block.timestamp),
            evidenceHash: evidenceHash,
            recorder: msg.sender
        });

        emit LayerRootRecorded(layer, root, sourceBlockNumber, evidenceHash, msg.sender);
    }

    /// @notice Record an L3 root that is explicitly linked to an already recorded L2 root.
    function recordL3LayerRoot(
        bytes32 l3Root,
        bytes32 parentL2Root,
        uint64 sourceBlockNumber,
        bytes32 evidenceHash
    ) external onlyOperatorOrGovernance {
        _enforceWritableMode();
        if (!layerRootPostingEnabled[LAYER_L3]) revert PostingDisabled(LAYER_L3);
        if (l3Root == bytes32(0)) revert InvalidRoot();
        if (parentL2Root == bytes32(0)) revert InvalidRoot();

        bytes32 parentRootId = computeLayerRootId(LAYER_L2, parentL2Root);
        if (layerRootRecords[parentRootId].recordedAt == 0) revert L2ParentRootNotRecorded(parentL2Root);

        bytes32 l3RootId = computeLayerRootId(LAYER_L3, l3Root);
        if (layerRootRecords[l3RootId].recordedAt != 0) revert RootAlreadyRecorded(l3Root);
        layerRootRecords[l3RootId] = LayerRootRecord({
            root: l3Root,
            sourceBlockNumber: sourceBlockNumber,
            recordedAt: uint64(block.timestamp),
            evidenceHash: evidenceHash,
            recorder: msg.sender
        });
        l3ParentL2Roots[l3Root] = parentL2Root;

        emit LayerRootRecorded(LAYER_L3, l3Root, sourceBlockNumber, evidenceHash, msg.sender);
        emit L3RootLinkedToL2(l3Root, parentL2Root);
    }

    function queueOutboundMessage(uint8 sourceLayer, uint256 destinationChainId, address asset, uint256 amount, bytes32 payloadHash)
        external
        onlyOperatorOrGovernance
        returns (bytes32 messageId)
    {
        _enforceWritableMode();
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
        _enforceWritableMode();
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

    function isLinkedL3ToL2(bytes32 l3Root, bytes32 parentL2Root) external view returns (bool) {
        return l3ParentL2Roots[l3Root] == parentL2Root;
    }

    function computeLayerRootId(uint8 layer, bytes32 root) public pure returns (bytes32) {
        return keccak256(abi.encode(layer, root));
    }

    function _enforceWritableMode() internal view {
        if (msg.sender == governor || msg.sender == timelock) return;
        if (isReadOnlyMode()) revert ReadOnlyModeActive();
    }
}
