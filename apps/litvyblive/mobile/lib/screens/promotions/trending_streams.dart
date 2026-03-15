import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../services/marketing_service.dart';

// ── Providers ─────────────────────────────────────────────────────────────────

final _trendingProvider = FutureProvider.autoDispose<List<TrendingCreator>>(
  (_) => MarketingService.instance.getTrendingCreators(limit: 50),
);

final _aiStatusProvider = FutureProvider.autoDispose<MarketingStatus>(
  (_) => MarketingService.instance.getAIStatus(),
);

// ── Signal metadata ───────────────────────────────────────────────────────────

const _signalMeta = {
  'viewer_growth':  _SignalMeta('🔥 Viewer Surge',  Color(0xFF00D4FF)),
  'gift_spike':     _SignalMeta('🎁 Gift Spike',    Color(0xFFFFD700)),
  'chat_burst':     _SignalMeta('💬 Chat Burst',    Color(0xFF7B2FBE)),
  'follower_surge': _SignalMeta('👥 Follower Surge', Color(0xFF00FF88)),
};

class _SignalMeta {
  final String label;
  final Color  color;
  const _SignalMeta(this.label, this.color);
}

// ── Screen ────────────────────────────────────────────────────────────────────

class TrendingStreamsScreen extends ConsumerWidget {
  const TrendingStreamsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final trendingAsync = ref.watch(_trendingProvider);
    final statusAsync   = ref.watch(_aiStatusProvider);

    return Scaffold(
      backgroundColor: const Color(0xFF0D0D1A),
      appBar: AppBar(
        backgroundColor: const Color(0xFF0D0D1A),
        title: const Text(
          '🔴 Trending Streams',
          style: TextStyle(
              color: Colors.white, fontWeight: FontWeight.bold, fontSize: 20),
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh, color: Color(0xFF00D4FF)),
            onPressed: () {
              ref.invalidate(_trendingProvider);
              ref.invalidate(_aiStatusProvider);
            },
          ),
        ],
      ),
      body: Column(
        children: [
          // AI status banner
          statusAsync.when(
            loading: () => const SizedBox.shrink(),
            error:   (_, __) => const SizedBox.shrink(),
            data: (status) => _AIStatusBanner(status: status),
          ),

          // Signal filter chips
          _SignalFilterBar(onFilter: (_) => ref.invalidate(_trendingProvider)),

          // Trending list
          Expanded(
            child: trendingAsync.when(
              loading: () => const Center(
                child: CircularProgressIndicator(color: Color(0xFF7B2FBE)),
              ),
              error: (e, _) => Center(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(Icons.wifi_off, color: Colors.redAccent, size: 48),
                    const SizedBox(height: 12),
                    const Text('Could not load trending streams.',
                        style: TextStyle(color: Colors.white70)),
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
                        'No trending streams right now.\nGhostBrain is watching…',
                        textAlign: TextAlign.center,
                        style: TextStyle(color: Colors.white54, fontSize: 16),
                      ),
                    )
                  : RefreshIndicator(
                      color: const Color(0xFF7B2FBE),
                      onRefresh: () async => ref.invalidate(_trendingProvider),
                      child: ListView.separated(
                        padding: const EdgeInsets.all(16),
                        itemCount: creators.length,
                        separatorBuilder: (_, __) => const SizedBox(height: 10),
                        itemBuilder: (ctx, i) =>
                            _TrendingStreamTile(creator: creators[i], rank: i + 1),
                      ),
                    ),
            ),
          ),
        ],
      ),
    );
  }
}

// ── AI status banner ──────────────────────────────────────────────────────────

class _AIStatusBanner extends StatelessWidget {
  final MarketingStatus status;
  const _AIStatusBanner({required this.status});

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.fromLTRB(16, 8, 16, 0),
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [Color(0xFF7B2FBE), Color(0xFF00D4FF)],
        ),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceAround,
        children: [
          _Stat('🔥 Trending',   '${status.trendingCount}'),
          _Stat('📢 Active',     '${status.activeCampaigns}'),
          _Stat('📡 Distributed','${status.totalDistributed}'),
        ],
      ),
    );
  }
}

class _Stat extends StatelessWidget {
  final String label;
  final String value;
  const _Stat(this.label, this.value);

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Text(value,
            style: const TextStyle(
                color: Colors.white, fontWeight: FontWeight.bold, fontSize: 18)),
        Text(label,
            style: const TextStyle(color: Colors.white70, fontSize: 10)),
      ],
    );
  }
}

