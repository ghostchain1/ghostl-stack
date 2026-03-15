import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../services/marketing_service.dart';

// ── Provider ──────────────────────────────────────────────────────────────────

final _trendingProvider = FutureProvider.autoDispose<List<TrendingCreator>>(
  (_) => MarketingService.instance.getTrendingCreators(limit: 30),
);

// ── Screen ────────────────────────────────────────────────────────────────────

class FeaturedCreatorsScreen extends ConsumerWidget {
  const FeaturedCreatorsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final trendingAsync = ref.watch(_trendingProvider);

    return Scaffold(
      backgroundColor: const Color(0xFF0D0D1A),
      appBar: AppBar(
        backgroundColor: const Color(0xFF0D0D1A),
        title: const Text(
          '🌟 Featured Creators',
          style: TextStyle(
            color: Colors.white,
            fontWeight: FontWeight.bold,
            fontSize: 20,
          ),
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh, color: Color(0xFF00D4FF)),
            onPressed: () => ref.invalidate(_trendingProvider),
            tooltip: 'Refresh',
          ),
        ],
      ),
      body: trendingAsync.when(
        loading: () => const Center(
          child: CircularProgressIndicator(color: Color(0xFF7B2FBE)),
        ),
        error: (e, _) => Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.error_outline, color: Colors.redAccent, size: 48),
              const SizedBox(height: 12),
              Text('Failed to load creators',
                  style: const TextStyle(color: Colors.white70)),
              TextButton(
                onPressed: () => ref.invalidate(_trendingProvider),
                child: const Text('Retry',
                    style: TextStyle(color: Color(0xFF00D4FF))),
              ),
            ],
          ),
        ),
        data: (creators) => creators.isEmpty
            ? const Center(
                child: Text(
                  'No featured creators right now.\nCheck back soon!',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: Colors.white54, fontSize: 16),
                ),
              )
            : RefreshIndicator(
                color: const Color(0xFF7B2FBE),
                onRefresh: () async => ref.invalidate(_trendingProvider),
                child: GridView.builder(
                  padding: const EdgeInsets.all(16),
                  gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: 2,
                    crossAxisSpacing: 12,
                    mainAxisSpacing: 12,
                    childAspectRatio: 0.78,
                  ),
                  itemCount: creators.length,
                  itemBuilder: (ctx, i) =>
                      _CreatorCard(creator: creators[i], rank: i + 1),
                ),
              ),
      ),
    );
  }
}

// ── Creator card ──────────────────────────────────────────────────────────────

class _CreatorCard extends StatelessWidget {
  final TrendingCreator creator;
  final int rank;
  const _CreatorCard({required this.creator, required this.rank});

  Color get _signalColor {
    switch (creator.signal) {
      case 'viewer_growth':   return const Color(0xFF00D4FF);
      case 'gift_spike':      return const Color(0xFFFFD700);
      case 'chat_burst':      return const Color(0xFF7B2FBE);
      case 'follower_surge':  return const Color(0xFF00FF88);
      default:                return Colors.white54;
    }
  }

  String get _signalLabel {
    switch (creator.signal) {
      case 'viewer_growth':   return '👁 Viewer Surge';
      case 'gift_spike':      return '🎁 Gift Spike';
      case 'chat_burst':      return '💬 Chat Burst';
      case 'follower_surge':  return '👥 Follower Surge';
      default:                return creator.signal;
    }
  }

  String get _tierBadge {
    if (creator.score >= 1000) return '🏆 Legend';
    if (creator.score >= 500)  return '💎 Diamond';
    if (creator.score >= 200)  return '🥇 Gold';
    if (creator.score >= 100)  return '🥈 Silver';
    return '🥉 Rising';
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xFF1A1A2E), Color(0xFF16213E)],
        ),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: _signalColor.withOpacity(0.4), width: 1.5),
        boxShadow: [
          BoxShadow(
            color: _signalColor.withOpacity(0.15),
            blurRadius: 12,
            spreadRadius: 2,
          ),
        ],
      ),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Rank + avatar
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    color: _signalColor.withOpacity(0.2),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(
                    '#$rank',
                    style: TextStyle(
                      color: _signalColor,
                      fontWeight: FontWeight.bold,
                      fontSize: 12,
                    ),
                  ),
                ),
                CircleAvatar(
                  radius: 22,
                  backgroundColor: _signalColor.withOpacity(0.2),
                  child: Text(
                    creator.creatorId.substring(0, 2).toUpperCase(),
                    style: TextStyle(
                      color: _signalColor,
                      fontWeight: FontWeight.bold,
                      fontSize: 14,
                    ),
                  ),
                ),
              ],
            ),

            const SizedBox(height: 10),

            // Creator ID (truncated)
            Text(
              creator.creatorId.length > 12
                  ? '${creator.creatorId.substring(0, 12)}…'
                  : creator.creatorId,
              style: const TextStyle(
                color: Colors.white,
                fontWeight: FontWeight.bold,
                fontSize: 13,
              ),
            ),

            const SizedBox(height: 4),

            // Tier badge
            Text(
              _tierBadge,
              style: const TextStyle(color: Colors.white70, fontSize: 11),
            ),

            const Spacer(),

            // Signal chip
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              decoration: BoxDecoration(
                color: _signalColor.withOpacity(0.15),
                borderRadius: BorderRadius.circular(20),
                border: Border.all(color: _signalColor.withOpacity(0.4)),
              ),
              child: Text(
                _signalLabel,
                style: TextStyle(
                  color: _signalColor,
                  fontSize: 10,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),

            const SizedBox(height: 8),

            // Score
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  'Score',
                  style: const TextStyle(color: Colors.white54, fontSize: 10),
                ),
                Text(
                  creator.score.toStringAsFixed(0),
                  style: TextStyle(
                    color: _signalColor,
                    fontWeight: FontWeight.bold,
                    fontSize: 12,
                  ),
                ),
              ],
            ),

            const SizedBox(height: 8),

            // Watch CTA
            SizedBox(
              width: double.infinity,
              height: 32,
              child: ElevatedButton(
                style: ElevatedButton.styleFrom(
                  backgroundColor: _signalColor,
                  foregroundColor: Colors.black,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(8),
                  ),
                  padding: EdgeInsets.zero,
                ),
                onPressed: () {
                  // Navigate to creator's live stream
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(
                      content: Text('Opening ${creator.creatorId}\'s stream…'),
                      backgroundColor: const Color(0xFF7B2FBE),
                    ),
                  );
                },
                child: const Text(
                  '▶ Watch',
                  style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
