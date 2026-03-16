import 'dart:typed_data';
import 'package:web3dart/web3dart.dart';
import 'ghost_provider.dart';
import 'ghost_hd_wallet.dart';

/// GhostWallet — branded wrapper around an EVM private key.
/// Targets GhostL3 (chain 903) exclusively.
class GhostWallet {
  final EthPrivateKey _key;
  final GhostProvider _provider;

  GhostWallet._(this._key, this._provider);

  EthereumAddress get address => _key.address;

  /// Create from a hex private key string (with or without 0x prefix).
  factory GhostWallet.fromPrivateKey(String hexKey, {GhostProvider? provider}) {
    final cleanKey = hexKey.startsWith('0x') ? hexKey.substring(2) : hexKey;
    return GhostWallet._(
      EthPrivateKey.fromHex(cleanKey),
      provider ?? GhostProvider(),
    );
  }

  /// Derive wallet from a BIP-39 mnemonic phrase.
  /// Derivation path: m/44'/60'/0'/0/0 (compatible with GhostWallet app).
  static GhostWallet fromMnemonic(String mnemonic, {GhostProvider? provider}) {
    return GhostHdWallet(mnemonic).deriveWallet(provider: provider);
  }

  Future<BigInt> getGstBalance() async {
    return _provider.getBalance(address);
  }

  /// Sign and broadcast a transaction on GhostL3 (chain 903).
  Future<String> sendTransaction(Transaction tx) async {
    return _provider.client.sendTransaction(
      _key,
      tx,
      chainId: GhostProvider.chainId,
    );
  }

  /// Sign a transaction and return the raw signed bytes (without broadcasting).
  Future<Uint8List> signTransaction(Transaction tx) async {
    return _provider.client.signTransaction(
      _key,
      tx,
      chainId: GhostProvider.chainId,
    );
  }

  Credentials get credentials => _key;
}
