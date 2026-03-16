import 'dart:convert';
import 'dart:io';
import 'package:http/http.dart' as http;
import '../core/constants/app_constants.dart';
import '../models/stream_model.dart';
import '../models/user_model.dart';
import '../models/event_model.dart';
import '../models/game_model.dart';
import '../models/ranking_model.dart';
import '../models/agency_model.dart';

class ApiService {
  ApiService._();
  static final ApiService instance = ApiService._();

  final _client = http.Client();
  String? _authToken;

  void setAuthToken(String token) => _authToken = token;

  // ── Public API surface (used by external services) ───────────────────────
  String get baseUrl => kApiBaseUrl;
  Map<String, String> get authHeaders => _headers;

  Future<dynamic> get(String path, {Map<String, String>? query}) =>
      _get(path, query);

  Future<dynamic> post(String path, {required Map<String, dynamic> body}) =>
      _post(path, body);

  /// Creator insights — falls through to demo data on error.
  Future<Map<String, dynamic>> getCreatorInsights(String userId, String period) =>
      _get('/insights/$userId', {'period': period})
          .then((v) => v as Map<String, dynamic>);

  Map<String, String> get _headers => {
        'Content-Type': 'application/json',
        if (_authToken != null) 'Authorization': 'Bearer $_authToken',
      };

  Uri _uri(String path, [Map<String, String>? query]) =>
      Uri.parse('$kApiBaseUrl$path').replace(queryParameters: query);

  Future<dynamic> _get(String path, [Map<String, String>? query]) async {
    final res = await _client.get(_uri(path, query), headers: _headers);
    _assertOk(res);
    return json.decode(res.body);
  }

  Future<dynamic> _post(String path, Map<String, dynamic> body) async {
    final res = await _client.post(
      _uri(path),
      headers: _headers,
      body: json.encode(body),
    );
    _assertOk(res);
    return json.decode(res.body);
  }

  void _assertOk(http.Response res) {
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw HttpException('HTTP ${res.statusCode}: ${res.body}', uri: Uri.parse(res.request!.url.toString()));
    }
  }

  // -- Streams --
  Future<List<StreamModel>> getRecommendedStreams() async {
    final data = await _get('/streams/recommended') as List<dynamic>;
    return data
        .whereType<Map<String, dynamic>>()
        .map(StreamModel.fromJson)
        .toList();
  }

  Future<StreamModel> getStream(String streamId) async {
    final data = await _get('/streams/$streamId') as Map<String, dynamic>;
    return StreamModel.fromJson(data);
  }

  // -- Users --
  Future<UserModel> getUser(String userId) async {
    final data = await _get('/users/$userId') as Map<String, dynamic>;
    return UserModel.fromJson(data);
  }

  Future<UserModel> getMe() async {
    final data = await _get('/users/me') as Map<String, dynamic>;
    return UserModel.fromJson(data);
  }

  Future<void> saveAvatarConfig(Map<String, dynamic> config) async {
    await _post('/users/me/avatar', config);
  }

  // -- Rankings --
  Future<List<RankingEntry>> getLeaderboard(String type) async {
    final data = await _get('/rankings/$type') as List<dynamic>;
    return data
        .whereType<Map<String, dynamic>>()
        .map(RankingEntry.fromJson)
        .toList();
  }

  // -- Events --
  Future<List<EventModel>> getActiveEvents() async {
    final data = await _get('/events/active') as List<dynamic>;
    return data
        .whereType<Map<String, dynamic>>()
        .map(EventModel.fromJson)
        .toList();
  }

  Future<void> joinEvent(String eventId) async {
    await _post('/events/$eventId/join', {});
  }

  // -- Games --
  Future<List<GameModel>> getRecommendedGames() async {
    final data = await _get('/games/recommended') as List<dynamic>;
    return data
        .whereType<Map<String, dynamic>>()
        .map(GameModel.fromJson)
        .toList();
  }

  Future<Map<String, dynamic>> joinGame(String gameId) async {
    return await _post('/games/$gameId/join', {}) as Map<String, dynamic>;
  }

  // -- Agency --
  Future<AgencyModel?> getMyAgency() async {
    try {
      final data = await _get('/agency/me') as Map<String, dynamic>;
      return AgencyModel.fromJson(data);
    } catch (_) {
      return null;
    }
  }

  Future<List<Map<String, dynamic>>> getTalentRecommendations() async {
    final data = await _get('/agency/talent-recommendations') as List<dynamic>;
    return data.whereType<Map<String, dynamic>>().toList();
  }

  Future<void> sendRecruitInvite(String targetUserId) async {
    await _post('/agency/recruit', {'targetUserId': targetUserId});
  }

  Future<Map<String, dynamic>> requestHostRelease(
      {required String hostId, required String reason}) async {
    return await _post('/agency/release-request', {
      'hostId': hostId,
      'reason': reason,
    }) as Map<String, dynamic>;
  }

  // -- Social --
  Future<List<Map<String, dynamic>>> getSocialFeed() async {
    final data = await _get('/social/feed') as List<dynamic>;
    return data.whereType<Map<String, dynamic>>().toList();
  }

  Future<void> likePost(String postId) async {
    await _post('/social/posts/$postId/like', {});
  }
}
