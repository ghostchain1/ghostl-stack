// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title GSAToken — governance and staking token for the Ghost Sovereign AI Network
contract GSAToken {

    string  public constant name     = "Ghost Sovereign AI";
    string  public constant symbol   = "GSA";
    uint8   public constant decimals = 18;

    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    address public minter;  // GSAGovernance contract
    address public admin;

    event Transfer(address indexed from, address indexed to, uint256 amount);
    event Approval(address indexed owner, address indexed spender, uint256 amount);
    event MinterSet(address indexed minter);

    modifier onlyAdmin() {
        require(msg.sender == admin, "GSAToken: not admin");
        _;
    }

    constructor(uint256 initialSupply) {
        admin       = msg.sender;
        minter      = msg.sender;
        _mint(msg.sender, initialSupply);
    }

    function setMinter(address _minter) external onlyAdmin {
        minter = _minter;
        emit MinterSet(_minter);
    }

    function mint(address to, uint256 amount) external {
        require(msg.sender == minter || msg.sender == admin, "GSAToken: not minter");
        _mint(to, amount);
    }

    function burn(uint256 amount) external {
        require(balanceOf[msg.sender] >= amount, "GSAToken: insufficient balance");
        balanceOf[msg.sender] -= amount;
        totalSupply           -= amount;
        emit Transfer(msg.sender, address(0), amount);
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(allowance[from][msg.sender] >= amount, "GSAToken: allowance exceeded");
        allowance[from][msg.sender] -= amount;
        _transfer(from, to, amount);
        return true;
    }

    function _transfer(address from, address to, uint256 amount) internal {
        require(balanceOf[from] >= amount, "GSAToken: insufficient balance");
        balanceOf[from] -= amount;
        balanceOf[to]   += amount;
        emit Transfer(from, to, amount);
    }

    function _mint(address to, uint256 amount) internal {
        balanceOf[to] += amount;
        totalSupply   += amount;
        emit Transfer(address(0), to, amount);
    }
}
