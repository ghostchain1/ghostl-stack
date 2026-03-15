import 'package:flutter/material.dart';

class RankBadge extends StatelessWidget {
  final String title;
  final Color? color;
  const RankBadge({super.key, required this.title, this.color});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        color: (color ?? _levelColor(title)).withOpacity(0.15),
        border: Border.all(color: color ?? _levelColor(title)),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Text(
        title,
        style: TextStyle(
          color: color ?? _levelColor(title),
          fontSize: 10,
          fontWeight: FontWeight.bold,
        ),
      ),
    );
  }

  Color _levelColor(String t) {
    if (t.contains('Legend') || t.contains('100')) return const Color(0xFFFF2D78);
    if (t.contains('Diamond')) return const Color(0xFF00D4FF);
    if (t.contains('Gold')) return const Color(0xFFFFD700);
    if (t.contains('Silver')) return Colors.grey;
    return const Color(0xFF7B2FBE);
  }
}
