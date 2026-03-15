import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../services/payment_service.dart';
import '../../core/constants/app_constants.dart';

// ── Providers ─────────────────────────────────────────────────────────────────

/// Selected fiat amount (USD) the user wants to spend.
final _selectedAmountProvider = StateProvider<double>((ref) => 10.0);

/// Selected payment method.
final _selectedMethodProvider = StateProvider<String>((ref) => 'credit_card');

/// Selected fiat currency.
final _selectedCurrencyProvider = StateProvider<String>((ref) => 'USD');

/// Auto-fetched conversion preview whenever amount/currency changes.
final _conversionPreviewProvider = FutureProvider.autoDispose<ConversionPreview>((ref) {
  final amount   = ref.watch(_selectedAmountProvider);
  final currency = ref.watch(_selectedCurrencyProvider);
  return PaymentService.instance.previewConversion(
    fiatAmount:   amount,
    fiatCurrency: currency,
  );
});

// ── Constants ─────────────────────────────────────────────────────────────────

const _kPrimary  = Color(0xFF7B2FBE);
const _kAccent   = Color(0xFF00D4FF);
const _kGold     = Color(0xFFFFD700);
const _kCard     = Color(0xFF1A1A2E);
const _kBg       = Color(0xFF0F0F1A);

const List<double> _quickAmounts = [5, 10, 25, 50, 100, 250];

const Map<String, Map<String, dynamic>> _paymentMethods = {
  'credit_card':   {'label': 'Credit / Debit Card', 'icon': Icons.credit_card},
  'apple_pay':     {'label': 'Apple Pay',            'icon': Icons.apple},
  'google_pay':    {'label': 'Google Pay',           'icon': Icons.g_mobiledata},
  'bank_transfer': {'label': 'Bank Transfer',        'icon': Icons.account_balance},
  'crypto_wallet': {'label': 'Crypto Wallet',        'icon': Icons.currency_bitcoin},
};

const List<String> _currencies = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY'];

// ── Screen ────────────────────────────────────────────────────────────────────

class BuyGSTScreen extends ConsumerWidget {
  final String userId;
  final String walletAddress;

