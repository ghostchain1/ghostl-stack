import 'dart:convert';
import 'package:http/http.dart' as http;

/// AgencyService — agency onboarding, creator signing, and commission flows.
///
/// Agencies earn a configurable commission (%) on creator GST earnings.
/// Commissions are settled on GhostL3 (chain 903) via the AgencyRegistry
/// contract and claimed to the agency owner's wallet.
class AgencyService {
  final String _apiBase;
  final String? _bearerToken;

  AgencyService({required String apiBase, String? bearerToken})
      : _apiBase = apiBase,
        _bearerToken = bearerToken;

  Map<String, String> get _headers => {
        'Content-Type': 'application/json',
        if (_bearerToken != null) 'Authorization': 'Bearer $_bearerToken',
      };

  /// Register a new agency on GhostL3.
  /// Returns an agency record with [agencyId] and [txHash].
  Future<Map<String, dynamic>> registerAgency({
    required String name,
    required String ownerAddress,
    required double commissionPercent,
  }) async {
    if (commissionPercent < 0 || commissionPercent > 30) {
      throw ArgumentError('commissionPercent must be between 0 and 30');
    }
    final res = await http.post(
      Uri.parse('$_apiBase/agency/register'),
      headers: _headers,
      body: json.encode({
        'name': name,
        'ownerAddress': ownerAddress,
        'commissionPercent': commissionPercent,
        'chainId': 903,
      }),
    );
    if (res.statusCode != 200 && res.statusCode != 201) {
      throw Exception('Agency registration failed: ${res.body}');
    }
    return json.decode(res.body) as Map<String, dynamic>;
  }

  /// Sign a creator to the agency under a fixed-term contract.
  /// Returns the on-chain [txHash] of the signed contract.
  Future<String> signCreator({
    required String agencyId,
    required String creatorAddress,
    required int contractMonths,
  }) async {
    final res = await http.post(
      Uri.parse('$_apiBase/agency/sign-creator'),
      headers: _headers,
      body: json.encode({
        'agencyId': agencyId,
        'creatorAddress': creatorAddress,
        'contractMonths': contractMonths,
        'chainId': 903,
      }),
    );
    if (res.statusCode != 200 && res.statusCode != 201) {
      throw Exception('Creator signing failed: ${res.body}');
    }
    final data = json.decode(res.body) as Map<String, dynamic>;
    return data['txHash'] as String? ?? '';
  }

  /// Terminate a creator contract early (requires agency owner auth).
  Future<String> terminateContract({
    required String agencyId,
    required String creatorAddress,
    required String reason,
  }) async {
    final res = await http.post(
      Uri.parse('$_apiBase/agency/terminate'),
      headers: _headers,
      body: json.encode({
        'agencyId': agencyId,
        'creatorAddress': creatorAddress,
        'reason': reason,
        'chainId': 903,
      }),
    );
    if (res.statusCode != 200) {
      throw Exception('Contract termination failed: ${res.body}');
    }
    final data = json.decode(res.body) as Map<String, dynamic>;
    return data['txHash'] as String? ?? '';
  }

  /// List all creators signed to an agency.
  Future<List<Map<String, dynamic>>> getAgencyCreators(
      String agencyId) async {
    final res = await http.get(
      Uri.parse('$_apiBase/agency/$agencyId/creators'),
      headers: _headers,
    );
    if (res.statusCode != 200) return [];
    final data = json.decode(res.body) as List<dynamic>;
    return data.whereType<Map<String, dynamic>>().toList();
  }

  /// Claim accrued commission to the agency's GhostL3 wallet.
  /// Returns the settlement [txHash].
  Future<String> claimCommission({
    required String agencyId,
    required String agencyWalletAddress,
  }) async {
    final res = await http.post(
      Uri.parse('$_apiBase/agency/claim-commission'),
      headers: _headers,
      body: json.encode({
        'agencyId': agencyId,
        'agencyWalletAddress': agencyWalletAddress,
        'chainId': 903,
      }),
    );
    if (res.statusCode != 200) {
      throw Exception('Commission claim failed: ${res.body}');
    }
    final data = json.decode(res.body) as Map<String, dynamic>;
    return data['txHash'] as String? ?? '';
  }

  /// Get an agency's total pending and paid commission earnings in GST wei.
  Future<Map<String, dynamic>> getEarnings(String agencyId) async {
    final res = await http.get(
      Uri.parse('$_apiBase/agency/$agencyId/earnings'),
      headers: _headers,
    );
    if (res.statusCode != 200) return {};
    return json.decode(res.body) as Map<String, dynamic>;
  }

  /// Get agency profile and metadata.
  Future<Map<String, dynamic>?> getAgency(String agencyId) async {
    final res = await http.get(
      Uri.parse('$_apiBase/agency/$agencyId'),
      headers: _headers,
    );
    if (res.statusCode != 200) return null;
    return json.decode(res.body) as Map<String, dynamic>;
  }
}
