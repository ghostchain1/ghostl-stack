import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;

// ── Models ──────────────────────────────────────────────────────────────────

enum AlertSeverity { low, medium, high, critical }

enum AlertType {
  giftFraud,
  botViewers,
  paymentFraud,
  accountFarm,
  anomaly,
  gameManipulation,
  accountFrozen,
  streamPaused,
}

class SecurityAlert {
  final String alertId;
  final AlertType type;
  final AlertSeverity severity;
  final String message;
  final String? affectedUserId;
  final String? streamId;
  final Map<String, dynamic> evidence;
  final DateTime createdAt;

  const SecurityAlert({
    required this.alertId,
    required this.type,
    required this.severity,
    required this.message,
    this.affectedUserId,
    this.streamId,
    this.evidence = const {},
    required this.createdAt,
  });

  factory SecurityAlert.fromJson(Map<String, dynamic> json) {
    return SecurityAlert(
      alertId:        json['incident_id'] as String,
      type:           _parseType(json['type'] as String? ?? 'anomaly'),
      severity:       _parseSeverity(json['severity'] as String? ?? 'low'),
      message:        _buildMessage(json),
      affectedUserId: json['user_id'] as String?,
      streamId:       json['stream_id'] as String?,
      evidence:       _parseEvidence(json['evidence']),
      createdAt:      DateTime.parse(json['created_at'] as String),
    );
  }

  bool get isActionable => severity == AlertSeverity.high || severity == AlertSeverity.critical;
  bool get isCritical   => severity == AlertSeverity.critical;

  String get severityLabel {
    switch (severity) {
      case AlertSeverity.critical: return 'CRITICAL';
      case AlertSeverity.high:     return 'HIGH';
      case AlertSeverity.medium:   return 'MEDIUM';
      case AlertSeverity.low:      return 'LOW';
    }
  }

  Color get severityColor {
    switch (severity) {
      case AlertSeverity.critical: return const Color(0xFFE53935); // red-600
      case AlertSeverity.high:     return const Color(0xFFFF7043); // deep-orange-400
      case AlertSeverity.medium:   return const Color(0xFFFFA726); // orange-400
      case AlertSeverity.low:      return const Color(0xFF66BB6A); // green-400
    }
  }

  IconData get typeIcon {
    switch (type) {
      case AlertType.giftFraud:        return Icons.card_giftcard_outlined;
      case AlertType.botViewers:        return Icons.smart_toy_outlined;
      case AlertType.paymentFraud:      return Icons.payment_outlined;
      case AlertType.accountFarm:       return Icons.people_outline;
      case AlertType.anomaly:           return Icons.warning_amber_outlined;
      case AlertType.gameManipulation:  return Icons.sports_esports_outlined;
      case AlertType.accountFrozen:     return Icons.ac_unit_outlined;
      case AlertType.streamPaused:      return Icons.pause_circle_outline;
    }
  }

  static AlertSeverity _parseSeverity(String s) {
    switch (s) {
      case 'critical': return AlertSeverity.critical;
      case 'high':     return AlertSeverity.high;
      case 'medium':   return AlertSeverity.medium;
      default:         return AlertSeverity.low;
    }
  }

  static AlertType _parseType(String t) {
    switch (t) {
      case 'gift_fraud':        return AlertType.giftFraud;
      case 'bot_viewers':       return AlertType.botViewers;
      case 'payment_fraud':     return AlertType.paymentFraud;
      case 'account_farm':      return AlertType.accountFarm;
      case 'game_manipulation': return AlertType.gameManipulation;
      default:                  return AlertType.anomaly;
    }
  }

