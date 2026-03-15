import 'package:flutter/material.dart';
import '../../core/theme/app_theme.dart';
import '../../core/utils/formatters.dart';

/// Displays a user avatar with optional GNS name and GST balance.
class GhostAvatar extends StatelessWidget {
  const GhostAvatar({
    super.key,
    required this.imageUrl,
    this.radius = 24,
    this.gnsName,
    this.gstBalance,
    this.isLive = false,
    this.onTap,
    this.borderColor,
  });

  final String? imageUrl;
  final double radius;
  final String? gnsName;
  final double? gstBalance;
  final bool isLive;
  final VoidCallback? onTap;
  final Color? borderColor;

  @override
  Widget build(BuildContext context) {
    final border = borderColor ?? (isLive ? Colors.red : AppTheme.brandPurple);

    Widget avatar = CircleAvatar(
      radius: radius,
      backgroundColor: Colors.white12,
      backgroundImage:
          imageUrl != null && imageUrl!.isNotEmpty ? NetworkImage(imageUrl!) : null,
      child: imageUrl == null || imageUrl!.isEmpty
          ? Icon(Icons.person, color: Colors.white54, size: radius)
          : null,
    );

    if (isLive || borderColor != null) {
      avatar = Container(
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          border: Border.all(color: border, width: 2.5),
        ),
        child: avatar,
      );
    }

    Widget result = avatar;

    if (gnsName != null || gstBalance != null) {
      result = Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          avatar,
          const SizedBox(height: 4),
          if (gnsName != null)
            Text(
              gnsName!,
              style: const TextStyle(
                color: Colors.white,
                fontSize: 11,
                fontWeight: FontWeight.w600,
              ),
              overflow: TextOverflow.ellipsis,
            ),
          if (gstBalance != null)
            Text(
              GstFormatter.compact(gstBalance!),
              style: TextStyle(
                color: AppTheme.brandPurple,
                fontSize: 10,
              ),
            ),
        ],
      );
    }

    if (isLive) {
      result = Stack(
        clipBehavior: Clip.none,
        children: [
          result,
          Positioned(
            bottom: gnsName != null ? 24 : -2,
            left: 0,
            right: 0,
            child: Center(
              child: Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
                decoration: BoxDecoration(
                  color: Colors.red,
                  borderRadius: BorderRadius.circular(4),
                ),
                child: const Text(
                  'LIVE',
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 9,
                    fontWeight: FontWeight.bold,
                    letterSpacing: 0.5,
                  ),
                ),
              ),
            ),
          ),
        ],
      );
    }

    return onTap != null
        ? GestureDetector(onTap: onTap, child: result)
        : result;
  }
}
