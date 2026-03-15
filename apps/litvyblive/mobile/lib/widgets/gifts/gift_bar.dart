import 'package:flutter/material.dart';
import '../../services/gift_service.dart';
import '../../models/gift_model.dart';

class GiftBar extends StatelessWidget {
  final String streamId;
  const GiftBar({super.key, required this.streamId});

  static const _quickGifts = [
    GiftModel(id: 'rose', name: 'Rose', icon: '🌹', price: 1),
    GiftModel(id: 'heart', name: 'Heart', icon: '❤️', price: 5),
    GiftModel(id: 'star', name: 'Star', icon: '⭐', price: 20),
    GiftModel(id: 'crown', name: 'Crown', icon: '👑', price: 100),
    GiftModel(id: 'diamond', name: 'Diamond', icon: '💎', price: 500),
  ];

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 90,
      color: Colors.black.withOpacity(0.6),
      child: Row(
        children: [
          Expanded(
            child: ListView.builder(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
              itemCount: _quickGifts.length,
              itemBuilder: (_, i) => _GiftButton(
                gift: _quickGifts[i],
                streamId: streamId,
              ),
            ),
          ),
          IconButton(
            icon: const Icon(Icons.grid_view_rounded, color: Colors.white70),
            onPressed: () => _showGiftStore(context),
          ),
        ],
      ),
    );
  }

  void _showGiftStore(BuildContext context) {
    showModalBottomSheet(
      context: context,
      backgroundColor: const Color(0xFF13131F),
      builder: (_) => const _GiftStoreSheet(),
    );
  }
}

class _GiftButton extends StatelessWidget {
  final GiftModel gift;
  final String streamId;
  const _GiftButton({required this.gift, required this.streamId});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () => GiftService.instance.sendQuickGift(streamId, gift),
      child: Container(
        width: 64,
        margin: const EdgeInsets.only(right: 8),
        decoration: BoxDecoration(
          color: const Color(0xFF1A1A2E),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text(gift.icon, style: const TextStyle(fontSize: 24)),
            const SizedBox(height: 2),
            Text('${gift.price} GST',
                style: const TextStyle(color: Color(0xFFFFD700), fontSize: 9)),
          ],
        ),
      ),
    );
  }
}

class _GiftStoreSheet extends StatelessWidget {
  const _GiftStoreSheet();

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 400,
      child: Column(
        children: [
          const Padding(
            padding: EdgeInsets.all(16),
            child: Text('Gift Store — Powered by GhostL3',
                style: TextStyle(fontWeight: FontWeight.bold)),
          ),
          Expanded(
            child: GridView.count(
              crossAxisCount: 4,
              padding: const EdgeInsets.all(12),
              children: const [
                _StoreGift(icon: '🌹', name: 'Rose', price: 1),
                _StoreGift(icon: '❤️', name: 'Heart', price: 5),
                _StoreGift(icon: '⭐', name: 'Star', price: 20),
                _StoreGift(icon: '👑', name: 'Crown', price: 100),
                _StoreGift(icon: '💎', name: 'Diamond', price: 500),
                _StoreGift(icon: '🏎️', name: 'Sports Car', price: 1000),
                _StoreGift(icon: '🐉', name: 'Dragon', price: 5000),
                _StoreGift(icon: '🚀', name: 'Rocket', price: 10000),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _StoreGift extends StatelessWidget {
  final String icon, name;
  final int price;
  const _StoreGift({required this.icon, required this.name, required this.price});

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        Text(icon, style: const TextStyle(fontSize: 30)),
        Text(name, style: const TextStyle(fontSize: 10)),
        Text('$price GST',
            style: const TextStyle(color: Color(0xFFFFD700), fontSize: 9)),
      ],
    );
  }
}
