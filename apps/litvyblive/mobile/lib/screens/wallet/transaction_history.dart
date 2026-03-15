import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../services/payment_service.dart';
import '../../core/constants/app_constants.dart';

// ── Provider ──────────────────────────────────────────────────────────────────

final paymentHistoryProvider = FutureProvider.autoDispose
    .family<List<PaymentTransaction>, String>((ref, userId) async {
  return PaymentService.instance.getTransactionHistory(
    userId: userId,
    limit: 100,
  );
});

// ── Constants ─────────────────────────────────────────────────────────────────

const _kBg    = Color(0xFF0F0F1A);
const _kCard  = Color(0xFF1A1A2E);
const _kGold  = Color(0xFFFFD700);
const _kAccent = Color(0xFF00D4FF);

// ── Status display helpers ────────────────────────────────────────────────────

Color _statusColor(String status) => switch (status) {
  'confirmed'  => const Color(0xFF4CAF50),
  'pending'    => const Color(0xFFFF9800),
  'processing' => const Color(0xFF2196F3),
  'flagged'    => const Color(0xFFFF5722),
  'failed'     => const Color(0xFFF44336),
  'refunded'   => const Color(0xFF9E9E9E),
  _            => Colors.white38,
};

String _statusLabel(String status) => switch (status) {
  'confirmed'  => 'Confirmed',
  'pending'    => 'Pending',
  'processing' => 'Processing',
  'flagged'    => 'Flagged',
  'failed'     => 'Failed',
  'refunded'   => 'Refunded',
  _            => status,
};

IconData _methodIcon(String method) => switch (method) {
  'credit_card'   => Icons.credit_card,
  'apple_pay'     => Icons.apple,
  'google_pay'    => Icons.g_mobiledata,
  'bank_transfer' => Icons.account_balance,
  'crypto_wallet' => Icons.currency_bitcoin,
  _               => Icons.payment,
};

String _methodLabel(String method) =>
    method.replaceAll('_', ' ').split(' ')
        .map((w) => w.isEmpty ? '' : w[0].toUpperCase() + w.substring(1))
        .join(' ');

// ── Screen ────────────────────────────────────────────────────────────────────

class TransactionHistoryScreen extends ConsumerWidget {
  final String userId;

  const TransactionHistoryScreen({super.key, required this.userId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final historyAsync = ref.watch(paymentHistoryProvider(userId));

    return Scaffold(
      backgroundColor: _kBg,
      appBar: AppBar(
        backgroundColor: _kBg,
        foregroundColor: Colors.white,
        title: const Row(children: [
          Icon(Icons.receipt_long, color: _kGold, size: 22),
          SizedBox(width: 8),
          Text('Payment History', style: TextStyle(fontWeight: FontWeight.bold)),
        ]),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh, color: Colors.white54),
            onPressed: () => ref.invalidate(paymentHistoryProvider),
          ),
        ],
      ),
      body: historyAsync.when(
        loading: () => const Center(
          child: CircularProgressIndicator(color: _kAccent),
        ),
        error: (e, _) => _ErrorView(error: e, onRetry: () => ref.invalidate(paymentHistoryProvider)),
        data: (txs) => txs.isEmpty
            ? const _EmptyState()
            : _TransactionList(transactions: txs),
      ),
    );
  }
}

// ── Transaction list ──────────────────────────────────────────────────────────

class _TransactionList extends StatelessWidget {
  final List<PaymentTransaction> transactions;
  const _TransactionList({required this.transactions});

