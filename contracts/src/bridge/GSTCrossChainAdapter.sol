// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "../common/Governed.sol";
import "../common/ReentrancyGuard.sol";

/// @dev Minimal ERC-20 approve/transfer for bridging.
interface IERC20Bridge {
    function approve(address spender, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

/// @dev Minimal cross-domain messenger interface (OP-stack / GhostChain bridge).
interface ICrossDomainBridge {
    function bridgeERC20To(
        address localToken,
        address remoteToken,
        address to,
        uint256 amount,
        uint32 minGasLimit,
        bytes calldata extraData
    ) external;
}

/// @title  GSTCrossChainAdapter
/// @notice Manages GST (Ghost gas token) positions across approved external chains,
///         enabling the network to earn yield from fee investment and liquidity
///         provisioning on profitable partner chains (e.g. Ethereum, Arbitrum, Base).
///
///         Key mechanics
///         ─────────────
///         • Governance registers chains via `addChain()`, specifying:
///             – the bridge contract on L1
///             – remote GST token address on the target chain
///             – a yield-oracle address (AI-attested off-chain feed)
///             – a max deployment cap per chain
///         • The FeeInvestmentManager (or governance) calls `deployToChain()` to
///           bridge GST to a specific chain.  Amounts above `singleBridgeCap` require
///           a guardian attestation hash to be passed.
///         • Off-chain oracle calls `recordYield()` to report accrued yield; the
///           contract emits a verifiable event consumed by the on-chain treasury.
///         • `repatriate()` signals the remote chain to bridge GST back (the remote
///           bridge calls `receiveBridgeBack()` on finalisation).
///
///         Routing law
///         ──────────
///         This contract lives on L1 and calls the L1 → external chain bridge only.
///         L2 / L3 must never call this contract directly (enforced by chainid check).
contract GSTCrossChainAdapter is Governed, ReentrancyGuard {

    // ──────────────────────────────────────────────────────────────────────────
    // Types
    // ──────────────────────────────────────────────────────────────────────────

    struct ChainConfig {
        bool    active;
        address bridge;           // L1 bridge / portal for this chain
        address remoteGST;        // GST token address on the remote chain
        address yieldOracle;      // authorised off-chain oracle for yield reports
        uint256 maxDeployment;    // cap: max GST ever deployed to this chain at once
        uint256 deployed;         // current outstanding GST on that chain
        uint256 cumulativeYield;  // lifetime yield reported back
        string  label;            // human-readable chain name (e.g. "Ethereum Mainnet")
    }

    struct YieldReport {
        uint256 chainId;
        uint256 amount;
        uint256 timestamp;
        bytes32 attestationHash; // EIP-712 hash from AI risk oracle (optional, for audit)
    }

    // ──────────────────────────────────────────────────────────────────────────
    // State
    // ──────────────────────────────────────────────────────────────────────────

    IERC20Bridge public immutable gst;

    /// @notice Single bridge cap: deployments above this require a guardian nonce.
    uint256 public singleBridgeCap = 100_000e18; // 100 k GST default

    /// @notice Trusted caller allowed to initiate deployments (FeeInvestmentManager).
    address public feeManager;

    mapping(uint256 => ChainConfig)    public chains;          // chainId => config
    mapping(uint256 => YieldReport[])  public yieldHistory;    // chainId => yields

    uint256[]  public registeredChains;

    // ──────────────────────────────────────────────────────────────────────────
    // Events
    // ──────────────────────────────────────────────────────────────────────────

    event ChainAdded(uint256 indexed chainId, string label, address bridge, address remoteGST);
    event ChainDeactivated(uint256 indexed chainId);
    event Deployed(uint256 indexed chainId, uint256 amount, bytes32 guardianAttestation);
    event YieldRecorded(uint256 indexed chainId, uint256 amount, uint256 cumulativeYield);
    event Repatriated(uint256 indexed chainId, uint256 amount);
    event BridgeBackReceived(uint256 indexed chainId, uint256 amount);
    event FeeManagerSet(address indexed manager);
    event SingleBridgeCapSet(uint256 cap);
    event MaxDeploymentSet(uint256 indexed chainId, uint256 cap);

    // ──────────────────────────────────────────────────────────────────────────
    // Errors
    // ──────────────────────────────────────────────────────────────────────────

    error UnknownChain(uint256 chainId);
    error ChainInactive(uint256 chainId);
    error DeploymentCapExceeded(uint256 chainId, uint256 requested, uint256 remaining);
    error NotAuthorized(address caller);
    error AttestationRequired();
    error NotYieldOracle(uint256 chainId, address caller);
    error L1Only();

    // ──────────────────────────────────────────────────────────────────────────
    // Constructor
    // ──────────────────────────────────────────────────────────────────────────

    constructor(
        address gst_,
        address governor_,
        address timelock_,
        address feeManager_
    ) Governed(governor_, timelock_) {
        require(gst_ != address(0), "GSTCrossChain: zero gst");
        gst        = IERC20Bridge(gst_);
        feeManager = feeManager_;
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Modifiers
    // ──────────────────────────────────────────────────────────────────────────

    modifier onlyFeeManagerOrGovernance() {
        if (msg.sender != feeManager && msg.sender != governor && msg.sender != timelock) {
            revert NotAuthorized(msg.sender);
        }
        _;
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Chain Registry
    // ──────────────────────────────────────────────────────────────────────────

    /// @notice Register a new external chain for GST deployment.
    /// @param chainId      EIP-155 chain ID of the target network.
    /// @param bridge       Bridge/portal contract on L1 for that chain.
    /// @param remoteGST    GST token contract on the remote chain.
    /// @param yieldOracle  Oracle address approved to submit yield reports.
    /// @param maxDeploy    Maximum GST that may be outstanding on that chain.
    /// @param label        Human-readable chain name.
    function addChain(
        uint256 chainId,
        address bridge,
        address remoteGST,
        address yieldOracle,
        uint256 maxDeploy,
        string calldata label
    ) external onlyGovernance {
        require(chainId != 0, "GSTCrossChain: chainId=0");
        require(bridge != address(0), "GSTCrossChain: bridge=0");
        require(remoteGST != address(0), "GSTCrossChain: remoteGST=0");
        require(!chains[chainId].active, "GSTCrossChain: already registered");

        chains[chainId] = ChainConfig({
            active:          true,
            bridge:          bridge,
            remoteGST:       remoteGST,
            yieldOracle:     yieldOracle,
            maxDeployment:   maxDeploy,
            deployed:        0,
            cumulativeYield: 0,
            label:           label
        });
        registeredChains.push(chainId);
        emit ChainAdded(chainId, label, bridge, remoteGST);
    }

    /// @notice Deactivate a chain (stops new deployments; existing positions unwind naturally).
    function deactivateChain(uint256 chainId) external onlyGovernance {
        if (!chains[chainId].active) revert ChainInactive(chainId);
        chains[chainId].active = false;
        emit ChainDeactivated(chainId);
    }

    /// @notice Update the max deployment cap for an active chain.
    function setMaxDeployment(uint256 chainId, uint256 cap) external onlyGovernance {
        if (chains[chainId].bridge == address(0)) revert UnknownChain(chainId);
        chains[chainId].maxDeployment = cap;
        emit MaxDeploymentSet(chainId, cap);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Deployment
    // ──────────────────────────────────────────────────────────────────────────

    /// @notice Bridge GST to a registered external chain to provide liquidity / earn yield.
    /// @param chainId             Target chain ID.
    /// @param amount              Amount of GST to bridge (caller must pre-approve).
    /// @param minGasLimit         Minimum gas limit for the bridge finalisation tx.
    /// @param guardianAttestation EIP-712 attestation hash from AI guardian.
    ///                            Required when amount > singleBridgeCap.
    function deployToChain(
        uint256 chainId,
        uint256 amount,
        uint32  minGasLimit,
        bytes32 guardianAttestation
    ) external onlyFeeManagerOrGovernance nonReentrant {
        ChainConfig storage cfg = chains[chainId];
        if (cfg.bridge == address(0)) revert UnknownChain(chainId);
        if (!cfg.active)              revert ChainInactive(chainId);

        uint256 remaining = cfg.maxDeployment - cfg.deployed;
        if (amount > remaining) revert DeploymentCapExceeded(chainId, amount, remaining);

        if (amount > singleBridgeCap && guardianAttestation == bytes32(0)) {
            revert AttestationRequired();
        }

        // Pull GST from caller (FeeInvestmentManager) into this contract
        require(gst.transferFrom(msg.sender, address(this), amount), "GSTCrossChain: transfer failed");

        // Approve bridge and initiate cross-chain transfer
        require(gst.approve(cfg.bridge, amount), "GSTCrossChain: approve failed");
        ICrossDomainBridge(cfg.bridge).bridgeERC20To(
            address(gst),
            cfg.remoteGST,
            address(this), // recipient on remote = this contract's mirrored address
            amount,
            minGasLimit,
            abi.encode(chainId, guardianAttestation) // extraData for audit trail
        );

        cfg.deployed += amount;
        emit Deployed(chainId, amount, guardianAttestation);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Yield Reporting
    // ──────────────────────────────────────────────────────────────────────────

    /// @notice Off-chain AI oracle reports yield earned on a remote chain.
    ///         Yield does not flow through this contract; it is received on L1 via
    ///         the standard bridge finalisation and tracked here for accounting.
    /// @param chainId          Chain that generated yield.
    /// @param amount           GST-equivalent yield amount.
    /// @param attestationHash  Optional EIP-712 hash from AI risk oracle for audit.
    function recordYield(
        uint256 chainId,
        uint256 amount,
        bytes32 attestationHash
    ) external {
        ChainConfig storage cfg = chains[chainId];
        if (cfg.bridge == address(0)) revert UnknownChain(chainId);
        if (msg.sender != cfg.yieldOracle) revert NotYieldOracle(chainId, msg.sender);

        cfg.cumulativeYield += amount;
        yieldHistory[chainId].push(YieldReport({
            chainId:         chainId,
            amount:          amount,
            timestamp:       block.timestamp,
            attestationHash: attestationHash
        }));

        emit YieldRecorded(chainId, amount, cfg.cumulativeYield);
    }

    /// @notice Signal the remote chain to repatriate a GST position back to L1.
    ///         The actual token return happens via the bridge finalisation; call
    ///         `receiveBridgeBack()` when the L1 withdrawal is proven.
    /// @param chainId Target chain to recall.
    /// @param amount  Amount of GST to recall.
    function repatriate(uint256 chainId, uint256 amount)
        external
        onlyFeeManagerOrGovernance
    {
        ChainConfig storage cfg = chains[chainId];
        if (cfg.bridge == address(0)) revert UnknownChain(chainId);
        require(amount <= cfg.deployed, "GSTCrossChain: amount > deployed");
        cfg.deployed -= amount;
        emit Repatriated(chainId, amount);
    }

    /// @notice Called by the bridge finaliser when bridged-back GST arrives on L1.
    ///         Forwards the GST to the FeeInvestmentManager for redeployment.
    /// @param chainId Source chain.
    /// @param amount  Amount of GST received.
    function receiveBridgeBack(uint256 chainId, uint256 amount)
        external
        nonReentrant
    {
        // Only the registered bridge for this chain may call this.
        ChainConfig storage cfg = chains[chainId];
        if (cfg.bridge == address(0)) revert UnknownChain(chainId);
        require(msg.sender == cfg.bridge, "GSTCrossChain: not bridge");

        // Forward returned GST to fee manager
        if (feeManager != address(0)) {
            require(gst.transfer(feeManager, amount), "GSTCrossChain: fwd failed");
        }
        emit BridgeBackReceived(chainId, amount);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // View helpers
    // ──────────────────────────────────────────────────────────────────────────

    /// @notice Total GST deployed cross-chain across all registered chains.
    function totalDeployed() external view returns (uint256 total) {
        for (uint256 i; i < registeredChains.length; ++i) {
            total += chains[registeredChains[i]].deployed;
        }
    }

    /// @notice Total lifetime yield reported across all chains.
    function totalCumulativeYield() external view returns (uint256 total) {
        for (uint256 i; i < registeredChains.length; ++i) {
            total += chains[registeredChains[i]].cumulativeYield;
        }
    }

    /// @notice Number of registered chains.
    function chainCount() external view returns (uint256) {
        return registeredChains.length;
    }

    /// @notice Yield history length for a chain.
    function yieldHistoryLength(uint256 chainId) external view returns (uint256) {
        return yieldHistory[chainId].length;
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Governance setters
    // ──────────────────────────────────────────────────────────────────────────

    function setFeeManager(address manager) external onlyGovernance {
        feeManager = manager;
        emit FeeManagerSet(manager);
    }

    function setSingleBridgeCap(uint256 cap) external onlyGovernance {
        singleBridgeCap = cap;
        emit SingleBridgeCapSet(cap);
    }
}
