import 'package:shared_preferences/shared_preferences.dart';

class AppConfig {
  AppConfig._();
  static late SharedPreferences _prefs;

  static Future<void> initialize() async {
    _prefs = await SharedPreferences.getInstance();
  }

  static SharedPreferences get prefs => _prefs;

  /// Returns stored auth token or null.
  static String? get authToken => _prefs.getString('auth_token');

  /// Returns stored wallet address or null.
  static String? get walletAddress => _prefs.getString('wallet_address');

  static Future<void> setAuthToken(String token) =>
      _prefs.setString('auth_token', token);

  static Future<void> setWalletAddress(String address) =>
      _prefs.setString('wallet_address', address);

  static Future<void> clearSession() async {
    await _prefs.remove('auth_token');
    await _prefs.remove('wallet_address');
  }
}
