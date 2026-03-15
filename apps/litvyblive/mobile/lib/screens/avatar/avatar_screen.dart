import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../services/multiverse_service.dart';
import '../../services/auth_service.dart';

/// Lists all avatar states for the current creator and lets them manage
/// their 3D presence across connected virtual worlds.
class AvatarScreen extends ConsumerStatefulWidget {
  const AvatarScreen({super.key});

  @override
  ConsumerState<AvatarScreen> createState() => _AvatarScreenState();
}

class _AvatarScreenState extends ConsumerState<AvatarScreen> {
  final _service = MultiverseService.instance;

  bool _loading = true;
  String? _error;
  List<AvatarState> _states = [];
  List<MultiverseWorld> _worlds = [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      final userId = AuthService.instance.currentUser?.id ?? '';
      final results = await Future.wait([
        _service.listAvatarStates(userId),
        _service.listActiveWorlds(),
      ]);
      setState(() {
        _states = results[0] as List<AvatarState>;
        _worlds = results[1] as List<MultiverseWorld>;
        _loading = false;
      });
    } catch (e) {
      setState(() { _error = e.toString(); _loading = false; });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0D0D1A),
      appBar: AppBar(
        backgroundColor: const Color(0xFF0D0D1A),
        title: const Text('3D Avatar', style: TextStyle(color: Colors.white)),
        actions: [
          IconButton(icon: const Icon(Icons.refresh, color: Colors.white), onPressed: _load),
          IconButton(
            icon: const Icon(Icons.edit, color: Color(0xFF7B2FBE)),
            onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const AvatarCustomizer())),
          ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator(color: Color(0xFF7B2FBE)))
          : _error != null
              ? Center(child: Text(_error!, style: const TextStyle(color: Colors.redAccent)))
              : _states.isEmpty
                  ? _EmptyAvatarState(worlds: _worlds, onRefresh: _load)
                  : _AvatarWorldList(states: _states, worlds: _worlds),
    );
  }
}

// ── Empty state ────────────────────────────────────────────────────────────────

class _EmptyAvatarState extends StatelessWidget {
  const _EmptyAvatarState({required this.worlds, required this.onRefresh});
  final List<MultiverseWorld> worlds;
  final VoidCallback onRefresh;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.face_retouching_natural, size: 80, color: Color(0xFF7B2FBE)),
            const SizedBox(height: 20),
            const Text(
              'No Avatar Deployed',
              style: TextStyle(color: Colors.white, fontSize: 22, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 10),
            Text(
              'Create your 3D avatar and deploy it across ${worlds.length} connected worlds.',
              textAlign: TextAlign.center,
              style: const TextStyle(color: Colors.white54),
            ),
            const SizedBox(height: 24),
            ElevatedButton.icon(
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF7B2FBE),
                minimumSize: const Size(200, 48),
              ),
              icon: const Icon(Icons.add),
              label: const Text('Create Avatar'),
              onPressed: () async {
                await Navigator.push(
                  context,
                  MaterialPageRoute(builder: (_) => const AvatarCustomizer()),
                );
                onRefresh();
              },
            ),
          ],
        ),
      ),
    );
  }
}

// ── World list ─────────────────────────────────────────────────────────────────

class _AvatarWorldList extends StatelessWidget {
  const _AvatarWorldList({required this.states, required this.worlds});
  final List<AvatarState> states;
  final List<MultiverseWorld> worlds;

  String? _worldName(String worldId) {
    try { return worlds.firstWhere((w) => w.worldId == worldId).worldName; }
    catch (_) { return worldId; }
  }

  @override
  Widget build(BuildContext context) {
    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: states.length,
      itemBuilder: (context, i) {
        final state = states[i];
        return _WorldAvatarCard(state: state, worldName: _worldName(state.worldId) ?? state.worldId);
      },
    );
  }
}

class _WorldAvatarCard extends StatelessWidget {
  const _WorldAvatarCard({required this.state, required this.worldName});
  final AvatarState state;
  final String worldName;

  @override
  Widget build(BuildContext context) {
    return Card(
      color: const Color(0xFF1A1A2E),
      margin: const EdgeInsets.only(bottom: 12),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      child: ListTile(
        contentPadding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
        leading: Container(
          width: 48,
          height: 48,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            gradient: const LinearGradient(
              colors: [Color(0xFF7B2FBE), Color(0xFF00D4FF)],
            ),
          ),
          child: const Icon(Icons.public, color: Colors.white, size: 24),
        ),
        title: Text(worldName, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
        subtitle: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const SizedBox(height: 4),
            Text('Animation: ${state.animationState}', style: const TextStyle(color: Colors.white54, fontSize: 12)),
            Text('Synced: ${_timeAgo(state.updatedAt)}', style: const TextStyle(color: Colors.white38, fontSize: 12)),
          ],
        ),
        trailing: Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
          decoration: BoxDecoration(
            color: const Color(0xFF00D4FF).withOpacity(0.15),
            borderRadius: BorderRadius.circular(8),
          ),
          child: const Text('LIVE', style: TextStyle(color: Color(0xFF00D4FF), fontSize: 11)),
        ),
      ),
    );
  }

  String _timeAgo(String iso) {
    try {
      final diff = DateTime.now().difference(DateTime.parse(iso));
      if (diff.inMinutes < 1) return 'just now';
      if (diff.inHours < 1) return '${diff.inMinutes}m ago';
      if (diff.inDays < 1) return '${diff.inHours}h ago';
      return '${diff.inDays}d ago';
    } catch (_) { return iso; }
  }
}
