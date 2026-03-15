import 'dart:convert';
import 'package:http/http.dart' as http;
import '../models/creator_token_model.dart';
import 'api_service.dart';

class LaunchpadService {
  LaunchpadService._();
  static final instance = LaunchpadService._();

  String get _base => '${ApiService.instance.baseUrl}/launchpad';

  Map<String, String> get _headers => ApiService.instance.authHeaders;

  // ── Token registry ─────────────────────────────────────────────────────────

  Future<List<CreatorTokenModel>> listTokens({int page = 0, int pageSize = 20}) async {
    final res = await http.get(Uri.parse('$_base/tokens?page=$page&pageSize=$pageSize'), headers: _headers);
    _check(res);
    final body = jsonDecode(res.body) as Map<String, dynamic>;
    return (body['tokens'] as List).map((e) => CreatorTokenModel.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<List<CreatorTokenModel>> searchTokens(String query) async {
    final res = await http.get(Uri.parse('$_base/tokens/search?q=${Uri.encodeComponent(query)}'), headers: _headers);
    _check(res);
    return (jsonDecode(res.body) as List).map((e) => CreatorTokenModel.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<CreatorTokenModel> getToken(String id) async {
    final res = await http.get(Uri.parse('$_base/tokens/$id'), headers: _headers);
    _check(res);
    return CreatorTokenModel.fromJson(jsonDecode(res.body) as Map<String, dynamic>);
  }

  Future<CreatorTokenModel?> getMyToken() async {
    final res = await http.get(Uri.parse('$_base/my-token'), headers: _headers);
    if (res.statusCode == 404) return null;
    _check(res);
    return CreatorTokenModel.fromJson(jsonDecode(res.body) as Map<String, dynamic>);
  }

  Future<CreatorTokenModel> launchToken({
    required String name,
    required String symbol,
    required double maxSupply,
    required String creatorWallet,
  }) async {
    final res = await http.post(
      Uri.parse('$_base/launch'),
      headers: {..._headers, 'Content-Type': 'application/json'},
      body: jsonEncode({'name': name, 'symbol': symbol, 'maxSupply': maxSupply, 'creatorWallet': creatorWallet}),
    );
    _check(res);
    return CreatorTokenModel.fromJson(jsonDecode(res.body) as Map<String, dynamic>);
  }

  Future<void> confirmLaunch(String tokenId, {required String tokenAddress, required String factoryTxHash}) async {
    final res = await http.post(
      Uri.parse('$_base/tokens/$tokenId/confirm'),
      headers: {..._headers, 'Content-Type': 'application/json'},
      body: jsonEncode({'tokenAddress': tokenAddress, 'factoryTxHash': factoryTxHash}),
    );
    _check(res);
  }

  // ── Sales ──────────────────────────────────────────────────────────────────

  Future<List<TokenSaleModel>> listActiveSales() async {
    final res = await http.get(Uri.parse('$_base/sales/active'), headers: _headers);
    _check(res);
    return (jsonDecode(res.body) as List).map((e) => TokenSaleModel.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<List<TokenSaleModel>> listSalesForToken(String tokenId) async {
    final res = await http.get(Uri.parse('$_base/tokens/$tokenId/sales'), headers: _headers);
    _check(res);
    return (jsonDecode(res.body) as List).map((e) => TokenSaleModel.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<TokenSaleModel> createSale({
    required String tokenId,
    required double priceGst,
    required double totalForSale,
    required DateTime startsAt,
    required DateTime endsAt,
  }) async {
    final res = await http.post(
      Uri.parse('$_base/tokens/$tokenId/sales'),
      headers: {..._headers, 'Content-Type': 'application/json'},
      body: jsonEncode({
        'priceGst':     priceGst,
        'totalForSale': totalForSale,
        'startsAt':     startsAt.toIso8601String(),
        'endsAt':       endsAt.toIso8601String(),
      }),
    );
    _check(res);
    return TokenSaleModel.fromJson(jsonDecode(res.body) as Map<String, dynamic>);
  }

  Future<Map<String, dynamic>> buyTokens({
    required String saleId,
    required double amount,
    required String buyerWallet,
    String? txHash,
  }) async {
    final res = await http.post(
      Uri.parse('$_base/buy'),
      headers: {..._headers, 'Content-Type': 'application/json'},
      body: jsonEncode({'saleId': saleId, 'amount': amount, 'buyerWallet': buyerWallet, if (txHash != null) 'txHash': txHash}),
    );
    _check(res);
    return jsonDecode(res.body) as Map<String, dynamic>;
  }

  // ── Fan rewards ────────────────────────────────────────────────────────────

  Future<FanRewardStatus> getMyRewards(String tokenId) async {
    final res = await http.get(Uri.parse('$_base/tokens/$tokenId/my-rewards'), headers: _headers);
    _check(res);
    return FanRewardStatus.fromJson(jsonDecode(res.body) as Map<String, dynamic>);
  }

  Future<List<Map<String, dynamic>>> getTopFans(String tokenId) async {
    final res = await http.get(Uri.parse('$_base/tokens/$tokenId/top-fans'), headers: _headers);
    _check(res);
    return (jsonDecode(res.body) as List).cast<Map<String, dynamic>>();
  }

  Future<List<Map<String, dynamic>>> getMyHoldings() async {
    final res = await http.get(Uri.parse('$_base/my-holdings'), headers: _headers);
    _check(res);
    return (jsonDecode(res.body) as List).cast<Map<String, dynamic>>();
  }

  // ── DAO ────────────────────────────────────────────────────────────────────

  Future<List<DAOProposalModel>> listProposals(String tokenId, {bool activeOnly = false}) async {
    final path = activeOnly ? '$_base/tokens/$tokenId/proposals/active' : '$_base/tokens/$tokenId/proposals';
    final res = await http.get(Uri.parse(path), headers: _headers);
    _check(res);
    return (jsonDecode(res.body) as List).map((e) => DAOProposalModel.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<DAOProposalModel> submitProposal({
    required String tokenId,
    required String description,
    int votingDays = 7,
  }) async {
    final res = await http.post(
      Uri.parse('$_base/tokens/$tokenId/proposals'),
      headers: {..._headers, 'Content-Type': 'application/json'},
      body: jsonEncode({'description': description, 'votingDays': votingDays}),
    );
    _check(res);
    return DAOProposalModel.fromJson(jsonDecode(res.body) as Map<String, dynamic>);
  }

  Future<void> vote(String proposalId, {required bool support}) async {
    final res = await http.post(
      Uri.parse('$_base/proposals/$proposalId/vote'),
      headers: {..._headers, 'Content-Type': 'application/json'},
      body: jsonEncode({'support': support}),
    );
    _check(res);
  }

  Future<Map<String, dynamic>> executeProposal(String proposalId) async {
    final res = await http.post(Uri.parse('$_base/proposals/$proposalId/execute'), headers: _headers);
    _check(res);
    return jsonDecode(res.body) as Map<String, dynamic>;
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  void _check(http.Response res) {
    if (res.statusCode >= 400) {
      final body = jsonDecode(res.body) as Map<String, dynamic>;
      throw Exception(body['error'] ?? 'Request failed (${res.statusCode})');
    }
  }
}
