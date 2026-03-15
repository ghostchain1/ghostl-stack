import 'package:flutter/material.dart';
import '../../services/wallet_service.dart';
import '../../models/wallet_model.dart';
import '../../core/constants/app_constants.dart';

class TreasuryScreen extends StatelessWidget {
  const TreasuryScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Creator Treasury')),
      body: FutureBuilder<WalletModel>(
        future: WalletService.instance.getCreatorTreasury(),
        builder: (_, snap) {
          if (snap.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }
          final t = snap.data;
          if (t == null) return const Center(child: Text('Treasury not found'));
          return ListView(
            padding: const EdgeInsets.all(20),
            children: [
              const Text(
                'All treasury operations settle on GhostL3 (chain 903)',
                style: TextStyle(color: Colors.white38, fontSize: 11),
              ),
              const SizedBox(height: 16),
              _TreasuryCard(
                label: 'Vault Balance',
                value: '${t.gstBalance} $kGstSymbol',
                color: const Color(0xFF7B2FBE),
              ),
              _TreasuryCard(
                label: 'Staked Balance',
                value: '${t.stakedBalance} $kGstSymbol',
                color: const Color(0xFFFFD700),
              ),
              _TreasuryCard(
                label: 'Pending Rewards',
                value: '${t.pendingRewards} $kGstSymbol',
                color: const Color(0xFF00D4FF),
              ),
              const SizedBox(height: 24),
              ElevatedButton(
                onPressed: () => _stake(context),
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFFFFD700),
                  foregroundColor: Colors.black,
                ),
                child: const Text('Stake $kGstSymbol'),
              ),
              const SizedBox(height: 8),
              OutlinedButton(
                onPressed: () {},
                child: const Text('Governance Vote'),
              ),
            ],
          );
        },
      ),
    );
  }

  Future<void> _stake(BuildContext context) async {
    // Opens stake amount dialog / screen
    ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Staking on GhostL3...')));
  }
}

class _TreasuryCard extends StatelessWidget {
  final String label, value;
  final Color color;
  const _TreasuryCard({required this.label, required this.value, required this.color});

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: ListTile(
        leading: CircleAvatar(backgroundColor: color, radius: 8),
        title: Text(label, style: const TextStyle(color: Colors.white54, fontSize: 12)),
        trailing: Text(value,
            style: TextStyle(color: color, fontSize: 16, fontWeight: FontWeight.bold)),
      ),
    );
  }
}
