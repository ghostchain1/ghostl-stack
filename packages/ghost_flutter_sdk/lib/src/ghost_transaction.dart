import 'package:web3dart/web3dart.dart';
import 'ghost_provider.dart';
import 'ghost_wallet.dart';

/// GhostTransaction — GST transfer builder for GhostL3 (chain 903).
class GhostTransaction {
  static const BigInt _gstUnit = BigInt.from(1000000000000000000); // 1e18 wei

  /// Transfer [amountGst] GST from [wallet] to [toAddress] on GhostL3.
  static Future<String> transferGst({
    required GhostWallet wallet,
    required EthereumAddress toAddress,
    required double amountGst,
  }) async {
    final amountWei = BigInt.from((amountGst * 1e18).toInt());
    final provider = GhostProvider();

    // Verify we are on the correct chain before signing
    await provider.getChainId(); // throws if not chain 903

    final nonce = await provider.client.getTransactionCount(wallet.address);
    final gasPrice = await provider.client.getGasPrice();

    final tx = Transaction(
      from: wallet.address,
      to: toAddress,
      value: EtherAmount.inWei(amountWei),
      nonce: nonce,
      gasPrice: gasPrice,
      maxGas: 21000,
    );

    return wallet.sendTransaction(tx);
  }

  /// Convert wei to human-readable GST string (e.g. "1.5 GST").
  static String weiToGst(BigInt wei) {
    final gst = wei / _gstUnit;
    return '$gst GST';
  }
}
