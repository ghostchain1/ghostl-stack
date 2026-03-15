import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;

// ── Models ───────────────────────────────────────────────────────────────────

class InfraMetrics {
  final int    streamingNodes;
  final int    apiNodes;
  final int    aiWorkers;
  final int    totalNodes;
  final int    healthyNodes;
  final double cpuPct;
  final int    activeStreams;
  final int    totalViewers;
  final double apiRps;
  final int    aiQueueDepth;
  final String pressureLevel; // normal | elevated | high | critical

  const InfraMetrics({
    required this.streamingNodes,
    required this.apiNodes,
    required this.aiWorkers,
    required this.totalNodes,
    required this.healthyNodes,
    required this.cpuPct,
    required this.activeStreams,
    required this.totalViewers,
    required this.apiRps,
    required this.aiQueueDepth,
    required this.pressureLevel,
  });

  factory InfraMetrics.fromJson(Map<String, dynamic> json) {
    final cluster = (json['cluster'] as Map<String, dynamic>?) ?? {};
    final metrics = (json['latestMetrics'] as Map<String, dynamic>?) ?? {};
    final byType  = (cluster['byType'] as Map<String, dynamic>?) ?? {};

    return InfraMetrics(
      streamingNodes: (byType['streaming_node'] as num?)?.toInt() ?? 0,
      apiNodes:       (byType['api_node']       as num?)?.toInt() ?? 0,
      aiWorkers:      (byType['ai_worker']       as num?)?.toInt() ?? 0,
      totalNodes:     (cluster['totalNodes']     as num?)?.toInt() ?? 0,
      healthyNodes:   (cluster['healthyNodes']   as num?)?.toInt() ?? 0,
      cpuPct:         (metrics['cpu']            as num?)?.toDouble() ?? 0,
      activeStreams:  (metrics['activeStreams']   as num?)?.toInt() ?? 0,
      totalViewers:  (metrics['totalViewers']    as num?)?.toInt() ?? 0,
      apiRps:        (metrics['apiRps']          as num?)?.toDouble() ?? 0,
      aiQueueDepth:  (metrics['aiQueueDepth']    as num?)?.toInt() ?? 0,
      pressureLevel: (json['currentPressure']    as String?) ?? 'normal',
    );
  }

  static InfraMetrics get empty => const InfraMetrics(
    streamingNodes: 0, apiNodes: 0, aiWorkers: 0, totalNodes: 0,
    healthyNodes: 0, cpuPct: 0, activeStreams: 0, totalViewers: 0,
    apiRps: 0, aiQueueDepth: 0, pressureLevel: 'normal',
  );
}

class ScalingEvent {
  final String action;   // scale_up | scale_down
  final String nodeType;
  final String region;
  final String reason;
  final DateTime occurredAt;

  const ScalingEvent({
    required this.action,
    required this.nodeType,
    required this.region,
    required this.reason,
    required this.occurredAt,
  });

  factory ScalingEvent.fromJson(Map<String, dynamic> json) => ScalingEvent(
    action:     json['action']     as String? ?? '',
    nodeType:   json['node_type']  as String? ?? '',
    region:     json['region']     as String? ?? '',
    reason:     json['reason']     as String? ?? '',
    occurredAt: DateTime.tryParse(json['occurred_at'] as String? ?? '') ?? DateTime.now(),
  );
}

// ── Screen ───────────────────────────────────────────────────────────────────

class SystemStatusScreen extends StatefulWidget {
  const SystemStatusScreen({super.key});

  @override
  State<SystemStatusScreen> createState() => _SystemStatusScreenState();
}

class _SystemStatusScreenState extends State<SystemStatusScreen> {
  static const _baseUrl = String.fromEnvironment('API_URL', defaultValue: 'http://localhost:7001');

  InfraMetrics     _metrics = InfraMetrics.empty;
  List<ScalingEvent> _events = [];
  bool             _loading = true;
  String?          _error;
  Timer?           _refreshTimer;

  @override
  void initState() {
    super.initState();
    _fetchStatus();
    _refreshTimer = Timer.periodic(const Duration(seconds: 15), (_) => _fetchStatus());
  }

  @override
  void dispose() {
    _refreshTimer?.cancel();
    super.dispose();
  }

