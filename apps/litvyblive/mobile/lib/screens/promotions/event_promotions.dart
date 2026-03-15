import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../services/marketing_service.dart';

// ── Providers ─────────────────────────────────────────────────────────────────

final _campaignsProvider = FutureProvider.autoDispose<List<Campaign>>(
  (_) => MarketingService.instance.getCampaigns(status: 'active'),
);

final _growthProvider = FutureProvider.autoDispose<GrowthSummary>(
  (_) => MarketingService.instance.getGrowthSummary(),
);

// ── Campaign type metadata ─────────────────────────────────────────────────────

const _typeMeta = {
  'new_creator_promo':    _TypeMeta('🌱 New Creator',     Color(0xFF00FF88), Icons.stars),
  'viral_stream_boost':   _TypeMeta('🚀 Viral Boost',     Color(0xFF00D4FF), Icons.rocket_launch),
  'event_promotion':      _TypeMeta('📅 Event Promo',     Color(0xFFFFD700), Icons.event),
  'global_tournament':    _TypeMeta('🏆 Tournament',      Color(0xFF7B2FBE), Icons.emoji_events),
};

class _TypeMeta {
  final String label;
  final Color  color;
  final IconData icon;
  const _TypeMeta(this.label, this.color, this.icon);
}

// ── Screen ────────────────────────────────────────────────────────────────────

class EventPromotionsScreen extends ConsumerWidget {
  const EventPromotionsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final campaignsAsync = ref.watch(_campaignsProvider);
    final growthAsync    = ref.watch(_growthProvider);

    return Scaffold(
      backgroundColor: const Color(0xFF0D0D1A),
      appBar: AppBar(
        backgroundColor: const Color(0xFF0D0D1A),
        title: const Text(
          '📢 Promotions & Events',
          style: TextStyle(
              color: Colors.white, fontWeight: FontWeight.bold, fontSize: 20),
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.sync, color: Color(0xFF00D4FF)),
            onPressed: () {
              ref.invalidate(_campaignsProvider);
              ref.invalidate(_growthProvider);
            },
            tooltip: 'Refresh',
          ),
        ],
      ),
      body: CustomScrollView(
        slivers: [
          // Growth stats header
          SliverToBoxAdapter(
            child: growthAsync.when(
              loading: () => const SizedBox(height: 8),
              error:   (_, __) => const SizedBox(height: 8),
              data: (gs) => _GrowthHeader(summary: gs),
            ),
          ),

          // Campaigns list
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
              child: Text(
                'Active Campaigns',
                style: const TextStyle(
                  color: Colors.white70,
                  fontWeight: FontWeight.bold,
                  fontSize: 13,
                  letterSpacing: 1.5,
                ),
              ),
            ),
          ),

          campaignsAsync.when(
            loading: () => const SliverFillRemaining(
              child: Center(
                child: CircularProgressIndicator(color: Color(0xFF7B2FBE)),
              ),
            ),
            error: (e, _) => SliverFillRemaining(
              child: Center(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(Icons.error_outline,
                        color: Colors.redAccent, size: 48),
                    const SizedBox(height: 12),
                    const Text('Could not load campaigns.',
                        style: TextStyle(color: Colors.white70)),
                    TextButton(
                      onPressed: () => ref.invalidate(_campaignsProvider),
                      child: const Text('Retry',
                          style: TextStyle(color: Color(0xFF00D4FF))),
                    ),
                  ],
                ),
              ),
            ),
            data: (campaigns) => campaigns.isEmpty
                ? const SliverFillRemaining(
                    child: Center(
                      child: Text(
                        'No active promotions.\nGhostBrain is warming up…',
                        textAlign: TextAlign.center,
                        style: TextStyle(color: Colors.white54, fontSize: 16),
                      ),
                    ),
                  )
                : SliverPadding(
                    padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
                    sliver: SliverList(
                      delegate: SliverChildBuilderDelegate(
                        (ctx, i) => Padding(
                          padding: const EdgeInsets.only(bottom: 14),
                          child: _CampaignCard(campaign: campaigns[i]),
                        ),
                        childCount: campaigns.length,
                      ),
                    ),
                  ),
          ),
        ],
      ),
    );
  }
}

// ── Growth header ─────────────────────────────────────────────────────────────