  @override
  Widget build(BuildContext context) {
    // Summary totals
    final confirmed = transactions.where((t) => t.isConfirmed);
    final totalGST  = confirmed.fold(0.0, (s, t) => s + t.gstAmount);

    return CustomScrollView(
      slivers: [
        // ── Summary banner ────────────────────────────────────────────────
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
            child: Container(
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                gradient: const LinearGradient(
                  colors: [Color(0xFF7B2FBE), Color(0xFF00D4FF)],
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                ),
                borderRadius: BorderRadius.circular(16),
              ),
              child: Row(children: [
                Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text('${transactions.length} Payments',
                      style: const TextStyle(color: Colors.white60, fontSize: 12)),
                  const SizedBox(height: 4),
                  Text('${totalGST.toStringAsFixed(2)} $kGstSymbol Total',
                      style: const TextStyle(
                          color: Colors.white,
                          fontSize: 20,
                          fontWeight: FontWeight.bold)),
                ]),
                const Spacer(),
                const Icon(Icons.bolt, color: _kGold, size: 40),
              ]),
            ),
          ),
        ),

        // ── List items ────────────────────────────────────────────────────
        SliverPadding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
          sliver: SliverList(
            delegate: SliverChildBuilderDelegate(
              (context, i) => Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: _TransactionCard(tx: transactions[i]),
              ),
              childCount: transactions.length,
            ),
          ),
        ),
      ],
    );
  }
}

// ── Transaction Card ──────────────────────────────────────────────────────────

class _TransactionCard extends StatelessWidget {
  final PaymentTransaction tx;
  const _TransactionCard({required this.tx});

  @override
  Widget build(BuildContext context) {
    final statusColor = _statusColor(tx.status);
    final date        = _formatDate(tx.createdAt);

    return GestureDetector(
      onTap: () => _showDetail(context, tx),
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: _kCard,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: Colors.white10),
        ),
        child: Row(children: [
          // Method icon
          Container(
            width: 44,
            height: 44,
            decoration: BoxDecoration(
              color: Colors.white10,
              borderRadius: BorderRadius.circular(12),
            ),
            child: Icon(_methodIcon(tx.paymentMethod),
                color: _kAccent, size: 22),
          ),
          const SizedBox(width: 14),

          // Details
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                Text(_methodLabel(tx.paymentMethod),
                    style: const TextStyle(
                        color: Colors.white, fontWeight: FontWeight.w600)),
                const Spacer(),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    color: statusColor.withOpacity(0.18),
                    borderRadius: BorderRadius.circular(20),
                    border: Border.all(color: statusColor.withOpacity(0.5)),
                  ),
                  child: Text(_statusLabel(tx.status),
                      style: TextStyle(color: statusColor, fontSize: 11,
                          fontWeight: FontWeight.w600)),
                ),
              ]),
              const SizedBox(height: 4),
              Row(children: [
                Text('${tx.fiatCurrency} ${tx.fiatAmount.toStringAsFixed(2)}',
                    style: const TextStyle(color: Colors.white54, fontSize: 13)),
                const Text(' → ', style: TextStyle(color: Colors.white30)),
                Text('${tx.gstAmount.toStringAsFixed(2)} $kGstSymbol',
                    style: const TextStyle(
                        color: _kGold, fontSize: 13, fontWeight: FontWeight.w600)),
              ]),
              const SizedBox(height: 2),
              Text(date, style: const TextStyle(color: Colors.white30, fontSize: 11)),
            ]),
          ),
        ]),
      ),
    );
  }

  static String _formatDate(DateTime dt) {
    final now  = DateTime.now();
    final diff = now.difference(dt);
    if (diff.inSeconds < 60)  return 'Just now';
    if (diff.inMinutes < 60)  return '${diff.inMinutes}m ago';
    if (diff.inHours < 24)    return '${diff.inHours}h ago';
    if (diff.inDays < 7)      return '${diff.inDays}d ago';
    return '${dt.day}/${dt.month}/${dt.year}';
  }

  static void _showDetail(BuildContext context, PaymentTransaction tx) {
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: _kCard,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (_) => _TransactionDetail(tx: tx),
    );
  }
}

// ── Transaction Detail Sheet ──────────────────────────────────────────────────

