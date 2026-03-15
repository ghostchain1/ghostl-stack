import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:flutter_webrtc/flutter_webrtc.dart';
import '../core/constants/app_constants.dart';

/// Mediasoup SFU client — connects to the GhostL3 streaming server.
/// Wraps device/transport/producer/consumer lifecycle.
class MediasoupClient {
  MediasoupClient._();
  static final MediasoupClient instance = MediasoupClient._();

  static const _msUrl = kMediasoupUrl;

  String? _authToken;
  String? _routerRtpCapabilities;
  String? _transportId;
  String? _producerId;

  void setAuthToken(String token) => _authToken = token;

  Map<String, String> get _headers => {
        'Content-Type': 'application/json',
        if (_authToken != null) 'Authorization': 'Bearer $_authToken',
      };

  Future<void> loadDevice(String streamId) async {
    final res = await http.get(
      Uri.parse('$_msUrl/rooms/$streamId/routerCapabilities'),
      headers: _headers,
    );
    if (res.statusCode != 200) {
      throw Exception('Failed to load router capabilities');
    }
    _routerRtpCapabilities = res.body;
  }

  Future<Map<String, dynamic>> createSendTransport(String streamId) async {
    final res = await http.post(
      Uri.parse('$_msUrl/rooms/$streamId/transport/send'),
      headers: _headers,
      body: '{}',
    );
    if (res.statusCode != 200) {
      throw Exception('Failed to create send transport');
    }
    final data = json.decode(res.body) as Map<String, dynamic>;
    _transportId = data['id'] as String?;
    return data;
  }

  Future<void> connectTransport({
    required String streamId,
    required String dtlsParameters,
  }) async {
    await http.post(
      Uri.parse('$_msUrl/rooms/$streamId/transport/$_transportId/connect'),
      headers: _headers,
      body: json.encode({'dtlsParameters': json.decode(dtlsParameters)}),
    );
  }

  Future<String> produce({
    required String streamId,
    required String kind,
    required String rtpParameters,
  }) async {
    final res = await http.post(
      Uri.parse('$_msUrl/rooms/$streamId/transport/$_transportId/produce'),
      headers: _headers,
      body: json.encode({
        'kind': kind,
        'rtpParameters': json.decode(rtpParameters),
      }),
    );
    if (res.statusCode != 200) {
      throw Exception('Failed to produce');
    }
    final data = json.decode(res.body) as Map<String, dynamic>;
    _producerId = data['producerId'] as String?;
    return _producerId!;
  }

  Future<Map<String, dynamic>> consume({
    required String streamId,
    required String producerId,
  }) async {
    final res = await http.post(
      Uri.parse('$_msUrl/rooms/$streamId/consume'),
      headers: _headers,
      body: json.encode({'producerId': producerId}),
    );
    if (res.statusCode != 200) {
      throw Exception('Failed to consume');
    }
    return json.decode(res.body) as Map<String, dynamic>;
  }

  void dispose() {
    _routerRtpCapabilities = null;
    _transportId = null;
    _producerId = null;
  }
}
