// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.24;

/// @title  CustodyVault
/// @notice Institutional-grade M-of-N multi-signature custody vault.
///         Default quorum: 5-of-9 custodians (Treasury + Central Bank + Auditor + Regulator + Council).
contract CustodyVault {

    struct WithdrawalRequest {
        address token;
        address recipient;
        uint256 amount;
        uint256 approvalCount;
        bool    executed;
    }

    address[] public custodians;
    mapping(address => bool) public isCustodian;
    uint8   public requiredApprovals;
    address public admin;

    WithdrawalRequest[] public requests;
    mapping(uint256 => mapping(address => bool)) public approved;
    mapping(address => uint256) public balances; // token -> locked amount

    event Deposited(address indexed token, uint256 amount, address by);
    event WithdrawalRequested(uint256 indexed reqId, address token, address recipient, uint256 amount);
    event WithdrawalApproved(uint256 indexed reqId, address custodian, uint256 approvalCount);
    event WithdrawalExecuted(uint256 indexed reqId, address token, address recipient, uint256 amount);
    event CustodianAdded(address indexed custodian);
    event CustodianRemoved(address indexed custodian);

    modifier onlyAdmin()     { require(msg.sender == admin, "Vault: not admin"); _; }
    modifier onlyCustodian() { require(isCustodian[msg.sender], "Vault: not custodian"); _; }

    constructor(address[] memory _custodians, uint8 _required) {
        require(_custodians.length >= _required, "Vault: insufficient custodians");
        admin             = msg.sender;
        requiredApprovals = _required;
        for (uint256 i; i < _custodians.length; i++) {
            _addCustodian(_custodians[i]);
        }
    }

    receive() external payable {
        balances[address(0)] += msg.value;
        emit Deposited(address(0), msg.value, msg.sender);
    }

    function deposit(address token, uint256 amount) external {
        balances[token] += amount;
        emit Deposited(token, amount, msg.sender);
    }

    function requestWithdrawal(address token, address recipient, uint256 amount)
        external onlyCustodian returns (uint256 reqId)
    {
        require(balances[token] >= amount, "Vault: insufficient balance");
        reqId = requests.length;
        requests.push(WithdrawalRequest({ token: token, recipient: recipient, amount: amount, approvalCount: 0, executed: false }));
        emit WithdrawalRequested(reqId, token, recipient, amount);
    }

    function approveWithdrawal(uint256 reqId) external onlyCustodian {
        WithdrawalRequest storage req = requests[reqId];
        require(!req.executed, "Vault: already executed");
        require(!approved[reqId][msg.sender], "Vault: already approved");
        approved[reqId][msg.sender] = true;
        req.approvalCount++;
        emit WithdrawalApproved(reqId, msg.sender, req.approvalCount);
        if (req.approvalCount >= requiredApprovals) {
            req.executed     = true;
            balances[req.token] -= req.amount;
            emit WithdrawalExecuted(reqId, req.token, req.recipient, req.amount);
        }
    }

    function addCustodian(address c) external onlyAdmin { _addCustodian(c); }

    function removeCustodian(address c) external onlyAdmin {
        require(isCustodian[c], "Vault: not custodian");
        isCustodian[c] = false;
        emit CustodianRemoved(c);
    }

    function requestCount() external view returns (uint256) { return requests.length; }

    function _addCustodian(address c) internal {
        require(!isCustodian[c], "Vault: already custodian");
        isCustodian[c] = true;
        custodians.push(c);
        emit CustodianAdded(c);
    }
}
