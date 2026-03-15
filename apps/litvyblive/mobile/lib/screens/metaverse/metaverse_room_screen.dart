import 'package:flutter/material.dart';

class MetaverseRoomScreen extends StatelessWidget {
  const MetaverseRoomScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Metaverse Room')),
      body: Stack(
        children: [
          // 3D room renderer — integrates with Unity/Three.js in production
          Container(
            color: const Color(0xFF050520),
            child: const Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(Icons.view_in_ar, size: 80, color: Colors.white24),
                  SizedBox(height: 16),
                  Text('3D Metaverse Room',
                      style: TextStyle(color: Colors.white54, fontSize: 18)),
                  SizedBox(height: 8),
                  Text('Avatar loading...',
                      style: TextStyle(color: Color(0xFF00D4FF))),
                ],
              ),
            ),
          ),
          // Room controls
          Positioned(
            bottom: 24,
            left: 0,
            right: 0,
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceEvenly,
              children: [
                _RoomBtn(icon: Icons.mic, label: 'Voice'),
                _RoomBtn(icon: Icons.card_giftcard, label: 'Gift'),
                _RoomBtn(icon: Icons.emoji_emotions, label: 'Emote'),
                _RoomBtn(icon: Icons.people, label: 'Invite'),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _RoomBtn extends StatelessWidget {
  final IconData icon;
  final String label;
  const _RoomBtn({required this.icon, required this.label});

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        CircleAvatar(
          backgroundColor: const Color(0xFF1A1A2E),
          child: Icon(icon, color: Colors.white70),
        ),
        const SizedBox(height: 4),
        Text(label, style: const TextStyle(color: Colors.white54, fontSize: 11)),
      ],
    );
  }
}
