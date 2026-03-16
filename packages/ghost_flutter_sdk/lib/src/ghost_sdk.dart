import 'package:web3dart/web3dart.dart';
import 'ghost_provider.dart';
import 'ghost_wallet.dart';
import 'ghost_hd_wallet.dart';
import 'ghost_contracts.dart';
import 'models/ghost_balance.dart';
import 'services/wallet_service.dart';
import 'services/gift_service.dart';
import 'services/nft_service.dart';
import 'services/streaming_service.dart';
import 'services/identity_service.dart';
import 'services/creator_token_service.dart';
import 'services/coin_seller_service.dart';
import 'services/agency_service.dart';
import 'services/universe_service.dart';
import 'services/ghostx_service.dart';
import 'services/bridge_service.dart';
import 'services/governance_service.dart';

/// GhostSdk — top-level entry point for the Ghost Flutter SDK.
///
/// Bundles [GhostWallet] + all GhostL3 services into a single initialised
/// object. Enforces chain 903 at construction time via [validateChain].
///
/// ```dart
/// // Restore from mnemonic
/// final wallet = GhostWallet.fromMnemonic('twelve word phrase ...');
///
/// // Or generate new HD wallet
/// final hd = GhostHdWallet.generate();
/// final wallet = hd.deriveWallet();
///
/// final sdk = GhostSdk.init(
///   wallet: wallet,
///   apiBase: 'https://api.litvybz.ghost',
///   bearerToken: jwt,
/// );
///
/// await sdk.validateChain(); // verifies RPC is chain 903
/// final balance = await sdk.wallet.getBalance(sdk.address);
/// final txHash = await sdk.gifts.sendGift(streamId: 's1', giftId: 'dragon', priceGst: 50);
/// ```
class GhostSdk {
  final GhostProvider provider;
  final GhostWallet activeWallet;

  // Services
  final GhostWalletService wallet;
  final GhostGiftService gifts;
  final GhostNftService nft;
  final StreamingService streaming;
  final IdentityService identity;
  final CreatorTokenService creatorTokens;
  final CoinSellerService coins;
  final AgencyService agency;

  // Extended services
  final GhostUniverseService universe;
  final GhostXService ghostX;
  final GhostBridgeService bridge;
  final GhostGovernanceService governance;

  GhostSdk._({
    required this.provider,
    required this.activeWallet,
    required this.wallet,
    required this.gifts,
    required this.nft,
    required this.streaming,
    required this.identity,
    required this.creatorTokens,
    required this.coins,
    required this.agency,
    required this.universe,
    required this.ghostX,
    required this.bridge,
    required this.governance,
  });

  /// Initialise the SDK with an active [wallet] and backend [apiBase].
  ///
  /// [apiBase] — base URL for the LitVybzLive backend API
  ///   (e.g. `https://api.litvybz.ghost`).
  /// [bearerToken] — JWT for authenticated service calls.
  /// [universeApiBase] — optional override for the Ghost Universe API (default: port 7700).
  factory GhostSdk.init({
    required GhostWallet wallet,
    required String apiBase,
    String? bearerToken,
    GhostProvider? provider,
    String? universeApiBase,
  }) {
    final p = provider ?? GhostProvider();
    return GhostSdk._(
      provider: p,
      activeWallet: wallet,
      wallet: GhostWalletService(provider: p),
      gifts: GhostGiftService(
        apiBase: apiBase,
        wallet: wallet,
        bearerToken: bearerToken,
      ),
      nft: GhostNftService(
        apiBase: apiBase,
        wallet: wallet,
        bearerToken: bearerToken,
      ),
      streaming: StreamingService.instance,
      identity: IdentityService.instance,
      creatorTokens: CreatorTokenService.instance,
      coins: CoinSellerService(apiBase: apiBase, bearerToken: bearerToken),
      agency: AgencyService(apiBase: apiBase, bearerToken: bearerToken),
      universe: GhostUniverseService(apiBase: universeApiBase, bearerToken: bearerToken),
      ghostX: GhostXService(),
      bridge: GhostBridgeService(),
      governance: GhostGovernanceService(),
    );
  }

  /// The active wallet's GhostL3 address.
  EthereumAddress get address => activeWallet.address;

  /// Verify the connected RPC is on GhostL3 (chain 903).
  /// Throws [StateError] if chain ID does not match.
  Future<void> validateChain() => provider.getChainId();

  /// Get the active wallet's GST balance on GhostL3.
  Future<GhostBalance> getBalance() async {
    final wei = await activeWallet.getGstBalance();
    return GhostBalance(wei: wei);
  }

  /// Release RPC resources. Call when the app is terminated.
  Future<void> dispose() => provider.client.dispose();
}
