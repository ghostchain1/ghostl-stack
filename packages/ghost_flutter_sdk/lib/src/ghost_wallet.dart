import 'package:web3dart/web3dart.dart';
import 'ghost_provider.dart';

/// GhostWallet — branded wrapper around an EVM private key.
/// Targets GhostL3 (chain 903) exclusively.
class GhostWallet {
  final EthPrivateKey _key;
  final GhostProvider _provider;

  GhostWallet._(this._key, this._provider);

  EthereumAddress get address => _key.address;

  /// Create from a hex private key string (no 0x prefix needed).
  factory GhostWallet.fromPrivateKey(String hexKey, {GhostProvider? provider}) {
    final cleanKey = hexKey.startsWith('0x') ? hexKey.substring(2) : hexKey;
    return GhostWallet._(
      EthPrivateKey.fromHex(cleanKey),
      provider ?? GhostProvider(),
    );
  }

  /// Derive wallet from a BIP-39 mnemonic phrase.
  /// Derivation path: m/44'/60'/0'/0/0 (compatible with GhostWallet app).
  static Future<GhostWallet> fromMnemonic(String mnemonic,
      {GhostProvider? provider}) async {
    // web3dart does not include HD wallet derivation natively.
    // Caller must derive the private key externally (e.g. via bip32 + bip39)
    // and pass it to [GhostWallet.fromPrivateKey].
    throw UnimplementedError(
        'Use ghost_flutter_sdk HD derivation helper or GhostWallet.fromPrivateKey.');
  }

  Future<BigInt> getGstBalance() async {
    return _provider.getBalance(address);
  }

  /// Sign and send a raw transaction on GhostL3 (chain 903).
  Future<String> sendTransaction(Transaction tx) async {
    final signed = await _key.signToUint8List(
      _provider.client,
      tx,
      chainId: GhostProvider.chainId,
    );
    return _provider.sendRawTransaction(signed);
  }

  Credentials get credentials => _key;
}
