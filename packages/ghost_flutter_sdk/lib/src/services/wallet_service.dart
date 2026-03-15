import 'package:web3dart/web3dart.dart';
import '../ghost_provider.dart';
import '../ghost_wallet.dart';
import '../ghost_transaction.dart';
import '../models/ghost_balance.dart';

/// GhostWalletService — high-level wallet operations on GhostL3 (chain 903).
class GhostWalletService {
  final GhostProvider _provider;

  GhostWalletService({GhostProvider? provider})
      : _provider = provider ?? GhostProvider();

  Future<GhostBalance> getBalance(EthereumAddress address) async {
    final wei = await _provider.getBalance(address);
    return GhostBalance(wei: wei);
  }

  Future<String> transferGst({
    required GhostWallet wallet,
    required String toAddress,
    required double amount,
  }) async {
    return GhostTransaction.transferGst(
      wallet: wallet,
      toAddress: EthereumAddress.fromHex(toAddress),
      amountGst: amount,
    );
  }

  Future<int> getTransactionCount(EthereumAddress address) async {
    return _provider.client.getTransactionCount(address);
  }
}
