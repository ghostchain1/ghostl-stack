import 'dart:convert';
import 'package:http/http.dart' as http;

/// CoinSellerService — purchase GST-backed platform coins via the
/// GhostChain reseller/agency network.
///
/// Platform coins are an in-app medium of exchange backed by GST on GhostL3.
/// Users purchase coin packages; the backend settles the GST transfer on-chain.
class CoinSellerService {
  final String _apiBase;
  final String? _bearerToken;

  CoinSellerService({required String apiBase, String? bearerToken})
      : _apiBase = apiBase,
        _bearerToken = bearerToken;

  Map<String, String> get _headers => {
        'Content-Type': 'application/json',
        if (_bearerToken != null) 'Authorization': 'Bearer $_bearerToken',
      };

  /// List available coin packages (e.g. 100 coins = 5 GST).
  Future<List<Map<String, dynamic>>> getPackages() async {
    final res = await http.get(
      Uri.parse('$_apiBase/coins/packages'),
      headers: _headers,
    );
    if (res.statusCode != 200) {
      throw Exception('Failed to load coin packages: ${res.statusCode}');
    }
    final data = json.decode(res.body) as List<dynamic>;
    return data.whereType<Map<String, dynamic>>().toList();
  }

  /// Initiate a coin package purchase on GhostL3.
  /// Returns a payment intent with [purchaseId] and [gstAmountWei] to sign.
  Future<Map<String, dynamic>> purchasePackage({
    required String packageId,
    required String buyerAddress,
  }) async {
    final res = await http.post(
      Uri.parse('$_apiBase/coins/purchase'),
      headers: _headers,
      body: json.encode({
        'packageId': packageId,
        'buyerAddress': buyerAddress,
        'chainId': 903, // GhostL3 — enforced
      }),
    );
    if (res.statusCode != 200 && res.statusCode != 201) {
      throw Exception('Coin purchase initiation failed: ${res.body}');
    }
    return json.decode(res.body) as Map<String, dynamic>;
  }

  /// Confirm a completed coin purchase after the GhostL3 tx has settled.
  Future<bool> confirmPurchase({
    required String purchaseId,
    required String txHash,
  }) async {
    final res = await http.post(
      Uri.parse('$_apiBase/coins/confirm'),
      headers: _headers,
      body: json.encode({
        'purchaseId': purchaseId,
        'txHash': txHash,
        'chainId': 903,
      }),
    );
    return res.statusCode == 200;
  }

  /// Get the user's current platform coin balance.
  Future<int> getCoinBalance(String address) async {
    final res = await http.get(
      Uri.parse('$_apiBase/coins/balance/$address'),
      headers: _headers,
    );
    if (res.statusCode != 200) return 0;
    final data = json.decode(res.body) as Map<String, dynamic>;
    return (data['balance'] as num?)?.toInt() ?? 0;
  }

  /// List active resellers/sub-agents for a region.
  Future<List<Map<String, dynamic>>> getResellers({String? region}) async {
    final query = region != null
        ? '?region=${Uri.encodeComponent(region)}'
        : '';
    final res = await http.get(
      Uri.parse('$_apiBase/coins/resellers$query'),
      headers: _headers,
    );
    if (res.statusCode != 200) return [];
    final data = json.decode(res.body) as List<dynamic>;
    return data.whereType<Map<String, dynamic>>().toList();
  }

  /// Get coin transaction history for an address.
  Future<List<Map<String, dynamic>>> getCoinHistory(String address,
      {int limit = 20}) async {
    final res = await http.get(
      Uri.parse('$_apiBase/coins/history/$address?limit=$limit'),
      headers: _headers,
    );
    if (res.statusCode != 200) return [];
    final data = json.decode(res.body) as List<dynamic>;
    return data.whereType<Map<String, dynamic>>().toList();
  }
}
