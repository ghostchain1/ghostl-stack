// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Minimal timelock-style executor used by Governor.
contract ProposalExecutor {
    address public governor;
    uint256 public delay;

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

    modifier onlyGovernor() {
        require(msg.sender == governor, "not governor");
        _;
    }

    constructor(uint256 _delay) {
        governor = msg.sender;
        delay = _delay;
        emit GovernorUpdated(msg.sender);
    }

    function setGovernor(address _gov) external onlyGovernor {
        governor = _gov;
        emit GovernorUpdated(_gov);
    }

    function queueTx(address target, uint256 value, bytes calldata data) external onlyGovernor returns (uint256 id) {
        uint256 eta = block.timestamp + delay;
        id = queue.length;
        queue.push(QueuedTx({target: target, value: value, data: data, eta: eta, executed: false}));
        emit Queued(id, target, value, data, eta);
    }

    /// #if_succeeds {:msg "only governor execute"} msg.sender == governor;
    function execute(uint256 id) external onlyGovernor returns (bytes memory) {
        QueuedTx storage txData = queue[id];
        require(!txData.executed, "executed");
        require(block.timestamp >= txData.eta, "eta not reached");
        txData.executed = true;
        (bool ok, bytes memory res) = txData.target.call{value: txData.value}(txData.data);
        require(ok, "exec failed");
        emit Executed(id, res);
        return res;
    }

    function queueLength() external view returns (uint256) {
        return queue.length;
    }
}
