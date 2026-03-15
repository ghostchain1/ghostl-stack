import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/providers/auth_provider.dart';
import '../../core/providers/wallet_provider.dart';
import '../../core/theme/app_theme.dart';

class SettingsScreen extends ConsumerWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(authProvider);
    final wallet = ref.watch(walletProvider);

    return Scaffold(
      backgroundColor: AppTheme.darkBg,
      appBar: AppBar(
        backgroundColor: AppTheme.darkBg,
        title: const Text('Settings'),
        foregroundColor: Colors.white,
      ),
      body: ListView(
        children: [
          _section('Account', [
            _tile(
              context,
              icon: Icons.person_outline,
              label: 'Profile',
              onTap: () {
                final userId = auth.user?.id;
                if (userId != null) context.go('/profile/$userId');
              },
            ),
            _tile(
              context,
              icon: Icons.account_balance_wallet_outlined,
              label: 'Wallet',
              subtitle: wallet.walletAddress.isEmpty
                  ? null
                  : wallet.walletAddress.substring(0, 10) + '…',
              onTap: () => context.go('/wallet'),
            ),
          ]),
          _section('Notifications', [
            _switchTile(
              icon: Icons.notifications_outlined,
              label: 'Push Notifications',
              value: true,
              onChanged: (_) {},
            ),
            _switchTile(
              icon: Icons.card_giftcard_outlined,
              label: 'Gift Alerts',
              value: true,
              onChanged: (_) {},
            ),
          ]),
          _section('Streaming', [
            _switchTile(
              icon: Icons.hd_outlined,
              label: 'HD Streaming',
              value: true,
              onChanged: (_) {},
            ),
            _switchTile(
              icon: Icons.wifi_outlined,
              label: 'WiFi Only',
              value: false,
              onChanged: (_) {},
            ),
          ]),
          _section('Legal', [
            _tile(
              context,
              icon: Icons.description_outlined,
              label: 'Terms of Service',
              onTap: () {},
            ),
            _tile(
              context,
              icon: Icons.privacy_tip_outlined,
              label: 'Privacy Policy',
              onTap: () {},
            ),
          ]),
          const SizedBox(height: 12),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: ElevatedButton.icon(
              icon: const Icon(Icons.logout),
              label: const Text('Sign Out'),
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.red.shade800,
                foregroundColor: Colors.white,
                minimumSize: const Size.fromHeight(48),
              ),
              onPressed: () async {
                await ref.read(authProvider.notifier).logout();
                if (context.mounted) context.go('/login');
              },
            ),
          ),
          const SizedBox(height: 32),
        ],
      ),
    );
  }

  Widget _section(String title, List<Widget> children) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 20, 16, 6),
            child: Text(
              title.toUpperCase(),
              style: const TextStyle(
                color: Colors.white54,
                fontSize: 11,
                letterSpacing: 1.2,
              ),
            ),
          ),
          ...children,
        ],
      );

  Widget _tile(
    BuildContext context, {
    required IconData icon,
    required String label,
    String? subtitle,
    required VoidCallback onTap,
  }) =>
      ListTile(
        leading: Icon(icon, color: Colors.white70),
        title: Text(label, style: const TextStyle(color: Colors.white)),
        subtitle: subtitle != null
            ? Text(subtitle, style: const TextStyle(color: Colors.white38))
            : null,
        trailing: const Icon(Icons.chevron_right, color: Colors.white38),
        onTap: onTap,
      );

  Widget _switchTile({
    required IconData icon,
    required String label,
    required bool value,
    required ValueChanged<bool> onChanged,
  }) =>
      SwitchListTile(
        secondary: Icon(icon, color: Colors.white70),
        title: Text(label, style: const TextStyle(color: Colors.white)),
        value: value,
        onChanged: onChanged,
        activeColor: AppTheme.brandPurple,
      );
}
