import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../services/economy_service.dart';

// ── Providers ─────────────────────────────────────────────────────────────────

final _competitionsProvider = FutureProvider.autoDispose<List<Competition>>(
  (ref) => EconomyService.instance.listCompetitions(),
);

final _historyProvider = FutureProvider.autoDispose.family<List<CompetitionEntry>, String>(
  (ref, creatorId) => EconomyService.instance.getCompetitionHistory(creatorId),
);

// ── Screen ────────────────────────────────────────────────────────────────────

class CompetitionScreen extends ConsumerStatefulWidget {
  final String creatorId;
  const CompetitionScreen({super.key, required this.creatorId});

  @override
  ConsumerState<CompetitionScreen> createState() => _CompetitionScreenState();
}

class _CompetitionScreenState extends ConsumerState<CompetitionScreen>
    with SingleTickerProviderStateMixin {
  late final TabController _tabs;
  bool _entering = false;

  @override
  void initState() {
    super.initState();
    _tabs = TabController(length: 2, vsync: this);
  }

  @override
  void dispose() {
    _tabs.dispose();
    super.dispose();
  }

  Future<void> _enter(Competition comp) async {
    if (_entering) return;
    setState(() => _entering = true);
    try {
      await EconomyService.instance.enterCompetition(comp.competitionId, widget.creatorId);
      if (!mounted) return;
      ref.invalidate(_competitionsProvider);
      ref.invalidate(_historyProvider(widget.creatorId));
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Entered: ${comp.title}'),
          backgroundColor: const Color(0xFF7B2FBE),
        ),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Failed to enter: $e'),
          backgroundColor: Colors.red,
        ),
      );
    } finally {
      if (mounted) setState(() => _entering = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        _CompTabBar(controller: _tabs),
        Expanded(
          child: TabBarView(
            controller: _tabs,
            children: [
              _OpenCompetitionsTab(creatorId: widget.creatorId, onEnter: _enter),
              _MyHistoryTab(creatorId: widget.creatorId),
            ],
          ),
        ),
      ],
    );
  }
}

// ── Tab bar ───────────────────────────────────────────────────────────────────

class _CompTabBar extends StatelessWidget {
  const _CompTabBar({required this.controller});
  final TabController controller;

  @override
  Widget build(BuildContext context) {
    return TabBar(
      controller: controller,
      labelColor: const Color(0xFF00D4FF),
      unselectedLabelColor: Colors.white38,
      indicatorColor: const Color(0xFF7B2FBE),
      tabs: const [
        Tab(text: 'Open Events'),
        Tab(text: 'My History'),
      ],
    );
  }
}

// ── Open competitions tab ─────────────────────────────────────────────────────

class _OpenCompetitionsTab extends ConsumerWidget {
  const _OpenCompetitionsTab({required this.creatorId, required this.onEnter});
  final String creatorId;
  final Future<void> Function(Competition) onEnter;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(_competitionsProvider);
    return async.when(
      loading: () => const Center(child: CircularProgressIndicator(color: Color(0xFF7B2FBE))),
      error: (e, _) => Center(child: Text('Error: $e', style: const TextStyle(color: Colors.redAccent))),
      data: (comps) {
        final open = comps.where((c) => c.status == 'open' || c.status == 'upcoming').toList();
        return RefreshIndicator(
          color: const Color(0xFF7B2FBE),
          onRefresh: () async => ref.invalidate(_competitionsProvider),
          child: open.isEmpty
              ? const Center(
                  child: Text('No open competitions right now',
                      style: TextStyle(color: Colors.white38, fontSize: 16)),
                )
              : ListView.builder(
                  padding: const EdgeInsets.all(12),
                  itemCount: open.length,
                  itemBuilder: (_, i) => _CompetitionCard(
                    competition: open[i],
                    creatorId: creatorId,
                    onEnter: () => onEnter(open[i]),
                  ),
                ),
        );
      },
    );
  }
}

// ── History tab ───────────────────────────────────────────────────────────────

