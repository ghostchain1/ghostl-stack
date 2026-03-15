import 'package:flutter/material.dart';
import '../../services/api_service.dart';

class FeedScreen extends StatelessWidget {
  const FeedScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Feed'),
        actions: [
          IconButton(icon: const Icon(Icons.add_photo_alternate), onPressed: () {}),
        ],
      ),
      body: FutureBuilder<List<Map<String, dynamic>>>(
        future: ApiService.instance.getSocialFeed(),
        builder: (_, snap) {
          if (snap.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }
          final posts = snap.data ?? [];
          return ListView.builder(
            itemCount: posts.length,
            itemBuilder: (_, i) {
              final p = posts[i];
              return Card(
                margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    ListTile(
                      leading: CircleAvatar(
                        backgroundColor: const Color(0xFF7B2FBE),
                        child: Text((p['username'] as String? ?? '?')[0].toUpperCase()),
                      ),
                      title: Text(p['username'] as String? ?? ''),
                      subtitle: Text(p['timestamp'] as String? ?? ''),
                    ),
                    if (p['content'] != null)
                      Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                        child: Text(p['content'] as String),
                      ),
                    Row(
                      children: [
                        IconButton(
                          icon: const Icon(Icons.favorite_border),
                          onPressed: () {},
                        ),
                        Text('${p['likes'] ?? 0}'),
                        const SizedBox(width: 16),
                        IconButton(
                          icon: const Icon(Icons.chat_bubble_outline),
                          onPressed: () {},
                        ),
                        Text('${p['comments'] ?? 0}'),
                      ],
                    ),
                  ],
                ),
              );
            },
          );
        },
      ),
    );
  }
}
