// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.24;

/// @title  SovereignAssetToken (SAT)
/// @notice ERC-20 compatible token representing a tokenized sovereign real-world asset.
///         Examples: SAT-GOLD, SAT-OIL, SAT-LAND, SAT-INFRASTRUCTURE, SAT-GDP.
contract SovereignAssetToken {

    string  public name;
    string  public symbol;
    uint8   public constant decimals = 18;
    uint256 public totalSupply;

    mapping(address => uint256)                     public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    address public minter;
    address public governance;
    bool    public transferable = true;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    event Minted(address indexed to, uint256 amount);
    event Burned(address indexed from, uint256 amount);
    event TransferabilityChanged(bool transferable);

    modifier onlyMinter()     { require(msg.sender == minter, "SAT: not minter"); _; }
    modifier onlyGovernance() { require(msg.sender == governance, "SAT: not governance"); _; }

    constructor(string memory _name, string memory _symbol, address _minter) {
        name       = _name;
        symbol     = _symbol;
        minter     = _minter;
        governance = msg.sender;
    }

    function mint(address to, uint256 amount) external onlyMinter {
        totalSupply   += amount;
        balanceOf[to] += amount;
        emit Minted(to, amount);
        emit Transfer(address(0), to, amount);
    }

    function burn(address from, uint256 amount) external onlyMinter {
        require(balanceOf[from] >= amount, "SAT: insufficient balance");
        balanceOf[from] -= amount;
        totalSupply     -= amount;
        emit Burned(from, amount);
        emit Transfer(from, address(0), amount);
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        require(transferable, "SAT: non-transferable");
        _transfer(msg.sender, to, amount);
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(transferable, "SAT: non-transferable");
        require(allowance[from][msg.sender] >= amount, "SAT: allowance exceeded");
        allowance[from][msg.sender] -= amount;
        _transfer(from, to, amount);
        return true;
    }

    function setTransferability(bool _t) external onlyGovernance {
        transferable = _t;
        emit TransferabilityChanged(_t);
    }

    function _transfer(address from, address to, uint256 amount) internal {
        require(balanceOf[from] >= amount, "SAT: insufficient balance");
        balanceOf[from] -= amount;
        balanceOf[to]   += amount;
        emit Transfer(from, to, amount);
    }
}
