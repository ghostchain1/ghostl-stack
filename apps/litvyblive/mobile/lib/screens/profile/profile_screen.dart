import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../services/api_service.dart';
import '../../services/identity_service.dart';
import '../../services/auth_service.dart';
import '../../models/user_model.dart';
import '../../models/identity_model.dart';
import '../../widgets/badges/rank_badge.dart';
import 'edit_profile.dart';
import 'followers_screen.dart';

class ProfileScreen extends ConsumerWidget {
  final String userId;
  const ProfileScreen({super.key, required this.userId});

  bool get _isOwnProfile =>
      AuthService.instance.currentUser?.id == userId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return FutureBuilder<_ProfileData>(
      future: _loadData(),
      builder: (_, snap) {
        if (snap.connectionState == ConnectionState.waiting) {
          return const Scaffold(
            backgroundColor: Color(0xFF0D0D1A),
            body: Center(child: CircularProgressIndicator(
                valueColor: AlwaysStoppedAnimation(Color(0xFF7B2FBE)))),
          );
        }
        final data = snap.data;
        if (data == null) {
          return const Scaffold(
            backgroundColor: Color(0xFF0D0D1A),
            body: Center(
                child: Text('User not found',
                    style: TextStyle(color: Colors.white54))),
          );
        }
        final user     = data.user;
        final identity = data.identity;

        return Scaffold(
          backgroundColor: const Color(0xFF0D0D1A),
          body: CustomScrollView(
            slivers: [
              // ── Hero header ──────────────────────────────────────────
              SliverAppBar(
                expandedHeight: 240,
                pinned: true,
                backgroundColor: const Color(0xFF0D0D1A),
                iconTheme: const IconThemeData(color: Colors.white),
                actions: _isOwnProfile
                    ? [
                        IconButton(
                          icon: const Icon(Icons.edit_outlined, color: Colors.white70),
                          onPressed: () async {
                            if (identity == null) return;
                            final updated = await Navigator.of(context).push<bool>(
                              MaterialPageRoute(
                                  builder: (_) => EditProfileScreen(current: identity)),
                            );
                            if (updated == true) {
                              // Rebuild by navigating to same screen
                              if (context.mounted) {
                                Navigator.of(context).pushReplacement(
                                  MaterialPageRoute(
                                      builder: (_) => ProfileScreen(userId: userId)),
                                );
                              }
                            }
                          },
                        ),
                      ]
                    : null,
                flexibleSpace: FlexibleSpaceBar(
                  background: Container(
                    decoration: const BoxDecoration(
                      gradient: LinearGradient(
                        begin: Alignment.topLeft,
                        end: Alignment.bottomRight,
                        colors: [Color(0xFF7B2FBE), Color(0xFF00D4FF)],
                      ),
                    ),
                    alignment: Alignment.center,
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        // Avatar
                        CircleAvatar(
                          radius: 44,
                          backgroundColor: Colors.white24,
                          backgroundImage: user.avatarUrl.isNotEmpty
                              ? NetworkImage(user.avatarUrl)
                              : null,
                          child: user.avatarUrl.isEmpty
                              ? const Icon(Icons.person, size: 44, color: Colors.white)
                              : null,
                        ),
                        const SizedBox(height: 10),

                        // Ghost handle
                        Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text(
                              identity?.ghostHandle ??
                                  '@${user.username.toLowerCase()}.ghost',
                              style: const TextStyle(
                                  color: Colors.white,
                                  fontSize: 18,
                                  fontWeight: FontWeight.bold),
                            ),
                            if (identity?.isVerified == true) ...[
                              const SizedBox(width: 6),
                              const Icon(Icons.verified,
                                  color: Colors.white, size: 18),
                            ],
                          ],
                        ),

                        // Reputation tier badge
                        if (identity != null) ...[
                          const SizedBox(height: 4),
                          _TierBadge(tier: identity.reputationTier),
                        ],

                        const SizedBox(height: 4),
                        RankBadge(title: 'Lv ${user.level}'),

                        // Bio (if set)
                        if ((identity?.bio ?? '').isNotEmpty) ...[
                          const SizedBox(height: 6),
                          Padding(
                            padding: const EdgeInsets.symmetric(horizontal: 24),
                            child: Text(
                              identity!.bio,
                              textAlign: TextAlign.center,
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                  color: Colors.white70, fontSize: 12),
                            ),
                          ),
                        ],
                      ],
                    ),
                  ),
                ),
              ),