  const BuyGSTScreen({
    super.key,
    required this.userId,
    required this.walletAddress,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final selectedAmount   = ref.watch(_selectedAmountProvider);
    final selectedMethod   = ref.watch(_selectedMethodProvider);
    final selectedCurrency = ref.watch(_selectedCurrencyProvider);
    final preview          = ref.watch(_conversionPreviewProvider);

    return Scaffold(
      backgroundColor: _kBg,
      appBar: AppBar(
        backgroundColor: _kBg,
        foregroundColor: Colors.white,
        title: Row(children: [
          const Icon(Icons.bolt, color: _kGold, size: 22),
          const SizedBox(width: 8),
          Text('Buy $kGstSymbol', style: const TextStyle(fontWeight: FontWeight.bold)),
        ]),
        actions: [
          // Currency picker
          Padding(
            padding: const EdgeInsets.only(right: 12),
            child: DropdownButton<String>(
              value: selectedCurrency,
              dropdownColor: _kCard,
              style: const TextStyle(color: Colors.white),
              underline: const SizedBox(),
              items: _currencies.map((c) => DropdownMenuItem(
                value: c,
                child: Text(c, style: const TextStyle(color: Colors.white)),
              )).toList(),
              onChanged: (c) {
                if (c != null) ref.read(_selectedCurrencyProvider.notifier).state = c;
              },
            ),
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          // ── GST preview card ─────────────────────────────────────────────
          _GSTPreviewCard(preview: preview),
          const SizedBox(height: 24),

          // ── Quick amount chips ────────────────────────────────────────────
          Text('Select Amount ($selectedCurrency)', style: const TextStyle(
            color: Colors.white70, fontSize: 13, letterSpacing: 0.5,
          )),
          const SizedBox(height: 12),
          Wrap(
            spacing: 10,
            runSpacing: 10,
            children: _quickAmounts.map((amount) {
              final selected = amount == selectedAmount;
              return GestureDetector(
                onTap: () => ref.read(_selectedAmountProvider.notifier).state = amount,
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 180),
                  padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 12),
                  decoration: BoxDecoration(
                    gradient: selected
                        ? const LinearGradient(colors: [_kPrimary, _kAccent])
                        : null,
                    color: selected ? null : _kCard,
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(
                      color: selected ? Colors.transparent : Colors.white24,
                    ),
                  ),
                  child: Text(
                    '$selectedCurrency ${amount.toStringAsFixed(0)}',
                    style: TextStyle(
                      color: selected ? Colors.white : Colors.white60,
                      fontWeight: selected ? FontWeight.bold : FontWeight.normal,
                    ),
                  ),
                ),
              );
            }).toList(),
          ),
          const SizedBox(height: 24),

          // ── Payment method ────────────────────────────────────────────────
          const Text('Payment Method', style: TextStyle(
            color: Colors.white70, fontSize: 13, letterSpacing: 0.5,
          )),
          const SizedBox(height: 12),
          ..._paymentMethods.entries.map((e) {
            final selected = e.key == selectedMethod;
            return GestureDetector(
              onTap: () => ref.read(_selectedMethodProvider.notifier).state = e.key,
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 150),
                margin: const EdgeInsets.only(bottom: 8),
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                decoration: BoxDecoration(
                  color: selected ? _kPrimary.withOpacity(0.25) : _kCard,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(
                    color: selected ? _kPrimary : Colors.white12,
                    width: selected ? 1.5 : 1,
                  ),
                ),
                child: Row(children: [
                  Icon(e.value['icon'] as IconData,
                      color: selected ? _kAccent : Colors.white54, size: 22),
                  const SizedBox(width: 14),
                  Text(e.value['label'] as String,
                      style: TextStyle(
                        color: selected ? Colors.white : Colors.white60,
                        fontWeight: selected ? FontWeight.w600 : FontWeight.normal,
                      )),
                  const Spacer(),
                  if (selected)
                    const Icon(Icons.check_circle, color: _kAccent, size: 20),
                ]),
              ),
            );
          }),
          const SizedBox(height: 32),

          // ── Confirm button ────────────────────────────────────────────────
          _ConfirmButton(
            userId:        userId,
            walletAddress: walletAddress,
            fiatAmount:    selectedAmount,
            fiatCurrency:  selectedCurrency,
            paymentMethod: selectedMethod,
            preview:       preview,
          ),

          const SizedBox(height: 16),
          const Center(
            child: Text(
              '2% platform fee included · Settles on GhostL3 · Powered by GhostBrain',
              textAlign: TextAlign.center,
              style: TextStyle(color: Colors.white38, fontSize: 11),
            ),
          ),
        ],
      ),
    );
  }
}

// ── GST Preview Card ──────────────────────────────────────────────────────────

class _GSTPreviewCard extends StatelessWidget {
  final AsyncValue<ConversionPreview> preview;
  const _GSTPreviewCard({required this.preview});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [Color(0xFF7B2FBE), Color(0xFF00D4FF)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(20),
        boxShadow: [
          BoxShadow(
            color: _kPrimary.withOpacity(0.4),
            blurRadius: 20,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: preview.when(
        loading: () => const Center(
          child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2),
        ),
        error: (e, _) => Text('Preview unavailable: $e',
            style: const TextStyle(color: Colors.white70)),
        data: (p) => Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('You receive', style: TextStyle(color: Colors.white60, fontSize: 13)),
            const SizedBox(height: 6),
            Text(
              '${p.gstAmount.toStringAsFixed(2)} $kGstSymbol',
              style: const TextStyle(
                color: Colors.white,
                fontSize: 36,
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 2),
            Text(
              '≈ ${p.fiatCurrency} ${p.fiatAmount.toStringAsFixed(2)} · 1 $kGstSymbol = \$${(1 / (p.gstAmount / p.usdAmount)).toStringAsFixed(4)}',
              style: const TextStyle(color: Colors.white60, fontSize: 12),
            ),
            const SizedBox(height: 10),
            Row(children: [
              const Icon(Icons.info_outline, color: Colors.white38, size: 14),
              const SizedBox(width: 4),
              Text('${p.platformFee} fee applied',
                  style: const TextStyle(color: Colors.white38, fontSize: 12)),
            ]),
          ],
        ),
      ),
    );
  }
}

