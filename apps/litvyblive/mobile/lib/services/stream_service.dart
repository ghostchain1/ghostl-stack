import 'dart:convert';
import 'package:http/http.dart' as http;
import '../core/constants/app_constants.dart';
import '../models/stream_model.dart';

class StreamService {
  StreamService._();
  static final StreamService instance = StreamService._();

  String? _authToken;
  String? _activeStreamId;

  String? get activeStreamId => _activeStreamId;

  void setAuthToken(String token) => _authToken = token;

  Map<String, String> get _headers => {
        'Content-Type': 'application/json',
        if (_authToken != null) 'Authorization': 'Bearer $_authToken',
      };

  Uri _uri(String path) => Uri.parse('$kApiBaseUrl$path');

  Future<StreamModel> startStream({
    required bool isAvatarMode,
    String title = '',
    String category = 'general',
  }) async {
    final res = await http.post(
      _uri('/streams/start'),
      headers: _headers,
      body: json.encode({
        'isAvatarMode': isAvatarMode,
        'title': title,
        'category': category,
      }),
    );
    if (res.statusCode != 200 && res.statusCode != 201) {
      throw Exception('Stream start failed: ${res.body}');
    }
    final model = StreamModel.fromJson(
        json.decode(res.body) as Map<String, dynamic>);
    _activeStreamId = model.id;
    return model;
  }

  Future<void> endStream() async {
    if (_activeStreamId == null) return;
    final res = await http.post(
      _uri('/streams/$_activeStreamId/end'),
      headers: _headers,
      body: '{}',
    );
    if (res.statusCode != 200) {
      throw Exception('Stream end failed: ${res.body}');
    }
    _activeStreamId = null;
  }

  Future<void> startPk(String opponentStreamId) async {
    if (_activeStreamId == null) return;
    await http.post(
      _uri('/streams/$_activeStreamId/pk/start'),
      headers: _headers,
      body: json.encode({'opponentStreamId': opponentStreamId}),
    );
  }

  Future<Map<String, dynamic>> getStreamToken(String streamId) async {
    final res = await http.get(
        _uri('/streams/$streamId/token'), headers: _headers);
    if (res.statusCode != 200) {
      throw Exception('Failed to get stream token: ${res.statusCode}');
    }
    return json.decode(res.body) as Map<String, dynamic>;
  }

  Future<List<StreamModel>> getLiveStreams({String? category}) async {
    final query = category != null ? {'category': category} : null;
    final uri = query != null
        ? _uri('/streams/live').replace(queryParameters: query)
        : _uri('/streams/live');
    final res = await http.get(uri, headers: _headers);
    if (res.statusCode != 200) {
      throw Exception('Failed to fetch streams');
    }
    final data = json.decode(res.body) as List<dynamic>;
    return data
        .whereType<Map<String, dynamic>>()
        .map(StreamModel.fromJson)
        .toList();
  }
}
