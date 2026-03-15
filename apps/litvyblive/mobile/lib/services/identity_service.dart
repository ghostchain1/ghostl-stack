import 'dart:convert';
import 'package:http/http.dart' as http;
import '../core/constants/app_constants.dart';
import '../models/identity_model.dart';
import 'auth_service.dart';

/// Flutter service for the GhostChain Universal Identity API.
///
/// All read endpoints are public.
/// Write endpoints attach the JWT from [AuthService] automatically.
class IdentityService {
  IdentityService._();
  static final IdentityService instance = IdentityService._();

  // ── Helpers ──────────────────────────────────────────────────────────────

  Map<String, String> get _authHeaders => {
    'Content-Type': 'application/json',
    if (AuthService.instance.isLoggedIn)
      'Authorization': 'Bearer ${AuthService.instance.token}',
  };

  Uri _uri(String path) => Uri.parse('$kApiBaseUrl/identity$path');

  Future<Map<String, dynamic>> _json(http.Response res) async {
    if (res.statusCode >= 400) {
      final body = json.decode(res.body) as Map<String, dynamic>;
      throw Exception(body['error']?.toString() ?? 'Request failed (${res.statusCode})');
    }
    return json.decode(res.body) as Map<String, dynamic>;
  }

  // ── Username ─────────────────────────────────────────────────────────────

  /// Check whether a username is available.
  Future<UsernameCheckResult> checkUsername(String username) async {
    final res = await http.get(_uri('/check/$username'));
    return UsernameCheckResult.fromJson(await _json(res));
  }

  /// Forward-resolve a username → identity profile.
  Future<IdentityModel> resolveUsername(String username) async {
    final res = await http.get(_uri('/resolve/$username'));
    final data = await _json(res);
    // /resolve returns a GhostUsername (lightweight); wrap for model
    return IdentityModel.fromJson({'profile': data, 'reputation': {}});
  }

  /// Reverse-resolve a wallet address → identity.
  Future<IdentityModel> resolveWallet(String walletAddress) async {
    final res = await http.get(_uri('/wallet/$walletAddress'));
    final data = await _json(res);
    return IdentityModel.fromJson({'profile': data, 'reputation': {}});
  }

  /// Fetch the full identity record (profile + reputation) for a user ID.
  Future<IdentityModel> getProfile(String userId) async {
    final res = await http.get(_uri('/profile/$userId'));
    return IdentityModel.fromJson(await _json(res));
  }

  /// Fetch refreshed reputation score for a user.
  Future<Map<String, dynamic>> getReputation(String userId) async {
    final res = await http.get(_uri('/reputation/$userId'));
    return _json(res);
  }

  // ── Authenticated mutations ───────────────────────────────────────────────

  /// Claim / update the caller's ghost handle.
  Future<IdentityModel> claimUsername({
    required String username,
    String? walletAddress,
  }) async {
    final res = await http.post(
      _uri('/claim'),
      headers: _authHeaders,
      body: json.encode({
        'username': username,
        if (walletAddress != null) 'walletAddress': walletAddress,
      }),
    );
    final data = await _json(res);
    return IdentityModel.fromJson({'profile': data, 'reputation': {}});
  }

  /// Link a GhostWallet address to the current user.
  Future<void> linkWallet(String walletAddress) async {
    final res = await http.post(
      _uri('/link-wallet'),
      headers: _authHeaders,
      body: json.encode({'walletAddress': walletAddress}),
    );
    await _json(res);
  }

  /// Update the current user's profile (bio, avatar, social links).
  Future<IdentityModel> updateProfile({
    String? avatarUrl,
    String? bio,
    Map<String, String>? socialLinks,
  }) async {
    final res = await http.put(
      _uri('/profile'),
      headers: _authHeaders,
      body: json.encode({
        if (avatarUrl   != null) 'avatarUrl':   avatarUrl,
        if (bio         != null) 'bio':         bio,
        if (socialLinks != null) 'socialLinks': socialLinks,
      }),
    );
    final data = await _json(res);
    return IdentityModel.fromJson({'profile': data, 'reputation': {}});
  }

  /// Record the GhostChain L1 anchor tx-hash after anchoring on-chain.
  Future<void> recordL1Anchor(String txHash) async {
    final res = await http.post(
      _uri('/anchor'),
      headers: _authHeaders,
      body: json.encode({'txHash': txHash}),
    );
    await _json(res);
  }

  // ── Verification ─────────────────────────────────────────────────────────

  /// Submit a creator verification request for the current user.
  Future<void> requestVerification() async {
    final res = await http.post(
      _uri('/verify/request'),
      headers: _authHeaders,
    );
    await _json(res);
  }

  /// Get the current user's verification status.
  Future<Map<String, dynamic>> getVerificationStatus() async {
    final res = await http.get(_uri('/verify/status'), headers: _authHeaders);
    return _json(res);
  }
}
