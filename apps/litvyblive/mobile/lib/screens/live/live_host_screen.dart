import 'package:flutter/material.dart';
import '../../services/stream_service.dart';

class LiveHostScreen extends StatefulWidget {
  const LiveHostScreen({super.key});

  @override
  State<LiveHostScreen> createState() => _LiveHostScreenState();
}

class _LiveHostScreenState extends State<LiveHostScreen> {
  bool _isLive = false;
  bool _isAvatar = false;
  String? _streamId;

  Future<void> _startStream() async {
    final id = await StreamService.instance.startStream(isAvatar: _isAvatar);
    setState(() {
      _isLive = true;
      _streamId = id;
    });
  }

  Future<void> _endStream() async {
    if (_streamId != null) {
      await StreamService.instance.endStream(_streamId!);
    }
    setState(() {
      _isLive = false;
      _streamId = null;
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Go Live')),
      body: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          // Camera preview placeholder
          Container(
            height: 300,
            color: Colors.black87,
            alignment: Alignment.center,
            child: Icon(
              _isAvatar ? Icons.face_retouching_natural : Icons.videocam,
              size: 64,
              color: Colors.white54,
            ),
          ),
          const SizedBox(height: 24),
          // Avatar mode toggle
          SwitchListTile(
            title: const Text('Avatar Mode'),
            subtitle: const Text('Stream as your 3D avatar'),
            value: _isAvatar,
            onChanged: _isLive ? null : (v) => setState(() => _isAvatar = v),
          ),
          const SizedBox(height: 24),
          ElevatedButton.icon(
            onPressed: _isLive ? _endStream : _startStream,
            icon: Icon(_isLive ? Icons.stop : Icons.fiber_manual_record),
            label: Text(_isLive ? 'End Stream' : 'Go Live'),
            style: ElevatedButton.styleFrom(
              backgroundColor: _isLive ? Colors.red : const Color(0xFF7B2FBE),
              padding: const EdgeInsets.symmetric(horizontal: 48, vertical: 16),
            ),
          ),
          if (_isLive && _streamId != null) ...[
            const SizedBox(height: 16),
            Text('Stream ID: $_streamId',
                style: const TextStyle(color: Colors.white54)),
          ],
        ],
      ),
    );
  }
}
