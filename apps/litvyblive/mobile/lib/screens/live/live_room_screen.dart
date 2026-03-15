import 'package:flutter/material.dart';
import '../../widgets/player/live_video_player.dart';
import '../../widgets/chat/chat_overlay.dart';
import '../../widgets/gifts/gift_bar.dart';
import '../../widgets/gifts/gift_animation_layer.dart';
import '../../widgets/overlays/viewer_counter.dart';
import '../../widgets/pk/pk_score_bar.dart';
import '../../services/socket_service.dart';

class LiveRoomScreen extends StatefulWidget {
  final String streamId;
  const LiveRoomScreen({super.key, required this.streamId});

  @override
  State<LiveRoomScreen> createState() => _LiveRoomScreenState();
}

class _LiveRoomScreenState extends State<LiveRoomScreen> {
  String? _activeGiftEvent;
  int _viewerCount = 0;
  bool _isPkActive = false;

  late final SocketService _socket;

  @override
  void initState() {
    super.initState();
    _socket = SocketService.instance;
    _socket.joinStream(widget.streamId);
    _socket.onViewerUpdate((count) {
      if (mounted) setState(() => _viewerCount = count);
    });
    _socket.onGiftEvent((type) {
      if (mounted) {
        setState(() => _activeGiftEvent = type);
        Future.delayed(const Duration(seconds: 4),
            () => mounted ? setState(() => _activeGiftEvent = null) : null);
      }
    });
    _socket.onPkStart(() {
      if (mounted) setState(() => _isPkActive = true);
    });
  }

  @override
  void dispose() {
    _socket.leaveStream(widget.streamId);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      body: Stack(
        children: [
          // Full-screen video layer
          const LiveVideoPlayer(),

          // Viewer count top-right
          Positioned(
            top: MediaQuery.of(context).padding.top + 12,
            right: 12,
            child: ViewerCounter(count: _viewerCount),
          ),

          // PK score bar
          if (_isPkActive)
            const Positioned(
              top: 40,
              left: 0,
              right: 0,
              child: PkScoreBar(),
            ),

          // Chat overlay lower-left
          const Positioned(
            left: 10,
            bottom: 120,
            child: ChatOverlay(),
          ),

          // Gift animations
          if (_activeGiftEvent != null)
            GiftAnimationLayer(eventType: _activeGiftEvent!),

          // Gift bar bottom
          Positioned(
            bottom: 0,
            left: 0,
            right: 0,
            child: GiftBar(streamId: widget.streamId),
          ),
        ],
      ),
    );
  }
}
