import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../services/multiverse_service.dart';
import '../../services/auth_service.dart';

/// Lets creators customise their avatar model + animation, then propagate
/// the updated appearance to all connected virtual worlds.
class AvatarCustomizer extends ConsumerStatefulWidget {
  const AvatarCustomizer({super.key});

  @override
  ConsumerState<AvatarCustomizer> createState() => _AvatarCustomizerState();
}

class _AvatarCustomizerState extends ConsumerState<AvatarCustomizer> {
  final _service = MultiverseService.instance;

  final _modelController = TextEditingController(text: const String.fromEnvironment('GHOSTCHAIN_AVATAR_MODEL_URL'));
  String _selectedStyle    = 'ghost-dark';
  String _selectedAnim     = 'idle';
  bool   _saving           = false;
  String? _error;
  List<Map<String, dynamic>> _syncResults = [];

  static const _styles = ['ghost-dark', 'neon-purple', 'cyber-gold', 'arctic-white', 'obsidian'];
  static const _animations = ['idle', 'dance', 'cheer', 'wave', 'perform'];

  Future<void> _save() async {
    final model = _modelController.text.trim();
    if (model.isEmpty) {
      setState(() => _error = 'Model URI cannot be empty');
      return;
    }

    setState(() { _saving = true; _error = null; _syncResults = []; });

    try {
      final creatorId = AuthService.instance.currentUser?.id ?? '';
      final model = _modelController.text.trim();
      final results = await _service.propagateAvatar(
        creatorId:      creatorId,
        avatarModel:    '$model?style=$_selectedStyle',
        animationState: _selectedAnim,
      );
      setState(() { _syncResults = results; _saving = false; });
    } catch (e) {
      setState(() { _error = e.toString(); _saving = false; });
    }
  }

  @override
  void dispose() {
    _modelController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0D0D1A),
      appBar: AppBar(
        backgroundColor: const Color(0xFF0D0D1A),
        title: const Text('Avatar Customizer', style: TextStyle(color: Colors.white)),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // ── Avatar preview placeholder ─────────────────────────────────
            Center(
              child: Container(
                width: 160,
                height: 160,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  gradient: const LinearGradient(
                    colors: [Color(0xFF7B2FBE), Color(0xFF00D4FF)],
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                  ),
                ),
                child: const Icon(Icons.face_retouching_natural, size: 80, color: Colors.white),
              ),
            ),
            const SizedBox(height: 28),

            // ── Model URI ─────────────────────────────────────────────────
            _SectionLabel('Model URI (.glb)'),
            const SizedBox(height: 8),
            TextField(
              controller: _modelController,
              style: const TextStyle(color: Colors.white),
              decoration: InputDecoration(
                hintText: 'https://...',
                hintStyle: const TextStyle(color: Colors.white38),
                filled: true,
                fillColor: const Color(0xFF1A1A2E),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: BorderSide.none,
                ),
              ),
            ),
            const SizedBox(height: 20),

            // ── Style picker ──────────────────────────────────────────────
            _SectionLabel('Style Theme'),
            const SizedBox(height: 10),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: _styles.map((s) {
                final selected = s == _selectedStyle;
                return GestureDetector(
                  onTap: () => setState(() => _selectedStyle = s),
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                    decoration: BoxDecoration(
                      color: selected ? const Color(0xFF7B2FBE) : const Color(0xFF1A1A2E),
                      borderRadius: BorderRadius.circular(20),
                      border: Border.all(
                        color: selected ? const Color(0xFF7B2FBE) : Colors.white24,
                      ),
                    ),
                    child: Text(s, style: TextStyle(color: selected ? Colors.white : Colors.white54, fontSize: 13)),
                  ),
                );
              }).toList(),
            ),
            const SizedBox(height: 20),

            // ── Animation picker ──────────────────────────────────────────
            _SectionLabel('Default Animation'),
            const SizedBox(height: 10),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: _animations.map((a) {
                final selected = a == _selectedAnim;
                return GestureDetector(
                  onTap: () => setState(() => _selectedAnim = a),
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                    decoration: BoxDecoration(
                      color: selected ? const Color(0xFF00D4FF).withOpacity(0.2) : const Color(0xFF1A1A2E),
                      borderRadius: BorderRadius.circular(20),
                      border: Border.all(
                        color: selected ? const Color(0xFF00D4FF) : Colors.white24,
                      ),
                    ),
                    child: Text(a, style: TextStyle(color: selected ? const Color(0xFF00D4FF) : Colors.white54, fontSize: 13)),
                  ),
                );
              }).toList(),
            ),
            const SizedBox(height: 28),

            // ── Save + sync button ────────────────────────────────────────
            SizedBox(
              width: double.infinity,
              height: 52,
              child: ElevatedButton.icon(
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFF7B2FBE),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                ),
                icon: _saving
                    ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                    : const Icon(Icons.sync),
                label: Text(_saving ? 'Syncing to worlds...' : 'Save & Sync to All Worlds'),
                onPressed: _saving ? null : _save,
              ),
            ),

            if (_error != null) ...[
              const SizedBox(height: 12),
              Text(_error!, style: const TextStyle(color: Colors.redAccent)),
            ],

            // ── Sync results ──────────────────────────────────────────────
            if (_syncResults.isNotEmpty) ...[
              const SizedBox(height: 24),
              _SectionLabel('Sync Results'),
              const SizedBox(height: 8),
              ..._syncResults.map((r) {
                final ok = r['status'] == 'synced';
                return ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: Icon(ok ? Icons.check_circle : Icons.error_outline,
                      color: ok ? const Color(0xFF00D4FF) : Colors.redAccent),
                  title: Text(r['worldId'] as String? ?? '',
                      style: const TextStyle(color: Colors.white, fontSize: 13)),
                  subtitle: ok ? null : Text(r['error'] as String? ?? '',
                      style: const TextStyle(color: Colors.redAccent, fontSize: 12)),
                );
              }),
            ],

            const SizedBox(height: 40),
          ],
        ),
      ),
    );
  }
}

class _SectionLabel extends StatelessWidget {
  const _SectionLabel(this.label);
  final String label;

  @override
  Widget build(BuildContext context) {
    return Text(
      label,
      style: const TextStyle(color: Colors.white70, fontSize: 13, fontWeight: FontWeight.w600, letterSpacing: 1),
    );
  }
}
