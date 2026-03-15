import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../services/api_service.dart';
import '../../models/event_model.dart';

class EventHubScreen extends ConsumerWidget {
  const EventHubScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Scaffold(
      appBar: AppBar(title: const Text('Events')),
      body: FutureBuilder<List<EventModel>>(
        future: ApiService.instance.getActiveEvents(),
        builder: (_, snap) {
          if (snap.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }
          final events = snap.data ?? [];
          if (events.isEmpty) {
            return const Center(child: Text('No active events'));
          }
          return ListView.builder(
            padding: const EdgeInsets.all(16),
            itemCount: events.length,
            itemBuilder: (_, i) {
              final ev = events[i];
              return Card(
                margin: const EdgeInsets.only(bottom: 16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Container(
                      height: 80,
                      decoration: BoxDecoration(
                        gradient: LinearGradient(
                          colors: [ev.color, ev.color.withOpacity(0.4)],
                        ),
                        borderRadius:
                            const BorderRadius.vertical(top: Radius.circular(12)),
                      ),
                      alignment: Alignment.center,
                      child: Text(ev.name,
                          style: const TextStyle(
                              color: Colors.white,
                              fontSize: 20,
                              fontWeight: FontWeight.bold)),
                    ),
                    ListTile(
                      title: Text(ev.description),
                      subtitle: Text('Ends: ${ev.endsAt}'),
                      trailing: Text('Reward: ${ev.rewardPool} GST',
                          style: const TextStyle(color: Color(0xFFFFD700))),
                    ),
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                      child: ElevatedButton(
                        onPressed: () {},
                        child: const Text('Join Event'),
                      ),
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