class _GrowthHeader extends StatelessWidget {
  final GrowthSummary summary;
  const _GrowthHeader({required this.summary});

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.fromLTRB(16, 12, 16, 0),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xFF7B2FBE), Color(0xFF1A1A2E)],
        ),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
            color: const Color(0xFF7B2FBE).withOpacity(0.4), width: 1.5),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'GhostBrain Growth Engine',
            style: TextStyle(
              color: Colors.white,
              fontWeight: FontWeight.bold,
              fontSize: 15,
            ),
          ),
          const SizedBox(height: 12),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceAround,
            children: [
              _GrowthStat('🆕 New Users',
                  summary.totalNewUsers.toString()),
              _GrowthStat('🎁 GST Gifts',
                  '${(summary.totalGiftsGst / 1000).toStringAsFixed(1)}K'),
              _GrowthStat('👥 Followers',
                  summary.totalNewFollowers.toString()),
              _GrowthStat('📈 Avg ROI',
                  '${summary.avgRoiPct.toStringAsFixed(1)}%'),
            ],
          ),
        ],
      ),
    );
  }
}

class _GrowthStat extends StatelessWidget {
  final String label;
  final String value;
  const _GrowthStat(this.label, this.value);

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Text(value,
            style: const TextStyle(
                color: Colors.white,
                fontWeight: FontWeight.bold,
                fontSize: 16)),
        const SizedBox(height: 2),
        Text(label,
            style: const TextStyle(color: Colors.white54, fontSize: 9)),
      ],
    );
  }
}

// ── Campaign card ─────────────────────────────────────────────────────────────

class _CampaignCard extends ConsumerWidget {
  final Campaign campaign;
  const _CampaignCard({required this.campaign});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final meta = _typeMeta[campaign.type] ??
        const _TypeMeta('📢 Campaign', Color(0xFF7B2FBE), Icons.campaign);

    final spentPct = campaign.budgetGst > 0
        ? (campaign.spentGst / campaign.budgetGst).clamp(0.0, 1.0)
        : 0.0;

    return Container(
      decoration: BoxDecoration(
        color: const Color(0xFF1A1A2E),
        borderRadius: BorderRadius.circular(16),
        border:
            Border.all(color: meta.color.withOpacity(0.35), width: 1.2),
      ),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Header
            Row(
              children: [
                Container(
                  width: 40,
                  height: 40,
                  decoration: BoxDecoration(
                    color: meta.color.withOpacity(0.15),
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(
                        color: meta.color.withOpacity(0.4), width: 1),
                  ),
                  child: Icon(meta.icon, color: meta.color, size: 20),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        campaign.title,
                        style: const TextStyle(
                          color: Colors.white,
                          fontWeight: FontWeight.bold,
                          fontSize: 15,
                        ),
                      ),
                      Text(
                        meta.label,
                        style: TextStyle(
                            color: meta.color,
                            fontSize: 11,
                            fontWeight: FontWeight.w600),
                      ),
                    ],
                  ),
                ),
                // Live pulse
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    color: const Color(0xFF00FF88).withOpacity(0.15),
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(
                        color: const Color(0xFF00FF88).withOpacity(0.4)),
                  ),
                  child: const Text(
                    '● LIVE',
                    style: TextStyle(
                      color: Color(0xFF00FF88),
                      fontSize: 10,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
              ],
            ),

            const SizedBox(height: 12),

            // Description
            Text(
              campaign.description,
              style: const TextStyle(color: Colors.white70, fontSize: 12),
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),

            const SizedBox(height: 12),

            // Budget progress
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text('Budget',
                        style: const TextStyle(
                            color: Colors.white54, fontSize: 11)),
                    Text(
                      '${campaign.spentGst.toStringAsFixed(0)} / ${campaign.budgetGst.toStringAsFixed(0)} GST',
                      style: TextStyle(
                          color: meta.color,
                          fontSize: 11,
                          fontWeight: FontWeight.bold),
                    ),
                  ],
                ),
                const SizedBox(height: 6),
                ClipRRect(
                  borderRadius: BorderRadius.circular(4),
                  child: LinearProgressIndicator(
                    value: spentPct.toDouble(),
                    backgroundColor: meta.color.withOpacity(0.15),
                    color: meta.color,
                    minHeight: 6,
                  ),
                ),
              ],
            ),

            const SizedBox(height: 12),

            // Channel chips
            _ChannelChips(campaignId: campaign.campaignId),

            const SizedBox(height: 12),

            // Dates
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  'Ends ${_formatDate(campaign.endsAt)}',
                  style: const TextStyle(color: Colors.white38, fontSize: 10),
                ),
                GestureDetector(
                  onTap: () => _showDetails(context, campaign),
                  child: Text(
                    'See Details →',
                    style: TextStyle(
                      color: meta.color,
                      fontSize: 11,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  String _formatDate(String iso) {
    try {
      final dt = DateTime.parse(iso).toLocal();
      return '${dt.month}/${dt.day} ${dt.hour.toString().padLeft(2, '0')}:${dt.minute.toString().padLeft(2, '0')}';
    } catch (_) {
      return iso;
    }
  }

  void _showDetails(BuildContext context, Campaign campaign) {
    showModalBottomSheet(
      context: context,
      backgroundColor: const Color(0xFF1A1A2E),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(campaign.title,
                style: const TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.bold,
                    fontSize: 20)),
            const SizedBox(height: 8),
            Text(campaign.description,
                style: const TextStyle(color: Colors.white70)),
            const SizedBox(height: 16),
            _DetailRow('Campaign ID', campaign.campaignId.substring(0, 16)),
            _DetailRow('Budget', '${campaign.budgetGst.toStringAsFixed(0)} GST'),
            _DetailRow('Spent', '${campaign.spentGst.toStringAsFixed(0)} GST'),
            _DetailRow('Remaining',
                '${campaign.remainingBudget.toStringAsFixed(0)} GST'),
            _DetailRow('Starts', campaign.startsAt.substring(0, 16)),
            _DetailRow('Ends', campaign.endsAt.substring(0, 16)),
            if (campaign.vaultTxHash != null)
              _DetailRow('Vault Tx', campaign.vaultTxHash!.substring(0, 18)),
            const SizedBox(height: 16),
          ],
        ),
      ),
    );
  }
}

