import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../services/economy_service.dart';
import 'leaderboard_screen.dart';
import 'competition_screen.dart';

// ── Providers ─────────────────────────────────────────────────────────────────

final _dashboardProvider = FutureProvider.autoDispose.family<EconomyDashboard, String>(
  (ref, creatorId) => EconomyService.instance.getDashboard(creatorId),
);

final _activeSeasonProvider = FutureProvider.autoDispose<LeagueSeason?>(
  (ref) => EconomyService.instance.getActiveSeason(),
);

// ── Screen ────────────────────────────────────────────────────────────────────

class LeagueScreen extends ConsumerStatefulWidget {
  final String creatorId;
  const LeagueScreen({super.key, required this.creatorId});

  @override
  ConsumerState<LeagueScreen> createState() => _LeagueScreenState();
}

class _LeagueScreenState extends ConsumerState<LeagueScreen>
    with SingleTickerProviderStateMixin {
  late final TabController _tabs;

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

  @override
  Widget build(BuildContext context) {
    final dashAsync = ref.watch(_dashboardProvider(widget.creatorId));
    final seasonAsync = ref.watch(_activeSeasonProvider);

    return Scaffold(
      backgroundColor: const Color(0xFF0D0D1A),
      appBar: AppBar(
        backgroundColor: const Color(0xFF0D0D1A),
        title: const Text(
          'Creator League',
          style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.emoji_events, color: Color(0xFFFFD700)),
            onPressed: () => _tabs.animateTo(0),
            tooltip: 'Leaderboard',
          ),
        ],
        bottom: TabBar(
          controller: _tabs,
          labelColor: const Color(0xFF00D4FF),
          unselectedLabelColor: Colors.white38,
          indicatorColor: const Color(0xFF7B2FBE),
          tabs: const [
            Tab(text: 'My Rank'),
            Tab(text: 'Competitions'),
          ],
        ),
      ),
      body: TabBarView(
        controller: _tabs,
        children: [
          // ── My Rank tab ────────────────────────────────────────────────────
          RefreshIndicator(
            color: const Color(0xFF7B2FBE),
            onRefresh: () async {
              ref.invalidate(_dashboardProvider(widget.creatorId));
              ref.invalidate(_activeSeasonProvider);
            },
            child: dashAsync.when(
              loading: () => const Center(child: CircularProgressIndicator(color: Color(0xFF7B2FBE))),
              error: (e, _) => _ErrorView(message: e.toString()),
              data: (dashboard) => seasonAsync.when(
                loading: () => const Center(child: CircularProgressIndicator(color: Color(0xFF7B2FBE))),
                error: (e, _) => _ErrorView(message: e.toString()),
                data: (season) => _MyRankView(
                  dashboard: dashboard,
                  season: season,
                  onViewLeaderboard: () {
                    if (season != null) {
                      Navigator.push(
                        context,
                        MaterialPageRoute(
                          builder: (_) => LeaderboardScreen(
                            seasonId: season.seasonId,
                            myCreatorId: widget.creatorId,
                          ),
                        ),
                      );
                    }
                  },
                ),
              ),
            ),
          ),
          // ── Competitions tab ───────────────────────────────────────────────
          CompetitionScreen(creatorId: widget.creatorId),
        ],
      ),
    );
  }
}

// ── My Rank View ──────────────────────────────────────────────────────────────

class _MyRankView extends StatelessWidget {
  const _MyRankView({
    required this.dashboard,
    required this.season,
    required this.onViewLeaderboard,
  });

  final EconomyDashboard dashboard;
  final LeagueSeason? season;
  final VoidCallback onViewLeaderboard;

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        // Season chip
        if (season != null)
          Center(
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
              decoration: BoxDecoration(
                color: const Color(0xFF1A1A2E),
                borderRadius: BorderRadius.circular(20),
                border: Border.all(color: const Color(0xFF7B2FBE)),
              ),
              child: Text(
                season!.seasonName,
                style: const TextStyle(color: Color(0xFF7B2FBE), fontWeight: FontWeight.w600),
              ),
            ),
          ),
        const SizedBox(height: 20),

        // Rank card
        _RankCard(dashboard: dashboard),
        const SizedBox(height: 16),

        // Salary card
        _SalaryCard(tier: dashboard.tier, salaryGst: dashboard.salaryGst),
        const SizedBox(height: 16),

        // Active promotions
        if (dashboard.activePromotions.isNotEmpty) ...[
          _SectionHeader(title: 'Active Boosts'),
          ...dashboard.activePromotions.map((p) => _PromotionChip(event: p)),
          const SizedBox(height: 16),
        ],

        // Leaderboard CTA
        if (season != null)
          ElevatedButton.icon(
            onPressed: onViewLeaderboard,
            icon: const Icon(Icons.leaderboard),
            label: const Text('View Full Leaderboard'),
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF7B2FBE),
              foregroundColor: Colors.white,
              minimumSize: const Size.fromHeight(48),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            ),
          ),
      ],
    );
  }
}

