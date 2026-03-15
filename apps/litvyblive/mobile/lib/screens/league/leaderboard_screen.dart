import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../services/economy_service.dart';

// ── Providers ─────────────────────────────────────────────────────────────────

final _selectedTierProvider = StateProvider.autoDispose<String>((_) => 'bronze');

final _leaderboardProvider = FutureProvider.autoDispose
    .family<List<LeaderboardEntry>, ({String seasonId, String tier})>(
  (ref, args) => EconomyService.instance.getLeaderboard(args.seasonId, args.tier),
);

// ── Screen ────────────────────────────────────────────────────────────────────

class LeaderboardScreen extends ConsumerWidget {
  final String seasonId;
  final String myCreatorId;

  const LeaderboardScreen({
    super.key,
    required this.seasonId,
    required this.myCreatorId,
  });

  static const _tiers = ['bronze', 'silver', 'gold', 'diamond', 'legend'];

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final selectedTier = ref.watch(_selectedTierProvider);
    final args = (seasonId: seasonId, tier: selectedTier);
    final boardAsync = ref.watch(_leaderboardProvider(args));

    return Scaffold(
      backgroundColor: const Color(0xFF0D0D1A),
      appBar: AppBar(
        backgroundColor: const Color(0xFF0D0D1A),
        iconTheme: const IconThemeData(color: Colors.white),
        title: const Text(
          'Leaderboard',
          style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
        ),
      ),
      body: Column(
        children: [
          // Tier selector
          _TierSelector(
            tiers: _tiers,
            selected: selectedTier,
            onSelect: (t) => ref.read(_selectedTierProvider.notifier).state = t,
          ),
          // Leaderboard list
          Expanded(
            child: boardAsync.when(
              loading: () => const Center(
                child: CircularProgressIndicator(color: Color(0xFF7B2FBE)),
              ),
              error: (e, _) => Center(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    const Icon(Icons.error_outline, color: Colors.redAccent, size: 48),
                    const SizedBox(height: 12),
                    Text('Failed to load', style: const TextStyle(color: Colors.white70)),
                    TextButton(
                      onPressed: () => ref.invalidate(_leaderboardProvider(args)),
                      child: const Text('Retry', style: TextStyle(color: Color(0xFF7B2FBE))),
                    ),
                  ],
                ),
              ),
              data: (entries) => entries.isEmpty
                  ? const Center(
                      child: Text('No creators in this tier yet',
                          style: TextStyle(color: Colors.white38, fontSize: 16)),
                    )
                  : RefreshIndicator(
                      color: const Color(0xFF7B2FBE),
                      onRefresh: () async => ref.invalidate(_leaderboardProvider(args)),
                      child: ListView.builder(
                        padding: const EdgeInsets.all(12),
                        itemCount: entries.length,
                        itemBuilder: (_, i) => _LeaderboardRow(
                          rank: i + 1,
                          entry: entries[i],
                          isMe: entries[i].creatorId == myCreatorId,
                        ),
                      ),
                    ),
            ),
          ),
        ],
      ),
    );
  }
}

// ── Tier Selector ─────────────────────────────────────────────────────────────

class _TierSelector extends StatelessWidget {
  const _TierSelector({
    required this.tiers,
    required this.selected,
    required this.onSelect,
  });

  final List<String> tiers;
  final String selected;
  final ValueChanged<String> onSelect;

  Color _tierColor(String tier) {
    switch (tier) {
      case 'legend':  return const Color(0xFFFF4500);
      case 'diamond': return const Color(0xFF00D4FF);
      case 'gold':    return const Color(0xFFFFD700);
      case 'silver':  return const Color(0xFFC0C0C0);
      default:        return const Color(0xFFCD7F32);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      color: const Color(0xFF0D0D1A),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      child: Row(
        children: tiers.map((tier) {
          final isSelected = tier == selected;
          final color = _tierColor(tier);
          return Expanded(
            child: GestureDetector(
              onTap: () => onSelect(tier),
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 200),
                margin: const EdgeInsets.symmetric(horizontal: 3),
                padding: const EdgeInsets.symmetric(vertical: 8),
                decoration: BoxDecoration(
                  color: isSelected ? color.withOpacity(0.2) : const Color(0xFF1A1A2E),
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(
                    color: isSelected ? color : Colors.white12,
                    width: isSelected ? 1.5 : 1,
                  ),
                ),
                child: Text(
                  tier[0].toUpperCase() + tier.substring(1),
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    color: isSelected ? color : Colors.white38,
                    fontSize: 11,
                    fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
                  ),
                ),
              ),
            ),
          );
        }).toList(),
      ),
    );
  }
}

// ── Leaderboard Row ───────────────────────────────────────────────────────────

class _LeaderboardRow extends StatelessWidget {
  const _LeaderboardRow({
    required this.rank,
    required this.entry,
    required this.isMe,
  });

  final int rank;
  final LeaderboardEntry entry;
  final bool isMe;

  Color _rankColor() {
    if (rank == 1) return const Color(0xFFFFD700);
    if (rank == 2) return const Color(0xFFC0C0C0);
    if (rank == 3) return const Color(0xFFCD7F32);
    return Colors.white38;
  }

  String _rankIcon() {
    if (rank == 1) return '🥇';
    if (rank == 2) return '🥈';
    if (rank == 3) return '🥉';
    return '#$rank';
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedContainer(
      duration: const Duration(milliseconds: 300),
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        color: isMe
            ? const Color(0xFF7B2FBE).withOpacity(0.15)
            : const Color(0xFF1A1A2E),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: isMe
              ? const Color(0xFF7B2FBE)
              : (entry.promoted ? Colors.green.withOpacity(0.4)
                  : entry.relegated ? Colors.red.withOpacity(0.4)
                  : Colors.white12),
        ),
      ),
      child: Row(
        children: [
          // Rank
          SizedBox(
            width: 40,
            child: Text(
              _rankIcon(),
              textAlign: TextAlign.center,
              style: TextStyle(
                color: _rankColor(),
                fontSize: rank <= 3 ? 20 : 14,
                fontWeight: FontWeight.bold,
              ),
            ),
          ),
          const SizedBox(width: 12),
          // Avatar placeholder
          CircleAvatar(
            radius: 20,
            backgroundColor: const Color(0xFF7B2FBE).withOpacity(0.3),
            child: Text(
              entry.creatorId.substring(0, 2).toUpperCase(),
              style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.bold),
            ),
          ),
          const SizedBox(width: 12),
          // Creator ID
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  entry.creatorId,
                  style: TextStyle(
                    color: isMe ? const Color(0xFF7B2FBE) : Colors.white,
                    fontWeight: isMe ? FontWeight.bold : FontWeight.normal,
                    fontSize: 13,
                  ),
                  overflow: TextOverflow.ellipsis,
                ),
                if (isMe)
                  const Text('(You)', style: TextStyle(color: Color(0xFF7B2FBE), fontSize: 11)),
              ],
            ),
          ),
          // Score
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                entry.score.toStringAsFixed(1),
                style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 14),
              ),
              const Text('pts', style: TextStyle(color: Colors.white38, fontSize: 11)),
            ],
          ),
          const SizedBox(width: 8),
          // Status badge
          if (entry.promoted)
            const Icon(Icons.arrow_upward, color: Colors.green, size: 16)
          else if (entry.relegated)
            const Icon(Icons.arrow_downward, color: Colors.red, size: 16)
          else
            const SizedBox(width: 16),
        ],
      ),
    );
  }
}
