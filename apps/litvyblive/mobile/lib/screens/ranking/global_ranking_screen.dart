import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../services/api_service.dart';
import '../../models/ranking_model.dart';
import '../../widgets/badges/rank_badge.dart';

class GlobalRankingScreen extends ConsumerWidget {
  const GlobalRankingScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return DefaultTabController(
      length: 4,
      child: Scaffold(
        appBar: AppBar(
          title: const Text('Rankings'),
          bottom: const TabBar(tabs: [
            Tab(text: 'Creators'),
            Tab(text: 'Fans'),
            Tab(text: 'Agencies'),
            Tab(text: 'Gifts'),
          ]),
        ),
        body: TabBarView(children: [
          _LeaderboardTab(type: 'creators'),
          _LeaderboardTab(type: 'fans'),
          _LeaderboardTab(type: 'agencies'),
          _LeaderboardTab(type: 'gifts'),
        ]),
      ),
    );
  }
}

class _LeaderboardTab extends StatelessWidget {
  final String type;
  const _LeaderboardTab({required this.type});

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<List<RankingEntry>>(
      future: ApiService.instance.getLeaderboard(type),
      builder: (_, snap) {
        if (snap.connectionState == ConnectionState.waiting) {
          return const Center(child: CircularProgressIndicator());
        }
        final entries = snap.data ?? [];
        return ListView.builder(
          itemCount: entries.length,
          itemBuilder: (_, i) {
            final e = entries[i];
            return ListTile(
              leading: CircleAvatar(
                backgroundColor: _rankColor(i),
                child: Text('${i + 1}',
                    style: const TextStyle(fontWeight: FontWeight.bold)),
              ),
              title: Text(e.name),
              subtitle: RankBadge(title: 'Lv ${e.level}'),
              trailing: Text('${e.score} GST',
                  style: const TextStyle(color: Color(0xFFFFD700))),
            );
          },
        );
      },
    );
  }

  Color _rankColor(int i) {
    if (i == 0) return const Color(0xFFFFD700);
    if (i == 1) return Colors.grey;
    if (i == 2) return const Color(0xFFCD7F32);
    return const Color(0xFF7B2FBE);
  }
}
