import 'dart:convert';
import 'package:http/http.dart' as http;

class StreamingService {
  StreamingService._();
  static final StreamingService instance = StreamingService._();

  static const _l3Rpc = 'http://localhost:39545'; // GhostL3 RPC

  /// Get a relay server URL for a given stream room on GhostL3.
  Future<Map<String, dynamic>> getStreamRelay(String streamId) async {
    final res = await http.post(
      Uri.parse('$_l3Rpc'),
      headers: {'Content-Type': 'application/json'},
      body: json.encode({
        'jsonrpc': '2.0',
        'method': 'ghost_getStreamRelay',
        'params': [streamId],
        'id': 1,
      }),
    );
    if (res.statusCode != 200) {
      throw Exception('StreamingService.getStreamRelay: ${res.statusCode}');
    }
    final body = json.decode(res.body) as Map<String, dynamic>;
    return body['result'] as Map<String, dynamic>;
  }

  /// Record stream start event on GhostL3.
  Future<String> startStream({
    required String creatorAddress,
    required String streamId,
    required String title,
  }) async {
    final res = await http.post(
      Uri.parse('$_l3Rpc'),
      headers: {'Content-Type': 'application/json'},
      body: json.encode({
        'jsonrpc': '2.0',
        'method': 'ghost_startStream',
        'params': [creatorAddress, streamId, title],
        'id': 1,
      }),
    );
    if (res.statusCode != 200) {
      throw Exception('StreamingService.startStream: ${res.statusCode}');
    }
    final body = json.decode(res.body) as Map<String, dynamic>;
    return body['result'] as String; // tx hash
  }

  /// Record stream end event on GhostL3.
  Future<String> endStream({
    required String creatorAddress,
    required String streamId,
    required int durationSeconds,
  }) async {
    final res = await http.post(
      Uri.parse('$_l3Rpc'),
      headers: {'Content-Type': 'application/json'},
      body: json.encode({
        'jsonrpc': '2.0',
        'method': 'ghost_endStream',
        'params': [creatorAddress, streamId, durationSeconds],
        'id': 1,
      }),
    );
    if (res.statusCode != 200) {
      throw Exception('StreamingService.endStream: ${res.statusCode}');
    }
    final body = json.decode(res.body) as Map<String, dynamic>;
    return body['result'] as String; // tx hash
  }

  /// Fetch live viewer count from GhostL3 state.
  Future<int> getViewerCount(String streamId) async {
    final res = await http.post(
      Uri.parse('$_l3Rpc'),
      headers: {'Content-Type': 'application/json'},
      body: json.encode({
        'jsonrpc': '2.0',
        'method': 'ghost_getViewerCount',
        'params': [streamId],
        'id': 1,
      }),
    );
    if (res.statusCode != 200) return 0;
    final body = json.decode(res.body) as Map<String, dynamic>;
    return (body['result'] as num?)?.toInt() ?? 0;
  }
}
