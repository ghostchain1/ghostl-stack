# @ghostchain/sdk

**GhostChain Sovereign SDK** — a zero-ethers, production-grade TypeScript SDK for interacting with GhostChain L1, GhostL2, and GhostL3 networks.

- No ethers.js or web3.js dependency
- Native cryptography via `@noble/curves` + `@noble/hashes`
- Full TypeScript with strict types and branded primitives
- GST gas token support across all three layers
- AI-assisted transaction planning, gas optimization, and cross-chain routing
- ERC-20 / ERC-721 / ERC-1155 token support
- Smart account and account abstraction support
- Ghost Name Service (GNS) resolver
- GhostBrain AI consensus client

---

## Installation

```bash
# From within the monorepo:
pnpm add @ghostchain/sdk
```

Node.js `>=22.21.0 <23` is required.

---

## Quick Start

```ts
import { GhostPublicClient } from '@ghostchain/sdk/clients';
import { GhostRpcClient, createGhostL1RpcClient } from '@ghostchain/sdk/rpc';

// Connect to L1
const rpc = createGhostL1RpcClient();
const blockNumber = await rpc.getBlockNumber();
console.log('L1 block:', blockNumber);

// Sign and send a transaction
import { GhostSigner } from '@ghostchain/sdk/wallet';
const signer = GhostSigner.fromPrivateKey('0xYOUR_PRIVATE_KEY');
const address = signer.address; // GhostAddress

import { GhostGasTracker } from '@ghostchain/sdk/gas';
const gasTracker = new GhostGasTracker(rpc);
const estimate = await gasTracker.getGasEstimate('standard');
```

---

## Sub-path Exports

All modules are available as sub-path imports. Import only what you need.

### Core layer

| Import path | Key exports | Description |
|---|---|---|
| `@ghostchain/sdk` | everything | Full barrel export |
| `@ghostchain/sdk/types` | all SDK types | Central type barrel |
| `@ghostchain/sdk/native` | hex, bytes, keccak, address, abi, rlp | Zero-dep native crypto utilities |

### Cryptography primitives

| Import path | Key exports | Description |
|---|---|---|
| `@ghostchain/sdk/hash` | `keccak256`, `sha256`, `sha512`, `solidityKeccak256`, `eventTopic`, `functionSelector`, `GHOST_TOPICS`, `GHOST_EMPTY_HASH` | Hash functions |
| `@ghostchain/sdk/address` | `GHOST_ZERO_ADDRESS`, `GHOST_DEAD_ADDRESS`, `isZeroAddress`, `addressEqual`, `getCreateAddress`, `getCreate2Address`, `shortenAddress` | Address utilities |
| `@ghostchain/sdk/signature` | `splitSignature`, `joinSignature`, `recoverAddress`, `recoverPersonalSignAddress`, `verifySignature`, `personalSignHash`, `compactToFull`, `fullToCompact` | Signature tools |
| `@ghostchain/sdk/abi` | `encodeCall`, `functionSelector`, `abiSignature`, `decodeReturnData`, `decodeUint256`, `decodeAddress`, `decodeBool`, `decodeString` | ABI encode/decode |

### Blockchain connectivity

| Import path | Key exports | Description |
|---|---|---|
| `@ghostchain/sdk/rpc` | `GhostRpcClient`, `GhostRpcError`, `createGhostL1RpcClient`, `createGhostL2RpcClient`, `createGhostL3RpcClient` | JSON-RPC client with retry + failover |
| `@ghostchain/sdk/providers` | `HttpProvider`, `WebSocketProvider` | Low-level provider layer |
| `@ghostchain/sdk/clients` | `GhostPublicClient`, `GhostWalletClient`, `GhostContractClient` | High-level typed chain clients |
| `@ghostchain/sdk/core` | `GhostClient` | Unified entry-point client |

### Block & nonce management

| Import path | Key exports | Description |
|---|---|---|
| `@ghostchain/sdk/blockNumber` | `GhostBlockNumber`, `GHOST_BLOCK_SENTINEL`, `GHOST_GENESIS_BLOCK`, `GhostBlockNumberWatcher`, `GhostMultiLayerBlockTracker`, `getGhostBlockNumber` | Branded block number type and watchers |
| `@ghostchain/sdk/nonce` | `GhostNonceManager`, `BoundNonceManager` | Concurrent-safe nonce management |

