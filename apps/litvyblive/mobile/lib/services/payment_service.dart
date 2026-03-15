import 'dart:convert';
import 'package:http/http.dart' as http;
import 'api_service.dart';
import '../core/constants/app_constants.dart';

// ── Models ────────────────────────────────────────────────────────────────────

/// A single fiat → GST payment transaction.
class PaymentTransaction {
  final String txId;
  final String userId;
  final String walletAddress;
  final String paymentMethod;
  final double fiatAmount;
  final String fiatCurrency;
  final double gstAmount;
  final double gstRate;
  final String? providerRef;
  final String? chainTxHash;
  final String status;
  final double fraudScore;
  final String? flaggedReason;
  final DateTime createdAt;
  final DateTime updatedAt;

  const PaymentTransaction({
    required this.txId,
    required this.userId,
    required this.walletAddress,
    required this.paymentMethod,
    required this.fiatAmount,
    required this.fiatCurrency,
    required this.gstAmount,
    required this.gstRate,
    this.providerRef,
    this.chainTxHash,
    required this.status,
    required this.fraudScore,
    this.flaggedReason,
    required this.createdAt,
    required this.updatedAt,
  });

  factory PaymentTransaction.fromJson(Map<String, dynamic> j) =>
      PaymentTransaction(
        txId:          j['tx_id'] as String,
        userId:        j['user_id'] as String,
        walletAddress: j['wallet_address'] as String,
        paymentMethod: j['payment_method'] as String,
        fiatAmount:    (j['fiat_amount'] as num).toDouble(),
        fiatCurrency:  j['fiat_currency'] as String,
        gstAmount:     (j['gst_amount'] as num).toDouble(),
        gstRate:       (j['gst_rate'] as num).toDouble(),
        providerRef:   j['provider_ref'] as String?,
        chainTxHash:   j['chain_tx_hash'] as String?,
        status:        j['status'] as String,
        fraudScore:    (j['fraud_score'] as num? ?? 0).toDouble(),
        flaggedReason: j['flagged_reason'] as String?,
        createdAt:     DateTime.parse(j['created_at'] as String),
        updatedAt:     DateTime.parse(j['updated_at'] as String),
      );

  bool get isConfirmed => status == 'confirmed';
  bool get isFlagged   => status == 'flagged';
  bool get isPending   => status == 'pending' || status == 'processing';
  bool get isFailed    => status == 'failed' || status == 'refunded';
}

/// Preview of a fiat → GST conversion (no charge, no transaction created).
class ConversionPreview {
  final double fiatAmount;
  final String fiatCurrency;
  final double usdAmount;
  final double gstAmount;
  final String gstWei;
  final double rateUsed;
  final String platformFee;
  final DateTime convertedAt;

  const ConversionPreview({
    required this.fiatAmount,
    required this.fiatCurrency,
    required this.usdAmount,
    required this.gstAmount,
    required this.gstWei,
    required this.rateUsed,
    required this.platformFee,
    required this.convertedAt,
  });

  factory ConversionPreview.fromJson(Map<String, dynamic> j) =>
      ConversionPreview(
        fiatAmount:   (j['fiatAmount'] as num).toDouble(),
        fiatCurrency: j['fiatCurrency'] as String,
        usdAmount:    (j['usdAmount'] as num).toDouble(),
        gstAmount:    (j['gstAmount'] as num).toDouble(),
        gstWei:       j['gstWei'] as String,
        rateUsed:     (j['rateUsed'] as num).toDouble(),
        platformFee:  j['platformFee'] as String? ?? '2%',
        convertedAt:  DateTime.parse(j['convertedAt'] as String),
      );
}

/// Current exchange rates from the gateway.
class PaymentRates {
  final double gstPriceUSD;
  final double platformFeePct;
  final Map<String, double> fiatPerGST;
  final DateTime updatedAt;

  const PaymentRates({
    required this.gstPriceUSD,
    required this.platformFeePct,
    required this.fiatPerGST,
    required this.updatedAt,
  });

  factory PaymentRates.fromJson(Map<String, dynamic> j) => PaymentRates(
        gstPriceUSD:    (j['gstPriceUSD'] as num).toDouble(),
        platformFeePct: (j['platformFeePct'] as num).toDouble(),
        fiatPerGST:     (j['fiatPerGST'] as Map<String, dynamic>)
            .map((k, v) => MapEntry(k, (v as num).toDouble())),
        updatedAt: DateTime.parse(j['updatedAt'] as String),
      );

  /// Price of 1 GST in the given currency (e.g., 'USD' → 0.10).
  double priceIn(String currency) => fiatPerGST[currency] ?? gstPriceUSD;
}

/// GhostL3 wallet GST balance.
class GSTWalletBalance {
  final String walletAddress;
  final String gstWei;
  final double gstAmount;
  final int chainId;

  const GSTWalletBalance({
    required this.walletAddress,
    required this.gstWei,
    required this.gstAmount,
    required this.chainId,
  });