  Future<void> _fetchStatus() async {
    try {
      final results = await Future.wait([
        http.get(Uri.parse('$_baseUrl/infrastructure/status'),
            headers: {'x-admin-token': 'admin'})
            .timeout(const Duration(seconds: 8)),
        http.get(Uri.parse('$_baseUrl/infrastructure/scaling/events?limit=10'),
            headers: {'x-admin-token': 'admin'})
            .timeout(const Duration(seconds: 8)),
      ]);

      if (!mounted) return;

      final statusBody = jsonDecode(results[0].body) as Map<String, dynamic>;
      final eventsBody = jsonDecode(results[1].body) as Map<String, dynamic>;

      setState(() {
        _metrics = InfraMetrics.fromJson(
            (statusBody['data'] as Map<String, dynamic>?) ?? {});
        _events = ((eventsBody['data'] as List<dynamic>?) ?? [])
            .map((e) => ScalingEvent.fromJson(e as Map<String, dynamic>))
            .toList();
        _loading = false;
        _error   = null;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() { _loading = false; _error = e.toString(); });
    }
  }

  // ── Build ──────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0F0F1A),
      appBar: AppBar(
        backgroundColor: const Color(0xFF1A1A2E),
        title: const Text('System Status', style: TextStyle(color: Colors.white)),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh, color: Colors.white70),
            onPressed: _fetchStatus,
          ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator(color: Color(0xFF7B2FFF)))
          : _error != null
          ? _ErrorPanel(message: _error!)
          : RefreshIndicator(
              onRefresh: _fetchStatus,
              color: const Color(0xFF7B2FFF),
              child: ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  _PressureBanner(level: _metrics.pressureLevel),
                  const SizedBox(height: 16),
                  _NodeGrid(metrics: _metrics),
                  const SizedBox(height: 16),
                  _MetricCards(metrics: _metrics),
                  const SizedBox(height: 16),
                  _ScalingEventList(events: _events),
                ],
              ),
            ),
    );
  }
}

// ── Sub-widgets ──────────────────────────────────────────────────────────────

class _PressureBanner extends StatelessWidget {
  final String level;
  const _PressureBanner({required this.level});

  Color get _color {
    switch (level) {
      case 'critical': return const Color(0xFFE53935);
      case 'high':     return const Color(0xFFFF7043);
      case 'elevated': return const Color(0xFFFFA726);
      default:         return const Color(0xFF43A047);
    }
  }

  IconData get _icon {
    switch (level) {
      case 'critical': return Icons.crisis_alert;
      case 'high':     return Icons.warning_amber;
      case 'elevated': return Icons.trending_up;
      default:         return Icons.check_circle_outline;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        color:        _color.withOpacity(0.15),
        border:       Border.all(color: _color.withOpacity(0.4)),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        children: [
          Icon(_icon, color: _color, size: 28),
          const SizedBox(width: 12),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Platform Operational',
                  style: TextStyle(color: _color, fontWeight: FontWeight.bold, fontSize: 15)),
              Text('Load: ${level.toUpperCase()}',
                  style: TextStyle(color: _color.withOpacity(0.8), fontSize: 12)),
            ],
          ),
        ],
      ),
    );
  }
}

class _NodeGrid extends StatelessWidget {
  final InfraMetrics metrics;
  const _NodeGrid({required this.metrics});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text('Infrastructure Status',
            style: TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold)),
        const SizedBox(height: 12),
        GridView.count(
          crossAxisCount: 2,
          shrinkWrap: true,
          crossAxisSpacing: 10,
          mainAxisSpacing: 10,
          childAspectRatio: 2.2,
          physics: const NeverScrollableScrollPhysics(),
          children: [
            _NodeCard(label: 'Streaming Nodes',  count: metrics.streamingNodes, icon: Icons.live_tv,          color: const Color(0xFF7B2FFF)),
            _NodeCard(label: 'API Servers',       count: metrics.apiNodes,       icon: Icons.dns_outlined,     color: const Color(0xFF00BCD4)),
            _NodeCard(label: 'AI Workers',        count: metrics.aiWorkers,      icon: Icons.smart_toy_outlined, color: const Color(0xFFFF9800)),
            _NodeCard(label: 'Healthy Nodes',     count: metrics.healthyNodes,   icon: Icons.check_circle,     color: const Color(0xFF43A047)),
          ],
        ),
      ],
    );
  }
}

class _NodeCard extends StatelessWidget {
  final String   label;
  final int      count;
  final IconData icon;
  final Color    color;

