// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title BudgetController — sovereign budget allocation & spending
contract BudgetController {

    enum Category { Infrastructure, Defense, Healthcare, Education, Research, Other }

    struct BudgetAllocation {
        Category category;
        uint256  amount;       // total allocated
        uint256  spent;        // total disbursed
        string   description;
        bool     active;
    }

    uint256 public nextBudgetId;
    mapping(uint256 => BudgetAllocation) public budgets;
    mapping(address => bool) public authorisedSpenders;

    address public governance;

    event BudgetCreated(uint256 indexed id, Category category, uint256 amount, string desc);
    event BudgetSpent(uint256 indexed id, address indexed recipient, uint256 amount);
    event SpenderAuthorised(address indexed spender, bool status);

    modifier onlyGovernance() {
        require(msg.sender == governance, "BudgetController: not governance");
        _;
    }

    modifier onlySpender() {
        require(authorisedSpenders[msg.sender] || msg.sender == governance,
            "BudgetController: not authorised");
        _;
    }

    constructor(address _gov) {
        governance = _gov;
    }

    function authoriseSpender(address spender, bool status) external onlyGovernance {
        authorisedSpenders[spender] = status;
        emit SpenderAuthorised(spender, status);
    }

    function createBudget(
        Category category,
        uint256  amount,
        string calldata description
    ) external onlyGovernance returns (uint256 id) {
        id = nextBudgetId++;
        budgets[id] = BudgetAllocation(category, amount, 0, description, true);
        emit BudgetCreated(id, category, amount, description);
    }

    function spend(uint256 budgetId, address payable recipient, uint256 amount)
        external onlySpender
    {
        BudgetAllocation storage b = budgets[budgetId];
        require(b.active, "BudgetController: inactive");
        require(b.spent + amount <= b.amount, "BudgetController: over budget");
        b.spent += amount;
        (bool ok,) = recipient.call{value: amount}("");
        require(ok, "BudgetController: transfer failed");
        emit BudgetSpent(budgetId, recipient, amount);
    }

    receive() external payable {}
}