class _MyHistoryTab extends ConsumerWidget {
  const _MyHistoryTab({required this.creatorId});
  final String creatorId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(_historyProvider(creatorId));
    return async.when(
      loading: () => const Center(child: CircularProgressIndicator(color: Color(0xFF7B2FBE))),
      error: (e, _) => Center(child: Text('Error: $e', style: const TextStyle(color: Colors.redAccent))),
      data: (entries) => entries.isEmpty
          ? const Center(
              child: Text('No competition history yet',
                  style: TextStyle(color: Colors.white38, fontSize: 16)),
            )
          : RefreshIndicator(
              color: const Color(0xFF7B2FBE),
              onRefresh: () async => ref.invalidate(_historyProvider(creatorId)),
              child: ListView.builder(
                padding: const EdgeInsets.all(12),
                itemCount: entries.length,
                itemBuilder: (_, i) => _EntryHistoryRow(entry: entries[i]),
              ),
            ),
    );
  }
}

// ── Competition Card ──────────────────────────────────────────────────────────

class _CompetitionCard extends ConsumerWidget {
  const _CompetitionCard({
    required this.competition,
    required this.creatorId,
    required this.onEnter,
  });

  final Competition competition;
  final String creatorId;
  final VoidCallback onEnter;

  static const _typeColors = {
    'gift_battle':       Color(0xFFFF6B6B),
    'pk_tournament':     Color(0xFF7B2FBE),
    'engagement_contest': Color(0xFF00D4FF),
    'game_tournament':   Color(0xFFFFD700),
  };

