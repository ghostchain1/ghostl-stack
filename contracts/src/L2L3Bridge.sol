// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./GuardPolicy.sol";
import "./ERC20.sol";

contract L2L3Bridge {
    GuardPolicy public policy;
    address public owner;

    // (actor, amount, nonce) => timestamp deposit initiated
    mapping(bytes32 => uint256) public depositTime;
    // (token, actor, amount, nonce) => timestamp deposit initiated
    mapping(bytes32 => uint256) public erc20DepositTime;

    event DepositInitiated(address indexed from, address indexed to, uint256 amount, uint256 nonce);
    event Finalized(address indexed from, address indexed to, uint256 amount, uint256 nonce);
    event ERC20DepositInitiated(address indexed token, address indexed from, address indexed to, uint256 amount, uint256 nonce);
    event ERC20Finalized(address indexed token, address indexed from, address indexed to, uint256 amount, uint256 nonce);
    event PolicyChanged(address indexed policy);

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    constructor(address policyAddr) {
        owner = msg.sender;
        policy = GuardPolicy(policyAddr);
    }

    function setPolicy(address policyAddr) external onlyOwner {
        policy = GuardPolicy(policyAddr);
        emit PolicyChanged(policyAddr);
    }

    /// User deposits on L2 to mint/release on L3 (offchain relayer can mirror on the other chain).
    function depositToL3(address to, uint256 amount, uint256 nonce) external payable {
        // In MVP we just emit an event; funds handling can be added later (ERC20 escrow etc).
        bytes32 key = keccak256(abi.encode(msg.sender, to, amount, nonce));
        require(depositTime[key] == 0, "already");
        depositTime[key] = block.timestamp;
        emit DepositInitiated(msg.sender, to, amount, nonce);
    }

    /// Deposit an ERC20 on L2 to mint the bridged representation on L3.
    function depositERC20ToL3(address token, address to, uint256 amount, uint256 nonce) external {
        bytes32 key = keccak256(abi.encode(token, msg.sender, to, amount, nonce));
        require(erc20DepositTime[key] == 0, "already");
        erc20DepositTime[key] = block.timestamp;
        require(ERC20(token).transferFrom(msg.sender, address(this), amount), "transferFrom");
        emit ERC20DepositInitiated(token, msg.sender, to, amount, nonce);
    }

    /// Finalize step: guarded by policy (ALLOW/DELAY/PAUSE + risk threshold)
    function finalizeToL3(address from, address to, uint256 amount, uint256 nonce) external {
        bytes32 key = keccak256(abi.encode(from, to, amount, nonce));
        uint256 t = depositTime[key];
        require(t != 0, "no deposit");

        (bool ok, uint256 waitSeconds) = policy.check(from, amount);
        require(ok, "blocked by policy");

        if (waitSeconds > 0) {
            require(block.timestamp >= t + waitSeconds, "delay not elapsed");
        }

        // mark consumed
        depositTime[key] = 0;
        emit Finalized(from, to, amount, nonce);
    }

    function finalizeERC20ToL3(address token, address from, address to, uint256 amount, uint256 nonce) external {
        bytes32 key = keccak256(abi.encode(token, from, to, amount, nonce));
        uint256 t = erc20DepositTime[key];
        require(t != 0, "no deposit");

        (bool ok, uint256 waitSeconds) = policy.check(from, amount);
        require(ok, "blocked by policy");

        if (waitSeconds > 0) {
            require(block.timestamp >= t + waitSeconds, "delay not elapsed");
        }

        erc20DepositTime[key] = 0;
        emit ERC20Finalized(token, from, to, amount, nonce);
    }
}
