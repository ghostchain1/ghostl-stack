import 'dart:convert';
import 'package:http/http.dart' as http;

/// Manages creator token launches and vesting on GhostL3.
class CreatorTokenService {
  CreatorTokenService._();
  static final CreatorTokenService instance = CreatorTokenService._();

  static const _l3Rpc = 'http://localhost:39545';

  /// Launch a new creator token on GhostL3.
  Future<String> launchToken({
    required String creatorAddress,
    required String name,
    required String symbol,
    required BigInt totalSupply,
    required int vestingMonths,
  }) async {
    final res = await http.post(
      Uri.parse(_l3Rpc),
      headers: {'Content-Type': 'application/json'},
      body: json.encode({
        'jsonrpc': '2.0',
        'method': 'ghost_launchCreatorToken',
        'params': [
          creatorAddress,
          name,
          symbol,
          totalSupply.toString(),
          vestingMonths,
        ],
        'id': 1,
      }),
    );
    if (res.statusCode != 200) {
      throw Exception('CreatorTokenService.launchToken: ${res.statusCode}');
    }
    final body = json.decode(res.body) as Map<String, dynamic>;
    return body['result'] as String; // tx hash
  }

  /// Get the current price of a creator token in GST.
  Future<double> getTokenPrice(String tokenAddress) async {
    final res = await http.post(
      Uri.parse(_l3Rpc),
      headers: {'Content-Type': 'application/json'},
      body: json.encode({
        'jsonrpc': '2.0',
        'method': 'ghost_getCreatorTokenPrice',
        'params': [tokenAddress],
        'id': 1,
      }),
    );
    if (res.statusCode != 200) return 0;
    final body = json.decode(res.body) as Map<String, dynamic>;
    final raw = body['result'];
    if (raw is num) return raw.toDouble();
    if (raw is String) return double.tryParse(raw) ?? 0;
    return 0;
  }

  /// Buy creator tokens using GST.
  Future<String> buyToken({
    required String buyerAddress,
    required String tokenAddress,
    required BigInt gstAmountWei,
  }) async {
    final res = await http.post(
      Uri.parse(_l3Rpc),
      headers: {'Content-Type': 'application/json'},
      body: json.encode({
        'jsonrpc': '2.0',
        'method': 'ghost_buyCreatorToken',
        'params': [buyerAddress, tokenAddress, gstAmountWei.toString()],
        'id': 1,
      }),
    );
    if (res.statusCode != 200) {
      throw Exception('CreatorTokenService.buyToken: ${res.statusCode}');
    }
    final body = json.decode(res.body) as Map<String, dynamic>;
    return body['result'] as String; // tx hash
  }

  /// Fetch vesting schedule for a creator's token.
  Future<List<Map<String, dynamic>>> getVestingSchedule(
      String tokenAddress) async {
    final res = await http.post(
      Uri.parse(_l3Rpc),
      headers: {'Content-Type': 'application/json'},
      body: json.encode({
        'jsonrpc': '2.0',
        'method': 'ghost_getVestingSchedule',
        'params': [tokenAddress],
        'id': 1,
      }),
    );
    if (res.statusCode != 200) return [];
    final body = json.decode(res.body) as Map<String, dynamic>;
    return List<Map<String, dynamic>>.from(
        body['result'] as List<dynamic>? ?? []);
  }
}
