import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../services/api_service.dart';
import '../../models/stream_model.dart';
import '../live/live_room_screen.dart';
import '../../widgets/discovery/live_card.dart';

final discoveryStreamsProvider = FutureProvider<List<StreamModel>>((ref) async {
  return ApiService.instance.getRecommendedStreams();
});

/// TikTok / Poppo-style vertical swipe discovery feed.
class DiscoveryScreen extends ConsumerWidget {
  const DiscoveryScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final streams = ref.watch(discoveryStreamsProvider);
    return streams.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => Center(child: Text('Error: $e')),
      data: (list) => list.isEmpty
          ? const Center(child: Text('No streams right now'))
          : PageView.builder(
              scrollDirection: Axis.vertical,
              itemCount: list.length,
              itemBuilder: (_, i) => LiveCard(
                streamId: list[i].id,
                hostName: list[i].hostName,
                viewerCount: list[i].viewerCount,
                title: list[i].title,
                onTap: () => Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (_) => LiveRoomScreen(streamId: list[i].id),
                  ),
                ),
              ),
            ),
    );
  }
}