              // ── Stats row ─────────────────────────────────────────────
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 16),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                    children: [
                      _StatTap(
                        label: 'Followers',
                        value: '${user.followers}',
                        onTap: () => Navigator.of(context).push(
                          MaterialPageRoute(
                            builder: (_) => FollowersScreen(
                              userId: userId,
                              username: user.username,
                              initialTab: FollowersTab.followers,
                            ),
                          ),
                        ),
                      ),
                      _StatTap(
                        label: 'Following',
                        value: '${user.following}',
                        onTap: () => Navigator.of(context).push(
                          MaterialPageRoute(
                            builder: (_) => FollowersScreen(
                              userId: userId,
                              username: user.username,
                              initialTab: FollowersTab.following,
                            ),
                          ),
                        ),
                      ),
                      _Stat(label: 'Reputation', value: '${identity?.reputationScore ?? 0}'),
                    ],
                  ),
                ),
              ),

              // ── Detail tiles ──────────────────────────────────────────
              SliverList(
                delegate: SliverChildListDelegate([
                  const _SectionHeader('Creator Economy'),
                  _Tile(Icons.card_giftcard, 'Total Gifts', '${user.totalGifts} GST'),
                  _Tile(Icons.account_balance_wallet, 'GST Balance', '${user.gstBalance} GST'),

                  if (identity != null && identity.badges.isNotEmpty) ...[
                    const _SectionHeader('Badges'),
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                      child: Wrap(
                        spacing: 8,
                        runSpacing: 8,
                        children: identity.badges
                            .map((b) => _BadgeChip(label: b.replaceAll('_', ' ')))
                            .toList(),
                      ),
                    ),
                  ],

                  if (identity?.l1AnchorTxHash != null) ...[
                    const _SectionHeader('On-Chain Identity'),
                    _Tile(
                      Icons.link,
                      'L1 Anchor',
                      '${identity!.l1AnchorTxHash!.substring(0, 10)}…',
                    ),
                  ],

                  const SizedBox(height: 32),
                ]),
              ),
            ],
          ),
        );
      },
    );
  }

  Future<_ProfileData?> _loadData() async {
    try {
      final user = await ApiService.instance.getUser(userId);
      IdentityModel? identity;
      try {
        identity = await IdentityService.instance.getProfile(userId);
      } on Exception {
        identity = null;
      }
      return _ProfileData(user: user, identity: identity);
    } on Exception {
      return null;
    }
  }
}

class _ProfileData {
  final UserModel user;
  final IdentityModel? identity;
  const _ProfileData({required this.user, this.identity});
}

// ── Supporting widgets ────────────────────────────────────────────────────────

class _TierBadge extends StatelessWidget {
  final ReputationTier tier;
  const _TierBadge({required this.tier});

  Color get _color => switch (tier) {
    ReputationTier.ghost    => const Color(0xFF00D4FF),
    ReputationTier.platinum => const Color(0xFFE5E4E2),
    ReputationTier.gold     => const Color(0xFFFFD700),
    ReputationTier.silver   => const Color(0xFFC0C0C0),
    ReputationTier.bronze   => const Color(0xFFCD7F32),
  };

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 2),
    decoration: BoxDecoration(
      color: _color.withOpacity(0.2),
      borderRadius: BorderRadius.circular(12),
      border: Border.all(color: _color, width: 1),
    ),
    child: Text(
      tier.label,
      style: TextStyle(color: _color, fontSize: 11, fontWeight: FontWeight.bold),
    ),
  );
}

class _StatTap extends StatelessWidget {
  final String label;
  final String value;
  final VoidCallback onTap;
  const _StatTap({required this.label, required this.value, required this.onTap});

  @override
  Widget build(BuildContext context) => GestureDetector(
    onTap: onTap,
    child: Column(
      children: [
        Text(value,
            style: const TextStyle(
                color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold)),
        const SizedBox(height: 2),
        Text(label,
            style: const TextStyle(color: Colors.white54, fontSize: 12)),
      ],
    ),
  );
}

class _Stat extends StatelessWidget {
  final String label;
  final String value;
  const _Stat({required this.label, required this.value});

  @override
  Widget build(BuildContext context) => Column(
    children: [
      Text(value,
          style: const TextStyle(
              color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold)),
      const SizedBox(height: 2),
      Text(label, style: const TextStyle(color: Colors.white54, fontSize: 12)),
    ],
  );
}

class _SectionHeader extends StatelessWidget {
  final String title;
  const _SectionHeader(this.title);

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.fromLTRB(16, 20, 16, 4),
    child: Text(title.toUpperCase(),
        style: const TextStyle(
            color: Color(0xFF7B2FBE),
            fontSize: 11,
            fontWeight: FontWeight.bold,
            letterSpacing: 1.2)),
  );
}

class _Tile extends StatelessWidget {
  final IconData icon;
  final String label;
  final String value;
  const _Tile(this.icon, this.label, this.value);

  @override
  Widget build(BuildContext context) => ListTile(
    leading: Icon(icon, color: Colors.white54),
    title: Text(label, style: const TextStyle(color: Colors.white70)),
    trailing: Text(value,
        style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w600)),
  );
}

class _BadgeChip extends StatelessWidget {
  final String label;
  const _BadgeChip({required this.label});

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
    decoration: BoxDecoration(
      gradient: const LinearGradient(
          colors: [Color(0xFF7B2FBE), Color(0xFF3A0C6F)]),
      borderRadius: BorderRadius.circular(20),
    ),
    child: Text(label.toUpperCase(),
        style: const TextStyle(
            color: Colors.white, fontSize: 10, fontWeight: FontWeight.bold,
            letterSpacing: 0.8)),
  );
}
