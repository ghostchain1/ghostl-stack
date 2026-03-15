import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/theme/app_theme.dart';
import '../../core/utils/formatters.dart';
import '../../services/api_service.dart';
import '../../services/auth_service.dart';

// ── Models ───────────────────────────────────────────────────────────────────

class InsightsSummary {
  final double totalGstEarned;
  final int totalStreams;
  final int totalViewers;
  final int totalFollowers;
  final int newFollowers;
  final double avgViewersPerStream;
  final double engagementRate;
  final List<DailyRevenue> revenueHistory;
  final List<TopGifter> topGifters;
  final Map<String, double> revenueBreakdown;

  const InsightsSummary({
    required this.totalGstEarned,
    required this.totalStreams,
    required this.totalViewers,
    required this.totalFollowers,
    required this.newFollowers,
    required this.avgViewersPerStream,
    required this.engagementRate,
    required this.revenueHistory,
    required this.topGifters,
    required this.revenueBreakdown,
  });

  factory InsightsSummary.demo() => InsightsSummary(
        totalGstEarned: 142850.5,
        totalStreams: 38,
        totalViewers: 94200,
        totalFollowers: 12_700,
        newFollowers: 1_430,
        avgViewersPerStream: 2479.0,
        engagementRate: 8.4,
        revenueHistory: List.generate(
          14,
          (i) => DailyRevenue(
            date: DateTime.now().subtract(Duration(days: 13 - i)),
            gst: (3000 + (i * 420) + (i % 3 == 0 ? 1800 : 0)).toDouble(),
          ),
        ),
        topGifters: [
          TopGifter(name: '0xVybz', gstTotal: 8400, gifts: 23),
          TopGifter(name: 'GhostFan99', gstTotal: 6200, gifts: 18),
          TopGifter(name: 'CryptoRose', gstTotal: 4100, gifts: 11),
          TopGifter(name: 'L3Legend', gstTotal: 2900, gifts: 9),
          TopGifter(name: 'StarSender', gstTotal: 1600, gifts: 6),
        ],
        revenueBreakdown: {
          'Gifts': 68.0,
          'Subscriptions': 19.0,
          'Sponsorships': 8.0,
          'Creator Tokens': 5.0,
        },
      );
}

class DailyRevenue {
  final DateTime date;
  final double gst;
  const DailyRevenue({required this.date, required this.gst});
}

class TopGifter {
  final String name;
  final double gstTotal;
  final int gifts;
  const TopGifter({required this.name, required this.gstTotal, required this.gifts});
}

// ── Provider ─────────────────────────────────────────────────────────────────

final _selectedPeriodProvider = StateProvider<String>((ref) => '14d');

final _insightsProvider =
    FutureProvider.family<InsightsSummary, String>((ref, period) async {
  try {
    final userId = AuthService.instance.currentUser?.id ?? '';
    return await ApiService.instance.getCreatorInsights(userId, period);
  } catch (_) {
    return InsightsSummary.demo();
  }
});

// ── Screen ───────────────────────────────────────────────────────────────────

class CreatorInsightsScreen extends ConsumerWidget {
  const CreatorInsightsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final period = ref.watch(_selectedPeriodProvider);
    final async = ref.watch(_insightsProvider(period));

    return Scaffold(
      backgroundColor: AppTheme.darkBg,
      appBar: AppBar(
        backgroundColor: AppTheme.darkBg,
        title: const Text('Creator Insights',
            style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh, color: AppTheme.ghostBlue),
            onPressed: () => ref.invalidate(_insightsProvider(period)),
          ),
        ],
      ),
      body: Column(
        children: [
          _PeriodSelector(
            selected: period,
            onChanged: (p) =>
                ref.read(_selectedPeriodProvider.notifier).state = p,
          ),
          Expanded(
            child: async.when(
              loading: () => const Center(
                child: CircularProgressIndicator(color: AppTheme.brandPurple),
              ),
              error: (e, _) => Center(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(Icons.error_outline, color: Colors.redAccent, size: 48),
                    const SizedBox(height: 12),
                    Text('$e', style: const TextStyle(color: Colors.white54)),
                    TextButton(
                      onPressed: () => ref.invalidate(_insightsProvider(period)),
                      child: const Text('Retry',
                          style: TextStyle(color: AppTheme.ghostBlue)),
                    ),
                  ],
                ),
              ),
              data: (s) => _InsightsBody(summary: s),
            ),
          ),
        ],
      ),
    );
  }
}

// ── Period selector ───────────────────────────────────────────────────────────

class _PeriodSelector extends StatelessWidget {
  final String selected;
  final ValueChanged<String> onChanged;
  const _PeriodSelector({required this.selected, required this.onChanged});

  static const _periods = ['7d', '14d', '30d', '90d'];

