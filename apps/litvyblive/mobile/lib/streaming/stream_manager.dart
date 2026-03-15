import 'package:flutter_webrtc/flutter_webrtc.dart';
import 'webrtc_client.dart';
import 'mediasoup_client.dart';
import '../services/stream_service.dart';
import '../services/socket_service.dart';

enum StreamRole { publisher, subscriber }

class StreamManager {
  StreamManager._();
  static final StreamManager instance = StreamManager._();

  final _webrtc = WebRtcClient.instance;
  final _mediasoup = MediasoupClient.instance;
  final _streamSvc = StreamService.instance;

  StreamRole? _role;
  String? _activeStreamId;
  RTCVideoRenderer? _localRenderer;
  RTCVideoRenderer? _remoteRenderer;

  RTCVideoRenderer? get localRenderer => _localRenderer;
  RTCVideoRenderer? get remoteRenderer => _remoteRenderer;
  bool get isPublishing => _role == StreamRole.publisher;

  Future<void> startPublishing({required bool isAvatarMode}) async {
    _role = StreamRole.publisher;

    // Start stream on server → returns streamId + mediasoup room info
    final stream = await _streamSvc.startStream(isAvatarMode: isAvatarMode);
    _activeStreamId = stream.id;

    // Capture local camera
    await _webrtc.startCapture();

    // Setup local renderer
    _localRenderer = RTCVideoRenderer();
    await _localRenderer!.initialize();
    _localRenderer!.srcObject = _webrtc.localStream;

    // Load Mediasoup device + create send transport
    await _mediasoup.loadDevice(_activeStreamId!);
    await _mediasoup.createSendTransport(_activeStreamId!);

    // Join socket room
    SocketService.instance.joinStream(_activeStreamId!);
  }

  Future<void> startSubscribing(String streamId) async {
    _role = StreamRole.subscriber;
    _activeStreamId = streamId;

    _remoteRenderer = RTCVideoRenderer();
    await _remoteRenderer!.initialize();

    await _mediasoup.loadDevice(streamId);

    await _webrtc.createSubscriberConnection(
      onIceCandidate: (c) {},
      onRemoteStream: (stream) {
        _remoteRenderer!.srcObject = stream;
      },
    );

    SocketService.instance.joinStream(streamId);
  }

  Future<void> stopAll() async {
    if (_activeStreamId != null) {
      SocketService.instance.leaveStream(_activeStreamId!);
    }
    if (_role == StreamRole.publisher) {
      await _streamSvc.endStream();
    }
    await _webrtc.dispose();
    _mediasoup.dispose();

    await _localRenderer?.dispose();
    await _remoteRenderer?.dispose();
    _localRenderer = null;
    _remoteRenderer = null;
    _role = null;
    _activeStreamId = null;
  }
}
