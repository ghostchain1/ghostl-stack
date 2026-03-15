import 'package:flutter_webrtc/flutter_webrtc.dart';

class WebRtcClient {
  WebRtcClient._();
  static final WebRtcClient instance = WebRtcClient._();

  RTCPeerConnection? _pc;
  MediaStream? _localStream;
  MediaStream? _remoteStream;

  MediaStream? get localStream => _localStream;
  MediaStream? get remoteStream => _remoteStream;

  final _iceServers = {
    'iceServers': [
      {'urls': 'stun:stun.ghostchain.io:3478'},
    ],
  };

  final _constraints = {
    'mandatory': {},
    'optional': [],
  };

  Future<void> startCapture({bool frontCamera = true}) async {
    final videoConstraints = {
      'facingMode': frontCamera ? 'user' : 'environment',
    };
    _localStream = await navigator.mediaDevices.getUserMedia({
      'audio': true,
      'video': videoConstraints,
    });
  }

  Future<void> createPublisherConnection({
    required void Function(RTCIceCandidate) onIceCandidate,
    required void Function(RTCSessionDescription) onOffer,
  }) async {
    _pc = await createPeerConnection(_iceServers, _constraints);

    _localStream?.getTracks().forEach((track) {
      _pc!.addTrack(track, _localStream!);
    });

    _pc!.onIceCandidate = (candidate) {
      if (candidate.candidate != null) onIceCandidate(candidate);
    };

    final offer = await _pc!.createOffer({'offerToReceiveVideo': 1});
    await _pc!.setLocalDescription(offer);
    onOffer(offer);
  }

  Future<void> createSubscriberConnection({
    required void Function(RTCIceCandidate) onIceCandidate,
    required void Function(MediaStream) onRemoteStream,
  }) async {
    _pc = await createPeerConnection(_iceServers, _constraints);

    _pc!.onIceCandidate = (candidate) {
      if (candidate.candidate != null) onIceCandidate(candidate);
    };

    _pc!.onAddStream = (stream) {
      _remoteStream = stream;
      onRemoteStream(stream);
    };

    final offer = await _pc!.createOffer({'offerToReceiveVideo': 1});
    await _pc!.setLocalDescription(offer);
    onIceCandidate(RTCIceCandidate(offer.sdp!, 'candidate', 0));
  }

  Future<void> setRemoteDescription(RTCSessionDescription sdp) async {
    await _pc?.setRemoteDescription(sdp);
  }

  Future<void> addIceCandidate(RTCIceCandidate candidate) async {
    await _pc?.addCandidate(candidate);
  }

  Future<void> dispose() async {
    _localStream?.getTracks().forEach((t) => t.stop());
    await _localStream?.dispose();
    await _pc?.close();
    _pc = null;
    _localStream = null;
    _remoteStream = null;
  }
}
