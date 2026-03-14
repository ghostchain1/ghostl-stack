// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./GuardPolicy.sol";
import "./GST20.sol";
import "./compliance/ComplianceProofGuard.sol";
import "./common/GhostHash.sol";

interface IL2FinalityOracle {
    function isFinalizedOnL1(bytes32 l2StateRoot) external view returns (bool);
    function isFinalityHalted() external view returns (bool);
}

interface IL3FinalityOracle {
    function isFinalizedOnL2(bytes32 l3StateRoot) external view returns (bool);
    function isParentL2FinalizedOnL1(bytes32 parentL2StateRoot) external view returns (bool);
    function isFinalityHalted() external view returns (bool);
}

// slither-disable-next-line locked-ether
contract L2L3Bridge {
    GuardPolicy public policy;
    ComplianceProofGuard public complianceGuard;
    IL2FinalityOracle public l2FinalityOracle;
    IL3FinalityOracle public l3FinalityOracle;

    address public owner;
    address public relayer;
    bool public requireComplianceRoot = true;
    bool public enforceHierarchicalFinality;

    // (actor, amount, nonce) => timestamp deposit initiated
    mapping(bytes32 => uint256) public depositTime;
    // (token, actor, amount, nonce) => timestamp deposit initiated
    mapping(bytes32 => uint256) public gst20DepositTime;
    mapping(bytes32 => bool) public gst20WithdrawProcessed;

    event DepositInitiated(address indexed from, address indexed to, uint256 amount, uint256 nonce);
    event Finalized(address indexed from, address indexed to, uint256 amount, uint256 nonce);
    event GST20DepositInitiated(address indexed token, address indexed from, address indexed to, uint256 amount, uint256 nonce);
    event GST20Finalized(address indexed token, address indexed from, address indexed to, uint256 amount, uint256 nonce);
    event GST20WithdrawReleased(address indexed token, address indexed from, address indexed to, uint256 amount, uint256 nonce);
    event PolicyChanged(address indexed policy);
    event ComplianceGuardChanged(address indexed guard);
    event ComplianceRootRequirementUpdated(bool required);
    event RelayerChanged(address indexed relayer);
    event L2FinalityOracleChanged(address indexed oracle);
    event L3FinalityOracleChanged(address indexed oracle);
    event HierarchicalFinalityEnforcementChanged(bool enabled);

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    constructor(address policyAddr) {
        owner = msg.sender;
        policy = GuardPolicy(policyAddr);
        relayer = msg.sender;
    }

    function setPolicy(address policyAddr) external onlyOwner {
        policy = GuardPolicy(policyAddr);
        emit PolicyChanged(policyAddr);
    }

    function setRelayer(address relayerAddr) external onlyOwner {
        relayer = relayerAddr;
        emit RelayerChanged(relayerAddr);
    }

    function setComplianceGuard(address guardAddr) external onlyOwner {
        complianceGuard = ComplianceProofGuard(guardAddr);
        emit ComplianceGuardChanged(guardAddr);
    }

    function setRequireComplianceRoot(bool required) external onlyOwner {
        requireComplianceRoot = required;
        emit ComplianceRootRequirementUpdated(required);
    }

    function setL2FinalityOracle(address oracle) external onlyOwner {
        l2FinalityOracle = IL2FinalityOracle(oracle);
        emit L2FinalityOracleChanged(oracle);
    }

    function setL3FinalityOracle(address oracle) external onlyOwner {
        l3FinalityOracle = IL3FinalityOracle(oracle);
        emit L3FinalityOracleChanged(oracle);
    }

    function setEnforceHierarchicalFinality(bool enabled) external onlyOwner {
        enforceHierarchicalFinality = enabled;
        emit HierarchicalFinalityEnforcementChanged(enabled);
    }

    modifier onlyRelayer() {
        require(msg.sender == relayer, "not relayer");
        _;
    }

    /// User deposits on L2 to mint/release on L3 (offchain relayer can mirror on the other chain).
    function depositToL3(address to, uint256 amount, uint256 nonce) external {
        // In MVP we just emit an event; funds handling can be added later (GST20 escrow etc).
        bytes32 key = GhostHash.bridgeNativeKey(msg.sender, to, amount, nonce);
        // slither-disable-next-line incorrect-equality
        require(depositTime[key] == 0, "already");
        depositTime[key] = block.timestamp;
        emit DepositInitiated(msg.sender, to, amount, nonce);
    }

    /// Deposit an GST20 on L2 to mint the bridged representation on L3.
    function depositGST20ToL3(address token, address to, uint256 amount, uint256 nonce) external {
        bytes32 key = GhostHash.bridgeTokenKey(token, msg.sender, to, amount, nonce);
        // slither-disable-next-line incorrect-equality
        require(gst20DepositTime[key] == 0, "already");
        gst20DepositTime[key] = block.timestamp;
        require(GST20(token).transferFrom(msg.sender, address(this), amount), "transferFrom");
        emit GST20DepositInitiated(token, msg.sender, to, amount, nonce);
    }

    /// Finalize step: guarded by policy (ALLOW/DELAY/PAUSE + risk threshold)
    /// #if_succeeds {:msg "only relayer finalize"} msg.sender == relayer;
    /// #if_succeeds {:msg "deposit consumed"} depositTime[keccak256(abi.encode(from, to, amount, nonce))] == 0;
    function finalizeToL3(address from, address to, uint256 amount, uint256 nonce) external onlyRelayer {
        _finalizeToL3(from, to, amount, nonce, bytes32(0));
    }

    /// @notice Cascading-finality aware finalize path for hierarchical mode.
    function finalizeToL3WithFinality(address from, address to, uint256 amount, uint256 nonce, bytes32 l2StateRoot)
        external
        onlyRelayer
    {
        _finalizeToL3(from, to, amount, nonce, l2StateRoot);
    }

    function finalizeGST20ToL3(address token, address from, address to, uint256 amount, uint256 nonce)
        external
        onlyRelayer
    {
        _finalizeGST20ToL3(token, from, to, amount, nonce, bytes32(0));
    }

    /// @notice Cascading-finality aware GST20 finalize path for hierarchical mode.
    function finalizeGST20ToL3WithFinality(
        address token,
        address from,
        address to,
        uint256 amount,
        uint256 nonce,
        bytes32 l2StateRoot
    ) external onlyRelayer {
        _finalizeGST20ToL3(token, from, to, amount, nonce, l2StateRoot);
    }

    /// @notice Release escrowed L2 tokens after a corresponding burn on L3 (called by relayer).
    /// #if_succeeds {:msg "only relayer release"} msg.sender == relayer;
    /// #if_succeeds {:msg "withdraw marked"} gst20WithdrawProcessed[keccak256(abi.encode(token, from, to, amount, nonce))];
    function releaseGST20FromL3(address token, address from, address to, uint256 amount, uint256 nonce)
        external
        onlyRelayer
    {
        _releaseGST20FromL3(token, from, to, amount, nonce, bytes32(0), bytes32(0));
    }

    /// @notice Hierarchical release path requiring recursive finality proofs.
    function releaseGST20FromL3WithFinality(
        address token,
        address from,
        address to,
        uint256 amount,
        uint256 nonce,
        bytes32 l3StateRoot,
        bytes32 parentL2StateRoot
    ) external onlyRelayer {
        _releaseGST20FromL3(token, from, to, amount, nonce, l3StateRoot, parentL2StateRoot);
    }

    function _finalizeToL3(address from, address to, uint256 amount, uint256 nonce, bytes32 l2StateRoot) internal {
        bytes32 key = GhostHash.bridgeNativeKey(from, to, amount, nonce);
        uint256 t = depositTime[key];
        require(t != 0, "no deposit");

        _enforceL2Finality(l2StateRoot);
        _enforceComplianceAndPolicy(from, amount, t);

        depositTime[key] = 0;
        emit Finalized(from, to, amount, nonce);
    }

    function _finalizeGST20ToL3(address token, address from, address to, uint256 amount, uint256 nonce, bytes32 l2StateRoot)
        internal
    {
        bytes32 key;
        assembly {
            let ptr := mload(0x40)
            mstore(ptr,          token)
            mstore(add(ptr, 0x20), from)
            mstore(add(ptr, 0x40), to)
            mstore(add(ptr, 0x60), amount)
            mstore(add(ptr, 0x80), nonce)
            key := keccak256(ptr, 0xa0)
        }
        uint256 t = gst20DepositTime[key];
        require(t != 0, "no deposit");

        _enforceL2Finality(l2StateRoot);
        _enforceComplianceAndPolicy(from, amount, t);

        gst20DepositTime[key] = 0;
        emit GST20Finalized(token, from, to, amount, nonce);
    }

    function _releaseGST20FromL3(
        address token,
        address from,
        address to,
        uint256 amount,
        uint256 nonce,
        bytes32 l3StateRoot,
        bytes32 parentL2StateRoot
    ) internal {
        bytes32 key;
        assembly {
            let ptr := mload(0x40)
            mstore(ptr,          token)
            mstore(add(ptr, 0x20), from)
            mstore(add(ptr, 0x40), to)
            mstore(add(ptr, 0x60), amount)
            mstore(add(ptr, 0x80), nonce)
            key := keccak256(ptr, 0xa0)
        }
        require(!gst20WithdrawProcessed[key], "already");

        _enforceL3Finality(l3StateRoot, parentL2StateRoot);

        gst20WithdrawProcessed[key] = true;

        _enforceCompliance();

        (bool ok, uint256 waitSeconds) = policy.check(from, amount);
        require(ok, "blocked by policy");
        require(waitSeconds == 0, "delay");

        require(GST20(token).transfer(to, amount), "transfer");
        emit GST20WithdrawReleased(token, from, to, amount, nonce);
    }

    function _enforceL2Finality(bytes32 l2StateRoot) internal view {
        if (!enforceHierarchicalFinality) return;
        require(address(l2FinalityOracle) != address(0), "L2_FINALITY_ORACLE_MISSING");
        require(!l2FinalityOracle.isFinalityHalted(), "L1_FINALITY_HALTED");
        require(l2StateRoot != bytes32(0), "L2_STATE_ROOT_REQUIRED");
        require(l2FinalityOracle.isFinalizedOnL1(l2StateRoot), "L2_NOT_FINALIZED_ON_L1");
    }

    function _enforceL3Finality(bytes32 l3StateRoot, bytes32 parentL2StateRoot) internal view {
        if (!enforceHierarchicalFinality) return;
        require(address(l3FinalityOracle) != address(0), "L3_FINALITY_ORACLE_MISSING");
        require(!l3FinalityOracle.isFinalityHalted(), "L1_FINALITY_HALTED");
        require(l3StateRoot != bytes32(0), "L3_STATE_ROOT_REQUIRED");
        require(parentL2StateRoot != bytes32(0), "L2_PARENT_ROOT_REQUIRED");
        require(l3FinalityOracle.isFinalizedOnL2(l3StateRoot), "L3_NOT_FINALIZED_ON_L2");
        require(
            l3FinalityOracle.isParentL2FinalizedOnL1(parentL2StateRoot),
            "L2_PARENT_NOT_FINALIZED_ON_L1"
        );
    }

    function _enforceComplianceAndPolicy(address actor, uint256 amount, uint256 initiatedAt) internal view {
        _enforceCompliance();

        (bool ok, uint256 waitSeconds) = policy.check(actor, amount);
        require(ok, "blocked by policy");

        if (waitSeconds > 0) {
            require(block.timestamp >= initiatedAt + waitSeconds, "delay not elapsed");
        }
    }

    function _enforceCompliance() internal view {
        ComplianceProofGuard guard = complianceGuard;
        if (requireComplianceRoot) {
            require(address(guard) != address(0), "compliance guard=0");
            guard.enforceLatestRoot();
        } else if (address(guard) != address(0)) {
            guard.enforceLatestRoot();
        }
    }
}
