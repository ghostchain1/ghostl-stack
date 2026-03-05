# ETH Leakage Inventory (Phase 1 — Read-only)

## Refresh (2026-02-16, targeted first-party rerun)

Generated: `2026-02-16T15:53:51Z`

Targeted scan paths:
- `infra/ghostchain`, `infra/opstack/config`, `infra/opstack/l3`, `infra/scripts`, `config`
- `services`, `apps`, `packages`, `contracts/src`, `observability`
- root compose/env manifests in repository scope

Exclusions:
- `docs/gst-migration/**` (report recursion), `node_modules`, `dist`, `.next`, `build`, `out`, `cache`, `artifacts`
- `backups/**`, `infra/docker/_backup/**`
- vendor/upstream trees: `infra/opstack/op-geth/**`, `infra/opstack/optimism-upstream/**`, `infra/opstack/optimism/**`
- `contracts/lib/**`, `contracts/reports/formal/**`

Forbidden token pattern set:
- `_eth`, `ETH_*`, `ETHEREUM_*`, `*_ETH`, `ethAmount`, `ethBalance`, `nativeEth`, `Ether`, `Ethereum`, `Ξ`, `ETH_RPC`, `ETH_CHAIN_ID`, `ETH_PRIVATE_KEY`, `ghostCAN_*`

Result summary (`33` hits total):
- `GhostChain L1`: `14` (all technical compatibility)
- `GhostL2`: `6` (all technical compatibility)
- `GhostL3`: `6` (all technical compatibility)
- `Services/shared`: `7` (all technical compatibility)
- Blocking/business ETH leakage: `0`

### GhostChain L1
- `infra/ghostchain/.env.l1.example:7` uses upstream vendor image tag `ethereum/client-go` (technical dependency naming).
- `infra/ghostchain/docker-compose.ibft.yml:32` includes `--rpc-http-api=ETH,...` (RPC module namespace compatibility).
- `infra/ghostchain/scripts/ghostscout-entrypoint.sh` maps GST-prefixed env (`GHOSTSCOUT_UPSTREAM_*`) into Blockscout-required `ETHEREUM_JSONRPC_*`.
- `services/ghostscout-l1/entrypoint.sh` has the same compatibility mapping.

### GhostL2
- `services/ghostscout-l2/entrypoint.sh` maps GST-prefixed env into Blockscout-required `ETHEREUM_JSONRPC_*`.

### GhostL3
- `services/ghostscout-l3/entrypoint.sh` maps GST-prefixed env into Blockscout-required `ETHEREUM_JSONRPC_*`.

### Services / Shared
- `infra/scripts/chains/deploy_l2oo.sh` contains Go imports under `github.com/ethereum*` namespace (upstream package names).
- `infra/docker/compose/docker-compose.core.yml` contains one Besu `--rpc-http-api=ETH,...` module list entry.

### Allowed Technical Exception Audit (`eth_*` RPC namespace)
- `eth_*` method usage remains in technical RPC probe/transport contexts only.
- First-party targeted scan produced **no** matches for:
  - `ETH_RPC`
  - `ETH_CHAIN_ID`
  - `ETH_PRIVATE_KEY`
  - `ghostCAN_*`
  - `ethAmount`
  - `ethBalance`
  - `nativeEth`
  - `_eth` identifiers
- Gate check result: `scripts/gst-leakage-gate.sh` => `OK`.

Generated: 2026-02-15T21:53:01+00:00

Notes:
- Scan scope: apps/, services/, packages/, contracts/, infra/, observability/, docs/, config/, environments/, scripts/, tools/, core-service/, plus root env/compose files.
- Excludes build outputs, rollback/, backups/ops/releases, runtime/backup/audit artifacts, and vendor/optimism-upstream/lib directories.
- Matches: _eth, ETH_, Ethereum, Ether, Ξ, ethAmount, ethBalance, nativeEth.
- Output is capped at 500 lines per section; lines truncated to 240 chars.

## root

## apps
(no matches)

## services
services/stack.env:156:L3_GETH_METRICS_HOST_PORT=39606
services/ghost-rpc-proxy/index.mjs:39:  process.env.RPC_DEPRECATE_LEGACY_NAMESPACE === "1" || process.env.RPC_DEPRECATE_ETH_NAMESPACE === "1";
services/ghost-rpc-proxy/index.mjs:41:  process.env.RPC_REJECT_LEGACY_NAMESPACE === "1" || process.env.RPC_REJECT_ETH_NAMESPACE === "1";

## packages
(no matches)

