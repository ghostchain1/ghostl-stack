import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../models/creator_token_model.dart';
import '../../services/launchpad_service.dart';
import 'buy_token_screen.dart';

// ── Providers ─────────────────────────────────────────────────────────────────

final _salesProvider = FutureProvider.autoDispose.family<List<TokenSaleModel>, String>((ref, tokenId) async {
  return LaunchpadService.instance.listSalesForToken(tokenId);
});

final _proposalsProvider = FutureProvider.autoDispose.family<List<DAOProposalModel>, String>((ref, tokenId) async {
  return LaunchpadService.instance.listProposals(tokenId);
});

final _rewardsProvider = FutureProvider.autoDispose.family<FanRewardStatus, String>((ref, tokenId) async {
  return LaunchpadService.instance.getMyRewards(tokenId);
});

final _topFansProvider = FutureProvider.autoDispose.family<List<Map<String, dynamic>>, String>((ref, tokenId) async {
  return LaunchpadService.instance.getTopFans(tokenId);
});

// ── Screen ────────────────────────────────────────────────────────────────────

class TokenDetailsScreen extends ConsumerStatefulWidget {
  const TokenDetailsScreen({super.key, required this.token});
  final CreatorTokenModel token;

  @override
  ConsumerState<TokenDetailsScreen> createState() => _TokenDetailsScreenState();
}

class _TokenDetailsScreenState extends ConsumerState<TokenDetailsScreen>
    with SingleTickerProviderStateMixin {
  late final TabController _tabs;

  @override
  void initState() {
    super.initState();
    _tabs = TabController(length: 3, vsync: this);
  }

  @override
  void dispose() {
    _tabs.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final t = widget.token;
    return Scaffold(
      backgroundColor: const Color(0xFF0D0D1A),
      appBar: AppBar(
        backgroundColor: const Color(0xFF0D0D1A),
        iconTheme: const IconThemeData(color: Colors.white),
        title: Text('\$${t.symbol}', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
        actions: [
          Container(
            margin: const EdgeInsets.only(right: 12),
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
            decoration: BoxDecoration(
              gradient: const LinearGradient(colors: [Color(0xFF7B2FBE), Color(0xFF00D4FF)]),
              borderRadius: BorderRadius.circular(20),
            ),
            child: Text('GhostL3', style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.bold)),
          ),
        ],
      ),
      body: Column(
        children: [
          _TokenHeader(token: t),
          TabBar(
            controller: _tabs,
            labelColor: const Color(0xFF00D4FF),
            unselectedLabelColor: Colors.white38,
            indicatorColor: const Color(0xFF7B2FBE),
            tabs: const [Tab(text: 'Sales'), Tab(text: 'DAO'), Tab(text: 'Top Fans')],
          ),
          Expanded(
            child: TabBarView(
              controller: _tabs,
              children: [
                _SalesTab(token: t),
                _DAOTab(token: t),
                _TopFansTab(tokenId: t.id),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// ── Token header ──────────────────────────────────────────────────────────────

class _TokenHeader extends ConsumerWidget {
  const _TokenHeader({required this.token});
  final CreatorTokenModel token;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final rewardsAsync = ref.watch(_rewardsProvider(token.id));
    return Container(
      margin: const EdgeInsets.all(12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [Color(0xFF1A1A2E), Color(0xFF16213E)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: const Color(0xFF7B2FBE).withAlpha(77)),
      ),
      child: Row(
        children: [
          Container(
            width: 60, height: 60,
            decoration: BoxDecoration(
              gradient: const LinearGradient(colors: [Color(0xFF7B2FBE), Color(0xFF00D4FF)]),
              borderRadius: BorderRadius.circular(14),
            ),
            child: Center(
              child: Text(token.symbol.isNotEmpty ? token.symbol[0] : '?',
                  style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 28)),
            ),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(token.name, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 16)),
                Text('\$${token.symbol}', style: const TextStyle(color: Color(0xFF00D4FF), fontSize: 13)),
                const SizedBox(height: 4),
                Text('Max Supply: ${_fmt(token.maxSupply)}',
                    style: const TextStyle(color: Colors.white54, fontSize: 11)),
              ],
            ),
          ),
          rewardsAsync.whenOrNull(
            data: (r) => _TierBadge(tier: r.tier),
          ) ?? const SizedBox.shrink(),
        ],
      ),
    );
  }

  String _fmt(double v) {
    if (v >= 1e9) return '${(v / 1e9).toStringAsFixed(1)}B';
    if (v >= 1e6) return '${(v / 1e6).toStringAsFixed(1)}M';
    if (v >= 1e3) return '${(v / 1e3).toStringAsFixed(1)}K';
    return v.toStringAsFixed(0);
  }
}

// ── Tier badge ────────────────────────────────────────────────────────────────

class _TierBadge extends StatelessWidget {
  const _TierBadge({required this.tier});
  final FanTier tier;

  Color get _color {
    switch (tier) {
      case FanTier.legendary: return const Color(0xFFFFD700);
      case FanTier.elite:     return const Color(0xFF00D4FF);
      case FanTier.vip:       return const Color(0xFF7B2FBE);
      case FanTier.fan:       return const Color(0xFF4CAF50);
      default:                return Colors.white38;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: _color.withAlpha(51),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: _color, width: 0.8),
      ),
      child: Text(tier.label.toUpperCase(),
          style: TextStyle(color: _color, fontSize: 10, fontWeight: FontWeight.bold)),
    );
  }
}

// ── Sales tab ─────────────────────────────────────────────────────────────────

class _SalesTab extends ConsumerWidget {
  const _SalesTab({required this.token});
  final CreatorTokenModel token;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(_salesProvider(token.id));
    return async.when(
      loading: () => const Center(child: CircularProgressIndicator(color: Color(0xFF7B2FBE))),
      error: (e, _) => Center(child: Text('$e', style: const TextStyle(color: Colors.red))),
      data: (sales) {
        if (sales.isEmpty) {
          return const Center(child: Text('No sales yet', style: TextStyle(color: Colors.white38)));
        }
        return ListView.builder(
          padding: const EdgeInsets.all(12),
          itemCount: sales.length,
          itemBuilder: (ctx, i) => _SaleCard(sale: sales[i], token: token),
        );
      },
    );
  }
}