  const _NodeCard({required this.label, required this.count, required this.icon, required this.color});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color:        const Color(0xFF1A1A2E),
        borderRadius: BorderRadius.circular(12),
        border:       Border.all(color: color.withOpacity(0.3)),
      ),
      child: Row(
        children: [
          Icon(icon, color: color, size: 26),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisAlignment:  MainAxisAlignment.center,
              children: [
                Text('$count', style: TextStyle(color: color, fontSize: 20, fontWeight: FontWeight.bold)),
                Text(label, style: const TextStyle(color: Colors.white60, fontSize: 10), overflow: TextOverflow.ellipsis),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _MetricCards extends StatelessWidget {
  final InfraMetrics metrics;
  const _MetricCards({required this.metrics});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text('Live Metrics',
            style: TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold)),
        const SizedBox(height: 12),
        _MetricRow(label: 'CPU Load',        value: '${metrics.cpuPct.toStringAsFixed(1)}%',   icon: Icons.memory_outlined),
        _MetricRow(label: 'Active Streams',  value: '${metrics.activeStreams}',                icon: Icons.live_tv_outlined),
        _MetricRow(label: 'Total Viewers',   value: _fmt(metrics.totalViewers),               icon: Icons.people_outline),
        _MetricRow(label: 'API Req/s',       value: metrics.apiRps.toStringAsFixed(1),        icon: Icons.network_check_outlined),
        _MetricRow(label: 'AI Queue Depth',  value: '${metrics.aiQueueDepth} jobs',            icon: Icons.queue_outlined),
      ],
    );
  }

  String _fmt(int n) {
    if (n >= 1_000_000) return '${(n / 1_000_000).toStringAsFixed(1)}M';
    if (n >= 1_000)     return '${(n / 1_000).toStringAsFixed(1)}K';
    return '$n';
  }
}

class _MetricRow extends StatelessWidget {
  final String   label;
  final String   value;
  final IconData icon;

  const _MetricRow({required this.label, required this.value, required this.icon});

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(
        color:        const Color(0xFF1A1A2E),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Row(
        children: [
          Icon(icon, color: Colors.white38, size: 20),
          const SizedBox(width: 12),
          Expanded(child: Text(label, style: const TextStyle(color: Colors.white60, fontSize: 13))),
          Text(value, style: const TextStyle(color: Colors.white, fontSize: 14, fontWeight: FontWeight.w600)),
        ],
      ),
    );
  }
}

class _ScalingEventList extends StatelessWidget {
  final List<ScalingEvent> events;
  const _ScalingEventList({required this.events});

  @override
  Widget build(BuildContext context) {
    if (events.isEmpty) return const SizedBox.shrink();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text('Recent Scaling Events',
            style: TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold)),
        const SizedBox(height: 12),
        ...events.map((e) => _ScalingEventTile(event: e)),
      ],
    );
  }
}

class _ScalingEventTile extends StatelessWidget {
  final ScalingEvent event;
  const _ScalingEventTile({required this.event});

  @override
  Widget build(BuildContext context) {
    final isUp  = event.action == 'scale_up';
    final color = isUp ? const Color(0xFF43A047) : const Color(0xFF7B2FFF);
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color:        const Color(0xFF1A1A2E),
        borderRadius: BorderRadius.circular(10),
        border:       Border.all(color: color.withOpacity(0.25)),
      ),
      child: Row(
        children: [
          Icon(isUp ? Icons.arrow_upward : Icons.arrow_downward, color: color, size: 20),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('${event.nodeType} — ${event.region}',
                    style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.w600)),
                Text(event.reason,
                    style: const TextStyle(color: Colors.white54, fontSize: 11),
                    maxLines: 1, overflow: TextOverflow.ellipsis),
              ],
            ),
          ),
          Text(_timeAgo(event.occurredAt),
              style: const TextStyle(color: Colors.white38, fontSize: 10)),
        ],
      ),
    );
  }

  String _timeAgo(DateTime dt) {
    final diff = DateTime.now().difference(dt);
    if (diff.inSeconds < 60)  return '${diff.inSeconds}s ago';
    if (diff.inMinutes < 60)  return '${diff.inMinutes}m ago';
    return '${diff.inHours}h ago';
  }
}

class _ErrorPanel extends StatelessWidget {
  final String message;
  const _ErrorPanel({required this.message});

  @override
  Widget build(BuildContext context) => Center(
    child: Padding(
      padding: const EdgeInsets.all(24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.cloud_off_outlined, color: Colors.white38, size: 48),
          const SizedBox(height: 12),
          const Text('Could not reach infrastructure API',
              style: TextStyle(color: Colors.white60, fontSize: 15)),
          const SizedBox(height: 6),
          Text(message, style: const TextStyle(color: Colors.white30, fontSize: 11)),
        ],
      ),
    ),
  );
}