// ── Rank Card ─────────────────────────────────────────────────────────────────

class _RankCard extends StatelessWidget {
  const _RankCard({required this.dashboard});
  final EconomyDashboard dashboard;

  Color get _tierColor {
    switch ((dashboard.standing?.leagueTier ?? 'bronze').toLowerCase()) {
      case 'legend':   return const Color(0xFFFF4500);
      case 'diamond':  return const Color(0xFF00D4FF);
      case 'gold':     return const Color(0xFFFFD700);
      case 'silver':   return const Color(0xFFC0C0C0);
      default:         return const Color(0xFFCD7F32);
    }
  }

  String get _tierEmoji {
    switch ((dashboard.standing?.leagueTier ?? 'bronze').toLowerCase()) {
      case 'legend':   return '🔥';
      case 'diamond':  return '💎';
      case 'gold':     return '🥇';
      case 'silver':   return '🥈';
      default:         return '🥉';
    }
  }

  @override
  Widget build(BuildContext context) {
    final standing = dashboard.standing;
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [const Color(0xFF1A1A2E), _tierColor.withOpacity(0.15)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: _tierColor.withOpacity(0.5)),
      ),
      child: Column(
        children: [
          Text('$_tierEmoji ${(standing?.leagueTier ?? 'Bronze').toUpperCase()}',
              style: TextStyle(color: _tierColor, fontSize: 20, fontWeight: FontWeight.bold)),
          const SizedBox(height: 8),
          if (standing != null) ...[
            Text('#${standing.rankInTier}',
                style: const TextStyle(color: Colors.white, fontSize: 48, fontWeight: FontWeight.w900)),
            Text('in ${standing.leagueTier} tier',
                style: const TextStyle(color: Colors.white54, fontSize: 13)),
            const SizedBox(height: 8),
            Text('Score: ${standing.score.toStringAsFixed(1)}',
                style: const TextStyle(color: Colors.white70, fontSize: 14)),
          ] else
            const Text('No standing yet', style: TextStyle(color: Colors.white54)),
          if (standing?.promoted == true)
            _Badge(label: '⬆ Promoted', color: Colors.green),
          if (standing?.relegated == true)
            _Badge(label: '⬇ Relegated', color: Colors.red),
        ],
      ),
    );
  }
}

// ── Salary Card ───────────────────────────────────────────────────────────────

class _SalaryCard extends StatelessWidget {
  const _SalaryCard({required this.tier, required this.salaryGst});
  final String tier;
  final double salaryGst;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
      decoration: BoxDecoration(
        color: const Color(0xFF1A1A2E),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: const Color(0xFF7B2FBE).withOpacity(0.4)),
      ),
      child: Row(
        children: [
          const Icon(Icons.account_balance_wallet, color: Color(0xFF00D4FF), size: 32),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('${tier[0].toUpperCase()}${tier.substring(1)} Salary',
                    style: const TextStyle(color: Colors.white70, fontSize: 12)),
                Text(
                  '${salaryGst.toStringAsFixed(0)} GST / month',
                  style: const TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// ── Promotion Chip ────────────────────────────────────────────────────────────

class _PromotionChip extends StatelessWidget {
  const _PromotionChip({required this.event});
  final PromotionEvent event;

  @override
  Widget build(BuildContext context) {
    final icons = {
      'boost_discovery': Icons.rocket_launch,
      'featured_slot': Icons.star,
      'trending_badge': Icons.trending_up,
      'front_page': Icons.home,
      'collaboration_suggest': Icons.group,
    };
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: const Color(0xFF1A1A2E),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: const Color(0xFF00D4FF).withOpacity(0.3)),
      ),
      child: Row(
        children: [
          Icon(icons[event.action] ?? Icons.bolt, color: const Color(0xFF00D4FF), size: 20),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              event.action.replaceAll('_', ' ').toUpperCase(),
              style: const TextStyle(color: Colors.white70, fontSize: 12),
            ),
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
            decoration: BoxDecoration(
              color: const Color(0xFF00D4FF).withOpacity(0.15),
              borderRadius: BorderRadius.circular(8),
            ),
            child: const Text('ACTIVE', style: TextStyle(color: Color(0xFF00D4FF), fontSize: 10, fontWeight: FontWeight.bold)),
          ),
        ],
      ),
    );
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

class _SectionHeader extends StatelessWidget {
  const _SectionHeader({required this.title});
  final String title;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Text(title,
          style: const TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold)),
    );
  }
}

class _Badge extends StatelessWidget {
  const _Badge({required this.label, required this.color});
  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(top: 6),
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: color.withOpacity(0.15),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color.withOpacity(0.5)),
      ),
      child: Text(label, style: TextStyle(color: color, fontSize: 12, fontWeight: FontWeight.w600)),
    );
  }
}

class _ErrorView extends StatelessWidget {
  const _ErrorView({required this.message});
  final String message;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Text('Error: $message', style: const TextStyle(color: Colors.redAccent)),
    );
  }
}
