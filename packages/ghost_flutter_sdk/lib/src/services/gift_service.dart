import 'dart:convert';
import 'package:http/http.dart' as http;
import '../ghost_wallet.dart';
import '../ghost_transaction.dart';
import '../models/ghost_token.dart';

/// GhostGiftService — gift sending via the LitVybGiftEngine contract on GhostL3 (chain 903).
class GhostGiftService {
  final String _apiBase;
  final GhostWallet _wallet;
  String? _bearerToken;

  GhostGiftService({
    required String apiBase,
    required GhostWallet wallet,
    String? bearerToken,
  })  : _apiBase = apiBase,
        _wallet = wallet,
        _bearerToken = bearerToken;

  Map<String, String> get _headers => {
        'Content-Type': 'application/json',
        if (_bearerToken != null) 'Authorization': 'Bearer $_bearerToken',
      };

  /// Send a gift to a creator stream. Deducts [priceGst] GST from the sender's
  /// GhostL3 wallet and calls the backend gift engine (which dispatches the
  /// on-chain transaction via LitVybGiftEngine).
  Future<String> sendGift({
    required String streamId,
    required String giftId,
    required int priceGst,
  }) async {
    final body = {
      'streamId': streamId,
      'giftId': giftId,
      'priceWei': GhostToken.toWei(priceGst.toDouble()).toString(),
      'senderAddress': _wallet.address.hex,
      'chainId': 903, // GhostL3 — enforced
    };
    final res = await http.post(
      Uri.parse('$_apiBase/gifts/send-onchain'),
      headers: _headers,
      body: json.encode(body),
    );
    if (res.statusCode != 200) {
      throw Exception('Gift transaction failed: ${res.body}');
    }
    final data = json.decode(res.body) as Map<String, dynamic>;
    return data['txHash'] as String? ?? '';
  }
}
