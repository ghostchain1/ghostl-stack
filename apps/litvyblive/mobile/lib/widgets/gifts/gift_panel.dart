import 'package:flutter/material.dart';

class GiftPanel extends StatelessWidget {
  final void Function(String giftId, int price) onGiftTap;

  const GiftPanel({super.key, required this.onGiftTap});

  static const _gifts = [
    {'id': 'rose', 'icon': '🌹', 'label': 'Rose', 'price': 1},
    {'id': 'heart', 'icon': '💖', 'label': 'Heart', 'price': 5},
    {'id': 'crown', 'icon': '👑', 'label': 'Crown', 'price': 50},
    {'id': 'rocket', 'icon': '🚀', 'label': 'Rocket', 'price': 100},
    {'id': 'gem', 'icon': '💎', 'label': 'Gem', 'price': 500},
    {'id': 'dragon', 'icon': '🐉', 'label': 'Dragon', 'price': 5000},
  ];

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 90,
      color: const Color(0xFF0A0A12),
      child: ListView.builder(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
        itemCount: _gifts.length,
        itemBuilder: (context, i) {
          final g = _gifts[i];
          return GestureDetector(
            onTap: () => onGiftTap(g['id'] as String, g['price'] as int),
            child: Container(
              width: 64,
              margin: const EdgeInsets.symmetric(horizontal: 4),
              decoration: BoxDecoration(
                color: const Color(0xFF1E1E2E),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: const Color(0xFF7B2FBE).withOpacity(0.4)),
              ),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text(g['icon'] as String, style: const TextStyle(fontSize: 22)),
                  const SizedBox(height: 2),
                  Text('${g['price']} G',
                      style: const TextStyle(
                          color: Color(0xFFFFD700), fontSize: 9, fontWeight: FontWeight.bold)),
                ],
              ),
            ),
          );
        },
      ),
    );
  }
}