  @override
  Widget build(BuildContext context) {
    return Container(
      color: AppTheme.darkCard,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
      child: Row(
        children: _periods.map((p) {
          final active = p == selected;
          return GestureDetector(
            onTap: () => onChanged(p),
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 200),
              margin: const EdgeInsets.only(right: 8),
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
              decoration: BoxDecoration(
                color: active ? AppTheme.brandPurple : AppTheme.darkSurface,
                borderRadius: BorderRadius.circular(20),
              ),
              child: Text(
                p,
                style: TextStyle(
                  color: active ? Colors.white : Colors.white54,
                  fontWeight: active ? FontWeight.bold : FontWeight.normal,
                  fontSize: 13,
                ),
              ),
            ),
          );
        }).toList(),
      ),
    );
  }
}

// ── Main body ─────────────────────────────────────────────────────────────────

class _InsightsBody extends StatelessWidget {
  final InsightsSummary summary;
  const _InsightsBody({required this.summary});

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        // Hero KPI row
        _KpiRow(summary: summary),
        const SizedBox(height: 20),

        // Revenue chart
        _SectionHeader(icon: Icons.bar_chart, title: 'GST Revenue'),
        const SizedBox(height: 8),
        _MiniBarChart(history: summary.revenueHistory),
        const SizedBox(height: 20),

        // Revenue breakdown
        _SectionHeader(icon: Icons.pie_chart, title: 'Revenue Breakdown'),
        const SizedBox(height: 8),
        _RevenueBreakdown(breakdown: summary.revenueBreakdown),
        const SizedBox(height: 20),

        // Top gifters
        _SectionHeader(icon: Icons.favorite, title: 'Top Gifters'),
        const SizedBox(height: 8),
        _TopGiftersList(gifters: summary.topGifters),
        const SizedBox(height: 20),

        // Engagement
        _SectionHeader(icon: Icons.people, title: 'Audience & Engagement'),
        const SizedBox(height: 8),
        _EngagementCard(summary: summary),
        const SizedBox(height: 40),
      ],
    );
  }
}

// ── KPI row ───────────────────────────────────────────────────────────────────

class _KpiRow extends StatelessWidget {
  final InsightsSummary summary;
  const _KpiRow({required this.summary});

  @override
  Widget build(BuildContext context) {
    return GridView.count(
      crossAxisCount: 2,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      mainAxisSpacing: 12,
      crossAxisSpacing: 12,
      childAspectRatio: 2.0,
      children: [
        _KpiCard(
          label: 'GST Earned',
          value: GstFormatter.compact(summary.totalGstEarned),
          icon: Icons.account_balance_wallet,
          color: AppTheme.brandPurple,
        ),
        _KpiCard(
          label: 'New Followers',
          value: '+${summary.newFollowers}',
          icon: Icons.person_add,
          color: AppTheme.brandPink,
        ),
        _KpiCard(
          label: 'Total Streams',
          value: '${summary.totalStreams}',
          icon: Icons.live_tv,
          color: AppTheme.ghostBlue,
        ),
        _KpiCard(
          label: 'Avg Viewers',
          value: ViewerFormatter.format(summary.avgViewersPerStream.round()),
          icon: Icons.visibility,
          color: AppTheme.brandGold,
        ),
      ],
    );
  }
}

