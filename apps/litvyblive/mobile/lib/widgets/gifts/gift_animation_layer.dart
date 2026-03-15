import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';

/// Renders floating gift animations over the live room.
/// Integrates with Lottie/Rive through the [eventType] dispatch.
class GiftAnimationLayer extends StatelessWidget {
  final String eventType;
  const GiftAnimationLayer({super.key, required this.eventType});

  @override
  Widget build(BuildContext context) {
    return IgnorePointer(
      child: Positioned.fill(
        child: _buildAnimation(context),
      ),
    );
  }

  Widget _buildAnimation(BuildContext context) {
    switch (eventType) {
      case 'gift_storm':
        return _GiftStormOverlay();
      case 'mega_gift':
        return _MegaGiftOverlay();
      case 'pk_explosion':
        return _PkExplosionOverlay();
      case 'dragon':
        return _DragonOverlay();
      default:
        return _DefaultGiftOverlay(eventType: eventType);
    }
  }
}

class _GiftStormOverlay extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Container(
      alignment: Alignment.center,
      child: Text('🌟 GIFT STORM! 🌟',
              style: const TextStyle(
                  fontSize: 32,
                  fontWeight: FontWeight.bold,
                  color: Color(0xFFFFD700),
                  shadows: [Shadow(blurRadius: 20, color: Colors.orange)]))
          .animate()
          .scale(duration: 400.ms)
          .then()
          .shake(duration: 600.ms),
    );
  }
}

class _MegaGiftOverlay extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Container(
      alignment: Alignment.center,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Text('💎', style: TextStyle(fontSize: 80))
              .animate()
              .scale(begin: const Offset(0, 0), duration: 600.ms, curve: Curves.elasticOut),
          const Text('MEGA GIFT!',
                  style: TextStyle(
                      fontSize: 28, color: Color(0xFF00D4FF), fontWeight: FontWeight.bold))
              .animate(delay: 300.ms)
              .fadeIn(),
        ],
      ),
    );
  }
}

class _PkExplosionOverlay extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return const ColoredBox(
      color: Color(0x44FF2D78),
      child: Center(
        child: Text('⚡ PK EXPLOSION! ⚡',
            style: TextStyle(fontSize: 28, fontWeight: FontWeight.bold)),
      ),
    );
  }
}

class _DragonOverlay extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Align(
      alignment: Alignment.bottomLeft,
      child: const Text('🐉',
              style: TextStyle(fontSize: 60))
          .animate()
          .moveX(begin: -100, end: 400, duration: 2000.ms, curve: Curves.easeInOut),
    );
  }
}

class _DefaultGiftOverlay extends StatelessWidget {
  final String eventType;
  const _DefaultGiftOverlay({required this.eventType});

  @override
  Widget build(BuildContext context) {
    return Align(
      alignment: Alignment.center,
      child: Text(eventType.toUpperCase(),
              style: const TextStyle(
                  fontSize: 24, color: Colors.white, fontWeight: FontWeight.bold))
          .animate()
          .fadeIn(duration: 300.ms)
          .then(delay: 1000.ms)
          .fadeOut(),
    );
  }
}
