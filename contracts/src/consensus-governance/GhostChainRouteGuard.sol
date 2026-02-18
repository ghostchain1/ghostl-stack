// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../common/Governed.sol";
import "../l1/ValidatorRegistry.sol";

/// @notice L2/L3 route guard that accepts cross-chain proofs only after GhostChain validator attestations.
contract GhostChainRouteGuard is Governed {
    uint8 public constant SOURCE_LAYER_L1 = 1;

    struct FinalityAttestation {
        uint8 sourceLayer;
        bytes32 root;
        uint64 ghostChainBlockNumber;
        uint64 validUntil;
        uint64 nonce;
    }

    struct FinalizedRoot {
        bytes32 root;
        uint8 sourceLayer;
        uint16 signerCount;
        uint64 ghostChainBlockNumber;
        uint64 recordedAt;
        uint64 validUntil;
        bytes32 digest;
        address recorder;
    }

    uint8 public immutable localLayer;

    ValidatorRegistry public validatorRegistry;
    uint16 public minSigners;

    mapping(address => bool) public relayers;
    mapping(bytes32 => bool) public usedDigests;
    mapping(bytes32 => FinalizedRoot) public finalizedRootByKey;

    event ValidatorRegistryUpdated(address indexed validatorRegistry);
    event MinSignersUpdated(uint16 minSigners);
    event RelayerUpdated(address indexed relayer, bool allowed);
    event RootFinalized(
        bytes32 indexed rootKey,
        bytes32 indexed root,
        uint8 indexed sourceLayer,
        uint16 signerCount,
        uint64 ghostChainBlockNumber,
        bytes32 digest,
        address recorder
    );

    error NotRelayer();
    error InvalidLayer(uint8 layer);
    error InvalidRoot();
    error InvalidSignatureLength();
    error InvalidSigner(address signer);
    error DuplicateSigner(address signer);
    error NotEnoughSigners(uint256 signerCount, uint256 minSigners);
    error AttestationExpired(uint64 validUntil, uint64 currentTimestamp);
    error DigestAlreadyUsed(bytes32 digest);
    error RootAlreadyFinalized(bytes32 rootKey);
    error RootNotFinalized(bytes32 rootKey);

    constructor(address governor_, address timelock_, ValidatorRegistry validatorRegistry_, uint16 minSigners_, uint8 localLayer_)
        Governed(governor_, timelock_)
    {
        require(address(validatorRegistry_) != address(0), "validatorRegistry=0");
        require(minSigners_ > 0, "minSigners=0");
        require(localLayer_ == 2 || localLayer_ == 3, "localLayer");

        validatorRegistry = validatorRegistry_;
        minSigners = minSigners_;
        localLayer = localLayer_;

        emit ValidatorRegistryUpdated(address(validatorRegistry_));
        emit MinSignersUpdated(minSigners_);
    }

    modifier onlyRelayerOrGovernance() {
        if (msg.sender != governor && msg.sender != timelock && !relayers[msg.sender]) revert NotRelayer();
        _;
    }

    function setValidatorRegistry(ValidatorRegistry validatorRegistry_) external onlyGovernance {
        require(address(validatorRegistry_) != address(0), "validatorRegistry=0");
        validatorRegistry = validatorRegistry_;
        emit ValidatorRegistryUpdated(address(validatorRegistry_));
    }

    function setMinSigners(uint16 minSigners_) external onlyGovernance {
        require(minSigners_ > 0, "minSigners=0");
        minSigners = minSigners_;
        emit MinSignersUpdated(minSigners_);
    }

    function setRelayer(address relayer, bool allowed) external onlyGovernance {
        relayers[relayer] = allowed;
        emit RelayerUpdated(relayer, allowed);
    }

    function submitFinalityAttestation(FinalityAttestation calldata attestation, bytes[] calldata signatures)
        external
        onlyRelayerOrGovernance
        returns (bytes32 rootKey)
    {
        if (attestation.sourceLayer != SOURCE_LAYER_L1) revert InvalidLayer(attestation.sourceLayer);
        if (attestation.root == bytes32(0)) revert InvalidRoot();
        if (attestation.validUntil <= block.timestamp) {
            revert AttestationExpired(attestation.validUntil, uint64(block.timestamp));
        }

        bytes32 digest = _attestationDigest(attestation);
        if (usedDigests[digest]) revert DigestAlreadyUsed(digest);

        rootKey = computeRootKey(attestation.sourceLayer, attestation.root);
        if (finalizedRootByKey[rootKey].recordedAt != 0) revert RootAlreadyFinalized(rootKey);

        uint16 signerCount = _verifySignatures(digest, signatures);
        usedDigests[digest] = true;

        finalizedRootByKey[rootKey] = FinalizedRoot({
            root: attestation.root,
            sourceLayer: attestation.sourceLayer,
            signerCount: signerCount,
            ghostChainBlockNumber: attestation.ghostChainBlockNumber,
            recordedAt: uint64(block.timestamp),
            validUntil: attestation.validUntil,
            digest: digest,
            recorder: msg.sender
        });

        emit RootFinalized(
            rootKey,
            attestation.root,
            attestation.sourceLayer,
            signerCount,
            attestation.ghostChainBlockNumber,
            digest,
            msg.sender
        );
    }

    function requireFinalizedRoot(uint8 sourceLayer, bytes32 root) external view returns (bool) {
        bytes32 rootKey = computeRootKey(sourceLayer, root);
        if (finalizedRootByKey[rootKey].recordedAt == 0) revert RootNotFinalized(rootKey);
        return true;
    }

    function isFinalizedRoot(uint8 sourceLayer, bytes32 root) external view returns (bool) {
        bytes32 rootKey = computeRootKey(sourceLayer, root);
        return finalizedRootByKey[rootKey].recordedAt != 0;
    }

    function computeRootKey(uint8 sourceLayer, bytes32 root) public pure returns (bytes32) {
        return keccak256(abi.encode(sourceLayer, root));
    }

    function _verifySignatures(bytes32 digest, bytes[] calldata signatures) internal view returns (uint16 signerCount) {
        uint256 len = signatures.length;
        require(len > 0, "signatures=0");

        address[] memory seen = new address[](len);

        for (uint256 i = 0; i < len; i++) {
            address signer = _recoverSigner(digest, signatures[i]);
            if (!validatorRegistry.isValidator(signer)) revert InvalidSigner(signer);

            for (uint256 j = 0; j < signerCount; j++) {
                if (seen[j] == signer) revert DuplicateSigner(signer);
            }

            seen[signerCount] = signer;
            signerCount += 1;
        }

        if (signerCount < minSigners) revert NotEnoughSigners(signerCount, minSigners);
    }

    function _attestationDigest(FinalityAttestation calldata attestation) internal view returns (bytes32) {
        return keccak256(
            abi.encode(
                address(this),
                block.chainid,
                localLayer,
                attestation.sourceLayer,
                attestation.root,
                attestation.ghostChainBlockNumber,
                attestation.validUntil,
                attestation.nonce
            )
        );
    }

    function _recoverSigner(bytes32 digest, bytes calldata signature) internal pure returns (address signer) {
        if (signature.length != 65) revert InvalidSignatureLength();

        bytes32 r;
        bytes32 s;
        uint8 v;

        assembly {
            r := calldataload(signature.offset)
            s := calldataload(add(signature.offset, 32))
            v := byte(0, calldataload(add(signature.offset, 64)))
        }

        if (v < 27) v += 27;
        signer = ecrecover(digest, v, r, s);
        if (signer == address(0)) revert InvalidSigner(address(0));
    }
}
