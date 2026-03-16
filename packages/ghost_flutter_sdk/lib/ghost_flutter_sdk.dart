/// GhostChain Flutter SDK
///
/// Entry point — export all public surface area.
/// Targets GhostL3 (chain ID 903) exclusively for user-facing operations.
library ghost_flutter_sdk;

// Core
export 'src/ghost_provider.dart';
export 'src/ghost_wallet.dart';
export 'src/ghost_hd_wallet.dart';
export 'src/ghost_transaction.dart';
export 'src/ghost_contracts.dart';
export 'src/ghost_sdk.dart';

// Models
export 'src/models/ghost_balance.dart';
export 'src/models/ghost_tx.dart';
export 'src/models/ghost_token.dart';
export 'src/models/ghost_nft.dart';
export 'src/models/ghost_creator.dart';
export 'src/models/ghost_event.dart';

// Services
export 'src/services/wallet_service.dart';
export 'src/services/gift_service.dart';
export 'src/services/nft_service.dart';
export 'src/services/streaming_service.dart';
export 'src/services/identity_service.dart';
export 'src/services/creator_token_service.dart';
export 'src/services/coin_seller_service.dart';
export 'src/services/agency_service.dart';
export 'src/services/universe_service.dart';
export 'src/services/ghostx_service.dart';
export 'src/services/bridge_service.dart';
export 'src/services/governance_service.dart';
