// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title  GSTGasToken
/// @notice The Ghost Gas Token (GST) deployed natively on the GVM execution
///         layer (chainId 9001).  This is the canonical gas-payment token for
///         the GhostChain EVM (GVM).
///
///         Architecture
///         ─────────────
///         • `BRIDGE_ROLE`  — the GVM↔L2 bridge minter; credits GST when tokens
///           arrive from L2 via the GhostVirtualMachine.requestExec / bridge
///           finalisation flow.
///         • `ENGINE_ROLE`  — the GVM off-chain execution engine; mints block
///           rewards and refunds unused gas to callers.
///         • `GUARDIAN_ROLE`— can pause/unpause and manage roles (break-glass).
///
///         Routing law (enforced at constructor time)
///         ──────────────────────────────────────────
///         This contract is only valid on GVM (chainId 9001).  It is the L3
///         execution layer that settles state roots to L2 (chainId 901) — never
///         directly to L1.  Deploying on any other chain reverts.
///
///         Genesis allocation
///         ──────────────────
///         The deployer passes `genesisRecipients` and `genesisAmounts` for the
///         initial pre-mine, matching the GVM genesis.json alloc section.
contract GSTGasToken {
    // ─── ERC-20 state ─────────────────────────────────────────────────────────
    string  public constant name     = "Ghost Gas Token";
    string  public constant symbol   = "GST";
    uint8   public constant decimals = 18;

    uint256 public totalSupply;
    mapping(address => uint256)                     public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    // ─── Constants ────────────────────────────────────────────────────────────
    uint256 public  constant GVM_CHAIN_ID    = 9001;
    uint256 public  constant PARENT_CHAIN_ID = 901;   // L2 — routing law
    uint256 public  constant MAX_SUPPLY      = 1_000_000_000e18; // 1 B GST

    bytes32 public  constant BRIDGE_ROLE   = keccak256("GST_BRIDGE_ROLE");
    bytes32 public  constant ENGINE_ROLE   = keccak256("GST_ENGINE_ROLE");
    bytes32 public  constant GUARDIAN_ROLE = keccak256("GST_GUARDIAN_ROLE");

    // ─── Access control ───────────────────────────────────────────────────────
    mapping(bytes32 => mapping(address => bool)) private _roles;

    // ─── Pause ────────────────────────────────────────────────────────────────
    bool public paused;

    // ─── Events ───────────────────────────────────────────────────────────────
    event RoleGranted(bytes32 indexed role, address indexed account);
    event RoleRevoked(bytes32 indexed role, address indexed account);
    event GSTMinted(address indexed to, uint256 amount, bytes32 indexed role);
    event GSTBurned(address indexed from, uint256 amount);
    event GSTBridgedIn(address indexed to, uint256 amount, uint256 fromChainId);
    event GSTBridgedOut(address indexed from, uint256 amount, uint256 toChainId);
    event GasPaid(address indexed payer, uint256 gasUsed, uint256 gasCost);
    event Paused(address guardian, string reason);
    event Unpaused(address guardian);

    // ─── Errors ───────────────────────────────────────────────────────────────
    error Unauthorized(address caller, bytes32 role);
    error WrongChain(uint256 actual, uint256 expected);
    error SupplyCapExceeded(uint256 requested, uint256 available);
    error RoutingLawViolation(string reason);
    error GSTIsPaused();
    error ZeroAddress();
    error ArrayLengthMismatch();

    // ─── Modifiers ────────────────────────────────────────────────────────────
    modifier onlyRole(bytes32 role) {
        if (!_roles[role][msg.sender]) revert Unauthorized(msg.sender, role);
        _;
    }

    modifier whenNotPaused() {
        if (paused) revert GSTIsPaused();
        _;
    }

    // ─── Constructor ─────────────────────────────────────────────────────────
    /// @param bridge_    Address of the GVM↔L2 bridge (receives BRIDGE_ROLE).
    /// @param engine_    Address of the GVM execution engine (receives ENGINE_ROLE).
    /// @param guardian_  Break-glass guardian (receives GUARDIAN_ROLE).
    /// @param genesisRecipients  Pre-mine recipient addresses.
    /// @param genesisAmounts     Pre-mine amounts (1:1 with recipients).
    constructor(
        address bridge_,
        address engine_,
        address guardian_,
        address[] memory genesisRecipients,
        uint256[] memory genesisAmounts
    ) {  // solhint-disable-line
        // Routing law: only deployable on GVM (chainId 9001)
        if (block.chainid != GVM_CHAIN_ID) {
            revert WrongChain(block.chainid, GVM_CHAIN_ID);
        }
        if (bridge_   == address(0)) revert ZeroAddress();
        if (engine_   == address(0)) revert ZeroAddress();
        if (guardian_ == address(0)) revert ZeroAddress();
        if (genesisRecipients.length != genesisAmounts.length) revert ArrayLengthMismatch();

        _grantRole(BRIDGE_ROLE,   bridge_);
        _grantRole(ENGINE_ROLE,   engine_);
        _grantRole(GUARDIAN_ROLE, guardian_);

        // Genesis pre-mine
        uint256 genesisTotal;
        for (uint256 i; i < genesisRecipients.length; ++i) {
            if (genesisRecipients[i] == address(0)) revert ZeroAddress();
            genesisTotal += genesisAmounts[i];
            _mint(genesisRecipients[i], genesisAmounts[i]);
        }
        if (genesisTotal > MAX_SUPPLY) revert SupplyCapExceeded(genesisTotal, MAX_SUPPLY);
    }

    // ─── Role management ──────────────────────────────────────────────────────
    function grantRole(bytes32 role, address account)
        external
        onlyRole(GUARDIAN_ROLE)
    {
        _grantRole(role, account);
    }

    function revokeRole(bytes32 role, address account)
        external
        onlyRole(GUARDIAN_ROLE)
    {
        _roles[role][account] = false;
        emit RoleRevoked(role, account);
    }

    function hasRole(bytes32 role, address account) external view returns (bool) {
        return _roles[role][account];
    }

    function _grantRole(bytes32 role, address account) internal {
        _roles[role][account] = true;
        emit RoleGranted(role, account);
    }

    // ─── Pause (break-glass) ──────────────────────────────────────────────────
    function pause(string calldata reason) external onlyRole(GUARDIAN_ROLE) {
        paused = true;
        emit Paused(msg.sender, reason);
    }

    function unpause() external onlyRole(GUARDIAN_ROLE) {
        paused = false;
        emit Unpaused(msg.sender);
    }

    // ─── Mint / Bridge in ─────────────────────────────────────────────────────
    /// @notice Bridge engine mints GST when tokens arrive from L2.
    /// @param to           GVM recipient address.
    /// @param amount       Amount of GST to credit.
    /// @param fromChainId  Source chain (must be L2 = 901, enforcing routing law).
    function bridgeMint(address to, uint256 amount, uint256 fromChainId)
        external
        onlyRole(BRIDGE_ROLE)
        whenNotPaused
    {
        // Routing law: GVM only receives GST from L2, never directly from L1.
        if (fromChainId != PARENT_CHAIN_ID) {
            revert RoutingLawViolation("GSTGasToken: bridge source must be L2 (chainId 901)");
        }
        if (totalSupply + amount > MAX_SUPPLY) {
            revert SupplyCapExceeded(amount, MAX_SUPPLY - totalSupply);
        }
        _mint(to, amount);
        emit GSTBridgedIn(to, amount, fromChainId);
        emit GSTMinted(to, amount, BRIDGE_ROLE);
    }

    /// @notice GVM engine mints block rewards / gas refunds.
    /// @param to     Reward recipient (block producer / caller).
    /// @param amount GST amount to mint.
    function engineMint(address to, uint256 amount)
        external
        onlyRole(ENGINE_ROLE)
        whenNotPaused
    {
        if (totalSupply + amount > MAX_SUPPLY) {
            revert SupplyCapExceeded(amount, MAX_SUPPLY - totalSupply);
        }
        _mint(to, amount);
        emit GSTMinted(to, amount, ENGINE_ROLE);
    }

    // ─── Burn / Bridge out ────────────────────────────────────────────────────
    /// @notice Burn GST when bridging back to L2.
    /// @param from       GVM sender.
    /// @param amount     Amount to burn.
    /// @param toChainId  Destination chain (must be L2 = 901).
    function bridgeBurn(address from, uint256 amount, uint256 toChainId)
        external
        onlyRole(BRIDGE_ROLE)
        whenNotPaused
    {
        if (toChainId != PARENT_CHAIN_ID) {
            revert RoutingLawViolation("GSTGasToken: bridge destination must be L2 (chainId 901)");
        }
        _burn(from, amount);
        emit GSTBridgedOut(from, amount, toChainId);
        emit GSTBurned(from, amount);
    }

    /// @notice Self-burn (user removes own GST from circulation).
    function burn(uint256 amount) external whenNotPaused {
        _burn(msg.sender, amount);
        emit GSTBurned(msg.sender, amount);
    }

    // ─── Gas payment helper ───────────────────────────────────────────────────
    /// @notice Called by the GVM engine to collect gas fees in GST.
    ///         Burns the fee from the payer's balance; engine logs the event.
    /// @param payer    Transaction sender.
    /// @param gasUsed  Units of gas consumed.
    /// @param gasPrice GST price per unit of gas (wei).
    function collectGasFee(address payer, uint256 gasUsed, uint256 gasPrice)
        external
        onlyRole(ENGINE_ROLE)
        whenNotPaused
    {
        uint256 gasCost = gasUsed * gasPrice;
        _burn(payer, gasCost);
        emit GasPaid(payer, gasUsed, gasCost);
    }

    // ─── ERC-20 functions (pause-guarded) ────────────────────────────────────
    function approve(address spender, uint256 value) external returns (bool) {
        allowance[msg.sender][spender] = value;
        emit Approval(msg.sender, spender, value);
        return true;
    }

    function transfer(address to, uint256 value)
        external
        whenNotPaused
        returns (bool)
    {
        _transfer(msg.sender, to, value);
        return true;
    }

    function transferFrom(address from, address to, uint256 value)
        external
        whenNotPaused
        returns (bool)
    {
        uint256 allowed = allowance[from][msg.sender];
        require(allowed >= value, "allowance");
        if (allowed != type(uint256).max) {
            allowance[from][msg.sender] = allowed - value;
            emit Approval(from, msg.sender, allowance[from][msg.sender]);
        }
        _transfer(from, to, value);
        return true;
    }

    function _transfer(address from, address to, uint256 value) internal {
        require(to != address(0), "GST: to=0");
        require(balanceOf[from] >= value, "GST: balance");
        unchecked {
            balanceOf[from] -= value;
            balanceOf[to]   += value;
        }
        emit Transfer(from, to, value);
    }

    function _mint(address to, uint256 value) internal {
        require(to != address(0), "GST: to=0");
        totalSupply   += value;
        balanceOf[to] += value;
        emit Transfer(address(0), to, value);
    }

    function _burn(address from, uint256 value) internal {
        require(balanceOf[from] >= value, "GST: balance");
        unchecked {
            balanceOf[from] -= value;
            totalSupply     -= value;
        }
        emit Transfer(from, address(0), value);
    }

    // ─── View helpers ─────────────────────────────────────────────────────────
    /// @notice Remaining mintable supply before hitting MAX_SUPPLY.
    function remainingSupply() external view returns (uint256) {
        return MAX_SUPPLY - totalSupply;
    }

    /// @notice Returns the GVM chain ID (convenience for off-chain tooling).
    function chainId() external pure returns (uint256) {
        return GVM_CHAIN_ID;
    }

    /// @notice Returns the parent chain ID (L2 = 901).
    function parentChainId() external pure returns (uint256) {
        return PARENT_CHAIN_ID;
    }
}