  factory GSTWalletBalance.fromJson(Map<String, dynamic> j) =>
      GSTWalletBalance(
        walletAddress: j['walletAddress'] as String,
        gstWei:        j['gstWei'] as String,
        gstAmount:     (j['gstAmount'] as num).toDouble(),
        chainId:       j['chainId'] as int,
      );
}

/// Payment intent returned after calling `initiatePayment`.
class PaymentIntent {
  final String txId;
  final String userId;
  final String walletAddress;
  final double fiatAmount;
  final String fiatCurrency;
  final double gstAmount;
  final String gstWei;
  final DateTime createdAt;

  const PaymentIntent({
    required this.txId,
    required this.userId,
    required this.walletAddress,
    required this.fiatAmount,
    required this.fiatCurrency,
    required this.gstAmount,
    required this.gstWei,
    required this.createdAt,
  });

  factory PaymentIntent.fromJson(Map<String, dynamic> j) {
    final intent = j['intent'] as Map<String, dynamic>? ?? j;
    return PaymentIntent(
      txId:          intent['txId'] as String,
      userId:        intent['userId'] as String,
      walletAddress: intent['walletAddress'] as String,
      fiatAmount:    (intent['fiatAmount'] as num).toDouble(),
      fiatCurrency:  intent['fiatCurrency'] as String,
      gstAmount:     (intent['gstAmount'] as num).toDouble(),
      gstWei:        intent['gstWei'] as String,
      createdAt:     DateTime.parse(intent['createdAt'] as String),
    );
  }
}

// ── Service ───────────────────────────────────────────────────────────────────

class PaymentService {
  PaymentService._();
  static final PaymentService instance = PaymentService._();

  final _api = ApiService.instance;

  // ── Conversion preview ─────────────────────────────────────────────────────

  /// Preview how much GST a fiat amount gets (does NOT charge anything).
  Future<ConversionPreview> previewConversion({
    required double fiatAmount,
    String fiatCurrency = 'USD',
  }) async {
    final data = await _api.post('/payments/convert/preview', body: {
      'fiatAmount':   fiatAmount,
      'fiatCurrency': fiatCurrency,
    });
    return ConversionPreview.fromJson(data as Map<String, dynamic>);
  }

  // ── Rates ──────────────────────────────────────────────────────────────────

  /// Fetch current GST/fiat exchange rates.
  Future<PaymentRates> getRates() async {
    final data = await _api.get('/payments/rates');
    return PaymentRates.fromJson(data as Map<String, dynamic>);
  }

  // ── Initiate payment ───────────────────────────────────────────────────────

  /// Create a new payment intent. The user is then redirected to the payment
  /// provider (Stripe, Apple Pay, etc.) externally; the app polls `getTx(txId)`
  /// until status is 'confirmed'.
  Future<PaymentIntent> initiatePayment({
    required String userId,
    required String walletAddress,
    required double fiatAmount,
    String fiatCurrency = 'USD',
    required String paymentMethod,
  }) async {
    final data = await _api.post('/payments/initiate', body: {
      'userId':        userId,
      'walletAddress': walletAddress,
      'fiatAmount':    fiatAmount,
      'fiatCurrency':  fiatCurrency,
      'paymentMethod': paymentMethod,
    });
    return PaymentIntent.fromJson(data as Map<String, dynamic>);
  }

  // ── Transaction status ─────────────────────────────────────────────────────

  /// Fetch a single transaction by ID.
  Future<PaymentTransaction> getTransaction(String txId) async {
    final data = await _api.get('/payments/$txId');
    return PaymentTransaction.fromJson(data as Map<String, dynamic>);
  }

  /// Poll a transaction until it reaches a terminal state, with a timeout.
  Future<PaymentTransaction> pollUntilConfirmed(
    String txId, {
    Duration interval = const Duration(seconds: 3),
    Duration timeout  = const Duration(minutes: 5),
  }) async {
    final deadline = DateTime.now().add(timeout);
    while (DateTime.now().isBefore(deadline)) {
      final tx = await getTransaction(txId);
      if (!tx.isPending) return tx;
      await Future<void>.delayed(interval);
    }
    throw TimeoutException('Payment $txId did not confirm within $timeout');
  }

  // ── Transaction history ────────────────────────────────────────────────────

  /// Fetch the authenticated user's transaction history.
  Future<List<PaymentTransaction>> getTransactionHistory({
    required String userId,
    int limit = 50,
  }) async {
    final data = await _api.get(
      '/payments/user/$userId',
      query: {'limit': '$limit'},
    );
    final map = data as Map<String, dynamic>;
    return (map['transactions'] as List)
        .map((e) => PaymentTransaction.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  // ── Balance ────────────────────────────────────────────────────────────────

  /// Fetch current GST balance for a GhostL3 wallet.
  Future<GSTWalletBalance> getWalletBalance(String walletAddress) async {
    final data = await _api.get('/payments/balance/$walletAddress');
    return GSTWalletBalance.fromJson(data as Map<String, dynamic>);
  }
}

class TimeoutException implements Exception {
  final String message;
  const TimeoutException(this.message);
  @override
  String toString() => 'TimeoutException: $message';
}