### Gas

| Import path | Key exports | Description |
|---|---|---|
| `@ghostchain/sdk/gas` | `GhostGasTracker`, `formatWei`, `formatGwei`, `parseGhost`, `parseGwei`, `GhostGasSnapshot`, `GhostGasEstimate`, `GhostSpeedPreset` | GST/EIP-1559 gas estimation |

### Wallet & signing

| Import path | Key exports | Description |
|---|---|---|
| `@ghostchain/sdk/wallet` | `GhostSigner`, `GhostAccount`, `GhostKeyStore` | Core signing layer |
| `@ghostchain/sdk/wallet/hd` | `GhostHDWallet` | BIP-32/39 HD wallet |
| `@ghostchain/sdk/accounts` | `SmartAccount`, `AccountAbstraction` | ERC-4337 smart accounts |

### Transactions

| Import path | Key exports | Description |
|---|---|---|
| `@ghostchain/sdk/transaction` | `GhostTxBuilder` | Transaction builder DSL |

### Contracts

| Import path | Key exports | Description |
|---|---|---|
| `@ghostchain/sdk/token/erc20` | `GhostERC20` | ERC-20 with Transfer events and calldata builders |
| `@ghostchain/sdk/token/erc721` | `GhostERC721` | ERC-721 NFT module |
| `@ghostchain/sdk/token/erc1155` | `GhostERC1155` | ERC-1155 multi-token module |
| `@ghostchain/sdk/multicall` | `MulticallClient` | Multicall3 batching |

### Bridge & cross-chain

| Import path | Key exports | Description |
|---|---|---|
| `@ghostchain/sdk/bridge/client` | `GhostBridgeClient` | L1↔L2↔L3 bridge operations |
| `@ghostchain/sdk/routing` | `GhostCrossChainRouter` | Optimal cross-chain path routing |

### Events & subscriptions

| Import path | Key exports | Description |
|---|---|---|
| `@ghostchain/sdk/events` | `BlockWatcher`, `LogWatcher` | Real-time chain event subscriptions |

### Observability & tooling

| Import path | Key exports | Description |
|---|---|---|
| `@ghostchain/sdk/explorer` | `GhostExplorerClient` | Block explorer queries |
| `@ghostchain/sdk/validator` | `GhostRPCMonitor` | RPC health and validator monitoring |
| `@ghostchain/sdk/utils` | hex/bytes/address/hash/gas utilities | Convenience barrel |

### AI modules

| Import path | Key exports | Description |
|---|---|---|
| `@ghostchain/sdk/ai` | `GhostAIGasOptimizer` | AI-based gas prediction |
| `@ghostchain/sdk/ghostbrain` | `GhostBrainClient` | GhostBrain AI consensus integration |

### Infrastructure

| Import path | Key exports | Description |
|---|---|---|
| `@ghostchain/sdk/networks` | network configs, chain IDs | L1/L2/L3 network definitions |
| `@ghostchain/sdk/registry` | `GhostNetworkRegistry` | Dynamic network registry |
| `@ghostchain/sdk/security` | `GhostSecurity` | Security guards and validators |
| `@ghostchain/sdk/gns` | `GNSResolver` | Ghost Name Service (.ghost domains) |
| `@ghostchain/sdk/next` | `useGhostWallet` | Next.js React hook |

---

## Chain Configuration

| Layer | Chain ID | Default RPC | Description |
|---|---|---|---|
| GhostChain L1 | `14000101` | `http://localhost:18545` | Main L1 (EVM, IBFT consensus) |
| GhostL2 | `901` | `http://localhost:29547` | OP-Stack rollup on L1 |
| GhostL3 | `903` | `http://localhost:39545` | OP-Stack rollup on L2 |

---

## Usage Examples

### Read token balance (ERC-20)

```ts
import { GhostERC20 } from '@ghostchain/sdk/token/erc20';
import { createGhostL1RpcClient } from '@ghostchain/sdk/rpc';

const rpc = createGhostL1RpcClient();
const gst = new GhostERC20('0x5FbDB2315678afecb367f032d93F642f64180aa3', rpc);

const balance = await gst.balanceOf('0xYOUR_ADDRESS');
const decimals = await gst.decimals();
const symbol = await gst.symbol();
console.log(`${symbol}: ${balance}`);
```

