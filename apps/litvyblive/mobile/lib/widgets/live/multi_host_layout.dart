import 'package:flutter/material.dart';

class MultiHostLayout extends StatelessWidget {
  final List<Widget> hostViews;

  const MultiHostLayout({super.key, required this.hostViews});

  @override
  Widget build(BuildContext context) {
    final count = hostViews.length.clamp(1, 4);
    return GridView.count(
      crossAxisCount: count <= 2 ? 1 : 2,
      childAspectRatio: count == 1 ? 16 / 9 : 1,
      padding: EdgeInsets.zero,
      children: [
        for (int i = 0; i < count; i++)
          Stack(
            children: [
              hostViews[i],
              Positioned(
                bottom: 4,
                left: 4,
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                  decoration: BoxDecoration(
                    color: Colors.black54,
                    borderRadius: BorderRadius.circular(4),
                  ),
                  child: Text(
                    'Host ${i + 1}',
                    style: const TextStyle(color: Colors.white, fontSize: 10),
                  ),
                ),
              ),
            ],
          ),
      ],
    );
  }
}
