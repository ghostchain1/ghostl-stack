import 'dart:convert';
import 'package:http/http.dart' as http;
import '../core/constants/app_constants.dart';
import '../models/wallet_model.dart';

class WalletService {
  WalletService._();
  static final WalletService instance = WalletService._();

  String? _authToken;

  void setAuthToken(String token) => _authToken = token;

  Map<String, String> get _headers => {
        'Content-Type': 'application/json',
        if (_authToken != null) 'Authorization': 'Bearer $_authToken',
      };

  Uri _uri(String path) => Uri.parse('$kApiBaseUrl$path');

  Future<WalletModel> getBalance() async {
    final res = await http.get(_uri('/wallet/balance'), headers: _headers);
    if (res.statusCode != 200) {
      throw Exception('Failed to fetch balance: ${res.statusCode}');
    }
    return WalletModel.fromJson(
        json.decode(res.body) as Map<String, dynamic>);
  }

  /// Initiates a GST withdrawal to the GhostL3 (chain 903) wallet address.
  Future<Map<String, dynamic>> withdrawGst({
    required double amount,
    required String toAddress,
  }) async {
    // Enforce GhostL3 only — all withdrawals settle on chain 903
    final body = {
      'amount': amount,
      'toAddress': toAddress,
      'chainId': kGhostL3ChainId, // 903 — no other chain is permitted
    };
    final res = await http.post(
      _uri('/wallet/withdraw'),
      headers: _headers,
      body: json.encode(body),
    );
    if (res.statusCode != 200) {
      throw Exception('Withdrawal failed: ${res.body}');
    }
    return json.decode(res.body) as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> getCreatorTreasury(String userId) async {
    final res = await http.get(
        _uri('/wallet/treasury/$userId'), headers: _headers);
    if (res.statusCode != 200) {
      throw Exception('Failed to fetch treasury: ${res.statusCode}');
    }
    return json.decode(res.body) as Map<String, dynamic>;
  }

  Future<void> stakeGst(double amount) async {
    final res = await http.post(
      _uri('/wallet/stake'),
      headers: _headers,
      body: json.encode({'amount': amount, 'chainId': kGhostL3ChainId}),
    );
    if (res.statusCode != 200) {
      throw Exception('Staking failed: ${res.body}');
    }
  }
}
