import 'package:web3dart/web3dart.dart';
import 'package:http/http.dart' as http;

/// GhostL3 RPC provider.
/// Chain ID 903 is enforced — any attempt to use a different chain throws.
///
/// The RPC URL is resolved at build time via:
///   flutter build ios --dart-define=GHOST_L3_RPC=https://<host>
/// Falls back to localhost:39545 for local devnet.
class GhostProvider {
  static const int chainId = 903;

  // Injected at build time; defaults to local devnet.
  static const String _defaultRpc = String.fromEnvironment(
    'GHOST_L3_RPC',
    defaultValue: 'http://localhost:39545',
  );

  final Web3Client _client;

  GhostProvider._({String? rpcUrl})
      : _client = Web3Client(rpcUrl ?? _defaultRpc, http.Client());

  static GhostProvider? _instance;

  factory GhostProvider({String? rpcUrl}) {
    _instance ??= GhostProvider._(rpcUrl: rpcUrl);
    return _instance!;
  }

  Web3Client get client => _client;

  Future<int> getChainId() async {
    final id = await _client.getChainId();
    final idInt = id.toInt();
    if (idInt != chainId) {
      throw StateError(
          'Connected to chain $idInt but GhostL3 (chain $chainId) is required.');
    }
    return idInt;
  }

  Future<BigInt> getBalance(EthereumAddress address) async {
    final wei = await _client.getBalance(address);
    return wei.getInWei;
  }

  Future<String> sendRawTransaction(Uint8List signedTx) async {
    return _client.sendRawTransaction(signedTx);
  }

  void dispose() {
    _client.dispose();
    _instance = null;
  }
}
