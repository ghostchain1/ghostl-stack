import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../models/creator_token_model.dart';
import '../../services/launchpad_service.dart';
import '../../services/auth_service.dart';

class BuyTokenScreen extends ConsumerStatefulWidget {
  const BuyTokenScreen({super.key, required this.token, required this.sale});
  final CreatorTokenModel token;
  final TokenSaleModel    sale;

  @override
  ConsumerState<BuyTokenScreen> createState() => _BuyTokenScreenState();
}

class _BuyTokenScreenState extends ConsumerState<BuyTokenScreen> {
  final _amountController = TextEditingController(text: '1');
  bool  _loading = false;
  String? _error;
  String? _successTx;

  double get _amount => double.tryParse(_amountController.text) ?? 0;
  double get _totalGst => _amount * widget.sale.priceGst;

  @override
  void dispose() {
    _amountController.dispose();
    super.dispose();
  }

  Future<void> _buy() async {
    if (_amount <= 0) {
      setState(() => _error = 'Enter a valid amount');
      return;
    }
    if (_amount > widget.sale.remaining) {
      setState(() => _error = 'Only ${widget.sale.remaining.toStringAsFixed(0)} tokens remaining');
      return;
    }

    final wallet = AuthService.instance.currentUser?.walletAddress;
    if (wallet == null || wallet.isEmpty) {
      setState(() => _error = 'Connect your GhostWallet first');
      return;
    }

    setState(() { _loading = true; _error = null; });
    try {
      final result = await LaunchpadService.instance.buyTokens(
        saleId:      widget.sale.id,
        amount:      _amount,
        buyerWallet: wallet,
      );
      setState(() { _successTx = result['txHash'] as String?; _loading = false; });
    } catch (e) {
      setState(() { _error = e.toString(); _loading = false; });
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = widget.token;
    final s = widget.sale;

    return Scaffold(
      backgroundColor: const Color(0xFF0D0D1A),
      appBar: AppBar(
        backgroundColor: const Color(0xFF0D0D1A),
        iconTheme: const IconThemeData(color: Colors.white),
        title: Text('Buy \$${t.symbol}', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: _successTx != null ? _SuccessState(token: t, amount: _amount, txHash: _successTx) : _BuyForm(this),
      ),
    );
  }
}

// ── Buy form ──────────────────────────────────────────────────────────────────

class _BuyForm extends StatelessWidget {
  const _BuyForm(this.state);
  final _BuyTokenScreenState state;

  @override
  Widget build(BuildContext context) {
    final t = state.widget.token;
    final s = state.widget.sale;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Token summary card
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            gradient: const LinearGradient(
              colors: [Color(0xFF1A1A2E), Color(0xFF16213E)],
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
            ),
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: const Color(0xFF7B2FBE).withAlpha(77)),
          ),
          child: Row(
            children: [
              Container(
                width: 52, height: 52,
                decoration: BoxDecoration(
                  gradient: const LinearGradient(colors: [Color(0xFF7B2FBE), Color(0xFF00D4FF)]),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Center(
                  child: Text(t.symbol.isNotEmpty ? t.symbol[0] : '?',
                      style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 24)),
                ),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(t.name, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 15)),
                    Text('\$${t.symbol}', style: const TextStyle(color: Color(0xFF00D4FF), fontSize: 12)),
                  ],
                ),
              ),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text('${s.priceGst} GST', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                  Text('per token', style: const TextStyle(color: Colors.white38, fontSize: 10)),
                ],
              ),
            ],
          ),
        ),
        const SizedBox(height: 24),

        // Sale status
        _InfoRow('Sale ends', _relTime(s.endsAt)),
        const SizedBox(height: 6),
        _InfoRow('Remaining', '${s.remaining.toStringAsFixed(0)} tokens'),
        const SizedBox(height: 6),
        ClipRRect(
          borderRadius: BorderRadius.circular(4),
          child: LinearProgressIndicator(
            value: s.progress.clamp(0.0, 1.0),
            backgroundColor: Colors.white12,
            valueColor: const AlwaysStoppedAnimation(Color(0xFF7B2FBE)),
            minHeight: 6,
          ),
        ),
        const SizedBox(height: 24),

        // Amount input
        const Text('Amount', style: TextStyle(color: Colors.white70, fontWeight: FontWeight.bold)),
        const SizedBox(height: 8),
        Row(
          children: [
            IconButton(
              onPressed: () {
                final v = (state._amount - 1).clamp(1, double.infinity);
                state._amountController.text = v.toStringAsFixed(0);
                (state as _BuyTokenScreenState).setState(() {});
              },
              icon: const Icon(Icons.remove_circle_outline, color: Color(0xFF7B2FBE)),
            ),
            Expanded(
              child: TextField(
                controller: state._amountController,
                keyboardType: const TextInputType.numberWithOptions(decimal: false),
                style: const TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold),
                textAlign: TextAlign.center,
                onChanged: (_) => (state as _BuyTokenScreenState).setState(() {}),
                decoration: InputDecoration(
                  filled: true,
                  fillColor: const Color(0xFF1A1A2E),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(10),
                    borderSide: const BorderSide(color: Color(0xFF7B2FBE)),
                  ),
                  focusedBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(10),
                    borderSide: const BorderSide(color: Color(0xFF00D4FF)),
                  ),
                ),
              ),
            ),
            IconButton(
              onPressed: () {
                final v = state._amount + 1;
                state._amountController.text = v.toStringAsFixed(0);
                (state as _BuyTokenScreenState).setState(() {});
              },
              icon: const Icon(Icons.add_circle_outline, color: Color(0xFF7B2FBE)),
            ),
          ],
        ),
        const SizedBox(height: 20),

        // Total cost
        Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: const Color(0xFF7B2FBE).withAlpha(26),
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: const Color(0xFF7B2FBE).withAlpha(77)),
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text('Total Cost', style: TextStyle(color: Colors.white70)),
              Text('${state._totalGst.toStringAsFixed(4)} GST',
                  style: const TextStyle(color: Color(0xFF00D4FF), fontWeight: FontWeight.bold, fontSize: 16)),
            ],
          ),
        ),
        const SizedBox(height: 10),

        if (state._error != null)
          Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: Text(state._error!, style: const TextStyle(color: Colors.red)),
          ),

        const SizedBox(height: 8),
        SizedBox(
          width: double.infinity,
          height: 52,
          child: ElevatedButton(
            onPressed: state._loading ? null : state._buy,
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF7B2FBE),
              foregroundColor: Colors.white,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              disabledBackgroundColor: const Color(0xFF7B2FBE).withAlpha(100),
            ),
            child: state._loading
                ? const SizedBox(width: 22, height: 22,
                    child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                : const Text('Buy with GST', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
          ),
        ),
        const SizedBox(height: 14),
        const Text(
          'Transactions are processed on GhostL3 (chain_id 903). GST is debited from your GhostWallet.',
          style: TextStyle(color: Colors.white24, fontSize: 11),
          textAlign: TextAlign.center,
        ),
      ],
    );
  }

  String _relTime(DateTime dt) {
    final diff = dt.difference(DateTime.now());
    if (diff.isNegative) return 'ended';
    if (diff.inDays > 0) return '${diff.inDays}d ${diff.inHours % 24}h remaining';
    if (diff.inHours > 0) return '${diff.inHours}h ${diff.inMinutes % 60}m remaining';
    return '${diff.inMinutes}m remaining';
  }
}