// ── Signal filter bar ─────────────────────────────────────────────────────────

class _SignalFilterBar extends StatefulWidget {
  final ValueChanged<String?> onFilter;
  const _SignalFilterBar({required this.onFilter});

  @override
  State<_SignalFilterBar> createState() => _SignalFilterBarState();
}

class _SignalFilterBarState extends State<_SignalFilterBar> {
  String? _selected;

  @override
  Widget build(BuildContext context) {
    final options = [null, 'viewer_growth', 'gift_spike', 'chat_burst', 'follower_surge'];
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
      child: Row(
        children: options.map((opt) {
          final meta  = opt != null ? _signalMeta[opt] : null;
          final label = meta?.label ?? '✨ All';
          final color = meta?.color ?? Colors.white;
          final selected = _selected == opt;
          return Padding(
            padding: const EdgeInsets.only(right: 8),
            child: FilterChip(
              label: Text(label,
                  style: TextStyle(
                    color: selected ? Colors.black : color,
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                  )),
              selected: selected,
              selectedColor: color,
              backgroundColor: const Color(0xFF1A1A2E),
              side: BorderSide(color: color.withOpacity(0.5)),
              onSelected: (_) {
                setState(() => _selected = opt);
                widget.onFilter(opt);
              },
            ),
          );
        }).toList(),
      ),
    );
  }
}

// ── Stream tile ───────────────────────────────────────────────────────────────

class _TrendingStreamTile extends StatelessWidget {
  final TrendingCreator creator;
  final int rank;
  const _TrendingStreamTile({required this.creator, required this.rank});

  @override
  Widget build(BuildContext context) {
    final meta  = _signalMeta[creator.signal] ??
        const _SignalMeta('🔥 Live', Color(0xFF7B2FBE));

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: const Color(0xFF1A1A2E),
        borderRadius: BorderRadius.circular(14),
        border:
            Border.all(color: meta.color.withOpacity(0.35), width: 1.2),
      ),
      child: Row(
        children: [
          // Rank badge
          _RankBadge(rank: rank, color: meta.color),

          const SizedBox(width: 12),

          // Avatar
          CircleAvatar(
            radius: 24,
            backgroundColor: meta.color.withOpacity(0.2),
            child: Text(
              creator.creatorId.substring(0, 2).toUpperCase(),
              style: TextStyle(
                color: meta.color,
                fontWeight: FontWeight.bold,
                fontSize: 14,
              ),
            ),
          ),

          const SizedBox(width: 12),

          // Info
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  creator.creatorId.length > 18
                      ? '${creator.creatorId.substring(0, 18)}…'
                      : creator.creatorId,
                  style: const TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.bold,
                    fontSize: 14,
                  ),
                ),
                const SizedBox(height: 4),
                Row(
                  children: [
                    Container(
                      padding:
                          const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                      decoration: BoxDecoration(
                        color: meta.color.withOpacity(0.15),
                        borderRadius: BorderRadius.circular(20),
                        border: Border.all(
                            color: meta.color.withOpacity(0.4), width: 0.8),
                      ),
                      child: Text(
                        meta.label,
                        style: TextStyle(
                          color: meta.color,
                          fontSize: 10,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),

          // Score + Watch
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                '${creator.score.toStringAsFixed(0)} pts',
                style:
                    TextStyle(color: meta.color, fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 6),
              GestureDetector(
                onTap: () {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(
                      content: Text('Joining ${creator.creatorId}\'s stream…'),
                      backgroundColor: const Color(0xFF7B2FBE),
                    ),
                  );
                },
                child: Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
                  decoration: BoxDecoration(
                    color: meta.color,
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: const Text(
                    '▶ Join',
                    style: TextStyle(
                      color: Colors.black,
                      fontWeight: FontWeight.bold,
                      fontSize: 11,
                    ),
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

// ── Rank badge ────────────────────────────────────────────────────────────────

class _RankBadge extends StatelessWidget {
  final int rank;
  final Color color;
  const _RankBadge({required this.rank, required this.color});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 28,
      alignment: Alignment.center,
      child: Text(
        rank <= 3 ? ['🥇', '🥈', '🥉'][rank - 1] : '#$rank',
        style: TextStyle(
          color: color,
          fontWeight: FontWeight.bold,
          fontSize: rank <= 3 ? 18 : 12,
        ),
      ),
    );
  }
}
