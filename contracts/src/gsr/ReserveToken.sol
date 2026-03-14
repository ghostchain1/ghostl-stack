// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.24;

/// @title  ReserveToken (SRT)
/// @notice Strategic Reserve Token — ERC-20 representing a verified sovereign reserve.
///         Examples: SRT-GOLD, SRT-OIL, SRT-LITHIUM, SRT-WHEAT, SRT-WATER, SRT-INFRA.
contract ReserveToken {

    string  public name;
    string  public symbol;
    uint8   public constant decimals = 18;
    uint256 public totalSupply;
    bytes32 public linkedReserveId;    // ID in StrategicReserve contract

    mapping(address => uint256)                     public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    address public sovereign;   // authorized minter/burner (sovereign entity)
    address public admin;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    event SRTMinted(address indexed to, uint256 amount, bytes32 reserveId);
    event SRTBurned(address indexed from, uint256 amount, bytes32 reserveId);

    modifier onlySovereign() { require(msg.sender == sovereign, "SRT: not sovereign"); _; }
    modifier onlyAdmin()     { require(msg.sender == admin, "SRT: not admin"); _; }

    constructor(
        string memory _name,
        string memory _symbol,
        address       _sovereign,
        bytes32       _reserveId
    ) {
        name            = _name;
        symbol          = _symbol;
        sovereign       = _sovereign;
        linkedReserveId = _reserveId;
        admin           = msg.sender;
    }

    function mint(address to, uint256 amount) external onlySovereign {
        totalSupply   += amount;
        balanceOf[to] += amount;
        emit SRTMinted(to, amount, linkedReserveId);
        emit Transfer(address(0), to, amount);
    }

    function burn(address from, uint256 amount) external onlySovereign {
        require(balanceOf[from] >= amount, "SRT: insufficient balance");
        balanceOf[from] -= amount;
        totalSupply     -= amount;
        emit SRTBurned(from, amount, linkedReserveId);
        emit Transfer(from, address(0), amount);
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
        require(allowance[from][msg.sender] >= amount, "SRT: allowance exceeded");
        allowance[from][msg.sender] -= amount;
        _transfer(from, to, amount);
        return true;
    }

    function _transfer(address from, address to, uint256 amount) internal {
        require(balanceOf[from] >= amount, "SRT: insufficient balance");
        balanceOf[from] -= amount;
        balanceOf[to]   += amount;
        emit Transfer(from, to, amount);
    }
}
