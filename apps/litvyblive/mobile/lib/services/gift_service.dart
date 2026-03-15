import 'dart:convert';
import 'package:http/http.dart' as http;
import '../core/constants/app_constants.dart';
import '../models/gift_model.dart';

class GiftService {
  GiftService._();
  static final GiftService instance = GiftService._();

  String? _authToken;

  void setAuthToken(String token) => _authToken = token;

  Map<String, String> get _headers => {
        'Content-Type': 'application/json',
        if (_authToken != null) 'Authorization': 'Bearer $_authToken',
      };

  Uri _uri(String path) => Uri.parse('$kApiBaseUrl$path');

  /// Send a quick gift to a live stream. All gift payments are processed
  /// through GhostL3 (chain 903) via the LitVybGiftEngine contract.
  Future<Map<String, dynamic>> sendQuickGift(
    String streamId,
    GiftModel gift,
  ) async {
    final body = {
      'streamId': streamId,
      'giftId': gift.id,
      'giftName': gift.name,
      'price': gift.price,
      'chainId': kGhostL3ChainId, // GhostL3 — never L1 or L2
    };
    final res = await http.post(
      _uri('/gifts/send'),
      headers: _headers,
      body: json.encode(body),
    );
    if (res.statusCode != 200) {
      throw Exception('Gift failed: ${res.body}');
    }
    return json.decode(res.body) as Map<String, dynamic>;
  }

  /// Send a batch of gifts (queued and settled on GhostL3 via GiftBatchProcessor).
  Future<void> sendBatch(List<Map<String, dynamic>> items) async {
    final res = await http.post(
      _uri('/gifts/batch'),
      headers: _headers,
      body: json.encode({'items': items, 'chainId': kGhostL3ChainId}),
    );
    if (res.statusCode != 200) {
      throw Exception('Batch gift failed: ${res.body}');
    }
  }

  Future<List<GiftModel>> getGiftHistory(String userId) async {
    final res = await http.get(
        _uri('/gifts/history/$userId'), headers: _headers);
    if (res.statusCode != 200) {
      throw Exception('Failed to load gift history');
    }
    final data = json.decode(res.body) as List<dynamic>;
    return data.whereType<Map<String, dynamic>>().map(GiftModel.fromJson).toList();
  }
}
