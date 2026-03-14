// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.24;

/// @title  CBDCToken
/// @notice Central Bank Digital Currency with programmable monetary policy controls.
///         Supports: USD-CBDC, EUR-CBDC, JPY-CBDC, GBP-CBDC, CNY-CBDC.
contract CBDCToken {

    string  public name;
    string  public symbol;
    uint8   public constant decimals = 18;
    uint256 public totalSupply;

    mapping(address => uint256)                     public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    address public centralBank;
    uint256 public transactionLimit;   // per-tx cap (0 = unlimited)
    uint256 public holdingLimit;       // per-address cap (0 = unlimited)
    uint256 public interestRateBps;    // annual rate in basis points
    bool    public frozenGlobally;

    mapping(address => bool) public frozen;     // sanctions freeze
    mapping(address => bool) public whitelisted;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    event Minted(address indexed to, uint256 amount);
    event Burned(address indexed from, uint256 amount);
    event PolicyUpdated(string param, uint256 value);
    event AddressFrozen(address indexed account, bool frozen);
    event GlobalFreeze(bool frozen);

    modifier onlyCentralBank() { require(msg.sender == centralBank, "CBDC: not central bank"); _; }
    modifier notFrozen(address a) {
        require(!frozenGlobally, "CBDC: globally frozen");
        require(!frozen[a], "CBDC: address frozen");
        _;
    }

    constructor(string memory _name, string memory _symbol, address _centralBank) {
        name        = _name;
        symbol      = _symbol;
        centralBank = _centralBank;
    }

    function mint(address to, uint256 amount) external onlyCentralBank {
        if (holdingLimit > 0) require(balanceOf[to] + amount <= holdingLimit, "CBDC: holding limit");
        totalSupply   += amount;
        balanceOf[to] += amount;
        emit Minted(to, amount);
        emit Transfer(address(0), to, amount);
    }

    function burn(address from, uint256 amount) external onlyCentralBank {
        require(balanceOf[from] >= amount, "CBDC: insufficient balance");
        balanceOf[from] -= amount;
        totalSupply     -= amount;
        emit Burned(from, amount);
        emit Transfer(from, address(0), amount);
    }

    function transfer(address to, uint256 amount)
        external notFrozen(msg.sender) notFrozen(to) returns (bool)
    {
        _policyTransfer(msg.sender, to, amount);
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount)
        external notFrozen(from) notFrozen(to) returns (bool)
    {
        require(allowance[from][msg.sender] >= amount, "CBDC: allowance exceeded");
        allowance[from][msg.sender] -= amount;
        _policyTransfer(from, to, amount);
        return true;
    }

    function setTransactionLimit(uint256 limit) external onlyCentralBank {
        transactionLimit = limit;
        emit PolicyUpdated("transactionLimit", limit);
    }

    function setHoldingLimit(uint256 limit) external onlyCentralBank {
        holdingLimit = limit;
        emit PolicyUpdated("holdingLimit", limit);
    }

    function setInterestRate(uint256 bps) external onlyCentralBank {
        interestRateBps = bps;
        emit PolicyUpdated("interestRateBps", bps);
    }

    function freezeAddress(address account, bool _frozen) external onlyCentralBank {
        frozen[account] = _frozen;
        emit AddressFrozen(account, _frozen);
    }

    function setGlobalFreeze(bool _frozen) external onlyCentralBank {
        frozenGlobally = _frozen;
        emit GlobalFreeze(_frozen);
    }

    function _policyTransfer(address from, address to, uint256 amount) internal {
        if (transactionLimit > 0) require(amount <= transactionLimit, "CBDC: tx limit exceeded");
        if (holdingLimit > 0)     require(balanceOf[to] + amount <= holdingLimit, "CBDC: holding limit");
        require(balanceOf[from] >= amount, "CBDC: insufficient balance");
        balanceOf[from] -= amount;
        balanceOf[to]   += amount;
        emit Transfer(from, to, amount);
    }
}
