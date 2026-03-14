// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title TaxController — programmable sovereign tax collection
contract TaxController {

    struct TaxPolicy {
        uint256 incomeTaxBps;       // basis points, e.g. 2100 = 21%
        uint256 corporateTaxBps;
        uint256 vatBps;
        uint256 tradeTariffBps;
        bool    active;
    }

    mapping(address => TaxPolicy) public policies;    // nation → policy
    mapping(address => uint256)   public treasury;    // accumulated tax balance

    address public governance;

    event TaxPolicySet(address indexed nation, uint256 incomeBps, uint256 corpBps);
    event TaxCollected(address indexed nation, address indexed payer, uint256 amount, string taxType);
    event TreasuryWithdrawn(address indexed nation, address indexed to, uint256 amount);

    modifier onlyGovernance() {
        require(msg.sender == governance, "TaxController: not governance");
        _;
    }

    constructor(address _gov) {
        governance = _gov;
    }

    function setTaxPolicy(
        address nation,
        uint256 incomeBps,
        uint256 corpBps,
        uint256 vatBps,
        uint256 tariffBps
    ) external onlyGovernance {
        require(incomeBps <= 10000 && corpBps <= 10000 && vatBps <= 10000 && tariffBps <= 10000,
            "TaxController: bps > 100%");
        policies[nation] = TaxPolicy(incomeBps, corpBps, vatBps, tariffBps, true);
        emit TaxPolicySet(nation, incomeBps, corpBps);
    }

    function collectIncomeTax(address nation) external payable {
        _collect(nation, "INCOME");
    }

    function collectCorporateTax(address nation) external payable {
        _collect(nation, "CORPORATE");
    }

    function collectTradeTariff(address nation) external payable {
        _collect(nation, "TARIFF");
    }

    function collectVAT(address nation) external payable {
        _collect(nation, "VAT");
    }

    function _collect(address nation, string memory taxType) internal {
        require(policies[nation].active, "TaxController: no policy");
        require(msg.value > 0, "TaxController: zero payment");
        treasury[nation] += msg.value;
        emit TaxCollected(nation, msg.sender, msg.value, taxType);
    }

    function withdrawTreasury(address payable to, uint256 amount) external {
        require(treasury[msg.sender] >= amount, "TaxController: insufficient");
        treasury[msg.sender] -= amount;
        (bool ok,) = to.call{value: amount}("");
        require(ok, "TaxController: transfer failed");
        emit TreasuryWithdrawn(msg.sender, to, amount);
    }
}
