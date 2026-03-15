import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../services/wallet_service.dart';
import '../../models/wallet_model.dart';
import '../../core/constants/app_constants.dart';
import 'withdraw_screen.dart';

final walletProvider = FutureProvider<WalletModel>((ref) =>
    WalletService.instance.getBalance());

class WalletScreen extends ConsumerWidget {
  const WalletScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final wallet = ref.watch(walletProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('$kGstSymbol Wallet')),
      body: wallet.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('Error: $e')),
        data: (w) => ListView(
          padding: const EdgeInsets.all(20),
          children: [
            // Balance card
            Container(
              padding: const EdgeInsets.all(24),
              decoration: BoxDecoration(
                gradient: const LinearGradient(
                  colors: [Color(0xFF7B2FBE), Color(0xFF00D4FF)],
                ),
                borderRadius: BorderRadius.circular(16),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('$kGstSymbol Balance',
                      style: TextStyle(color: Colors.white70, fontSize: 14)),
                  const SizedBox(height: 8),
                  Text('${w.gstBalance} $kGstSymbol',
                      style: const TextStyle(
                          color: Colors.white,
                          fontSize: 32,
                          fontWeight: FontWeight.bold)),
                  const SizedBox(height: 4),
                  Text('Staked: ${w.stakedBalance} $kGstSymbol',
                      style: const TextStyle(color: Colors.white70)),
                ],
              ),
            ),
            const SizedBox(height: 24),
            ListTile(
              leading: const Icon(Icons.arrow_downward, color: Color(0xFFFFD700)),
              title: const Text('Coins Balance'),
              trailing: Text('${w.coinsBalance}'),
            ),
            ListTile(
              leading: const Icon(Icons.diamond, color: Color(0xFF00D4FF)),
              title: const Text('Diamonds'),
              trailing: Text('${w.diamondsBalance}'),
            ),
            ListTile(
              leading: const Icon(Icons.pending, color: Colors.orange),
              title: const Text('Pending Rewards'),
              trailing: Text('${w.pendingRewards} $kGstSymbol'),
            ),
            const SizedBox(height: 24),
            ElevatedButton(
              onPressed: () => Navigator.push(context,
                  MaterialPageRoute(builder: (_) => const WithdrawScreen())),
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF7B2FBE),
                padding: const EdgeInsets.symmetric(vertical: 14),
              ),
              child: const Text('Withdraw $kGstSymbol'),
            ),
            const SizedBox(height: 12),
            OutlinedButton(
              onPressed: () {},
              child: const Text('Buy Coins'),
            ),
          ],
        ),
      ),
    );
  }
}