## infra
infra/scripts/env-sync-l1.sh:29:require_var L1_GETH_IMAGE
infra/scripts/env-sync-l1.sh:61:  "${L1_GETH_IMAGE:-}" \
infra/scripts/env-sync-l1.sh:84:GETH_IMAGE=$L1_GETH_IMAGE
infra/scripts/doctor-l3.sh:49:L3_GETH_METRICS_URL="${L3_GETH_METRICS_URL:-http://localhost:${L3_GETH_METRICS_HOST_PORT:-39606}/debug/metrics/prometheus}"
infra/scripts/doctor-l3.sh:734:metric_urls=( "$L3_GETH_METRICS_URL" "$L3_OP_NODE_METRICS_URL" "$L3_BATCHER_METRICS_URL" )
infra/scripts/opstack/up-l3.sh:40:OP_GETH_IMAGE="${OP_GETH_IMAGE:-local/op-geth:${OPSTACK_IMAGE_TAG:-local}}"
infra/scripts/opstack/up-l3.sh:192:    "$OP_GETH_IMAGE" \
infra/scripts/doctor-l2.sh:56:L2_GETH_METRICS_URL="${L2_GETH_METRICS_URL:-http://localhost:29606/debug/metrics/prometheus}"
infra/scripts/doctor-l2.sh:708:metric_urls=( "$L2_GETH_METRICS_URL" "$OP_NODE_METRICS_URL" "$OP_SEQUENCER_METRICS_URL" "$OP_BATCHER_METRICS_URL" )
infra/ghostchain/scripts/init.sh:18:IMG="${L1_GETH_IMAGE:-${GETH_IMAGE:-ghostl/geth:alltools-v1.13.14}}"
infra/ghostchain/.env.l1:8:L1_GETH_IMAGE=ethereum/client-go:alltools-v1.13.14
infra/ghostchain/docker-compose.l1.yml:15:    image: ${GETH_IMAGE:-ghostl/geth:alltools-v1.13.14}
infra/ghostchain/docker-compose.l1.yml:45:    image: ${GETH_IMAGE:-ghostl/geth:alltools-v1.13.14}
infra/ghostchain/docker-compose.l1.yml:99:    image: ${GETH_IMAGE:-ghostl/geth:alltools-v1.13.14}
infra/ghostchain/.env:3:GETH_IMAGE=ethereum/client-go:alltools-v1.13.14
infra/ghostchain/.env.l1.example:7:L1_GETH_IMAGE=ethereum/client-go:alltools-v1.13.14
infra/k8s/blueprints/statefulsets/ghostchain-node2.yaml:38:            "image": "${GETH_IMAGE:-ghostl/geth:alltools-v1.13.14}",
infra/k8s/blueprints/statefulsets/l2-b.yaml:46:                "name": "GETH_MINER_RECOMMIT",
infra/k8s/blueprints/statefulsets/l2-b.yaml:50:                "name": "GETH_ROLLUP_INTEROPRPC",
infra/k8s/blueprints/statefulsets/l2-a.yaml:46:                "name": "GETH_MINER_RECOMMIT",
infra/k8s/blueprints/statefulsets/l2-a.yaml:50:                "name": "GETH_ROLLUP_INTEROPRPC",
infra/k8s/blueprints/statefulsets/l1.yaml:43:                "name": "GETH_MINER_RECOMMIT",
infra/k8s/blueprints/statefulsets/l2.yaml:46:                "name": "GETH_MINER_RECOMMIT",
infra/k8s/blueprints/statefulsets/ghostchain-bootnode.yaml:38:            "image": "${GETH_IMAGE:-ghostl/geth:alltools-v1.13.14}",
infra/k8s/blueprints/statefulsets/ghostchain-node1.yaml:38:            "image": "${GETH_IMAGE:-ghostl/geth:alltools-v1.13.14}",
infra/docker/compose/docker-compose.core.yml:2760:      "image": "${GETH_IMAGE:-ghostl/geth:alltools-v1.13.14}",
infra/docker/compose/docker-compose.core.yml:2929:      "image": "${GETH_IMAGE:-ghostl/geth:alltools-v1.13.14}",
infra/docker/compose/docker-compose.core.yml:4183:        "GETH_MINER_RECOMMIT": "100ms"
infra/docker/compose/docker-compose.core.yml:4410:        "GETH_MINER_RECOMMIT": "100ms",
infra/docker/compose/docker-compose.core.yml:4411:        "GETH_ROLLUP_INTEROPRPC": "ws://op-supervisor:8545"
infra/docker/compose/docker-compose.core.yml:4478:        "GETH_MINER_RECOMMIT": "100ms",
infra/docker/compose/docker-compose.core.yml:4479:        "GETH_ROLLUP_INTEROPRPC": "ws://op-supervisor:8545"
infra/docker/compose/docker-compose.core.yml:5206:        "GETH_MINER_RECOMMIT": "100ms"
infra/opstack/docker-compose.l3.yml:26:      - "${L3_GETH_METRICS_HOST_PORT:-39606}:${L3_GETH_METRICS_PORT:-6060}"
infra/opstack/docker-compose.l3.yml:45:          --metrics --metrics.addr=0.0.0.0 --metrics.port=${L3_GETH_METRICS_PORT:-6060} \
infra/opstack/.env.l3.generated:17:L3_GETH_METRICS_HOST_PORT=39606
infra/opstack/optimism/op-deployer/book/src/user-guide/known-limitations.md:10:anywhere except Sepolia and Ethereum mainnet. If you try to, you'll see an error like this:
infra/opstack/optimism/op-deployer/book/src/user-guide/known-limitations.md:47:development chains, or use Sepolia or Ethereum mainnet as your L1.
infra/opstack/optimism/README.md:6:  <h3><a href="https://optimism.io">Optimism</a> is Ethereum, scaled.</h3>
infra/opstack/optimism/README.md:31:[Optimism](https://www.optimism.io/) is a project dedicated to scaling Ethereum's technology and expanding its ability to coordinate people from across the world to build effective decentralized economies
infra/opstack/optimism/README.md:51:The OP Stack is a collaborative project. By collaborating on free, open software and shared standards, the Optimism Collective aims to prevent siloed software development and rapidly accelerate the develo
infra/opstack/optimism/README.md:119:`op-geth` embeds upstream geth’s version inside its own version as follows: `vMAJOR.GETH_MAJOR GETH_MINOR GETH_PATCH.PATCH`.
infra/opstack/optimism/docs/postmortems/2022-02-02-inflation-vuln.md:154:[Ethereum tests](https://github.com/ethereum/tests) (though not unexpectedly). Modifying the tests
infra/opstack/optimism/docs/postmortems/2022-02-02-inflation-vuln.md:197:- We will ensure the common Ethereum tests are run against Bedrock.
infra/opstack/optimism/op-program/bin/meta-mt64.json:67004:      "name": "github.com/ethereum-optimism/optimism/op-service/eth.Ether",
infra/opstack/optimism/op-program/bin/meta-mt64Next.json:67004:      "name": "github.com/ethereum-optimism/optimism/op-service/eth.Ether",
infra/opstack/optimism/op-program/bin/meta-interop.json:67004:      "name": "github.com/ethereum-optimism/optimism/op-service/eth.Ether",
infra/opstack/optimism/op-program/bin/meta-interopNext.json:67004:      "name": "github.com/ethereum-optimism/optimism/op-service/eth.Ether",
infra/opstack/optimism/devnet-sdk/book/src/shell.md:26:This automatic configuration enables seamless use of Ethereum development tools without explicit endpoint configuration:
infra/opstack/optimism/devnet-sdk/book/src/shell.md:38:The shell environment enhances the experience with various Ethereum development tools:
infra/opstack/optimism/devnet-sdk/book/src/shell.md:44:The shell automatically sets up standard Ethereum environment variables based on the descriptor:
infra/opstack/optimism/devnet-sdk/book/src/shell.md:48:export ETH_RPC_URL=...
infra/opstack/optimism/devnet-sdk/book/src/shell.md:49:export ETH_JWT_SECRET=...
infra/opstack/optimism/kurtosis-devnet/README.md:110:    "name": "Ethereum",
infra/opstack/optimism/kurtosis-devnet/book/src/std_output.md:24:    "name": "Ethereum",
infra/opstack/optimism/kurtosis-devnet/book/src/basic_deployment.md:98:- `chain-name`: Optional chain to connect to (defaults to "Ethereum")
infra/opstack/optimism/kurtosis-devnet/book/src/basic_deployment.md:102:# Enter the Ethereum chain environment in the simple devnet
infra/opstack/optimism/kurtosis-devnet/book/src/basic_deployment.md:133:- `ETH_RPC_URL`: The RPC endpoint for the selected chain
infra/opstack/optimism/kurtosis-devnet/book/src/basic_deployment.md:134:- `ETH_RPC_JWT_SECRET`: JWT secret for authenticated RPC connections (when cast integration is enabled)
infra/opstack/optimism/op-batcher/readme.md:52:4. Sends frames from the channel queue to the DA layer as (e.g. to Ethereum L1 as calldata or blob transactions).
infra/opstack/optimism/op-dispute-mon/README.md:26:  --l1-eth-rpc <L1-Ethereum-RPC-URL> \
infra/opstack/optimism/op-dispute-mon/README.md:32:  --l1-eth-rpc <L1-Ethereum-RPC-URL> \
infra/opstack/optimism/op-supernode/README.md:53:export OP_SUPERNODE_L1_ETH_RPC=$L1_RPC
infra/opstack/optimism/op-dripper/README.md:7:The main configuration for the EOA, Drippie contract to trigger, and the Ethereum L1 RPC.
infra/opstack/optimism/op-dripper/README.md:10:- `OP_DRIPPER_L1_ETH_RPC`: RPC URL for the L1 Ethereum chain
infra/opstack/optimism/packages/contracts-bedrock/interfaces/L1/IOptimismPortalInterop.sol:51:    event ETHMigrated(address indexed lockbox, uint256 ethBalance);
infra/opstack/optimism/packages/contracts-bedrock/interfaces/L1/IOptimismPortalInterop.sol:85:        IETHLockbox _ethLockbox
infra/opstack/optimism/packages/contracts-bedrock/interfaces/L1/IOptimismPortalInterop.sol:123:    function upgrade(IAnchorStateRegistry _anchorStateRegistry, IETHLockbox _ethLockbox) external;
infra/opstack/optimism/packages/contracts-bedrock/scripts/FetchChainInfo.s.sol:71:    address internal _ethLockboxProxy;
infra/opstack/optimism/packages/contracts-bedrock/scripts/FetchChainInfo.s.sol:109:        else if (_sel == this.ethLockboxProxy.selector) _ethLockboxProxy = _addr;
infra/opstack/optimism/packages/contracts-bedrock/scripts/FetchChainInfo.s.sol:152:        return _ethLockboxProxy;
infra/opstack/optimism/packages/contracts-bedrock/scripts/deploy/deploy.sh:10:forge script -vvv scripts/deploy/Deploy.s.sol:Deploy --rpc-url "$DEPLOY_ETH_RPC_URL" --broadcast --private-key "$DEPLOY_PRIVATE_KEY" $verify_flag
infra/opstack/optimism/packages/contracts-bedrock/scripts/deploy/deploy.sh:14:  forge script -vvv scripts/deploy/Deploy.s.sol:Deploy --sig 'sync()' --rpc-url "$DEPLOY_ETH_RPC_URL" --broadcast --private-key "$DEPLOY_PRIVATE_KEY"
infra/opstack/optimism/packages/contracts-bedrock/scripts/deploy/ChainAssertions.sol:301:    function checkETHLockboxImpl(IETHLockbox _ethLockbox, IOptimismPortal _portal) internal view {
infra/opstack/optimism/packages/contracts-bedrock/scripts/deploy/ChainAssertions.sol:302:        console.log("Running chain assertions on the ETHLockbox implementation at %s", address(_ethLockbox));
infra/opstack/optimism/packages/contracts-bedrock/scripts/deploy/ChainAssertions.sol:305:        DeployUtils.assertInitialized({ _contractAddress: address(_ethLockbox), _isProxy: false, _slot: 0, _offset: 0 });
infra/opstack/optimism/packages/contracts-bedrock/scripts/deploy/ChainAssertions.sol:307:        require(address(_ethLockbox.systemConfig()) == address(0), "CHECK-ELB-50");
infra/opstack/optimism/packages/contracts-bedrock/scripts/deploy/ChainAssertions.sol:308:        require(_ethLockbox.authorizedPortals(_portal) == false, "CHECK-ELB-60");
infra/opstack/optimism/packages/contracts-bedrock/scripts/L2Genesis.s.sol:486:        _setImplementationCode(Predeploys.ETH_LIQUIDITY);
infra/opstack/optimism/packages/contracts-bedrock/scripts/L2Genesis.s.sol:487:        vm.deal(Predeploys.ETH_LIQUIDITY, type(uint248).max);
infra/opstack/optimism/packages/contracts-bedrock/scripts/L2Genesis.s.sol:493:        _setImplementationCode(Predeploys.SUPERCHAIN_ETH_BRIDGE);
infra/opstack/optimism/packages/contracts-bedrock/src/L1/OPContractsManagerStandardValidator.sol:435:        if (!_sysCfg.isFeatureEnabled(Features.ETH_LOCKBOX)) {
infra/opstack/optimism/packages/contracts-bedrock/src/L1/OptimismPortalInterop.sol:156:    /// @param ethBalance Amount of ETH migrated.
infra/opstack/optimism/packages/contracts-bedrock/src/L1/OptimismPortalInterop.sol:157:    event ETHMigrated(address indexed lockbox, uint256 ethBalance);
infra/opstack/optimism/packages/contracts-bedrock/src/L1/OptimismPortalInterop.sol:246:    /// @param _ethLockbox Contract of the ETHLockbox.
infra/opstack/optimism/packages/contracts-bedrock/src/L1/OptimismPortalInterop.sol:250:        IETHLockbox _ethLockbox
infra/opstack/optimism/packages/contracts-bedrock/src/L1/OptimismPortalInterop.sol:261:        ethLockbox = _ethLockbox;
infra/opstack/optimism/packages/contracts-bedrock/src/L1/OptimismPortalInterop.sol:274:    /// @param _ethLockbox ETHLockbox contract.
infra/opstack/optimism/packages/contracts-bedrock/src/L1/OptimismPortalInterop.sol:277:        IETHLockbox _ethLockbox
infra/opstack/optimism/packages/contracts-bedrock/src/L1/OptimismPortalInterop.sol:287:        ethLockbox = _ethLockbox;
infra/opstack/optimism/packages/contracts-bedrock/src/L1/OptimismPortalInterop.sol:376:        uint256 ethBalance = address(this).balance;
infra/opstack/optimism/packages/contracts-bedrock/src/L1/OptimismPortalInterop.sol:377:        ethLockbox.lockETH{ value: ethBalance }();
infra/opstack/optimism/packages/contracts-bedrock/src/L1/OptimismPortalInterop.sol:378:        emit ETHMigrated(address(ethLockbox), ethBalance);
infra/opstack/optimism/packages/contracts-bedrock/src/L1/OPContractsManager.sol:1165:            output.systemConfigProxy.setFeature(Features.ETH_LOCKBOX, true);
infra/opstack/optimism/packages/contracts-bedrock/src/L1/L1ERC721Bridge.sol:23:///         make it possible to transfer ERC721 tokens from Ethereum to Optimism. This contract
infra/opstack/optimism/packages/contracts-bedrock/src/L1/SystemConfig.sol:534:        if (_feature == Features.ETH_LOCKBOX) {
infra/opstack/optimism/packages/contracts-bedrock/src/L1/SystemConfig.sol:574:        address identifier = isFeatureEnabled[Features.ETH_LOCKBOX]
infra/opstack/optimism/packages/contracts-bedrock/src/L1/OptimismPortal2.sol:614:        return systemConfig.isFeatureEnabled(Features.ETH_LOCKBOX) && address(ethLockbox) != address(0);
infra/opstack/optimism/packages/contracts-bedrock/src/L1/OptimismPortal2.sol:627:            systemConfig.isFeatureEnabled(Features.ETH_LOCKBOX) && address(ethLockbox) == address(0)
infra/opstack/optimism/packages/contracts-bedrock/src/L1/OptimismPortal2.sol:628:                || !systemConfig.isFeatureEnabled(Features.ETH_LOCKBOX) && address(ethLockbox) != address(0)
infra/opstack/optimism/packages/contracts-bedrock/src/libraries/Features.sol:8:    /// @notice The ETH_LOCKBOX feature determines if the system is configured to use the
infra/opstack/optimism/packages/contracts-bedrock/src/libraries/Features.sol:9:    ///         ETHLockbox contract in the OptimismPortal. When the ETH_LOCKBOX feature is active
infra/opstack/optimism/packages/contracts-bedrock/src/libraries/Features.sol:12:    bytes32 internal constant ETH_LOCKBOX = "ETH_LOCKBOX";
infra/opstack/optimism/packages/contracts-bedrock/src/libraries/trie/MerkleTrie.sol:9:/// @notice MerkleTrie is a small library for verifying standard Ethereum Merkle-Patricia trie
infra/opstack/optimism/packages/contracts-bedrock/src/libraries/trie/MerkleTrie.sol:151:                    // Our Merkle Trie is designed specifically for the purposes of the Ethereum
infra/opstack/optimism/packages/contracts-bedrock/src/libraries/trie/SecureMerkleTrie.sol:9:///         keys. Ethereum's state trie hashes input keys before storing them.
infra/opstack/optimism/packages/contracts-bedrock/src/libraries/Predeploys.sol:98:    address internal constant SUPERCHAIN_ETH_BRIDGE = 0x4200000000000000000000000000000000000024;
infra/opstack/optimism/packages/contracts-bedrock/src/libraries/Predeploys.sol:101:    address internal constant ETH_LIQUIDITY = 0x4200000000000000000000000000000000000025;
infra/opstack/optimism/packages/contracts-bedrock/src/libraries/Predeploys.sol:146:        if (_addr == SUPERCHAIN_ETH_BRIDGE) return "SuperchainETHBridge";
infra/opstack/optimism/packages/contracts-bedrock/src/libraries/Predeploys.sol:147:        if (_addr == ETH_LIQUIDITY) return "ETHLiquidity";
infra/opstack/optimism/packages/contracts-bedrock/src/libraries/Preinstalls.sol:70:    // @notice Permit2 code is templated. The template is a copy of the Mainnet Ethereum L1 Permit2 deployment.
infra/opstack/optimism/packages/contracts-bedrock/src/libraries/GasPayingToken.sol:54:    ///         If nothing is set in storage, then the ether name, 'Ether', is returned instead.
infra/opstack/optimism/packages/contracts-bedrock/src/libraries/GasPayingToken.sol:58:            name_ = "Ether";
infra/opstack/optimism/packages/contracts-bedrock/src/L2/WETH.sol:21:    /// @notice Returns the name of the wrapped native asset. Will be "Wrapped Ether"
infra/opstack/optimism/packages/contracts-bedrock/src/L2/WETH.sol:22:    ///         if the native asset is Ether.
infra/opstack/optimism/packages/contracts-bedrock/src/L2/WETH.sol:28:    ///         native asset is Ether.
infra/opstack/optimism/packages/contracts-bedrock/src/L2/ETHLiquidity.sol:39:        if (msg.sender != Predeploys.SUPERCHAIN_ETH_BRIDGE) revert Unauthorized();
infra/opstack/optimism/packages/contracts-bedrock/src/L2/ETHLiquidity.sol:46:        if (msg.sender != Predeploys.SUPERCHAIN_ETH_BRIDGE) revert Unauthorized();
infra/opstack/optimism/packages/contracts-bedrock/src/L2/OptimismMintableERC721.sol:17:///         typically an Optimism representation of an Ethereum-based token. Standard reference
infra/opstack/optimism/packages/contracts-bedrock/src/L2/L2ERC721Bridge.sol:21:///         make it possible to transfer ERC721 tokens from Ethereum to Optimism. This contract
infra/opstack/optimism/packages/contracts-bedrock/src/L2/L2ERC721Bridge.sol:25:///         bridge ONLY supports ERC721s originally deployed on Ethereum.
infra/opstack/optimism/packages/contracts-bedrock/src/L2/SuperchainETHBridge.sol:49:        IETHLiquidity(Predeploys.ETH_LIQUIDITY).burn{ value: msg.value }();
infra/opstack/optimism/packages/contracts-bedrock/src/L2/SuperchainETHBridge.sol:73:        IETHLiquidity(Predeploys.ETH_LIQUIDITY).mint(_amount);
infra/opstack/optimism/packages/contracts-bedrock/src/L2/L1Block.sol:82:        name_ = "Ether";
infra/opstack/optimism/packages/contracts-bedrock/src/universal/WETH98.sol:68:        return "Wrapped Ether";
infra/opstack/optimism/packages/contracts-bedrock/src/universal/ERC721Bridge.sol:116:    ///         bridge only supports ERC721s originally deployed on Ethereum. Users will need to
infra/opstack/optimism/packages/contracts-bedrock/src/universal/ERC721Bridge.sol:150:    ///         bridge only supports ERC721s originally deployed on Ethereum. Users will need to
infra/opstack/optimism/packages/contracts-bedrock/src/safe/SafeSigners.sol:71:                // To support eth_sign and similar we adjust v and hash the messageHash with the Ethereum message prefix
infra/opstack/optimism/packages/contracts-bedrock/src/safe/SafeSigners.sol:74:                    ecrecover(keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", _dataHash)), v - 4, r, s);
infra/opstack/optimism/packages/contracts-bedrock/snapshots/abi/OptimismPortalInterop.json:300:        "name": "_ethLockbox",
infra/opstack/optimism/packages/contracts-bedrock/snapshots/abi/OptimismPortalInterop.json:790:        "name": "_ethLockbox",
infra/opstack/optimism/packages/contracts-bedrock/snapshots/abi/OptimismPortalInterop.json:824:        "name": "ethBalance",
infra/opstack/optimism/packages/contracts-bedrock/forge-artifacts/ECDSA.sol/ECDSA.0.8.19.json:1:{"abi":[],"bytecode":{"object":"0x602d6037600b82828239805160001a607314602a57634e487b7160e01b600052600060045260246000fd5b30600052607381538281f3fe
infra/opstack/optimism/packages/contracts-bedrock/forge-artifacts/ECDSA.sol/ECDSA.0.8.15.json:1:{"abi":[],"bytecode":{"object":"0x602d6037600b82828239805160001a607314602a57634e487b7160e01b600052600060045260246000fd5b30600052607381538281f3fe
infra/opstack/optimism/packages/contracts-bedrock/forge-artifacts/LegacyMintableERC20.sol/LegacyMintableERC20.json:1:{"abi":[{"type":"constructor","inputs":[{"name":"_l2Bridge","type":"address","internalType":"address"},{"name":"_l1Token","
infra/opstack/optimism/packages/contracts-bedrock/forge-artifacts/ERC20Burnable.sol/ERC20Burnable.json:1:{"abi":[{"type":"function","name":"allowance","inputs":[{"name":"owner","type":"address","internalType":"address"},{"name":"spender","t
infra/opstack/optimism/packages/contracts-bedrock/forge-artifacts/WETH.sol/WETH.json:1:{"abi":[{"type":"fallback","stateMutability":"payable"},{"type":"receive","stateMutability":"payable"},{"type":"function","name":"allowance","inputs":[{"
infra/opstack/optimism/packages/contracts-bedrock/forge-artifacts/OPContractsManagerStandardValidator.sol/OPContractsManagerStandardValidator.json:1:{"abi":[{"type":"constructor","inputs":[{"name":"_implementations","type":"tuple","internal
infra/opstack/optimism/packages/contracts-bedrock/forge-artifacts/DeployOPChain.s.sol/DeployOPChain.json:1:{"abi":[{"type":"function","name":"IS_SCRIPT","inputs":[],"outputs":[{"name":"","type":"bool","internalType":"bool"}],"stateMutabilit
infra/opstack/optimism/packages/contracts-bedrock/forge-artifacts/Deploy.s.sol/Deploy.json:1:{"abi":[{"type":"function","name":"IS_SCRIPT","inputs":[],"outputs":[{"name":"","type":"bool","internalType":"bool"}],"stateMutability":"view"},{"t
infra/opstack/optimism/packages/contracts-bedrock/forge-artifacts/FaultDisputeGameV2.sol/FaultDisputeGameV2.json:1:{"abi":[{"type":"constructor","inputs":[{"name":"_params","type":"tuple","internalType":"struct FaultDisputeGameV2.GameConstr
infra/opstack/optimism/packages/contracts-bedrock/forge-artifacts/MessageHashUtils.sol/MessageHashUtils.json:1:{"abi":[],"bytecode":{"object":"0x602c6032600b8282823980515f1a607314602657634e487b7160e01b5f525f60045260245ffd5b305f5260738153828
infra/opstack/optimism/packages/contracts-bedrock/forge-artifacts/OptimismPortalInterop.sol/OptimismPortalInterop.json:1:{"abi":[{"type":"constructor","inputs":[{"name":"_proofMaturityDelaySeconds","type":"uint256","internalType":"uint256"}
infra/opstack/optimism/packages/contracts-bedrock/forge-artifacts/OPContractsManager.sol/OPContractsManagerDeployer.json:1:{"abi":[{"type":"constructor","inputs":[{"name":"_contractsContainer","type":"address","internalType":"contract OPCon
infra/opstack/optimism/packages/contracts-bedrock/forge-artifacts/OPContractsManager.sol/OPContractsManagerUpgrader.json:1:{"abi":[{"type":"constructor","inputs":[{"name":"_contractsContainer","type":"address","internalType":"contract OPCon
infra/opstack/optimism/packages/contracts-bedrock/forge-artifacts/OPContractsManager.sol/OPContractsManager.json:1:{"abi":[{"type":"constructor","inputs":[{"name":"_opcmGameTypeAdder","type":"address","internalType":"contract OPContractsMan
infra/opstack/optimism/packages/contracts-bedrock/forge-artifacts/OPContractsManager.sol/OPContractsManagerGameTypeAdder.json:1:{"abi":[{"type":"constructor","inputs":[{"name":"_contractsContainer","type":"address","internalType":"contract 
infra/opstack/optimism/packages/contracts-bedrock/forge-artifacts/OPContractsManager.sol/OPContractsManagerInteropMigrator.json:1:{"abi":[{"type":"constructor","inputs":[{"name":"_contractsContainer","type":"address","internalType":"contrac
infra/opstack/optimism/packages/contracts-bedrock/forge-artifacts/OPContractsManager.sol/OPContractsManagerBase.json:1:{"abi":[{"type":"function","name":"assertValidContractAddress","inputs":[{"name":"_who","type":"address","internalType":"
infra/opstack/optimism/packages/contracts-bedrock/forge-artifacts/OPContractsManager.sol/OPContractsManagerContractsContainer.json:1:{"abi":[{"type":"constructor","inputs":[{"name":"_blueprints","type":"tuple","internalType":"struct OPContr
infra/opstack/optimism/packages/contracts-bedrock/forge-artifacts/Features.sol/Features.0.8.25.json:1:{"abi":[],"bytecode":{"object":"0x602c6032600b8282823980515f1a607314602657634e487b7160e01b5f525f60045260245ffd5b305f52607381538281f3fe7300
infra/opstack/optimism/packages/contracts-bedrock/forge-artifacts/Features.sol/Features.0.8.15.json:1:{"abi":[],"bytecode":{"object":"0x602d6037600b82828239805160001a607314602a57634e487b7160e01b600052600060045260246000fd5b306000526073815382
infra/opstack/optimism/packages/contracts-bedrock/forge-artifacts/Features.sol/Features.0.8.30.json:1:{"abi":[],"bytecode":{"object":"0x602c6032600b8282823980515f1a607314602657634e487b7160e01b5f525f60045260245ffd5b305f52607381538281f3fe7300
infra/opstack/optimism/packages/contracts-bedrock/forge-artifacts/Features.sol/Features.0.8.15.dispute.json:1:{"abi":[],"bytecode":{"object":"0x602d6037600b82828239805160001a607314602a57634e487b7160e01b600052600060045260246000fd5b3060005260
infra/opstack/optimism/packages/contracts-bedrock/forge-artifacts/ETHLiquidity.sol/ETHLiquidity.json:1:{"abi":[{"type":"function","name":"burn","inputs":[],"outputs":[],"stateMutability":"payable"},{"type":"function","name":"fund","inputs":
infra/opstack/optimism/packages/contracts-bedrock/forge-artifacts/L1ERC721Bridge.sol/L1ERC721Bridge.json:1:{"abi":[{"type":"constructor","inputs":[],"stateMutability":"nonpayable"},{"type":"function","name":"MESSENGER","inputs":[],"outputs"
infra/opstack/optimism/packages/contracts-bedrock/forge-artifacts/DeployImplementations.s.sol/DeployImplementations.json:1:{"abi":[{"type":"function","name":"IS_SCRIPT","inputs":[],"outputs":[{"name":"","type":"bool","internalType":"bool"}]
infra/opstack/optimism/packages/contracts-bedrock/forge-artifacts/DeployDisputeGame2.s.sol/DeployDisputeGame2.json:1:{"abi":[{"type":"function","name":"IS_SCRIPT","inputs":[],"outputs":[{"name":"","type":"bool","internalType":"bool"}],"stat
infra/opstack/optimism/packages/contracts-bedrock/forge-artifacts/IFaultDisputeGame.sol/IFaultDisputeGame.0.8.30.default.json:1:{"abi":[{"type":"function","name":"__constructor__","inputs":[{"name":"_params","type":"tuple","internalType":"s
infra/opstack/optimism/packages/contracts-bedrock/forge-artifacts/IFaultDisputeGame.sol/IFaultDisputeGame.0.8.15.default.json:1:{"abi":[{"type":"function","name":"__constructor__","inputs":[{"name":"_params","type":"tuple","internalType":"s
infra/opstack/optimism/packages/contracts-bedrock/forge-artifacts/IFaultDisputeGame.sol/IFaultDisputeGame.0.8.25.default.json:1:{"abi":[{"type":"function","name":"__constructor__","inputs":[{"name":"_params","type":"tuple","internalType":"s
infra/opstack/optimism/packages/contracts-bedrock/forge-artifacts/IFaultDisputeGame.sol/IFaultDisputeGame.0.8.15.dispute.json:1:{"abi":[{"type":"function","name":"__constructor__","inputs":[{"name":"_params","type":"tuple","internalType":"s
infra/opstack/optimism/packages/contracts-bedrock/forge-artifacts/FetchChainInfo.s.sol/IFetcher.json:1:{"abi":[{"type":"function","name":"GUARDIAN","inputs":[],"outputs":[{"name":"","type":"address","internalType":"address"}],"stateMutabili
infra/opstack/optimism/packages/contracts-bedrock/forge-artifacts/FetchChainInfo.s.sol/FetchChainInfo.json:1:{"abi":[{"type":"function","name":"IS_SCRIPT","inputs":[],"outputs":[{"name":"","type":"bool","internalType":"bool"}],"stateMutabil
infra/opstack/optimism/packages/contracts-bedrock/forge-artifacts/FetchChainInfo.s.sol/FetchChainInfoOutput.json:1:{"abi":[{"type":"function","name":"addressManagerImpl","inputs":[],"outputs":[{"name":"","type":"address","internalType":"add
infra/opstack/optimism/packages/contracts-bedrock/forge-artifacts/FetchChainInfo.s.sol/FetchChainInfoInput.json:1:{"abi":[{"type":"function","name":"l1StandardBridgeProxy","inputs":[],"outputs":[{"name":"","type":"address","internalType":"a
infra/opstack/optimism/packages/contracts-bedrock/forge-artifacts/IPermissionedDisputeGame.sol/IPermissionedDisputeGame.0.8.30.default.json:1:{"abi":[{"type":"function","name":"__constructor__","inputs":[{"name":"_params","type":"tuple","in
infra/opstack/optimism/packages/contracts-bedrock/forge-artifacts/IPermissionedDisputeGame.sol/IPermissionedDisputeGame.0.8.15.dispute.json:1:{"abi":[{"type":"function","name":"__constructor__","inputs":[{"name":"_params","type":"tuple","in
infra/opstack/optimism/packages/contracts-bedrock/forge-artifacts/IPermissionedDisputeGame.sol/IPermissionedDisputeGame.0.8.15.default.json:1:{"abi":[{"type":"function","name":"__constructor__","inputs":[{"name":"_params","type":"tuple","in
infra/opstack/optimism/packages/contracts-bedrock/forge-artifacts/Predeploys.sol/Predeploys.0.8.19.json:1:{"abi":[],"bytecode":{"object":"0x602d6037600b82828239805160001a607314602a57634e487b7160e01b600052600060045260246000fd5b30600052607381
infra/opstack/optimism/packages/contracts-bedrock/forge-artifacts/Predeploys.sol/Predeploys.0.8.30.json:1:{"abi":[],"bytecode":{"object":"0x602c6032600b8282823980515f1a607314602657634e487b7160e01b5f525f60045260245ffd5b305f52607381538281f3fe
infra/opstack/optimism/packages/contracts-bedrock/forge-artifacts/Predeploys.sol/Predeploys.0.8.25.json:1:{"abi":[],"bytecode":{"object":"0x602c6032600b8282823980515f1a607314602657634e487b7160e01b5f525f60045260245ffd5b305f52607381538281f3fe
infra/opstack/optimism/packages/contracts-bedrock/forge-artifacts/Predeploys.sol/Predeploys.0.8.15.dispute.json:1:{"abi":[],"bytecode":{"object":"0x602d6037600b82828239805160001a607314602a57634e487b7160e01b600052600060045260246000fd5b306000
infra/opstack/optimism/packages/contracts-bedrock/forge-artifacts/Predeploys.sol/Predeploys.0.8.15.json:1:{"abi":[],"bytecode":{"object":"0x602d6037600b82828239805160001a607314602a57634e487b7160e01b600052600060045260246000fd5b30600052607381
infra/opstack/optimism/packages/contracts-bedrock/forge-artifacts/draft-ERC20Permit.sol/ERC20Permit.json:1:{"abi":[{"type":"function","name":"DOMAIN_SEPARATOR","inputs":[],"outputs":[{"name":"","type":"bytes32","internalType":"bytes32"}],"s
infra/opstack/optimism/packages/contracts-bedrock/forge-artifacts/SafeSigners.sol/SafeSigners.json:1:{"abi":[],"bytecode":{"object":"0x602c6032600b8282823980515f1a607314602657634e487b7160e01b5f525f60045260245ffd5b305f52607381538281f3fe73000
infra/opstack/optimism/packages/contracts-bedrock/forge-artifacts/SafeSigners.sol/SafeSigners.0.8.25.json:1:{"abi":[],"bytecode":{"object":"0x602c6032600b8282823980515f1a607314602657634e487b7160e01b5f525f60045260245ffd5b305f52607381538281f3
infra/opstack/optimism/packages/contracts-bedrock/forge-artifacts/SafeSigners.sol/SafeSigners.0.8.15.json:1:{"abi":[],"bytecode":{"object":"0x602d6037600b82828239805160001a607314602a57634e487b7160e01b600052600060045260246000fd5b306000526073
infra/opstack/optimism/packages/contracts-bedrock/forge-artifacts/EtherPaymentFallback.sol/EtherPaymentFallback.0.8.25.json:1:{"abi":[{"type":"receive","stateMutability":"payable"},{"type":"event","name":"SafeReceived","inputs":[{"name":"se
infra/opstack/optimism/packages/contracts-bedrock/forge-artifacts/EtherPaymentFallback.sol/EtherPaymentFallback.0.8.15.json:1:{"abi":[{"type":"receive","stateMutability":"payable"},{"type":"event","name":"SafeReceived","inputs":[{"name":"se
infra/opstack/optimism/packages/contracts-bedrock/forge-artifacts/EAS.sol/EAS.json:1:{"abi":[{"type":"constructor","inputs":[],"stateMutability":"nonpayable"},{"type":"function","name":"attest","inputs":[{"name":"request","type":"tuple","in
infra/opstack/optimism/packages/contracts-bedrock/forge-artifacts/GovernanceToken.sol/GovernanceToken.json:1:{"abi":[{"type":"constructor","inputs":[],"stateMutability":"nonpayable"},{"type":"function","name":"DOMAIN_SEPARATOR","inputs":[],
infra/opstack/optimism/packages/contracts-bedrock/forge-artifacts/AddGameType.s.sol/AddGameType.json:1:{"abi":[{"type":"function","name":"IS_SCRIPT","inputs":[],"outputs":[{"name":"","type":"bool","internalType":"bool"}],"stateMutability":"
infra/opstack/optimism/packages/contracts-bedrock/forge-artifacts/AddGameType.s.sol/DummyCaller.json:1:{"abi":[{"type":"function","name":"addGameType","inputs":[{"name":"_gameConfigs","type":"tuple[]","internalType":"struct OPContractsManag
infra/opstack/optimism/packages/contracts-bedrock/forge-artifacts/ERC20Votes.sol/ERC20Votes.json:1:{"abi":[{"type":"function","name":"DOMAIN_SEPARATOR","inputs":[],"outputs":[{"name":"","type":"bytes32","internalType":"bytes32"}],"stateMuta
infra/opstack/optimism/packages/contracts-bedrock/forge-artifacts/SystemConfig.sol/SystemConfig.json:1:{"abi":[{"type":"constructor","inputs":[],"stateMutability":"nonpayable"},{"type":"function","name":"BATCH_INBOX_SLOT","inputs":[],"outpu
infra/opstack/optimism/packages/contracts-bedrock/forge-artifacts/ISchemaRegistry.sol/ISchemaRegistry.0.8.25.json:1:{"abi":[{"type":"function","name":"getSchema","inputs":[{"name":"uid","type":"bytes32","internalType":"bytes32"}],"outputs":
infra/opstack/optimism/packages/contracts-bedrock/forge-artifacts/ISchemaRegistry.sol/ISchemaRegistry.json:1:{"abi":[{"type":"function","name":"getSchema","inputs":[{"name":"uid","type":"bytes32","internalType":"bytes32"}],"outputs":[{"name
infra/opstack/optimism/packages/contracts-bedrock/forge-artifacts/ISchemaRegistry.sol/ISchemaRegistry.0.8.19.json:1:{"abi":[{"type":"function","name":"getSchema","inputs":[{"name":"uid","type":"bytes32","internalType":"bytes32"}],"outputs":
infra/opstack/optimism/packages/contracts-bedrock/forge-artifacts/IOPContractsManager.sol/IOPContractsManagerGameTypeAdder.0.8.30.json:1:{"abi":[{"type":"function","name":"__constructor__","inputs":[{"name":"_contractsContainer","type":"add
infra/opstack/optimism/packages/contracts-bedrock/forge-artifacts/IOPContractsManager.sol/IOPContractsManagerContractsContainer.0.8.15.json:1:{"abi":[{"type":"function","name":"__constructor__","inputs":[{"name":"_blueprints","type":"tuple"
infra/opstack/optimism/packages/contracts-bedrock/forge-artifacts/IOPContractsManager.sol/IOPContractsManagerDeployer.0.8.15.json:1:{"abi":[{"type":"function","name":"__constructor__","inputs":[{"name":"_contractsContainer","type":"address"
infra/opstack/optimism/packages/contracts-bedrock/forge-artifacts/IOPContractsManager.sol/IOPContractsManager.0.8.30.json:1:{"abi":[{"type":"function","name":"__constructor__","inputs":[{"name":"_opcmGameTypeAdder","type":"address","interna
infra/opstack/optimism/packages/contracts-bedrock/forge-artifacts/IOPContractsManager.sol/IOPContractsManagerUpgrader.0.8.15.json:1:{"abi":[{"type":"function","name":"__constructor__","inputs":[{"name":"_contractsContainer","type":"address"
infra/opstack/optimism/packages/contracts-bedrock/forge-artifacts/IOPContractsManager.sol/IOPContractsManagerGameTypeAdder.0.8.15.json:1:{"abi":[{"type":"function","name":"__constructor__","inputs":[{"name":"_contractsContainer","type":"add
infra/opstack/optimism/packages/contracts-bedrock/forge-artifacts/IOPContractsManager.sol/IOPContractsManager.0.8.15.json:1:{"abi":[{"type":"function","name":"__constructor__","inputs":[{"name":"_opcmGameTypeAdder","type":"address","interna
infra/opstack/optimism/packages/contracts-bedrock/forge-artifacts/IOPContractsManager.sol/IOPContractsManagerDeployer.0.8.30.json:1:{"abi":[{"type":"function","name":"__constructor__","inputs":[{"name":"_contractsContainer","type":"address"
infra/opstack/optimism/packages/contracts-bedrock/forge-artifacts/IOPContractsManager.sol/IOPContractsManagerUpgrader.0.8.30.json:1:{"abi":[{"type":"function","name":"__constructor__","inputs":[{"name":"_contractsContainer","type":"address"
infra/opstack/optimism/packages/contracts-bedrock/forge-artifacts/IOPContractsManager.sol/IOPContractsManagerContractsContainer.0.8.30.json:1:{"abi":[{"type":"function","name":"__constructor__","inputs":[{"name":"_blueprints","type":"tuple"
infra/opstack/optimism/packages/contracts-bedrock/forge-artifacts/IOPContractsManager.sol/IOPContractsManagerInteropMigrator.0.8.30.json:1:{"abi":[{"type":"function","name":"__constructor__","inputs":[{"name":"_contractsContainer","type":"a
infra/opstack/optimism/packages/contracts-bedrock/forge-artifacts/IOPContractsManager.sol/IOPContractsManagerInteropMigrator.0.8.15.json:1:{"abi":[{"type":"function","name":"__constructor__","inputs":[{"name":"_contractsContainer","type":"a
infra/opstack/optimism/packages/contracts-bedrock/forge-artifacts/ISuperFaultDisputeGame.sol/ISuperFaultDisputeGame.json:1:{"abi":[{"type":"function","name":"__constructor__","inputs":[{"name":"_params","type":"tuple","internalType":"struct
infra/opstack/optimism/packages/contracts-bedrock/forge-artifacts/ModuleManager.sol/ModuleManager.0.8.25.json:1:{"abi":[{"type":"function","name":"disableModule","inputs":[{"name":"prevModule","type":"address","internalType":"address"},{"na
infra/opstack/optimism/packages/contracts-bedrock/forge-artifacts/ModuleManager.sol/ModuleManager.0.8.15.json:1:{"abi":[{"type":"function","name":"disableModule","inputs":[{"name":"prevModule","type":"address","internalType":"address"},{"na
infra/opstack/optimism/packages/contracts-bedrock/forge-artifacts/Vm.sol/Vm.json:1:{"abi":[{"type":"function","name":"accessList","inputs":[{"name":"access","type":"tuple[]","internalType":"struct VmSafe.AccessListItem[]","components":[{"na
infra/opstack/optimism/packages/contracts-bedrock/forge-artifacts/Vm.sol/VmSafe.0.8.19.default.json:1:{"abi":[{"type":"function","name":"accesses","inputs":[{"name":"target","type":"address","internalType":"address"}],"outputs":[{"name":"re
infra/opstack/optimism/packages/contracts-bedrock/forge-artifacts/Vm.sol/Vm.0.8.25.default.json:1:{"abi":[{"type":"function","name":"accessList","inputs":[{"name":"access","type":"tuple[]","internalType":"struct VmSafe.AccessListItem[]","co
infra/opstack/optimism/packages/contracts-bedrock/forge-artifacts/Vm.sol/VmSafe.0.8.15.dispute.json:1:{"abi":[{"type":"function","name":"accesses","inputs":[{"name":"target","type":"address","internalType":"address"}],"outputs":[{"name":"re
infra/opstack/optimism/packages/contracts-bedrock/forge-artifacts/Vm.sol/VmSafe.0.8.25.default.json:1:{"abi":[{"type":"function","name":"accesses","inputs":[{"name":"target","type":"address","internalType":"address"}],"outputs":[{"name":"re
infra/opstack/optimism/packages/contracts-bedrock/forge-artifacts/Vm.sol/Vm.0.8.15.dispute.json:1:{"abi":[{"type":"function","name":"accessList","inputs":[{"name":"access","type":"tuple[]","internalType":"struct VmSafe.AccessListItem[]","co
infra/opstack/optimism/packages/contracts-bedrock/forge-artifacts/Vm.sol/VmSafe.json:1:{"abi":[{"type":"function","name":"accesses","inputs":[{"name":"target","type":"address","internalType":"address"}],"outputs":[{"name":"readSlots","type"
infra/opstack/optimism/packages/contracts-bedrock/forge-artifacts/Vm.sol/Vm.0.8.15.default.json:1:{"abi":[{"type":"function","name":"accessList","inputs":[{"name":"access","type":"tuple[]","internalType":"struct VmSafe.AccessListItem[]","co
infra/opstack/optimism/packages/contracts-bedrock/forge-artifacts/Vm.sol/VmSafe.0.8.15.default.json:1:{"abi":[{"type":"function","name":"accesses","inputs":[{"name":"target","type":"address","internalType":"address"}],"outputs":[{"name":"re
infra/opstack/optimism/packages/contracts-bedrock/forge-artifacts/Vm.sol/Vm.0.8.19.default.json:1:{"abi":[{"type":"function","name":"accessList","inputs":[{"name":"access","type":"tuple[]","internalType":"struct VmSafe.AccessListItem[]","co
infra/opstack/optimism/packages/contracts-bedrock/forge-artifacts/OptimismPortal2.sol/OptimismPortal2.json:1:{"abi":[{"type":"constructor","inputs":[{"name":"_proofMaturityDelaySeconds","type":"uint256","internalType":"uint256"}],"stateMuta
infra/opstack/optimism/packages/contracts-bedrock/forge-artifacts/GnosisSafe.sol/GnosisSafe.0.8.15.json:1:{"abi":[{"type":"constructor","inputs":[],"stateMutability":"nonpayable"},{"type":"fallback","stateMutability":"nonpayable"},{"type":"
infra/opstack/optimism/packages/contracts-bedrock/forge-artifacts/GnosisSafe.sol/GnosisSafe.0.8.25.json:1:{"abi":[{"type":"constructor","inputs":[],"stateMutability":"nonpayable"},{"type":"fallback","stateMutability":"nonpayable"},{"type":"
infra/opstack/optimism/packages/contracts-bedrock/forge-artifacts/SchemaRegistry.sol/SchemaRegistry.json:1:{"abi":[{"type":"function","name":"getSchema","inputs":[{"name":"uid","type":"bytes32","internalType":"bytes32"}],"outputs":[{"name":
infra/opstack/optimism/packages/contracts-bedrock/forge-artifacts/SuperFaultDisputeGame.sol/SuperFaultDisputeGame.json:1:{"abi":[{"type":"constructor","inputs":[{"name":"_params","type":"tuple","internalType":"struct SuperFaultDisputeGame.G
infra/opstack/optimism/packages/contracts-bedrock/forge-artifacts/IPermissionedDisputeGameV2.sol/IPermissionedDisputeGameV2.json:1:{"abi":[{"type":"function","name":"__constructor__","inputs":[{"name":"_params","type":"tuple","internalType"
infra/opstack/optimism/packages/contracts-bedrock/forge-artifacts/ERC20/ERC20.sol/ERC20.json:1:{"abi":[{"type":"constructor","inputs":[{"name":"name_","type":"string","internalType":"string"},{"name":"symbol_","type":"string","internalType"
infra/opstack/optimism/packages/contracts-bedrock/forge-artifacts/libraries/GasPayingToken.sol/IGasToken.json:1:{"abi":[{"type":"function","name":"gasPayingToken","inputs":[],"outputs":[{"name":"","type":"address","internalType":"address"},
infra/opstack/optimism/packages/contracts-bedrock/forge-artifacts/libraries/GasPayingToken.sol/GasPayingToken.json:1:{"abi":[],"bytecode":{"object":"0x602c6032600b8282823980515f1a607314602657634e487b7160e01b5f525f60045260245ffd5b305f5260738
infra/opstack/optimism/packages/contracts-bedrock/forge-artifacts/IOptimismPortalInterop.sol/IOptimismPortalInterop.default.json:1:{"abi":[{"type":"receive","stateMutability":"payable"},{"type":"function","name":"__constructor__","inputs":[
infra/opstack/optimism/packages/contracts-bedrock/forge-artifacts/IOptimismPortalInterop.sol/IOptimismPortalInterop.dispute.json:1:{"abi":[{"type":"receive","stateMutability":"payable"},{"type":"function","name":"__constructor__","inputs":[
infra/opstack/optimism/packages/contracts-bedrock/forge-artifacts/OptimismMintableERC721.sol/OptimismMintableERC721.json:1:{"abi":[{"type":"constructor","inputs":[{"name":"_bridge","type":"address","internalType":"address"},{"name":"_remote
infra/opstack/optimism/packages/contracts-bedrock/forge-artifacts/GasPayingToken.sol/IGasToken.json:1:{"abi":[{"type":"function","name":"gasPayingToken","inputs":[],"outputs":[{"name":"","type":"address","internalType":"address"},{"name":""
infra/opstack/optimism/packages/contracts-bedrock/forge-artifacts/GasPayingToken.sol/GasPayingToken.json:1:{"abi":[],"bytecode":{"object":"0x602c6032600b8282823980515f1a607314602657634e487b7160e01b5f525f60045260245ffd5b305f52607381538281f3f
infra/opstack/optimism/packages/contracts-bedrock/forge-artifacts/L2ERC721Bridge.sol/L2ERC721Bridge.json:1:{"abi":[{"type":"constructor","inputs":[],"stateMutability":"nonpayable"},{"type":"function","name":"MESSENGER","inputs":[],"outputs"
infra/opstack/optimism/packages/contracts-bedrock/forge-artifacts/FaultDisputeGame.sol/FaultDisputeGame.json:1:{"abi":[{"type":"constructor","inputs":[{"name":"_params","type":"tuple","internalType":"struct FaultDisputeGame.GameConstructorP
infra/opstack/optimism/packages/contracts-bedrock/forge-artifacts/IEAS.sol/IEAS.json:1:{"abi":[{"type":"function","name":"attest","inputs":[{"name":"request","type":"tuple","internalType":"struct AttestationRequest","components":[{"name":"s
infra/opstack/optimism/packages/contracts-bedrock/forge-artifacts/IEAS.sol/IEAS.0.8.25.json:1:{"abi":[{"type":"function","name":"attest","inputs":[{"name":"request","type":"tuple","internalType":"struct AttestationRequest","components":[{"n
infra/opstack/optimism/packages/contracts-bedrock/forge-artifacts/IEAS.sol/IEAS.0.8.19.json:1:{"abi":[{"type":"function","name":"attest","inputs":[{"name":"request","type":"tuple","internalType":"struct AttestationRequest","components":[{"n
infra/opstack/optimism/packages/contracts-bedrock/forge-artifacts/SuperchainETHBridge.sol/SuperchainETHBridge.json:1:{"abi":[{"type":"function","name":"relayETH","inputs":[{"name":"_from","type":"address","internalType":"address"},{"name":"
infra/opstack/optimism/packages/contracts-bedrock/forge-artifacts/ChainAssertions.sol/ChainAssertions.json:1:{"abi":[],"bytecode":{"object":"0x602d6037600b82828239805160001a607314602a57634e487b7160e01b600052600060045260246000fd5b30600052607
infra/opstack/optimism/packages/contracts-bedrock/forge-artifacts/L1Block.sol/L1Block.json:1:{"abi":[{"type":"function","name":"DEPOSITOR_ACCOUNT","inputs":[],"outputs":[{"name":"addr_","type":"address","internalType":"address"}],"stateMuta
infra/opstack/optimism/packages/contracts-bedrock/forge-artifacts/WETH98.sol/WETH98.json:1:{"abi":[{"type":"fallback","stateMutability":"payable"},{"type":"receive","stateMutability":"payable"},{"type":"function","name":"allowance","inputs"
infra/opstack/optimism/packages/contracts-bedrock/forge-artifacts/draft-IERC20Permit.sol/IERC20Permit.json:1:{"abi":[{"type":"function","name":"DOMAIN_SEPARATOR","inputs":[],"outputs":[{"name":"","type":"bytes32","internalType":"bytes32"}],
infra/opstack/optimism/packages/contracts-bedrock/forge-artifacts/IFaultDisputeGameV2.sol/IFaultDisputeGameV2.json:1:{"abi":[{"type":"function","name":"__constructor__","inputs":[{"name":"_params","type":"tuple","internalType":"struct IFaul
infra/opstack/optimism/packages/contracts-bedrock/forge-artifacts/DelayedWETH.sol/DelayedWETH.json:1:{"abi":[{"type":"constructor","inputs":[{"name":"_delay","type":"uint256","internalType":"uint256"}],"stateMutability":"nonpayable"},{"type
infra/opstack/optimism/packages/contracts-bedrock/forge-artifacts/MerkleTrie.sol/MerkleTrie.0.8.15.json:1:{"abi":[],"bytecode":{"object":"0x602d6037600b82828239805160001a607314602a57634e487b7160e01b600052600060045260246000fd5b30600052607381
infra/opstack/optimism/packages/contracts-bedrock/forge-artifacts/MerkleTrie.sol/MerkleTrie.json:1:{"abi":[],"bytecode":{"object":"0x602c6032600b8282823980515f1a607314602657634e487b7160e01b5f525f60045260245ffd5b305f52607381538281f3fe7300000
infra/opstack/optimism/packages/contracts-bedrock/forge-artifacts/MerkleTrie.sol/MerkleTrie.0.8.15.dispute.json:1:{"abi":[],"bytecode":{"object":"0x602d6037600b82828239805160001a607314602a57634e487b7160e01b600052600060045260246000fd5b306000
infra/opstack/optimism/packages/contracts-bedrock/forge-artifacts/MerkleTrie.sol/MerkleTrie.0.8.25.json:1:{"abi":[],"bytecode":{"object":"0x602c6032600b8282823980515f1a607314602657634e487b7160e01b5f525f60045260245ffd5b305f52607381538281f3fe
infra/opstack/optimism/packages/contracts-bedrock/forge-artifacts/DeployDisputeGame.s.sol/DeployDisputeGameInput.json:1:{"abi":[{"type":"function","name":"absolutePrestate","inputs":[],"outputs":[{"name":"","type":"bytes32","internalType":"
infra/opstack/optimism/packages/contracts-bedrock/forge-artifacts/DeployDisputeGame.s.sol/DeployDisputeGameOutput.json:1:{"abi":[{"type":"function","name":"assertValidDeploy","inputs":[{"name":"_dgi","type":"address","internalType":"contrac
infra/opstack/optimism/packages/contracts-bedrock/forge-artifacts/DeployDisputeGame.s.sol/DeployDisputeGame.json:1:{"abi":[{"type":"function","name":"IS_SCRIPT","inputs":[],"outputs":[{"name":"","type":"bool","internalType":"bool"}],"stateM
infra/opstack/optimism/packages/contracts-bedrock/forge-artifacts/SecureMerkleTrie.sol/SecureMerkleTrie.0.8.15.dispute.json:1:{"abi":[],"bytecode":{"object":"0x602d6037600b82828239805160001a607314602a57634e487b7160e01b6000526000600452602460
infra/opstack/optimism/packages/contracts-bedrock/forge-artifacts/SecureMerkleTrie.sol/SecureMerkleTrie.0.8.15.json:1:{"abi":[],"bytecode":{"object":"0x602d6037600b82828239805160001a607314602a57634e487b7160e01b600052600060045260246000fd5b30
infra/opstack/optimism/packages/contracts-bedrock/forge-artifacts/SecureMerkleTrie.sol/SecureMerkleTrie.0.8.25.json:1:{"abi":[],"bytecode":{"object":"0x602c6032600b8282823980515f1a607314602657634e487b7160e01b5f525f60045260245ffd5b305f526073
infra/opstack/optimism/packages/contracts-bedrock/forge-artifacts/SecureMerkleTrie.sol/SecureMerkleTrie.json:1:{"abi":[],"bytecode":{"object":"0x602c6032600b8282823980515f1a607314602657634e487b7160e01b5f525f60045260245ffd5b305f5260738153828
infra/opstack/optimism/packages/contracts-bedrock/forge-artifacts/ERC721Bridge.sol/ERC721Bridge.json:1:{"abi":[{"type":"function","name":"MESSENGER","inputs":[],"outputs":[{"name":"","type":"address","internalType":"contract ICrossDomainMes
infra/opstack/optimism/packages/contracts-bedrock/forge-artifacts/ISuperPermissionedDisputeGame.sol/ISuperPermissionedDisputeGame.json:1:{"abi":[{"type":"function","name":"__constructor__","inputs":[{"name":"_params","type":"tuple","interna
infra/opstack/optimism/packages/contracts-bedrock/forge-artifacts/L2Genesis.s.sol/L2Genesis.json:1:{"abi":[{"type":"function","name":"IS_SCRIPT","inputs":[],"outputs":[{"name":"","type":"bool","internalType":"bool"}],"stateMutability":"view
infra/opstack/optimism/packages/contracts-bedrock/book/src/contributing/opcm.md:91:To run fork tests, run `just test-upgrade`. You will need to set `ETH_RPC_URL` to an archival mainnet node.
infra/opstack/optimism/packages/contracts-bedrock/test/scripts/FetchChainInfo.t.sol:15:address constant WETH_PERMISSIONED = address(0x500);
infra/opstack/optimism/packages/contracts-bedrock/test/scripts/FetchChainInfo.t.sol:16:address constant WETH_PERMISSIONLESS = address(0x600);
infra/opstack/optimism/packages/contracts-bedrock/test/scripts/FetchChainInfo.t.sol:161:        return WETH_PERMISSIONED;
infra/opstack/optimism/packages/contracts-bedrock/test/scripts/FetchChainInfo.t.sol:167:        return WETH_PERMISSIONLESS;
infra/opstack/optimism/packages/contracts-bedrock/test/scripts/FetchChainInfo.t.sol:485:        assertEq(ctx.output.delayedWethPermissionedGameProxy(), WETH_PERMISSIONED, "PermissionedGame WETH should match");
infra/opstack/optimism/packages/contracts-bedrock/test/scripts/FetchChainInfo.t.sol:487:            ctx.output.delayedWethPermissionlessGameProxy(), WETH_PERMISSIONLESS, "PermissionlessGame WETH should match"
infra/opstack/optimism/packages/contracts-bedrock/test/L1/OPContractsManagerStandardValidator.t.sol:766:    function test_validate_ethLockboxInvalidVersion_succeeds() public {
infra/opstack/optimism/packages/contracts-bedrock/test/L1/OPContractsManagerStandardValidator.t.sol:769:        if (isSysFeatureEnabled(Features.ETH_LOCKBOX)) {
infra/opstack/optimism/packages/contracts-bedrock/test/L1/OPContractsManagerStandardValidator.t.sol:778:    function test_validate_ethLockboxInvalidImplementation_succeeds() public {
infra/opstack/optimism/packages/contracts-bedrock/test/L1/OPContractsManagerStandardValidator.t.sol:785:        if (isSysFeatureEnabled(Features.ETH_LOCKBOX)) {
infra/opstack/optimism/packages/contracts-bedrock/test/L1/OPContractsManagerStandardValidator.t.sol:794:    function test_validate_ethLockboxInvalidProxyAdmin_succeeds() public {
infra/opstack/optimism/packages/contracts-bedrock/test/L1/OPContractsManagerStandardValidator.t.sol:799:        if (isSysFeatureEnabled(Features.ETH_LOCKBOX)) {
infra/opstack/optimism/packages/contracts-bedrock/test/L1/OPContractsManagerStandardValidator.t.sol:808:    function test_validate_ethLockboxInvalidSystemConfig_succeeds() public {
infra/opstack/optimism/packages/contracts-bedrock/test/L1/OPContractsManagerStandardValidator.t.sol:811:        if (isSysFeatureEnabled(Features.ETH_LOCKBOX)) {
infra/opstack/optimism/packages/contracts-bedrock/test/L1/OPContractsManagerStandardValidator.t.sol:820:    function test_validate_ethLockboxPortalUnauthorized_succeeds() public {
infra/opstack/optimism/packages/contracts-bedrock/test/L1/OPContractsManagerStandardValidator.t.sol:825:        if (isSysFeatureEnabled(Features.ETH_LOCKBOX)) {
infra/opstack/optimism/packages/contracts-bedrock/test/L1/OPContractsManagerStandardValidator.t.sol:1072:/// @title OPContractsManagerStandardValidator_DelayedWETH_Test
infra/opstack/optimism/packages/contracts-bedrock/test/L1/OPContractsManagerStandardValidator.t.sol:1074:contract OPContractsManagerStandardValidator_DelayedWETH_Test is OPContractsManagerStandardValidator_TestInit {
infra/opstack/optimism/packages/contracts-bedrock/test/L1/FeesDepositor.t.sol:56:            systemConfig.isFeatureEnabled(Features.ETH_LOCKBOX) ? address(ethLockbox) : address(optimismPortal2);
infra/opstack/optimism/packages/contracts-bedrock/test/L1/OPContractsManager.t.sol:628:    function test_addGameType_reusedDelayedWETH_succeeds() public {
infra/opstack/optimism/packages/contracts-bedrock/test/L1/OptimismPortal2.t.sol:161:            systemConfig.isFeatureEnabled(Features.ETH_LOCKBOX) && address(optimismPortal2.ethLockbox()) != address(0);
infra/opstack/optimism/packages/contracts-bedrock/test/L1/OptimismPortal2.t.sol:167:        if (!isSysFeatureEnabled(Features.ETH_LOCKBOX)) {
infra/opstack/optimism/packages/contracts-bedrock/test/L1/OptimismPortal2.t.sol:169:            systemConfig.setFeature(Features.ETH_LOCKBOX, true);
infra/opstack/optimism/packages/contracts-bedrock/test/L1/OptimismPortal2.t.sol:310:        // Enable ETH_LOCKBOX feature but clear the lockbox address to create invalid state.
infra/opstack/optimism/packages/contracts-bedrock/test/L1/OptimismPortal2.t.sol:311:        if (!systemConfig.isFeatureEnabled(Features.ETH_LOCKBOX)) {
infra/opstack/optimism/packages/contracts-bedrock/test/L1/OptimismPortal2.t.sol:313:            systemConfig.setFeature(Features.ETH_LOCKBOX, true);
infra/opstack/optimism/packages/contracts-bedrock/test/L1/OptimismPortal2.t.sol:699:/// @title OptimismPortal2_DonateETH_Test
infra/opstack/optimism/packages/contracts-bedrock/test/L1/OptimismPortal2.t.sol:701:contract OptimismPortal2_DonateETH_Test is OptimismPortal2_TestInit {
infra/opstack/optimism/packages/contracts-bedrock/test/L1/OptimismPortal2.t.sol:703:    function test_donateETH_succeeds(uint256 _amount) external {
infra/opstack/optimism/packages/contracts-bedrock/test/L1/OptimismPortal2.t.sol:1675:        if (isSysFeatureEnabled(Features.ETH_LOCKBOX)) {
infra/opstack/optimism/packages/contracts-bedrock/test/L1/OptimismPortal2.t.sol:1705:        if (isSysFeatureEnabled(Features.ETH_LOCKBOX)) {
infra/opstack/optimism/packages/contracts-bedrock/test/L1/OptimismPortal2.t.sol:2510:        if (isSysFeatureEnabled(Features.ETH_LOCKBOX)) {
infra/opstack/optimism/packages/contracts-bedrock/test/L1/OptimismPortal2.t.sol:2525:        if (isSysFeatureEnabled(Features.ETH_LOCKBOX)) {
infra/opstack/optimism/packages/contracts-bedrock/test/L1/OptimismPortal2.t.sol:2588:        if (isSysFeatureEnabled(Features.ETH_LOCKBOX)) {
infra/opstack/optimism/packages/contracts-bedrock/test/L1/OptimismPortal2.t.sol:2633:        if (isSysFeatureEnabled(Features.ETH_LOCKBOX)) {
infra/opstack/optimism/packages/contracts-bedrock/test/L1/OptimismPortal2.t.sol:2648:        if (isSysFeatureEnabled(Features.ETH_LOCKBOX)) {
infra/opstack/optimism/packages/contracts-bedrock/test/L1/SystemConfig.t.sol:615:    ///         the ETH_LOCKBOX feature is disabled.
infra/opstack/optimism/packages/contracts-bedrock/test/L1/SystemConfig.t.sol:617:        skipIfSysFeatureEnabled(Features.ETH_LOCKBOX);
infra/opstack/optimism/packages/contracts-bedrock/test/L1/SystemConfig.t.sol:631:    ///         ETH_LOCKBOX feature is enabled.
infra/opstack/optimism/packages/contracts-bedrock/test/L1/SystemConfig.t.sol:632:    function test_paused_ethLockboxIdentifier_succeeds() external {
infra/opstack/optimism/packages/contracts-bedrock/test/L1/SystemConfig.t.sol:633:        skipIfSysFeatureDisabled(Features.ETH_LOCKBOX);
infra/opstack/optimism/packages/contracts-bedrock/test/L1/SystemConfig.t.sol:776:    /// @notice Tests that disabling ETH_LOCKBOX reverts if the OptimismPortal has a non-zero
infra/opstack/optimism/packages/contracts-bedrock/test/L1/SystemConfig.t.sol:778:    function test_setFeature_ethLockboxDisableWhileConfigured_reverts() external {
infra/opstack/optimism/packages/contracts-bedrock/test/L1/SystemConfig.t.sol:781:        // Ensure ETH_LOCKBOX is enabled first (no pause active in fresh setup).
infra/opstack/optimism/packages/contracts-bedrock/test/L1/SystemConfig.t.sol:782:        if (!systemConfig.isFeatureEnabled(Features.ETH_LOCKBOX)) {
infra/opstack/optimism/packages/contracts-bedrock/test/L1/SystemConfig.t.sol:784:            systemConfig.setFeature(Features.ETH_LOCKBOX, true);
infra/opstack/optimism/packages/contracts-bedrock/test/L1/SystemConfig.t.sol:785:            assertTrue(systemConfig.isFeatureEnabled(Features.ETH_LOCKBOX));
infra/opstack/optimism/packages/contracts-bedrock/test/L1/SystemConfig.t.sol:795:        systemConfig.setFeature(Features.ETH_LOCKBOX, false);
infra/opstack/optimism/packages/contracts-bedrock/test/L1/SystemConfig.t.sol:798:    /// @notice Tests that enabling ETH_LOCKBOX while the system is paused (global) reverts.
infra/opstack/optimism/packages/contracts-bedrock/test/L1/SystemConfig.t.sol:799:    function test_setFeature_ethLockboxEnableWhilePaused_reverts() external {
infra/opstack/optimism/packages/contracts-bedrock/test/L1/SystemConfig.t.sol:802:        // Ensure ETH_LOCKBOX is enabled first (no pause active in fresh setup).
infra/opstack/optimism/packages/contracts-bedrock/test/L1/SystemConfig.t.sol:803:        if (!systemConfig.isFeatureEnabled(Features.ETH_LOCKBOX)) {
infra/opstack/optimism/packages/contracts-bedrock/test/L1/SystemConfig.t.sol:805:            systemConfig.setFeature(Features.ETH_LOCKBOX, true);
infra/opstack/optimism/packages/contracts-bedrock/test/L1/SystemConfig.t.sol:806:            assertTrue(systemConfig.isFeatureEnabled(Features.ETH_LOCKBOX));
infra/opstack/optimism/packages/contracts-bedrock/test/L1/SystemConfig.t.sol:816:        systemConfig.setFeature(Features.ETH_LOCKBOX, true);
infra/opstack/optimism/packages/contracts-bedrock/test/L1/SystemConfig.t.sol:819:    /// @notice Tests that disabling ETH_LOCKBOX while the system is paused (global) reverts.
infra/opstack/optimism/packages/contracts-bedrock/test/L1/SystemConfig.t.sol:820:    function test_setFeature_ethLockboxDisableWhilePaused_reverts() external {
infra/opstack/optimism/packages/contracts-bedrock/test/L1/SystemConfig.t.sol:823:        // Ensure ETH_LOCKBOX is enabled first.
infra/opstack/optimism/packages/contracts-bedrock/test/L1/SystemConfig.t.sol:824:        if (!systemConfig.isFeatureEnabled(Features.ETH_LOCKBOX)) {
infra/opstack/optimism/packages/contracts-bedrock/test/L1/SystemConfig.t.sol:826:            systemConfig.setFeature(Features.ETH_LOCKBOX, true);
infra/opstack/optimism/packages/contracts-bedrock/test/L1/SystemConfig.t.sol:827:            assertTrue(systemConfig.isFeatureEnabled(Features.ETH_LOCKBOX));
infra/opstack/optimism/packages/contracts-bedrock/test/L1/SystemConfig.t.sol:837:        systemConfig.setFeature(Features.ETH_LOCKBOX, false);
infra/opstack/optimism/packages/contracts-bedrock/test/L1/ETHLockbox.t.sol:42:        skipIfSysFeatureDisabled(Features.ETH_LOCKBOX);
infra/opstack/optimism/packages/contracts-bedrock/test/L1/ETHLockbox.t.sol:276:/// @title ETHLockbox_LockETH_Test
infra/opstack/optimism/packages/contracts-bedrock/test/L1/ETHLockbox.t.sol:278:contract ETHLockbox_LockETH_Test is ETHLockbox_TestInit {
infra/opstack/optimism/packages/contracts-bedrock/test/L1/ETHLockbox.t.sol:280:    function testFuzz_lockETH_unauthorizedPortal_reverts(address _caller) public {
infra/opstack/optimism/packages/contracts-bedrock/test/L1/ETHLockbox.t.sol:292:    function testFuzz_lockETH_succeeds(uint256 _amount) public {
infra/opstack/optimism/packages/contracts-bedrock/test/L1/ETHLockbox.t.sol:320:    function testFuzz_lockETH_multiplePortals_succeeds(IOptimismPortal2 _portal, uint256 _amount) public {
infra/opstack/optimism/packages/contracts-bedrock/test/L1/ETHLockbox.t.sol:364:/// @title ETHLockbox_UnlockETH_Test
infra/opstack/optimism/packages/contracts-bedrock/test/L1/ETHLockbox.t.sol:366:contract ETHLockbox_UnlockETH_Test is ETHLockbox_TestInit {
infra/opstack/optimism/packages/contracts-bedrock/test/L1/ETHLockbox.t.sol:368:    function testFuzz_unlockETH_paused_reverts(address _caller, uint256 _value) public {
infra/opstack/optimism/packages/contracts-bedrock/test/L1/ETHLockbox.t.sol:383:    function testFuzz_unlockETH_unauthorizedPortal_reverts(address _caller, uint256 _value) public {
infra/opstack/optimism/packages/contracts-bedrock/test/L1/ETHLockbox.t.sol:396:    function testFuzz_unlockETH_insufficientBalance_reverts(uint256 _value) public {
infra/opstack/optimism/packages/contracts-bedrock/test/L1/ETHLockbox.t.sol:409:    function testFuzz_unlockETH_withdrawalTransaction_reverts(uint256 _value, address _l2Sender) public {
infra/opstack/optimism/packages/contracts-bedrock/test/L1/ETHLockbox.t.sol:425:    function testFuzz_unlockETH_succeeds(uint256 _value) public {
infra/opstack/optimism/packages/contracts-bedrock/test/L1/ETHLockbox.t.sol:452:    function testFuzz_unlockETH_multiplePortals_succeeds(IOptimismPortal2 _portal, uint256 _value) public {
infra/opstack/optimism/packages/contracts-bedrock/test/L1/L1StandardBridge.t.sol:268:    function test_paused_finalizeBridgeETH_reverts() external {
infra/opstack/optimism/packages/contracts-bedrock/test/L1/L1StandardBridge.t.sol:361:        if (isSysFeatureEnabled(Features.ETH_LOCKBOX)) {
infra/opstack/optimism/packages/contracts-bedrock/test/L1/L1StandardBridge.t.sol:379:/// @title L1StandardBridge_DepositETH_Test
infra/opstack/optimism/packages/contracts-bedrock/test/L1/L1StandardBridge.t.sol:381:contract L1StandardBridge_DepositETH_Test is L1StandardBridge_TestInit {
infra/opstack/optimism/packages/contracts-bedrock/test/L1/L1StandardBridge.t.sol:387:    function test_depositETH_fromEOA_succeeds() external {
infra/opstack/optimism/packages/contracts-bedrock/test/L1/L1StandardBridge.t.sol:393:        if (isSysFeatureEnabled(Features.ETH_LOCKBOX)) {
infra/opstack/optimism/packages/contracts-bedrock/test/L1/L1StandardBridge.t.sol:402:    function test_depositETH_fromEOA7702_succeeds() external {
infra/opstack/optimism/packages/contracts-bedrock/test/L1/L1StandardBridge.t.sol:411:        if (isSysFeatureEnabled(Features.ETH_LOCKBOX)) {
infra/opstack/optimism/packages/contracts-bedrock/test/L1/L1StandardBridge.t.sol:420:    function test_depositETH_notEoa_reverts() external {
infra/opstack/optimism/packages/contracts-bedrock/test/L1/L1StandardBridge.t.sol:442:        if (isSysFeatureEnabled(Features.ETH_LOCKBOX)) {
infra/opstack/optimism/packages/contracts-bedrock/test/L1/L1StandardBridge.t.sol:465:        if (isSysFeatureEnabled(Features.ETH_LOCKBOX)) {
infra/opstack/optimism/packages/contracts-bedrock/test/L1/L1StandardBridge.t.sol:781:    function test_bridgeETH_succeeds() external {
infra/opstack/optimism/packages/contracts-bedrock/test/L1/L1StandardBridge.t.sol:787:        if (isSysFeatureEnabled(Features.ETH_LOCKBOX)) {
infra/opstack/optimism/packages/contracts-bedrock/test/L1/L1StandardBridge.t.sol:806:        if (isSysFeatureEnabled(Features.ETH_LOCKBOX)) {
infra/opstack/optimism/packages/contracts-bedrock/test/L1/L1StandardBridge.t.sol:815:    function test_finalizeBridgeETH_succeeds() external {
infra/opstack/optimism/packages/contracts-bedrock/test/L1/L1StandardBridge.t.sol:832:    function test_finalizeBridgeETH_incorrectValue_reverts() external {
infra/opstack/optimism/packages/contracts-bedrock/test/L1/L1StandardBridge.t.sol:846:    function test_finalizeBridgeETH_sendToSelf_reverts() external {
infra/opstack/optimism/packages/contracts-bedrock/test/L1/L1StandardBridge.t.sol:860:    function test_finalizeBridgeETH_sendToMessenger_reverts() external {
infra/opstack/optimism/packages/contracts-bedrock/test/kontrol/proofs/L1StandardBridge.k.sol:46:    function prove_finalizeBridgeETH_paused(
infra/opstack/optimism/packages/contracts-bedrock/test/kontrol/README.md:24:[Kontrol](https://github.com/runtimeverification/kontrol) is a tool by [Runtime Verification](https://runtimeverification.com/) (RV) that enables formal verificatio
infra/opstack/optimism/packages/contracts-bedrock/test/kontrol/README.md:28:> KEVM is a tool that enables formal verification of smart contracts on the Ethereum blockchain. It provides a mathematical foundation for specifying and implementi
infra/opstack/optimism/packages/contracts-bedrock/test/kontrol/scripts/run-kontrol.sh:141:    "L1StandardBridgeKontrol.prove_finalizeBridgeETH_paused" \
infra/opstack/optimism/packages/contracts-bedrock/test/slither/slither.db.json:1:[{"elements": [{"type": "function", "name": "finalizeWithdrawalTransaction", "source_mapping": {"start": 14716, "length": 2329, "filename_relative": "src/L1/Op
infra/opstack/optimism/packages/contracts-bedrock/test/periphery/AssetReceiver.t.sol:76:/// @title AssetReceiver_WithdrawETH_Test
infra/opstack/optimism/packages/contracts-bedrock/test/periphery/AssetReceiver.t.sol:78:contract AssetReceiver_WithdrawETH_Test is AssetReceiver_TestInit {
infra/opstack/optimism/packages/contracts-bedrock/test/periphery/AssetReceiver.t.sol:80:    function test_withdrawETH_succeeds() external {
infra/opstack/optimism/packages/contracts-bedrock/test/periphery/AssetReceiver.t.sol:102:    function test_withdrawETH_unauthorized_reverts() external {
infra/opstack/optimism/packages/contracts-bedrock/test/periphery/AssetReceiver.t.sol:109:    function test_withdrawETH_withAmount_succeeds() external {
infra/opstack/optimism/packages/contracts-bedrock/test/periphery/AssetReceiver.t.sol:130:    function test_withdrawETH_withAmountUnauthorized_reverts() external {
infra/opstack/optimism/packages/contracts-bedrock/test/setup/Events.sol:112:    event ETHMigrated(address indexed lockbox, uint256 ethBalance);
infra/opstack/optimism/packages/contracts-bedrock/test/setup/Setup.sol:147:    ISuperchainETHBridge superchainETHBridge = ISuperchainETHBridge(payable(Predeploys.SUPERCHAIN_ETH_BRIDGE));
infra/opstack/optimism/packages/contracts-bedrock/test/setup/Setup.sol:148:    IETHLiquidity ethLiquidity = IETHLiquidity(Predeploys.ETH_LIQUIDITY);
infra/opstack/optimism/packages/contracts-bedrock/test/setup/Setup.sol:182:                "Setup: ETH_RPC_URL must be set to a production (Sepolia or Mainnet) RPC URL"
infra/opstack/optimism/packages/contracts-bedrock/test/setup/Setup.sol:375:        labelPredeploy(Predeploys.SUPERCHAIN_ETH_BRIDGE);
infra/opstack/optimism/packages/contracts-bedrock/test/setup/Setup.sol:376:        labelPredeploy(Predeploys.ETH_LIQUIDITY);
infra/opstack/optimism/packages/contracts-bedrock/test/libraries/GasPayingToken.t.sol:29:    /// @notice Test that the gas paying token returns values associated with Ether when unset.
infra/opstack/optimism/packages/contracts-bedrock/test/libraries/GasPayingToken.t.sol:35:        assertEq("Ether", GasPayingToken.getName());
infra/opstack/optimism/packages/contracts-bedrock/test/L2/WETH.t.sol:7:/// @title WETH_Name_Test
infra/opstack/optimism/packages/contracts-bedrock/test/L2/WETH.t.sol:9:contract WETH_Name_Test is CommonTest {
infra/opstack/optimism/packages/contracts-bedrock/test/L2/WETH.t.sol:17:    /// @notice Tests that the `name` function returns 'Wrapped Ether' by default.
infra/opstack/optimism/packages/contracts-bedrock/test/L2/WETH.t.sol:18:    function test_name_ether_succeeds() external view {
infra/opstack/optimism/packages/contracts-bedrock/test/L2/WETH.t.sol:19:        assertEq("Wrapped Ether", weth.name());
infra/opstack/optimism/packages/contracts-bedrock/test/L2/WETH.t.sol:23:/// @title WETH_Symbol_Test
infra/opstack/optimism/packages/contracts-bedrock/test/L2/WETH.t.sol:25:contract WETH_Symbol_Test is CommonTest {
infra/opstack/optimism/packages/contracts-bedrock/test/L2/WETH.t.sol:36:    function test_symbol_ether_succeeds() external view {
infra/opstack/optimism/packages/contracts-bedrock/test/L2/L2StandardBridge.t.sol:325:    function test_withdraw_ether_succeeds() external {
infra/opstack/optimism/packages/contracts-bedrock/test/L2/L2StandardBridge.t.sol:441:    function test_finalizeBridgeETH_sendToSelf_reverts() external {
infra/opstack/optimism/packages/contracts-bedrock/test/L2/L2StandardBridge.t.sol:454:    function test_finalizeBridgeETH_sendToMessenger_reverts() external {
infra/opstack/optimism/packages/contracts-bedrock/test/L2/L2StandardBridge.t.sol:467:    function testFuzz_bridgeETH_succeeds(uint256 _value, uint32 _minGasLimit, bytes calldata _extraData) external {
infra/opstack/optimism/packages/contracts-bedrock/test/L2/L2StandardBridge.t.sol:537:    function test_finalizeBridgeETH_succeeds() external {
infra/opstack/optimism/packages/contracts-bedrock/test/L2/L1Block.t.sol:53:        assertEq("Ether", l1Block.gasPayingTokenName());
infra/opstack/optimism/packages/contracts-bedrock/test/L2/SuperchainETHBridge.t.sol:44:/// @title SuperchainETHBridge_SendETH_Test
infra/opstack/optimism/packages/contracts-bedrock/test/L2/SuperchainETHBridge.t.sol:46:contract SuperchainETHBridge_SendETH_Test is SuperchainETHBridge_TestInit {
infra/opstack/optimism/packages/contracts-bedrock/test/L2/SuperchainETHBridge.t.sol:48:    function testFuzz_sendETH_zeroAddressTo_reverts(address _sender, uint256 _amount, uint256 _chainId) public {
infra/opstack/optimism/packages/contracts-bedrock/test/L2/SuperchainETHBridge.t.sol:60:    function testFuzz_sendETH_succeeds(
infra/opstack/optimism/packages/contracts-bedrock/test/L2/SuperchainETHBridge.t.sol:86:        vm.expectCall(Predeploys.ETH_LIQUIDITY, abi.encodeCall(IETHLiquidity.burn, ()), 1);
infra/opstack/optimism/packages/contracts-bedrock/test/L2/SuperchainETHBridge.t.sol:108:/// @title SuperchainETHBridge_RelayETH_Test
infra/opstack/optimism/packages/contracts-bedrock/test/L2/SuperchainETHBridge.t.sol:110:contract SuperchainETHBridge_RelayETH_Test is SuperchainETHBridge_TestInit {
infra/opstack/optimism/packages/contracts-bedrock/test/L2/SuperchainETHBridge.t.sol:113:    function testFuzz_relayETH_notMessenger_reverts(address _caller, address _to, uint256 _amount) public {
infra/opstack/optimism/packages/contracts-bedrock/test/L2/SuperchainETHBridge.t.sol:127:    function testFuzz_relayETH_notCrossDomainSender_reverts(
infra/opstack/optimism/packages/contracts-bedrock/test/L2/SuperchainETHBridge.t.sol:154:    function testFuzz_relayETH_succeeds(address _from, address _to, uint256 _amount, uint256 _source) public {
infra/opstack/optimism/packages/contracts-bedrock/test/L2/SuperchainETHBridge.t.sol:162:        vm.deal(Predeploys.ETH_LIQUIDITY, _amount);
infra/opstack/optimism/packages/contracts-bedrock/test/L2/SuperchainETHBridge.t.sol:176:        vm.expectCall(Predeploys.ETH_LIQUIDITY, abi.encodeCall(IETHLiquidity.mint, (_amount)), 1);
infra/opstack/optimism/packages/contracts-bedrock/test/universal/WETH98.t.sol:183:        assertEq(weth.name(), "Wrapped Ether");
infra/opstack/optimism/packages/contracts-bedrock/test/dispute/FaultDisputeGame.t.sol:648:    function test_initialize_receivesETH_succeeds() public {
infra/opstack/optimism/packages/contracts-bedrock/test/dispute/SuperFaultDisputeGame.t.sol:504:    function test_initialize_receivesETH_succeeds() public {
infra/opstack/optimism/packages/contracts-bedrock/test/dispute/DelayedWETH.t.sol:18:/// @title DelayedWETH_FallbackGasUser_Harness
infra/opstack/optimism/packages/contracts-bedrock/test/dispute/DelayedWETH.t.sol:20:contract DelayedWETH_FallbackGasUser_Harness {
infra/opstack/optimism/packages/contracts-bedrock/test/dispute/DelayedWETH.t.sol:40:/// @title DelayedWETH_FallbackReverter_Harness
infra/opstack/optimism/packages/contracts-bedrock/test/dispute/DelayedWETH.t.sol:42:contract DelayedWETH_FallbackReverter_Harness {
infra/opstack/optimism/packages/contracts-bedrock/test/dispute/DelayedWETH.t.sol:54:/// @title DelayedWETH_TestInit
infra/opstack/optimism/packages/contracts-bedrock/test/dispute/DelayedWETH.t.sol:56:contract DelayedWETH_TestInit is CommonTest {
infra/opstack/optimism/packages/contracts-bedrock/test/dispute/DelayedWETH.t.sol:68:/// @title DelayedWETH_Initialize_Test
infra/opstack/optimism/packages/contracts-bedrock/test/dispute/DelayedWETH.t.sol:70:contract DelayedWETH_Initialize_Test is DelayedWETH_TestInit {
infra/opstack/optimism/packages/contracts-bedrock/test/dispute/DelayedWETH.t.sol:115:/// @title DelayedWETH_Unlock_Test
infra/opstack/optimism/packages/contracts-bedrock/test/dispute/DelayedWETH.t.sol:117:contract DelayedWETH_Unlock_Test is DelayedWETH_TestInit {
infra/opstack/optimism/packages/contracts-bedrock/test/dispute/DelayedWETH.t.sol:146:/// @title DelayedWETH_Withdraw_Test
infra/opstack/optimism/packages/contracts-bedrock/test/dispute/DelayedWETH.t.sol:148:contract DelayedWETH_Withdraw_Test is DelayedWETH_TestInit {
infra/opstack/optimism/packages/contracts-bedrock/test/dispute/DelayedWETH.t.sol:354:/// @title DelayedWETH_Recover_Test
infra/opstack/optimism/packages/contracts-bedrock/test/dispute/DelayedWETH.t.sol:356:contract DelayedWETH_Recover_Test is DelayedWETH_TestInit {
infra/opstack/optimism/packages/contracts-bedrock/test/dispute/DelayedWETH.t.sol:368:        DelayedWETH_FallbackGasUser_Harness gasUser = new DelayedWETH_FallbackGasUser_Harness(_fallbackGasUsage);
infra/opstack/optimism/packages/contracts-bedrock/test/dispute/DelayedWETH.t.sol:421:        DelayedWETH_FallbackReverter_Harness reverter = new DelayedWETH_FallbackReverter_Harness();
infra/opstack/optimism/packages/contracts-bedrock/test/dispute/DelayedWETH.t.sol:436:/// @title DelayedWETH_Hold_Test
infra/opstack/optimism/packages/contracts-bedrock/test/dispute/DelayedWETH.t.sol:438:contract DelayedWETH_Hold_Test is DelayedWETH_TestInit {
infra/opstack/optimism/packages/contracts-bedrock/test/invariants/Burn.Eth.t.sol:65:    function invariant_burn_eth() external view {
infra/opstack/optimism/packages/contracts-bedrock/test/invariants/ETHLiquidity.t.sol:34:        vm.deal(Predeploys.SUPERCHAIN_ETH_BRIDGE, _balance);
infra/opstack/optimism/packages/contracts-bedrock/test/invariants/ETHLiquidity.t.sol:40:        vm.prank(Predeploys.SUPERCHAIN_ETH_BRIDGE);
infra/opstack/optimism/packages/contracts-bedrock/test/invariants/ETHLiquidity.t.sol:47:        vm.prank(Predeploys.SUPERCHAIN_ETH_BRIDGE);
infra/opstack/optimism/packages/contracts-bedrock/test/safe/SafeSigners.t.sol:74:                (v, r, s) = vm.sign(pks[i], keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", digest)));
infra/opstack/optimism/op-devstack/README.md:160:- `OP_RETH_EXEC_PATH=/home/USERHERE/projects/reth/target/release/op-reth` to select the op-reth executable to run
infra/opstack/optimism/op-devstack/README.md:164:- `SYSGO_GETH_EXEC_PATH=/path/to/geth` to select the geth executable to run
infra/opstack/optimism/op-service/README.md:23:├── eth             - Common Ethereum data types and OP-Stack extension types
infra/opstack/optimism/op-service/README.md:50:├── testutils       - Simplified Ethereum types, mock RPC bindings, utils for testing.
infra/opstack/optimism/op-service/sources/testdata/gen.sh:6:export ETH_RPC_URL=https://ethereum-goerli-rpc.allthatnode.com
infra/opstack/optimism/op-challenger/README.md:86:  --l1-eth-rpc <L1_ETH_RPC> \
infra/opstack/optimism/op-challenger/README.md:96:* `L1_ETH_RPC` - the RPC endpoint of the L1 endpoint to use (e.g. `http://localhost:8545`).
infra/opstack/optimism/op-challenger/README.md:115:  --l1-eth-rpc <L1_ETH_RPC> \
infra/opstack/optimism/op-challenger/README.md:125:* `L1_ETH_RPC` - the RPC endpoint of the L1 endpoint to use (e.g. `http://localhost:8545`).
infra/opstack/optimism/op-challenger/README.md:141:  --l1-eth-rpc <L1_ETH_RPC> \
infra/opstack/optimism/op-challenger/README.md:150:* `L1_ETH_RPC` - the RPC endpoint of the L1 endpoint to use (e.g. `http://localhost:8545`).
infra/opstack/optimism/op-challenger/README.md:159:  --l1-eth-rpc <L1_ETH_RPC> \
infra/opstack/optimism/op-challenger/README.md:168:* `L1_ETH_RPC` - the RPC endpoint of the L1 endpoint to use (e.g. `http://localhost:8545`).
infra/opstack/optimism/op-challenger/README.md:176:  --l1-eth-rpc <L1_ETH_RPC> \
infra/opstack/optimism/op-challenger/README.md:182:* `L1_ETH_RPC` - the RPC endpoint of the L1 endpoint to use (e.g. `http://localhost:8545`).
infra/opstack/optimism/op-challenger/README.md:192:  --l1-eth-rpc <L1_ETH_RPC> \
infra/opstack/optimism/op-challenger/README.md:198:* `L1_ETH_RPC` - the RPC endpoint of the L1 endpoint to use (e.g. `http://localhost:8545`).
infra/opstack/optimism/op-challenger/README.md:206:  --l1-eth-rpc=<L1_ETH_RPC> \
infra/opstack/optimism/op-challenger/README.md:208:  --l2-eth-rpc=<L2_ETH_RPC> \
infra/opstack/optimism/op-challenger/README.md:216:* `L1_ETH_RPC` - the RPC endpoint of the L1 endpoint to use (e.g. `http://localhost:8545`).
infra/opstack/optimism/op-challenger/README.md:218:* `L2_ETH_RPC` - the RPC endpoint of the L2 execution client to use
infra/opstack/optimism/op-fetcher/pkg/fetcher/fetch/forge-artifacts/FetchChainInfo.s.sol/IFetcher.json:1:{"abi":[{"type":"function","name":"GUARDIAN","inputs":[],"outputs":[{"name":"","type":"address","internalType":"address"}],"stateMutabi
infra/opstack/optimism/op-fetcher/pkg/fetcher/fetch/forge-artifacts/FetchChainInfo.s.sol/FetchChainInfo.json:1:{"abi":[{"type":"function","name":"IS_SCRIPT","inputs":[],"outputs":[{"name":"","type":"bool","internalType":"bool"}],"stateMutab
infra/opstack/optimism/op-fetcher/pkg/fetcher/fetch/forge-artifacts/FetchChainInfo.s.sol/FetchChainInfoOutput.json:1:{"abi":[{"type":"function","name":"addressManagerImpl","inputs":[],"outputs":[{"name":"","type":"address","internalType":"a
infra/opstack/optimism/op-fetcher/pkg/fetcher/fetch/forge-artifacts/FetchChainInfo.s.sol/FetchChainInfoInput.json:1:{"abi":[{"type":"function","name":"l1StandardBridgeProxy","inputs":[],"outputs":[{"name":"","type":"address","internalType":
infra/opstack/optimism/.circleci/config.yml:1147:            ETH_RPC_URL: https://ci-mainnet-l1-archive.optimism.io
infra/opstack/optimism/.circleci/config.yml:1155:            ETH_RPC_URL: https://ci-mainnet-l1-archive.optimism.io
infra/opstack/optimism/.circleci/config.yml:1229:            ETH_RPC_URL: <<parameters.fork_base_rpc>>
infra/opstack/optimism/.circleci/config.yml:1242:            ETH_RPC_URL: <<parameters.fork_base_rpc>>
infra/opstack/optimism/op-chain-ops/foundry/testdata/forge-artifacts/ERC20.sol/ERC20.json:1:{"abi":[{"type":"constructor","inputs":[{"name":"name_","type":"string","internalType":"string"},{"name":"symbol_","type":"string","internalType":"s
infra/opstack/op-geth/appveyor.yml:10:    - GETH_ARCH: amd64
infra/opstack/op-geth/appveyor.yml:11:      GETH_MINGW: 'C:\msys64\mingw64'
infra/opstack/op-geth/appveyor.yml:12:    - GETH_ARCH: 386
infra/opstack/op-geth/appveyor.yml:13:      GETH_MINGW: 'C:\msys64\mingw32'
infra/opstack/op-geth/appveyor.yml:37:          GETH_ARCH: 386
infra/opstack/op-geth/appveyor.yml:47:      GETH_CC: '%GETH_MINGW%\bin\gcc.exe'
infra/opstack/op-geth/appveyor.yml:48:      PATH: '%GETH_MINGW%\bin;C:\Program Files (x86)\NSIS\;%PATH%'
infra/opstack/op-geth/appveyor.yml:50:      - 'echo %GETH_ARCH%'
infra/opstack/op-geth/appveyor.yml:51:      - 'echo %GETH_CC%'
infra/opstack/op-geth/appveyor.yml:52:      - '%GETH_CC% --version'
infra/opstack/op-geth/appveyor.yml:53:      - go run build/ci.go install -dlgo -arch %GETH_ARCH% -cc %GETH_CC%
infra/opstack/op-geth/appveyor.yml:56:      - go run build/ci.go archive -arch %GETH_ARCH% -type zip -signer WINDOWS_SIGNING_KEY -upload gethstore/builds
infra/opstack/op-geth/appveyor.yml:57:      - go run build/ci.go nsis -arch %GETH_ARCH% -signer WINDOWS_SIGNING_KEY -upload gethstore/builds
infra/opstack/op-geth/appveyor.yml:59:      - go run build/ci.go test -dlgo -arch %GETH_ARCH% -cc %GETH_CC% -short
infra/opstack/op-geth/README.md:1:## Go Ethereum
infra/opstack/op-geth/README.md:3:Golang execution layer implementation of the Ethereum protocol.
infra/opstack/op-geth/README.md:11:[![Twitter](https://img.shields.io/twitter/follow/go_ethereum)](https://x.com/go_ethereum)
infra/opstack/op-geth/README.md:40:| **`geth`** | Our main Ethereum CLI client. It is the entry point into the Ethereum network (main-, test- or private net), capable of running as a full node (default), archive node (retaining all historic
infra/opstack/op-geth/README.md:43:|  `abigen`  | Source code generator to convert Ethereum contract definitions into easy-to-use, compile-time type-safe Go packages. It operates on plain [Ethereum contract ABIs](https://docs.soliditylang.o
infra/opstack/op-geth/README.md:44:|   `evm`    | Developer utility version of the EVM (Ethereum Virtual Machine) that is capable of running bytecode snippets within a configurable environment and execution mode. Its purpose is to allow iso
infra/opstack/op-geth/README.md:45:| `rlpdump`  | Developer utility tool to convert binary RLP ([Recursive Length Prefix](https://ethereum.org/en/developers/docs/data-structures-and-encoding/rlp)) dumps (data encoding used by the Ethereum p
infra/opstack/op-geth/README.md:70:### Full node on the main Ethereum network
infra/opstack/op-geth/README.md:72:By far the most common scenario is people wanting to simply interact with the Ethereum
infra/opstack/op-geth/README.md:84:   of the Ethereum network, which is very CPU intensive.
infra/opstack/op-geth/README.md:94:Transitioning towards developers, if you'd like to play around with creating Ethereum
infra/opstack/op-geth/README.md:98:the main network, but with play-Ether only.
infra/opstack/op-geth/README.md:109: * Instead of connecting to the main Ethereum network, the client will connect to the Holesky 
infra/opstack/op-geth/README.md:144:One of the quickest ways to get Ethereum up and running on your machine is by using
infra/opstack/op-geth/README.md:165:Ethereum network via your own programs and not manually through the console. To aid
infra/opstack/op-geth/README.md:198:Ethereum nodes with exposed APIs! Further, all browser tabs can access locally
infra/opstack/op-geth/docs/postmortems/2021-08-22-split-postmortem.md:3:This is a post-mortem concerning the minority split that occurred on Ethereum mainnet on block [13107518](https://ghostcan.io/block/13107518), at which a minority chai
infra/opstack/op-geth/docs/postmortems/2021-08-22-split-postmortem.md:92:> The primary goal for the Geth team is the health of the Ethereum network as a whole, and the decision whether or not to publish details about a serious vulnerability
infra/opstack/op-geth/docs/postmortems/2021-08-22-split-postmortem.md:131:- [1] https://twitter.com/go_ethereum/status/1428051458763763721
infra/opstack/op-geth/docs/postmortems/2021-08-22-split-postmortem.md:150:https://twitter.com/go_ethereum/status/1428051458763763721
infra/opstack/op-geth/graphql/internal/graphiql/graphiql.min.js:2:!function(){var e,t,n={8042:function(e,t){var n,r;"undefined"!=typeof globalThis?globalThis:"undefined"!=typeof self&&self,n=function(){"use strict";function e(){const e={};r
infra/opstack/op-geth/internal/jsre/deps/web3.js:929:    BigNumber.config(c.ETH_BIGNUMBER_ROUNDING_MODE);
infra/opstack/op-geth/internal/jsre/deps/web3.js:1761:/// required to define ETH_BIGNUMBER_ROUNDING_MODE
infra/opstack/op-geth/internal/jsre/deps/web3.js:1764:var ETH_UNITS = [
infra/opstack/op-geth/internal/jsre/deps/web3.js:1795:    ETH_PADDING: 32,
infra/opstack/op-geth/internal/jsre/deps/web3.js:1796:    ETH_SIGNATURE_LENGTH: 4,
infra/opstack/op-geth/internal/jsre/deps/web3.js:1797:    ETH_UNITS: ETH_UNITS,
infra/opstack/op-geth/internal/jsre/deps/web3.js:1798:    ETH_BIGNUMBER_ROUNDING_MODE: { ROUNDING_MODE: BigNumber.ROUND_DOWN },
infra/opstack/op-geth/internal/jsre/deps/web3.js:1799:    ETH_POLLING_TIMEOUT: 1000/2,
infra/opstack/op-geth/internal/jsre/deps/web3.js:2412: * Returns true if given string is a valid Ethereum block header bloom.
infra/opstack/op-geth/internal/jsre/deps/web3.js:2843:        return new SolidityFunction(contract._eth, json, contract.address);
infra/opstack/op-geth/internal/jsre/deps/web3.js:2861:    var All = new AllEvents(contract._eth._requestManager, events, contract.address);
infra/opstack/op-geth/internal/jsre/deps/web3.js:2865:        return new SolidityEvent(contract._eth._requestManager, json, contract.address);
infra/opstack/op-geth/internal/jsre/deps/web3.js:2885:    var filter = contract._eth.filter('latest', function(e){
infra/opstack/op-geth/internal/jsre/deps/web3.js:2903:                contract._eth.getTransactionReceipt(contract.transactionHash, function(e, receipt){
infra/opstack/op-geth/internal/jsre/deps/web3.js:2906:                        contract._eth.getCode(receipt.contractAddress, function(e, code){
(truncated; total 1321 matches in infra)

## observability
(no matches)

## docs
docs/autonomy/ports-and-endpoints.md:1660:  - ports: ${L3_HOST_RPC:-39545}:8545, ${L3_HOST_WS:-39548}:8546, ${L3_GETH_METRICS_HOST_PORT:-39606}:${L3_GETH_METRICS_PORT:-6060}
docs/autonomy/ports-and-endpoints.md:1824:  - ports: ${L3_HOST_RPC:-39545}:8545, ${L3_HOST_WS:-39548}:8546, ${L3_GETH_METRICS_HOST_PORT:-39606}:${L3_GETH_METRICS_PORT:-6060}
docs/autonomy/ports-and-endpoints.md:1988:  - ports: ${L3_HOST_RPC:-39545}:8545, ${L3_HOST_WS:-39548}:8546, ${L3_GETH_METRICS_HOST_PORT:-39606}:${L3_GETH_METRICS_PORT:-6060}
docs/autonomy/ports-and-endpoints.md:2152:  - ports: ${L3_HOST_RPC:-39545}:8545, ${L3_HOST_WS:-39548}:8546, ${L3_GETH_METRICS_HOST_PORT:-39606}:${L3_GETH_METRICS_PORT:-6060}
docs/autonomy/ports-and-endpoints.md:2310:  - ports: ${L3_HOST_RPC:-39545}:8545, ${L3_HOST_WS:-39548}:8546, ${L3_GETH_METRICS_HOST_PORT:-39606}:${L3_GETH_METRICS_PORT:-6060}
docs/autonomy/ports-and-endpoints.md:2468:  - ports: ${L3_HOST_RPC:-39545}:8545, ${L3_HOST_WS:-39548}:8546, ${L3_GETH_METRICS_HOST_PORT:-39606}:${L3_GETH_METRICS_PORT:-6060}
docs/autonomy/ports-and-endpoints.md:2626:  - ports: ${L3_HOST_RPC:-39545}:8545, ${L3_HOST_WS:-39548}:8546, ${L3_GETH_METRICS_HOST_PORT:-39606}:${L3_GETH_METRICS_PORT:-6060}
docs/autonomy/ports-and-endpoints.md:2784:  - ports: ${L3_HOST_RPC:-39545}:8545, ${L3_HOST_WS:-39548}:8546, ${L3_GETH_METRICS_HOST_PORT:-39606}:${L3_GETH_METRICS_PORT:-6060}
docs/autonomy/ports-and-endpoints.md:2942:  - ports: ${L3_HOST_RPC:-39545}:8545, ${L3_HOST_WS:-39548}:8546, ${L3_GETH_METRICS_HOST_PORT:-39606}:${L3_GETH_METRICS_PORT:-6060}
docs/autonomy/ports-and-endpoints.md:3122:  - ports: ${L3_HOST_RPC:-39545}:8545, ${L3_HOST_WS:-39548}:8546, ${L3_GETH_METRICS_HOST_PORT:-39606}:${L3_GETH_METRICS_PORT:-6060}
docs/l3/reliability.md:38:- `l3-geth` metrics on `L3_GETH_METRICS_HOST_PORT` (default 39606)
docs/gst-migration/RENAME-MAP.md:6:- ETH_ADDR -> GST_ADDR
docs/gst-migration/RENAME-MAP.md:7:- ETH_ADDRESS -> GST_ADDRESS
docs/gst-migration/RENAME-MAP.md:8:- ETH_ASSET -> GST_ASSET
docs/gst-migration/RENAME-MAP.md:9:- ETH_ASSET_DATA -> GST_ASSET_DATA
docs/gst-migration/RENAME-MAP.md:10:- ETH_BIGNUMBER_ROUNDING_MODE -> GST_BIGNUMBER_ROUNDING_MODE
docs/gst-migration/RENAME-MAP.md:11:- ETH_BLK_MULTIPLIER -> GST_BLK_MULTIPLIER
docs/gst-migration/RENAME-MAP.md:12:- ETH_CAP -> GST_CAP
docs/gst-migration/RENAME-MAP.md:13:- ETH_CLEAR -> GST_CLEAR
docs/gst-migration/RENAME-MAP.md:14:- ETH_CONTRACT_ADDRESS -> GST_CONTRACT_ADDRESS
docs/gst-migration/RENAME-MAP.md:15:- ETH_CRWDTOKEN -> GST_CRWDTOKEN
docs/gst-migration/RENAME-MAP.md:16:- ETH_DECIMALS -> GST_DECIMALS
docs/gst-migration/RENAME-MAP.md:17:- ETH_DECIMALS_FACTOR -> GST_DECIMALS_FACTOR
docs/gst-migration/RENAME-MAP.md:18:- ETH_DEPS -> GST_DEPS
docs/gst-migration/RENAME-MAP.md:19:- ETH_EUR -> GST_EUR
docs/gst-migration/RENAME-MAP.md:20:- ETH_EURCENT -> GST_EURCENT
docs/gst-migration/RENAME-MAP.md:21:- ETH_FUND -> GST_FUND
docs/gst-migration/RENAME-MAP.md:22:- ETH_FUND_DEPOSIT -> GST_FUND_DEPOSIT
docs/gst-migration/RENAME-MAP.md:23:- ETH_HARD_CAP -> GST_HARD_CAP
docs/gst-migration/RENAME-MAP.md:24:- ETH_HEROCOIN -> GST_HEROCOIN
docs/gst-migration/RENAME-MAP.md:25:- ETH_ILK -> GST_ILK
docs/gst-migration/RENAME-MAP.md:26:- ETH_JOIN_ADDRESS -> GST_JOIN_ADDRESS
docs/gst-migration/RENAME-MAP.md:27:- ETH_JWT_SECRET -> GST_JWT_SECRET
docs/gst-migration/RENAME-MAP.md:28:- ETH_LIMIT -> GST_LIMIT
docs/gst-migration/RENAME-MAP.md:29:- ETH_LIQUIDITY -> GST_LIQUIDITY
docs/gst-migration/RENAME-MAP.md:30:- ETH_LOCKBOX -> GST_LOCKBOX
docs/gst-migration/RENAME-MAP.md:31:- ETH_MAG -> GST_MAG
docs/gst-migration/RENAME-MAP.md:32:- ETH_MAX_GOAL -> GST_MAX_GOAL
docs/gst-migration/RENAME-MAP.md:33:- ETH_MAX_LIMIT -> GST_MAX_LIMIT
docs/gst-migration/RENAME-MAP.md:34:- ETH_MIN_GOAL -> GST_MIN_GOAL
docs/gst-migration/RENAME-MAP.md:35:- ETH_MIN_LIMIT -> GST_MIN_LIMIT
docs/gst-migration/RENAME-MAP.md:36:- ETH_PADDING -> GST_PADDING
docs/gst-migration/RENAME-MAP.md:37:- ETH_PER_LARE -> GST_PER_LARE
docs/gst-migration/RENAME-MAP.md:38:- ETH_PER_TOKEN -> GST_PER_TOKEN
docs/gst-migration/RENAME-MAP.md:39:- ETH_POLLING_TIMEOUT -> GST_POLLING_TIMEOUT
docs/gst-migration/RENAME-MAP.md:40:- ETH_PREFIX -> GST_PREFIX
docs/gst-migration/RENAME-MAP.md:41:- ETH_PRICE -> GST_PRICE
docs/gst-migration/RENAME-MAP.md:42:- ETH_PRICE_USD -> GST_PRICE_USD
docs/gst-migration/RENAME-MAP.md:43:- ETH_QCO -> GST_QCO
docs/gst-migration/RENAME-MAP.md:44:- ETH_RECEIVED_CAP -> GST_RECEIVED_CAP
docs/gst-migration/RENAME-MAP.md:45:- ETH_RECEIVED_MIN -> GST_RECEIVED_MIN
docs/gst-migration/RENAME-MAP.md:46:- ETH_RPC_JWT_SECRET -> GST_RPC_JWT_SECRET
docs/gst-migration/RENAME-MAP.md:47:- ETH_RPC_URL -> GST_RPC_URL
docs/gst-migration/RENAME-MAP.md:48:- ETH_SIG -> GST_SIG
docs/gst-migration/RENAME-MAP.md:49:- ETH_SIGNATURE_LENGTH -> GST_SIGNATURE_LENGTH
docs/gst-migration/RENAME-MAP.md:50:- ETH_SIGN_PREFIX -> GST_SIGN_PREFIX
docs/gst-migration/RENAME-MAP.md:51:- ETH_SIGN_TYPED_DATA_ARGHASH -> GST_SIGN_TYPED_DATA_ARGHASH
docs/gst-migration/RENAME-MAP.md:52:- ETH_TLD_LABEL -> GST_TLD_LABEL
docs/gst-migration/RENAME-MAP.md:53:- ETH_TLD_NODE -> GST_TLD_NODE
docs/gst-migration/RENAME-MAP.md:54:- ETH_TOKEN -> GST_TOKEN
docs/gst-migration/RENAME-MAP.md:55:- ETH_TOKEN_ADDRESS -> GST_TOKEN_ADDRESS
docs/gst-migration/RENAME-MAP.md:56:- ETH_TOKEN_EXCHANGE_RATIO -> GST_TOKEN_EXCHANGE_RATIO
docs/gst-migration/RENAME-MAP.md:57:- ETH_TOKEN_PLACEHOLDER_ADDRESS -> GST_TOKEN_PLACEHOLDER_ADDRESS
docs/gst-migration/RENAME-MAP.md:58:- ETH_TO_QST_TOKEN_RATE -> GST_TO_QST_TOKEN_RATE
docs/gst-migration/RENAME-MAP.md:59:- ETH_TO_WEI -> GST_TO_WEI
docs/gst-migration/RENAME-MAP.md:60:- ETH_TRANSFER_FAILED -> GST_TRANSFER_FAILED
docs/gst-migration/RENAME-MAP.md:61:- ETH_UNITS -> GST_UNITS
docs/gst-migration/RENAME-MAP.md:62:- ETH_USD -> GST_USD
docs/gst-migration/RENAME-MAP.md:63:- ETH_USD_EXCHANGE_CENTS -> GST_USD_EXCHANGE_CENTS
docs/gst-migration/RENAME-MAP.md:64:- ETH_USD_EXCHANGE_RATE_IN_CENTS -> GST_USD_EXCHANGE_RATE_IN_CENTS
docs/gst-migration/RENAME-MAP.md:65:- ETH_VANILLA -> GST_VANILLA
docs/gst-migration/RENAME-MAP.md:66:- ETH_VAULT -> GST_VAULT
docs/gst-migration/RENAME-MAP.md:67:- ETH_VTA -> GST_VTA
docs/gst-migration/RENAME-MAP.md:68:- ETH_YFEED -> GST_YFEED
docs/gst-migration/RENAME-MAP.md:71:- *_eth -> *_gst
docs/gst-migration/RENAME-MAP.md:72:- ETH_DECIMALS -> GST_DECIMALS
docs/gst-migration/RENAME-MAP.md:73:- ethAmount -> gstAmount
docs/gst-migration/RENAME-MAP.md:74:- ethBalance -> gstBalance
docs/gst-migration/RENAME-MAP.md:75:- nativeEth -> nativeGst
docs/gst-migration/RENAME-MAP.md:76:- Ethereum -> GhostChain (branding)
docs/gst-migration/RENAME-MAP.md:77:- Ether -> Ghost Token (branding)
docs/gst-migration/PHASE2_WAVE_D_PREFLIGHT.md:18:  '\\bETH\\b|Ethereum|\\bEther\\b|Ξ' observability/infra
docs/gst-migration/PHASE2_WAVE_C_PREFLIGHT.md:11:- `ghost-rpc-proxy`: rename `RPC_DEPRECATE_ETH_NAMESPACE` / `RPC_REJECT_ETH_NAMESPACE` to `RPC_DEPRECATE_LEGACY_NAMESPACE` / `RPC_REJECT_LEGACY_NAMESPACE` (legacy env vars still honored).
docs/gst-migration/PHASE2_WAVE_B_PREFLIGHT.md:7:This preflight accompanies the **Wave B continuation** patch set that removes ETH/Ethereum/Ether branding from first‑party code (contracts + adjacent tooling/docs).
docs/gst-migration/PHASE2_WAVE_B_PREFLIGHT.md:20:  '\\bETH\\b|Ethereum|\\bEther\\b|Ξ' .
docs/gst-migration/PHASE2_WAVE_B_PREFLIGHT.md:23:Identifier scan (`_eth`, `ETH_`) under the same exclusions:
docs/gst-migration/PHASE2_WAVE_B_PREFLIGHT.md:32:  '_eth\\b|\\bETH_' .
docs/gst-migration/PHASE6_ATTESTATION.md:83:  - Enforces no user-facing legacy ETH/Ethereum/Ether/ENS `.eth` leakage outside an allowlist.
docs/gst-migration/PHASE2_WAVE_A_PREFLIGHT.md:9:Wave A targets **docs + UI strings** (plus small tracked report artifacts) to remove ETH/Ethereum/Ether branding.
docs/gst-migration/PHASE2_WAVE_A_PREFLIGHT.md:15:git grep -n -P "\\bETH\\b|Ethereum|\\bEther\\b|Ξ|\\bethereum\\b|\\bether\\b" c91580b8 -- docs | rg -v '^c91580b8:docs/gst-migration/' | wc -l
docs/gst-migration/PHASE2_WAVE_A_PREFLIGHT.md:19:git grep -n -P "\\bETH\\b|Ethereum|\\bEther\\b|Ξ|\\bethereum\\b|\\bether\\b" c91580b8 -- . | rg -v '^c91580b8:(docs/gst-migration/|contracts/lib/|infra/opstack/optimism-upstream/|infra/opsta
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:8:- Matches: _eth, ETH_, Ethereum, Ether, Ξ, ethAmount, ethBalance, nativeEth.
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:17:services/stack.env:156:L3_GETH_METRICS_HOST_PORT=39606
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:18:services/ghost-rpc-proxy/index.mjs:39:  process.env.RPC_DEPRECATE_LEGACY_NAMESPACE === "1" || process.env.RPC_DEPRECATE_ETH_NAMESPACE === "1";
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:19:services/ghost-rpc-proxy/index.mjs:41:  process.env.RPC_REJECT_LEGACY_NAMESPACE === "1" || process.env.RPC_REJECT_ETH_NAMESPACE === "1";
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:25:infra/scripts/env-sync-l1.sh:29:require_var L1_GETH_IMAGE
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:26:infra/scripts/env-sync-l1.sh:61:  "${L1_GETH_IMAGE:-}" \
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:27:infra/scripts/env-sync-l1.sh:84:GETH_IMAGE=$L1_GETH_IMAGE
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:28:infra/scripts/doctor-l3.sh:49:L3_GETH_METRICS_URL="${L3_GETH_METRICS_URL:-http://localhost:${L3_GETH_METRICS_HOST_PORT:-39606}/debug/metrics/prometheus}"
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:29:infra/scripts/doctor-l3.sh:734:metric_urls=( "$L3_GETH_METRICS_URL" "$L3_OP_NODE_METRICS_URL" "$L3_BATCHER_METRICS_URL" )
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:30:infra/scripts/opstack/up-l3.sh:40:OP_GETH_IMAGE="${OP_GETH_IMAGE:-local/op-geth:${OPSTACK_IMAGE_TAG:-local}}"
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:31:infra/scripts/opstack/up-l3.sh:192:    "$OP_GETH_IMAGE" \
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:32:infra/scripts/doctor-l2.sh:56:L2_GETH_METRICS_URL="${L2_GETH_METRICS_URL:-http://localhost:29606/debug/metrics/prometheus}"
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:33:infra/scripts/doctor-l2.sh:708:metric_urls=( "$L2_GETH_METRICS_URL" "$OP_NODE_METRICS_URL" "$OP_SEQUENCER_METRICS_URL" "$OP_BATCHER_METRICS_URL" )
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:34:infra/ghostchain/scripts/init.sh:18:IMG="${L1_GETH_IMAGE:-${GETH_IMAGE:-ghostl/geth:alltools-v1.13.14}}"
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:35:infra/ghostchain/.env.l1:8:L1_GETH_IMAGE=ethereum/client-go:alltools-v1.13.14
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:36:infra/ghostchain/docker-compose.l1.yml:15:    image: ${GETH_IMAGE:-ghostl/geth:alltools-v1.13.14}
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:37:infra/ghostchain/docker-compose.l1.yml:45:    image: ${GETH_IMAGE:-ghostl/geth:alltools-v1.13.14}
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:38:infra/ghostchain/docker-compose.l1.yml:99:    image: ${GETH_IMAGE:-ghostl/geth:alltools-v1.13.14}
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:39:infra/ghostchain/.env:3:GETH_IMAGE=ethereum/client-go:alltools-v1.13.14
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:40:infra/ghostchain/.env.l1.example:7:L1_GETH_IMAGE=ethereum/client-go:alltools-v1.13.14
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:41:infra/k8s/blueprints/statefulsets/ghostchain-node2.yaml:38:            "image": "${GETH_IMAGE:-ghostl/geth:alltools-v1.13.14}",
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:42:infra/k8s/blueprints/statefulsets/l2-b.yaml:46:                "name": "GETH_MINER_RECOMMIT",
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:43:infra/k8s/blueprints/statefulsets/l2-b.yaml:50:                "name": "GETH_ROLLUP_INTEROPRPC",
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:44:infra/k8s/blueprints/statefulsets/l2-a.yaml:46:                "name": "GETH_MINER_RECOMMIT",
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:45:infra/k8s/blueprints/statefulsets/l2-a.yaml:50:                "name": "GETH_ROLLUP_INTEROPRPC",
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:46:infra/k8s/blueprints/statefulsets/l1.yaml:43:                "name": "GETH_MINER_RECOMMIT",
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:47:infra/k8s/blueprints/statefulsets/l2.yaml:46:                "name": "GETH_MINER_RECOMMIT",
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:48:infra/k8s/blueprints/statefulsets/ghostchain-bootnode.yaml:38:            "image": "${GETH_IMAGE:-ghostl/geth:alltools-v1.13.14}",
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:49:infra/k8s/blueprints/statefulsets/ghostchain-node1.yaml:38:            "image": "${GETH_IMAGE:-ghostl/geth:alltools-v1.13.14}",
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:50:infra/docker/compose/docker-compose.core.yml:2760:      "image": "${GETH_IMAGE:-ghostl/geth:alltools-v1.13.14}",
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:51:infra/docker/compose/docker-compose.core.yml:2929:      "image": "${GETH_IMAGE:-ghostl/geth:alltools-v1.13.14}",
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:52:infra/docker/compose/docker-compose.core.yml:4183:        "GETH_MINER_RECOMMIT": "100ms"
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:53:infra/docker/compose/docker-compose.core.yml:4410:        "GETH_MINER_RECOMMIT": "100ms",
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:54:infra/docker/compose/docker-compose.core.yml:4411:        "GETH_ROLLUP_INTEROPRPC": "ws://op-supervisor:8545"
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:55:infra/docker/compose/docker-compose.core.yml:4478:        "GETH_MINER_RECOMMIT": "100ms",
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:56:infra/docker/compose/docker-compose.core.yml:4479:        "GETH_ROLLUP_INTEROPRPC": "ws://op-supervisor:8545"
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:57:infra/docker/compose/docker-compose.core.yml:5206:        "GETH_MINER_RECOMMIT": "100ms"
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:58:infra/opstack/docker-compose.l3.yml:26:      - "${L3_GETH_METRICS_HOST_PORT:-39606}:${L3_GETH_METRICS_PORT:-6060}"
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:59:infra/opstack/docker-compose.l3.yml:45:          --metrics --metrics.addr=0.0.0.0 --metrics.port=${L3_GETH_METRICS_PORT:-6060} \
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:60:infra/opstack/.env.l3.generated:17:L3_GETH_METRICS_HOST_PORT=39606
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:61:infra/opstack/optimism/op-deployer/book/src/user-guide/known-limitations.md:10:anywhere except Sepolia and Ethereum mainnet. If you try to, you'll see an error like this:
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:62:infra/opstack/optimism/op-deployer/book/src/user-guide/known-limitations.md:47:development chains, or use Sepolia or Ethereum mainnet as your L1.
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:63:infra/opstack/optimism/README.md:6:  <h3><a href="https://optimism.io">Optimism</a> is Ethereum, scaled.</h3>
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:64:infra/opstack/optimism/README.md:31:[Optimism](https://www.optimism.io/) is a project dedicated to scaling Ethereum's technology and expanding its ability to coordinate people from across the w
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:66:infra/opstack/optimism/README.md:119:`op-geth` embeds upstream geth’s version inside its own version as follows: `vMAJOR.GETH_MAJOR GETH_MINOR GETH_PATCH.PATCH`.
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:67:infra/opstack/optimism/docs/postmortems/2022-02-02-inflation-vuln.md:154:[Ethereum tests](https://github.com/ethereum/tests) (though not unexpectedly). Modifying the tests
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:68:infra/opstack/optimism/docs/postmortems/2022-02-02-inflation-vuln.md:197:- We will ensure the common Ethereum tests are run against Bedrock.
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:69:infra/opstack/optimism/op-program/bin/meta-mt64.json:67004:      "name": "github.com/ethereum-optimism/optimism/op-service/eth.Ether",
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:70:infra/opstack/optimism/op-program/bin/meta-mt64Next.json:67004:      "name": "github.com/ethereum-optimism/optimism/op-service/eth.Ether",
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:71:infra/opstack/optimism/op-program/bin/meta-interop.json:67004:      "name": "github.com/ethereum-optimism/optimism/op-service/eth.Ether",
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:72:infra/opstack/optimism/op-program/bin/meta-interopNext.json:67004:      "name": "github.com/ethereum-optimism/optimism/op-service/eth.Ether",
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:73:infra/opstack/optimism/devnet-sdk/book/src/shell.md:26:This automatic configuration enables seamless use of Ethereum development tools without explicit endpoint configuration:
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:74:infra/opstack/optimism/devnet-sdk/book/src/shell.md:38:The shell environment enhances the experience with various Ethereum development tools:
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:75:infra/opstack/optimism/devnet-sdk/book/src/shell.md:44:The shell automatically sets up standard Ethereum environment variables based on the descriptor:
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:76:infra/opstack/optimism/devnet-sdk/book/src/shell.md:48:export ETH_RPC_URL=...
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:77:infra/opstack/optimism/devnet-sdk/book/src/shell.md:49:export ETH_JWT_SECRET=...
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:78:infra/opstack/optimism/kurtosis-devnet/README.md:110:    "name": "Ethereum",
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:79:infra/opstack/optimism/kurtosis-devnet/book/src/std_output.md:24:    "name": "Ethereum",
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:80:infra/opstack/optimism/kurtosis-devnet/book/src/basic_deployment.md:98:- `chain-name`: Optional chain to connect to (defaults to "Ethereum")
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:81:infra/opstack/optimism/kurtosis-devnet/book/src/basic_deployment.md:102:# Enter the Ethereum chain environment in the simple devnet
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:82:infra/opstack/optimism/kurtosis-devnet/book/src/basic_deployment.md:133:- `ETH_RPC_URL`: The RPC endpoint for the selected chain
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:83:infra/opstack/optimism/kurtosis-devnet/book/src/basic_deployment.md:134:- `ETH_RPC_JWT_SECRET`: JWT secret for authenticated RPC connections (when cast integration is enabled)
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:84:infra/opstack/optimism/op-batcher/readme.md:52:4. Sends frames from the channel queue to the DA layer as (e.g. to Ethereum L1 as calldata or blob transactions).
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:85:infra/opstack/optimism/op-dispute-mon/README.md:26:  --l1-eth-rpc <L1-Ethereum-RPC-URL> \
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:86:infra/opstack/optimism/op-dispute-mon/README.md:32:  --l1-eth-rpc <L1-Ethereum-RPC-URL> \
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:87:infra/opstack/optimism/op-supernode/README.md:53:export OP_SUPERNODE_L1_ETH_RPC=$L1_RPC
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:88:infra/opstack/optimism/op-dripper/README.md:7:The main configuration for the EOA, Drippie contract to trigger, and the Ethereum L1 RPC.
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:89:infra/opstack/optimism/op-dripper/README.md:10:- `OP_DRIPPER_L1_ETH_RPC`: RPC URL for the L1 Ethereum chain
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:90:infra/opstack/optimism/packages/contracts-bedrock/interfaces/L1/IOptimismPortalInterop.sol:51:    event ETHMigrated(address indexed lockbox, uint256 ethBalance);
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:91:infra/opstack/optimism/packages/contracts-bedrock/interfaces/L1/IOptimismPortalInterop.sol:85:        IETHLockbox _ethLockbox
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:92:infra/opstack/optimism/packages/contracts-bedrock/interfaces/L1/IOptimismPortalInterop.sol:123:    function upgrade(IAnchorStateRegistry _anchorStateRegistry, IETHLockbox _ethLockbox) external;
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:93:infra/opstack/optimism/packages/contracts-bedrock/scripts/FetchChainInfo.s.sol:71:    address internal _ethLockboxProxy;
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:94:infra/opstack/optimism/packages/contracts-bedrock/scripts/FetchChainInfo.s.sol:109:        else if (_sel == this.ethLockboxProxy.selector) _ethLockboxProxy = _addr;
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:95:infra/opstack/optimism/packages/contracts-bedrock/scripts/FetchChainInfo.s.sol:152:        return _ethLockboxProxy;
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:96:infra/opstack/optimism/packages/contracts-bedrock/scripts/deploy/deploy.sh:10:forge script -vvv scripts/deploy/Deploy.s.sol:Deploy --rpc-url "$DEPLOY_ETH_RPC_URL" --broadcast --private-key "$DE
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:97:infra/opstack/optimism/packages/contracts-bedrock/scripts/deploy/deploy.sh:14:  forge script -vvv scripts/deploy/Deploy.s.sol:Deploy --sig 'sync()' --rpc-url "$DEPLOY_ETH_RPC_URL" --broadcast -
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:98:infra/opstack/optimism/packages/contracts-bedrock/scripts/deploy/ChainAssertions.sol:301:    function checkETHLockboxImpl(IETHLockbox _ethLockbox, IOptimismPortal _portal) internal view {
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:99:infra/opstack/optimism/packages/contracts-bedrock/scripts/deploy/ChainAssertions.sol:302:        console.log("Running chain assertions on the ETHLockbox implementation at %s", address(_ethLockb
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:100:infra/opstack/optimism/packages/contracts-bedrock/scripts/deploy/ChainAssertions.sol:305:        DeployUtils.assertInitialized({ _contractAddress: address(_ethLockbox), _isProxy: false, _slot:
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:101:infra/opstack/optimism/packages/contracts-bedrock/scripts/deploy/ChainAssertions.sol:307:        require(address(_ethLockbox.systemConfig()) == address(0), "CHECK-ELB-50");
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:102:infra/opstack/optimism/packages/contracts-bedrock/scripts/deploy/ChainAssertions.sol:308:        require(_ethLockbox.authorizedPortals(_portal) == false, "CHECK-ELB-60");
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:103:infra/opstack/optimism/packages/contracts-bedrock/scripts/L2Genesis.s.sol:486:        _setImplementationCode(Predeploys.ETH_LIQUIDITY);
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:104:infra/opstack/optimism/packages/contracts-bedrock/scripts/L2Genesis.s.sol:487:        vm.deal(Predeploys.ETH_LIQUIDITY, type(uint248).max);
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:105:infra/opstack/optimism/packages/contracts-bedrock/scripts/L2Genesis.s.sol:493:        _setImplementationCode(Predeploys.SUPERCHAIN_ETH_BRIDGE);
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:106:infra/opstack/optimism/packages/contracts-bedrock/src/L1/OPContractsManagerStandardValidator.sol:435:        if (!_sysCfg.isFeatureEnabled(Features.ETH_LOCKBOX)) {
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:107:infra/opstack/optimism/packages/contracts-bedrock/src/L1/OptimismPortalInterop.sol:156:    /// @param ethBalance Amount of ETH migrated.
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:108:infra/opstack/optimism/packages/contracts-bedrock/src/L1/OptimismPortalInterop.sol:157:    event ETHMigrated(address indexed lockbox, uint256 ethBalance);
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:109:infra/opstack/optimism/packages/contracts-bedrock/src/L1/OptimismPortalInterop.sol:246:    /// @param _ethLockbox Contract of the ETHLockbox.
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:110:infra/opstack/optimism/packages/contracts-bedrock/src/L1/OptimismPortalInterop.sol:250:        IETHLockbox _ethLockbox
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:111:infra/opstack/optimism/packages/contracts-bedrock/src/L1/OptimismPortalInterop.sol:261:        ethLockbox = _ethLockbox;
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:112:infra/opstack/optimism/packages/contracts-bedrock/src/L1/OptimismPortalInterop.sol:274:    /// @param _ethLockbox ETHLockbox contract.
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:113:infra/opstack/optimism/packages/contracts-bedrock/src/L1/OptimismPortalInterop.sol:277:        IETHLockbox _ethLockbox
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:114:infra/opstack/optimism/packages/contracts-bedrock/src/L1/OptimismPortalInterop.sol:287:        ethLockbox = _ethLockbox;
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:115:infra/opstack/optimism/packages/contracts-bedrock/src/L1/OptimismPortalInterop.sol:376:        uint256 ethBalance = address(this).balance;
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:116:infra/opstack/optimism/packages/contracts-bedrock/src/L1/OptimismPortalInterop.sol:377:        ethLockbox.lockETH{ value: ethBalance }();
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:117:infra/opstack/optimism/packages/contracts-bedrock/src/L1/OptimismPortalInterop.sol:378:        emit ETHMigrated(address(ethLockbox), ethBalance);
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:118:infra/opstack/optimism/packages/contracts-bedrock/src/L1/OPContractsManager.sol:1165:            output.systemConfigProxy.setFeature(Features.ETH_LOCKBOX, true);
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:119:infra/opstack/optimism/packages/contracts-bedrock/src/L1/L1ERC721Bridge.sol:23:///         make it possible to transfer ERC721 tokens from Ethereum to Optimism. This contract
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:120:infra/opstack/optimism/packages/contracts-bedrock/src/L1/SystemConfig.sol:534:        if (_feature == Features.ETH_LOCKBOX) {
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:121:infra/opstack/optimism/packages/contracts-bedrock/src/L1/SystemConfig.sol:574:        address identifier = isFeatureEnabled[Features.ETH_LOCKBOX]
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:122:infra/opstack/optimism/packages/contracts-bedrock/src/L1/OptimismPortal2.sol:614:        return systemConfig.isFeatureEnabled(Features.ETH_LOCKBOX) && address(ethLockbox) != address(0);
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:123:infra/opstack/optimism/packages/contracts-bedrock/src/L1/OptimismPortal2.sol:627:            systemConfig.isFeatureEnabled(Features.ETH_LOCKBOX) && address(ethLockbox) == address(0)
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:124:infra/opstack/optimism/packages/contracts-bedrock/src/L1/OptimismPortal2.sol:628:                || !systemConfig.isFeatureEnabled(Features.ETH_LOCKBOX) && address(ethLockbox) != address(0)
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:125:infra/opstack/optimism/packages/contracts-bedrock/src/libraries/Features.sol:8:    /// @notice The ETH_LOCKBOX feature determines if the system is configured to use the
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:126:infra/opstack/optimism/packages/contracts-bedrock/src/libraries/Features.sol:9:    ///         ETHLockbox contract in the OptimismPortal. When the ETH_LOCKBOX feature is active
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:127:infra/opstack/optimism/packages/contracts-bedrock/src/libraries/Features.sol:12:    bytes32 internal constant ETH_LOCKBOX = "ETH_LOCKBOX";
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:128:infra/opstack/optimism/packages/contracts-bedrock/src/libraries/trie/MerkleTrie.sol:9:/// @notice MerkleTrie is a small library for verifying standard Ethereum Merkle-Patricia trie
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:129:infra/opstack/optimism/packages/contracts-bedrock/src/libraries/trie/MerkleTrie.sol:151:                    // Our Merkle Trie is designed specifically for the purposes of the Ethereum
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:130:infra/opstack/optimism/packages/contracts-bedrock/src/libraries/trie/SecureMerkleTrie.sol:9:///         keys. Ethereum's state trie hashes input keys before storing them.
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:131:infra/opstack/optimism/packages/contracts-bedrock/src/libraries/Predeploys.sol:98:    address internal constant SUPERCHAIN_ETH_BRIDGE = 0x4200000000000000000000000000000000000024;
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:132:infra/opstack/optimism/packages/contracts-bedrock/src/libraries/Predeploys.sol:101:    address internal constant ETH_LIQUIDITY = 0x4200000000000000000000000000000000000025;
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:133:infra/opstack/optimism/packages/contracts-bedrock/src/libraries/Predeploys.sol:146:        if (_addr == SUPERCHAIN_ETH_BRIDGE) return "SuperchainETHBridge";
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:134:infra/opstack/optimism/packages/contracts-bedrock/src/libraries/Predeploys.sol:147:        if (_addr == ETH_LIQUIDITY) return "ETHLiquidity";
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:135:infra/opstack/optimism/packages/contracts-bedrock/src/libraries/Preinstalls.sol:70:    // @notice Permit2 code is templated. The template is a copy of the Mainnet Ethereum L1 Permit2 deploymen
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:136:infra/opstack/optimism/packages/contracts-bedrock/src/libraries/GasPayingToken.sol:54:    ///         If nothing is set in storage, then the ether name, 'Ether', is returned instead.
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:137:infra/opstack/optimism/packages/contracts-bedrock/src/libraries/GasPayingToken.sol:58:            name_ = "Ether";
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:138:infra/opstack/optimism/packages/contracts-bedrock/src/L2/WETH.sol:21:    /// @notice Returns the name of the wrapped native asset. Will be "Wrapped Ether"
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:139:infra/opstack/optimism/packages/contracts-bedrock/src/L2/WETH.sol:22:    ///         if the native asset is Ether.
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:140:infra/opstack/optimism/packages/contracts-bedrock/src/L2/WETH.sol:28:    ///         native asset is Ether.
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:141:infra/opstack/optimism/packages/contracts-bedrock/src/L2/ETHLiquidity.sol:39:        if (msg.sender != Predeploys.SUPERCHAIN_ETH_BRIDGE) revert Unauthorized();
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:142:infra/opstack/optimism/packages/contracts-bedrock/src/L2/ETHLiquidity.sol:46:        if (msg.sender != Predeploys.SUPERCHAIN_ETH_BRIDGE) revert Unauthorized();
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:143:infra/opstack/optimism/packages/contracts-bedrock/src/L2/OptimismMintableERC721.sol:17:///         typically an Optimism representation of an Ethereum-based token. Standard reference
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:144:infra/opstack/optimism/packages/contracts-bedrock/src/L2/L2ERC721Bridge.sol:21:///         make it possible to transfer ERC721 tokens from Ethereum to Optimism. This contract
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:145:infra/opstack/optimism/packages/contracts-bedrock/src/L2/L2ERC721Bridge.sol:25:///         bridge ONLY supports ERC721s originally deployed on Ethereum.
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:146:infra/opstack/optimism/packages/contracts-bedrock/src/L2/SuperchainETHBridge.sol:49:        IETHLiquidity(Predeploys.ETH_LIQUIDITY).burn{ value: msg.value }();
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:147:infra/opstack/optimism/packages/contracts-bedrock/src/L2/SuperchainETHBridge.sol:73:        IETHLiquidity(Predeploys.ETH_LIQUIDITY).mint(_amount);
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:148:infra/opstack/optimism/packages/contracts-bedrock/src/L2/L1Block.sol:82:        name_ = "Ether";
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:149:infra/opstack/optimism/packages/contracts-bedrock/src/universal/WETH98.sol:68:        return "Wrapped Ether";
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:150:infra/opstack/optimism/packages/contracts-bedrock/src/universal/ERC721Bridge.sol:116:    ///         bridge only supports ERC721s originally deployed on Ethereum. Users will need to
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:151:infra/opstack/optimism/packages/contracts-bedrock/src/universal/ERC721Bridge.sol:150:    ///         bridge only supports ERC721s originally deployed on Ethereum. Users will need to
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:152:infra/opstack/optimism/packages/contracts-bedrock/src/safe/SafeSigners.sol:71:                // To support eth_sign and similar we adjust v and hash the messageHash with the Ethereum message 
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:153:infra/opstack/optimism/packages/contracts-bedrock/src/safe/SafeSigners.sol:74:                    ecrecover(keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", _dataHash)), v - 4, r
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:154:infra/opstack/optimism/packages/contracts-bedrock/snapshots/abi/OptimismPortalInterop.json:300:        "name": "_ethLockbox",
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:155:infra/opstack/optimism/packages/contracts-bedrock/snapshots/abi/OptimismPortalInterop.json:790:        "name": "_ethLockbox",
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:156:infra/opstack/optimism/packages/contracts-bedrock/snapshots/abi/OptimismPortalInterop.json:824:        "name": "ethBalance",
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:279:infra/opstack/optimism/packages/contracts-bedrock/book/src/contributing/opcm.md:91:To run fork tests, run `just test-upgrade`. You will need to set `ETH_RPC_URL` to an archival mainnet node.
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:280:infra/opstack/optimism/packages/contracts-bedrock/test/scripts/FetchChainInfo.t.sol:15:address constant WETH_PERMISSIONED = address(0x500);
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:281:infra/opstack/optimism/packages/contracts-bedrock/test/scripts/FetchChainInfo.t.sol:16:address constant WETH_PERMISSIONLESS = address(0x600);
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:282:infra/opstack/optimism/packages/contracts-bedrock/test/scripts/FetchChainInfo.t.sol:161:        return WETH_PERMISSIONED;
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:283:infra/opstack/optimism/packages/contracts-bedrock/test/scripts/FetchChainInfo.t.sol:167:        return WETH_PERMISSIONLESS;
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:284:infra/opstack/optimism/packages/contracts-bedrock/test/scripts/FetchChainInfo.t.sol:485:        assertEq(ctx.output.delayedWethPermissionedGameProxy(), WETH_PERMISSIONED, "PermissionedGame WET
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:285:infra/opstack/optimism/packages/contracts-bedrock/test/scripts/FetchChainInfo.t.sol:487:            ctx.output.delayedWethPermissionlessGameProxy(), WETH_PERMISSIONLESS, "PermissionlessGame WE
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:286:infra/opstack/optimism/packages/contracts-bedrock/test/L1/OPContractsManagerStandardValidator.t.sol:766:    function test_validate_ethLockboxInvalidVersion_succeeds() public {
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:287:infra/opstack/optimism/packages/contracts-bedrock/test/L1/OPContractsManagerStandardValidator.t.sol:769:        if (isSysFeatureEnabled(Features.ETH_LOCKBOX)) {
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:288:infra/opstack/optimism/packages/contracts-bedrock/test/L1/OPContractsManagerStandardValidator.t.sol:778:    function test_validate_ethLockboxInvalidImplementation_succeeds() public {
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:289:infra/opstack/optimism/packages/contracts-bedrock/test/L1/OPContractsManagerStandardValidator.t.sol:785:        if (isSysFeatureEnabled(Features.ETH_LOCKBOX)) {
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:290:infra/opstack/optimism/packages/contracts-bedrock/test/L1/OPContractsManagerStandardValidator.t.sol:794:    function test_validate_ethLockboxInvalidProxyAdmin_succeeds() public {
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:291:infra/opstack/optimism/packages/contracts-bedrock/test/L1/OPContractsManagerStandardValidator.t.sol:799:        if (isSysFeatureEnabled(Features.ETH_LOCKBOX)) {
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:292:infra/opstack/optimism/packages/contracts-bedrock/test/L1/OPContractsManagerStandardValidator.t.sol:808:    function test_validate_ethLockboxInvalidSystemConfig_succeeds() public {
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:293:infra/opstack/optimism/packages/contracts-bedrock/test/L1/OPContractsManagerStandardValidator.t.sol:811:        if (isSysFeatureEnabled(Features.ETH_LOCKBOX)) {
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:294:infra/opstack/optimism/packages/contracts-bedrock/test/L1/OPContractsManagerStandardValidator.t.sol:820:    function test_validate_ethLockboxPortalUnauthorized_succeeds() public {
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:295:infra/opstack/optimism/packages/contracts-bedrock/test/L1/OPContractsManagerStandardValidator.t.sol:825:        if (isSysFeatureEnabled(Features.ETH_LOCKBOX)) {
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:296:infra/opstack/optimism/packages/contracts-bedrock/test/L1/OPContractsManagerStandardValidator.t.sol:1072:/// @title OPContractsManagerStandardValidator_DelayedWETH_Test
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:297:infra/opstack/optimism/packages/contracts-bedrock/test/L1/OPContractsManagerStandardValidator.t.sol:1074:contract OPContractsManagerStandardValidator_DelayedWETH_Test is OPContractsManagerStan
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:298:infra/opstack/optimism/packages/contracts-bedrock/test/L1/FeesDepositor.t.sol:56:            systemConfig.isFeatureEnabled(Features.ETH_LOCKBOX) ? address(ethLockbox) : address(optimismPortal2
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:299:infra/opstack/optimism/packages/contracts-bedrock/test/L1/OPContractsManager.t.sol:628:    function test_addGameType_reusedDelayedWETH_succeeds() public {
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:300:infra/opstack/optimism/packages/contracts-bedrock/test/L1/OptimismPortal2.t.sol:161:            systemConfig.isFeatureEnabled(Features.ETH_LOCKBOX) && address(optimismPortal2.ethLockbox()) != 
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:301:infra/opstack/optimism/packages/contracts-bedrock/test/L1/OptimismPortal2.t.sol:167:        if (!isSysFeatureEnabled(Features.ETH_LOCKBOX)) {
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:302:infra/opstack/optimism/packages/contracts-bedrock/test/L1/OptimismPortal2.t.sol:169:            systemConfig.setFeature(Features.ETH_LOCKBOX, true);
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:303:infra/opstack/optimism/packages/contracts-bedrock/test/L1/OptimismPortal2.t.sol:310:        // Enable ETH_LOCKBOX feature but clear the lockbox address to create invalid state.
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:304:infra/opstack/optimism/packages/contracts-bedrock/test/L1/OptimismPortal2.t.sol:311:        if (!systemConfig.isFeatureEnabled(Features.ETH_LOCKBOX)) {
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:305:infra/opstack/optimism/packages/contracts-bedrock/test/L1/OptimismPortal2.t.sol:313:            systemConfig.setFeature(Features.ETH_LOCKBOX, true);
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:306:infra/opstack/optimism/packages/contracts-bedrock/test/L1/OptimismPortal2.t.sol:699:/// @title OptimismPortal2_DonateETH_Test
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:307:infra/opstack/optimism/packages/contracts-bedrock/test/L1/OptimismPortal2.t.sol:701:contract OptimismPortal2_DonateETH_Test is OptimismPortal2_TestInit {
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:308:infra/opstack/optimism/packages/contracts-bedrock/test/L1/OptimismPortal2.t.sol:703:    function test_donateETH_succeeds(uint256 _amount) external {
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:309:infra/opstack/optimism/packages/contracts-bedrock/test/L1/OptimismPortal2.t.sol:1675:        if (isSysFeatureEnabled(Features.ETH_LOCKBOX)) {
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:310:infra/opstack/optimism/packages/contracts-bedrock/test/L1/OptimismPortal2.t.sol:1705:        if (isSysFeatureEnabled(Features.ETH_LOCKBOX)) {
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:311:infra/opstack/optimism/packages/contracts-bedrock/test/L1/OptimismPortal2.t.sol:2510:        if (isSysFeatureEnabled(Features.ETH_LOCKBOX)) {
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:312:infra/opstack/optimism/packages/contracts-bedrock/test/L1/OptimismPortal2.t.sol:2525:        if (isSysFeatureEnabled(Features.ETH_LOCKBOX)) {
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:313:infra/opstack/optimism/packages/contracts-bedrock/test/L1/OptimismPortal2.t.sol:2588:        if (isSysFeatureEnabled(Features.ETH_LOCKBOX)) {
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:314:infra/opstack/optimism/packages/contracts-bedrock/test/L1/OptimismPortal2.t.sol:2633:        if (isSysFeatureEnabled(Features.ETH_LOCKBOX)) {
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:315:infra/opstack/optimism/packages/contracts-bedrock/test/L1/OptimismPortal2.t.sol:2648:        if (isSysFeatureEnabled(Features.ETH_LOCKBOX)) {
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:316:infra/opstack/optimism/packages/contracts-bedrock/test/L1/SystemConfig.t.sol:615:    ///         the ETH_LOCKBOX feature is disabled.
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:317:infra/opstack/optimism/packages/contracts-bedrock/test/L1/SystemConfig.t.sol:617:        skipIfSysFeatureEnabled(Features.ETH_LOCKBOX);
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:318:infra/opstack/optimism/packages/contracts-bedrock/test/L1/SystemConfig.t.sol:631:    ///         ETH_LOCKBOX feature is enabled.
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:319:infra/opstack/optimism/packages/contracts-bedrock/test/L1/SystemConfig.t.sol:632:    function test_paused_ethLockboxIdentifier_succeeds() external {
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:320:infra/opstack/optimism/packages/contracts-bedrock/test/L1/SystemConfig.t.sol:633:        skipIfSysFeatureDisabled(Features.ETH_LOCKBOX);
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:321:infra/opstack/optimism/packages/contracts-bedrock/test/L1/SystemConfig.t.sol:776:    /// @notice Tests that disabling ETH_LOCKBOX reverts if the OptimismPortal has a non-zero
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:322:infra/opstack/optimism/packages/contracts-bedrock/test/L1/SystemConfig.t.sol:778:    function test_setFeature_ethLockboxDisableWhileConfigured_reverts() external {
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:323:infra/opstack/optimism/packages/contracts-bedrock/test/L1/SystemConfig.t.sol:781:        // Ensure ETH_LOCKBOX is enabled first (no pause active in fresh setup).
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:324:infra/opstack/optimism/packages/contracts-bedrock/test/L1/SystemConfig.t.sol:782:        if (!systemConfig.isFeatureEnabled(Features.ETH_LOCKBOX)) {
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:325:infra/opstack/optimism/packages/contracts-bedrock/test/L1/SystemConfig.t.sol:784:            systemConfig.setFeature(Features.ETH_LOCKBOX, true);
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:326:infra/opstack/optimism/packages/contracts-bedrock/test/L1/SystemConfig.t.sol:785:            assertTrue(systemConfig.isFeatureEnabled(Features.ETH_LOCKBOX));
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:327:infra/opstack/optimism/packages/contracts-bedrock/test/L1/SystemConfig.t.sol:795:        systemConfig.setFeature(Features.ETH_LOCKBOX, false);
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:328:infra/opstack/optimism/packages/contracts-bedrock/test/L1/SystemConfig.t.sol:798:    /// @notice Tests that enabling ETH_LOCKBOX while the system is paused (global) reverts.
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:329:infra/opstack/optimism/packages/contracts-bedrock/test/L1/SystemConfig.t.sol:799:    function test_setFeature_ethLockboxEnableWhilePaused_reverts() external {
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:330:infra/opstack/optimism/packages/contracts-bedrock/test/L1/SystemConfig.t.sol:802:        // Ensure ETH_LOCKBOX is enabled first (no pause active in fresh setup).
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:331:infra/opstack/optimism/packages/contracts-bedrock/test/L1/SystemConfig.t.sol:803:        if (!systemConfig.isFeatureEnabled(Features.ETH_LOCKBOX)) {
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:332:infra/opstack/optimism/packages/contracts-bedrock/test/L1/SystemConfig.t.sol:805:            systemConfig.setFeature(Features.ETH_LOCKBOX, true);
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:333:infra/opstack/optimism/packages/contracts-bedrock/test/L1/SystemConfig.t.sol:806:            assertTrue(systemConfig.isFeatureEnabled(Features.ETH_LOCKBOX));
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:334:infra/opstack/optimism/packages/contracts-bedrock/test/L1/SystemConfig.t.sol:816:        systemConfig.setFeature(Features.ETH_LOCKBOX, true);
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:335:infra/opstack/optimism/packages/contracts-bedrock/test/L1/SystemConfig.t.sol:819:    /// @notice Tests that disabling ETH_LOCKBOX while the system is paused (global) reverts.
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:336:infra/opstack/optimism/packages/contracts-bedrock/test/L1/SystemConfig.t.sol:820:    function test_setFeature_ethLockboxDisableWhilePaused_reverts() external {
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:337:infra/opstack/optimism/packages/contracts-bedrock/test/L1/SystemConfig.t.sol:823:        // Ensure ETH_LOCKBOX is enabled first.
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:338:infra/opstack/optimism/packages/contracts-bedrock/test/L1/SystemConfig.t.sol:824:        if (!systemConfig.isFeatureEnabled(Features.ETH_LOCKBOX)) {
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:339:infra/opstack/optimism/packages/contracts-bedrock/test/L1/SystemConfig.t.sol:826:            systemConfig.setFeature(Features.ETH_LOCKBOX, true);
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:340:infra/opstack/optimism/packages/contracts-bedrock/test/L1/SystemConfig.t.sol:827:            assertTrue(systemConfig.isFeatureEnabled(Features.ETH_LOCKBOX));
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:341:infra/opstack/optimism/packages/contracts-bedrock/test/L1/SystemConfig.t.sol:837:        systemConfig.setFeature(Features.ETH_LOCKBOX, false);
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:342:infra/opstack/optimism/packages/contracts-bedrock/test/L1/ETHLockbox.t.sol:42:        skipIfSysFeatureDisabled(Features.ETH_LOCKBOX);
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:343:infra/opstack/optimism/packages/contracts-bedrock/test/L1/ETHLockbox.t.sol:276:/// @title ETHLockbox_LockETH_Test
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:344:infra/opstack/optimism/packages/contracts-bedrock/test/L1/ETHLockbox.t.sol:278:contract ETHLockbox_LockETH_Test is ETHLockbox_TestInit {
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:345:infra/opstack/optimism/packages/contracts-bedrock/test/L1/ETHLockbox.t.sol:280:    function testFuzz_lockETH_unauthorizedPortal_reverts(address _caller) public {
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:346:infra/opstack/optimism/packages/contracts-bedrock/test/L1/ETHLockbox.t.sol:292:    function testFuzz_lockETH_succeeds(uint256 _amount) public {
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:347:infra/opstack/optimism/packages/contracts-bedrock/test/L1/ETHLockbox.t.sol:320:    function testFuzz_lockETH_multiplePortals_succeeds(IOptimismPortal2 _portal, uint256 _amount) public {
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:348:infra/opstack/optimism/packages/contracts-bedrock/test/L1/ETHLockbox.t.sol:364:/// @title ETHLockbox_UnlockETH_Test
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:349:infra/opstack/optimism/packages/contracts-bedrock/test/L1/ETHLockbox.t.sol:366:contract ETHLockbox_UnlockETH_Test is ETHLockbox_TestInit {
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:350:infra/opstack/optimism/packages/contracts-bedrock/test/L1/ETHLockbox.t.sol:368:    function testFuzz_unlockETH_paused_reverts(address _caller, uint256 _value) public {
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:351:infra/opstack/optimism/packages/contracts-bedrock/test/L1/ETHLockbox.t.sol:383:    function testFuzz_unlockETH_unauthorizedPortal_reverts(address _caller, uint256 _value) public {
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:352:infra/opstack/optimism/packages/contracts-bedrock/test/L1/ETHLockbox.t.sol:396:    function testFuzz_unlockETH_insufficientBalance_reverts(uint256 _value) public {
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:353:infra/opstack/optimism/packages/contracts-bedrock/test/L1/ETHLockbox.t.sol:409:    function testFuzz_unlockETH_withdrawalTransaction_reverts(uint256 _value, address _l2Sender) public {
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:354:infra/opstack/optimism/packages/contracts-bedrock/test/L1/ETHLockbox.t.sol:425:    function testFuzz_unlockETH_succeeds(uint256 _value) public {
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:355:infra/opstack/optimism/packages/contracts-bedrock/test/L1/ETHLockbox.t.sol:452:    function testFuzz_unlockETH_multiplePortals_succeeds(IOptimismPortal2 _portal, uint256 _value) public {
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:356:infra/opstack/optimism/packages/contracts-bedrock/test/L1/L1StandardBridge.t.sol:268:    function test_paused_finalizeBridgeETH_reverts() external {
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:357:infra/opstack/optimism/packages/contracts-bedrock/test/L1/L1StandardBridge.t.sol:361:        if (isSysFeatureEnabled(Features.ETH_LOCKBOX)) {
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:358:infra/opstack/optimism/packages/contracts-bedrock/test/L1/L1StandardBridge.t.sol:379:/// @title L1StandardBridge_DepositETH_Test
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:359:infra/opstack/optimism/packages/contracts-bedrock/test/L1/L1StandardBridge.t.sol:381:contract L1StandardBridge_DepositETH_Test is L1StandardBridge_TestInit {
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:360:infra/opstack/optimism/packages/contracts-bedrock/test/L1/L1StandardBridge.t.sol:387:    function test_depositETH_fromEOA_succeeds() external {
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:361:infra/opstack/optimism/packages/contracts-bedrock/test/L1/L1StandardBridge.t.sol:393:        if (isSysFeatureEnabled(Features.ETH_LOCKBOX)) {
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:362:infra/opstack/optimism/packages/contracts-bedrock/test/L1/L1StandardBridge.t.sol:402:    function test_depositETH_fromEOA7702_succeeds() external {
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:363:infra/opstack/optimism/packages/contracts-bedrock/test/L1/L1StandardBridge.t.sol:411:        if (isSysFeatureEnabled(Features.ETH_LOCKBOX)) {
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:364:infra/opstack/optimism/packages/contracts-bedrock/test/L1/L1StandardBridge.t.sol:420:    function test_depositETH_notEoa_reverts() external {
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:365:infra/opstack/optimism/packages/contracts-bedrock/test/L1/L1StandardBridge.t.sol:442:        if (isSysFeatureEnabled(Features.ETH_LOCKBOX)) {
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:366:infra/opstack/optimism/packages/contracts-bedrock/test/L1/L1StandardBridge.t.sol:465:        if (isSysFeatureEnabled(Features.ETH_LOCKBOX)) {
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:367:infra/opstack/optimism/packages/contracts-bedrock/test/L1/L1StandardBridge.t.sol:781:    function test_bridgeETH_succeeds() external {
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:368:infra/opstack/optimism/packages/contracts-bedrock/test/L1/L1StandardBridge.t.sol:787:        if (isSysFeatureEnabled(Features.ETH_LOCKBOX)) {
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:369:infra/opstack/optimism/packages/contracts-bedrock/test/L1/L1StandardBridge.t.sol:806:        if (isSysFeatureEnabled(Features.ETH_LOCKBOX)) {
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:370:infra/opstack/optimism/packages/contracts-bedrock/test/L1/L1StandardBridge.t.sol:815:    function test_finalizeBridgeETH_succeeds() external {
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:371:infra/opstack/optimism/packages/contracts-bedrock/test/L1/L1StandardBridge.t.sol:832:    function test_finalizeBridgeETH_incorrectValue_reverts() external {
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:372:infra/opstack/optimism/packages/contracts-bedrock/test/L1/L1StandardBridge.t.sol:846:    function test_finalizeBridgeETH_sendToSelf_reverts() external {
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:373:infra/opstack/optimism/packages/contracts-bedrock/test/L1/L1StandardBridge.t.sol:860:    function test_finalizeBridgeETH_sendToMessenger_reverts() external {
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:374:infra/opstack/optimism/packages/contracts-bedrock/test/kontrol/proofs/L1StandardBridge.k.sol:46:    function prove_finalizeBridgeETH_paused(
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:376:infra/opstack/optimism/packages/contracts-bedrock/test/kontrol/README.md:28:> KEVM is a tool that enables formal verification of smart contracts on the Ethereum blockchain. It provides a mathe
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:377:infra/opstack/optimism/packages/contracts-bedrock/test/kontrol/scripts/run-kontrol.sh:141:    "L1StandardBridgeKontrol.prove_finalizeBridgeETH_paused" \
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:379:infra/opstack/optimism/packages/contracts-bedrock/test/periphery/AssetReceiver.t.sol:76:/// @title AssetReceiver_WithdrawETH_Test
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:380:infra/opstack/optimism/packages/contracts-bedrock/test/periphery/AssetReceiver.t.sol:78:contract AssetReceiver_WithdrawETH_Test is AssetReceiver_TestInit {
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:381:infra/opstack/optimism/packages/contracts-bedrock/test/periphery/AssetReceiver.t.sol:80:    function test_withdrawETH_succeeds() external {
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:382:infra/opstack/optimism/packages/contracts-bedrock/test/periphery/AssetReceiver.t.sol:102:    function test_withdrawETH_unauthorized_reverts() external {
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:383:infra/opstack/optimism/packages/contracts-bedrock/test/periphery/AssetReceiver.t.sol:109:    function test_withdrawETH_withAmount_succeeds() external {
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:384:infra/opstack/optimism/packages/contracts-bedrock/test/periphery/AssetReceiver.t.sol:130:    function test_withdrawETH_withAmountUnauthorized_reverts() external {
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:385:infra/opstack/optimism/packages/contracts-bedrock/test/setup/Events.sol:112:    event ETHMigrated(address indexed lockbox, uint256 ethBalance);
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:386:infra/opstack/optimism/packages/contracts-bedrock/test/setup/Setup.sol:147:    ISuperchainETHBridge superchainETHBridge = ISuperchainETHBridge(payable(Predeploys.SUPERCHAIN_ETH_BRIDGE));
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:387:infra/opstack/optimism/packages/contracts-bedrock/test/setup/Setup.sol:148:    IETHLiquidity ethLiquidity = IETHLiquidity(Predeploys.ETH_LIQUIDITY);
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:388:infra/opstack/optimism/packages/contracts-bedrock/test/setup/Setup.sol:182:                "Setup: ETH_RPC_URL must be set to a production (Sepolia or Mainnet) RPC URL"
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:389:infra/opstack/optimism/packages/contracts-bedrock/test/setup/Setup.sol:375:        labelPredeploy(Predeploys.SUPERCHAIN_ETH_BRIDGE);
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:390:infra/opstack/optimism/packages/contracts-bedrock/test/setup/Setup.sol:376:        labelPredeploy(Predeploys.ETH_LIQUIDITY);
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:391:infra/opstack/optimism/packages/contracts-bedrock/test/libraries/GasPayingToken.t.sol:29:    /// @notice Test that the gas paying token returns values associated with Ether when unset.
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:392:infra/opstack/optimism/packages/contracts-bedrock/test/libraries/GasPayingToken.t.sol:35:        assertEq("Ether", GasPayingToken.getName());
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:393:infra/opstack/optimism/packages/contracts-bedrock/test/L2/WETH.t.sol:7:/// @title WETH_Name_Test
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:394:infra/opstack/optimism/packages/contracts-bedrock/test/L2/WETH.t.sol:9:contract WETH_Name_Test is CommonTest {
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:395:infra/opstack/optimism/packages/contracts-bedrock/test/L2/WETH.t.sol:17:    /// @notice Tests that the `name` function returns 'Wrapped Ether' by default.
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:396:infra/opstack/optimism/packages/contracts-bedrock/test/L2/WETH.t.sol:18:    function test_name_ether_succeeds() external view {
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:397:infra/opstack/optimism/packages/contracts-bedrock/test/L2/WETH.t.sol:19:        assertEq("Wrapped Ether", weth.name());
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:398:infra/opstack/optimism/packages/contracts-bedrock/test/L2/WETH.t.sol:23:/// @title WETH_Symbol_Test
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:399:infra/opstack/optimism/packages/contracts-bedrock/test/L2/WETH.t.sol:25:contract WETH_Symbol_Test is CommonTest {
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:400:infra/opstack/optimism/packages/contracts-bedrock/test/L2/WETH.t.sol:36:    function test_symbol_ether_succeeds() external view {
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:401:infra/opstack/optimism/packages/contracts-bedrock/test/L2/L2StandardBridge.t.sol:325:    function test_withdraw_ether_succeeds() external {
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:402:infra/opstack/optimism/packages/contracts-bedrock/test/L2/L2StandardBridge.t.sol:441:    function test_finalizeBridgeETH_sendToSelf_reverts() external {
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:403:infra/opstack/optimism/packages/contracts-bedrock/test/L2/L2StandardBridge.t.sol:454:    function test_finalizeBridgeETH_sendToMessenger_reverts() external {
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:404:infra/opstack/optimism/packages/contracts-bedrock/test/L2/L2StandardBridge.t.sol:467:    function testFuzz_bridgeETH_succeeds(uint256 _value, uint32 _minGasLimit, bytes calldata _extraData) ex
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:405:infra/opstack/optimism/packages/contracts-bedrock/test/L2/L2StandardBridge.t.sol:537:    function test_finalizeBridgeETH_succeeds() external {
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:406:infra/opstack/optimism/packages/contracts-bedrock/test/L2/L1Block.t.sol:53:        assertEq("Ether", l1Block.gasPayingTokenName());
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:407:infra/opstack/optimism/packages/contracts-bedrock/test/L2/SuperchainETHBridge.t.sol:44:/// @title SuperchainETHBridge_SendETH_Test
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:408:infra/opstack/optimism/packages/contracts-bedrock/test/L2/SuperchainETHBridge.t.sol:46:contract SuperchainETHBridge_SendETH_Test is SuperchainETHBridge_TestInit {
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:409:infra/opstack/optimism/packages/contracts-bedrock/test/L2/SuperchainETHBridge.t.sol:48:    function testFuzz_sendETH_zeroAddressTo_reverts(address _sender, uint256 _amount, uint256 _chainId) p
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:410:infra/opstack/optimism/packages/contracts-bedrock/test/L2/SuperchainETHBridge.t.sol:60:    function testFuzz_sendETH_succeeds(
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:411:infra/opstack/optimism/packages/contracts-bedrock/test/L2/SuperchainETHBridge.t.sol:86:        vm.expectCall(Predeploys.ETH_LIQUIDITY, abi.encodeCall(IETHLiquidity.burn, ()), 1);
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:412:infra/opstack/optimism/packages/contracts-bedrock/test/L2/SuperchainETHBridge.t.sol:108:/// @title SuperchainETHBridge_RelayETH_Test
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:413:infra/opstack/optimism/packages/contracts-bedrock/test/L2/SuperchainETHBridge.t.sol:110:contract SuperchainETHBridge_RelayETH_Test is SuperchainETHBridge_TestInit {
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:414:infra/opstack/optimism/packages/contracts-bedrock/test/L2/SuperchainETHBridge.t.sol:113:    function testFuzz_relayETH_notMessenger_reverts(address _caller, address _to, uint256 _amount) publi
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:415:infra/opstack/optimism/packages/contracts-bedrock/test/L2/SuperchainETHBridge.t.sol:127:    function testFuzz_relayETH_notCrossDomainSender_reverts(
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:416:infra/opstack/optimism/packages/contracts-bedrock/test/L2/SuperchainETHBridge.t.sol:154:    function testFuzz_relayETH_succeeds(address _from, address _to, uint256 _amount, uint256 _source) pu
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:417:infra/opstack/optimism/packages/contracts-bedrock/test/L2/SuperchainETHBridge.t.sol:162:        vm.deal(Predeploys.ETH_LIQUIDITY, _amount);
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:418:infra/opstack/optimism/packages/contracts-bedrock/test/L2/SuperchainETHBridge.t.sol:176:        vm.expectCall(Predeploys.ETH_LIQUIDITY, abi.encodeCall(IETHLiquidity.mint, (_amount)), 1);
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:419:infra/opstack/optimism/packages/contracts-bedrock/test/universal/WETH98.t.sol:183:        assertEq(weth.name(), "Wrapped Ether");
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:420:infra/opstack/optimism/packages/contracts-bedrock/test/dispute/FaultDisputeGame.t.sol:648:    function test_initialize_receivesETH_succeeds() public {
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:421:infra/opstack/optimism/packages/contracts-bedrock/test/dispute/SuperFaultDisputeGame.t.sol:504:    function test_initialize_receivesETH_succeeds() public {
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:422:infra/opstack/optimism/packages/contracts-bedrock/test/dispute/DelayedWETH.t.sol:18:/// @title DelayedWETH_FallbackGasUser_Harness
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:423:infra/opstack/optimism/packages/contracts-bedrock/test/dispute/DelayedWETH.t.sol:20:contract DelayedWETH_FallbackGasUser_Harness {
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:424:infra/opstack/optimism/packages/contracts-bedrock/test/dispute/DelayedWETH.t.sol:40:/// @title DelayedWETH_FallbackReverter_Harness
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:425:infra/opstack/optimism/packages/contracts-bedrock/test/dispute/DelayedWETH.t.sol:42:contract DelayedWETH_FallbackReverter_Harness {
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:426:infra/opstack/optimism/packages/contracts-bedrock/test/dispute/DelayedWETH.t.sol:54:/// @title DelayedWETH_TestInit
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:427:infra/opstack/optimism/packages/contracts-bedrock/test/dispute/DelayedWETH.t.sol:56:contract DelayedWETH_TestInit is CommonTest {
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:428:infra/opstack/optimism/packages/contracts-bedrock/test/dispute/DelayedWETH.t.sol:68:/// @title DelayedWETH_Initialize_Test
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:429:infra/opstack/optimism/packages/contracts-bedrock/test/dispute/DelayedWETH.t.sol:70:contract DelayedWETH_Initialize_Test is DelayedWETH_TestInit {
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:430:infra/opstack/optimism/packages/contracts-bedrock/test/dispute/DelayedWETH.t.sol:115:/// @title DelayedWETH_Unlock_Test
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:431:infra/opstack/optimism/packages/contracts-bedrock/test/dispute/DelayedWETH.t.sol:117:contract DelayedWETH_Unlock_Test is DelayedWETH_TestInit {
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:432:infra/opstack/optimism/packages/contracts-bedrock/test/dispute/DelayedWETH.t.sol:146:/// @title DelayedWETH_Withdraw_Test
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:433:infra/opstack/optimism/packages/contracts-bedrock/test/dispute/DelayedWETH.t.sol:148:contract DelayedWETH_Withdraw_Test is DelayedWETH_TestInit {
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:434:infra/opstack/optimism/packages/contracts-bedrock/test/dispute/DelayedWETH.t.sol:354:/// @title DelayedWETH_Recover_Test
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:435:infra/opstack/optimism/packages/contracts-bedrock/test/dispute/DelayedWETH.t.sol:356:contract DelayedWETH_Recover_Test is DelayedWETH_TestInit {
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:436:infra/opstack/optimism/packages/contracts-bedrock/test/dispute/DelayedWETH.t.sol:368:        DelayedWETH_FallbackGasUser_Harness gasUser = new DelayedWETH_FallbackGasUser_Harness(_fallbackGasU
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:437:infra/opstack/optimism/packages/contracts-bedrock/test/dispute/DelayedWETH.t.sol:421:        DelayedWETH_FallbackReverter_Harness reverter = new DelayedWETH_FallbackReverter_Harness();
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:438:infra/opstack/optimism/packages/contracts-bedrock/test/dispute/DelayedWETH.t.sol:436:/// @title DelayedWETH_Hold_Test
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:439:infra/opstack/optimism/packages/contracts-bedrock/test/dispute/DelayedWETH.t.sol:438:contract DelayedWETH_Hold_Test is DelayedWETH_TestInit {
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:440:infra/opstack/optimism/packages/contracts-bedrock/test/invariants/Burn.Eth.t.sol:65:    function invariant_burn_eth() external view {
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:441:infra/opstack/optimism/packages/contracts-bedrock/test/invariants/ETHLiquidity.t.sol:34:        vm.deal(Predeploys.SUPERCHAIN_ETH_BRIDGE, _balance);
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:442:infra/opstack/optimism/packages/contracts-bedrock/test/invariants/ETHLiquidity.t.sol:40:        vm.prank(Predeploys.SUPERCHAIN_ETH_BRIDGE);
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:443:infra/opstack/optimism/packages/contracts-bedrock/test/invariants/ETHLiquidity.t.sol:47:        vm.prank(Predeploys.SUPERCHAIN_ETH_BRIDGE);
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:444:infra/opstack/optimism/packages/contracts-bedrock/test/safe/SafeSigners.t.sol:74:                (v, r, s) = vm.sign(pks[i], keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", dige
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:445:infra/opstack/optimism/op-devstack/README.md:160:- `OP_RETH_EXEC_PATH=/home/USERHERE/projects/reth/target/release/op-reth` to select the op-reth executable to run
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:446:infra/opstack/optimism/op-devstack/README.md:164:- `SYSGO_GETH_EXEC_PATH=/path/to/geth` to select the geth executable to run
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:447:infra/opstack/optimism/op-service/README.md:23:├── eth             - Common Ethereum data types and OP-Stack extension types
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:448:infra/opstack/optimism/op-service/README.md:50:├── testutils       - Simplified Ethereum types, mock RPC bindings, utils for testing.
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:449:infra/opstack/optimism/op-service/sources/testdata/gen.sh:6:export ETH_RPC_URL=https://ethereum-goerli-rpc.allthatnode.com
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:450:infra/opstack/optimism/op-challenger/README.md:86:  --l1-eth-rpc <L1_ETH_RPC> \
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:451:infra/opstack/optimism/op-challenger/README.md:96:* `L1_ETH_RPC` - the RPC endpoint of the L1 endpoint to use (e.g. `http://localhost:8545`).
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:452:infra/opstack/optimism/op-challenger/README.md:115:  --l1-eth-rpc <L1_ETH_RPC> \
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:453:infra/opstack/optimism/op-challenger/README.md:125:* `L1_ETH_RPC` - the RPC endpoint of the L1 endpoint to use (e.g. `http://localhost:8545`).
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:454:infra/opstack/optimism/op-challenger/README.md:141:  --l1-eth-rpc <L1_ETH_RPC> \
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:455:infra/opstack/optimism/op-challenger/README.md:150:* `L1_ETH_RPC` - the RPC endpoint of the L1 endpoint to use (e.g. `http://localhost:8545`).
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:456:infra/opstack/optimism/op-challenger/README.md:159:  --l1-eth-rpc <L1_ETH_RPC> \
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:457:infra/opstack/optimism/op-challenger/README.md:168:* `L1_ETH_RPC` - the RPC endpoint of the L1 endpoint to use (e.g. `http://localhost:8545`).
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:458:infra/opstack/optimism/op-challenger/README.md:176:  --l1-eth-rpc <L1_ETH_RPC> \
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:459:infra/opstack/optimism/op-challenger/README.md:182:* `L1_ETH_RPC` - the RPC endpoint of the L1 endpoint to use (e.g. `http://localhost:8545`).
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:460:infra/opstack/optimism/op-challenger/README.md:192:  --l1-eth-rpc <L1_ETH_RPC> \
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:461:infra/opstack/optimism/op-challenger/README.md:198:* `L1_ETH_RPC` - the RPC endpoint of the L1 endpoint to use (e.g. `http://localhost:8545`).
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:462:infra/opstack/optimism/op-challenger/README.md:206:  --l1-eth-rpc=<L1_ETH_RPC> \
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:463:infra/opstack/optimism/op-challenger/README.md:208:  --l2-eth-rpc=<L2_ETH_RPC> \
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:464:infra/opstack/optimism/op-challenger/README.md:216:* `L1_ETH_RPC` - the RPC endpoint of the L1 endpoint to use (e.g. `http://localhost:8545`).
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:465:infra/opstack/optimism/op-challenger/README.md:218:* `L2_ETH_RPC` - the RPC endpoint of the L2 execution client to use
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:470:infra/opstack/optimism/.circleci/config.yml:1147:            ETH_RPC_URL: https://ci-mainnet-l1-archive.optimism.io
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:471:infra/opstack/optimism/.circleci/config.yml:1155:            ETH_RPC_URL: https://ci-mainnet-l1-archive.optimism.io
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:472:infra/opstack/optimism/.circleci/config.yml:1229:            ETH_RPC_URL: <<parameters.fork_base_rpc>>
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:473:infra/opstack/optimism/.circleci/config.yml:1242:            ETH_RPC_URL: <<parameters.fork_base_rpc>>
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:475:infra/opstack/op-geth/appveyor.yml:10:    - GETH_ARCH: amd64
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:476:infra/opstack/op-geth/appveyor.yml:11:      GETH_MINGW: 'C:\msys64\mingw64'
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:477:infra/opstack/op-geth/appveyor.yml:12:    - GETH_ARCH: 386
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:478:infra/opstack/op-geth/appveyor.yml:13:      GETH_MINGW: 'C:\msys64\mingw32'
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:479:infra/opstack/op-geth/appveyor.yml:37:          GETH_ARCH: 386
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:480:infra/opstack/op-geth/appveyor.yml:47:      GETH_CC: '%GETH_MINGW%\bin\gcc.exe'
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:481:infra/opstack/op-geth/appveyor.yml:48:      PATH: '%GETH_MINGW%\bin;C:\Program Files (x86)\NSIS\;%PATH%'
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:482:infra/opstack/op-geth/appveyor.yml:50:      - 'echo %GETH_ARCH%'
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:483:infra/opstack/op-geth/appveyor.yml:51:      - 'echo %GETH_CC%'
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:484:infra/opstack/op-geth/appveyor.yml:52:      - '%GETH_CC% --version'
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:485:infra/opstack/op-geth/appveyor.yml:53:      - go run build/ci.go install -dlgo -arch %GETH_ARCH% -cc %GETH_CC%
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:486:infra/opstack/op-geth/appveyor.yml:56:      - go run build/ci.go archive -arch %GETH_ARCH% -type zip -signer WINDOWS_SIGNING_KEY -upload gethstore/builds
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:487:infra/opstack/op-geth/appveyor.yml:57:      - go run build/ci.go nsis -arch %GETH_ARCH% -signer WINDOWS_SIGNING_KEY -upload gethstore/builds
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:488:infra/opstack/op-geth/appveyor.yml:59:      - go run build/ci.go test -dlgo -arch %GETH_ARCH% -cc %GETH_CC% -short
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:489:infra/opstack/op-geth/README.md:1:## Go Ethereum
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:490:infra/opstack/op-geth/README.md:3:Golang execution layer implementation of the Ethereum protocol.
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:491:infra/opstack/op-geth/README.md:11:[![Twitter](https://img.shields.io/twitter/follow/go_ethereum)](https://x.com/go_ethereum)
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:492:infra/opstack/op-geth/README.md:40:| **`geth`** | Our main Ethereum CLI client. It is the entry point into the Ethereum network (main-, test- or private net), capable of running as a full node
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:493:infra/opstack/op-geth/README.md:43:|  `abigen`  | Source code generator to convert Ethereum contract definitions into easy-to-use, compile-time type-safe Go packages. It operates on plain [Eth
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:494:infra/opstack/op-geth/README.md:44:|   `evm`    | Developer utility version of the EVM (Ethereum Virtual Machine) that is capable of running bytecode snippets within a configurable environment
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:495:infra/opstack/op-geth/README.md:45:| `rlpdump`  | Developer utility tool to convert binary RLP ([Recursive Length Prefix](https://ethereum.org/en/developers/docs/data-structures-and-encoding/r
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:496:infra/opstack/op-geth/README.md:70:### Full node on the main Ethereum network
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:497:infra/opstack/op-geth/README.md:72:By far the most common scenario is people wanting to simply interact with the Ethereum
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:498:infra/opstack/op-geth/README.md:84:   of the Ethereum network, which is very CPU intensive.
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:499:infra/opstack/op-geth/README.md:94:Transitioning towards developers, if you'd like to play around with creating Ethereum
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:500:infra/opstack/op-geth/README.md:98:the main network, but with play-Ether only.
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:501:infra/opstack/op-geth/README.md:109: * Instead of connecting to the main Ethereum network, the client will connect to the Holesky 
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:502:infra/opstack/op-geth/README.md:144:One of the quickest ways to get Ethereum up and running on your machine is by using
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:503:infra/opstack/op-geth/README.md:165:Ethereum network via your own programs and not manually through the console. To aid
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:504:infra/opstack/op-geth/README.md:198:Ethereum nodes with exposed APIs! Further, all browser tabs can access locally
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:505:infra/opstack/op-geth/docs/postmortems/2021-08-22-split-postmortem.md:3:This is a post-mortem concerning the minority split that occurred on Ethereum mainnet on block [13107518](https://ghost
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:506:infra/opstack/op-geth/docs/postmortems/2021-08-22-split-postmortem.md:92:> The primary goal for the Geth team is the health of the Ethereum network as a whole, and the decision whether or not 
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:507:infra/opstack/op-geth/docs/postmortems/2021-08-22-split-postmortem.md:131:- [1] https://twitter.com/go_ethereum/status/1428051458763763721
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:508:infra/opstack/op-geth/docs/postmortems/2021-08-22-split-postmortem.md:150:https://twitter.com/go_ethereum/status/1428051458763763721
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:510:infra/opstack/op-geth/internal/jsre/deps/web3.js:929:    BigNumber.config(c.ETH_BIGNUMBER_ROUNDING_MODE);
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:511:infra/opstack/op-geth/internal/jsre/deps/web3.js:1761:/// required to define ETH_BIGNUMBER_ROUNDING_MODE
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:512:infra/opstack/op-geth/internal/jsre/deps/web3.js:1764:var ETH_UNITS = [
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:513:infra/opstack/op-geth/internal/jsre/deps/web3.js:1795:    ETH_PADDING: 32,
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:514:infra/opstack/op-geth/internal/jsre/deps/web3.js:1796:    ETH_SIGNATURE_LENGTH: 4,
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:515:infra/opstack/op-geth/internal/jsre/deps/web3.js:1797:    ETH_UNITS: ETH_UNITS,
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:516:infra/opstack/op-geth/internal/jsre/deps/web3.js:1798:    ETH_BIGNUMBER_ROUNDING_MODE: { ROUNDING_MODE: BigNumber.ROUND_DOWN },
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:517:infra/opstack/op-geth/internal/jsre/deps/web3.js:1799:    ETH_POLLING_TIMEOUT: 1000/2,
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:518:infra/opstack/op-geth/internal/jsre/deps/web3.js:2412: * Returns true if given string is a valid Ethereum block header bloom.
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:519:infra/opstack/op-geth/internal/jsre/deps/web3.js:2843:        return new SolidityFunction(contract._eth, json, contract.address);
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:520:infra/opstack/op-geth/internal/jsre/deps/web3.js:2861:    var All = new AllEvents(contract._eth._requestManager, events, contract.address);
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:521:infra/opstack/op-geth/internal/jsre/deps/web3.js:2865:        return new SolidityEvent(contract._eth._requestManager, json, contract.address);
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:522:infra/opstack/op-geth/internal/jsre/deps/web3.js:2885:    var filter = contract._eth.filter('latest', function(e){
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:523:infra/opstack/op-geth/internal/jsre/deps/web3.js:2903:                contract._eth.getTransactionReceipt(contract.transactionHash, function(e, receipt){
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:524:infra/opstack/op-geth/internal/jsre/deps/web3.js:2906:                        contract._eth.getCode(receipt.contractAddress, function(e, code){
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:531:docs/autonomy/ports-and-endpoints.md:1660:  - ports: ${L3_HOST_RPC:-39545}:8545, ${L3_HOST_WS:-39548}:8546, ${L3_GETH_METRICS_HOST_PORT:-39606}:${L3_GETH_METRICS_PORT:-6060}
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:532:docs/autonomy/ports-and-endpoints.md:1824:  - ports: ${L3_HOST_RPC:-39545}:8545, ${L3_HOST_WS:-39548}:8546, ${L3_GETH_METRICS_HOST_PORT:-39606}:${L3_GETH_METRICS_PORT:-6060}
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:533:docs/autonomy/ports-and-endpoints.md:1988:  - ports: ${L3_HOST_RPC:-39545}:8545, ${L3_HOST_WS:-39548}:8546, ${L3_GETH_METRICS_HOST_PORT:-39606}:${L3_GETH_METRICS_PORT:-6060}
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:534:docs/autonomy/ports-and-endpoints.md:2152:  - ports: ${L3_HOST_RPC:-39545}:8545, ${L3_HOST_WS:-39548}:8546, ${L3_GETH_METRICS_HOST_PORT:-39606}:${L3_GETH_METRICS_PORT:-6060}
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:535:docs/autonomy/ports-and-endpoints.md:2310:  - ports: ${L3_HOST_RPC:-39545}:8545, ${L3_HOST_WS:-39548}:8546, ${L3_GETH_METRICS_HOST_PORT:-39606}:${L3_GETH_METRICS_PORT:-6060}
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:536:docs/autonomy/ports-and-endpoints.md:2468:  - ports: ${L3_HOST_RPC:-39545}:8545, ${L3_HOST_WS:-39548}:8546, ${L3_GETH_METRICS_HOST_PORT:-39606}:${L3_GETH_METRICS_PORT:-6060}
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:537:docs/autonomy/ports-and-endpoints.md:2626:  - ports: ${L3_HOST_RPC:-39545}:8545, ${L3_HOST_WS:-39548}:8546, ${L3_GETH_METRICS_HOST_PORT:-39606}:${L3_GETH_METRICS_PORT:-6060}
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:538:docs/autonomy/ports-and-endpoints.md:2784:  - ports: ${L3_HOST_RPC:-39545}:8545, ${L3_HOST_WS:-39548}:8546, ${L3_GETH_METRICS_HOST_PORT:-39606}:${L3_GETH_METRICS_PORT:-6060}
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:539:docs/autonomy/ports-and-endpoints.md:2942:  - ports: ${L3_HOST_RPC:-39545}:8545, ${L3_HOST_WS:-39548}:8546, ${L3_GETH_METRICS_HOST_PORT:-39606}:${L3_GETH_METRICS_PORT:-6060}
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:540:docs/autonomy/ports-and-endpoints.md:3122:  - ports: ${L3_HOST_RPC:-39545}:8545, ${L3_HOST_WS:-39548}:8546, ${L3_GETH_METRICS_HOST_PORT:-39606}:${L3_GETH_METRICS_PORT:-6060}
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:541:docs/l3/reliability.md:38:- `l3-geth` metrics on `L3_GETH_METRICS_HOST_PORT` (default 39606)
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:542:docs/gst-migration/RENAME-MAP.md:6:- ETH_ADDR -> GST_ADDR
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:543:docs/gst-migration/RENAME-MAP.md:7:- ETH_ADDRESS -> GST_ADDRESS
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:544:docs/gst-migration/RENAME-MAP.md:8:- ETH_ASSET -> GST_ASSET
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:545:docs/gst-migration/RENAME-MAP.md:9:- ETH_ASSET_DATA -> GST_ASSET_DATA
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:546:docs/gst-migration/RENAME-MAP.md:10:- ETH_BIGNUMBER_ROUNDING_MODE -> GST_BIGNUMBER_ROUNDING_MODE
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:547:docs/gst-migration/RENAME-MAP.md:11:- ETH_BLK_MULTIPLIER -> GST_BLK_MULTIPLIER
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:548:docs/gst-migration/RENAME-MAP.md:12:- ETH_CAP -> GST_CAP
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:549:docs/gst-migration/RENAME-MAP.md:13:- ETH_CLEAR -> GST_CLEAR
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:550:docs/gst-migration/RENAME-MAP.md:14:- ETH_CONTRACT_ADDRESS -> GST_CONTRACT_ADDRESS
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:551:docs/gst-migration/RENAME-MAP.md:15:- ETH_CRWDTOKEN -> GST_CRWDTOKEN
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:552:docs/gst-migration/RENAME-MAP.md:16:- ETH_DECIMALS -> GST_DECIMALS
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:553:docs/gst-migration/RENAME-MAP.md:17:- ETH_DECIMALS_FACTOR -> GST_DECIMALS_FACTOR
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:554:docs/gst-migration/RENAME-MAP.md:18:- ETH_DEPS -> GST_DEPS
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:555:docs/gst-migration/RENAME-MAP.md:19:- ETH_EUR -> GST_EUR
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:556:docs/gst-migration/RENAME-MAP.md:20:- ETH_EURCENT -> GST_EURCENT
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:557:docs/gst-migration/RENAME-MAP.md:21:- ETH_FUND -> GST_FUND
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:558:docs/gst-migration/RENAME-MAP.md:22:- ETH_FUND_DEPOSIT -> GST_FUND_DEPOSIT
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:559:docs/gst-migration/RENAME-MAP.md:23:- ETH_HARD_CAP -> GST_HARD_CAP
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:560:docs/gst-migration/RENAME-MAP.md:24:- ETH_HEROCOIN -> GST_HEROCOIN
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:561:docs/gst-migration/RENAME-MAP.md:25:- ETH_ILK -> GST_ILK
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:562:docs/gst-migration/RENAME-MAP.md:26:- ETH_JOIN_ADDRESS -> GST_JOIN_ADDRESS
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:563:docs/gst-migration/RENAME-MAP.md:27:- ETH_JWT_SECRET -> GST_JWT_SECRET
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:564:docs/gst-migration/RENAME-MAP.md:28:- ETH_LIMIT -> GST_LIMIT
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:565:docs/gst-migration/RENAME-MAP.md:29:- ETH_LIQUIDITY -> GST_LIQUIDITY
docs/gst-migration/ETH-LEAKAGE-INVENTORY.md:566:docs/gst-migration/RENAME-MAP.md:30:- ETH_LOCKBOX -> GST_LOCKBOX

## config
(no matches)

## environments
(no matches)

## scripts
scripts/gst-leakage-gate.sh:52:PATTERN='(\bETH\b|(?i:\bethereum\b)|\bEther\b|Ξ|(?i:\b[a-z0-9-]+\.eth\b)|\bETH_[A-Z0-9_]+\b|\b[A-Z0-9_]+_ETH\b|\b[A-Za-z0-9]+_eth\b|\bnativeEth\b|\bethAmount\b|\bethBalance\b|\bETH_DECIMALS\b|\bghostCAN\b|\b

## tools
(no matches)

## core-service
(no matches)

## contracts
contracts/src/governance/constitutions/GSTConstitution.sol:10:    bytes32 public constant CLAUSE_NO_ETH_BRANDING = keccak256("ghost.constitution.no_eth_branding.v1");
contracts/typechain-types/factories/governance/constitutions/GSTConstitution__factory.ts:33:    name: "CLAUSE_NO_ETH_BRANDING",
contracts/typechain-types/governance/constitutions/GSTConstitution.ts:26:      | "CLAUSE_NO_ETH_BRANDING"
contracts/typechain-types/governance/constitutions/GSTConstitution.ts:38:    functionFragment: "CLAUSE_NO_ETH_BRANDING",
contracts/typechain-types/governance/constitutions/GSTConstitution.ts:63:    functionFragment: "CLAUSE_NO_ETH_BRANDING",
contracts/typechain-types/governance/constitutions/GSTConstitution.ts:129:  CLAUSE_NO_ETH_BRANDING: TypedContractMethod<[], [string], "view">;
contracts/typechain-types/governance/constitutions/GSTConstitution.ts:147:    nameOrSignature: "CLAUSE_NO_ETH_BRANDING"
contracts/license-report.json:36:    "publisher": "EthereumJS Team",
contracts/license-report.json:43:    "publisher": "EthereumJS Team",
