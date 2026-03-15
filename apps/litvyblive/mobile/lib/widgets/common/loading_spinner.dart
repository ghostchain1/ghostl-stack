import 'package:flutter/material.dart';
import '../../core/theme/app_theme.dart';

/// Full-screen and inline loading spinners with GhostChain branding.
class GhostLoadingSpinner extends StatelessWidget {
  const GhostLoadingSpinner({
    super.key,
    this.size = 40,
    this.strokeWidth = 3,
    this.color,
    this.fullScreen = false,
    this.message,
  });

  final double size;
  final double strokeWidth;
  final Color? color;
  final bool fullScreen;
  final String? message;

  @override
  Widget build(BuildContext context) {
    final spinner = SizedBox(
      width: size,
      height: size,
      child: CircularProgressIndicator(
        strokeWidth: strokeWidth,
        valueColor:
            AlwaysStoppedAnimation(color ?? AppTheme.brandPurple),
      ),
    );

    if (!fullScreen) {
      if (message == null) return spinner;
      return Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          spinner,
          const SizedBox(height: 12),
          Text(message!, style: const TextStyle(color: Colors.white54)),
        ],
      );
    }

    return Scaffold(
      backgroundColor: AppTheme.darkBg,
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            spinner,
            if (message != null) ...[
              const SizedBox(height: 16),
              Text(
                message!,
                style: const TextStyle(color: Colors.white54, fontSize: 14),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