  static const _typeIcons = {
    'gift_battle':       Icons.card_giftcard,
    'pk_tournament':     Icons.sports_kabaddi,
    'engagement_contest': Icons.thumb_up,
    'game_tournament':   Icons.videogame_asset,
  };

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final color = _typeColors[competition.type] ?? const Color(0xFF7B2FBE);
    final icon = _typeIcons[competition.type] ?? Icons.emoji_events;
    final entryAsync = ref.watch(
      FutureProvider.autoDispose<CompetitionEntry?>((r) =>
        EconomyService.instance.getMyEntry(competition.competitionId, creatorId)),
    );

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: const Color(0xFF1A1A2E),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: color.withOpacity(0.3)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            decoration: BoxDecoration(
              color: color.withOpacity(0.1),
              borderRadius: const BorderRadius.vertical(top: Radius.circular(16)),
            ),
            child: Row(
              children: [
                Icon(icon, color: color, size: 22),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    competition.title,
                    style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 15),
                  ),
                ),
                _StatusBadge(status: competition.status),
              ],
            ),
          ),
          // Body
          Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    _InfoChip(icon: Icons.emoji_events, label: '${competition.prizePoolGst.toStringAsFixed(0)} GST Prize'),
                    const SizedBox(width: 8),
                    _InfoChip(icon: Icons.schedule, label: competition.cadence),
                  ],
                ),
                const SizedBox(height: 10),
                // Prize breakdown
                _PrizeBreakdown(pool: competition.prizePoolGst),
                const SizedBox(height: 12),
                // Enter button
                entryAsync.when(
                  loading: () => const SizedBox(
                    height: 40,
                    child: Center(child: CircularProgressIndicator(color: Color(0xFF7B2FBE), strokeWidth: 2)),
                  ),
                  error: (_, __) => _EnterButton(onEnter: onEnter, color: color),
                  data: (entry) => entry != null
                      ? _EnteredStatus(score: entry.score)
                      : (competition.status == 'open'
                          ? _EnterButton(onEnter: onEnter, color: color)
                          : const SizedBox()),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// ── Prize Breakdown ───────────────────────────────────────────────────────────

class _PrizeBreakdown extends StatelessWidget {
  const _PrizeBreakdown({required this.pool});
  final double pool;

  @override
  Widget build(BuildContext context) {
    final splits = [
      ('🥇 1st', pool * 0.5),
      ('🥈 2nd', pool * 0.25),
      ('🥉 3rd', pool * 0.125),
    ];
    return Row(
      children: splits.map((s) => Expanded(
        child: Column(
          children: [
            Text(s.$1, style: const TextStyle(fontSize: 12)),
            Text('${s.$2.toStringAsFixed(0)} GST',
                style: const TextStyle(color: Color(0xFFFFD700), fontSize: 11, fontWeight: FontWeight.bold)),
          ],
        ),
      )).toList(),
    );
  }
}

// ── Entry History Row ─────────────────────────────────────────────────────────

class _EntryHistoryRow extends StatelessWidget {
  const _EntryHistoryRow({required this.entry});
  final CompetitionEntry entry;

  Color _prizeColor() {
    switch (entry.prizeStatus) {
      case 'confirmed': return Colors.green;
      case 'failed':    return Colors.red;
      default:          return Colors.white38;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: const Color(0xFF1A1A2E),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.white12),
      ),
      child: Row(
        children: [
          // Rank
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: const Color(0xFF7B2FBE).withOpacity(0.2),
            ),
            child: Center(
              child: Text(
                entry.finalRank != null ? '#${entry.finalRank}' : '–',
                style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 13),
              ),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  entry.competitionId.substring(0, 8),
                  style: const TextStyle(color: Colors.white60, fontSize: 12),
                ),
                Text(
                  'Score: ${entry.score.toStringAsFixed(1)}',
                  style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w500),
                ),
              ],
            ),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                entry.prizeGst != null ? '${entry.prizeGst!.toStringAsFixed(0)} GST' : '—',
                style: TextStyle(color: _prizeColor(), fontWeight: FontWeight.bold),
              ),
              Text(
                entry.prizeStatus,
                style: TextStyle(color: _prizeColor().withOpacity(0.7), fontSize: 11),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

// ── Small widgets ─────────────────────────────────────────────────────────────

class _StatusBadge extends StatelessWidget {
  const _StatusBadge({required this.status});
  final String status;

  Color get _color {
    switch (status) {
      case 'open':      return Colors.green;
      case 'upcoming':  return const Color(0xFF00D4FF);
      case 'scoring':   return const Color(0xFFFFD700);
      case 'complete':  return Colors.white38;
      default:          return Colors.red;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: _color.withOpacity(0.15),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: _color.withOpacity(0.5)),
      ),
      child: Text(
        status.toUpperCase(),
        style: TextStyle(color: _color, fontSize: 10, fontWeight: FontWeight.bold),
      ),
    );
  }
}

class _InfoChip extends StatelessWidget {
  const _InfoChip({required this.icon, required this.label});
  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 13, color: Colors.white38),
        const SizedBox(width: 4),
        Text(label, style: const TextStyle(color: Colors.white54, fontSize: 12)),
      ],
    );
  }
}

class _EnterButton extends StatelessWidget {
  const _EnterButton({required this.onEnter, required this.color});
  final VoidCallback onEnter;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: double.infinity,
      child: ElevatedButton(
        onPressed: onEnter,
        style: ElevatedButton.styleFrom(
          backgroundColor: color,
          foregroundColor: Colors.white,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
          padding: const EdgeInsets.symmetric(vertical: 12),
        ),
        child: const Text('Enter Competition', style: TextStyle(fontWeight: FontWeight.bold)),
      ),
    );
  }
}

class _EnteredStatus extends StatelessWidget {
  const _EnteredStatus({required this.score});
  final double score;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 10),
      decoration: BoxDecoration(
        color: Colors.green.withOpacity(0.1),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: Colors.green.withOpacity(0.4)),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Icon(Icons.check_circle, color: Colors.green, size: 16),
          const SizedBox(width: 8),
          Text(
            'Entered  •  Score: ${score.toStringAsFixed(1)}',
            style: const TextStyle(color: Colors.green, fontWeight: FontWeight.w600),
          ),
        ],
      ),
    );
  }
}