  static String _buildMessage(Map<String, dynamic> json) {
    switch (json['type'] as String? ?? '') {
      case 'gift_fraud':        return 'Suspicious gifting pattern detected on your stream.';
      case 'bot_viewers':       return 'Bot viewers detected — your view count may be inflated.';
      case 'payment_fraud':     return 'Unusual payment activity flagged for review.';
      case 'account_farm':      return 'Multi-account activity detected around your content.';
      case 'game_manipulation': return 'Anomalous game score detected in your session.';
      case 'anomaly':           return 'Unusual activity spike detected on your account.';
      default:                  return 'A security event has been flagged on your account.';
    }
  }

  static Map<String, dynamic> _parseEvidence(dynamic raw) {
    if (raw == null) return {};
    if (raw is Map<String, dynamic>) return raw;
    if (raw is String) {
      try { return (jsonDecode(raw) as Map<String, dynamic>?) ?? {}; } catch (_) {}
    }
    return {};
  }
}

// ── Service ─────────────────────────────────────────────────────────────────

class SecurityAlertService {
  SecurityAlertService._();
  static final SecurityAlertService instance = SecurityAlertService._();

  final _controller = StreamController<SecurityAlert>.broadcast();

  /// Broadcast stream of real-time security alerts for the current user.
  Stream<SecurityAlert> get alertStream => _controller.stream;

  Timer?  _pollingTimer;
  String? _currentUserId;
  String  _baseUrl = 'http://localhost:7001';

  void configure({required String baseUrl}) => _baseUrl = baseUrl;

  // ── Polling ──────────────────────────────────────────────────────────────

  /// Start polling for alerts every 30 s for [userId].
  /// Automatically replaces any previous polling session.
  void startPolling(String userId) {
    stopPolling();
    _currentUserId = userId;
    _pollingTimer  = Timer.periodic(
      const Duration(seconds: 30),
      (_) => _fetchAndEmit(userId),
    );
    // Immediate first fetch
    _fetchAndEmit(userId);
  }

  void stopPolling() {
    _pollingTimer?.cancel();
    _pollingTimer   = null;
    _currentUserId  = null;
  }

  Future<void> _fetchAndEmit(String userId) async {
    final alerts = await getRecentAlerts(userId, hours: 1);
    for (final alert in alerts) {
      _controller.add(alert);
    }
  }

  // ── API calls ─────────────────────────────────────────────────────────────

  /// Fetch recent security alerts for [userId] over the last [hours] hours.
  Future<List<SecurityAlert>> getRecentAlerts(String userId, {int hours = 24}) async {
    try {
      final uri = Uri.parse(
        '$_baseUrl/security/incidents?status=open&limit=20',
      );
      final response = await http.get(uri).timeout(const Duration(seconds: 10));

      if (response.statusCode != 200) return [];

      final body = jsonDecode(response.body) as Map<String, dynamic>;
      final rows = (body['data'] as List<dynamic>?) ?? [];

      return rows
          .map((r) => SecurityAlert.fromJson(r as Map<String, dynamic>))
          .where((a) => a.affectedUserId == userId)
          .where((a) => DateTime.now().difference(a.createdAt).inHours <= hours)
          .toList();
    } catch (_) {
      return [];
    }
  }

  /// Check immediately for active account-freeze and stream-pause alerts.
  Future<SecurityStatus> checkAccountStatus(String userId) async {
    try {
      final uri      = Uri.parse('$_baseUrl/security/analyze/user/$userId');
      final response = await http.post(uri).timeout(const Duration(seconds: 10));

      if (response.statusCode != 200) return SecurityStatus.unknown;

      final body   = jsonDecode(response.body) as Map<String, dynamic>;
      final data   = body['data'] as Map<String, dynamic>? ?? {};
      final frozen = data['frozen'] as bool? ?? false;
      return frozen ? SecurityStatus.frozen : SecurityStatus.clear;
    } catch (_) {
      return SecurityStatus.unknown;
    }
  }

  // ── UI helpers ────────────────────────────────────────────────────────────

