// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../ai/EvidenceBundle.sol";
import "../common/ConstitutionalGuard.sol";
import "../compliance/ComplianceProofGuard.sol";

/// @notice Minimal timelock-style executor used by Governor.
contract ProposalExecutor {
    address public governor;
    uint256 public delay;
    EvidenceBundle public evidenceBundle;
    ConstitutionalGuard public constitutionalGuard;
    ComplianceProofGuard public complianceGuard;

    bytes32 internal constant ACTION_GOVERNANCE = keccak256("ghost.governance.execute");

    struct QueuedTx {
        address target;
        uint256 value;
        bytes data;
        uint256 eta;
        bool executed;
    }

    QueuedTx[] public queue;

    event GovernorUpdated(address indexed governor);
    event Queued(uint256 indexed id, address indexed target, uint256 value, bytes data, uint256 eta);
    event Executed(uint256 indexed id, bytes result);
    event ExecutedBatch(address indexed caller, uint256 count);
    event EvidenceBundleUpdated(address indexed bundle);
    event ConstitutionalGuardUpdated(address indexed guard);
    event ComplianceGuardUpdated(address indexed guard);

    modifier onlyGovernor() {
        require(msg.sender == governor, "not governor");
        _;
    }

    modifier onlyGovernorOrBootstrap() {
        if (governor == address(0)) {
            require(msg.sender == tx.origin, "bootstrap only");
        } else {
            require(msg.sender == governor, "not governor");
        }
        _;
    }

    modifier onlyGovernorOrSelf() {
        require(msg.sender == governor || msg.sender == address(this), "not governor/self");
        _;
    }

    constructor(uint256 _delay) {
        delay = _delay;
    }

    function setGovernor(address _gov) external {
        if (governor != address(0)) {
            require(msg.sender == governor, "not governor");
        }
        governor = _gov;
        emit GovernorUpdated(_gov);
    }

    function setEvidenceBundle(EvidenceBundle bundle) external onlyGovernorOrBootstrap {
        evidenceBundle = bundle;
        emit EvidenceBundleUpdated(address(bundle));
    }

    function setConstitutionalGuard(ConstitutionalGuard guard) external onlyGovernorOrBootstrap {
        constitutionalGuard = guard;
        emit ConstitutionalGuardUpdated(address(guard));
    }

    function setComplianceGuard(ComplianceProofGuard guard) external onlyGovernorOrBootstrap {
        complianceGuard = guard;
        emit ComplianceGuardUpdated(address(guard));
    }

    function queueTx(address target, uint256 value, bytes calldata data) external onlyGovernor returns (uint256 id) {
        uint256 eta = block.timestamp + delay;
        id = queue.length;
        queue.push(QueuedTx({target: target, value: value, data: data, eta: eta, executed: false}));
        emit Queued(id, target, value, data, eta);
    }

    /// @notice Execute a batch of actions as a single queued transaction.
    function executeBatch(address[] calldata targets, uint256[] calldata values, bytes[] calldata datas)
        external
        onlyGovernorOrSelf
        returns (bytes[] memory results)
    {
        require(targets.length == values.length && targets.length == datas.length, "batch length mismatch");
        results = new bytes[](targets.length);
        for (uint256 i = 0; i < targets.length; i++) {
            (bool ok, bytes memory res) = targets[i].call{value: values[i]}(datas[i]);
            require(ok, "batch exec failed");
            results[i] = res;
        }
        emit ExecutedBatch(msg.sender, targets.length);
    }

    /// #if_succeeds {:msg "only governor execute"} msg.sender == governor;
    function execute(uint256 id) external onlyGovernor returns (bytes memory) {
        QueuedTx storage txData = queue[id];
        require(!txData.executed, "executed");
        require(block.timestamp >= txData.eta, "eta not reached");
        txData.executed = true;
        ComplianceProofGuard compliance = complianceGuard;
        if (address(compliance) != address(0)) {
            compliance.enforceLatestRoot();
        }
        ConstitutionalGuard guard = constitutionalGuard;
        require(address(guard) != address(0), "constitution guard=0");
        bytes32 actionHash = keccak256(
            abi.encode(ACTION_GOVERNANCE, id, txData.target, txData.value, keccak256(txData.data), txData.eta)
        );
        guard.checkGovernance(actionHash, msg.sender, txData.data);
        (bool ok, bytes memory res) = txData.target.call{value: txData.value}(txData.data);
        require(ok, "exec failed");
        EvidenceBundle bundle = evidenceBundle;
        require(address(bundle) != address(0), "evidence bundle=0");
        EvidenceBundle.Bundle memory evidence = EvidenceBundle.Bundle({
            policyHash: actionHash,
            decisionHash: keccak256(abi.encode(id, txData.eta)),
            modelHash: bytes32(0),
            executionHash: keccak256(abi.encode(txData.target, txData.value, keccak256(txData.data))),
            timestamp: block.timestamp,
            chainId: block.chainid,
            emitter: address(this)
        });
        bundle.recordBundle(evidence, bytes(""));
        emit Executed(id, res);
        return res;
    }

    function queueLength() external view returns (uint256) {
        return queue.length;
    }
}