// ── Confirm Button ────────────────────────────────────────────────────────────

class _ConfirmButton extends ConsumerStatefulWidget {
  final String userId;
  final String walletAddress;
  final double fiatAmount;
  final String fiatCurrency;
  final String paymentMethod;
  final AsyncValue<ConversionPreview> preview;

  const _ConfirmButton({
    required this.userId,
    required this.walletAddress,
    required this.fiatAmount,
    required this.fiatCurrency,
    required this.paymentMethod,
    required this.preview,
  });

  @override
  ConsumerState<_ConfirmButton> createState() => _ConfirmButtonState();
}

class _ConfirmButtonState extends ConsumerState<_ConfirmButton> {
  bool _loading = false;

  Future<void> _onConfirm() async {
    if (_loading || widget.preview.value == null) return;
    setState(() => _loading = true);
    try {
      final intent = await PaymentService.instance.initiatePayment(
        userId:        widget.userId,
        walletAddress: widget.walletAddress,
        fiatAmount:    widget.fiatAmount,
        fiatCurrency:  widget.fiatCurrency,
        paymentMethod: widget.paymentMethod,
      );
      if (!mounted) return;
      await _showReceiptDialog(context, intent, widget.preview.value!);
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Payment failed: $e'),
          backgroundColor: Colors.red[700],
        ),
      );
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _showReceiptDialog(
    BuildContext context,
    PaymentIntent intent,
    ConversionPreview preview,
  ) async {
    await showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (_) => AlertDialog(
        backgroundColor: _kCard,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        title: const Row(children: [
          Icon(Icons.check_circle, color: _kAccent, size: 28),
          SizedBox(width: 10),
          Text('Payment Initiated', style: TextStyle(color: Colors.white)),
        ]),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _receiptRow('Amount', '${preview.fiatCurrency} ${preview.fiatAmount.toStringAsFixed(2)}'),
            _receiptRow('$kGstSymbol to receive', '${preview.gstAmount.toStringAsFixed(2)} $kGstSymbol'),
            _receiptRow('Method', widget.paymentMethod.replaceAll('_', ' ')),
            _receiptRow('Ref', intent.txId.substring(0, 8).toUpperCase()),
            const SizedBox(height: 8),
            const Text(
              'Your GST will be credited to your GhostL3 wallet once payment is confirmed.',
              style: TextStyle(color: Colors.white54, fontSize: 12),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Close', style: TextStyle(color: _kAccent)),
          ),
        ],
      ),
    );
  }

  Widget _receiptRow(String label, String value) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 4),
    child: Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(label, style: const TextStyle(color: Colors.white54, fontSize: 13)),
        Text(value,  style: const TextStyle(color: Colors.white, fontSize: 13,
            fontWeight: FontWeight.w600)),
      ],
    ),
  );

  @override
  Widget build(BuildContext context) {
    final ready = widget.preview.hasValue && !_loading;
    return SizedBox(
      width: double.infinity,
      height: 54,
      child: DecoratedBox(
        decoration: BoxDecoration(
          gradient: ready
              ? const LinearGradient(colors: [_kPrimary, _kAccent])
              : null,
          color: ready ? null : Colors.white12,
          borderRadius: BorderRadius.circular(14),
        ),
        child: ElevatedButton(
          style: ElevatedButton.styleFrom(
            backgroundColor: Colors.transparent,
            shadowColor: Colors.transparent,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
          ),
          onPressed: ready ? _onConfirm : null,
          child: _loading
              ? const SizedBox(
                  width: 22,
                  height: 22,
                  child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2),
                )
              : Text(
                  'Buy $kGstSymbol — ${widget.fiatCurrency} ${widget.fiatAmount.toStringAsFixed(0)}',
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 16,
                    fontWeight: FontWeight.bold,
                    letterSpacing: 0.5,
                  ),
                ),
        ),
      ),
    );
  }
}