class _DetailRow extends StatelessWidget {
  final String label;
  final String value;
  const _DetailRow(this.label, this.value);

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: const TextStyle(color: Colors.white54, fontSize: 13)),
          Text(value,
              style: const TextStyle(
                  color: Colors.white,
                  fontWeight: FontWeight.w600,
                  fontSize: 13)),
        ],
      ),
    );
  }
}

// ── Channel chips (fetched from backend) ──────────────────────────────────────

final _reachProvider =
    FutureProvider.autoDispose.family<List<ChannelReach>, String>(
  (ref, id) => MarketingService.instance.getCampaignReach(id),
);

const _channelColors = {
  'tiktok':    Color(0xFFFF0050),
  'instagram': Color(0xFFE1306C),
  'youtube':   Color(0xFFFF0000),
  'x':         Color(0xFFFFFFFF),
  'discord':   Color(0xFF5865F2),
  'telegram':  Color(0xFF2AABEE),
};

class _ChannelChips extends ConsumerWidget {
  final String campaignId;
  const _ChannelChips({required this.campaignId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final reachAsync = ref.watch(_reachProvider(campaignId));
    return reachAsync.when(
      loading: () => const SizedBox(height: 20),
      error:   (_, __) => const SizedBox.shrink(),
      data: (channels) => Wrap(
        spacing: 6,
        runSpacing: 6,
        children: channels.map((ch) {
          final color = _channelColors[ch.channel] ?? Colors.white54;
          return Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
            decoration: BoxDecoration(
              color: color.withOpacity(0.12),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: color.withOpacity(0.4), width: 0.8),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  width: 6,
                  height: 6,
                  decoration: BoxDecoration(
                    color: ch.sent > 0 ? const Color(0xFF00FF88) : Colors.white30,
                    shape: BoxShape.circle,
                  ),
                ),
                const SizedBox(width: 4),
                Text(
                  ch.channel,
                  style: TextStyle(
                      color: color,
                      fontSize: 10,
                      fontWeight: FontWeight.w600),
                ),
              ],
            ),
          );
        }).toList(),
      ),
    );
  }
}