  /// Show a non-dismissible alert dialog for critical threats.
  void showCriticalAlert(BuildContext context, SecurityAlert alert) {
    showDialog<void>(
      context:               context,
      barrierDismissible:    false,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF1A1A2E),
        shape:           RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        icon:            Icon(alert.typeIcon, color: alert.severityColor, size: 48),
        title: Text(
          '${alert.severityLabel} Security Alert',
          style: TextStyle(color: alert.severityColor, fontWeight: FontWeight.bold),
          textAlign: TextAlign.center,
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              alert.message,
              style: const TextStyle(color: Colors.white70),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 8),
            Text(
              'Reported: ${_formatTime(alert.createdAt)}',
              style: const TextStyle(color: Colors.white38, fontSize: 12),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('Acknowledge', style: TextStyle(color: Colors.white)),
          ),
        ],
      ),
    );
  }

  /// Show a transient snackbar for low/medium severity alerts.
  void showAlertSnackbar(BuildContext context, SecurityAlert alert) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      backgroundColor: alert.severityColor.withOpacity(0.9),
      duration:        const Duration(seconds: 5),
      behavior:        SnackBarBehavior.floating,
      shape:           RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
      content: Row(
        children: [
          Icon(alert.typeIcon, color: Colors.white, size: 20),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              alert.message,
              style: const TextStyle(color: Colors.white, fontSize: 13),
            ),
          ),
        ],
      ),
      action: SnackBarAction(
        label:      'View',
        textColor:  Colors.white,
        onPressed:  () { /* Navigate to security alerts screen */ },
      ),
    ));
  }

  /// Dispatch the correct UI based on severity.
  void showSecurityAlert(BuildContext context, SecurityAlert alert) {
    if (alert.isCritical) {
      showCriticalAlert(context, alert);
    } else {
      showAlertSnackbar(context, alert);
    }
  }

  void dispose() {
    stopPolling();
    _controller.close();
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  String _formatTime(DateTime dt) {
    final diff = DateTime.now().difference(dt);
    if (diff.inSeconds < 60)  return 'just now';
    if (diff.inMinutes < 60)  return '${diff.inMinutes}m ago';
    if (diff.inHours   < 24)  return '${diff.inHours}h ago';
    return '${diff.inDays}d ago';
  }
}

enum SecurityStatus { clear, frozen, unknown }

// ── AlertsBadge widget ──────────────────────────────────────────────────────

/// A small badge that shows the count of open critical security alerts.
/// Place this in the creator dashboard navigation bar.
class SecurityAlertsBadge extends StatefulWidget {
  final String userId;
  final VoidCallback? onTap;

  const SecurityAlertsBadge({super.key, required this.userId, this.onTap});

  @override
  State<SecurityAlertsBadge> createState() => _SecurityAlertsBadgeState();
}

class _SecurityAlertsBadgeState extends State<SecurityAlertsBadge> {
  int _count = 0;
  late final StreamSubscription<SecurityAlert> _sub;

  @override
  void initState() {
    super.initState();
    _sub = SecurityAlertService.instance.alertStream.listen((alert) {
      if (alert.affectedUserId == widget.userId && mounted) {
        setState(() => _count++);
        SecurityAlertService.instance.showSecurityAlert(context, alert);
      }
    });
    SecurityAlertService.instance.startPolling(widget.userId);
  }

  @override
  void dispose() {
    _sub.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: widget.onTap,
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          const Icon(Icons.shield_outlined, color: Colors.white, size: 28),
          if (_count > 0)
            Positioned(
              right: -4,
              top:   -4,
              child: Container(
                padding:    const EdgeInsets.all(3),
                decoration: const BoxDecoration(
                  color:      Color(0xFFE53935),
                  shape:      BoxShape.circle,
                ),
                constraints: const BoxConstraints(minWidth: 16, minHeight: 16),
                child: Text(
                  _count > 9 ? '9+' : '$_count',
                  style: const TextStyle(color: Colors.white, fontSize: 9, fontWeight: FontWeight.bold),
                  textAlign: TextAlign.center,
                ),
              ),
            ),
        ],
      ),
    );
  }
}