class _SaleCard extends StatelessWidget {
  const _SaleCard({required this.sale, required this.token});
  final TokenSaleModel sale;
  final CreatorTokenModel token;

  @override
  Widget build(BuildContext context) {
    return Card(
      color: const Color(0xFF1A1A2E),
      margin: const EdgeInsets.only(bottom: 12),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: const BorderSide(color: Color(0xFF7B2FBE), width: 0.4),
      ),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Icon(Icons.local_offer, color: Color(0xFF00D4FF), size: 16),
                const SizedBox(width: 6),
                Text('${sale.priceGst} GST each',
                    style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                const Spacer(),
                if (sale.isActive)
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                    decoration: BoxDecoration(
                      color: const Color(0xFF4CAF50).withAlpha(51),
                      borderRadius: BorderRadius.circular(6),
                    ),
                    child: const Text('ACTIVE', style: TextStyle(color: Color(0xFF4CAF50), fontSize: 10, fontWeight: FontWeight.bold)),
                  ),
              ],
            ),
            const SizedBox(height: 10),
            ClipRRect(
              borderRadius: BorderRadius.circular(4),
              child: LinearProgressIndicator(
                value: sale.progress.clamp(0.0, 1.0),
                backgroundColor: Colors.white12,
                valueColor: const AlwaysStoppedAnimation(Color(0xFF7B2FBE)),
                minHeight: 8,
              ),
            ),
            const SizedBox(height: 6),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text('${sale.sold.toStringAsFixed(0)} / ${sale.totalForSale.toStringAsFixed(0)} sold',
                    style: const TextStyle(color: Colors.white54, fontSize: 11)),
                Text('Ends ${_relTime(sale.endsAt)}',
                    style: const TextStyle(color: Colors.white38, fontSize: 11)),
              ],
            ),
            if (sale.isActive) ...[
              const SizedBox(height: 12),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: () => Navigator.push(
                    context,
                    MaterialPageRoute(builder: (_) => BuyTokenScreen(token: token, sale: sale)),
                  ),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF7B2FBE),
                    foregroundColor: Colors.white,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                  ),
                  child: const Text('Buy Tokens'),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  String _relTime(DateTime dt) {
    final diff = dt.difference(DateTime.now());
    if (diff.isNegative) return 'ended';
    if (diff.inDays > 0) return 'in ${diff.inDays}d';
    if (diff.inHours > 0) return 'in ${diff.inHours}h';
    return 'in ${diff.inMinutes}m';
  }
}

// ── DAO tab ───────────────────────────────────────────────────────────────────

class _DAOTab extends ConsumerWidget {
  const _DAOTab({required this.token});
  final CreatorTokenModel token;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(_proposalsProvider(token.id));
    return async.when(
      loading: () => const Center(child: CircularProgressIndicator(color: Color(0xFF7B2FBE))),
      error: (e, _) => Center(child: Text('$e', style: const TextStyle(color: Colors.red))),
      data: (proposals) {
        if (proposals.isEmpty) {
          return const Center(child: Text('No proposals yet', style: TextStyle(color: Colors.white38)));
        }
        return ListView.builder(
          padding: const EdgeInsets.all(12),
          itemCount: proposals.length,
          itemBuilder: (ctx, i) => _ProposalCard(proposal: proposals[i]),
        );
      },
    );
  }
}