class _KpiCard extends StatelessWidget {
  final String label, value;
  final IconData icon;
  final Color color;
  const _KpiCard(
      {required this.label,
      required this.value,
      required this.icon,
      required this.color});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        color: AppTheme.darkCard,
        borderRadius: BorderRadius.circular(14),
        border:
            Border.all(color: color.withOpacity(0.25), width: 1),
      ),
      child: Row(
        children: [
          Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(
              color: color.withOpacity(0.15),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(icon, color: color, size: 18),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(value,
                    style: TextStyle(
                        color: color,
                        fontWeight: FontWeight.bold,
                        fontSize: 16)),
                Text(label,
                    style: const TextStyle(
                        color: Colors.white54, fontSize: 10)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// ── Mini bar chart ────────────────────────────────────────────────────────────

class _MiniBarChart extends StatelessWidget {
  final List<DailyRevenue> history;
  const _MiniBarChart({required this.history});

  @override
  Widget build(BuildContext context) {
    if (history.isEmpty) return const SizedBox.shrink();
    final maxGst = history.map((d) => d.gst).reduce((a, b) => a > b ? a : b);

    return Container(
      height: 120,
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
      decoration: BoxDecoration(
        color: AppTheme.darkCard,
        borderRadius: BorderRadius.circular(14),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: history.map((d) {
          final frac = maxGst > 0 ? d.gst / maxGst : 0.0;
          final isToday =
              DateFormatter.fullDate(d.date) == DateFormatter.fullDate(DateTime.now());
          return Expanded(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 2),
              child: Tooltip(
                message: '${GstFormatter.compact(d.gst)} GST\n${DateFormatter.fullDate(d.date)}',
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.end,
                  children: [
                    AnimatedContainer(
                      duration: Duration(milliseconds: 300 + history.indexOf(d) * 30),
                      height: 90 * frac,
                      decoration: BoxDecoration(
                        gradient: LinearGradient(
                          begin: Alignment.bottomCenter,
                          end: Alignment.topCenter,
                          colors: isToday
                              ? [AppTheme.brandPurple, AppTheme.ghostBlue]
                              : [
                                  AppTheme.brandPurple.withOpacity(0.6),
                                  AppTheme.brandPurple.withOpacity(0.3),
                                ],
                        ),
                        borderRadius: BorderRadius.circular(3),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          );
        }).toList(),
      ),
    );
  }
}

// ── Revenue breakdown ─────────────────────────────────────────────────────────

class _RevenueBreakdown extends StatelessWidget {
  final Map<String, double> breakdown;
  const _RevenueBreakdown({required this.breakdown});

  static const _colors = [
    AppTheme.brandPurple,
    AppTheme.brandGold,
    AppTheme.brandPink,
    AppTheme.ghostBlue,
  ];

  @override
  Widget build(BuildContext context) {
    final entries = breakdown.entries.toList();
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppTheme.darkCard,
        borderRadius: BorderRadius.circular(14),
      ),
      child: Column(
        children: List.generate(entries.length, (i) {
          final e = entries[i];
          final color = _colors[i % _colors.length];
          return Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: Row(
              children: [
                Container(
                    width: 10,
                    height: 10,
                    decoration: BoxDecoration(
                        color: color,
                        borderRadius: BorderRadius.circular(3))),
                const SizedBox(width: 10),
                Expanded(
                    child: Text(e.key,
                        style: const TextStyle(
                            color: Colors.white70, fontSize: 13))),
                Text('${e.value.toStringAsFixed(0)}%',
                    style: TextStyle(
                        color: color,
                        fontWeight: FontWeight.bold,
                        fontSize: 13)),
                const SizedBox(width: 10),
                SizedBox(
                  width: 100,
                  height: 6,
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(3),
                    child: LinearProgressIndicator(
                      value: e.value / 100,
                      backgroundColor: Colors.white12,
                      valueColor: AlwaysStoppedAnimation(color),
                    ),
                  ),
                ),
              ],
            ),
          );
        }),
      ),
    );
  }
}

// ── Top gifters ───────────────────────────────────────────────────────────────

class _TopGiftersList extends StatelessWidget {
  final List<TopGifter> gifters;
  const _TopGiftersList({required this.gifters});

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: AppTheme.darkCard,
        borderRadius: BorderRadius.circular(14),
      ),
      child: Column(
        children: List.generate(gifters.length, (i) {
          final g = gifters[i];
          final isTop = i == 0;
          return ListTile(
            contentPadding:
                const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
            leading: CircleAvatar(
              backgroundColor: isTop
                  ? AppTheme.brandGold
                  : AppTheme.darkSurface,
              child: Text('${i + 1}',
                  style: TextStyle(
                    color: isTop ? Colors.black : Colors.white54,
                    fontWeight: FontWeight.bold,
                  )),
            ),
            title: Text(g.name,
                style: const TextStyle(
                    color: Colors.white, fontWeight: FontWeight.w500)),
            subtitle: Text('${g.gifts} gifts',
                style: const TextStyle(
                    color: Colors.white38, fontSize: 11)),
            trailing: Text(
              GstFormatter.compact(g.gstTotal),
              style: TextStyle(
                  color: isTop ? AppTheme.brandGold : AppTheme.brandPurple,
                  fontWeight: FontWeight.bold,
                  fontSize: 14),
            ),
          );
        }),
      ),
    );
  }
}

// ── Engagement card ───────────────────────────────────────────────────────────

class _EngagementCard extends StatelessWidget {
  final InsightsSummary summary;
  const _EngagementCard({required this.summary});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppTheme.darkCard,
        borderRadius: BorderRadius.circular(14),
      ),
      child: Column(
        children: [
          _EngagementRow('Total Followers',
              ViewerFormatter.format(summary.totalFollowers), AppTheme.brandPurple),
          const Divider(color: Colors.white12),
          _EngagementRow('Total Streams', '${summary.totalStreams}', AppTheme.ghostBlue),
          const Divider(color: Colors.white12),
          _EngagementRow('Total Watch-Time Views',
              ViewerFormatter.format(summary.totalViewers), AppTheme.brandPink),
          const Divider(color: Colors.white12),
          _EngagementRow(
              'Engagement Rate', '${summary.engagementRate}%', AppTheme.brandGold),
        ],
      ),
    );
  }
}

class _EngagementRow extends StatelessWidget {
  final String label, value;
  final Color color;
  const _EngagementRow(this.label, this.value, this.color);

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label,
              style: const TextStyle(color: Colors.white70, fontSize: 13)),
          Text(value,
              style: TextStyle(
                  color: color,
                  fontWeight: FontWeight.bold,
                  fontSize: 14)),
        ],
      ),
    );
  }
}

// ── Section header ────────────────────────────────────────────────────────────

class _SectionHeader extends StatelessWidget {
  final IconData icon;
  final String title;
  const _SectionHeader({required this.icon, required this.title});

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Icon(icon, color: AppTheme.brandPurple, size: 18),
        const SizedBox(width: 8),
        Text(title,
            style: const TextStyle(
                color: Colors.white,
                fontWeight: FontWeight.bold,
                fontSize: 15)),
      ],
    );
  }
}
