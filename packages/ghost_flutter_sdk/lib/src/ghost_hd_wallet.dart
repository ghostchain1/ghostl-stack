import 'dart:typed_data';
import 'package:bip39/bip39.dart' as bip39;
import 'package:pointycastle/export.dart';
import 'ghost_provider.dart';
import 'ghost_wallet.dart';

/// BIP-39/32/44 HD wallet for GhostChain.
///
/// Derives keys at m/44'/60'/[account]'/0/[index], which is compatible
/// with the GhostWallet app and standard EVM tooling.
///
/// Example:
/// ```dart
/// final hd = GhostHdWallet('your twelve word mnemonic ...');
/// final wallet = hd.deriveWallet(); // account 0, index 0
/// ```
class GhostHdWallet {
  final String _mnemonic;

  static const String defaultDerivationPath = "m/44'/60'/0'/0/0";

  const GhostHdWallet._(this._mnemonic);

  /// Create from an existing BIP-39 mnemonic (12 or 24 words).
  factory GhostHdWallet(String mnemonic) {
    if (!bip39.validateMnemonic(mnemonic)) {
      throw ArgumentError('Invalid BIP-39 mnemonic phrase');
    }
    return GhostHdWallet._(mnemonic);
  }

  /// Generate a fresh random mnemonic.
  /// [strength] must be 128 (12 words) or 256 (24 words).
  factory GhostHdWallet.generate({int strength = 128}) {
    assert(strength == 128 || strength == 256, 'strength must be 128 or 256');
    return GhostHdWallet._(bip39.generateMnemonic(strength: strength));
  }

  String get mnemonic => _mnemonic;

  /// Derive a [GhostWallet] at m/44'/60'/[accountIndex]'/0/[addressIndex].
  GhostWallet deriveWallet({
    int accountIndex = 0,
    int addressIndex = 0,
    GhostProvider? provider,
  }) {
    final seed = bip39.mnemonicToSeed(_mnemonic);
    final keyBytes = _derivePath(seed, accountIndex, addressIndex);
    final hexKey =
        keyBytes.map((b) => b.toRadixString(16).padLeft(2, '0')).join();
    return GhostWallet.fromPrivateKey(hexKey, provider: provider);
  }

  // ── BIP-32 internals ──────────────────────────────────────────────────────

  static Uint8List _derivePath(
      Uint8List seed, int accountIndex, int addressIndex) {
    // Master key from seed (BIP-32 spec)
    final master = _hmacSha512(
      Uint8List.fromList('Bitcoin seed'.codeUnits),
      seed,
    );
    var key = master.sublist(0, 32);
    var chain = master.sublist(32);

    // m / 44' / 60' / account' / 0 / addressIndex
    final path = [
      0x8000002C, // 44' — purpose (hardened)
      0x8000003C, // 60' — coin type ETH/EVM (hardened)
      0x80000000 + accountIndex, // account' (hardened)
      0x00000000, // change = 0 (external)
      addressIndex, // address index
    ];

    for (final index in path) {
      final buf = Uint8List(37);
      if (index >= 0x80000000) {
        // Hardened: 0x00 || key || index (big-endian 4 bytes)
        buf[0] = 0x00;
        buf.setRange(1, 33, key);
      } else {
        // Normal: compressed_pub(key) || index
        buf.setRange(0, 33, _compressedPublicKey(key));
      }
      buf[33] = (index >> 24) & 0xFF;
      buf[34] = (index >> 16) & 0xFF;
      buf[35] = (index >> 8) & 0xFF;
      buf[36] = index & 0xFF;

      final child = _hmacSha512(chain, buf);
      key = _childKey(key, child.sublist(0, 32));
      chain = child.sublist(32);
    }
    return key;
  }

  /// HMAC-SHA512 using pointycastle.
  static Uint8List _hmacSha512(Uint8List key, Uint8List data) {
    final mac = HMac(SHA512Digest(), 128);
    mac.init(KeyParameter(key));
    mac.update(data, 0, data.length);
    final out = Uint8List(64);
    mac.doFinal(out, 0);
    return out;
  }

  /// Compress a secp256k1 public key from a 32-byte private key.
  static Uint8List _compressedPublicKey(Uint8List privateKey) {
    final params = ECCurve_secp256k1();
    final d = _bytesToBigInt(privateKey);
    final Q = params.G * d;
    if (Q == null) throw StateError('EC point multiplication returned null');
    return Q.getEncoded(true); // 33-byte compressed point
  }

  /// Derive child private key: (tweak + parent) mod n.
  static Uint8List _childKey(Uint8List parent, Uint8List tweak) {
    final params = ECCurve_secp256k1();
    final n = params.n;
    final k = _bytesToBigInt(parent);
    final t = _bytesToBigInt(tweak);
    if (t >= n) throw StateError('BIP-32 tweak >= curve order — try next index');
    final child = (k + t) % n;
    return _bigIntToBytes32(child);
  }

  static BigInt _bytesToBigInt(Uint8List bytes) {
    var result = BigInt.zero;
    for (final b in bytes) {
      result = (result << 8) | BigInt.from(b);
    }
    return result;
  }

  static Uint8List _bigIntToBytes32(BigInt n) {
    final hex = n.toRadixString(16).padLeft(64, '0');
    return Uint8List.fromList(
      List.generate(
          32, (i) => int.parse(hex.substring(i * 2, i * 2 + 2), radix: 16)),
    );
  }
}