// ── Info row ──────────────────────────────────────────────────────────────────

class _InfoRow extends StatelessWidget {
  const _InfoRow(this.label, this.value);
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(label, style: const TextStyle(color: Colors.white54, fontSize: 12)),
        Text(value, style: const TextStyle(color: Colors.white70, fontSize: 12, fontWeight: FontWeight.bold)),
      ],
    );
  }
}

// ── Success state ─────────────────────────────────────────────────────────────

class _SuccessState extends StatelessWidget {
  const _SuccessState({required this.token, required this.amount, this.txHash});
  final CreatorTokenModel token;
  final double            amount;
  final String?           txHash;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        const SizedBox(height: 40),
        Container(
          width: 80, height: 80,
          decoration: const BoxDecoration(
            gradient: LinearGradient(colors: [Color(0xFF7B2FBE), Color(0xFF00D4FF)]),
            shape: BoxShape.circle,
          ),
          child: const Icon(Icons.check, color: Colors.white, size: 44),
        ),
        const SizedBox(height: 24),
        Text('Purchase Complete!', style: const TextStyle(color: Colors.white, fontSize: 22, fontWeight: FontWeight.bold)),
        const SizedBox(height: 8),
        Text('You received ${amount.toStringAsFixed(0)} \$${token.symbol} tokens',
            style: const TextStyle(color: Color(0xFF00D4FF), fontSize: 14)),
        if (txHash != null) ...[
          const SizedBox(height: 16),
          Text('TX: ${txHash!.substring(0, 18)}…',
              style: const TextStyle(color: Colors.white38, fontSize: 11)),
        ],
        const SizedBox(height: 32),
        ElevatedButton(
          onPressed: () => Navigator.pop(context),
          style: ElevatedButton.styleFrom(
            backgroundColor: const Color(0xFF7B2FBE),
            foregroundColor: Colors.white,
            padding: const EdgeInsets.symmetric(horizontal: 40, vertical: 14),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          ),
          child: const Text('Back to Token', style: TextStyle(fontWeight: FontWeight.bold)),
        ),
      ],
    );
  }
}
