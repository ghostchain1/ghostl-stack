import 'package:flutter/material.dart';

class PkScoreBar extends StatelessWidget {
  final int scoreA;
  final int scoreB;
  final String nameA;
  final String nameB;

  const PkScoreBar({
    super.key,
    this.scoreA = 0,
    this.scoreB = 0,
    this.nameA = 'Host A',
    this.nameB = 'Host B',
  });

  @override
  Widget build(BuildContext context) {
    final total = scoreA + scoreB;
    final pctA = total == 0 ? 0.5 : scoreA / total;

    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16),
      padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 12),
      decoration: BoxDecoration(
        color: Colors.black54,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(nameA,
                  style: const TextStyle(
                      color: Color(0xFF7B2FBE), fontWeight: FontWeight.bold)),
              const Text('⚡ PK ⚡', style: TextStyle(color: Colors.orange)),
              Text(nameB,
                  style: const TextStyle(
                      color: Color(0xFFFF2D78), fontWeight: FontWeight.bold)),
            ],
          ),
          const SizedBox(height: 6),
          ClipRRect(
            borderRadius: BorderRadius.circular(4),
            child: Row(
              children: [
                Expanded(
                  flex: (pctA * 100).round(),
                  child: Container(height: 8, color: const Color(0xFF7B2FBE)),
                ),
                Expanded(
                  flex: ((1 - pctA) * 100).round(),
                  child: Container(height: 8, color: const Color(0xFFFF2D78)),
                ),
              ],
            ),
          ),
          const SizedBox(height: 4),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text('$scoreA GST', style: const TextStyle(color: Colors.white70, fontSize: 11)),
              Text('$scoreB GST', style: const TextStyle(color: Colors.white70, fontSize: 11)),
            ],
          ),
        ],
      ),
    );
  }
}
