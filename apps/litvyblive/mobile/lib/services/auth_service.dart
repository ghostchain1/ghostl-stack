import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import '../core/constants/app_constants.dart';
import '../models/user_model.dart';
import 'api_service.dart';
import 'socket_service.dart';
import 'wallet_service.dart';

class AuthService {
  AuthService._();
  static final AuthService instance = AuthService._();

  static const _tokenKey = 'auth_token';
  static const _userKey = 'current_user';

  UserModel? _currentUser;
  String? _token;

  UserModel? get currentUser => _currentUser;
  bool get isLoggedIn => _token != null;

  Future<void> init() async {
    final prefs = await SharedPreferences.getInstance();
    _token = prefs.getString(_tokenKey);
    final userJson = prefs.getString(_userKey);
    if (_token != null && userJson != null) {
      _currentUser = UserModel.fromJsonString(userJson);
      _propagateToken(_token!);
    }
  }

  Future<UserModel> login(String email, String password) async {
    final res = await http.post(
      Uri.parse('$kApiBaseUrl/auth/login'),
      headers: {'Content-Type': 'application/json'},
      body: json.encode({'email': email, 'password': password}),
    );
    if (res.statusCode != 200) {
      throw Exception('Login failed: ${res.body}');
    }
    return _handleAuthResponse(res.body);
  }

  Future<UserModel> register({
    required String username,
    required String email,
    required String password,
  }) async {
    final res = await http.post(
      Uri.parse('$kApiBaseUrl/auth/register'),
      headers: {'Content-Type': 'application/json'},
      body: json.encode({
        'username': username,
        'email': email,
        'password': password,
      }),
    );
    if (res.statusCode != 201) {
      throw Exception('Registration failed: ${res.body}');
    }
    return _handleAuthResponse(res.body);
  }

  /// GhostWallet sign-in: signs a challenge with the user's GhostL3 wallet key.
  /// The server verifies the signature on-chain (GhostL3, chain 903).
  Future<UserModel> loginWithGhostWallet(String walletAddress) async {
    // Step 1 — request challenge
    final challengeRes = await http.post(
      Uri.parse('$kApiBaseUrl/auth/wallet-challenge'),
      headers: {'Content-Type': 'application/json'},
      body: json.encode({'address': walletAddress, 'chainId': kGhostL3ChainId}),
    );
    if (challengeRes.statusCode != 200) {
      throw Exception('Challenge request failed');
    }
    final challenge = (json.decode(challengeRes.body)['challenge'] as String?) ?? '';

    // Step 2 — signature collected by GhostWallet UI (not in scope here);
    // caller passes already-signed message. For now pass challenge as placeholder.
    final verifyRes = await http.post(
      Uri.parse('$kApiBaseUrl/auth/wallet-verify'),
      headers: {'Content-Type': 'application/json'},
      body: json.encode({
        'address': walletAddress,
        'challenge': challenge,
        'chainId': kGhostL3ChainId,
      }),
    );
    if (verifyRes.statusCode != 200) {
      throw Exception('Wallet verification failed');
    }
    return _handleAuthResponse(verifyRes.body);
  }

  Future<void> logout() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_tokenKey);
    await prefs.remove(_userKey);
    _token = null;
    _currentUser = null;
    SocketService.instance.disconnect();
  }

  Future<UserModel> _handleAuthResponse(String body) async {
    final data = json.decode(body) as Map<String, dynamic>;
    _token = data['token'] as String?;
    _currentUser = UserModel.fromJson(data['user'] as Map<String, dynamic>);
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_tokenKey, _token ?? '');
    await prefs.setString(_userKey, json.encode(_currentUser!.toJson()));
    _propagateToken(_token!);
    return _currentUser!;
  }

  void _propagateToken(String token) {
    ApiService.instance.setAuthToken(token);
    WalletService.instance.setAuthToken(token);
    SocketService.instance.connect(token: token);
  }
}
