import 'package:flutter/material.dart';

class AvatarLiveScreen extends StatelessWidget {
  const AvatarLiveScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Avatar Live')),
      body: Stack(
        children: [
          // 3D avatar render area — integrates with Unity/Rive in production
          Container(
            color: Colors.black,
            child: const Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(Icons.face_retouching_natural, size: 80, color: Colors.white54),
                  SizedBox(height: 16),
                  Text('3D Avatar Renderer', style: TextStyle(color: Colors.white54)),
                  SizedBox(height: 8),
                  Text(
                    'Face & body tracking active',
                    style: TextStyle(color: Color(0xFF00D4FF)),
                  ),
                ],
              ),
            ),
          ),
          // Mode toggle row
          Positioned(
            bottom: 32,
            left: 0,
            right: 0,
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                _ModeBtn(label: 'Camera', icon: Icons.videocam),
                const SizedBox(width: 12),
                _ModeBtn(label: 'Avatar', icon: Icons.face_retouching_natural, active: true),
                const SizedBox(width: 12),
                _ModeBtn(label: 'AR', icon: Icons.auto_awesome),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _ModeBtn extends StatelessWidget {
  final String label;
  final IconData icon;
  final bool active;
  const _ModeBtn({required this.label, required this.icon, this.active = false});

  @override
  Widget build(BuildContext context) {
    return OutlinedButton.icon(
      onPressed: () {},
      icon: Icon(icon, color: active ? const Color(0xFF7B2FBE) : Colors.white54),
      label: Text(label,
          style: TextStyle(color: active ? const Color(0xFF7B2FBE) : Colors.white54)),
      style: OutlinedButton.styleFrom(
        side: BorderSide(color: active ? const Color(0xFF7B2FBE) : Colors.white24),
      ),
    );
  }
}
