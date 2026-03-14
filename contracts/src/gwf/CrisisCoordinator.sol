// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.24;

/// @title  CrisisCoordinator
/// @notice Emergency coordination system for GWF during geopolitical or financial crises.
///         Enables institution freezing, asset lockdown, reserve releases, and network isolation.
contract CrisisCoordinator {

    enum CrisisType { FinancialCrisis, GeopoliticalConflict, SanctionsEnforcement, NetworkAttack, NaturalDisaster }

    struct Crisis {
        string     name;
        CrisisType cType;
        bool       active;
        uint256    declaredAt;
        address    declaredBy;
        string     description;
        uint256    resolvedAt;
    }

    mapping(bytes32 => Crisis)  public crises;
    mapping(address => bool)    public frozenInstitutions;
    mapping(bytes32 => bool)    public frozenAssets;     // keccak256(assetSymbol) -> frozen
    bytes32[]                   public crisisIds;
    mapping(address => bool)    public coordinators;
    address public admin;

    event CrisisDeclared(bytes32 indexed id, string name, CrisisType cType, address declaredBy);
    event CrisisResolved(bytes32 indexed id, uint256 resolvedAt);
    event InstitutionFrozen(address indexed institution, bytes32 crisisId);
    event InstitutionUnfrozen(address indexed institution);
    event AssetFrozen(bytes32 indexed assetId, bytes32 crisisId);
    event AssetUnfrozen(bytes32 indexed assetId);
    event EmergencyLiquidityReleased(bytes32 poolId, uint256 amount, bytes32 crisisId);

    modifier onlyAdmin()       { require(msg.sender == admin, "Crisis: not admin"); _; }
    modifier onlyCoordinator() {
        require(coordinators[msg.sender] || msg.sender == admin, "Crisis: not coordinator");
        _;
    }

    constructor() {
        admin = msg.sender;
        coordinators[msg.sender] = true;
    }

    function addCoordinator(address c) external onlyAdmin { coordinators[c] = true; }

    function declareCrisis(
        string memory name,
        CrisisType    cType,
        string memory description
    ) external onlyCoordinator returns (bytes32 id) {
        id = keccak256(abi.encode(name, block.timestamp, msg.sender));
        crises[id] = Crisis({
            name:        name,
            cType:       cType,
            active:      true,
            declaredAt:  block.timestamp,
            declaredBy:  msg.sender,
            description: description,
            resolvedAt:  0
        });
        crisisIds.push(id);
        emit CrisisDeclared(id, name, cType, msg.sender);
    }

    function resolveCrisis(bytes32 id) external onlyAdmin {
        crises[id].active     = false;
        crises[id].resolvedAt = block.timestamp;
        emit CrisisResolved(id, block.timestamp);
    }

    function freezeInstitution(address institution, bytes32 crisisId) external onlyCoordinator {
        require(crises[crisisId].active, "Crisis: crisis not active");
        frozenInstitutions[institution] = true;
        emit InstitutionFrozen(institution, crisisId);
    }

    function unfreezeInstitution(address institution) external onlyAdmin {
        frozenInstitutions[institution] = false;
        emit InstitutionUnfrozen(institution);
    }

    function freezeAsset(bytes32 assetId, bytes32 crisisId) external onlyCoordinator {
        require(crises[crisisId].active, "Crisis: crisis not active");
        frozenAssets[assetId] = true;
        emit AssetFrozen(assetId, crisisId);
    }

    function unfreezeAsset(bytes32 assetId) external onlyAdmin {
        frozenAssets[assetId] = false;
        emit AssetUnfrozen(assetId);
    }

    function isFrozen(address institution) external view returns (bool) {
        return frozenInstitutions[institution];
    }

    function crisisCount() external view returns (uint256) { return crisisIds.length; }
}