class _TransactionDetail extends StatelessWidget {
  final PaymentTransaction tx;
  const _TransactionDetail({required this.tx});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(24, 20, 24, 32),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Handle
          Center(
            child: Container(
              width: 40, height: 4,
              decoration: BoxDecoration(
                color: Colors.white24,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ),
          const SizedBox(height: 20),

          // Title
          Row(children: [
            Icon(_methodIcon(tx.paymentMethod), color: _kAccent, size: 24),
            const SizedBox(width: 10),
            Text(_methodLabel(tx.paymentMethod),
                style: const TextStyle(color: Colors.white, fontSize: 18,
                    fontWeight: FontWeight.bold)),
            const Spacer(),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
              decoration: BoxDecoration(
                color: _statusColor(tx.status).withOpacity(0.2),
                borderRadius: BorderRadius.circular(20),
              ),
              child: Text(_statusLabel(tx.status),
                  style: TextStyle(color: _statusColor(tx.status),
                      fontWeight: FontWeight.bold)),
            ),
          ]),
          const SizedBox(height: 20),
          const Divider(color: Colors.white12),
          const SizedBox(height: 12),

          _row('Transaction ID', tx.txId.substring(0, 12) + '...'),
          _row('Amount Paid',    '${tx.fiatCurrency} ${tx.fiatAmount.toStringAsFixed(2)}'),
          _row('$kGstSymbol Received', '${tx.gstAmount.toStringAsFixed(4)} $kGstSymbol'),
          _row('Rate', '1 $kGstSymbol = \$${tx.gstRate.toStringAsFixed(4)}'),
          _row('Wallet', '${tx.walletAddress.substring(0, 6)}...${tx.walletAddress.substring(38)}'),
          if (tx.chainTxHash != null)
            _row('Chain Tx', '${tx.chainTxHash!.substring(0, 10)}...'),
          if (tx.flaggedReason != null)
            _row('Flagged', tx.flaggedReason!, valueColor: Colors.orange[300]),
          _row('Date', tx.createdAt.toLocal().toString().substring(0, 16)),

          const SizedBox(height: 16),
          if (tx.isConfirmed)
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: Colors.green.withOpacity(0.1),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: Colors.green.withOpacity(0.3)),
              ),
              child: const Row(children: [
                Icon(Icons.check_circle_outline, color: Colors.green, size: 18),
                SizedBox(width: 8),
                Expanded(
                  child: Text(
                    'GST has been credited to your GhostL3 wallet.',
                    style: TextStyle(color: Colors.green, fontSize: 13),
                  ),
                ),
              ]),
            ),
        ],
      ),
    );
  }

  Widget _row(String label, String value, {Color? valueColor}) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 5),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          flex: 2,
          child: Text(label, style: const TextStyle(color: Colors.white38, fontSize: 13)),
        ),
        Expanded(
          flex: 3,
          child: Text(value,
              style: TextStyle(
                  color: valueColor ?? Colors.white,
                  fontSize: 13,
                  fontWeight: FontWeight.w500)),
        ),
      ],
    ),
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

class _EmptyState extends StatelessWidget {
  const _EmptyState();

  @override
  Widget build(BuildContext context) => Center(
    child: Column(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        Icon(Icons.receipt_long_outlined, size: 72, color: Colors.white12),
        const SizedBox(height: 20),
        const Text('No payments yet',
            style: TextStyle(color: Colors.white38, fontSize: 18)),
        const SizedBox(height: 8),
        const Text('Buy $kGstSymbol to get started on GhostL3.',
            style: TextStyle(color: Colors.white24, fontSize: 13)),
      ],
    ),
  );
}

// ── Error state ───────────────────────────────────────────────────────────────

class _ErrorView extends StatelessWidget {
  final Object error;
  final VoidCallback onRetry;
  const _ErrorView({required this.error, required this.onRetry});

  @override
  Widget build(BuildContext context) => Center(
    child: Column(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        const Icon(Icons.warning_amber_rounded, color: Colors.orange, size: 56),
        const SizedBox(height: 16),
        Text('Failed to load history: $error',
            style: const TextStyle(color: Colors.white54),
            textAlign: TextAlign.center),
        const SizedBox(height: 16),
        ElevatedButton(
          onPressed: onRetry,
          child: const Text('Retry'),
        ),
      ],
    ),
  );
}