### Gas estimation with speed presets

```ts
import { GhostGasTracker } from '@ghostchain/sdk/gas';
import { createGhostL2RpcClient } from '@ghostchain/sdk/rpc';

const rpc = createGhostL2RpcClient();
const gasTracker = new GhostGasTracker(rpc);

const fast = await gasTracker.getGasEstimate('fast');
const standard = await gasTracker.getGasEstimate('standard');
const slow = await gasTracker.getGasEstimate('slow');
```

### Hashing and ABI encoding

```ts
import { keccak256, solidityKeccak256, eventTopic } from '@ghostchain/sdk/hash';
import { encodeCall, functionSelector } from '@ghostchain/sdk/abi';

const selector = functionSelector('transfer(address,uint256)');
const topic = eventTopic('Transfer(address,address,uint256)');

const calldata = encodeCall('balanceOf(address)', [
  { type: 'address' }
], ['0xYOUR_ADDRESS']);
```

### Block number tracking

```ts
import { GhostBlockNumberWatcher, getGhostBlockNumber } from '@ghostchain/sdk/blockNumber';
import { createGhostL1RpcClient } from '@ghostchain/sdk/rpc';

const rpc = createGhostL1RpcClient();
const current = await getGhostBlockNumber(rpc, 'latest');

const watcher = new GhostBlockNumberWatcher(rpc, { pollIntervalMs: 2000 });
watcher.on('block', (n) => console.log('New block:', n));
watcher.start();
```

### Signature verification

```ts
import { recoverAddress, verifySignature, personalSignHash } from '@ghostchain/sdk/signature';

const hash = personalSignHash('0x1234abcd');
const signer = recoverAddress(hash, signature);
const valid = verifySignature(hash, signature, expectedAddress);
```

### Nonce management (concurrent-safe)

```ts
import { GhostNonceManager } from '@ghostchain/sdk/nonce';
import { createGhostL1RpcClient } from '@ghostchain/sdk/rpc';

const rpc = createGhostL1RpcClient();
const nonceManager = new GhostNonceManager(rpc, '0xYOUR_ADDRESS');
await nonceManager.init();

const nonce = await nonceManager.nextNonce(); // Thread-safe increment
```

### Cross-layer multi-block tracker

```ts
import { GhostMultiLayerBlockTracker } from '@ghostchain/sdk/blockNumber';
import { createGhostL1RpcClient, createGhostL2RpcClient } from '@ghostchain/sdk/rpc';

const tracker = new GhostMultiLayerBlockTracker({
  l1: createGhostL1RpcClient(),
  l2: createGhostL2RpcClient(),
});

await tracker.start();
const { l1, l2 } = tracker.latest();
```

---

## Type System

All core types are re-exported from `@ghostchain/sdk/types`:

```ts
import type {
  GhostAddress,       // Branded `0x${string}`
  Hex,               // `0x${string}`
  GhostBlockTag,     // 'latest' | 'earliest' | 'pending' | 'finalized'
  GhostTxRequest,    // EIP-1559 tx request
  GhostTxReceipt,    // Transaction receipt
  GhostLogFilter,    // eth_getLogs filter
  GhostProviderOptions,
  GhostBlockNumber,  // Branded bigint block number
  GhostHash,         // Branded keccak256 hash
  GhostSpeedPreset,  // 'slow' | 'standard' | 'fast' | 'instant'
} from '@ghostchain/sdk/types';
```

---

## Build

```bash
# From repo root
pnpm build -F @ghostchain/sdk

# Or from packages/ghost-sdk/
npx tsc -p tsconfig.json
```

---

## Architecture

The SDK is organized into three layers:

```
┌─────────────────────────────────────────────────────┐
│                    Application Layer                 │
│  clients/  wallet/  accounts/  bridge/  multicall/  │
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────┐
│                   Protocol Layer                     │
│  gas/  nonce/  rpc/  hash/  address/  abi/          │
│  signature/  blockNumber/  token/  events/           │
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────┐
│                    Native Layer                      │
│  @noble/curves/secp256k1  @noble/hashes/sha256       │
│  native/hex  native/bytes  native/keccak             │
│  native/rlp  native/address  native/abi              │
└─────────────────────────────────────────────────────┘
```

No ethers.js. No web3.js. Pure GhostChain-native cryptography.
