// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../common/Governed.sol";
import "./AdapterRegistry.sol";
import "./CircuitBreaker.sol";
import "./RewardRouter.sol";
import "./OperatorBondVault.sol";
import "./IZkSettlementVerifier.sol";
import {GhostHash} from "../common/GhostHash.sol";

interface IGST20Settlement {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
}

/// @notice Canonical settlement accounting for external yield flowing back to GhostChain L1.
contract SettlementOracle is Governed {
    bytes32 private constant DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 private constant SETTLEMENT_TYPEHASH =
        keccak256(
            "Settlement(uint256 adapterId,address asset,uint256 yieldAmount,uint256 feeAmount,bytes32 commitment,uint256 sequence,uint64 issuedAt,uint64 validUntil)"
        );
    uint256 private constant SECP256K1N_HALF =
        0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0;

    AdapterRegistry public adapterRegistry;
    CircuitBreaker public circuitBreaker;
    RewardRouter public rewardRouter;
    OperatorBondVault public operatorBondVault;

    address public vault;
    address public feeReceiver;

    mapping(address => bool) public relayers;
    uint256 public minRelayers = 1;
    uint64 public maxAttestationAge = 30 minutes;

    mapping(uint256 => address) public zkVerifiers; // adapterId => verifier

    mapping(uint256 => mapping(address => uint256)) public principalDeployed; // adapterId => asset => amount
    mapping(uint256 => uint256) public totalPrincipalDeployed; // adapterId => total across assets (MVP)
    mapping(uint256 => uint64) public lastDeploymentAt;
    mapping(uint256 => uint64) public lastSettledAt;
    mapping(uint256 => uint256) public lastSequence;
    mapping(uint256 => uint256) public penaltyCount;

    mapping(uint256 => mapping(address => uint256)) public yieldSettled; // adapterId => asset => amount
    mapping(uint256 => mapping(address => uint256)) public feesPaid; // adapterId => asset => amount

    uint256 private immutable cachedChainId;
    bytes32 private immutable cachedDomainSeparator;

    event VaultSet(address indexed vault);
    event FeeReceiverSet(address indexed feeReceiver);
    event RelayerSet(address indexed relayer, bool allowed);
    event MinRelayersSet(uint256 minRelayers);
    event MaxAttestationAgeSet(uint64 maxAge);
    event ZkVerifierSet(uint256 indexed adapterId, address indexed verifier);

    event PrincipalDeployed(uint256 indexed adapterId, address indexed asset, uint256 amount, address indexed operator);
    event PrincipalUnwound(uint256 indexed adapterId, address indexed asset, uint256 amount, address indexed operator);

    event SettlementSubmitted(
        uint256 indexed adapterId,
        address indexed asset,
        uint256 yieldAmount,
        uint256 feeAmount,
        bytes32 commitment,
        uint256 sequence,
        address submitter
    );
    event SettlementOverdue(uint256 indexed adapterId, uint64 dueAt, uint64 observedAt, uint256 penaltyCount);
    event OperatorLocked(uint256 indexed adapterId, address indexed operator, bool locked);
    event OperatorSlashed(uint256 indexed adapterId, address indexed bondAsset, address indexed operator, uint256 amount, address to, bytes32 evidenceHash);

    error Unauthorized();
    error InvalidSettlement();
    error QuorumNotMet();
    error DuplicateSigner();
    error SettlementOverdueError(uint256 adapterId, uint64 dueAt);
    error ZkVerifierMissing(uint256 adapterId);
    error ZkProofInvalid();

    constructor(
        address governor_,
        address timelock_,
        AdapterRegistry adapterRegistry_,
        CircuitBreaker circuitBreaker_,
        RewardRouter rewardRouter_,
        OperatorBondVault operatorBondVault_
    ) Governed(governor_, timelock_) {
        adapterRegistry = adapterRegistry_;
        circuitBreaker = circuitBreaker_;
        rewardRouter = rewardRouter_;
        operatorBondVault = operatorBondVault_;

        cachedChainId = block.chainid;
        cachedDomainSeparator = _buildDomainSeparator();
    }

    modifier onlyVaultOrGovernance() {
        if (!_isGovernance(msg.sender) && msg.sender != vault) revert Unauthorized();
        _;
    }

    function setVault(address vault_) external onlyGovernance {
        require(vault_ != address(0), "vault=0");
        vault = vault_;
        emit VaultSet(vault_);
    }

    function setFeeReceiver(address feeReceiver_) external onlyGovernance {
        require(feeReceiver_ != address(0), "feeReceiver=0");
        feeReceiver = feeReceiver_;
        emit FeeReceiverSet(feeReceiver_);
    }

    function setRelayer(address relayer, bool allowed) external onlyGovernance {
        require(relayer != address(0), "relayer=0");
        relayers[relayer] = allowed;
        emit RelayerSet(relayer, allowed);
    }

    function setMinRelayers(uint256 minRelayers_) external onlyGovernance {
        require(minRelayers_ != 0, "min=0");
        minRelayers = minRelayers_;
        emit MinRelayersSet(minRelayers_);
    }

    function setMaxAttestationAge(uint64 maxAge) external onlyGovernance {
        require(maxAge != 0, "age=0");
        maxAttestationAge = maxAge;
        emit MaxAttestationAgeSet(maxAge);
    }

    function setZkVerifier(uint256 adapterId, address verifier) external onlyGovernance {
        require(adapterId != 0, "adapterId=0");
        if (verifier != address(0)) {
            require(verifier.code.length != 0, "verifier not contract");
        }
        // Ensure adapter exists (reverts if missing).
        adapterRegistry.getAdapter(adapterId);
        zkVerifiers[adapterId] = verifier;
        emit ZkVerifierSet(adapterId, verifier);
    }

    function domainSeparator() external view returns (bytes32) {
        return _domainSeparator();
    }

    function hashSettlement(
        uint256 adapterId,
        address asset,
        uint256 yieldAmount,
        uint256 feeAmount,
        bytes32 commitment,
        uint256 sequence,
        uint64 issuedAt,
        uint64 validUntil
    ) public pure returns (bytes32 result) {
        bytes32 typehash = SETTLEMENT_TYPEHASH;
        assembly {
            let p := mload(0x40)
            mstore(p,           typehash)
            mstore(add(p,0x20), adapterId)
            mstore(add(p,0x40), asset)
            mstore(add(p,0x60), yieldAmount)
            mstore(add(p,0x80), feeAmount)
            mstore(add(p,0xa0), commitment)
            mstore(add(p,0xc0), sequence)
            mstore(add(p,0xe0), issuedAt)
            mstore(add(p,0x100), validUntil)
            result := keccak256(p, 0x120)
        }
    }

    function digestSettlement(
        uint256 adapterId,
        address asset,
        uint256 yieldAmount,
        uint256 feeAmount,
        bytes32 commitment,
        uint256 sequence,
        uint64 issuedAt,
        uint64 validUntil
    ) external view returns (bytes32) {
        bytes32 structHash = hashSettlement(adapterId, asset, yieldAmount, feeAmount, commitment, sequence, issuedAt, validUntil);
        return GhostHash.eip712Digest(_domainSeparator(), structHash);
    }

    /// #if_succeeds principalDeployed[adapterId][asset] == old(principalDeployed[adapterId][asset]) + amount;
    /// #if_succeeds totalPrincipalDeployed[adapterId] == old(totalPrincipalDeployed[adapterId]) + amount;
    function recordDeploy(uint256 adapterId, address asset, uint256 amount, address operator) external onlyVaultOrGovernance {
        require(amount != 0, "amount=0");
        principalDeployed[adapterId][asset] += amount;
        totalPrincipalDeployed[adapterId] += amount;
        if (lastDeploymentAt[adapterId] == 0) {
            lastDeploymentAt[adapterId] = uint64(block.timestamp);
        }
        emit PrincipalDeployed(adapterId, asset, amount, operator);
    }

    /// #if_succeeds principalDeployed[adapterId][asset] == old(principalDeployed[adapterId][asset]) - amount;
    /// #if_succeeds totalPrincipalDeployed[adapterId] == old(totalPrincipalDeployed[adapterId]) - amount;
    function recordUnwind(uint256 adapterId, address asset, uint256 amount, address operator) external onlyVaultOrGovernance {
        require(amount != 0, "amount=0");
        uint256 p = principalDeployed[adapterId][asset];
        require(p >= amount, "principal");
        unchecked {
            principalDeployed[adapterId][asset] = p - amount;
            totalPrincipalDeployed[adapterId] -= amount;
        }
        emit PrincipalUnwound(adapterId, asset, amount, operator);
    }

    function requireCanContinue(uint256 adapterId) external view {
        (bool ok, uint64 dueAt) = canContinue(adapterId);
        if (!ok) revert SettlementOverdueError(adapterId, dueAt);
    }

    function canContinue(uint256 adapterId) public view returns (bool ok, uint64 dueAt) {
        uint256 deployed = totalPrincipalDeployed[adapterId];
        if (deployed == 0) return (true, 0);

        AdapterRegistry.AdapterConfig memory cfg = adapterRegistry.getAdapter(adapterId);
        if (!cfg.enabled) return (false, 0);
        if (cfg.paused) return (false, 0);
        if (cfg.settlementInterval == 0) return (false, 0);

        uint64 anchor = lastSettledAt[adapterId];
        if (anchor < 1) anchor = lastDeploymentAt[adapterId];
        if (anchor < 1) return (false, 0);
        dueAt = anchor + cfg.settlementInterval;
        if (block.timestamp > dueAt) return (false, dueAt);
        return (true, dueAt);
    }

    /// @notice Public safety hook: if settlement is overdue and principal is outstanding, pause the adapter and record a penalty.
    function enforceSettlementWindow(uint256 adapterId) external {
        (bool ok, uint64 dueAt) = canContinue(adapterId);
        if (ok) return;
        if (totalPrincipalDeployed[adapterId] == 0) return;

        // Pause as a safety action; CircuitBreaker enforces operator gating.
        circuitBreaker.pauseAdapter(adapterId);
        penaltyCount[adapterId] += 1;

        // Optionally lock the operator bond if this oracle is authorized as a slasher.
        AdapterRegistry.AdapterConfig memory cfg = adapterRegistry.getAdapter(adapterId);
        OperatorBondVault bondVault = operatorBondVault;
        if (address(bondVault) != address(0)) {
            try bondVault.slashers(address(this)) returns (bool allowed) {
                if (allowed) {
                    bondVault.setOperatorLocked(cfg.operator, true);
                    emit OperatorLocked(adapterId, cfg.operator, true);
                }
            } catch {
                // ignore
            }
        }

        emit SettlementOverdue(adapterId, dueAt, uint64(block.timestamp), penaltyCount[adapterId]);
    }

    /// @notice Slash an operator bond with governance authorization (fraud proof / negligence evidence).
    function slashOperator(uint256 adapterId, address bondAsset, address operator, uint256 amount, address to, bytes32 evidenceHash)
        external
        onlyGovernance
    {
        require(operator != address(0), "operator=0");
        OperatorBondVault bondVault = operatorBondVault;
        require(address(bondVault) != address(0), "bondVault=0");
        bondVault.slash(bondAsset, operator, amount, to, evidenceHash);
        emit OperatorSlashed(adapterId, bondAsset, operator, amount, to, evidenceHash);
    }

    /// #if_succeeds lastSequence[adapterId] == sequence;
    /// #if_succeeds lastSettledAt[adapterId] >= old(lastSettledAt[adapterId]);
    function submitSettlement(
        uint256 adapterId,
        address asset,
        uint256 yieldAmount,
        uint256 feeAmount,
        bytes32 commitment,
        uint256 sequence,
        uint64 issuedAt,
        uint64 validUntil,
        bytes[] calldata signatures
    ) external payable {
        AdapterRegistry.AdapterConfig memory cfg = adapterRegistry.getAdapter(adapterId);
        if (!cfg.enabled || cfg.paused) revert InvalidSettlement();
        if (cfg.proofType != AdapterRegistry.ProofType.ECDSA_ATTESTATION) revert InvalidSettlement();
        if (sequence != lastSequence[adapterId] + 1) revert InvalidSettlement();
        if (commitment == bytes32(0)) revert InvalidSettlement();

        if (issuedAt > block.timestamp) revert InvalidSettlement();
        if (validUntil < block.timestamp) revert InvalidSettlement();
        if (block.timestamp - issuedAt > maxAttestationAge) revert InvalidSettlement();

        // If settlement is overdue, allow settlement to proceed (it should restore liveness) but it will remain paused until governance unpauses.
        bytes32 structHash = hashSettlement(adapterId, asset, yieldAmount, feeAmount, commitment, sequence, issuedAt, validUntil);
        bytes32 digest = GhostHash.eip712Digest(_domainSeparator(), structHash);
        _validateSignatures(digest, signatures);

        _acceptSettlement(adapterId, asset, yieldAmount, feeAmount, commitment, sequence);
    }

    /// #if_succeeds lastSequence[adapterId] == sequence;
    /// #if_succeeds lastSettledAt[adapterId] >= old(lastSettledAt[adapterId]);
    function submitSettlementZk(
        uint256 adapterId,
        address asset,
        uint256 yieldAmount,
        uint256 feeAmount,
        bytes32 commitment,
        uint256 sequence,
        uint64 issuedAt,
        uint64 validUntil,
        bytes calldata proof
    ) external payable {
        AdapterRegistry.AdapterConfig memory cfg = adapterRegistry.getAdapter(adapterId);
        if (!cfg.enabled || cfg.paused) revert InvalidSettlement();
        if (cfg.proofType != AdapterRegistry.ProofType.ZK_PROOF) revert InvalidSettlement();
        if (sequence != lastSequence[adapterId] + 1) revert InvalidSettlement();
        if (commitment == bytes32(0)) revert InvalidSettlement();

        if (issuedAt > block.timestamp) revert InvalidSettlement();
        if (validUntil < block.timestamp) revert InvalidSettlement();
        if (block.timestamp - issuedAt > maxAttestationAge) revert InvalidSettlement();

        address verifier = zkVerifiers[adapterId];
        if (verifier == address(0)) revert ZkVerifierMissing(adapterId);

        bytes32 structHash = hashSettlement(adapterId, asset, yieldAmount, feeAmount, commitment, sequence, issuedAt, validUntil);
        bytes32 digest = GhostHash.eip712Digest(_domainSeparator(), structHash);
        bool ok = IZkSettlementVerifier(verifier).verifySettlement(digest, proof);
        if (!ok) revert ZkProofInvalid();

        _acceptSettlement(adapterId, asset, yieldAmount, feeAmount, commitment, sequence);
    }

    function _acceptSettlement(
        uint256 adapterId,
        address asset,
        uint256 yieldAmount,
        uint256 feeAmount,
        bytes32 commitment,
        uint256 sequence
    ) internal {
        uint256 totalIn = yieldAmount + feeAmount;
        require(totalIn != 0, "total=0");
        if (asset == address(0)) {
            require(msg.value == totalIn, "value");
        } else {
            require(msg.value == 0, "no value");
            require(IGST20Settlement(asset).transferFrom(msg.sender, address(this), totalIn), "transferFrom");
        }

        lastSequence[adapterId] = sequence;
        lastSettledAt[adapterId] = uint64(block.timestamp);

        if (yieldAmount != 0) {
            yieldSettled[adapterId][asset] += yieldAmount;
            if (asset == address(0)) {
                rewardRouter.distribute{value: yieldAmount}(asset, yieldAmount);
            } else {
                require(IGST20Settlement(asset).transfer(address(rewardRouter), yieldAmount), "to router");
                rewardRouter.distribute(asset, yieldAmount);
            }
        }

        if (feeAmount != 0) {
            feesPaid[adapterId][asset] += feeAmount;
            address receiver = feeReceiver;
            require(receiver != address(0), "feeReceiver=0");
            if (asset == address(0)) {
                (bool ok, ) = payable(receiver).call{value: feeAmount}("");
                require(ok, "fee eth");
            } else {
                require(IGST20Settlement(asset).transfer(receiver, feeAmount), "fee");
            }
        }

        emit SettlementSubmitted(adapterId, asset, yieldAmount, feeAmount, commitment, sequence, msg.sender);
    }

    function _validateSignatures(bytes32 digest, bytes[] calldata signatures) internal view {
        if (signatures.length < minRelayers) revert QuorumNotMet();
        address[] memory seen = new address[](signatures.length);
        uint256 valid = 0;
        for (uint256 i = 0; i < signatures.length; i++) {
            address signer = _recoverSigner(digest, signatures[i]);
            if (!relayers[signer]) {
                continue;
            }
            for (uint256 j = 0; j < valid; j++) {
                if (seen[j] == signer) revert DuplicateSigner();
            }
            seen[valid] = signer;
            valid++;
            if (valid >= minRelayers) {
                return;
            }
        }
        revert QuorumNotMet();
    }

    function _recoverSigner(bytes32 digest, bytes calldata signature) internal pure returns (address) {
        require(signature.length == 65, "sig length");
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := calldataload(signature.offset)
            s := calldataload(add(signature.offset, 32))
            v := byte(0, calldataload(add(signature.offset, 64)))
        }
        if (v < 27) v += 27;
        require(v == 27 || v == 28, "sig v");
        require(uint256(s) <= SECP256K1N_HALF, "sig s");
        address signer = ecrecover(digest, v, r, s);
        require(signer != address(0), "sig");
        return signer;
    }

    function _domainSeparator() internal view returns (bytes32) {
        if (block.chainid == cachedChainId) {
            return cachedDomainSeparator;
        }
        return _buildDomainSeparator();
    }

    function _buildDomainSeparator() internal view returns (bytes32) {
        return keccak256(
            abi.encode(
                DOMAIN_TYPEHASH,
                keccak256(bytes("GhostSettlementOracle")),
                keccak256(bytes("1")),
                block.chainid,
                address(this)
            )
        );
    }

    function _isGovernance(address caller) internal view returns (bool) {
        return caller == governor || (timelock != address(0) && caller == timelock);
    }
}
