import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../services/identity_service.dart';
import '../../models/identity_model.dart';

class EditProfileScreen extends ConsumerStatefulWidget {
  final IdentityModel current;
  const EditProfileScreen({super.key, required this.current});

  @override
  ConsumerState<EditProfileScreen> createState() => _EditProfileScreenState();
}

class _EditProfileScreenState extends ConsumerState<EditProfileScreen> {
  final _formKey    = GlobalKey<FormState>();
  late final TextEditingController _bioCtrl;
  late final TextEditingController _avatarCtrl;
  late final TextEditingController _twitterCtrl;
  late final TextEditingController _ghostXCtrl;

  bool _saving = false;
  String? _errorMsg;

  @override
  void initState() {
    super.initState();
    _bioCtrl    = TextEditingController(text: widget.current.bio);
    _avatarCtrl = TextEditingController(text: widget.current.avatarUrl);
    _twitterCtrl = TextEditingController(
        text: widget.current.socialLinks['twitter'] ?? '');
    _ghostXCtrl = TextEditingController(
        text: widget.current.socialLinks['ghostx'] ?? '');
  }

  @override
  void dispose() {
    _bioCtrl.dispose();
    _avatarCtrl.dispose();
    _twitterCtrl.dispose();
    _ghostXCtrl.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    setState(() { _saving = true; _errorMsg = null; });

    try {
      final links = <String, String>{};
      if (_twitterCtrl.text.trim().isNotEmpty) {
        links['twitter'] = _twitterCtrl.text.trim();
      }
      if (_ghostXCtrl.text.trim().isNotEmpty) {
        links['ghostx'] = _ghostXCtrl.text.trim();
      }

      await IdentityService.instance.updateProfile(
        avatarUrl:   _avatarCtrl.text.trim().isNotEmpty ? _avatarCtrl.text.trim() : null,
        bio:         _bioCtrl.text.trim(),
        socialLinks: links.isNotEmpty ? links : null,
      );

      if (mounted) Navigator.of(context).pop(true);
    } on Exception catch (e) {
      setState(() { _errorMsg = e.toString().replaceFirst('Exception: ', ''); });
    } finally {
      if (mounted) setState(() { _saving = false; });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0D0D1A),
      appBar: AppBar(
        backgroundColor: const Color(0xFF0D0D1A),
        title: const Text('Edit Profile',
            style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
        iconTheme: const IconThemeData(color: Colors.white),
        actions: [
          TextButton(
            onPressed: _saving ? null : _save,
            child: _saving
                ? const SizedBox(
                    width: 18, height: 18,
                    child: CircularProgressIndicator(strokeWidth: 2,
                        valueColor: AlwaysStoppedAnimation(Color(0xFF7B2FBE))))
                : const Text('Save',
                    style: TextStyle(color: Color(0xFF7B2FBE),
                        fontWeight: FontWeight.bold, fontSize: 16)),
          ),
        ],
      ),
      body: Form(
        key: _formKey,
        child: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            // ── Ghost handle (read-only) ────────────────────────────────
            Center(
              child: Column(
                children: [
                  CircleAvatar(
                    radius: 40,
                    backgroundColor: const Color(0xFF7B2FBE),
                    backgroundImage: _avatarCtrl.text.isNotEmpty
                        ? NetworkImage(_avatarCtrl.text)
                        : null,
                    child: _avatarCtrl.text.isEmpty
                        ? const Icon(Icons.person, size: 40, color: Colors.white)
                        : null,
                  ),
                  const SizedBox(height: 10),
                  Text(
                    widget.current.ghostHandle,
                    style: const TextStyle(
                        color: Color(0xFF00D4FF),
                        fontSize: 18,
                        fontWeight: FontWeight.bold),
                  ),
                  if (widget.current.isVerified)
                    const Padding(
                      padding: EdgeInsets.only(top: 4),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(Icons.verified, color: Color(0xFF7B2FBE), size: 16),
                          SizedBox(width: 4),
                          Text('Verified Creator',
                              style: TextStyle(color: Color(0xFF7B2FBE), fontSize: 12)),
                        ],
                      ),
                    ),
                ],
              ),
            ),
            const SizedBox(height: 28),

            // ── Avatar URL ────────────────────────────────────────────────
            _label('Avatar URL'),
            const SizedBox(height: 6),
            _textField(
              controller: _avatarCtrl,
              hint: 'https://…',
              validator: (v) {
                if (v != null && v.isNotEmpty) {
                  final uri = Uri.tryParse(v);
                  if (uri == null || !uri.hasScheme) return 'Must be a valid URL';
                }
                return null;
              },
            ),
            const SizedBox(height: 20),

            // ── Bio ───────────────────────────────────────────────────────
            _label('Bio'),
            const SizedBox(height: 6),
            _textField(
              controller: _bioCtrl,
              hint: 'Tell the GhostStack who you are…',
              maxLines: 4,
              maxLength: 500,
              validator: (v) {
                if (v != null && v.length > 500) return 'Max 500 characters';
                return null;
              },
            ),
            const SizedBox(height: 20),

            // ── Social links ──────────────────────────────────────────────
            _label('Social Links'),
            const SizedBox(height: 6),
            _textField(controller: _twitterCtrl, hint: 'Twitter / X handle or URL'),
            const SizedBox(height: 10),
            _textField(controller: _ghostXCtrl, hint: 'GhostXchange profile URL'),
            const SizedBox(height: 24),

            if (_errorMsg != null)
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.red.withOpacity(0.15),
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: Colors.red.shade800),
                ),
                child: Text(_errorMsg!,
                    style: const TextStyle(color: Colors.redAccent, fontSize: 13)),
              ),
          ],
        ),
      ),
    );
  }

  Widget _label(String text) => Text(text,
      style: const TextStyle(
          color: Colors.white70, fontSize: 12, fontWeight: FontWeight.w600,
          letterSpacing: 0.8));

  Widget _textField({
    required TextEditingController controller,
    required String hint,
    int maxLines  = 1,
    int? maxLength,
    String? Function(String?)? validator,
  }) =>
      TextFormField(
        controller:  controller,
        maxLines:    maxLines,
        maxLength:   maxLength,
        validator:   validator,
        style: const TextStyle(color: Colors.white),
        decoration: InputDecoration(
          hintText:        hint,
          hintStyle:       const TextStyle(color: Colors.white38),
          filled:          true,
          fillColor:       const Color(0xFF1A1A2E),
          counterStyle:    const TextStyle(color: Colors.white38),
          border:          OutlineInputBorder(
              borderRadius: BorderRadius.circular(10),
              borderSide: BorderSide.none),
          focusedBorder:   OutlineInputBorder(
              borderRadius: BorderRadius.circular(10),
              borderSide: const BorderSide(color: Color(0xFF7B2FBE))),
        ),
      );
}
