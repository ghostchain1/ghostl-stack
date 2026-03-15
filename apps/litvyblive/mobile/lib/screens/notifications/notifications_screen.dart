import 'package:flutter/material.dart';
import '../../core/theme/app_theme.dart';

class NotificationItem {
  const NotificationItem({
    required this.type,
    required this.title,
    required this.body,
    required this.time,
    this.read = false,
  });
  final String type;
  final String title;
  final String body;
  final DateTime time;
  final bool read;
}

class NotificationsScreen extends StatefulWidget {
  const NotificationsScreen({super.key});

  @override
  State<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends State<NotificationsScreen> {
  // Demo notifications — real app reads from backend
  final List<NotificationItem> _items = [
    NotificationItem(
      type: 'gift',
      title: 'You received a gift!',
      body: 'GhostHype sent you a Ghost Dragon (×3)',
      time: DateTime.now().subtract(const Duration(minutes: 2)),
    ),
    NotificationItem(
      type: 'stream',
      title: 'GhostQueen went live',
      body: 'Tap to join the stream',
      time: DateTime.now().subtract(const Duration(hours: 1)),
      read: true,
    ),
    NotificationItem(
      type: 'pk',
      title: 'PK Challenge incoming!',
      body: 'NightStar challenged you to a PK battle',
      time: DateTime.now().subtract(const Duration(hours: 3)),
    ),
    NotificationItem(
      type: 'league',
      title: 'League results are in',
      body: 'You ranked #12 in Ghost League Season 7',
      time: DateTime.now().subtract(const Duration(days: 1)),
      read: true,
    ),
  ];

  IconData _iconForType(String type) {
    return switch (type) {
      'gift' => Icons.card_giftcard,
      'stream' => Icons.live_tv,
      'pk' => Icons.sports_kabaddi,
      'league' => Icons.emoji_events,
      _ => Icons.notifications,
    };
  }

  Color _colorForType(String type) {
    return switch (type) {
      'gift' => Colors.pinkAccent,
      'stream' => AppTheme.brandPurple,
      'pk' => Colors.orangeAccent,
      'league' => Colors.amberAccent,
      _ => Colors.white54,
    };
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.darkBg,
      appBar: AppBar(
        backgroundColor: AppTheme.darkBg,
        title: const Text('Notifications'),
        foregroundColor: Colors.white,
        actions: [
          TextButton(
            onPressed: () => setState(() {}),
            child: const Text('Mark all read', style: TextStyle(color: Colors.white54)),
          ),
        ],
      ),
      body: _items.isEmpty
          ? const Center(
              child: Text('No notifications', style: TextStyle(color: Colors.white38)),
            )
          : ListView.separated(
              itemCount: _items.length,
              separatorBuilder: (_, __) => const Divider(
                color: Colors.white10,
                height: 1,
                indent: 72,
              ),
              itemBuilder: (context, i) {
                final item = _items[i];
                return ListTile(
                  leading: CircleAvatar(
                    backgroundColor: _colorForType(item.type).withOpacity(0.15),
                    child: Icon(
                      _iconForType(item.type),
                      color: _colorForType(item.type),
                      size: 20,
                    ),
                  ),
                  title: Text(
                    item.title,
                    style: TextStyle(
                      color: item.read ? Colors.white54 : Colors.white,
                      fontWeight: item.read ? FontWeight.normal : FontWeight.bold,
                    ),
                  ),
                  subtitle: Text(
                    item.body,
                    style: const TextStyle(color: Colors.white54, fontSize: 13),
                  ),
                  trailing: Text(
                    _timeLabel(item.time),
                    style: const TextStyle(color: Colors.white38, fontSize: 11),
                  ),
                  onTap: () => setState(() {}),
                );
              },
            ),
    );
  }

  String _timeLabel(DateTime dt) {
    final diff = DateTime.now().difference(dt);
    if (diff.inMinutes < 60) return '${diff.inMinutes}m';
    if (diff.inHours < 24) return '${diff.inHours}h';
    return '${diff.inDays}d';
  }
}
