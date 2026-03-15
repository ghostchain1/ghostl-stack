import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

/// Top-level handler required by Firebase for background messages.
@pragma('vm:entry-point')
Future<void> firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  // Firebase is already initialised in AppDelegate / main()
  debugPrint('[FCM BG] ${message.messageId}: ${message.data}');
}

class NotificationHandler {
  NotificationHandler._();
  static final NotificationHandler instance = NotificationHandler._();

  final _messaging = FirebaseMessaging.instance;

  /// Call once after Firebase.initializeApp() in main().
  Future<void> init(BuildContext context) async {
    await _messaging.requestPermission(
      alert: true,
      badge: true,
      sound: true,
    );

    FirebaseMessaging.onBackgroundMessage(firebaseMessagingBackgroundHandler);

    // Foreground messages
    FirebaseMessaging.onMessage.listen((message) {
      _handleMessage(context, message, fromBackground: false);
    });

    // Notification tap when app is in background (not terminated)
    FirebaseMessaging.onMessageOpenedApp.listen((message) {
      _handleMessage(context, message, fromBackground: true);
    });

    // Check if app was launched from a terminated state via notification
    final initial = await _messaging.getInitialMessage();
    if (initial != null && context.mounted) {
      _handleMessage(context, initial, fromBackground: true);
    }
  }

  Future<String?> getFcmToken() => _messaging.getToken();

  void _handleMessage(
    BuildContext context,
    RemoteMessage message, {
    required bool fromBackground,
  }) {
    final data = message.data;
    if (!context.mounted) return;
    final router = GoRouter.of(context);

    switch (data['type']) {
      case 'gift':
        router.go('/home');
      case 'stream_started':
        final streamId = data['stream_id'];
        if (streamId != null) router.go('/live/$streamId');
      case 'pk_challenge':
        final streamId = data['stream_id'];
        if (streamId != null) router.go('/pk/$streamId');
      case 'agency_message':
        router.go('/agency/chat');
      case 'league_result':
        router.go('/league');
      default:
        router.go('/home');
    }
  }
}