class _ProposalCard extends StatelessWidget {
  const _ProposalCard({required this.proposal});
  final DAOProposalModel proposal;

  @override
  Widget build(BuildContext context) {
    final total = proposal.totalVotes;
    final forPct = total > 0 ? proposal.votesFor / total : 0.0;
    return Card(
      color: const Color(0xFF1A1A2E),
      margin: const EdgeInsets.only(bottom: 10),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: BorderSide(
          color: proposal.isOpen ? const Color(0xFF00D4FF).withAlpha(77) : Colors.white12,
          width: 0.5,
        ),
      ),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(proposal.description,
                      style: const TextStyle(color: Colors.white, fontSize: 13),
                      maxLines: 3, overflow: TextOverflow.ellipsis),
                ),
                const SizedBox(width: 8),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                  decoration: BoxDecoration(
                    color: (proposal.isOpen ? const Color(0xFF00D4FF) : Colors.white24).withAlpha(38),
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: Text(proposal.isOpen ? 'OPEN' : 'CLOSED',
                      style: TextStyle(
                        color: proposal.isOpen ? const Color(0xFF00D4FF) : Colors.white38,
                        fontSize: 10, fontWeight: FontWeight.bold,
                      )),
                ),
              ],
            ),
            if (total > 0) ...[
              const SizedBox(height: 10),
              Row(
                children: [
                  Expanded(
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(4),
                      child: LinearProgressIndicator(
                        value: forPct.clamp(0.0, 1.0),
                        backgroundColor: Colors.red.withAlpha(77),
                        valueColor: const AlwaysStoppedAnimation(Color(0xFF4CAF50)),
                        minHeight: 6,
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Text('${(forPct * 100).toStringAsFixed(0)}% FOR',
                      style: const TextStyle(color: Colors.white54, fontSize: 10)),
                ],
              ),
            ],
            if (proposal.isOpen) ...[
              const SizedBox(height: 10),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      onPressed: () => _vote(context, true),
                      style: OutlinedButton.styleFrom(
                        foregroundColor: const Color(0xFF4CAF50),
                        side: const BorderSide(color: Color(0xFF4CAF50)),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                      ),
                      child: const Text('FOR'),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: OutlinedButton(
                      onPressed: () => _vote(context, false),
                      style: OutlinedButton.styleFrom(
                        foregroundColor: Colors.red,
                        side: const BorderSide(color: Colors.red),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                      ),
                      child: const Text('AGAINST'),
                    ),
                  ),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }

  Future<void> _vote(BuildContext context, bool support) async {
    try {
      await LaunchpadService.instance.vote(proposal.id, support: support);
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Vote cast: ${support ? "FOR" : "AGAINST"}'),
              backgroundColor: const Color(0xFF7B2FBE)),
        );
      }
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('$e'), backgroundColor: Colors.red),
        );
      }
    }
  }
}

// ── Top fans tab ──────────────────────────────────────────────────────────────

class _TopFansTab extends ConsumerWidget {
  const _TopFansTab({required this.tokenId});
  final String tokenId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(_topFansProvider(tokenId));
    return async.when(
      loading: () => const Center(child: CircularProgressIndicator(color: Color(0xFF7B2FBE))),
      error: (e, _) => Center(child: Text('$e', style: const TextStyle(color: Colors.red))),
      data: (fans) => fans.isEmpty
          ? const Center(child: Text('No fans yet', style: TextStyle(color: Colors.white38)))
          : ListView.builder(
              padding: const EdgeInsets.all(12),
              itemCount: fans.length,
              itemBuilder: (ctx, i) {
                final fan = fans[i];
                final tier = FanTierExt.fromString(fan['tier'] as String? ?? '');
                return ListTile(
                  leading: CircleAvatar(
                    backgroundColor: const Color(0xFF7B2FBE).withAlpha(77),
                    child: Text('${i + 1}', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                  ),
                  title: Text(fan['user_id'] as String? ?? '—',
                      style: const TextStyle(color: Colors.white, fontSize: 13)),
                  subtitle: Text(tier.label, style: const TextStyle(color: Color(0xFF00D4FF), fontSize: 11)),
                  trailing: Text('${(fan['amount'] as num).toStringAsFixed(0)} tokens',
                      style: const TextStyle(color: Colors.white54, fontSize: 12)),
                );
              },
            ),
    );
  }
}
