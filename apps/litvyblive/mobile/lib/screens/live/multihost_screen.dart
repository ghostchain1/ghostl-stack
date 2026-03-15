import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/theme/app_theme.dart';
import '../../services/socket_service.dart';
import '../../widgets/chat/chat_overlay.dart';
import '../../widgets/gifts/gift_bar.dart';
import '../../widgets/live/multi_host_layout.dart';
import '../../widgets/overlays/viewer_counter.dart';

// ── Grid mode ─────────────────────────────────────────────────────────────────

enum _GridMode { dual, quad, nine }

extension _GridModeExt on _GridMode {
  int get hostCount => switch (this) {
        _GridMode.dual => 2,
        _GridMode.quad => 4,
        _GridMode.nine => 9,
      };
  String get label => switch (this) {
        _GridMode.dual => '2',
        _GridMode.quad => '4',
        _GridMode.nine => '9',
      };
  IconData get icon => switch (this) {
        _GridMode.dual => Icons.view_stream,
        _GridMode.quad => Icons.grid_view,
        _GridMode.nine => Icons.apps,
      };
}

// ── Providers ─────────────────────────────────────────────────────────────────

final _gridModeProvider = StateProvider<_GridMode>((ref) => _GridMode.quad);
final _viewerCountProvider = StateProvider<int>((ref) => 0);

// ── Screen ────────────────────────────────────────────────────────────────────

class MultiHostScreen extends ConsumerStatefulWidget {
  final String streamId;
  const MultiHostScreen({super.key, required this.streamId});

  @override
  ConsumerState<MultiHostScreen> createState() => _MultiHostScreenState();
}

class _MultiHostScreenState extends ConsumerState<MultiHostScreen> {
  bool _uiVisible = true;

  @override
  void initState() {
    super.initState();
    _initSocket();
  }

  void _initSocket() {
    SocketService.instance.joinStream(widget.streamId);
    SocketService.instance.onViewerUpdate((count) {
      if (mounted) {
        ref.read(_viewerCountProvider.notifier).state = count;
      }
    });
  }

  @override
  void dispose() {
    SocketService.instance.leaveStream(widget.streamId);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final mode = ref.watch(_gridModeProvider);
    final viewerCount = ref.watch(_viewerCountProvider);

    return Scaffold(
      backgroundColor: Colors.black,
      body: GestureDetector(
        onTap: () => setState(() => _uiVisible = !_uiVisible),
        child: Stack(
          children: [
            // ── Host grid ─────────────────────────────────────────────────
            Positioned.fill(
              child: MultiHostLayout(
                streamId: widget.streamId,
                hostCount: mode.hostCount,
              ),
            ),

            // ── Top bar ───────────────────────────────────────────────────
            AnimatedOpacity(
              opacity: _uiVisible ? 1.0 : 0.0,
              duration: const Duration(milliseconds: 250),
              child: Positioned(
                top: 0,
                left: 0,
                right: 0,
                child: _TopBar(
                  streamId: widget.streamId,
                  viewerCount: viewerCount,
                  onBack: () => Navigator.of(context).pop(),
                ),
              ),
            ),

            // ── Mode selector ─────────────────────────────────────────────
            AnimatedOpacity(
              opacity: _uiVisible ? 1.0 : 0.0,
              duration: const Duration(milliseconds: 250),
              child: Positioned(
                top: MediaQuery.of(context).padding.top + 56,
                right: 12,
                child: _ModeSelectorColumn(
                  current: mode,
                  onSelect: (m) =>
                      ref.read(_gridModeProvider.notifier).state = m,
                ),
              ),
            ),

            // ── Chat overlay ──────────────────────────────────────────────
            AnimatedOpacity(
              opacity: _uiVisible ? 1.0 : 0.0,
              duration: const Duration(milliseconds: 250),
              child: Positioned(
                left: 0,
                right: 120,
                bottom: 80,
                height: 240,
                child: ChatOverlay(streamId: widget.streamId),
              ),
            ),

            // ── Gift bar ──────────────────────────────────────────────────
            AnimatedOpacity(
              opacity: _uiVisible ? 1.0 : 0.0,
              duration: const Duration(milliseconds: 250),
              child: Positioned(
                left: 0,
                right: 0,
                bottom: 0,
                child: GiftBar(streamId: widget.streamId),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ── Top bar ───────────────────────────────────────────────────────────────────

class _TopBar extends StatelessWidget {
  final String streamId;
  final int viewerCount;
  final VoidCallback onBack;

  const _TopBar({
    required this.streamId,
    required this.viewerCount,
    required this.onBack,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [Colors.black87, Colors.transparent],
        ),
      ),
      padding: EdgeInsets.fromLTRB(
          12, MediaQuery.of(context).padding.top + 8, 12, 16),
      child: Row(
        children: [
          // Back
          IconButton(
            icon: const Icon(Icons.arrow_back_ios, color: Colors.white, size: 20),
            onPressed: onBack,
          ),
          // Stream ID badge
          Expanded(
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
              decoration: BoxDecoration(
                color: Colors.black45,
                borderRadius: BorderRadius.circular(20),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Container(
                    width: 8,
                    height: 8,
                    decoration: const BoxDecoration(
                        color: Colors.redAccent,
                        shape: BoxShape.circle),
                  ),
                  const SizedBox(width: 6),
                  const Text('LIVE',
                      style: TextStyle(
                          color: Colors.redAccent,
                          fontSize: 11,
                          fontWeight: FontWeight.bold)),
                  const SizedBox(width: 8),
                  Flexible(
                    child: Text(
                      'Multi Host $streamId',
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                          color: Colors.white70, fontSize: 12),
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(width: 8),
          // Viewer count
          ViewerCounter(count: viewerCount),
        ],
      ),
    );
  }
}

// ── Mode selector ─────────────────────────────────────────────────────────────

class _ModeSelectorColumn extends StatelessWidget {
  final _GridMode current;
  final ValueChanged<_GridMode> onSelect;
  const _ModeSelectorColumn(
      {required this.current, required this.onSelect});

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: _GridMode.values.map((m) {
        final active = m == current;
        return Padding(
          padding: const EdgeInsets.only(bottom: 8),
          child: GestureDetector(
            onTap: () => onSelect(m),
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 200),
              width: 40,
              height: 40,
              decoration: BoxDecoration(
                color: active
                    ? AppTheme.brandPurple
                    : Colors.black54,
                borderRadius: BorderRadius.circular(10),
                border: Border.all(
                    color: active
                        ? AppTheme.brandPurple
                        : Colors.white24,
                    width: 1),
              ),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(m.icon,
                      color:
                          active ? Colors.white : Colors.white54,
                      size: 16),
                  Text(m.label,
                      style: TextStyle(
                          color: active
                              ? Colors.white
                              : Colors.white38,
                          fontSize: 9,
                          fontWeight: FontWeight.bold)),
                ],
              ),
            ),
          ),
        );
      }).toList(),
    );
  }
}
