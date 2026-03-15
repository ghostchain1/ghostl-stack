import 'package:socket_io_client/socket_io_client.dart' as io;
import '../core/constants/app_constants.dart';

typedef MessageCallback = void Function(Map<String, dynamic> data);

class SocketService {
  SocketService._();
  static final SocketService instance = SocketService._();

  io.Socket? _socket;
  final Map<String, List<MessageCallback>> _listeners = {};

  bool get isConnected => _socket?.connected ?? false;

  void connect({String? token}) {
    _socket = io.io(
      kSocketUrl,
      io.OptionBuilder()
          .setTransports(['websocket'])
          .setExtraHeaders(
              token != null ? {'Authorization': 'Bearer $token'} : {})
          .disableAutoConnect()
          .build(),
    );

    _socket!
      ..onConnect((_) => _emit('connected', {}))
      ..onDisconnect((_) => _emit('disconnected', {}))
      ..onConnectError((e) => _emit('error', {'message': e.toString()}))
      ..connect();

    // Bind all expected server events
    for (final event in const [
      'viewer_update',
      'gift',
      'pk_start',
      'pk_score',
      'pk_end',
      'chat_message',
      'agency_message',
      'stream_ended',
    ]) {
      _socket!.on(event, (data) {
        if (data is Map) {
          _emit(event, Map<String, dynamic>.from(data));
        }
      });
    }
  }

  void disconnect() {
    _socket?.disconnect();
    _socket?.dispose();
    _socket = null;
    _listeners.clear();
  }

  // -- Room --
  void joinStream(String streamId) =>
      _socket?.emit('join_stream', {'streamId': streamId});

  void leaveStream(String streamId) =>
      _socket?.emit('leave_stream', {'streamId': streamId});

  // -- Agency chat --
  void joinAgencyChat(String agencyId) =>
      _socket?.emit('join_agency', {'agencyId': agencyId});

  void leaveAgencyChat(String agencyId) =>
      _socket?.emit('leave_agency', {'agencyId': agencyId});

  void sendAgencyMessage(String agencyId, String text) =>
      _socket?.emit('agency_chat', {'agencyId': agencyId, 'text': text});

  // -- Chat --
  void sendChatMessage(String streamId, String text) =>
      _socket?.emit('chat', {'streamId': streamId, 'text': text});

  // -- Subscriptions --
  void on(String event, MessageCallback cb) =>
      (_listeners[event] ??= []).add(cb);

  void off(String event, MessageCallback cb) =>
      _listeners[event]?.remove(cb);

  void onViewerUpdate(MessageCallback cb) => on('viewer_update', cb);
  void onGiftEvent(MessageCallback cb) => on('gift', cb);
  void onPkStart(MessageCallback cb) => on('pk_start', cb);
  void onPkScore(MessageCallback cb) => on('pk_score', cb);
  void onChatMessage(MessageCallback cb) => on('chat_message', cb);
  void onAgencyMessage(MessageCallback cb) => on('agency_message', cb);

  void _emit(String event, Map<String, dynamic> data) {
    for (final cb in List.of(_listeners[event] ?? [])) {
      cb(data);
    }
  }
}
