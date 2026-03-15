import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/providers/wallet_provider.dart';
import '../../core/theme/app_theme.dart';
import '../../core/utils/formatters.dart';

class CreatorEarningsScreen extends ConsumerStatefulWidget {
  const CreatorEarningsScreen({super.key});

  @override
  ConsumerState<CreatorEarningsScreen> createState() =>
      _CreatorEarningsScreenState();
}

class _CreatorEarningsScreenState
    extends ConsumerState<CreatorEarningsScreen> {
  String _period = '7d';

  // Demo summary — live app fetches from /api/creator/earnings
  final _summary = {
    '7d': {'gifts': 12480.0, 'subs': 3200.0, 'sponsorships': 5000.0},
    '30d': {'gifts': 45200.0, 'subs': 11800.0, 'sponsorships': 18000.0},
    '90d': {'gifts': 134000.0, 'subs': 34500.0, 'sponsorships': 52000.0},
  };

  Map<String, double> get _current => _summary[_period]!;
  double get _totalGst =>
      _current.values.fold(0, (a, b) => a + b);

  @override
  Widget build(BuildContext context) {
    ref.watch(walletProvider);

    return Scaffold(
      backgroundColor: AppTheme.darkBg,
      appBar: AppBar(
        backgroundColor: AppTheme.darkBg,
        title: const Text('Creator Earnings'),
        foregroundColor: Colors.white,
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _periodSelector(),
            const SizedBox(height: 20),
            _totalCard(),
            const SizedBox(height: 20),
            const Text(
              'BREAKDOWN',
              style: TextStyle(
                color: Colors.white54,
                fontSize: 11,
                letterSpacing: 1.2,
              ),
            ),
            const SizedBox(height: 10),
            _breakdownCard('Gifts & Reactions', _current['gifts']!, Icons.card_giftcard, Colors.pinkAccent),
            _breakdownCard('Subscriptions', _current['subs']!, Icons.star, Colors.amber),
            _breakdownCard('Sponsorships', _current['sponsorships']!, Icons.handshake, Colors.greenAccent),
            const SizedBox(height: 24),
            ElevatedButton.icon(
              icon: const Icon(Icons.account_balance_wallet_outlined),
              label: const Text('Withdraw to Wallet'),
              style: ElevatedButton.styleFrom(
                backgroundColor: AppTheme.brandPurple,
                foregroundColor: Colors.black,
                minimumSize: const Size.fromHeight(50),
              ),
              onPressed: _totalGst > 0 ? () {} : null,
            ),
          ],
        ),
      ),
    );
  }

  Widget _periodSelector() => SegmentedButton<String>(
        segments: const [
          ButtonSegment(value: '7d', label: Text('7 Days')),
          ButtonSegment(value: '30d', label: Text('30 Days')),
          ButtonSegment(value: '90d', label: Text('90 Days')),
        ],
        selected: {_period},
        onSelectionChanged: (s) => setState(() => _period = s.first),
        style: SegmentedButton.styleFrom(
          selectedBackgroundColor: AppTheme.brandPurple.withOpacity(0.2),
          selectedForegroundColor: AppTheme.brandPurple,
          foregroundColor: Colors.white54,
        ),
      );

  Widget _totalCard() => Container(
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(
          gradient: LinearGradient(
            colors: [
              AppTheme.brandPurple.withOpacity(0.3),
              Colors.transparent,
            ],
          ),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: AppTheme.brandPurple.withOpacity(0.3)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Total Earned',
              style: TextStyle(color: Colors.white70),
            ),
            const SizedBox(height: 8),
            Text(
              GstFormatter.full(_totalGst),
              style: const TextStyle(
                color: Colors.white,
                fontSize: 32,
                fontWeight: FontWeight.bold,
              ),
            ),
          ],
        ),
      );

  Widget _breakdownCard(
    String label,
    double amount,
    IconData icon,
    Color color,
  ) =>
      Container(
        margin: const EdgeInsets.only(bottom: 10),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        decoration: BoxDecoration(
          color: Colors.white.withOpacity(0.05),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Row(
          children: [
            Icon(icon, color: color, size: 22),
            const SizedBox(width: 12),
            Expanded(
              child: Text(
                label,
                style: const TextStyle(color: Colors.white),
              ),
            ),
            Text(
              GstFormatter.compact(amount),
              style: TextStyle(
                color: color,
                fontWeight: FontWeight.bold,
              ),
            ),
          ],
        ),
      );
}
