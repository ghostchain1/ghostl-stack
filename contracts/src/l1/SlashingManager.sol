// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../common/Governed.sol";
import "../ai/PolicyGuard.sol";
import "./StakingManager.sol";

/// @notice Coordinates fee-policy slashing events in canonical GHOST units.
contract SlashingManager is Governed {
    address internal constant CANONICAL_GAS_TOKEN = 0x5FbDB2315678afecb367f032d93F642f64180aa3;
    uint256 internal constant BPS_DENOMINATOR = 10_000;
    bytes32 internal constant ACTION_SET_FEE_POLICY = keccak256("slashing.setFeePolicy");

    StakingManager public staking;
    PolicyGuard public policyGuard;

    struct FeePolicyParams {
        uint256 maxBaseFeeGHOST;
        uint256 maxPriorityFeeGHOST;
        uint256 spikeThresholdBps;
        uint256 windowSeconds;
        uint256 violationPenaltyBps;
        uint256 minBondGHOST;
    }

    struct FeeViolationEvidence {
        uint256 chainId;
        uint256 blockStart;
        uint256 blockEnd;
        uint256 observedBaseFee;
        uint256 observedPriorityFee;
        uint256 prevBaseFee;
        uint256 prevPriorityFee;
        bytes32 logsHash;
        address attestor;
        bytes signature;
    }

    struct FeeViolation {
        address operator;
        uint256 chainId;
        uint256 blockStart;
        uint256 blockEnd;
        uint256 observedBaseFee;
        uint256 observedPriorityFee;
        uint256 prevBaseFee;
        uint256 prevPriorityFee;
        bytes32 logsHash;
        address attestor;
        uint8 reasonCode;
        uint256 slashAmount;
        bool slashed;
        uint256 timestamp;
    }

    FeePolicyParams public feePolicy;
    bool public autoExecEnabled;
    mapping(address => bool) public watchers;
    mapping(uint256 => FeeViolation) public violations;
    uint256 public violationCount;

    event FeePolicyUpdated(FeePolicyParams policy);
    event WatcherUpdated(address indexed watcher, bool allowed);
    event AutoExecUpdated(bool enabled);
    event FeeViolationReported(
        uint256 indexed violationId,
        address indexed operator,
        uint256 indexed chainId,
        uint8 reasonCode,
        uint256 slashAmount,
        bytes32 logsHash,
        address attestor
    );
    event Slashed(address indexed staker, uint256 amount, uint8 reasonCode, uint256 indexed violationId);
    event OperatorSlashed(
        address indexed staker,
        uint256 indexed chainId,
        uint256 amount,
        uint8 reasonCode,
        uint256 indexed violationId
    );
    event PolicyGuardUpdated(address indexed policyGuard);
    event PolicyGuardBypassed(address indexed caller, bytes32 indexed action);

    constructor(StakingManager _staking, address governor_, address timelock_) Governed(governor_, timelock_) {
        staking = _staking;
    }

    function setStakingManager(StakingManager _staking) external onlyGovernance {
        staking = _staking;
    }

    function setPolicyGuard(PolicyGuard guard) external onlyGovernance {
        policyGuard = guard;
        emit PolicyGuardUpdated(address(guard));
    }

    function setFeePolicy(FeePolicyParams calldata policy) external onlyGovernance {
        _enforcePolicyGuard(policy);
        _setFeePolicy(policy);
    }

    /// @notice Explicit governance override that bypasses PolicyGuard checks.
    function setFeePolicyBypass(FeePolicyParams calldata policy) external onlyGovernance {
        emit PolicyGuardBypassed(msg.sender, ACTION_SET_FEE_POLICY);
        _setFeePolicy(policy);
    }

    function _setFeePolicy(FeePolicyParams calldata policy) internal {
        require(policy.maxBaseFeeGHOST > 0, "maxBaseFee=0");
        require(policy.maxPriorityFeeGHOST > 0, "maxPriorityFee=0");
        require(policy.spikeThresholdBps <= BPS_DENOMINATOR, "spike>bips");
        require(policy.windowSeconds >= 30 && policy.windowSeconds <= 1 days, "window bounds");
        require(policy.violationPenaltyBps > 0 && policy.violationPenaltyBps <= BPS_DENOMINATOR, "penalty bounds");
        require(policy.minBondGHOST > 0, "minBond=0");
        feePolicy = policy;
        emit FeePolicyUpdated(policy);
    }

    function _enforcePolicyGuard(FeePolicyParams calldata policy) internal {
        PolicyGuard guard = policyGuard;
        if (address(guard) == address(0)) {
            return;
        }
        guard.enforcePolicy(address(this), ACTION_SET_FEE_POLICY, abi.encode(policy));
    }

    function setWatcherRoles(address watcher, bool allowed) external onlyGovernance {
        watchers[watcher] = allowed;
        emit WatcherUpdated(watcher, allowed);
    }

    function enableAutoExec(bool enabled) external onlyGovernance {
        autoExecEnabled = enabled;
        emit AutoExecUpdated(enabled);
    }

    function reportFeeViolation(address operator, FeeViolationEvidence calldata evidence)
        external
        returns (uint256 violationId, uint256 slashAmount)
    {
        require(watchers[msg.sender], "watcher only");
        require(feePolicy.minBondGHOST > 0, "policy unset");

        _validateEvidence(operator, evidence);

        uint8 reasonCode = _reasonForViolation(operator, evidence);
        require(reasonCode != 0, "no violation");

        slashAmount = _slashAmount(operator);
        violationId = _recordViolation(operator, evidence, reasonCode, slashAmount);

        emit FeeViolationReported(violationId, operator, evidence.chainId, reasonCode, slashAmount, evidence.logsHash, evidence.attestor);

        if (autoExecEnabled && slashAmount > 0) {
            _executeSlash(violationId, operator, slashAmount, reasonCode);
        }
    }

    function executeViolation(uint256 violationId) external onlyGovernance {
        FeeViolation storage violation = violations[violationId];
        require(violation.operator != address(0), "unknown violation");
        require(!violation.slashed, "already slashed");
        uint256 amount = violation.slashAmount;
        require(amount > 0, "no slash");
        _executeSlash(violationId, violation.operator, amount, violation.reasonCode);
    }

    function slash(address staker, uint256 amount, uint8 reasonCode) external onlyGovernance {
        _executeSlash(0, staker, amount, reasonCode);
    }

    function gasTokenAddress() external pure returns (address) {
        return CANONICAL_GAS_TOKEN;
    }

    function _executeSlash(uint256 violationId, address staker, uint256 amount, uint8 reasonCode) internal {
        uint256 chainId = violationId != 0 ? violations[violationId].chainId : block.chainid;
        staking.slash(staker, amount);
        if (violationId != 0) {
            violations[violationId].slashed = true;
        }
        emit Slashed(staker, amount, reasonCode, violationId);
        emit OperatorSlashed(staker, chainId, amount, reasonCode, violationId);
    }

    function _recordViolation(address operator, FeeViolationEvidence calldata evidence, uint8 reasonCode, uint256 slashAmount)
        internal
        returns (uint256 violationId)
    {
        violationId = ++violationCount;
        FeeViolation storage violation = violations[violationId];
        violation.operator = operator;
        violation.chainId = evidence.chainId;
        violation.blockStart = evidence.blockStart;
        violation.blockEnd = evidence.blockEnd;
        violation.observedBaseFee = evidence.observedBaseFee;
        violation.observedPriorityFee = evidence.observedPriorityFee;
        violation.prevBaseFee = evidence.prevBaseFee;
        violation.prevPriorityFee = evidence.prevPriorityFee;
        violation.logsHash = evidence.logsHash;
        violation.attestor = evidence.attestor;
        violation.reasonCode = reasonCode;
        violation.slashAmount = slashAmount;
        violation.slashed = false;
        violation.timestamp = block.timestamp;
    }

    function _slashAmount(address operator) internal view returns (uint256) {
        uint256 bond = staking.stakes(operator);
        if (bond == 0) return 0;
        uint256 amount = (bond * feePolicy.violationPenaltyBps) / BPS_DENOMINATOR;
        if (amount == 0) {
            amount = feePolicy.minBondGHOST;
        }
        if (amount > bond) amount = bond;
        return amount;
    }

    function _reasonForViolation(address operator, FeeViolationEvidence calldata evidence) internal view returns (uint8) {
        if (evidence.observedBaseFee > feePolicy.maxBaseFeeGHOST) return 1;
        if (evidence.observedPriorityFee > feePolicy.maxPriorityFeeGHOST) return 2;
        if (evidence.prevBaseFee > 0) {
            uint256 maxAllowed = (evidence.prevBaseFee * (BPS_DENOMINATOR + feePolicy.spikeThresholdBps)) / BPS_DENOMINATOR;
            if (evidence.observedBaseFee > maxAllowed) return 3;
        }
        if (staking.stakes(operator) < feePolicy.minBondGHOST) return 4;
        return 0;
    }

    function _validateEvidence(address operator, FeeViolationEvidence memory evidence) internal view {
        require(evidence.chainId != 0, "chainId=0");
        require(evidence.blockEnd >= evidence.blockStart, "block range");
        require(evidence.attestor != address(0), "attestor=0");

        bytes32 digest = keccak256(abi.encode(operator, _evidenceHash(evidence)));
        if (evidence.signature.length == 65) {
            address signer = _recoverSigner(digest, evidence.signature);
            require(signer == evidence.attestor, "bad signature");
        }
    }

    function _evidenceHash(FeeViolationEvidence memory evidence) internal pure returns (bytes32) {
        bytes32 rangeHash = _evidenceRangeHash(evidence);
        bytes32 feeHash = _evidenceFeeHash(evidence);
        return keccak256(abi.encode(rangeHash, feeHash, evidence.logsHash, evidence.attestor));
    }

    function _evidenceRangeHash(FeeViolationEvidence memory evidence) internal pure returns (bytes32) {
        return keccak256(abi.encode(evidence.chainId, evidence.blockStart, evidence.blockEnd));
    }

    function _evidenceFeeHash(FeeViolationEvidence memory evidence) internal pure returns (bytes32) {
        return keccak256(
            abi.encode(
                evidence.observedBaseFee,
                evidence.observedPriorityFee,
                evidence.prevBaseFee,
                evidence.prevPriorityFee
            )
        );
    }

    function _recoverSigner(bytes32 digest, bytes memory signature) internal pure returns (address) {
        bytes32 r;
        bytes32 s;
        uint8 v;
        // solhint-disable-next-line no-inline-assembly
        assembly {
            r := mload(add(signature, 0x20))
            s := mload(add(signature, 0x40))
            v := byte(0, mload(add(signature, 0x60)))
        }
        if (v < 27) v += 27;
        bytes32 ethSigned = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", digest));
        return ecrecover(ethSigned, v, r, s);
    }
}
