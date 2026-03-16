# ghost_flutter_sdk

The official Flutter SDK for the **GhostChain** ecosystem — wallet, GST transactions, NFT gifts, live stream anchoring, creator tokens, coin seller, and agency flows.

All user-facing transactions are enforced on **GhostL3 (chain ID 903)**. The SDK throws `StateError` if the connected RPC reports any other chain.

Gas token: **GST** — never ETH, Ether, or WETH.

---

## Installation

Add to your `pubspec.yaml`:

```yaml
dependencies:
  ghost_flutter_sdk:
    path: ../../../packages/ghost_flutter_sdk
```

Set the GhostL3 RPC URL at build time:

```bash
flutter run --dart-define=GHOST_L3_RPC=http://localhost:39545
```

---

## Quick Start

```dart
import 'package:ghost_flutter_sdk/ghost_flutter_sdk.dart';

// ── Wallet creation ──────────────────────────────────────────────────────────

// Generate a new HD wallet
final hd = GhostHdWallet.generate();           // 12-word mnemonic
final wallet = hd.deriveWallet();              // m/44'/60'/0'/0/0

// Or restore from existing mnemonic
final hd = GhostHdWallet('twelve word mnemonic phrase ...');
final wallet = hd.deriveWallet();

// Or directly from a private key
final wallet = GhostWallet.fromPrivateKey('0xprivatekey...');

// ── SDK init ─────────────────────────────────────────────────────────────────

final sdk = GhostSdk.init(
  wallet: wallet,
  apiBase: 'https://api.litvybz.ghost',
  bearerToken: userJwt,           // optional
);

// Verify we are on GhostL3 (chain 903) — throws StateError if not
await sdk.validateChain();

// ── Wallet / balances ────────────────────────────────────────────────────────

final balance = await sdk.getBalance();
print(balance);                                // "2.5000 GST (chain 903)"

// ── Send a gift during a live stream ─────────────────────────────────────────

final txHash = await sdk.gifts.sendGift(
  streamId: 'stream-abc123',
  giftId: 'dragon',
  priceGst: 50,
);

// ── Mint an NFT gift ─────────────────────────────────────────────────────────

final txHash = await sdk.nft.mintNftGift(
  recipientAddress: creatorAddress,
  giftId: 'crown',
  metadataUri: 'ipfs://Qm...',
);

// ── Creator tokens ───────────────────────────────────────────────────────────

final txHash = await sdk.creatorTokens.launchToken(
  creatorAddress: wallet.address.hex,
  name: 'Luna Fan Token',
  symbol: 'LFT',
  totalSupply: BigInt.from(1000000) * BigInt.from(10).pow(18),
  vestingMonths: 12,
);

// ── Coin seller ──────────────────────────────────────────────────────────────

final packages = await sdk.coins.getPackages();
final intent = await sdk.coins.purchasePackage(
  packageId: packages.first['id'],
  buyerAddress: wallet.address.hex,
);

// ── Agency ───────────────────────────────────────────────────────────────────

final agencyInfo = await sdk.agency.registerAgency(
  name: 'StarLight Agency',
  ownerAddress: wallet.address.hex,
  commissionPercent: 15.0,
);
```

---

## Architecture

```
GhostChain L1 (chain 14000101)
  └── GhostL2 (chain 901)
        └── GhostL3 (chain 903)  ← all user transactions here
```

The SDK **enforces chain 903 at every layer**:
- `GhostProvider.getChainId()` throws `StateError` if chain ≠ 903
- All service calls include `chainId: 903` in request bodies
- `GhostContracts.chainIdL3 == 903`

---

## API Reference

### Core

| Class | Purpose |
|---|---|
| `GhostHdWallet` | BIP-39/32/44 HD wallet — generate, restore, derive |
| `GhostWallet` | Active wallet — balance, sign, send transactions |
| `GhostProvider` | GhostL3 RPC singleton (chain 903) |
| `GhostTransaction` | GST transfer builder |
| `GhostContracts` | Canonical governance-locked contract addresses |
| `GhostSdk` | Top-level entry point bundling all services |

### Services

| Service | Purpose |
|---|---|
| `GhostWalletService` | Balance queries, GST transfers |
| `GhostGiftService` | On-chain gift dispatch via LitVybGiftEngine |
| `GhostNftService` | NFT gift minting and ownership queries |
| `StreamingService` | Stream start/end/relay on GhostL3 |
| `IdentityService` | GNS name resolution (Ghost Name System) |
| `CreatorTokenService` | Creator fan-token launch, price, purchase |
| `CoinSellerService` | Platform coin packages, reseller network |
| `AgencyService` | Agency registration, creator contracts, commissions |

### Models

| Model | Fields |
|---|---|
| `GhostBalance` | `wei`, `stakedWei`, `chainId`, `.gst` |
| `GhostTx` | `hash`, `from`, `to`, `valueWei`, `timestamp`, `isPending` |
| `GhostToken` | Static constants: `symbol`, `name`, `decimals`, `chainId`; `toWei()`, `formatWei()` |

---

## HD Wallet Derivation

The SDK implements BIP-39/32/44 key derivation using `pointycastle` (secp256k1 + HMAC-SHA512):

- Path: `m/44'/60'/[account]'/0/[index]`
- Coin type 60 = EVM-compatible (works with GhostWallet app)
- Hardened derivation for account level; normal for address index

```dart
final hd = GhostHdWallet('mnemonic...');
final w0 = hd.deriveWallet(accountIndex: 0, addressIndex: 0); // primary
final w1 = hd.deriveWallet(accountIndex: 0, addressIndex: 1); // second
final w2 = hd.deriveWallet(accountIndex: 1, addressIndex: 0); // second account
```

---

## Running Tests

```bash
cd packages/ghost_flutter_sdk
flutter pub get
flutter test
```

---

## Branding

- Gas token: **GST** (never ETH)
- Chain explorer: **GhostScan** (never Etherscan)
- DNS: **GNS** (never ENS)
- DEX: **GhostXchange** (never Uniswap)
- RPC namespace: **`ghost_`** (never `eth_`)
